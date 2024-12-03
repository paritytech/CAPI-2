import {
  BlockInfo,
  ChainHead$,
  RuntimeContext,
} from "@polkadot-api/observable-client"
import { HexString } from "@polkadot-api/substrate-bindings"
import {
  concat,
  debounceTime,
  distinctUntilChanged,
  map,
  merge,
  mergeMap,
  Observable,
  scan,
  skip,
  startWith,
  take,
  takeLast,
  toArray,
} from "rxjs"
import { lossLessExhaustMap, compareMaps, selfDependent } from "@/utils"

export interface WatchedEntries {
  deltas: {
    upserted: Map<Array<any>, any>
    deleted: Map<Array<any>, any>
  }
  values: Map<HexString, { keyArgs: Array<any>; value: any }>
  hashes: Map<HexString, HexString>
  blockInfo: BlockInfo
  closestDescendantMerkleValue: string
}

export const watchFinalizedEntries = (
  palletName: string,
  queryName: string,
  args: Array<any>,
  { storage$, storageQueries$, finalized$, withRuntime }: ChainHead$,
): Observable<Pick<WatchedEntries, "deltas" | "blockInfo">> => {
  const getKey = (ctx: RuntimeContext) =>
    ctx.dynamicBuilder.buildStorage(palletName, queryName).enc(...args)

  const getDescendantHashes = (block: BlockInfo) =>
    storage$(block.hash, "descendantsHashes", getKey).pipe(
      map(
        (x) => new Map<string, string>(x.map(({ key, hash }) => [key, hash])),
      ),
    )

  const getValues$ = (hash: HexString, keys: Array<string>) => {
    return storageQueries$(
      hash,
      keys.map((key) => ({ key, type: "value" })),
    ).pipe(
      map(({ key, value }) => ({
        key,
        value: value!,
      })),
      toArray(),
    )
  }

  const getMerkeValueAt = (block: BlockInfo) =>
    storage$(block.hash, "closestDescendantMerkleValue", getKey).pipe(
      map((value) => ({ value: value!, block })),
    )

  const initial$ = finalized$.pipe(
    debounceTime(0),
    take(1),
    withRuntime((x) => x.hash),
    mergeMap(([blockInfo, ctx]) => {
      const { enc, dec, keyDecoder } = ctx.dynamicBuilder.buildStorage(
        palletName,
        queryName,
      )
      const key = enc(...args)
      // const keyLen = key.length
      return storageQueries$(blockInfo.hash, [
        { type: "descendantsValues", key },
        { type: "descendantsHashes", key },
        { type: "closestDescendantMerkleValue", key },
      ]).pipe(
        scan(
          (acc, item) => {
            const { key, value, hash, closestDescendantMerkleValue } = item //.key.slice(keyLen)
            if (closestDescendantMerkleValue) {
              acc["closestDescendantMerkleValue"] = {
                hash: closestDescendantMerkleValue,
              } as any
              return acc
            }

            const entry = acc[key] || (acc[key] = { keyArgs: keyDecoder(key) })
            entry.hash ||= hash // Blake2256(fromHex(value!))
            entry.value ||= value && dec(value)
            return acc
          },
          {} as Record<
            string,
            { keyArgs: Array<any>; value?: any; hash?: any }
          >,
        ),
        takeLast(1),
        map((x): WatchedEntries => {
          const closestDescendantMerkleValue =
            x["closestDescendantMerkleValue"].hash
          delete x["closestDescendantMerkleValue"]

          const hashes: WatchedEntries["hashes"] = new Map()
          const values: WatchedEntries["values"] = new Map()
          const upserted: WatchedEntries["deltas"]["upserted"] = new Map()
          Object.entries(x).forEach(([key, { keyArgs, hash, value }]) => {
            hashes.set(key, hash!)
            values.set(key, { keyArgs, value })
            upserted.set(keyArgs, value)
          })

          return {
            blockInfo,
            closestDescendantMerkleValue,
            hashes,
            values,
            deltas: {
              upserted,
              deleted: new Map(),
            },
          }
        }),
      )
    }),
  )

  const merkles$ = (initial: { block: BlockInfo; value: string }) =>
    concat(
      finalized$.pipe(
        debounceTime(0),
        lossLessExhaustMap(getMerkeValueAt),
        startWith(initial),
      ),
    ).pipe(
      distinctUntilChanged((a, b) => a.value === b.value),
      skip(1),
      take(1),
      withRuntime((x) => x.block.hash),
      map(
        ([x, ctx]) =>
          [
            x.block,
            x.value,
            ctx.dynamicBuilder.buildStorage(palletName, queryName),
          ] as const,
      ),
    )

  const getUpdate$ = (prev: WatchedEntries) =>
    merkles$({
      block: prev.blockInfo,
      value: prev.closestDescendantMerkleValue,
    }).pipe(
      mergeMap(
        ([blockInfo, closestDescendantMerkleValue, { keyDecoder, dec }]) =>
          getDescendantHashes(blockInfo).pipe(
            mergeMap((currentHashes) => {
              const prevHashes = prev.hashes
              const deltas = compareMaps(prevHashes, currentHashes)
              console.log({
                added: deltas.added.size,
                changed: deltas.changed.size,
                deleted: deltas.deleted.size,
                prevHashes: prevHashes.size,
                currentHashes: currentHashes.size,
              })

              return getValues$(blockInfo.hash, [
                ...deltas.added,
                ...deltas.changed,
              ]).pipe(
                map((values) => ({
                  values,
                  deltas,
                  currentHashes,
                  keyDecoder,
                  dec,
                  blockInfo,
                  closestDescendantMerkleValue,
                })),
              )
            }),
          ),
      ),
      map(
        ({
          values,
          deltas,
          currentHashes,
          keyDecoder,
          dec,
          blockInfo,
          closestDescendantMerkleValue,
        }): WatchedEntries => {
          const newValues = new Map(prev.values)
          const newHashes = new Map(prev.hashes)
          const deleted = new Map()
          const upserted = new Map<Array<any>, any>()
          deltas.deleted.forEach((key) => {
            const { keyArgs, value } = prev.values.get(key)!
            deleted.set(keyArgs, value)
            newValues.delete(key)
            newHashes.delete(key)
          })
          values.forEach(({ key, value: rawValue }) => {
            const keyArgs = keyDecoder(key)
            const value = dec(rawValue)
            upserted.set(keyArgs, value)
            newValues.set(key, { keyArgs, value })
            newHashes.set(key, currentHashes.get(key)!)
          })
          return {
            values: newValues,
            hashes: newHashes,
            deltas: { upserted, deleted },
            blockInfo,
            closestDescendantMerkleValue,
          }
        },
      ),
    )

  const [_result, connectResult] = selfDependent<WatchedEntries>()
  return merge(initial$, _result.pipe(mergeMap(getUpdate$))).pipe(
    connectResult(),
    map(({ deltas, blockInfo }) => ({ deltas, blockInfo })),
  )
}

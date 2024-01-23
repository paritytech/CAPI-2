import type { Codec, StringRecord, V14 } from "@polkadot-api/substrate-bindings"
import type { EnumVar, LookupEntry, TupleVar } from "./lookups"
import { getLookupFn } from "./lookups"
import * as scale from "@polkadot-api/substrate-bindings"
import { withCache } from "./with-cache"
import { mapObject } from "@polkadot-api/utils"

const _bytes = scale.Bin()

const isBytes = (input: LookupEntry) =>
  input.type === "primitive" && input.value === "u8"

const _buildCodec = (
  input: LookupEntry,
  cache: Map<number, Codec<any>>,
  stack: Set<number>,
  _accountId: Codec<scale.SS58String>,
): Codec<any> => {
  if (input.type === "primitive") return scale[input.value]
  if (input.type === "compact") return scale.compact
  if (input.type === "bitSequence") return scale.bitSequence

  if (
    input.type === "sequence" &&
    input.value.type === "primitive" &&
    input.value.value === "u8"
  ) {
    return _bytes
  }

  const buildNextCodec = (nextInput: LookupEntry): Codec<any> =>
    buildCodec(nextInput, cache, stack, _accountId)

  const buildVector = (inner: LookupEntry, len?: number) => {
    const innerCodec = buildNextCodec(inner)
    return len ? scale.Vector(innerCodec, len) : scale.Vector(innerCodec)
  }

  const buildTuple = (value: LookupEntry[]) =>
    scale.Tuple(...value.map(buildNextCodec))

  const buildStruct = (value: StringRecord<LookupEntry>) => {
    const inner = Object.fromEntries(
      Object.entries(value).map(([key, value]) => [key, buildNextCodec(value)]),
    ) as StringRecord<Codec<any>>
    return scale.Struct(inner)
  }

  if (input.type === "array") {
    // Bytes case
    if (isBytes(input.value)) {
      return input.len === 32 && (input.id === 0 || input.id === 1)
        ? _accountId
        : scale.Bin(input.len)
    }

    return buildVector(input.value, input.len)
  }

  if (input.type === "sequence") return buildVector(input.value)
  if (input.type === "tuple") return buildTuple(input.value)
  if (input.type === "struct") return buildStruct(input.value)

  // it has to be an enum by now
  const dependencies = Object.values(input.value).map((v) => {
    if (v.type === "primitive") return scale._void
    if (v.type === "tuple" && v.value.length === 1)
      return buildNextCodec(v.value[0])

    return v.type === "tuple" ? buildTuple(v.value) : buildStruct(v.value)
  })

  const inner = Object.fromEntries(
    Object.keys(input.value).map((key, idx) => {
      return [key, dependencies[idx]]
    }),
  ) as StringRecord<Codec<any>>

  const indexes = Object.values(input.value).map((x) => x.idx)
  const areIndexesSorted = indexes.every((idx, i) => idx === i)

  return areIndexesSorted
    ? scale.Enum(inner)
    : scale.Enum(inner, indexes as any)
}
const buildCodec = withCache(_buildCodec, scale.Self, (res) => res)

const emptyTuple = scale.Tuple()

export const getDynamicBuilder = (metadata: V14) => {
  const lookupData = metadata.lookup
  const getLookupEntryDef = getLookupFn(lookupData)
  let _accountId = scale.AccountId()

  const cache = new Map()
  const buildDefinition = (id: number): Codec<any> =>
    buildCodec(getLookupEntryDef(id), cache, new Set(), _accountId)

  const prefix = metadata.pallets
    .find((x) => x.name === "System")
    ?.constants.find((x) => x.name === "SS58Prefix")

  let ss58Prefix: number | undefined
  if (prefix) {
    try {
      const prefixVal = buildDefinition(prefix.type).dec(prefix.value)
      if (typeof prefixVal === "number") {
        ss58Prefix = prefixVal
        _accountId = scale.AccountId(prefixVal)
      }
    } catch (_) {}
  }

  const storagePallets = new Map<string, ReturnType<typeof scale.Storage>>()

  const buildStorage = (pallet: string, entry: string) => {
    let storagePallet = storagePallets.get(pallet)
    if (!storagePallet)
      storagePallets.set(pallet, (storagePallet = scale.Storage(pallet)))

    const storageEntry = metadata.pallets
      .find((x) => x.name === pallet)!
      .storage!.items.find((s) => s.name === entry)!

    const storageWithFallback = (
      len: number,
      ...args: Parameters<ReturnType<typeof scale.Storage>>
    ) => {
      const result = storagePallet!(...args)
      return {
        ...result,
        len,
        fallback:
          storageEntry.modifier === 1
            ? result.dec(storageEntry.fallback)
            : undefined,
      }
    }

    if (storageEntry.type.tag === "plain")
      return storageWithFallback(
        0,
        entry,
        buildDefinition(storageEntry.type.value).dec,
      )

    const { key, value, hashers } = storageEntry.type.value
    const val = buildDefinition(value)
    const hashes = hashers.map((x) => scale[x.tag])

    const hashArgs: Array<scale.EncoderWithHash<any>> =
      hashes.length === 1
        ? [[buildDefinition(key), hashes[0]]]
        : (getLookupEntryDef(key) as TupleVar).value.map(
            (x, idx): scale.EncoderWithHash<any> => [
              buildDefinition(x.id),
              hashes[idx],
            ],
          )
    return storageWithFallback(hashes.length, entry, val.dec, ...hashArgs)
  }

  const buildEnumEntry = (
    entry: EnumVar["value"][keyof EnumVar["value"]],
    forceTuple = false,
  ): Codec<any> => {
    if (entry.type === "primitive") return forceTuple ? emptyTuple : scale._void

    return entry.type === "tuple" || forceTuple
      ? scale.Tuple(
          ...Object.values(entry.value).map((l) => buildDefinition(l.id)),
        )
      : scale.Struct(
          mapObject(entry.value, (x) => buildDefinition(x.id)) as StringRecord<
            Codec<any>
          >,
        )
  }

  const buildConstant = (pallet: string, constantName: string) => {
    const storageEntry = metadata.pallets
      .find((x) => x.name === pallet)!
      .constants!.find((s) => s.name === constantName)!

    return buildDefinition(storageEntry.type as number)
  }

  const buildVariant =
    (type: "errors" | "events") =>
    (
      pallet: string,
      name: string,
    ): {
      codec: Codec<any>
      location: [number, number]
    } => {
      const palletEntry = metadata.pallets.find((x) => x.name === pallet)!
      const lookup = getLookupEntryDef(palletEntry[type]!)
      if (lookup.type !== "enum") throw null
      const entry = lookup.value[name]

      return {
        location: [palletEntry.index, entry.idx],
        codec: buildEnumEntry(lookup.value[name]),
      }
    }

  const buildCall = (
    pallet: string,
    name: string,
  ): {
    args: Codec<any>
    location: [number, number]
  } => {
    const palletEntry = metadata.pallets.find((x) => x.name === pallet)!
    const lookup = getLookupEntryDef(palletEntry.calls!)
    if (lookup.type !== "enum") throw null
    const entry = lookup.value[name]

    return {
      location: [palletEntry.index, entry.idx],
      args: buildEnumEntry(lookup.value[name], true),
    }
  }

  return {
    buildDefinition,
    buildStorage,
    buildEvent: buildVariant("events"),
    buildError: buildVariant("errors"),
    buildCall,
    buildConstant,
    ss58Prefix,
  }
}

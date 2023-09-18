import {
  ArgsWithPayloadCodec,
  DescriptorCommon,
  StorageDescriptor,
} from "@polkadot-api/substrate-bindings"
import {
  Observable,
  combineLatest,
  filter,
  firstValueFrom,
  mergeMap,
  take,
} from "rxjs"
import { FollowResponse, StorageResponse } from "@polkadot-api/substrate-client"
import { RuntimeDescriptors } from "./codecs"

type CallOptions = Partial<{
  at: string
  signal: AbortSignal
}>

type WithCallOptions<Args extends Array<any>> = [
  ...args: Args,
  options?: CallOptions,
]

type PossibleParents<A extends Array<any>> = A extends [...infer Left, any]
  ? Left | PossibleParents<Left>
  : []

type StorageEntryWithoutKeys<Payload> = {
  getValue: (options?: CallOptions) => Promise<Payload>
}

type StorageEntryWithKeys<Args extends Array<any>, Payload> = {
  getValue: (...args: WithCallOptions<Args>) => Promise<Payload | undefined>
  getValues: (
    keyArgs: Array<Args>,
    options?: CallOptions,
  ) => Promise<Array<Payload | undefined>>
  getEntries: (
    ...args: WithCallOptions<PossibleParents<Args>>
  ) => Promise<Array<{ keyArgs: Args; value: Payload }>>
}

export type StorageEntry<Args extends Array<any>, Payload> = Args extends []
  ? StorageEntryWithoutKeys<Payload>
  : StorageEntryWithKeys<Args, Payload>

export const createStorageEntry = <
  Descriptor extends StorageDescriptor<
    DescriptorCommon<string, string>,
    ArgsWithPayloadCodec<any, any>
  >,
>(
  descriptor: Descriptor,
  codecs$: Observable<RuntimeDescriptors | null>,
  finalized$: Observable<string>,
  getFollower: () => FollowResponse,
) => {
  const storageCall = <T>(
    block: string | null,
    mapper: (descriptors: RuntimeDescriptors) => [
      Partial<{
        value: Array<string>
        hash: Array<string>
        descendantsValues: Array<string>
        descendantsHashes: Array<string>
        closestDescendantMerkleValue: Array<string>
      }>,
      (response: StorageResponse) => T,
    ],
    signal?: AbortSignal,
  ): Promise<T> => {
    const descriptors$ = codecs$.pipe(filter(Boolean))
    const request$ = combineLatest([descriptors$, finalized$]).pipe(
      take(1),
      mergeMap(([descriptors, finalized]) => {
        const [query, mapperValue] = mapper(descriptors)

        return getFollower()
          .storage(block || finalized, query, null, signal)
          .then(mapperValue)
      }),
    )
    return firstValueFrom(request$)
  }

  const getValue = (...args: Array<any>) => {
    const { pallet, name } = descriptor.props
    const invalidArgs = () =>
      new Error(`Invalid Arguments calling ${pallet}.${name}(${args})`)
    if (
      args.length < descriptor.codecs.len ||
      args.length > descriptor.codecs.len + 1
    )
      throw invalidArgs()

    const [actualArgs, options] =
      args.length === descriptor.codecs.len
        ? [args, {} as CallOptions]
        : [args.slice(0, -1), args[args.length - 1] as CallOptions]

    if (typeof options !== "object") throw invalidArgs()
    const { signal, at } = options

    return storageCall(
      at ?? null,
      (descriptors) => {
        const codecs = descriptors.storage[pallet]?.[name]
        if (!codecs)
          throw new Error(`Incompatible runtime entry (${pallet}.${name})`)

        const key = codecs.enc(...actualArgs)
        return [
          { value: [key] },
          (x) => {
            const response = x.values[key]
            return response && codecs.dec(response)
          },
        ]
      },
      signal,
    )
  }

  if (descriptor.codecs.len === 0) return { getValue }

  const getEntries = (...args: Array<any>) => {
    const { pallet, name } = descriptor.props
    const invalidArgs = () =>
      new Error(`Invalid Arguments calling ${pallet}.${name}(${args})`)

    if (args.length > descriptor.codecs.len) throw invalidArgs()

    let options: CallOptions = {}
    let actualArgs = args

    if (args.length > 0) {
      const lastArg = args[args.length - 1]
      if (typeof lastArg === "object") {
        const keys = Object.keys(lastArg)
        if (
          keys.every(
            (k) =>
              (k === "at" && typeof lastArg.at === "string") ||
              (k === "signal" && lastArg.signal instanceof AbortSignal),
          )
        ) {
          options = lastArg
          actualArgs = args.slice(0, -1)
        }
      }
    }

    if (args.length === descriptor.codecs.len && actualArgs === args)
      throw invalidArgs()

    const { signal, at } = options

    return storageCall(
      at ?? null,
      (descriptors) => {
        const codecs = descriptors.storage[pallet]?.[name]
        if (!codecs)
          throw new Error(`Incompatible runtime entry (${pallet}.${name})`)

        const key = codecs.enc(...actualArgs)
        return [
          { descendantsValues: [key] },
          (x) => {
            return (x.descendantsValues[key] ?? []).map(({ key, value }) => ({
              keyArgs: codecs.keyDecoder(key),
              value: codecs.dec(value),
            }))
          },
        ]
      },
      signal,
    )
  }

  const getValues = (keyArgs: Array<Array<any>>, options?: CallOptions) =>
    Promise.all(
      keyArgs.map((args) => getValue(...(options ? [...args, options] : args))),
    )

  return { getValue, getValues, getEntries }
}

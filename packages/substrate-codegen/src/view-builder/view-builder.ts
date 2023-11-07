import { toHex as _toHex, mapStringRecord } from "@polkadot-api/utils"
import {
  Decoder,
  type StringRecord,
  type V14,
  createDecoder,
  u8,
  HexString,
  enhanceDecoder,
} from "@polkadot-api/substrate-bindings"
import type { LookupEntry } from "@/lookups"
import { getLookupFn } from "@/lookups"
import {
  primitives,
  complex,
  WithShapeWithoutMeta,
  ShapedDecoder,
  selfDecoder,
  AccountIdShaped,
  WithoutMeta,
} from "./shaped-decoders"
import {
  AccountIdDecoded,
  Decoded,
  DecodedCall,
  GetViewBuilder,
  PrimitiveDecoded,
  Shape,
} from "./types"

const toHex = _toHex as (input: Uint8Array) => HexString

type WithMeta<T extends Decoder<any> & { shape: any }> = T extends Decoder<
  infer D
> & { shape: infer S }
  ? Decoder<
      D extends WithoutMeta<PrimitiveDecoded>
        ? PrimitiveDecoded
        : D & { meta: { path: string[]; docs: string } }
    > & { shape: S }
  : T

const withMeta = (
  input: ShapedDecoder,
  path: string[],
  docs: string,
): WithMeta<ShapedDecoder> => {
  const decoder = enhanceDecoder(input as Decoder<{}>, (x) => ({
    ...x,
    meta: { path, docs },
  })) as WithMeta<ShapedDecoder>
  decoder.shape = input.shape
  return decoder
}

const addMeta =
  <Other extends Array<any>>(
    lookupData: V14["lookup"],
    fn: (input: LookupEntry, ...rest: Other) => ShapedDecoder,
  ): ((input: LookupEntry, ...rest: Other) => WithMeta<ShapedDecoder>) =>
  (input, ...rest) => {
    const { path, docs } = lookupData[input.id]
    return withMeta(fn(input, ...rest), path, docs.join("\n"))
  }

const _buildShapedDecoder = (
  input: LookupEntry,
  stack: Set<LookupEntry>,
  circularOnes: Map<LookupEntry, ShapedDecoder>,
  _accountId: WithShapeWithoutMeta<AccountIdDecoded>,
): ShapedDecoder => {
  if (input.type === "primitive") return primitives[input.value]
  if (input.type === "compact")
    return input.isBig ? primitives.compactBn : primitives.compactNumber
  if (input.type === "bitSequence") return primitives.bitSequence

  if (
    input.type === "sequence" &&
    input.value.type === "primitive" &&
    input.value.value === "u8"
  ) {
    return primitives.Bytes
  }

  const buildNext = (nextInput: LookupEntry): ShapedDecoder => {
    if (!stack.has(nextInput)) {
      const nextStack = new Set(stack)
      nextStack.add(input)
      const result = _buildShapedDecoder(
        nextInput,
        nextStack,
        circularOnes,
        _accountId,
      )
      if (circularOnes.has(input)) {
        circularOnes.get(input)!.shape = result.shape
        circularOnes.set(input, result)
      }
      return result
    }

    const result = selfDecoder(() => circularOnes.get(input)!)
    circularOnes.set(input, result)

    return result
  }

  const buildVector = (inner: LookupEntry, len?: number) => {
    const _inner = buildNext(inner)
    return len ? complex.Array(_inner, len) : complex.Sequence(_inner)
  }

  const buildTuple = (value: LookupEntry[]) =>
    complex.Tuple(...value.map(buildNext))

  const buildStruct = (value: StringRecord<LookupEntry>) =>
    complex.Struct(mapStringRecord(value, buildNext))

  if (input.type === "array") {
    // Bytes case
    if (input.value.type === "primitive" && input.value.value === "u8") {
      return input.len === 32 && (input.id === 0 || input.id === 1)
        ? _accountId
        : primitives.BytesArray(input.len)
    }

    return buildVector(input.value, input.len)
  }

  if (input.type === "sequence") return buildVector(input.value)
  if (input.type === "tuple") return buildTuple(input.value)
  if (input.type === "struct") return buildStruct(input.value)

  // it has to be an enum by now
  const dependencies = Object.values(input.value).map((v) => {
    if (v.type === "primitive") return primitives._void
    if (v.type === "tuple" && v.value.length === 1) {
      return buildNext(v.value[0])
    }
    return v.type === "tuple" ? buildTuple(v.value) : buildStruct(v.value)
  })

  const inner = Object.fromEntries(
    Object.keys(input.value).map((key, idx) => {
      return [key, dependencies[idx]]
    }),
  ) as StringRecord<ShapedDecoder>

  const indexes = Object.values(input.value).map((x) => x.idx)
  const areIndexesSorted = indexes.every((idx, i) => idx === i)

  return areIndexesSorted
    ? complex.Enum(inner)
    : complex.Enum(inner, indexes as any)
}

export const getViewBuilder: GetViewBuilder = (metadata: V14) => {
  const lookupData = metadata.lookup
  const buildShapedDecoder = addMeta(lookupData, _buildShapedDecoder)
  const getLookupEntryDef = getLookupFn(lookupData)

  let _accountId: WithShapeWithoutMeta<AccountIdDecoded> = primitives.AccountId

  const prefix = metadata.pallets
    .find((x) => x.name === "System")
    ?.constants.find((x) => x.name === "SS58Prefix")
  if (prefix) {
    try {
      const prefixVal = buildShapedDecoder(
        getLookupEntryDef(prefix.type),
        new Set(),
        new Map(),
        _accountId,
      )(prefix.value).value

      if (typeof prefixVal === "number") _accountId = AccountIdShaped(prefixVal)
    } catch (_) {}
  }

  const buildDefinition = (
    id: number,
  ): { shape: Shape; decoder: Decoder<Decoded> } => {
    const shapedDecoder = buildShapedDecoder(
      getLookupEntryDef(id),
      new Set(),
      new Map(),
      _accountId,
    )

    return {
      shape: shapedDecoder.shape,
      decoder: shapedDecoder,
    }
  }

  const callDecoder: Decoder<DecodedCall> = createDecoder((bytes) => {
    const palletIdx = u8.dec(bytes)
    const callIdx = u8.dec(bytes)

    const palletEntry = metadata.pallets.find((x) => x.index === palletIdx)
    if (!palletEntry) throw new Error("Invalid Pallet")

    const pallet = {
      value: {
        name: palletEntry.name,
        idx: palletIdx,
      },
      input: toHex(new Uint8Array([bytes[0]])),
    }

    const callsLookup = getLookupEntryDef(palletEntry.calls!)
    if (callsLookup.type !== "enum") throw null

    const callEntry = Object.entries(callsLookup.value).find(
      ([, val]) => val.idx === callIdx,
    )
    if (!callEntry) throw new Error("Invalid Call")

    const [callName, callLookup] = callEntry
    const call = {
      value: {
        name: callName,
        idx: callIdx,
      },
      input: toHex(new Uint8Array([bytes[1]])),
    }

    const argsDecoder = complex.Struct(
      callLookup.value === "_void"
        ? {}
        : mapStringRecord(
            callLookup.value as StringRecord<LookupEntry>,
            (val) => buildDefinition(val.id).decoder as WithMeta<ShapedDecoder>,
          ),
    )

    return {
      pallet,
      call,
      args: { value: argsDecoder(bytes), shape: argsDecoder.shape },
    }
  })

  return { buildDefinition, callDecoder }
}

import { fc, it } from "@fast-check/vitest"
import { expect, describe, vi } from "vitest"
import { mergeUint8, toHex } from "@polkadot-api/utils"
import { EncoderWithHash, _void, createCodec, str, u32 } from "@/."

describe("storage", () => {
  it.prop([fc.uint8Array(), fc.string(), fc.string()])(
    "should only encode the palette item when no custom encoders are specified",
    async (hash, pallet, name) => {
      vi.doMock("@/hashes", () => ({
        Twox128: (_: Uint8Array) => hash,
        Identity: (_: Uint8Array) => hash,
        Twox64Concat: (_: Uint8Array) => hash,
        Blake2128Concat: (_: Uint8Array) => hash,
        Blake2128: (_: Uint8Array) => hash,
        Blake2256: (_: Uint8Array) => hash,
        Twox256: (_: Uint8Array) => hash,
      }))

      const { Storage } = await import(`@/storage?${Date.now()}`)

      const FooStorage = Storage(pallet)
      const FooBarStorage = FooStorage(name, _void)

      const palletItemEncoded = toHex(mergeUint8(hash, hash))
      expect(FooBarStorage.keys.enc()).toStrictEqual(palletItemEncoded)
    },
  )

  it.prop([
    fc.uint8Array(),
    fc.stringMatching(/^[1-9A-HJ-NP-Za-km-z]{47}$/),
    fc.integer({ min: 0 }),
  ])("should encode with custom encoders", async (hash, validator, era) => {
    vi.doMock("@/hashes", () => ({
      Twox128: (_: Uint8Array) => hash,
      Identity: (_: Uint8Array) => hash,
      Twox64Concat: (_: Uint8Array) => hash,
      Blake2128Concat: (_: Uint8Array) => hash,
      Blake2128: (_: Uint8Array) => hash,
      Blake2256: (_: Uint8Array) => hash,
      Twox256: (_: Uint8Array) => hash,
    }))

    const { Storage } = await import(`@/storage?${Date.now()}`)

    const FooStorage = Storage("foo")
    const barArgs: [EncoderWithHash<string>, EncoderWithHash<number>] = [
      [str, (i) => i],
      [u32, (i) => i],
    ]

    const FooBarStorage = FooStorage("bar", _void, ...barArgs)
    const expected = toHex(
      mergeUint8(hash, hash, str.enc(validator), u32.enc(era)),
    )

    expect(FooBarStorage.keys.enc(validator, era)).toStrictEqual(expected)
  })

  it.prop([fc.uint8Array(), fc.anything(), fc.anything()])(
    "should use supplied encoder & decoder",
    async (input, encoded, decoded) => {
      const { Storage } = await import("@/storage")
      const FooStorage = Storage("foo")
      const FooBarStorage = FooStorage(
        "bar",
        createCodec(
          (_) => encoded as any,
          (_) => decoded as any,
        ),
      )

      expect(FooBarStorage.value.enc(input)).toStrictEqual(encoded)
      expect(FooBarStorage.value.dec(input)).toStrictEqual(decoded)
    },
  )
})

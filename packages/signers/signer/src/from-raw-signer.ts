import {
  Binary,
  Blake2256,
  type V14,
  type V15,
  compact,
  decAnyMetadata,
  extrinsicFormat,
} from "@polkadot-api/substrate-bindings"
import { mergeUint8 } from "@polkadot-api/utils"
import type { PolkadotSigner } from "@polkadot-api/polkadot-signer"

const signingTypeId: Record<"Ecdsa" | "Ed25519" | "Sr25519", number> = {
  Ed25519: 0,
  Sr25519: 1,
  Ecdsa: 2,
}

const [preBytes, postBytes] = ["<Bytes>", "</Bytes>"].map((str) =>
  Binary.fromText(str).asBytes(),
)

export function getPolkadotSigner(
  publicKey: Uint8Array,
  signingType: "Ecdsa" | "Ed25519" | "Sr25519",
  sign: (input: Uint8Array) => Promise<Uint8Array> | Uint8Array,
): PolkadotSigner {
  const signTx = async (
    callData: Uint8Array,
    signedExtensions: Record<
      string,
      {
        identifier: string
        value: Uint8Array
        additionalSigned: Uint8Array
      }
    >,
    metadata: Uint8Array,
    _: number,
    hasher = Blake2256,
  ) => {
    let decMeta: V14 | V15
    try {
      const tmpMeta = decAnyMetadata(metadata)
      if (tmpMeta.metadata.tag !== "v14" && tmpMeta.metadata.tag !== "v15")
        throw null
      decMeta = tmpMeta.metadata.value
    } catch (_) {
      throw new Error("Unsupported metadata version")
    }

    const { version } = decMeta.extrinsic
    if (version !== 4 && version !== 5)
      throw new Error(`Unsupported extrinsic version ${version}`)
    const extra: Array<Uint8Array> = []
    const additionalSigned: Array<Uint8Array> = []
    decMeta.extrinsic.signedExtensions.map(({ identifier }) => {
      const signedExtension = signedExtensions[identifier]
      if (!signedExtension)
        throw new Error(`Missing ${identifier} signed extension`)
      extra.push(signedExtension.value)
      additionalSigned.push(signedExtension.additionalSigned)
    })

    const toSign = mergeUint8(callData, ...extra, ...additionalSigned)

    const signed = await sign(toSign.length > 256 ? hasher(toSign) : toSign)

    const preResult = mergeUint8(
      extrinsicFormat[0]({ version, type: "signed" }),
      // converting it to a `MultiAddress` enum, where the index 0 is `Id(AccountId)`
      new Uint8Array([0, ...publicKey]),
      new Uint8Array([signingTypeId[signingType], ...signed]),
      // FIXME: extension version should come from metadata, already
      // follow https://github.com/paritytech/polkadot-sdk/pull/3685
      version === 5 ? new Uint8Array([0]) : new Uint8Array(),
      ...extra,
      callData,
    )

    return mergeUint8(compact.enc(preResult.length), preResult)
  }

  const signBytes = async (data: Uint8Array) => {
    let isPadded = true
    let i: number

    for (i = 0; isPadded && i < preBytes.length; i++)
      isPadded = preBytes[i] === data[i]
    isPadded = isPadded && i === preBytes.length

    const postDataStart = data.length - postBytes.length
    for (i = 0; isPadded && i < postBytes.length; i++)
      isPadded = postBytes[i] === data[postDataStart + i]
    isPadded = isPadded && i === postBytes.length

    return sign(isPadded ? data : mergeUint8(preBytes, data, postBytes))
  }

  return {
    publicKey,
    signTx,
    signBytes,
  }
}

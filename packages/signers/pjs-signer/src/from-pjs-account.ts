import {
  AccountId,
  Blake2256,
  V15,
  compact,
  enhanceEncoder,
  metadata as metadataCodec,
  u8,
} from "@polkadot-api/substrate-bindings"
import { fromHex, mergeUint8, toHex } from "@polkadot-api/utils"
import { getDynamicBuilder } from "@polkadot-api/metadata-builders"
import type { PolkadotSigner } from "@polkadot-api/polkadot-signer"
import * as signedExtensionMappers from "./pjs-signed-extensions-mappers"
import { SignerPayloadJSON } from "./types"

export const getAddressFormat = (metadata: V15): number => {
  const dynamicBuilder = getDynamicBuilder(metadata)

  const constant = metadata.pallets
    .find((x) => x.name === "System")!
    .constants!.find((s) => s.name === "SS58Prefix")!

  return dynamicBuilder.buildDefinition(constant.type).dec(constant.value)
}

const versionCodec = enhanceEncoder(
  u8.enc,
  (value: { signed: boolean; version: number }) =>
    (+!!value.signed << 7) | value.version,
)

export function getPolkadotSignerFromPjs(
  publicKey: Uint8Array,
  signPayload: (payload: SignerPayloadJSON) => Promise<{ signature: string }>,
): PolkadotSigner {
  const sign = async (
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
    atBlockNumber: number,
    _ = Blake2256,
  ) => {
    let decMeta: V15
    try {
      const tmpMeta = metadataCodec.dec(metadata)
      if (tmpMeta.metadata.tag !== "v15") throw null
      decMeta = tmpMeta.metadata.value
    } catch (_) {
      throw new Error("Unsupported metadata version")
    }

    const pjs: Partial<SignerPayloadJSON> = {}
    pjs.signedExtensions = []

    const { version } = decMeta.extrinsic
    const extra: Array<Uint8Array> = []

    decMeta.extrinsic.signedExtensions.map(({ identifier }) => {
      const signedExtension = signedExtensions[identifier]
      if (!signedExtension)
        throw new Error(`Missing ${identifier} signed-extension`)
      extra.push(signedExtension.value)

      pjs.signedExtensions!.push(identifier)

      if (!signedExtensionMappers[identifier as "CheckMortality"]) {
        if (
          signedExtension.value.length === 0 &&
          signedExtension.additionalSigned.length === 0
        )
          return
        throw new Error(
          `PJS does not support this signed-extension: ${identifier}`,
        )
      }

      Object.assign(
        pjs,
        signedExtensionMappers[identifier as "CheckMortality"](
          signedExtension,
          atBlockNumber,
        ),
      )
    })

    pjs.address = AccountId(getAddressFormat(decMeta)).dec(publicKey)
    pjs.method = toHex(callData)
    pjs.version = version

    console.log({ pjs })
    const result = await signPayload(pjs as SignerPayloadJSON)

    const preResult = mergeUint8(
      versionCodec({ signed: true, version }),
      // converting it to a `MultiAddress` enum, where the index 0 is `Id(AccountId)`
      new Uint8Array([0, ...publicKey]),
      fromHex(result.signature),
      ...extra,
      callData,
    )

    return mergeUint8(compact.enc(preResult.length), preResult)
  }

  return { publicKey, sign }
}

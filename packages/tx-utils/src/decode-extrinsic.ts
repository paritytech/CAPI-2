import {
  Bin,
  compactNumber,
  createDecoder,
  Decoder,
  extrinsicFormat,
  StringRecord,
  Struct,
  u8,
} from "@polkadot-api/substrate-bindings"
import { getMetadata } from "./get-metadata"
import { getDynamicBuilder, getLookupFn } from "@polkadot-api/metadata-builders"

const allBytesDec = Bin(Infinity).dec

export const getExtrinsicDecoder = (metadataRaw: Uint8Array) => {
  const metadata = getMetadata(metadataRaw)
  const lookup = getLookupFn(metadata)
  const dynamicBuilder = getDynamicBuilder(lookup)

  const extra: Decoder<Record<string, any>> = Struct.dec(
    Object.fromEntries(
      metadata.extrinsic.signedExtensions.map(
        (x) =>
          [x.identifier, dynamicBuilder.buildDefinition(x.type)[1]] as [
            string,
            Decoder<any>,
          ],
      ),
    ) as StringRecord<Decoder<any>>,
  )

  let address: Decoder<any>
  let signature: Decoder<any>
  const { extrinsic } = metadata
  if ("address" in extrinsic) {
    // v15
    address = dynamicBuilder.buildDefinition(extrinsic.address)[1]
    signature = dynamicBuilder.buildDefinition(extrinsic.signature)[1]
  } else {
    // v14
    const params = metadata.lookup[extrinsic.type]?.params
    const addr = params?.find((v) => v.name === "Address")?.type
    const sig = params?.find((v) => v.name === "Signature")?.type
    if (addr == null || sig == null)
      throw new Error("Address and/or signature not found")
    address = dynamicBuilder.buildDefinition(addr)[1]
    signature = dynamicBuilder.buildDefinition(sig)[1]
  }

  const v4Body = Struct.dec({
    address,
    signature,
    extra,
    callData: allBytesDec,
  })
  const v5Body = Struct.dec({
    address,
    signature,
    extensionVersion: u8.dec,
    extra,
    callData: allBytesDec,
  })
  const generalBody = Struct.dec({
    extensionVersion: u8.dec,
    extra,
    callData: allBytesDec,
  })

  return createDecoder((data) => {
    const len = compactNumber.dec(data)
    const { type, version } = extrinsicFormat[1](data)
    if (version === 4) {
      if (type === "bare")
        return { len, signed: false, version, callData: allBytesDec(data) }
      return { len, signed: true, version, ...v4Body(data) }
    }
    if (type === "bare")
      return { len, type, version, callData: allBytesDec(data) }
    if (type === "signed") return { len, type, version, ...v5Body(data) }
    return { len, type, version, ...generalBody(data) }
  })
}

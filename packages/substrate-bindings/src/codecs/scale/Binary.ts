import { Bytes, Codec, Decoder, Encoder, createCodec } from "scale-ts"
import { fromHex, toHex } from "@polkadot-api/utils"
import { HexString } from "./Hex"

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export class Binary {
  #bytes: Uint8Array
  #hex: HexString | null = null
  #str: string | null = null

  constructor(data: Uint8Array) {
    this.#bytes = data
  }

  asText = () =>
    this.#str === null
      ? (this.#str = textDecoder.decode(this.#bytes))
      : this.#str

  asHex = () =>
    this.#hex === null ? (this.#hex = toHex(this.#bytes)) : this.#hex

  asBytes = () => this.#bytes

  static fromText(input: string): Binary {
    return new Binary(textEncoder.encode(input))
  }
  static fromHex(input: HexString): Binary {
    return new Binary(fromHex(input))
  }
  static fromBytes(input: Uint8Array): Binary {
    return new Binary(input)
  }
}

const enc = (nBytes?: number): Encoder<Binary> => {
  const _enc = Bytes.enc(nBytes)
  return (value) => _enc(value.asBytes())
}

const dec = (nBytes?: number): Decoder<Binary> => {
  const _dec = Bytes.dec(nBytes)
  return (value) => Binary.fromBytes(_dec(value))
}

export const Bin = (nBytes?: number): Codec<Binary> =>
  createCodec(enc(nBytes), dec(nBytes))

Bin.enc = enc
Bin.dec = dec

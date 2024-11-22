import { getDynamicBuilder, getLookupFn } from "@polkadot-api/metadata-builders"
import type { PolkadotSigner } from "@polkadot-api/polkadot-signer"
import {
  decAnyMetadata,
  getSs58AddressInfo,
  SS58String,
} from "@polkadot-api/substrate-bindings"
import { toHex } from "@polkadot-api/utils"

export function multixSigner(
  address: SS58String,
  signer: PolkadotSigner,
): PolkadotSigner {
  let multisig: Awaited<ReturnType<typeof getMultisig>> = null

  return {
    publicKey: signer.publicKey,
    signBytes() {
      throw new Error("Raw bytes can't be signed with a multisig")
    },
    async signTx(callData, signedExtensions, metadata, atBlockNumber, hasher) {
      if (!multisig) {
        try {
          multisig = await getMultisig(address, signer)
        } catch (ex) {
          console.error(ex)
          throw new Error("Error while loading multisig info from Multix")
        }
      }
      if (!multisig) {
        throw new Error(`Couldn't find multisig ${address} in Multix`)
      }

      let lookup
      let dynamicBuilder
      try {
        const tmpMeta = decAnyMetadata(metadata).metadata
        if (tmpMeta.tag !== "v14" && tmpMeta.tag !== "v15") throw null
        lookup = getLookupFn(tmpMeta.value)
        if (lookup.call === null) throw null
        dynamicBuilder = getDynamicBuilder(lookup)
      } catch (_) {
        throw new Error("Unsupported metadata version")
      }

      let wrappedCallData
      try {
        wrappedCallData = dynamicBuilder
          .buildCall("Multisig", "as_multi")
          .codec.enc({
            threshold: multisig.threshold,
            other_signatories: multisig.otherSignatories,
            call: dynamicBuilder.buildDefinition(lookup.call).dec(callData),
            max_weight: {
              ref_time: 0,
              proof_size: 0,
            },
          })
      } catch (_) {
        throw new Error(
          "Unsupported runtime version: Multisig.as_multi not present or changed substantially",
        )
      }

      return signer.signTx(
        wrappedCallData,
        signedExtensions,
        metadata,
        atBlockNumber,
        hasher,
      )
    },
  }
}

async function getMultisig(address: string, signer: PolkadotSigner) {
  const res = await fetch(
    "https://chainsafe.squids.live/multix-arrow/v/v4/graphql",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query: `query Multisig($address: String) {
          accountMultisigs(where: {multisig: {address_eq: $address}}, limit: 1) {
            multisig {
              signatories {
                signatory {
                  address
                }
              }
              address
              threshold
            }
          }
        }`,
        variables: {
          address,
        },
        operationName: "Multisig",
      }),
    },
  )
  const response = (await res.json()) as {
    data: {
      accountMultisigs: Array<{
        multisig: {
          signatories: Array<{ signatory: { address: SS58String } }>
          address: SS58String
          threshold: number
        }
      }>
    }
  }

  const multisig = response.data.accountMultisigs[0]
  if (!multisig) return null

  const signerPublicKey = toHex(signer.publicKey)
  return {
    otherSignatories: multisig.multisig.signatories
      .map((v) => v.signatory.address)
      .filter((address) => {
        // TODO support non-ss58 addresses
        const info = getSs58AddressInfo(address)
        if (!info.isValid)
          throw new Error(
            "One of the signatories doesn't have a valid SS58 address",
          )
        return toHex(info.publicKey) !== signerPublicKey
      }),
    threshold: multisig.multisig.threshold,
  }
}

import { Chain, JsonRpcProvider } from "./types/polkadot-provider"
import {
  CreateTxContext,
  CustomizeTxResult,
  GetChainArgs,
} from "./types/public-types"
import {
  UserSignedExtensionName,
  UserSignedExtensions,
  getTxCreator,
} from "@polkadot-api/tx-helper"
import { equals } from "./bytes"
import { toHex } from "@polkadot-api/utils"
import { getChainProps } from "./get-chain-props"

const defaultUserSignedExtensions: UserSignedExtensions = {
  CheckMortality: {
    mortal: false,
  },
  ChargeTransactionPayment: 0n,
  ChargeAssetTxPayment: {
    tip: 0n,
  },
}

export const getChain = async ({
  provider: getProvider,
  keyring,
  txCustomizations = defaultUserSignedExtensions,
}: GetChainArgs): Promise<Chain> => {
  const getAccounts: Chain["getAccounts"] = async () =>
    keyring.getPairs().map((kp) => ({
      address: kp.address,
      publicKey: kp.publicKey,
      displayName: kp.name,
    }))

  const onAccountsChange: Chain["onAccountsChange"] = (accounts) => {
    const unsub = keyring.onKeyPairsChanged(() => getAccounts().then(accounts))

    return () => {
      unsub()
    }
  }

  const getUserSignedExtensionDefaults = () => {
    if (typeof txCustomizations === "object") {
      return txCustomizations
    }

    return {}
  }

  const getCustomizeTx = (): (<T extends Array<UserSignedExtensionName>>(
    ctx: CreateTxContext,
  ) => Promise<Partial<CustomizeTxResult<T>> | null>) => {
    if (typeof txCustomizations === "function") {
      return txCustomizations
    }

    return async () => ({})
  }

  const connect: Chain["connect"] = (onMessage) => {
    const provider = getProvider(onMessage)
    const txCreator = getTxCreator(getProvider, async (ctx, cb) => {
      const customizeTx = await getCustomizeTx()(ctx)
      if (!customizeTx) {
        cb(null)
        return
      }

      const userSignedExtensionDefaults = getUserSignedExtensionDefaults()
      const userSignedExtensionsData = Object.fromEntries(
        ctx.userSingedExtensionsName.map((x) => [
          x,
          userSignedExtensionDefaults[x] ?? defaultUserSignedExtensions[x],
        ]),
      ) as any

      const keypair = keyring
        .getPairs()
        .find((kp) => equals(kp.publicKey, ctx.from))

      if (!keypair) {
        throw new Error(`${toHex(ctx.from)} doesn't exist in keyring`)
      }

      cb({
        overrides: {
          ...(customizeTx.overrides ?? {}),
        },
        userSignedExtensionsData: {
          ...userSignedExtensionsData,
          ...((customizeTx.userSignedExtensionsData as any) ?? {}),
        },
        signingType: keypair.signingType,
        signer: keypair.sign,
      })
    })

    const createTx: JsonRpcProvider["createTx"] = async (from, callData) =>
      txCreator.createTx(from, callData)

    return {
      createTx,
      send: provider.send,
      disconnect() {
        txCreator.destroy()
      },
    }
  }

  return {
    ...(await getChainProps(getProvider)),
    getAccounts,
    onAccountsChange,
    connect,
  }
}

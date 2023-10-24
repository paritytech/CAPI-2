import { ConnectProvider } from "@polkadot-api/json-rpc-provider"
import { getSyncProvider } from "@polkadot-api/json-rpc-provider-proxy"
import { ToPage, ToExtension } from "@/protocol"
import {
  storage,
  sendBackgroundRequest,
  PORT,
  getRandomChainId,
} from "@/shared"
import type { LightClientPageHelper } from "./types"

export const helper: LightClientPageHelper = {
  async deleteChain(genesisHash) {
    // TODO: check, Should it disconnect any activeChain?
    // TODO: batch storage.remove
    await Promise.all([
      storage.remove({ type: "chain", genesisHash }),
      storage.remove({ type: "bootNodes", genesisHash }),
      storage.remove({ type: "databaseContent", genesisHash }),
    ])
    for (const {
      genesisHash: parachainGenesisHash,
      relayChainGenesisHash,
    } of Object.values(await storage.getChains())) {
      if (relayChainGenesisHash !== genesisHash) continue
      await Promise.all([
        storage.remove({ type: "chain", genesisHash: parachainGenesisHash }),
        storage.remove({
          type: "bootNodes",
          genesisHash: parachainGenesisHash,
        }),
        storage.remove({
          type: "databaseContent",
          genesisHash: parachainGenesisHash,
        }),
      ])
    }
  },
  async persistChain(chainSpec, relayChainGenesisHash) {
    // TODO: What if the chain already exists? Throw?
    const { type, ...chainData } = await sendBackgroundRequest({
      type: "getChainData",
      chainSpec,
      relayChainGenesisHash,
    })
    await storage.set(
      { type: "chain", genesisHash: chainData?.genesisHash },
      { ...chainData, chainSpec, relayChainGenesisHash },
    )
  },
  async getChains() {
    return Promise.all(
      Object.entries(await storage.getChains()).map(
        async ([genesisHash, chain]) => ({
          ...chain,
          bootNodes:
            (await storage.get({ type: "bootNodes", genesisHash })) ??
            (JSON.parse(chain.chainSpec).bootNodes as string[]),
          provider: createBackgroundClientConnectProvider(genesisHash),
        }),
      ),
    )
  },
  async getActiveConnections() {
    const { connections } = await sendBackgroundRequest({
      type: "getActiveConnections",
    })
    return connections
  },
  async disconnect(tabId: number, genesisHash: string) {
    await sendBackgroundRequest({
      type: "disconnect",
      tabId,
      genesisHash,
    })
  },
  setBootNodes(genesisHash, bootNodes) {
    return storage.set({ type: "bootNodes", genesisHash }, bootNodes)
  },
}

// FIXME: re-connect?
const port = chrome.runtime.connect({ name: PORT.EXTENSION_PAGE })
// FIXME: refactor with createRawChain from web-page-helper
const createBackgroundClientConnectProvider = (
  genesisHash: string,
): ConnectProvider =>
  getSyncProvider(async () => {
    const chainId = getRandomChainId()
    const postMessage = (
      msg: ToExtension & { origin: "substrate-connect-client" },
    ) => port.postMessage(msg)
    await new Promise<void>((resolve, reject) => {
      const onMessageListener = (
        msg: ToPage & { origin: "substrate-connect-extension" },
      ) => {
        switch (msg.type) {
          case "chain-ready": {
            resolve()
            break
          }
          case "error": {
            reject(new Error(msg.errorMessage))
            break
          }
          default:
            reject(new Error(`Unrecognized message ${JSON.stringify(msg)}`))
            break
        }
        port.onMessage.removeListener(onMessageListener)
      }
      port.onMessage.addListener(onMessageListener)
      postMessage({
        origin: "substrate-connect-client",
        type: "add-well-known-chain",
        chainId,
        chainName: genesisHash,
      })
    })
    return (onMessage, onHalt) => {
      const onMessageListener = (
        msg: ToPage & { origin: "substrate-connect-extension" },
      ) => {
        switch (msg.type) {
          case "rpc": {
            onMessage(msg.jsonRpcMessage)
            break
          }
          case "error": {
            console.error(msg.errorMessage)
            removeListeners()
            onHalt()
            break
          }
          default:
            console.warn(`Unrecognized message ${JSON.stringify(msg)}`)
            break
        }
      }
      port.onMessage.addListener(onMessageListener)
      port.onDisconnect.addListener(onHalt)
      const removeListeners = () => {
        port.onMessage.removeListener(onMessageListener)
        port.onDisconnect.removeListener(onHalt)
      }
      return {
        send(jsonRpcMessage) {
          postMessage({
            origin: "substrate-connect-client",
            type: "rpc",
            chainId,
            jsonRpcMessage,
          })
        },
        disconnect() {
          removeListeners()
          postMessage({
            origin: "substrate-connect-client",
            type: "remove-chain",
            chainId,
          })
        },
      }
    }
  })

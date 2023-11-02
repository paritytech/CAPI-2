import {
  type SubstrateClient,
  createClient,
} from "@polkadot-api/substrate-client"
import type { AddChainOptions, Chain, Client } from "smoldot"
import type {
  AddOnAddChainByUserListener,
  LightClientPageHelper,
} from "./types"
import { smoldotProvider } from "./smoldot-provider"
import type {
  BackgroundRequest,
  BackgroundResponse,
  BackgroundResponseError,
  ToExtension,
  ToPage,
} from "@/protocol"
import { ALARM, CONTEXT, PORT, createIsHelperMessage, storage } from "@/shared"
import {
  type WellKnownChainGenesisHash,
  wellKnownChainSpecs,
} from "@/chain-specs"

export * from "./types"

let isRegistered = false

export const register = (smoldotClient: Client) => {
  if (isRegistered) throw new Error("helper already registered")
  isRegistered = true

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== ALARM.DATABASE_UPDATE) return
    const chains = await storage.getChains()
    Object.values(chains).forEach(
      async ({ genesisHash, chainSpec, relayChainGenesisHash }) => {
        const client = createClient(
          await smoldotProvider({
            smoldotClient,
            chainSpec,
            relayChainSpec: relayChainGenesisHash
              ? chains[relayChainGenesisHash].chainSpec
              : undefined,
            databaseContent: await storage.get({
              type: "databaseContent",
              genesisHash,
            }),
            relayChainDatabaseContent: relayChainGenesisHash
              ? await storage.get({
                  type: "databaseContent",
                  genesisHash: relayChainGenesisHash,
                })
              : undefined,
          }),
        )
        const chainHeadFollower = client.chainHead(
          true,
          async (event) => {
            if (event.type === "newBlock") {
              chainHeadFollower.unpin([event.blockHash])
              return
            } else if (event.type !== "initialized") return
            try {
              await storage.set(
                { type: "databaseContent", genesisHash },
                await substrateClientRequest(
                  client,
                  "chainHead_unstable_finalizedDatabase",
                  (await chrome.permissions.contains({
                    permissions: ["unlimitedStorage"],
                  }))
                    ? []
                    : // 1mb will strip the runtime code
                      // See https://github.com/smol-dot/smoldot/blob/0a9e9cd802169bc07dd681e55278fd67c6f8f9bc/light-base/src/database.rs#L134-L140
                      [1024 * 1024],
                ),
              )
            } catch (error) {
              console.error("Error updating DB", error)
            }
            chainHeadFollower.unfollow()
            client.destroy()
          },
          (error) => {
            console.error("Error updating DB", error)
            chainHeadFollower.unfollow()
            client.destroy()
          },
        )
      },
    )
  })

  chrome.runtime.onInstalled.addListener(({ reason }) => {
    if (
      reason !== chrome.runtime.OnInstalledReason.INSTALL &&
      reason !== chrome.runtime.OnInstalledReason.UPDATE
    )
      return

    chrome.alarms.create(ALARM.DATABASE_UPDATE, {
      periodInMinutes: 2,
    })

    Object.values(wellKnownChainSpecs).forEach((chainSpec) =>
      lightClientPageHelper.persistChain(chainSpec),
    )
  })

  const lightClientPageHelper: LightClientPageHelper = {
    async deleteChain(genesisHash) {
      if (wellKnownChainSpecs[genesisHash as WellKnownChainGenesisHash])
        throw new Error("Cannot delete well-known-chain")

      // TODO: batch storage.remove
      await Promise.all([
        storage.remove({ type: "chain", genesisHash }),
        storage.remove({ type: "bootNodes", genesisHash }),
        storage.remove({ type: "databaseContent", genesisHash }),
        Object.keys(activeChains).map((tabId) =>
          this.disconnect(+tabId, genesisHash),
        ),
      ])
      for (const {
        genesisHash: parachainGenesisHash,
        relayChainGenesisHash,
      } of Object.values(await storage.getChains())) {
        if (relayChainGenesisHash !== genesisHash) continue
        await this.deleteChain(parachainGenesisHash)
      }
    },
    async persistChain(chainSpec, relayChainGenesisHash) {
      const chainData = await getChainData(
        smoldotClient,
        chainSpec,
        relayChainGenesisHash,
      )
      if (
        await storage.get({ type: "chain", genesisHash: chainData.genesisHash })
      )
        return

      const chainSpecJson = JSON.parse(chainSpec)
      const bootNodes = chainSpecJson.bootNodes
      let minimalChainSpec: string = ""
      if (
        !wellKnownChainSpecs[chainData.genesisHash as WellKnownChainGenesisHash]
      ) {
        delete chainSpecJson.bootNodes
        delete chainSpecJson.protocolId
        delete chainSpecJson.telemetryEndpoints

        if (!chainSpecJson.genesis.stateRootHash) {
          chainSpecJson.genesis.stateRootHash = await getGenesisStateRoot(
            smoldotClient,
            chainSpec,
            relayChainGenesisHash,
          )
        }

        // TODO: check if .lightSyncState could be removed and use chainHead_unstable_finalizedDatabase

        minimalChainSpec = JSON.stringify(chainSpecJson)
      }
      await Promise.all([
        storage.set(
          { type: "chain", genesisHash: chainData.genesisHash },
          {
            ...chainData,
            chainSpec: minimalChainSpec,
            relayChainGenesisHash,
          },
        ),
        storage.set(
          { type: "bootNodes", genesisHash: chainData.genesisHash },
          bootNodes,
        ),
      ])
    },
    async getChains() {
      const chains = await storage.getChains()
      return Promise.all(
        Object.entries(chains).map(async ([genesisHash, chain]) => ({
          ...chain,
          bootNodes:
            (await storage.get({ type: "bootNodes", genesisHash })) ??
            (JSON.parse(chain.chainSpec).bootNodes as string[]),
          provider: await smoldotProvider({
            smoldotClient,
            chainSpec: chain.chainSpec,
            relayChainSpec: chain.relayChainGenesisHash
              ? chains[chain.relayChainGenesisHash].chainSpec
              : undefined,
          }),
        })),
      )
    },
    async getActiveConnections() {
      return Object.entries(activeChains).reduce(
        (acc, [tabIdStr, tabChains]) => {
          const tabId = parseInt(tabIdStr)
          Object.values(tabChains).forEach(({ genesisHash }) =>
            // TODO: Should options-tab/popup connections be filtered from activeConnectionså?
            acc.push({ tabId, genesisHash }),
          )
          return acc
        },
        [] as { tabId: number; genesisHash: string }[],
      )
    },
    async disconnect(tabId: number, genesisHash: string) {
      Object.entries(activeChains[tabId] ?? {})
        .filter(
          ([_, { genesisHash: activeGenesisHash }]) =>
            activeGenesisHash === genesisHash,
        )
        .forEach(([chainId]) => {
          removeChain(tabId, chainId)
          chrome.tabs.sendMessage(tabId, {
            origin: "substrate-connect-extension",
            type: "error",
            chainId,
            errorMessage: "Disconnected",
          } as ToPage)
        })
    },
    setBootNodes(genesisHash, bootNodes) {
      return storage.set({ type: "bootNodes", genesisHash }, bootNodes)
    },
  }

  // Chains by TabId
  const activeChains: Record<
    number,
    Record<string, { chain: Chain; genesisHash: string }>
  > = {}
  const isSubstrateConnectMessage = createIsHelperMessage<
    ToExtension & { origin: "substrate-connect-client" }
  >(["substrate-connect-client"])
  const helperPortNames: string[] = [PORT.CONTENT_SCRIPT, PORT.EXTENSION_PAGE]
  chrome.runtime.onConnect.addListener((port) => {
    if (!helperPortNames.includes(port.name)) return

    const postMessage = (
      message: ToPage & { origin: "substrate-connect-extension" },
    ) => port.postMessage(message)

    let isPortDisconnected = false
    port.onDisconnect.addListener((port) => {
      isPortDisconnected = true
      const tabId = port.sender?.tab?.id
      if (!tabId) return
      if (!activeChains[tabId]) return
      for (const [chainId, { chain }] of Object.entries(activeChains[tabId])) {
        try {
          chain.remove()
        } catch (error) {
          console.error("error removing chain", error)
        }
        delete activeChains[tabId][chainId]
      }
      delete activeChains[tabId]
    })

    const pendingAddChains: Record<string, boolean> = {}
    port.onMessage.addListener(async (msg, port) => {
      const tabId = port.sender?.tab?.id
      if (!tabId) return
      if (!isSubstrateConnectMessage(msg)) return
      switch (msg.type) {
        case "add-well-known-chain":
        case "add-chain": {
          const tabId = port.sender?.tab?.id!
          if (!tabId) return
          activeChains[tabId] ??= {}
          try {
            if (
              activeChains[tabId][msg.chainId] ||
              pendingAddChains[msg.chainId]
            )
              throw new Error("Requested chainId already in use")

            pendingAddChains[msg.chainId] = true
            const chains = await storage.getChains()

            let addChainOptions: AddChainOptions
            if (msg.type === "add-well-known-chain") {
              const chain =
                Object.values(chains).find(
                  (chain) => chain.genesisHash === msg.chainName,
                ) ??
                Object.values(chains).find(
                  (chain) => chain.name === msg.chainName,
                )
              if (!chain) throw new Error("Unknown well-known chain")
              addChainOptions = {
                chainSpec: chain.chainSpec,
                disableJsonRpc: false,
                potentialRelayChains: chain.relayChainGenesisHash
                  ? [
                      await smoldotClient.addChain({
                        chainSpec:
                          chains[chain.relayChainGenesisHash].chainSpec,
                        disableJsonRpc: true,
                        databaseContent: await storage.get({
                          type: "databaseContent",
                          genesisHash: chain.relayChainGenesisHash,
                        }),
                      }),
                    ]
                  : [],
                databaseContent: await storage.get({
                  type: "databaseContent",
                  genesisHash: chain.genesisHash,
                }),
              }
            } else {
              const relayChainGenesisHashOrChainId =
                msg.potentialRelayChainIds[0]
              addChainOptions = {
                chainSpec: msg.chainSpec,
                disableJsonRpc: false,
                potentialRelayChains: chains[relayChainGenesisHashOrChainId]
                  ? [
                      await smoldotClient.addChain({
                        chainSpec:
                          chains[relayChainGenesisHashOrChainId].chainSpec,
                        disableJsonRpc: true,
                        databaseContent: await storage.get({
                          type: "databaseContent",
                          genesisHash: relayChainGenesisHashOrChainId,
                        }),
                      }),
                    ]
                  : msg.potentialRelayChainIds
                      .filter((chainId) => activeChains[tabId][chainId])
                      .map((chainId) => activeChains[tabId][chainId].chain),
              }
            }

            const [smoldotChain] = await Promise.all([
              smoldotClient.addChain(addChainOptions),
              Promise.resolve(), // resolves on 1st finalized
            ])
            const genesisHash = await getGenesisHash(smoldotChain)

            ;(async () => {
              while (true) {
                let jsonRpcMessage: string | undefined
                try {
                  jsonRpcMessage = await smoldotChain.nextJsonRpcResponse()
                } catch (_) {
                  break
                }

                if (isPortDisconnected) break

                // `nextJsonRpcResponse` throws an exception if we pass `disableJsonRpc: true` in the
                // config. We pass `disableJsonRpc: true` if `jsonRpcCallback` is undefined. Therefore,
                // this code is never reachable if `jsonRpcCallback` is undefined.
                try {
                  postMessage({
                    origin: "substrate-connect-extension",
                    type: "rpc",
                    chainId: msg.chainId,
                    jsonRpcMessage,
                  })
                } catch (error) {
                  console.error(
                    "JSON-RPC callback has thrown an exception:",
                    error,
                  )
                }
              }
            })()

            if (!pendingAddChains[msg.chainId]) {
              smoldotChain.remove()
              return
            }
            delete pendingAddChains[msg.chainId]

            activeChains[tabId][msg.chainId] = {
              chain: smoldotChain,
              genesisHash,
            }

            postMessage({
              origin: "substrate-connect-extension",
              type: "chain-ready",
              chainId: msg.chainId,
            })
          } catch (error) {
            delete pendingAddChains[msg.chainId]
            postMessage({
              origin: "substrate-connect-extension",
              type: "error",
              chainId: msg.chainId,
              errorMessage:
                error instanceof Error
                  ? error.toString()
                  : "Unknown error when adding chain",
            })
          }

          break
        }
        case "remove-chain": {
          const tabId = port.sender?.tab?.id!
          if (!tabId) return

          delete pendingAddChains[msg.chainId]

          removeChain(tabId, msg.chainId)

          break
        }
        case "rpc": {
          const tabId = port.sender?.tab?.id
          if (!tabId) return

          const chain = activeChains?.[tabId]?.[msg.chainId]?.chain
          if (!chain) return

          try {
            chain.sendJsonRpc(msg.jsonRpcMessage)
          } catch (error) {
            removeChain(tabId, msg.chainId)
            postMessage({
              origin: "substrate-connect-extension",
              type: "error",
              chainId: msg.chainId,
              errorMessage:
                error instanceof Error
                  ? error.toString()
                  : "Unknown error when sending RPC message",
            })
          }

          break
        }
        default: {
          const unrecognizedMsg: never = msg
          console.warn("Unrecognized message", unrecognizedMsg)
          break
        }
      }
    })
  })

  let addChainByUserListener:
    | Parameters<AddOnAddChainByUserListener>[0]
    | undefined = undefined

  const addOnAddChainByUserListener: AddOnAddChainByUserListener = async (
    onAddChainByUser,
  ) => {
    if (addChainByUserListener)
      throw new Error("addChainByUserCallback is already set")
    addChainByUserListener = onAddChainByUser
  }

  const isHelperMessage = createIsHelperMessage<BackgroundRequest>([
    CONTEXT.CONTENT_SCRIPT,
    CONTEXT.EXTENSION_PAGE,
  ])
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!isHelperMessage(msg)) return
    switch (msg.type) {
      case "getChain": {
        ;(async () => {
          const tabId = sender?.tab?.id
          if (!tabId) return
          try {
            const chains = await storage.getChains()
            const { chainSpec, relayChainGenesisHash } = msg
            if (relayChainGenesisHash && !chains[relayChainGenesisHash])
              throw new Error(
                `Unknown relayChainGenesisHash ${relayChainGenesisHash}`,
              )
            const { genesisHash, name } = await getChainData(
              smoldotClient,
              chainSpec,
              relayChainGenesisHash,
            )

            if (chains[genesisHash]) {
              return sendBackgroundResponse(sendResponse, {
                origin: CONTEXT.BACKGROUND,
                type: "getChainResponse",
                chain: chains[genesisHash],
              })
            }

            const chain = {
              genesisHash,
              name,
              chainSpec,
              relayChainGenesisHash,
            }

            await addChainByUserListener?.(chain, tabId)

            sendBackgroundResponse(sendResponse, {
              origin: CONTEXT.BACKGROUND,
              type: "getChainResponse",
              chain,
            })
          } catch (error) {
            console.error("background addChain error", error)
            sendBackgroundErrorResponse(sendResponse, error)
          }
        })()
        return true
      }
      case "deleteChain": {
        lightClientPageHelper
          .deleteChain(msg.genesisHash)
          .then(() =>
            sendBackgroundResponse(sendResponse, {
              origin: CONTEXT.BACKGROUND,
              type: "deleteChainResponse",
            }),
          )
          .catch(handleBackgroundErrorResponse(sendResponse))
        return true
      }
      case "persistChain": {
        lightClientPageHelper
          .persistChain(msg.chainSpec, msg.relayChainGenesisHash)
          .then(() =>
            sendBackgroundResponse(sendResponse, {
              origin: CONTEXT.BACKGROUND,
              type: "persistChainResponse",
            }),
          )
          .catch(handleBackgroundErrorResponse(sendResponse))
        return true
      }
      case "getChains": {
        storage
          .getChains()
          .then((chains) => {
            sendBackgroundResponse(sendResponse, {
              origin: CONTEXT.BACKGROUND,
              type: "getChainsResponse",
              chains,
            })
          })
          .catch(handleBackgroundErrorResponse(sendResponse))
        return true
      }
      case "getActiveConnections": {
        lightClientPageHelper
          .getActiveConnections()
          .then((connections) =>
            sendBackgroundResponse(sendResponse, {
              origin: CONTEXT.BACKGROUND,
              type: "getActiveConnectionsResponse",
              connections,
            }),
          )
          .catch(handleBackgroundErrorResponse(sendResponse))
        return true
      }
      case "disconnect": {
        lightClientPageHelper
          .disconnect(msg.tabId, msg.genesisHash)
          .then(() =>
            sendBackgroundResponse(sendResponse, {
              origin: CONTEXT.BACKGROUND,
              type: "disconnectResponse",
            }),
          )
          .catch(handleBackgroundErrorResponse(sendResponse))
        return true
      }
      case "setBootNodes": {
        lightClientPageHelper
          .setBootNodes(msg.genesisHash, msg.bootNodes)
          .then(() =>
            sendBackgroundResponse(sendResponse, {
              origin: CONTEXT.BACKGROUND,
              type: "setBootNodesResponse",
            }),
          )
          .catch(handleBackgroundErrorResponse(sendResponse))
        return true
      }
      default: {
        const unrecognizedMsg: never = msg
        console.warn("Unrecognized message", unrecognizedMsg)
        break
      }
    }
    return
  })

  const removeChain = (tabId: number, chainId: string) => {
    const chain = activeChains?.[tabId]?.[chainId]?.chain
    delete activeChains?.[tabId]?.[chainId]
    try {
      chain?.remove()
    } catch (error) {
      console.error("error removing chain", error)
    }
  }

  return { lightClientPageHelper, addOnAddChainByUserListener }
}

storage.onChainsChanged(async (chains) => {
  ;(await chrome.tabs.query({ url: ["https://*/*", "http://*/*"] })).forEach(
    ({ id }) =>
      chrome.tabs.sendMessage(id!, {
        origin: CONTEXT.BACKGROUND,
        type: "onAddChains",
        chains,
      } as ToPage),
  )
})

const withClient =
  <T>(fn: (client: SubstrateClient) => T | Promise<T>) =>
  async (
    smoldotClient: Client,
    chainSpec: string,
    relayChainGenesisHash?: string,
  ) => {
    const client = createClient(
      await smoldotProvider({
        smoldotClient,
        chainSpec,
        relayChainSpec: relayChainGenesisHash
          ? (await storage.getChains())[relayChainGenesisHash].chainSpec
          : undefined,
        relayChainDatabaseContent: relayChainGenesisHash
          ? await storage.get({
              type: "databaseContent",
              genesisHash: relayChainGenesisHash,
            })
          : undefined,
      }),
    )
    try {
      return await fn(client)
    } finally {
      client.destroy()
    }
  }

const getChainData = withClient(async (client) => {
  const [genesisHash, name, { ss58Format }] = (await Promise.all(
    [
      "chainSpec_v1_genesisHash",
      "chainSpec_v1_chainName",
      "chainSpec_v1_properties",
    ].map((method) => substrateClientRequest(client, method)),
  )) as [string, string, { ss58Format: number }]
  return {
    genesisHash,
    name,
    ss58Format,
  }
})

// TODO: update this implementation when these issues are implemented
// https://github.com/paritytech/json-rpc-interface-spec/issues/110
// https://github.com/smol-dot/smoldot/issues/1186
const getGenesisStateRoot = withClient(
  (client) =>
    new Promise<string>((resolve, reject) => {
      const chainHeadFollower = client.chainHead(
        true,
        async (event) => {
          if (event.type === "newBlock") {
            chainHeadFollower.unpin([event.blockHash])
            return
          } else if (event.type !== "initialized") return
          try {
            const { stateRoot } = await substrateClientRequest<{
              stateRoot: string
            }>(client, "chain_getHeader", [
              await substrateClientRequest<string>(
                client,
                "chainSpec_v1_genesisHash",
              ),
            ])
            resolve(stateRoot)
          } catch (error) {
            reject(error)
          } finally {
            chainHeadFollower.unfollow()
          }
        },
        reject,
      )
    }),
)

// FIXME: merge with getChainData
const getGenesisHash = async (smoldotChain: Chain): Promise<string> => {
  smoldotChain.sendJsonRpc(
    JSON.stringify({
      jsonrpc: "2.0",
      id: "chainSpec_v1_genesisHash",
      method: "chainSpec_v1_genesisHash",
      params: [],
    }),
  )
  return JSON.parse(await smoldotChain.nextJsonRpcResponse()).result
}

const sendBackgroundResponse = <
  T extends BackgroundResponse | BackgroundResponseError,
>(
  sendResponse: (msg: any) => void,
  msg: T,
) => sendResponse(msg)

const sendBackgroundErrorResponse = (
  sendResponse: (msg: any) => void,
  error: Error | string | unknown,
) =>
  sendBackgroundResponse(sendResponse, {
    origin: CONTEXT.BACKGROUND,
    type: "error",
    error:
      error instanceof Error
        ? error.toString()
        : typeof error === "string"
        ? error
        : "Unknown error getting chain data",
  })

const handleBackgroundErrorResponse =
  (sendResponse: (msg: any) => void) => (error: Error | string | unknown) =>
    sendBackgroundErrorResponse(sendResponse, error)

const substrateClientRequest = <T>(
  client: SubstrateClient,
  method: string,
  params: any[] = [],
) =>
  new Promise<T>((resolve, reject) => {
    try {
      client._request(method, params, {
        onSuccess: resolve,
        onError: reject,
      })
    } catch (error) {
      reject(error)
    }
  })

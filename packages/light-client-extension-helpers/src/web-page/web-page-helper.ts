import type {
  BackgroundResponse,
  PostMessage,
  ToExtension,
  ToExtensionRequest,
  ToPage,
} from "@/protocol"
import { CONTEXT, getRandomChainId } from "@/shared"
import type { LightClientProvider, RawChain } from "./types"
import { getSyncProvider } from "@polkadot-api/json-rpc-provider-proxy"

export * from "./types"

const postToExtension = (message: PostMessage<ToExtension>) =>
  window.postMessage(message, window.origin)

const validOrigins = [CONTEXT.CONTENT_SCRIPT, "substrate-connect-extension"]

const checkMessage = (msg: any): msg is ToPage => {
  if (!msg) return false
  if (!validOrigins.includes(msg?.origin)) return false
  if (!msg?.type && !msg?.id) return false
  return true
}

const channelIds = new Set<string>()

export const getLightClientProvider = async (
  channelId: string,
): Promise<LightClientProvider> => {
  const chainsChangeCallbacks: Parameters<
    LightClientProvider["addChainsChangeListener"]
  >[0][] = []
  if (channelIds.has(channelId))
    throw new Error(`channelId "${channelId}" already in use`)
  channelIds.add(channelId)

  const pendingRequests: Record<
    string,
    { resolve(result: any): void; reject(error: any): void }
  > = {}

  window.addEventListener("message", ({ data, source }) => {
    if (source !== window) return
    const { channelId: messageChannelId, msg } = data
    if (messageChannelId !== channelId) return
    if (!validOrigins.includes(msg?.origin)) return
    if (!checkMessage(msg)) return console.warn("Unrecognized message", msg)
    if (msg.origin === "substrate-connect-extension")
      return rawChainCallbacks[msg.chainId]?.(msg)
    if (msg.id !== undefined) {
      const pendingRequest = pendingRequests[msg.id]
      if (!pendingRequest) return console.warn("Unhandled response", msg)
      msg.error
        ? pendingRequest.reject(msg.error)
        : pendingRequest.resolve(msg.result)
      delete pendingRequests[msg.id]
      return
    }
    if (msg.type === "onAddChains")
      return chainsChangeCallbacks.forEach((cb) =>
        cb(
          Object.fromEntries(
            Object.entries(msg.chains).map(([key, { genesisHash, name }]) => [
              key,
              createRawChain(channelId, { genesisHash, name }),
            ]),
          ),
        ),
      )

    console.warn("Unhandled message", msg)
  })

  const requestReply = <
    TReq extends ToExtensionRequest,
    TRes extends BackgroundResponse & {
      type: `${TReq["request"]["type"]}Response`
    },
  >(
    channelId: string,
    msg: TReq,
  ): Promise<TRes> => {
    const promise = new Promise<TRes>((resolve, reject) => {
      pendingRequests[msg.id] = { resolve, reject }
    })
    postToExtension({ channelId, msg })
    return promise
  }

  // FIXME: improve id generation, random-id?
  const nextId = (
    (initialId) => () =>
      "" + initialId++
  )(0)

  let { chains } = await requestReply(channelId, {
    origin: CONTEXT.WEB_PAGE,
    id: nextId(),
    request: {
      type: "getChains",
    },
  })
  chainsChangeCallbacks.push((chains_) => (chains = chains_))
  return {
    async getChain(chainSpec, relayChainGenesisHash) {
      const { chain: chainInfo } = await requestReply(channelId, {
        origin: CONTEXT.WEB_PAGE,
        id: nextId(),
        request: {
          type: "getChain",
          chainSpec,
          relayChainGenesisHash,
        },
      })
      return createRawChain(
        channelId,
        chains[chainInfo.genesisHash]
          ? chainInfo
          : { ...chainInfo, chainSpec, relayChainGenesisHash },
      )
    },
    getChains() {
      return Object.entries(chains).reduce(
        (acc, [key, chain]) => {
          acc[key] = createRawChain(channelId, chain)
          return acc
        },
        {} as Record<string, RawChain>,
      )
    },
    addChainsChangeListener(callback) {
      chainsChangeCallbacks.push(callback)
      return () => removeArrayItem(chainsChangeCallbacks, callback)
    },
  }
}

const rawChainCallbacks: Record<
  string,
  (msg: ToPage & { origin: "substrate-connect-extension" }) => void
> = {}

const createRawChain = (
  channelId: string,
  {
    name,
    genesisHash,
    chainSpec,
    relayChainGenesisHash,
  }: {
    name: string
    genesisHash: string
    chainSpec?: string
    relayChainGenesisHash?: string
  },
): RawChain => {
  return {
    name,
    genesisHash,
    connect: getSyncProvider(async () => {
      const chainId = getRandomChainId()
      await new Promise<void>((resolve, reject) => {
        rawChainCallbacks[chainId] = (msg) => {
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
          delete rawChainCallbacks[chainId]
        }
        postToExtension({
          channelId,
          msg: chainSpec
            ? {
                origin: "substrate-connect-client",
                type: "add-chain",
                chainId,
                chainSpec,
                potentialRelayChainIds: relayChainGenesisHash
                  ? [relayChainGenesisHash]
                  : [],
              }
            : {
                origin: "substrate-connect-client",
                type: "add-well-known-chain",
                chainId,
                chainName: genesisHash,
              },
        })
      })
      return (onMessage, onHalt) => {
        rawChainCallbacks[chainId] = (msg) => {
          switch (msg.type) {
            case "rpc": {
              onMessage(msg.jsonRpcMessage)
              break
            }
            case "error": {
              console.error(msg.errorMessage)
              delete rawChainCallbacks[chainId]
              onHalt()
              break
            }
            default:
              console.warn(`Unrecognized message ${JSON.stringify(msg)}`)
              break
          }
        }
        return {
          send(jsonRpcMessage) {
            postToExtension({
              channelId,
              msg: {
                origin: "substrate-connect-client",
                type: "rpc",
                chainId,
                jsonRpcMessage,
              },
            })
          },
          disconnect() {
            delete rawChainCallbacks[chainId]
            postToExtension({
              channelId,
              msg: {
                origin: "substrate-connect-client",
                type: "remove-chain",
                chainId,
              },
            })
          },
        }
      }
    }),
  }
}

const removeArrayItem = <T>(array: T[], item: T) => {
  array.splice(array.indexOf(item), 1)
}

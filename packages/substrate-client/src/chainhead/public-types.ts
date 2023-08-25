import type { AbortablePromiseFn, UnsubscribeFn } from "@/common-types"

export interface Runtime {
  specName: string
  implName: string
  specVersion: number
  implVersion: number
  transactionVersion: number
  apis: Record<string, number>
}

export interface Initialized {
  event: "initialized"
  finalizedBlockHash: string
}

export type InitializedWithRuntime = Initialized & {
  finalizedBlockRuntime: Runtime
}

export interface NewBlock {
  event: "newBlock"
  blockHash: string
  parentBlockHash: string
}

export type NewBlockWithRuntime = NewBlock & {
  newRuntime: Runtime | null
}

export interface BestBlockChanged {
  event: "bestBlockChanged"
  bestBlockHash: string
}

export interface Finalized {
  event: "finalized"
  finalizedBlockHashes: Array<string>
  prunedBlockHashes: Array<string>
}

export interface Stop {
  event: "stop"
}

type CommonFollowEvents = BestBlockChanged | Finalized | Stop

export type FollowEventWithRuntime =
  | InitializedWithRuntime
  | NewBlockWithRuntime
  | CommonFollowEvents

export type FollowEventWithoutRuntime =
  | Initialized
  | NewBlock
  | CommonFollowEvents

export interface StorageResponse {
  values: Record<string, string>
  hashes: Record<string, string>
  closests: Record<string, string>
  descendantsValues: Record<string, Array<{ key: string; value: string }>>
  descendantsHashes: Record<string, Array<{ key: string; hash: string }>>
}

export interface FollowResponse {
  unfollow: UnsubscribeFn
  body: AbortablePromiseFn<[hash: string], Array<string>>
  call: AbortablePromiseFn<
    [hash: string, fnName: string, callParameters: string],
    string
  >
  storage: AbortablePromiseFn<
    [
      hash: string,
      query: Partial<{
        value: Array<string>
        hash: Array<string>
        descendantsValues: Array<string>
        descendantsHashes: Array<string>
        closestDescendantMerkleValue: Array<string>
      }>,
      childTrie: string | null,
    ],
    StorageResponse
  >
  header: (hash: string) => Promise<string>
  unpin: (...hashes: Array<string>) => Promise<void>
}

export interface ChainHead {
  (
    withRuntime: false,
    cb: (event: FollowEventWithoutRuntime) => void,
  ): FollowResponse
  (
    withRuntime: true,
    cb: (event: FollowEventWithRuntime) => void,
  ): FollowResponse
}

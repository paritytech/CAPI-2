import { noop } from "@/internal-utils"
import type { ClientRequest } from "../client"
import type {
  TxEvent,
  Transaction,
  TxFinalized,
  TxInvalid,
  TxDropped,
  TxError,
} from "./types"

type TerminalEvent = TxDropped | TxInvalid | TxFinalized | TxError
const terminalEvents: Set<string> = new Set<TerminalEvent["event"]>([
  "dropped",
  "invalid",
  "finalized",
  "error",
])

function isTerminalEvent(event: TxEvent): event is TerminalEvent {
  return terminalEvents.has(event.event)
}

type ErrorEvents = TxDropped | TxInvalid | TxError

export interface ITxError {
  type: ErrorEvents["event"]
  error: string
}

export class TransactionError extends Error implements ITxError {
  type
  error
  constructor(e: ErrorEvents) {
    super(`TxError: ${e.event} - ${e.error}`)
    this.type = e.event
    this.error = e.error
    this.name = "TransactionError"
  }
}

export const getTransaction =
  (request: ClientRequest<string, TxEvent>): Transaction =>
  (tx: string, next: (event: TxEvent) => void, error: (e: Error) => void) => {
    let cancel = request("transaction_unstable_submitAndWatch", [tx], {
      onSuccess: (subscriptionId, follow) => {
        const done = follow(subscriptionId, {
          next: (event) => {
            if (isTerminalEvent(event)) {
              done()
              cancel = noop
              if (event.event !== "finalized")
                return error(new TransactionError(event))
            }
            next(event)
          },
          error(e) {
            cancel()
            cancel = noop
            error(e)
          },
        })

        cancel = () => {
          done()
          request("transaction_unstable_unwatch", [subscriptionId])
        }
      },
      onError: error,
    })

    return () => {
      cancel()
    }
  }

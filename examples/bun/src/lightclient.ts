import { createClient } from "polkadot-api"
import { getSmProvider } from "polkadot-api/sm-provider"
import { start } from "polkadot-api/smoldot"
import { chainSpec } from "polkadot-api/chains/westend2"
import { wnd } from "@polkadot-api/descriptors"
import { appendFileSync, existsSync, rmSync } from "fs"
import { withLogsRecorder } from "polkadot-api/logs-provider"

const smoldot = start()

const WIRE_FILE = "wire-logs.txt"
if (existsSync(WIRE_FILE)) rmSync(WIRE_FILE)

const client = createClient(
  withLogsRecorder(
    (log) => {
      appendFileSync(WIRE_FILE, log + "\n")
    },
    getSmProvider(smoldot.addChain({ chainSpec })),
  ),
)
const testApi = client.getTypedApi(wnd)

testApi.query.Staking.Nominators.watchEntries().subscribe(
  console.log,
  console.error,
)

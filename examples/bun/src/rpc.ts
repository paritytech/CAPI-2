import { CompatibilityLevel, createClient } from "polkadot-api"
import { getWsProvider } from "polkadot-api/ws-provider/web"
import { MultiAddress, wnd } from "@polkadot-api/descriptors"
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat"
import { withLogsRecorder } from "polkadot-api/logs-provider"
import { appendFileSync, existsSync, rmSync } from "fs"

const WIRE_FILE = "wire-logs-rpc.txt"
if (existsSync(WIRE_FILE)) rmSync(WIRE_FILE)

const client = createClient(
  withPolkadotSdkCompat(
    withLogsRecorder((log) => {
      appendFileSync(WIRE_FILE, log + "\n")
    }, getWsProvider("wss://westend-rpc.polkadot.io")),
  ),
)
const testApi = client.getTypedApi(wnd)

testApi.query.Staking.Nominators.watchEntries().subscribe(
  console.log,
  console.error,
)

import { createClient } from "polkadot-api"
import { getSmProvider } from "polkadot-api/sm-provider"
import { start } from "polkadot-api/smoldot"
import { chainSpec } from "polkadot-api/chains/westend2"
import { wnd } from "@polkadot-api/descriptors"

const smoldot = start()

const client = createClient(getSmProvider(smoldot.addChain({ chainSpec })))
const testApi = client.getTypedApi(wnd)

async function run() {
  const nominationsQuotaIsCompatible =
    await testApi.apis.StakingApi.nominations_quota.isCompatible()
  console.log({ nominationsQuotaIsCompatible })

  const runtime = await testApi.runtime.latest()

  const auctionEndingIsCompatible =
    testApi.constants.Auctions.EndingPeriod.isCompatible(runtime)

  console.log({ auctionEndingIsCompatible })

  if (auctionEndingIsCompatible) {
    console.log(testApi.constants.Auctions.EndingPeriod(runtime))
  }

  client.destroy()
  smoldot.terminate()
}

await run()
process.exit(0)

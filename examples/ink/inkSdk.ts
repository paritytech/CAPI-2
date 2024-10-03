import { contracts, testAzero } from "@polkadot-api/descriptors"
import { Binary, createClient } from "polkadot-api"
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat"
import { getWsProvider } from "polkadot-api/ws-provider/web"
import { ADDRESS, aliceSigner } from "./address"
import { createInkSdk } from "./sdk/ink-sdk"

const client = createClient(
  withPolkadotSdkCompat(
    getWsProvider("wss://aleph-zero-testnet-rpc.dwellir.com"),
  ),
)

const typedApi = client.getTypedApi(testAzero)

const psp22Sdk = createInkSdk(typedApi, contracts.psp22)
const psp22Contract = psp22Sdk.getContract(ADDRESS.psp22)

// Storage query
{
  console.log("Query storage of contract")
  const storage = await createInkSdk(typedApi, contracts.escrow)
    .getContract(ADDRESS.escrow)
    .getRootStorage()

  if (storage.success && storage.value) {
    console.log("storage", storage.value)
  } else {
    console.log("error", storage.value)
  }
}

// Dry run
{
  console.log("IncreaseAllowance")
  const result = await psp22Contract.query("PSP22::increase_allowance", {
    origin: ADDRESS.alice,
    data: {
      spender: ADDRESS.psp22,
      delta_value: 1000000n,
    },
  })

  if (result.success) {
    console.log("IncreaseAllowance success")
    console.log("events", result.value.events)
  } else {
    console.log("error", result.value)
  }
}

// Redeploy contract
{
  console.log("Redeploy contract")
  const data = {
    decimals: 9,
    supply: 1_000_000_000_000n,
  }
  const result = await psp22Contract.dryRunRedeploy("new", {
    data,
    origin: ADDRESS.alice,
  })

  if (result.success) {
    console.log("dry run success")
    const result = await psp22Contract
      .redeploy("new", {
        data,
        origin: ADDRESS.alice,
        options: {
          salt: Binary.fromHex("0x01"),
        },
      })
      .signAndSubmit(aliceSigner)

    const deployment = psp22Sdk.readDeploymentEvents(
      ADDRESS.alice,
      result.events,
    )
    console.log("deployment", deployment)
  } else {
    console.log(result.value)
  }
}

client.destroy()

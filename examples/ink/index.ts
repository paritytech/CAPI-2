import { contracts, testAzero } from "@polkadot-api/descriptors"
import { createClient, type ResultPayload } from "polkadot-api"
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat"
import { getWsProvider } from "polkadot-api/ws-provider/web"
import { createInkSdk } from "./sdk/ink-sdk"

const ADDRESS = {
  alice: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
  escrow: "5FGWrHpqd3zzoVdbvuRvy1uLdDe22YaSrtrFLxRWHihZMmuL",
  psp22: "5EtyZ1urgUdR5h1RAVfgKgHtFv8skaM1YN5Gv4HJya361dLq",
}

const client = createClient(
  withPolkadotSdkCompat(
    getWsProvider("wss://aleph-zero-testnet-rpc.dwellir.com"),
  ),
)

const typedApi = client.getTypedApi(testAzero)

const escrowSdk = createInkSdk(typedApi, contracts.escrow)
const escrowContract = escrowSdk.getContract(ADDRESS.escrow)

const psp22Sdk = createInkSdk(typedApi, contracts.psp22)
const psp22Contract = psp22Sdk.getContract(ADDRESS.psp22)

// Storage query
{
  console.log("Query storage of contract")
  const storage = await escrowContract.getRootStorage()

  if (storage.success && storage.value) {
    console.log("storage nft", storage.value.nft)
    console.log("storage price", storage.value.price)
    console.log("storage seller", storage.value.seller)
  } else {
    console.log("error", storage.value)
  }
}

// Query for some information through a message
{
  console.log("get_nft")
  const result = await escrowContract.query("get_nft", {
    origin: ADDRESS.alice,
  })

  if (result.success) {
    console.log("id", result.value.response.id)
    console.log("owner", result.value.response.owner)
    console.log("events", result.value.events)
  } else {
    console.log("error", result.value)
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

// Send payable message
{
  console.log("Deposit 100 funds")
  const result = await escrowContract.query("deposit_funds", {
    origin: ADDRESS.alice,
    options: {
      value: 100_000_000_000_000n,
    },
  })

  if (result.success) {
    console.log("deposit funds success")
    console.log("events", result.value.events)
  } else {
    console.log("error", result.value)
  }
}

client.destroy()

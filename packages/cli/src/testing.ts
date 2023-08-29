import { getMetadata } from "./metadata"
import type { AsyncReturnType } from "type-fest"

export function blowupMetadata(metadata: AsyncReturnType<typeof getMetadata>) {
  const { pallets } = metadata.value

  const systemPallet = pallets.find((pallet) => pallet.name === "System")
  if (!systemPallet) {
    throw new Error("no system pallet")
  }

  systemPallet.constants = []
}

import { getCodecComponent } from "../../lib"
import * as editComponents from "./components"
import { V14, V15, HexString } from "@polkadot-api/substrate-bindings"
import { TreeCodec } from "./Tree"
export const EditCodec = getCodecComponent(editComponents)

export const EditCodec2: React.FC<{
  metadata: V14 | V15
  codecType: number
  value?: Uint8Array | HexString
}> = ({ value, ...props }) => {
  return (
    <div className="flex flex-row gap-10">
      <TreeCodec {...props} value={value} />
      <EditCodec {...props} value={value} />
    </div>
  )
}

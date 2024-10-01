import { getCodecComponent } from "../../lib"
import * as editComponents from "./components"
import { V14, V15, HexString } from "@polkadot-api/substrate-bindings"
import { TreeCodec } from "./Tree"
import { useState } from "react"
export const EditCodec = getCodecComponent(editComponents)

export const EditCodec2: React.FC<{
  metadata: V14 | V15
  codecType: number
  value?: Uint8Array | HexString
}> = ({ value: initialValue, ...props }) => {
  const [value, setValue] = useState<Uint8Array | HexString | undefined>(
    initialValue,
  )
  return (
    <div className="flex flex-row gap-10">
      <TreeCodec {...props} value={value} onChange={(val) => setValue(val)} />
      <EditCodec {...props} value={value} onChange={(val) => setValue(val)} />
    </div>
  )
}

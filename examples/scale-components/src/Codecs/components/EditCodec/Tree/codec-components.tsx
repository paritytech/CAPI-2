import * as Accordion from "@radix-ui/react-accordion"
import { ChevronDownIcon } from "@radix-ui/react-icons"
import React, { ReactNode } from "react"
import {
  EditArray,
  EditBool,
  EditEthAccount,
  EditOption,
  EditResult,
  EditSequence,
  EditStr,
  EditTuple,
  EditVoid,
  EditBigNumber,
  EditAccountId,
  NOTIN,
  EditNumber,
  EditBytes,
} from "../../../lib"

export const CVoid: EditVoid = () => null

export const CBool: EditBool = CVoid
export const CStr: EditStr = CVoid
export const CEthAccount: EditEthAccount = CVoid
export const CBigNumber: EditBigNumber = CVoid
export const CNumber: EditNumber = CVoid
export const CAccountId: EditAccountId = CVoid
export const CBytes: EditBytes = CVoid

export const CSequence: EditSequence = ({ innerComponents }) => {
  return <ListDisplay innerComponents={innerComponents} />
}

export const CArray: EditArray = ({ innerComponents }) => {
  return <ListDisplay innerComponents={innerComponents} />
}

const ListDisplay: React.FC<{ innerComponents: ReactNode[] }> = ({
  innerComponents,
}) => {
  return (
    <ul>
      {innerComponents.map((component, idx) => {
        return (
          <div key={idx} className="my-2 p-2">
            <div className="flex flex-row w-full items-center gap-2">
              |-- ITEM {idx + 1}
            </div>
            <div className="ml-[30px]">{component}</div>
          </div>
        )
      })}
    </ul>
  )
}

export const CTuple: EditTuple = ({ innerComponents }) => {
  return (
    <ul>
      Tuple [
      {innerComponents.map((jsx) => (
        <li>{jsx},</li>
      ))}
      ]
    </ul>
  )
}

export const COption: EditOption = ({ value, inner }) =>
  value === undefined ? "null" : inner

export const CResult: EditResult = ({ value, inner }) => (
  <>
    {value !== NOTIN && (value.success ? "ok" : "ko")}-{inner}
  </>
)

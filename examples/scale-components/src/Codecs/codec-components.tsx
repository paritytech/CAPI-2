import { toHex } from "@polkadot-api/utils"
import { HexString, SS58String } from "@polkadot-api/substrate-bindings"
import React, { createContext, ReactNode, useContext } from "react"

export type CodecComponentProps<T = any> = {
  value: T
  encodedValue: Uint8Array
}

export type PrimiveComponentProps<T = any> = CodecComponentProps<T> & {
  onValueChanged: (newValue: T) => void
  onBinChanged: (newValue: Uint8Array | HexString) => void
}

export type VoidInterface = {}
export type NumberInterface = PrimiveComponentProps<number> & {
  type: "u8" | "u16" | "u32" | "i8" | "i16" | "i32" | "compactNumber"
}
export type BNumberInterface = PrimiveComponentProps<bigint> & {
  type: "u64" | "u128" | "u256" | "i64" | "i128" | "i256" | "compactBn"
}
export type BoolInterface = PrimiveComponentProps<boolean>
export type StrInterface = PrimiveComponentProps<string>
export type BytesInterface = PrimiveComponentProps<Uint8Array> & {
  len?: number
}
export type AccountIdInterface = PrimiveComponentProps<SS58String>
export type EthAccountInterface = PrimiveComponentProps<HexString>

const DepthCtx = createContext<number>(0)
const useCurrentDepth = () => useContext(DepthCtx)
const withDepth: <T extends {}>(
  base: React.FC<T & { depth: number }>,
) => React.FC<T> = (Base) => (props) => {
  const depth = useCurrentDepth()
  return (
    <DepthCtx.Provider value={depth + 1}>
      <Base {...{ depth, ...props }} />
    </DepthCtx.Provider>
  )
}

const enhancer = withDepth

export const CNumber: React.FC<NumberInterface> = ({ type, value }) => (
  <span>
    {type} - {value}
  </span>
)

export const CBNumber: React.FC<BNumberInterface> = ({ type, value }) => (
  <span>
    {type} - {value.toString(10)}n
  </span>
)
export const CBool: React.FC<BoolInterface> = ({ value }) => (
  <input type="checkbox" checked={value} />
)

export const CVoid: React.FC<VoidInterface> = () => null

export const CString: React.FC<StrInterface> = ({ value }) => (
  <span>{value}n</span>
)

export const CBytes: React.FC<BytesInterface> = ({ value }) => (
  <span>{toHex(value)}</span>
)

export const CAccountId: React.FC<AccountIdInterface> = ({ value }) => (
  <span>{value}</span>
)

export const CEthAccount: React.FC<EthAccountInterface> = ({ value }) => (
  <span>{value}</span>
)

export type SequenceInterface<T = any> = CodecComponentProps<Array<T>> & {
  innerComponents: Array<React.ReactNode>
  onAddItem: (idx?: number, value?: T) => void
  onDeleteItem: (idx: number) => void
  onReorder: (prevIdx: number, newIdx: number) => void
}
export const CSequence: React.FC<SequenceInterface> = ({
  encodedValue,
  innerComponents,
}) => {
  return (
    <>
      <ul>{innerComponents}</ul>
      <span>{toHex(encodedValue)}</span>
    </>
  )
}

export type ArrayInterface<T = any> = CodecComponentProps<Array<T>> & {
  innerComponents: Array<React.ReactNode>
  onReorder: (prevIdx: number, newIdx: number) => void
}
export const CArray: React.FC<ArrayInterface> = ({
  encodedValue,
  innerComponents,
}) => {
  return (
    <>
      <ul>{innerComponents}</ul>
      <span>{toHex(encodedValue)}</span>
    </>
  )
}

export type TupleInterface<T = any> = CodecComponentProps<Array<T>> & {
  innerComponents: Array<React.ReactNode>
}
export const CTuple: React.FC<TupleInterface> = ({ innerComponents }) => {
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

export type StructInterface = CodecComponentProps<Record<string, any>> & {
  innerComponents: Record<string, React.ReactNode>
}
export const CStruct: React.FC<StructInterface> = ({ innerComponents }) => (
  <ul>
    {"{"}
    {Object.entries(innerComponents).map(([key, jsx]) => (
      <li>
        {key}: {jsx},
      </li>
    ))}
    {"}"}
  </ul>
)

type OptionInterface<T = any> = CodecComponentProps<T | undefined> & {
  onChange: (value: boolean | { set: true; value: T }) => void
  inner: ReactNode
}
export const COption: React.FC<OptionInterface> = ({ value, inner }) =>
  value === undefined ? "null" : inner

type ResultInterface = CodecComponentProps<{ success: boolean; value: any }> & {
  onChange: (value: boolean | { success: boolean; value: any }) => void
  inner: ReactNode
}

export const CREsult: React.FC<ResultInterface> = ({ value, inner }) => (
  <>
    {value.success ? "ok" : "ko"}-{inner}
  </>
)

type EnumInterface = CodecComponentProps<{ type: string; value: any }> & {
  tags: Array<{ idx: number; tag: string }>
  onChange: (val: string | { type: string; value: any }) => void
  inner: ReactNode
}

export const CEnum: React.FC<EnumInterface> = withDepth(
  ({ encodedValue, value, tags, onChange, inner, depth }) => {
    return (
      <>
        <span>{toHex(encodedValue)}</span>
        <select onChange={(e) => onChange(e.target.value)}>
          {tags.map(({ tag }) => (
            <option key={tag} value={tag} selected={tag === value.type}>
              {tag}
            </option>
          ))}
        </select>
        {inner}
      </>
    )
  },
)

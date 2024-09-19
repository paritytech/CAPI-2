import { ArrayVar, StructVar, TupleVar } from "@polkadot-api/metadata-builders"

export type TypeNode =
  | PrimitiveType
  | ChainPrimitiveType
  | FixedSizeBinary
  | StructType
  | ArrayType
  | TupleType
  | ResultType
  | EnumType
  | UnionType
  | OptionType
export type LookupTypeNode = TypeNode & { id: number }

export type NativeType =
  | "boolean"
  | "string"
  | "number"
  | "bigint"
  | "undefined"
  | "Uint8Array"
export type PrimitiveType = {
  type: "primitive"
  value: NativeType
}

export type ChainPrimitive =
  | "HexString"
  | "SS58String"
  | "Binary"
  | "BitSequence"
export type ChainPrimitiveType = {
  type: "chainPrimitive"
  value: ChainPrimitive
}

export type FixedSizeBinary = {
  type: "fixedSizeBinary"
  value: number
}

export type StructType = {
  type: "struct"
  value: Array<StructField>
  original: StructVar
}
export type StructField = {
  label: string
  value: LookupTypeNode
  docs: string[]
}

export type ArrayType = {
  type: "array"
  value: {
    value: LookupTypeNode
    len?: number
  }
  original: ArrayVar
}

export type TupleType = {
  type: "tuple"
  value: Array<TupleField>
  original: TupleVar
}
export type TupleField = {
  value: LookupTypeNode
  docs: string[]
}

export type ResultType = {
  type: "result"
  value: {
    ok: LookupTypeNode
    ko: LookupTypeNode
  }
}

export type EnumType = {
  type: "enum"
  value: Array<EnumVariant>
}
export type EnumVariant = {
  label: string
  docs: string[]
  value:
    | LookupTypeNode
    | TupleType
    | StructType
    | ArrayType
    | FixedSizeBinary
    | undefined
}

export type UnionType = {
  type: "union"
  value: (TypeNode | LookupTypeNode)[]
}

export type OptionType = {
  type: "option"
  value: LookupTypeNode
}

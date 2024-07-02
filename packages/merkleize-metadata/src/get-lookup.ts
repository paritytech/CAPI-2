import { Lookup, LookupValue, ScalePrimitive, TypeDef, TypeRef } from "./codecs"

const bitSequenceBytes = {
  u8: 1,
  u16: 2,
  u32: 4,
  u64: 8,
}

const constructTypeDef = (
  definitions: Map<number, LookupValue>,
  getTypeRef: (frameId: number) => TypeRef,
  getPrimitive: (frameId: number) => ScalePrimitive["tag"] | null,
  frameId: number,
): TypeDef[] => {
  const {
    def: { tag, value },
  } = definitions.get(frameId)!
  switch (tag) {
    case "composite":
      return [
        {
          tag,
          value: value.map((f) => ({
            name: f.name,
            typeName: f.typeName,
            ty: getTypeRef(f.type),
          })),
        },
      ]
    case "variant": {
      return value.map((v) => ({
        tag: "enumeration",
        value: {
          name: v.name,
          index: v.index,
          fields: v.fields.map((f) => ({
            name: f.name,
            typeName: f.typeName,
            ty: getTypeRef(f.type),
          })),
        },
      }))
    }
    case "sequence":
      return [
        {
          tag,
          value: getTypeRef(value),
        },
      ]
    case "array":
      return [
        {
          tag,
          value: {
            len: value.len,
            typeParam: getTypeRef(value.type),
          },
        },
      ]
    case "tuple":
      return [
        {
          tag,
          value: value.map(getTypeRef),
        },
      ]
    case "bitSequence": {
      const primitive = getPrimitive(value.bitStoreType)
      const numBytes = bitSequenceBytes[primitive as "u8"]
      if (!numBytes) throw new Error("Invalid primitive for BitSequence")

      const storeOrderPath = definitions.get(value.bitOrderType)!.path
      const leastSignificantBitFirst = storeOrderPath.includes("Lsb0")
      if (!leastSignificantBitFirst && !storeOrderPath.includes("Msb0"))
        throw new Error("BitOrderType not recognized")

      return [
        {
          tag: "bitSequence",
          value: { numBytes, leastSignificantBitFirst },
        },
      ]
    }
  }

  throw new Error(`FrameId(${frameId}) should have been filtered out`)
}

export const getLookup = (
  definitions: Map<number, LookupValue>,
  accessibleTypes: Map<number, number>,
  getTypeRef: (frameId: number) => TypeRef,
  getPrimitive: (frameId: number) => ScalePrimitive["tag"] | null,
) => {
  const typeTree: Lookup = []
  ;[...accessibleTypes.entries()].forEach(([frameId, typeId]) => {
    const { path } = definitions.get(frameId)!
    constructTypeDef(definitions, getTypeRef, getPrimitive, frameId).forEach(
      (typeDef) => {
        typeTree.push({
          path,
          typeId,
          typeDef,
        })
      },
    )
  })

  typeTree.sort((a, b) => {
    if (a.typeId !== b.typeId) return a.typeId - b.typeId // in general
    // should only happen for variants
    if (a.typeDef.tag !== "enumeration" || b.typeDef.tag !== "enumeration")
      throw new Error("Found two types with same id")
    return a.typeDef.value.index - b.typeDef.value.index
  })
  return typeTree
}

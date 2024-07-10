import {
  getChecksumBuilder,
  getLookupFn,
} from "@polkadot-api/metadata-builders"
import { V14, V15 } from "@polkadot-api/substrate-bindings"
import {
  EntryPoint,
  TypedefNode,
  mapLookupToTypedef,
  runtimeCallEntryPoint,
  storageEntryPoint,
  enumValueEntryPoint,
} from "@polkadot-api/metadata-compatibility"

/**
 * This function extracts from `metadata` all the types used from any entry
 * point (pallets and runtime APIs)
 * pruning and de-duplicating repeated types.
 *
 * It returns a map of `checksum => TypedefNode` for compatibility checking and
 * an array of checksums to map the dependencies of those `TypdefNode` (which
 * are expressed as indices) to the next checksum.
 * (Which will be needed when merging types from multiple chains)
 */
export const getUsedTypes = (
  metadata: V14 | V15,
  builder: ReturnType<typeof getChecksumBuilder>,
) => {
  const checksums: string[] = new Array(metadata.lookup.length)
  const types = new Map<string, TypedefNode | null>()
  const entryPoints = new Map<string, EntryPoint>()
  const lookup = getLookupFn(metadata.lookup)

  const addTypeFromLookup = (id: number | undefined) => {
    if (id == null) return
    const checksum = builder.buildDefinition(id)
    if (!checksum) {
      throw new Error("Unreachable: checksum not available for lookup type")
    }
    checksums[id] = checksum
    if (types.has(checksum)) return
    // Set to null before calling, as it will avoid infinite loops in circular dependencies
    types.set(checksum, null)
    const typedef = mapLookupToTypedef(lookup(id), addTypeFromLookup)
    types.set(checksum, typedef)
  }
  const addTypeFromEntryPoint = (checksum: string, entry: EntryPoint) => {
    entryPoints.set(checksum, entry)
    entry.args.forEach(addTypeFromLookup)
    entry.values.forEach(addTypeFromLookup)
  }

  const buildEnum = (val: number | undefined, cb: (name: string) => string) => {
    if (val === undefined) return
    const entry = lookup(val)

    if (entry.type === "void") return
    if (entry.type !== "enum") throw new Error("Expected enum")

    Object.entries(entry.value).forEach(([name, value]) => {
      const checksum = cb(name)
      addTypeFromEntryPoint(checksum, enumValueEntryPoint(value))
    })
  }

  metadata.pallets.forEach((pallet) => {
    pallet.storage?.items.forEach((entry) => {
      const checksum = builder.buildStorage(pallet.name, entry.name)!
      addTypeFromEntryPoint(checksum, storageEntryPoint(entry))
    })
    pallet.constants.forEach(({ name, type }) => {
      const checksum = builder.buildConstant(pallet.name, name)!
      addTypeFromEntryPoint(checksum, {
        args: [],
        values: [type],
      })
    })
    buildEnum(pallet.calls, (name) => builder.buildCall(pallet.name, name)!)
    buildEnum(pallet.events, (name) => builder.buildEvent(pallet.name, name)!)
    buildEnum(pallet.errors, (name) => builder.buildError(pallet.name, name)!)
  })

  metadata.apis.forEach((api) =>
    api.methods.forEach((method) => {
      const checksum = builder.buildRuntimeCall(api.name, method.name)!
      addTypeFromEntryPoint(checksum, runtimeCallEntryPoint(method))
    }),
  )

  return { types, entryPoints, checksums }
}

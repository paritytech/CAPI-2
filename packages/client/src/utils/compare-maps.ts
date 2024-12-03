export interface Deltas<K> {
  added: Set<K>
  changed: Set<K>
  deleted: Set<K>
}

export const compareMaps = <K, V>(
  prev: Map<K, V>,
  current: Map<K, V>,
  comparator: (a: V, b: V) => boolean = Object.is,
): Deltas<K> => {
  const added = new Set<K>()
  const changed = new Set<K>()
  const deleted = new Set<K>()

  current.forEach((value, key) => {
    if (prev.has(key)) {
      if (!comparator(prev.get(key)!, value)) changed.add(key)
    } else added.add(key)
  })

  prev.forEach((_, key) => {
    if (!current.has(key)) deleted.add(key)
  })

  return { added, changed, deleted }
}

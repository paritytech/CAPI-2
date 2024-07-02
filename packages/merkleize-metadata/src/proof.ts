const getLevelFromIdx = (idx: number) => Math.log2(idx + 1) | 0
const getAncestorIdx = (from: number, nLevels: number) =>
  ((from + 1) >> nLevels) - 1

export function getProofData(
  leaves: Array<Uint8Array>,
  knownLeavesIdxs: Array<number>,
) {
  const knownLeaves = knownLeavesIdxs.map((idx) => leaves[idx])

  const startingIdx = leaves.length - 1
  const leafIdxs = knownLeavesIdxs.map((idx) => startingIdx + idx)

  const proofIdxs: Array<number> = []
  if (leafIdxs.length) {
    const nLevels = getLevelFromIdx(leafIdxs.at(-1)!)
    const splitPosition = Math.pow(2, nLevels) - 1
    const splitIdx = leafIdxs.findIndex((x) => x >= splitPosition)
    if (splitIdx > 0) {
      leafIdxs.unshift(...leafIdxs.splice(splitIdx))
      knownLeaves.unshift(...knownLeaves.splice(splitIdx))
    }
  }

  let targetIdx = 0
  const traverse = (nodeIdx: number): void => {
    if (targetIdx === leafIdxs.length) {
      proofIdxs.push(nodeIdx)
      return
    }

    const target = leafIdxs[targetIdx]
    if (target === nodeIdx) {
      ++targetIdx
      return
    }

    const currentLevel = getLevelFromIdx(nodeIdx)
    const targetLevel = getLevelFromIdx(target)

    if (nodeIdx !== getAncestorIdx(target, targetLevel - currentLevel)) {
      proofIdxs.push(nodeIdx)
      return
    }

    const leftSon = 2 * nodeIdx + 1
    traverse(leftSon)
    traverse(leftSon + 1)
  }
  traverse(0)

  return {
    leaves: knownLeaves,
    leafIdxs,
    proofIdxs,
  }
}

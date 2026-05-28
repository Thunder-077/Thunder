export type DtwConfig = {
  beamWidth?: number
  substitutionCost?: number
  insertionCost?: number
  deletionCost?: number
  offScriptThreshold?: number
  offScriptCountToFail?: number
}

export type DtwState = {
  scriptPosition: number
  confidence: number
  isOnScript: boolean
  tokenCount: number
}

const DEFAULT_BEAM_WIDTH = 120
const DEFAULT_SUBSTITUTION_COST = 1.0
const DEFAULT_INSERTION_COST = 0.6
const DEFAULT_DELETION_COST = 0.8
const DEFAULT_OFF_SCRIPT_THRESHOLD = 0.35
const DEFAULT_OFF_SCRIPT_COUNT_TO_FAIL = 6
const INFINITY = 1e9

export function createOnlineDtw(scriptTokens: string[], config: DtwConfig = {}) {
  const beamWidthBase = config.beamWidth ?? DEFAULT_BEAM_WIDTH
  const substitutionCost = config.substitutionCost ?? DEFAULT_SUBSTITUTION_COST
  const insertionCost = config.insertionCost ?? DEFAULT_INSERTION_COST
  const deletionCost = config.deletionCost ?? DEFAULT_DELETION_COST
  const offScriptThreshold = config.offScriptThreshold ?? DEFAULT_OFF_SCRIPT_THRESHOLD
  const offScriptCountToFail = config.offScriptCountToFail ?? DEFAULT_OFF_SCRIPT_COUNT_TO_FAIL

  const scriptLength = scriptTokens.length
  if (scriptLength === 0) {
    return createEmptyDtw()
  }

  let prevColumn = new Float64Array(scriptLength).fill(INFINITY)
  let costColumn = new Float64Array(scriptLength).fill(INFINITY)
  let beamCenter = 0
  let beamWidth = beamWidthBase
  let tokenCount = 0
  let cumulativeCost = 0
  let bestPosition = 0
  let lowConfidenceStreak = 0

  for (let j = 0; j < Math.min(beamWidth, scriptLength); j += 1) {
    prevColumn[j] = j * insertionCost
  }

  function push(token: string): DtwState {
    tokenCount += 1

    costColumn.fill(INFINITY)

    const beamStart = Math.max(0, beamCenter - beamWidth)
    const beamEnd = Math.min(scriptLength - 1, beamCenter + beamWidth)

    for (let j = beamStart; j <= beamEnd; j += 1) {
      const matchCost = scriptTokens[j] === token ? 0 : substitutionCost

      const diagonal = j > 0 ? prevColumn[j - 1] + matchCost : (j === 0 ? prevColumn[0] + matchCost : INFINITY)
      const vertical = prevColumn[j] + deletionCost
      const horizontal = j > beamStart ? costColumn[j - 1] + insertionCost : INFINITY

      costColumn[j] = Math.min(diagonal, vertical, horizontal)
    }

    let minCost = INFINITY
    let minJ = beamCenter

    for (let j = beamStart; j <= beamEnd; j += 1) {
      if (costColumn[j] < minCost) {
        minCost = costColumn[j]
        minJ = j
      }
    }

    const temp = prevColumn
    prevColumn = costColumn
    costColumn = temp

    bestPosition = minJ
    beamCenter = minJ
    cumulativeCost = minCost

    const confidence = tokenCount > 0 ? Math.max(0, 1 - cumulativeCost / (tokenCount * substitutionCost)) : 0

    if (confidence < offScriptThreshold) {
      lowConfidenceStreak += 1
      if (lowConfidenceStreak >= offScriptCountToFail) {
        beamWidth = Math.min(scriptLength, beamWidthBase * 3)
      }
    } else {
      lowConfidenceStreak = 0
      beamWidth = beamWidthBase
    }

    return {
      scriptPosition: bestPosition,
      confidence,
      isOnScript: lowConfidenceStreak < offScriptCountToFail,
      tokenCount,
    }
  }

  function jump(scriptTokenIndex: number) {
    const clampedIndex = Math.max(0, Math.min(scriptLength - 1, scriptTokenIndex))
    beamCenter = clampedIndex
    bestPosition = clampedIndex
    beamWidth = beamWidthBase
    lowConfidenceStreak = 0
    cumulativeCost = 0
    tokenCount = 0

    prevColumn.fill(INFINITY)
    costColumn.fill(INFINITY)

    const beamStart = Math.max(0, clampedIndex - beamWidth)
    const beamEnd = Math.min(scriptLength - 1, clampedIndex + beamWidth)
    for (let j = beamStart; j <= beamEnd; j += 1) {
      prevColumn[j] = Math.abs(j - clampedIndex) * insertionCost
    }
  }

  function reset() {
    jump(0)
  }

  function getState(): DtwState {
    const confidence = tokenCount > 0 ? Math.max(0, 1 - cumulativeCost / (tokenCount * substitutionCost)) : 1
    return {
      scriptPosition: bestPosition,
      confidence,
      isOnScript: lowConfidenceStreak < offScriptCountToFail,
      tokenCount,
    }
  }

  return { push, jump, reset, getState }
}

function createEmptyDtw() {
  const emptyState: DtwState = {
    scriptPosition: 0,
    confidence: 0,
    isOnScript: false,
    tokenCount: 0,
  }

  return {
    push(): DtwState { return emptyState },
    jump() {},
    reset() {},
    getState(): DtwState { return emptyState },
  }
}

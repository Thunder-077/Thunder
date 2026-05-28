import type { ScriptSegment } from "./script-segmenter"
import { buildScriptIndex, type ScriptIndex } from "./script-segmenter"
import { toPinyinTokens } from "./pinyin"
import { normalizeSpeechText } from "./text-normalizer"
import { createOnlineDtw, type DtwConfig } from "./online-dtw"

export type AlignmentUpdate = {
  scriptOffset: number
  segmentIndex: number
  confidence: number
  isOnScript: boolean
}

export type AlignmentEngine = {
  push(text: string, isFinal: boolean, timestamps?: [number, number][]): AlignmentUpdate
  jump(scriptOffset: number): void
  reset(): void
  getState(): AlignmentUpdate
}

export type AlignmentEngineConfig = DtwConfig

export function createAlignmentEngine(
  script: string,
  segments: ScriptSegment[],
  config?: AlignmentEngineConfig
): AlignmentEngine {
  const index = buildScriptIndex(script, segments)
  const dtw = createOnlineDtw(index.tokens, config)

  if (index.tokens.length === 0) {
    const empty: AlignmentUpdate = { scriptOffset: 0, segmentIndex: 0, confidence: 0, isOnScript: false }
    return {
      push() { return empty },
      jump() {},
      reset() {},
      getState() { return empty },
    }
  }

  let lastUpdate: AlignmentUpdate = { scriptOffset: 0, segmentIndex: 0, confidence: 1, isOnScript: true }

  function push(text: string, _isFinal: boolean, timestamps?: [number, number][]): AlignmentUpdate {
    const normalized = normalizeSpeechText(text)
    if (!normalized) return lastUpdate

    const tokens = toPinyinTokens(normalized)
    let state = dtw.getState()

    for (const token of tokens) {
      state = dtw.push(token)
    }

    lastUpdate = toUpdate(state, index)

    if (timestamps && timestamps.length > 0) {
      const timestampOffset = resolveTimestampOffset(text, timestamps, script, segments)
      if (timestampOffset !== null) {
        lastUpdate = { ...lastUpdate, scriptOffset: Math.max(lastUpdate.scriptOffset, timestampOffset) }
      }
    }

    return lastUpdate
  }

  function jump(scriptOffset: number) {
    const tokenIndex = findTokenIndexByOffset(index, scriptOffset)
    dtw.jump(tokenIndex)
    lastUpdate = toUpdate(dtw.getState(), index)
  }

  function reset() {
    dtw.reset()
    lastUpdate = { scriptOffset: 0, segmentIndex: 0, confidence: 1, isOnScript: true }
  }

  function getState(): AlignmentUpdate {
    return lastUpdate
  }

  return { push, jump, reset, getState }
}

function toUpdate(state: { scriptPosition: number; confidence: number; isOnScript: boolean }, index: ScriptIndex): AlignmentUpdate {
  const pos = Math.max(0, Math.min(state.scriptPosition, index.tokens.length - 1))
  return {
    scriptOffset: index.offsets[pos] ?? 0,
    segmentIndex: index.segmentIndices[pos] ?? 0,
    confidence: state.confidence,
    isOnScript: state.isOnScript,
  }
}

function findTokenIndexByOffset(index: ScriptIndex, targetOffset: number): number {
  let best = 0
  let bestDist = Math.abs((index.offsets[0] ?? 0) - targetOffset)

  for (let i = 1; i < index.offsets.length; i += 1) {
    const dist = Math.abs(index.offsets[i] - targetOffset)
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  }

  return best
}

function resolveTimestampOffset(
  resultText: string,
  timestamps: [number, number][],
  script: string,
  segments: ScriptSegment[],
): number | null {
  const resultChars = Array.from(resultText)
  if (timestamps.length !== resultChars.length) return null

  const resultPy = toPinyinTokens(normalizeSpeechText(resultText))
  let bestOffset: number | null = null

  for (const segment of segments) {
    const originalSlice = script.slice(segment.startOffset, segment.endOffset)
    const leadingWs = originalSlice.length - originalSlice.trimStart().length
    const textStart = segment.startOffset + leadingWs
    const segChars = Array.from(segment.raw)
    const segPy = toPinyinTokens(normalizeSpeechText(segment.raw))

    let segScan = 0
    for (let ri = 0; ri < resultPy.length; ri += 1) {
      if (segScan >= segPy.length) break
      if (resultPy[ri] === segPy[segScan]) {
        const charOffset = textStart + Math.min(segScan, segChars.length - 1) + 1
        if (bestOffset === null || charOffset > bestOffset) {
          bestOffset = charOffset
        }
        segScan += 1
      }
    }
  }

  return bestOffset
}

export function getSegmentTextStartOffset(script: string, segment: ScriptSegment) {
  const originalSlice = script.slice(segment.startOffset, segment.endOffset)
  const leadingWhitespaceLength = originalSlice.length - originalSlice.trimStart().length
  return segment.startOffset + leadingWhitespaceLength
}

import { normalizeSpeechText } from "./text-normalizer"
import { toPinyinTokens } from "./pinyin"

export type ScriptSegment = {
  id: string
  raw: string
  normalized: string
  startOffset: number
  endOffset: number
  paragraphIndex: number
}

const SEGMENT_END_PATTERN = /[。！？.!?]+|[，、；：,;:]+|\n+/g
const MAX_SEGMENT_CHARS = 28

export function segmentScript(script: string): ScriptSegment[] {
  const segments: ScriptSegment[] = []
  let paragraphIndex = 0
  let segmentStart = 0

  for (const match of script.matchAll(SEGMENT_END_PATTERN)) {
    const punctuation = match[0]
    const matchIndex = match.index ?? 0
    const endOffset = matchIndex + punctuation.length
    const raw = script.slice(segmentStart, endOffset)

    pushSegmentChunks(segments, raw, segmentStart, endOffset, paragraphIndex)

    if (punctuation.includes("\n")) {
      paragraphIndex += punctuation.split("\n").length - 1
    }

    segmentStart = endOffset
  }

  if (segmentStart < script.length) {
    pushSegmentChunks(segments, script.slice(segmentStart), segmentStart, script.length, paragraphIndex)
  }

  return segments
}

function pushSegmentChunks(
  segments: ScriptSegment[],
  raw: string,
  startOffset: number,
  endOffset: number,
  paragraphIndex: number
) {
  const visibleChars = Array.from(raw.trim()).length
  if (visibleChars <= MAX_SEGMENT_CHARS) {
    pushSegment(segments, raw, startOffset, endOffset, paragraphIndex)
    return
  }

  let chunkStart = startOffset
  let chunkVisibleChars = 0
  for (let offset = startOffset; offset < endOffset; offset += 1) {
    const char = raw[offset - startOffset]
    if (!char) {
      continue
    }

    if (!/\s/.test(char)) {
      chunkVisibleChars += 1
    }

    if (chunkVisibleChars >= MAX_SEGMENT_CHARS) {
      pushSegment(segments, raw.slice(chunkStart - startOffset, offset + 1 - startOffset), chunkStart, offset + 1, paragraphIndex)
      chunkStart = offset + 1
      chunkVisibleChars = 0
    }
  }

  if (chunkStart < endOffset) {
    pushSegment(segments, raw.slice(chunkStart - startOffset), chunkStart, endOffset, paragraphIndex)
  }
}

function pushSegment(
  segments: ScriptSegment[],
  raw: string,
  startOffset: number,
  endOffset: number,
  paragraphIndex: number
) {
  const trimmed = raw.trim()
  if (!trimmed) {
    return
  }

  segments.push({
    id: `${startOffset}-${endOffset}`,
    raw: trimmed,
    normalized: normalizeSpeechText(trimmed),
    startOffset,
    endOffset,
    paragraphIndex,
  })
}

export type ScriptIndex = {
  script: string
  tokens: string[]
  offsets: number[]
  segmentIndices: number[]
  scriptTokens: ScriptToken[]
  segmentTokenRanges: Array<{ startTokenIndex: number; endTokenIndex: number }>
}

export type ScriptToken = {
  token: string
  text: string
  offset: number
  segmentIndex: number
  paragraphIndex: number
}

export function buildScriptIndex(script: string, segments: ScriptSegment[]): ScriptIndex {
  const tokens: string[] = []
  const offsets: number[] = []
  const segmentIndices: number[] = []
  const scriptTokens: ScriptToken[] = []
  const segmentTokenRanges: Array<{ startTokenIndex: number; endTokenIndex: number }> = []

  for (let segIdx = 0; segIdx < segments.length; segIdx += 1) {
    const segment = segments[segIdx]
    const originalSlice = script.slice(segment.startOffset, segment.endOffset)
    const leadingWs = originalSlice.length - originalSlice.trimStart().length
    const textStart = segment.startOffset + leadingWs
    const chars = Array.from(segment.raw)
    const startTokenIndex = tokens.length

    for (let ci = 0; ci < chars.length; ci += 1) {
      const ch = chars[ci]
      const normalized = normalizeSpeechText(ch)
      if (!normalized) continue

      const py = toPinyinTokens(normalized)
      for (const token of py) {
        const offset = textStart + ci + 1
        tokens.push(token)
        offsets.push(offset)
        segmentIndices.push(segIdx)
        scriptTokens.push({
          token,
          text: ch,
          offset,
          segmentIndex: segIdx,
          paragraphIndex: segment.paragraphIndex,
        })
      }
    }

    segmentTokenRanges.push({
      startTokenIndex,
      endTokenIndex: tokens.length,
    })
  }

  return { script, tokens, offsets, segmentIndices, scriptTokens, segmentTokenRanges }
}

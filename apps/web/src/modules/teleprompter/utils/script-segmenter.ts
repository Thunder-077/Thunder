import { normalizeSpeechText } from "./text-normalizer"

export type ScriptSegment = {
  id: string
  raw: string
  normalized: string
  startOffset: number
  endOffset: number
  paragraphIndex: number
}

const SENTENCE_END_PATTERN = /[。！？.!?]+|\n+/g

export function segmentScript(script: string): ScriptSegment[] {
  const segments: ScriptSegment[] = []
  let paragraphIndex = 0
  let segmentStart = 0

  for (const match of script.matchAll(SENTENCE_END_PATTERN)) {
    const punctuation = match[0]
    const matchIndex = match.index ?? 0
    const endOffset = matchIndex + punctuation.length
    const raw = script.slice(segmentStart, endOffset)

    pushSegment(segments, raw, segmentStart, endOffset, paragraphIndex)

    if (punctuation.includes("\n")) {
      paragraphIndex += punctuation.split("\n").length - 1
    }

    segmentStart = endOffset
  }

  if (segmentStart < script.length) {
    pushSegment(segments, script.slice(segmentStart), segmentStart, script.length, paragraphIndex)
  }

  return segments
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

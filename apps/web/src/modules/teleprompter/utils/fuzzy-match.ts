import type { ScriptSegment } from "./script-segmenter"
import { normalizeSpeechText } from "./text-normalizer"

export type MatchResult = {
  index: number
  confidence: number
}

const LOW_CONFIDENCE_MATCH: MatchResult = {
  index: -1,
  confidence: 0,
}

export function findBestSegmentMatch(
  segments: ScriptSegment[],
  transcript: string,
  anchorIndex: number
): MatchResult {
  const normalizedTranscript = normalizeSpeechText(transcript).slice(-72)
  if (normalizedTranscript.length < 2 || segments.length === 0) {
    return LOW_CONFIDENCE_MATCH
  }

  const from = Math.max(0, anchorIndex - 2)
  const to = Math.min(segments.length - 1, anchorIndex + 12)
  let best = LOW_CONFIDENCE_MATCH

  for (let index = from; index <= to; index += 1) {
    const segment = segments[index]
    const confidence = scoreSegment(normalizedTranscript, segment.normalized)
    if (confidence > best.confidence) {
      best = { index, confidence }
    }
  }

  return best
}

export function findSelectedSegment(
  segments: ScriptSegment[],
  selectedText: string,
  anchorIndex: number
): number {
  const selected = normalizeSpeechText(selectedText)
  if (!selected) {
    return -1
  }

  const indexedSegments = segments.map((segment, index) => ({
    index,
    distance: Math.abs(index - anchorIndex),
    segment,
  }))

  indexedSegments.sort((a, b) => a.distance - b.distance)

  const exact = indexedSegments.find(({ segment }) => {
    return segment.normalized.includes(selected) || selected.includes(segment.normalized)
  })

  if (exact) {
    return exact.index
  }

  let best = LOW_CONFIDENCE_MATCH
  for (const { index, segment } of indexedSegments) {
    const confidence = scoreSegment(selected, segment.normalized)
    if (confidence > best.confidence) {
      best = { index, confidence }
    }
  }

  return best.confidence >= 0.72 ? best.index : -1
}

function scoreSegment(transcript: string, segment: string): number {
  if (!transcript || !segment) {
    return 0
  }

  if (segment.includes(transcript)) {
    const raw = Math.min(1, 0.76 + transcript.length / Math.max(segment.length, 12))
    // Penalise very short transcripts matching long segments — e.g. "ai"
    // inside a 26-char segment. Without this, 2 chars score 0.84 and the
    // highlight gets stuck at the opening characters.
    const ratio = transcript.length / segment.length
    if (ratio < 0.15) return raw * 0.5
    if (ratio < 0.3) return raw * 0.75
    return raw
  }

  if (transcript.includes(segment)) {
    const raw = Math.min(1, 0.82 + segment.length / Math.max(transcript.length, 12))
    const ratio = segment.length / transcript.length
    if (ratio < 0.1) return raw * 0.6
    return raw
  }

  const lcs = longestCommonSubsequenceLength(transcript, segment)
  const coverage = lcs / Math.min(transcript.length, segment.length)
  const density = lcs / Math.max(transcript.length, segment.length)
  return coverage * 0.72 + density * 0.28
}

function longestCommonSubsequenceLength(left: string, right: string): number {
  const previous = new Array(right.length + 1).fill(0) as number[]
  const current = new Array(right.length + 1).fill(0) as number[]

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = left[leftIndex - 1] === right[rightIndex - 1]
        ? previous[rightIndex - 1] + 1
        : Math.max(previous[rightIndex], current[rightIndex - 1])
    }

    for (let index = 0; index < current.length; index += 1) {
      previous[index] = current[index]
      current[index] = 0
    }
  }

  return previous[right.length]
}

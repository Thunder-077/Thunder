import { toPinyinTokens } from "../utils/pinyin"
import { normalizeSpeechText } from "../utils/text-normalizer"
import type { SpeechChunk, SpeechProvider, SpeechProviderCapabilities, SpeechToken } from "./types"

export const SPEECH_PROVIDER_CAPABILITIES: Record<SpeechProvider, SpeechProviderCapabilities> = {
  "web-speech": {
    partialResults: true,
    finalResults: true,
    tokenTimestamps: false,
    hotwords: false,
    reliability: "fallback",
  },
  "sherpa-onnx": {
    partialResults: true,
    finalResults: true,
    tokenTimestamps: false,
    hotwords: false,
    reliability: "standard",
  },
}

let chunkSequence = 0

type CreateSpeechChunkOptions = {
  provider: SpeechProvider
  text: string
  isFinal: boolean
  mode?: SpeechChunk["mode"]
  confidence?: number
  timestamps?: [number, number][]
  speakerId?: string
}

export function createSpeechChunk(options: CreateSpeechChunkOptions): SpeechChunk {
  const text = options.text.trim()
  const sequence = chunkSequence++

  return {
    id: `${options.provider}-${Date.now()}-${sequence}`,
    sequence,
    provider: options.provider,
    text,
    normalizedText: normalizeSpeechText(text),
    mode: options.mode ?? (options.isFinal ? "final" : "partial"),
    isFinal: options.isFinal,
    tokens: createSpeechTokens(text, options.timestamps, options.confidence),
    receivedAt: Date.now(),
    speakerId: options.speakerId,
    confidence: options.confidence,
  }
}

function createSpeechTokens(
  text: string,
  timestamps: [number, number][] | undefined,
  confidence: number | undefined,
): SpeechToken[] {
  return Array.from(text).map((char, index) => {
    const normalized = normalizeSpeechText(char)
    const timestamp = timestamps?.[index]
    const pinyinTokens = normalized ? toPinyinTokens(normalized) : []

    return {
      text: char,
      normalized,
      pinyin: pinyinTokens[0],
      startMs: timestamp?.[0],
      endMs: timestamp?.[1],
      confidence,
    }
  })
}

export type SpeechProvider = "web-speech" | "funasr"

export type SpeechProviderCapabilities = {
  partialResults: boolean
  finalResults: boolean
  tokenTimestamps: boolean
  hotwords: boolean
  reliability: "fallback" | "standard"
}

export type SpeechToken = {
  text: string
  normalized: string
  pinyin?: string
  startMs?: number
  endMs?: number
  confidence?: number
}

export type SpeechChunk = {
  id: string
  provider: SpeechProvider
  text: string
  normalizedText: string
  isFinal: boolean
  tokens: SpeechToken[]
  receivedAt: number
}

export type TranscriptionResult = {
  text: string
  isFinal: boolean
  confidence?: number
  source?: string
  timestamps?: [number, number][]
  chunk?: SpeechChunk
}

export type TranscriberStatus =
  | "idle"
  | "listening"
  | "paused"
  | "stopped"
  | "unsupported"
  | "error"

export interface SpeechTranscriber {
  start: () => Promise<void>
  pause: () => void
  stop: () => void
  onResult: (handler: (result: TranscriptionResult) => void) => () => void
  onStatusChange: (handler: (status: TranscriberStatus) => void) => () => void
  onError: (handler: (message: string) => void) => () => void
  isSupported: () => boolean
  getCapabilities: () => SpeechProviderCapabilities
}

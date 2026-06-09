export type SpeechProvider = "web-speech" | "sherpa-onnx"

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
  sequence: number
  provider: SpeechProvider
  text: string
  normalizedText: string
  mode: "partial" | "final" | "revision"
  isFinal: boolean
  tokens: SpeechToken[]
  receivedAt: number
  speakerId?: string
  confidence?: number
}

export type TranscriptionResult = {
  text: string
  isFinal: boolean
  confidence?: number
  source?: string
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
}

export type SpeechProvider = "web-speech" | "funasr"

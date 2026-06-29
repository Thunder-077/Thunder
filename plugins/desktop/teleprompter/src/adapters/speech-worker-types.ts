export interface SpeechTranscribePayload {
  text: string
}

export interface SpeechTranscribeResult {
  normalized: string
}

export interface SpeechSessionStartPayload {
  provider: "web-speech" | "sherpa-onnx"
}

export interface SpeechSessionStartResult {
  sessionId: string
  provider: "web-speech" | "sherpa-onnx"
  status: "listening"
}

export interface SpeechSessionSubmitPayload {
  sessionId: string
  text: string
  isFinal?: boolean
}

export interface SpeechSessionSubmitResult {
  sessionId: string
  accepted: true
  normalized: string
  isFinal: boolean
}

export interface SpeechAudioChunkPayload {
  sessionId: string
  samples: number[]
  sampleRate: 16000
  channels: 1
  encoding: "pcm_s16le"
  inputFinished?: boolean
}

export interface SpeechAudioChunkResult {
  sessionId: string
  accepted: true
  acceptedSamples: number
  isFinal: boolean
  normalized?: string | null
}

export interface SpeechSessionStopPayload {
  sessionId: string
}

export interface SpeechSessionStopResult {
  sessionId: string
  stopped: true
}

export interface SpeechRuntimeHealthResult {
  available: boolean
  transport: "trusted-worker"
  capabilities: {
    modelManagement: boolean
    realtimeRecognition: boolean
    sessionControl: boolean
  }
  reason?: string
}

export interface SpeechWorkerModelRecord {
  id: string
  name: string
  description?: string
  language: string
  runtime: string
  size: string
  installed: boolean
  active: boolean
  downloading?: boolean
  downloadProgress?: {
    percentage: number
    downloaded: number
    total: number
    status: string
  } | null
}

export interface SpeechModelsDownloadPayload {
  modelId: string
}

export interface SpeechModelsActivatePayload {
  modelId: string
}

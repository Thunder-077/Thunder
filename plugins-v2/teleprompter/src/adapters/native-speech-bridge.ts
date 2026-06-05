import type { SpeechWorkerModelRecord } from "./speech-worker-types"

type NativeBridgeEnvelope<T> = {
  ok?: boolean
  data?: T
  message?: string
}

type NativeSherpaModelRecord = {
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

type NativeSherpaRecognitionUpdate = {
  text: string
  segment: number
  isFinal: boolean
}

function getNativeBridgeBaseUrl(): string | null {
  const baseUrl = process.env.THUNDER_DESKTOP_NATIVE_API_URL?.trim()
  return baseUrl ? baseUrl.replace(/\/+$/, "") : null
}

function requireNativeBridgeBaseUrl(): string {
  const baseUrl = getNativeBridgeBaseUrl()
  if (!baseUrl) {
    throw new Error("Desktop native speech bridge is not configured for this trusted worker")
  }

  return baseUrl
}

async function readNativeBridgeResponse<T>(response: Response): Promise<T> {
  const payload = await response.json() as NativeBridgeEnvelope<T>

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || `Native speech bridge request failed with status ${response.status}`)
  }

  return payload.data as T
}

async function nativeGet<T>(path: string): Promise<T> {
  const baseUrl = requireNativeBridgeBaseUrl()
  const response = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: {
      accept: "application/json",
    },
  })
  return readNativeBridgeResponse<T>(response)
}

async function nativePost<T>(path: string, body?: unknown): Promise<T> {
  const baseUrl = requireNativeBridgeBaseUrl()
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return readNativeBridgeResponse<T>(response)
}

function toSpeechWorkerModelRecord(model: NativeSherpaModelRecord): SpeechWorkerModelRecord {
  return {
    id: model.id,
    name: model.name,
    description: model.description,
    language: model.language,
    runtime: model.runtime,
    size: model.size,
    installed: model.installed,
    active: model.active,
    downloading: model.downloading,
    downloadProgress: model.downloadProgress ?? null,
  }
}

export const nativeSpeechBridge = {
  isConfigured(): boolean {
    return getNativeBridgeBaseUrl() !== null
  },
  async checkSherpaRunning(): Promise<boolean> {
    return nativeGet<boolean>("/sherpa/status")
  },
  async listSherpaModels(): Promise<SpeechWorkerModelRecord[]> {
    const models = await nativeGet<NativeSherpaModelRecord[]>("/sherpa/models")
    return models.map(toSpeechWorkerModelRecord)
  },
  async downloadSherpaModel(modelId: string): Promise<SpeechWorkerModelRecord[]> {
    const models = await nativePost<NativeSherpaModelRecord[]>("/sherpa/models/download", { modelId })
    return models.map(toSpeechWorkerModelRecord)
  },
  async activateSherpaModel(modelId: string): Promise<SpeechWorkerModelRecord[]> {
    const models = await nativePost<NativeSherpaModelRecord[]>("/sherpa/models/activate", { modelId })
    return models.map(toSpeechWorkerModelRecord)
  },
  async startSherpaService(): Promise<string> {
    return nativePost<string>("/sherpa/start")
  },
  async stopSherpaService(): Promise<void> {
    await nativePost<null>("/sherpa/stop")
  },
  async feedSherpaAudio(samples: number[], inputFinished = false): Promise<NativeSherpaRecognitionUpdate | null> {
    return nativePost<NativeSherpaRecognitionUpdate | null>("/sherpa/feed", {
      samples,
      inputFinished,
    })
  },
}

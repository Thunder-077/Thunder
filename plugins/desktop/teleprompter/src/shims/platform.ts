export type DesktopPlatform = "macos" | "windows" | "linux"

export type SherpaModel = {
  id: string
  name: string
  description: string
  language: string
  runtime: string
  size: string
  installed: boolean
  active: boolean
  downloading?: boolean
}

export type SherpaRecognitionUpdate = {
  text: string
  segment: number
  isFinal: boolean
}

export function isTauriDesktop(): boolean {
  return true
}

async function nativeGet<T>(path: string): Promise<T> {
  const response = await fetch(`/api/v1/desktop/plugins/teleprompter/api/native${path}`, {
    cache: "no-store",
  })
  return readNativeResponse<T>(response)
}

async function nativePost<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/v1/desktop/plugins/teleprompter/api/native${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return readNativeResponse<T>(response)
}

async function readNativeResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; data?: T; message?: string } | null
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || "提词器原生能力调用失败")
  }
  return payload.data as T
}

export async function getTauriDesktopPlatform(): Promise<DesktopPlatform | null> {
  return nativeGet<DesktopPlatform>("/platform")
}

export async function checkFunAsrRunning(): Promise<boolean> {
  return nativeGet<boolean>("/funasr/status")
}

export async function startFunAsrService(): Promise<string> {
  return nativePost<string>("/funasr/start")
}

export async function checkSherpaRunning(): Promise<boolean> {
  return nativeGet<boolean>("/sherpa/status")
}

export async function listSherpaModels(): Promise<SherpaModel[]> {
  return nativeGet<SherpaModel[]>("/sherpa/models")
}

export async function downloadSherpaModel(modelId: string): Promise<SherpaModel[]> {
  return nativePost<SherpaModel[]>("/sherpa/models/download", { modelId })
}

export async function activateSherpaModel(modelId: string): Promise<SherpaModel[]> {
  return nativePost<SherpaModel[]>("/sherpa/models/activate", { modelId })
}

export async function startSherpaService(): Promise<string> {
  return nativePost<string>("/sherpa/start")
}

export async function stopSherpaService(): Promise<void> {
  await nativePost<null>("/sherpa/stop")
}

export async function feedSherpaAudio(
  samples: number[],
  inputFinished = false
): Promise<SherpaRecognitionUpdate | null> {
  return nativePost<SherpaRecognitionUpdate | null>("/sherpa/feed", { samples, inputFinished })
}

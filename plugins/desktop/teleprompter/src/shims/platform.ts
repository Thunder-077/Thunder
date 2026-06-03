import { thunder } from "@thunder/plugin-sdk/browser"
import { emitPluginEvent } from "./tauri-event"

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
  downloadProgress?: {
    percentage: number
    downloaded: number
    total: number
    status: string
  } | null
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
  const response = await thunder.runtime.get<{ ok?: boolean; data?: T; message?: string }>(`native${path}`, {
    cache: "no-store",
  })
  return readNativeResponse<T>(response)
}

async function nativePost<T>(path: string, body?: unknown): Promise<T> {
  const response = await thunder.runtime.post<{ ok?: boolean; data?: T; message?: string }>(`native${path}`, body, {
    headers: {
      "content-type": "application/json",
    },
  })
  return readNativeResponse<T>(response)
}

function readNativeResponse<T>(payload: { ok?: boolean; data?: T; message?: string } | null): T {
  if (!payload?.ok) {
    throw new Error(payload?.message || "提词器原生能力调用失败")
  }
  return payload.data as T
}

export async function getTauriDesktopPlatform(): Promise<DesktopPlatform | null> {
  return nativeGet<DesktopPlatform>("/platform")
}

export async function checkSherpaRunning(): Promise<boolean> {
  return nativeGet<boolean>("/sherpa/status")
}

export async function listSherpaModels(): Promise<SherpaModel[]> {
  return nativeGet<SherpaModel[]>("/sherpa/models")
}

export async function downloadSherpaModel(modelId: string): Promise<SherpaModel[]> {
  const models = await nativePost<SherpaModel[]>("/sherpa/models/download", { modelId })
  const target = models.find((model) => model.id === modelId)
  emitSherpaModelProgress(target)
  if (target?.downloading) {
    pollSherpaModelDownload(modelId)
  }
  return models
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

const pollingDownloads = new Set<string>()

function pollSherpaModelDownload(modelId: string): void {
  if (pollingDownloads.has(modelId) || typeof window === "undefined") return
  pollingDownloads.add(modelId)

  const startedAt = Date.now()
  const poll = async () => {
    try {
      const models = await listSherpaModels()
      const target = models.find((model) => model.id === modelId)
      emitSherpaModelProgress(target)

      if (target?.installed && !target.downloading) {
        pollingDownloads.delete(modelId)
        emitPluginEvent("sherpa-model-installed", modelId)
        return
      }

      if (target && !target.downloading && !target.installed) {
        pollingDownloads.delete(modelId)
        emitPluginEvent("sherpa-model-download-failed", {
          modelId,
          error: "模型下载未完成，请重新尝试。",
        })
        return
      }

      if (Date.now() - startedAt > 30 * 60 * 1000) {
        pollingDownloads.delete(modelId)
        emitPluginEvent("sherpa-model-download-failed", {
          modelId,
          error: "模型下载超时，请稍后刷新模型列表。",
        })
        return
      }

      window.setTimeout(poll, 1500)
    } catch (error) {
      pollingDownloads.delete(modelId)
      emitPluginEvent("sherpa-model-download-failed", {
        modelId,
        error: error instanceof Error ? error.message : "模型下载状态检查失败",
      })
    }
  }

  window.setTimeout(poll, 1500)
}

function emitSherpaModelProgress(model: SherpaModel | undefined): void {
  if (!model?.downloading || !model.downloadProgress) return

  emitPluginEvent("sherpa-download-progress", {
    modelId: model.id,
    percentage: model.downloadProgress.percentage,
    downloaded: model.downloadProgress.downloaded,
    total: model.downloadProgress.total,
    status: model.downloadProgress.status,
  })
}

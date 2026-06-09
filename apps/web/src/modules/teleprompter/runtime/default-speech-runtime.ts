"use client"

import { notificationStore } from "@/lib/notification-store"
import {
  activateSherpaModel,
  checkSherpaRunning,
  downloadSherpaModel,
  isTauriDesktop,
  listSherpaModels,
} from "@/lib/platform"
import { SherpaOnnxTranscriber, WebSpeechTranscriber, type SpeechProvider } from "../transcribers"
import type {
  TeleprompterSpeechModel,
  TeleprompterSpeechRuntime,
  TeleprompterTranscriberFactory,
} from "./types"

function createDefaultTranscriber(provider: SpeechProvider) {
  if (provider === "sherpa-onnx") {
    return new SherpaOnnxTranscriber()
  }

  return new WebSpeechTranscriber()
}

async function subscribeTauriEvent<TPayload>(
  eventName: string,
  handler: (payload: TPayload) => void,
): Promise<() => void> {
  if (!isTauriDesktop()) {
    return () => undefined
  }

  const { listen } = await import("@tauri-apps/api/event")
  return listen<TPayload>(eventName, (event) => {
    handler(event.payload)
  })
}

function formatMegabytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function toTeleprompterSpeechModels(models: TeleprompterSpeechModel[]) {
  return models
}

const defaultTranscriberFactory: TeleprompterTranscriberFactory = (provider) => createDefaultTranscriber(provider)

export function createDefaultTeleprompterSpeechRuntime(): TeleprompterSpeechRuntime {
  return {
    supportsSherpa() {
      return isTauriDesktop()
    },
    checkSherpaReady() {
      return checkSherpaRunning()
    },
    async listSherpaModels() {
      return toTeleprompterSpeechModels(await listSherpaModels())
    },
    async downloadSherpaModel(modelId) {
      return toTeleprompterSpeechModels(await downloadSherpaModel(modelId))
    },
    async activateSherpaModel(modelId) {
      return toTeleprompterSpeechModels(await activateSherpaModel(modelId))
    },
    createTranscriber: defaultTranscriberFactory,
    subscribeSherpaModelProgress(handler) {
      return subscribeTauriEvent("sherpa-download-progress", handler)
    },
    subscribeSherpaModelInstalled(handler) {
      return subscribeTauriEvent("sherpa-model-installed", handler)
    },
    subscribeSherpaModelDownloadFailed(handler) {
      return subscribeTauriEvent("sherpa-model-download-failed", handler)
    },
    notifySherpaDownloadQueued(modelId, modelName) {
      notificationStore.addNotificationWithId(modelId, {
        title: "下载 Sherpa 模型",
        description: `准备下载并激活 ${modelName}…`,
        type: "progress",
        percentage: 0,
        status: "downloading",
      })
    },
    notifySherpaDownloadProgress(modelId, percentage, downloaded, total) {
      notificationStore.updateProgress(modelId, percentage, downloaded, total)
    },
    notifySherpaDownloadCompleted(modelId, modelName) {
      notificationStore.completeNotification(modelId, true, `模型 ${modelName} 下载并激活成功！`)
    },
    notifySherpaDownloadFailed(modelId, modelName, error) {
      notificationStore.completeNotification(modelId, false, `模型 ${modelName} 下载失败: ${error}`)
    },
  }
}

export function createDownloadProgressView(downloaded: number, total: number) {
  return {
    downloadedText: formatMegabytes(downloaded),
    totalText: formatMegabytes(total),
  }
}

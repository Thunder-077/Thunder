import type { SpeechProvider, SpeechTranscriber } from "../transcribers"

export type TeleprompterSpeechModel = {
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

export type TeleprompterSpeechModelDownloadProgress = {
  percentage: number
  downloadedText: string
  totalText: string
  status?: string
}

export type TeleprompterSpeechModelProgressEvent = {
  modelId: string
  percentage: number
  downloaded: number
  total: number
  status?: string
}

export type TeleprompterSpeechModelFailureEvent = {
  modelId: string
  error: string
}

export type TeleprompterTranscriberFactory = (provider: SpeechProvider) => SpeechTranscriber

export type TeleprompterSpeechRuntime = {
  supportsSherpa(): boolean
  checkSherpaReady(): Promise<boolean>
  listSherpaModels(): Promise<TeleprompterSpeechModel[]>
  downloadSherpaModel(modelId: string): Promise<TeleprompterSpeechModel[]>
  activateSherpaModel(modelId: string): Promise<TeleprompterSpeechModel[]>
  createTranscriber: TeleprompterTranscriberFactory
  subscribeSherpaModelProgress(
    handler: (event: TeleprompterSpeechModelProgressEvent) => void,
  ): Promise<() => void>
  subscribeSherpaModelInstalled(handler: (modelId: string) => void): Promise<() => void>
  subscribeSherpaModelDownloadFailed(
    handler: (event: TeleprompterSpeechModelFailureEvent) => void,
  ): Promise<() => void>
  notifySherpaDownloadQueued(modelId: string, modelName: string): void
  notifySherpaDownloadProgress(modelId: string, percentage: number, downloaded: number, total: number): void
  notifySherpaDownloadCompleted(modelId: string, modelName: string): void
  notifySherpaDownloadFailed(modelId: string, modelName: string, error: string): void
}

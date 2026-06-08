import type { SpeechProvider } from "../../teleprompter-core/src/index"

export type TeleprompterSpeechModel = {
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

export type TeleprompterSpeechProvider = SpeechProvider

export type TeleprompterSpeechDownloadProgress = Record<
  string,
  {
    percentage: number
    downloadedText: string
    totalText: string
    status?: string
  }
>

"use client"

import type { ReactNode } from "react"
import type { SpeechProvider } from "@thunder/teleprompter-core"
import type { FollowReadSpeechController } from "./use-follow-read-session"
import {
  TeleprompterWorkspace,
  type TeleprompterDocumentIO,
  type TeleprompterSherpaRuntime,
} from "./teleprompter-workspace"

const DEFAULT_TELEPROMPTER_PAGE_MIN_HEIGHT = "42rem"
const DEFAULT_TELEPROMPTER_PAGE_HEIGHT = "calc(100dvh - var(--desktop-titlebar-height, 38px) - 4rem)"

export type TeleprompterPageProps = {
  header: ReactNode
  speech: FollowReadSpeechController
  speechProvider: SpeechProvider
  onSpeechProviderChange: (provider: SpeechProvider) => void
  sherpaRuntime?: TeleprompterSherpaRuntime
  documentIO: TeleprompterDocumentIO
  showExperimentalInsights?: boolean
  minHeight?: string
  height?: string
}

/**
 * 正式公共页面层。
 * Web 与 Desktop 插件都只通过注入式 adapter 提供运行时能力，不再各自维护页面编排。
 */
export function TeleprompterPage({
  header,
  speech,
  speechProvider,
  onSpeechProviderChange,
  sherpaRuntime,
  documentIO,
  showExperimentalInsights = false,
  minHeight = DEFAULT_TELEPROMPTER_PAGE_MIN_HEIGHT,
  height = DEFAULT_TELEPROMPTER_PAGE_HEIGHT,
}: TeleprompterPageProps) {
  return (
    <TeleprompterWorkspace
      header={header}
      speech={speech}
      speechProvider={speechProvider}
      onSpeechProviderChange={onSpeechProviderChange}
      sherpaRuntime={sherpaRuntime}
      documentIO={documentIO}
      showExperimentalInsights={showExperimentalInsights}
      minHeight={minHeight}
      height={height}
    />
  )
}

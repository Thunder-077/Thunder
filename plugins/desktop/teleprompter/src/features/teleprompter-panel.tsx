"use client"

import { useMemo, useState } from "react"
import {
  TeleprompterWorkspace,
  type TeleprompterSherpaRuntime,
  type TeleprompterSpeechModel,
} from "@thunder/teleprompter-ui"
import { shouldShowTeleprompterExperimentalInsights } from "@/modules/teleprompter/utils/teleprompter-env"
import {
  readPluginTeleprompterDocument,
  writePluginTeleprompterDocument,
} from "../adapters/document-storage"
import { pluginSpeechRuntime } from "../adapters/plugin-speech-runtime"
import { usePluginFollowSpeech } from "./use-plugin-follow-speech"
import type { SpeechProvider } from "@thunder/teleprompter-core"

const TELEPROMPTER_PAGE_MIN_HEIGHT = "42rem"
const TELEPROMPTER_PAGE_HEIGHT = "calc(100dvh - var(--desktop-titlebar-height, 38px) - 4rem)"

function createPluginSherpaRuntime(): TeleprompterSherpaRuntime {
  return {
    supportsSherpa() {
      return true
    },
    async checkSherpaReady() {
      const health = await pluginSpeechRuntime.checkHealth()
      return health.available
    },
    async listSherpaModels() {
      return (await pluginSpeechRuntime.listModels()) as TeleprompterSpeechModel[]
    },
    async downloadSherpaModel(modelId: string) {
      return (await pluginSpeechRuntime.downloadModel({ modelId })) as TeleprompterSpeechModel[]
    },
    async activateSherpaModel(modelId: string) {
      return (await pluginSpeechRuntime.activateModel({ modelId })) as TeleprompterSpeechModel[]
    },
  }
}

export function TeleprompterPanel() {
  const showExperimentalInsights = shouldShowTeleprompterExperimentalInsights()
  const [speechProvider, setSpeechProvider] = useState<SpeechProvider>("web-speech")
  const speech = usePluginFollowSpeech(speechProvider)
  const sherpaRuntime = useMemo(() => createPluginSherpaRuntime(), [])

  return (
    <TeleprompterWorkspace
      header={(
        <header className="mb-4 flex flex-col gap-4 border-b border-border/50 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 max-w-3xl">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">提词器</h1>
          </div>
        </header>
      )}
      speech={speech}
      speechProvider={speechProvider}
      onSpeechProviderChange={setSpeechProvider}
      sherpaRuntime={sherpaRuntime}
      documentIO={{
        readDocument: readPluginTeleprompterDocument,
        writeDocument: writePluginTeleprompterDocument,
      }}
      showExperimentalInsights={showExperimentalInsights}
      minHeight={TELEPROMPTER_PAGE_MIN_HEIGHT}
      height={TELEPROMPTER_PAGE_HEIGHT}
    />
  )
}

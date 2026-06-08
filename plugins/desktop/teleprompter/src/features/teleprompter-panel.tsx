"use client"

import { ScrollText } from "lucide-react"
import { useMemo, useState } from "react"
import {
  TeleprompterWorkspace,
  type TeleprompterSherpaRuntime,
  type TeleprompterSpeechModel,
} from "@thunder/teleprompter-ui"
import {
  readPluginTeleprompterDocument,
  writePluginTeleprompterDocument,
} from "../adapters/document-storage"
import { pluginSpeechRuntime } from "../adapters/plugin-speech-runtime"
import { usePluginFollowSpeech } from "./use-plugin-follow-speech"
import type { SpeechProvider } from "@thunder/teleprompter-core"

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
  const [speechProvider, setSpeechProvider] = useState<SpeechProvider>("web-speech")
  const speech = usePluginFollowSpeech(speechProvider)
  const sherpaRuntime = useMemo(() => createPluginSherpaRuntime(), [])

  return (
    <TeleprompterWorkspace
      header={(
        <header className="mb-1 flex flex-col gap-3 border-b border-border/50 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-muted/40">
              <ScrollText className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">提词器</h1>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                桌面插件版提词器，复用共享页面编排与 trusted worker 运行时能力。
              </p>
            </div>
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
      showExperimentalInsights
    />
  )
}

"use client"

import { useMemo, useState } from "react"
import { PageHeader } from "@/components/page-header"
import type { SpeechProvider } from "@thunder/teleprompter-core"
import { shouldShowTeleprompterExperimentalInsights } from "@thunder/teleprompter-core"
import {
  TeleprompterPage as SharedTeleprompterPage,
  type TeleprompterSherpaRuntime,
} from "@thunder/teleprompter-ui"
import { useSpeechRecognition } from "../hooks/use-speech-recognition"
import { createDefaultTeleprompterSpeechRuntime } from "../runtime/default-speech-runtime"
import { readTeleprompterStorage, writeTeleprompterStorage } from "../utils/teleprompter-storage"

/**
 * Web 端适配层。
 * 页面编排已经下沉到公共包，这里只负责把 web runtime / storage / header 注入进去。
 */
export function TeleprompterPageAdapter() {
  const showExperimentalInsights = shouldShowTeleprompterExperimentalInsights()
  const speechRuntime = useMemo(() => createDefaultTeleprompterSpeechRuntime(), [])
  const [speechProvider, setSpeechProvider] = useState<SpeechProvider>("web-speech")
  const speech = useSpeechRecognition({
    provider: speechProvider,
    createTranscriber: speechRuntime.createTranscriber,
  })

  const sherpaRuntime = speechRuntime as TeleprompterSherpaRuntime

  return (
    <SharedTeleprompterPage
      header={<PageHeader title="提词器" />}
      speech={speech}
      speechProvider={speechProvider}
      onSpeechProviderChange={setSpeechProvider}
      sherpaRuntime={sherpaRuntime}
      documentIO={{
        readDocument: readTeleprompterStorage,
        writeDocument: writeTeleprompterStorage,
      }}
      showExperimentalInsights={showExperimentalInsights}
    />
  )
}

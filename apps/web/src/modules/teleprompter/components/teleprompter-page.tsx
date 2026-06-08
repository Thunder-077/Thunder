"use client"

import { useMemo, useState } from "react"
import { PageHeader } from "@/components/page-header"
import {
  TeleprompterWorkspace,
  type TeleprompterSherpaRuntime,
} from "../../../../../../packages/teleprompter-ui/src/index"
import { useSpeechRecognition } from "../hooks/use-speech-recognition"
import {
  createDefaultTeleprompterSpeechRuntime,
} from "../runtime/default-speech-runtime"
import {
  readTeleprompterStorage,
  writeTeleprompterStorage,
} from "../utils/teleprompter-storage"
import { shouldShowTeleprompterExperimentalInsights } from "../utils/teleprompter-env"
import type { SpeechProvider } from "../transcribers"

const TELEPROMPTER_PAGE_MIN_HEIGHT = "42rem"
const TELEPROMPTER_PAGE_HEIGHT = "calc(100dvh - var(--desktop-titlebar-height, 38px) - 4rem)"

export function TeleprompterPage() {
  const showExperimentalInsights = shouldShowTeleprompterExperimentalInsights()
  const speechRuntime = useMemo(() => createDefaultTeleprompterSpeechRuntime(), [])
  const [speechProvider, setSpeechProvider] = useState<SpeechProvider>("web-speech")
  const speech = useSpeechRecognition({
    provider: speechProvider,
    createTranscriber: speechRuntime.createTranscriber,
  })

  const sherpaRuntime = speechRuntime as TeleprompterSherpaRuntime

  return (
    <TeleprompterWorkspace
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
      minHeight={TELEPROMPTER_PAGE_MIN_HEIGHT}
      height={TELEPROMPTER_PAGE_HEIGHT}
    />
  )
}

"use client"

import { useEffect, useMemo, useState } from "react"
import { SherpaOnnxTranscriber, WebSpeechTranscriber } from "../transcribers"
import type { SpeechProvider, SpeechTranscriber, TranscriberStatus, TranscriptionResult } from "../transcribers"

type UseSpeechRecognitionOptions = {
  provider: SpeechProvider
}

function createTranscriber(options: UseSpeechRecognitionOptions): SpeechTranscriber {
  if (options.provider === "sherpa-onnx") {
    return new SherpaOnnxTranscriber()
  }

  return new WebSpeechTranscriber()
}

export function useSpeechRecognition(options: UseSpeechRecognitionOptions) {
  const { provider } = options
  const transcriber = useMemo(() => createTranscriber({ provider }), [provider])
  const [status, setStatus] = useState<TranscriberStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<TranscriptionResult | null>(null)

  useEffect(() => {
    const offResult = transcriber.onResult((result) => {
      setLastResult(result)
      setStatus("listening")
      setError(null)
    })
    const offStatus = transcriber.onStatusChange(setStatus)
    const offError = transcriber.onError((message) => {
      setError(message)
    })

    return () => {
      offResult()
      offStatus()
      offError()
      void transcriber.stop()
    }
  }, [transcriber])

  return {
    status,
    error,
    lastResult,
    isSupported: transcriber.isSupported(),
    start: () => {
      setError(null)
      return transcriber.start()
    },
    pause: () => transcriber.pause(),
    stop: async () => {
      setError(null)
      setLastResult(null)
      await transcriber.stop()
    },
    clearResult: () => setLastResult(null),
    clearError: () => setError(null),
  }
}

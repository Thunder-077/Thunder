"use client"

import { useEffect, useMemo, useState } from "react"
import { FunAsrTranscriber, SherpaOnnxTranscriber, WebSpeechTranscriber } from "../transcribers"
import type { SpeechProvider, SpeechTranscriber, TranscriberStatus, TranscriptionResult } from "../transcribers"

type UseSpeechRecognitionOptions = {
  provider: SpeechProvider
  funAsrEndpoint: string
  funAsrHotwords?: string
}

function createTranscriber(options: UseSpeechRecognitionOptions): SpeechTranscriber {
  if (options.provider === "funasr") {
    return new FunAsrTranscriber({
      endpoint: options.funAsrEndpoint,
      mode: "2pass",
      hotwords: options.funAsrHotwords,
    })
  }

  if (options.provider === "sherpa-onnx") {
    return new SherpaOnnxTranscriber()
  }

  return new WebSpeechTranscriber()
}

export function useSpeechRecognition(options: UseSpeechRecognitionOptions) {
  const { provider, funAsrEndpoint, funAsrHotwords } = options
  const transcriber = useMemo(() => createTranscriber({
    provider,
    funAsrEndpoint,
    funAsrHotwords,
  }), [provider, funAsrEndpoint, funAsrHotwords])
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
      transcriber.stop()
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
    stop: () => {
      setError(null)
      setLastResult(null)
      transcriber.stop()
    },
    clearResult: () => setLastResult(null),
    clearError: () => setError(null),
  }
}

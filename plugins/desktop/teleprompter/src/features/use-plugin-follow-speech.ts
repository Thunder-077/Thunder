import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { SpeechProvider } from "@thunder/teleprompter-core"
import {
  createBrowserSpeechController,
  isBrowserSpeechRecognitionSupported,
} from "../adapters/browser-speech-controller"
import { pluginSpeechRuntime } from "../adapters/plugin-speech-runtime"

type PluginFollowSpeechResult = {
  text: string
  isFinal: boolean
  timestamps?: [number, number][]
}

/**
 * 插件侧先负责把麦克风 PCM 音频送进 trusted worker。
 * 实时识别后端尚未接入，所以当前仍保留手动文本提交作为过渡能力。
 */
export function usePluginFollowSpeech(provider: SpeechProvider) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [status, setStatus] = useState<"idle" | "listening" | "paused" | "stopped" | "error">("idle")
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<PluginFollowSpeechResult | null>(null)
  const [streamingActive, setStreamingActive] = useState(false)
  const [streamedSamples, setStreamedSamples] = useState(0)
  const sessionIdRef = useRef<string | null>(null)
  const statusRef = useRef<"idle" | "listening" | "paused" | "stopped" | "error">("idle")
  const browserSpeechControllerRef = useRef(
    createBrowserSpeechController({
      onResult: (result) => {
        setLastResult({
          text: result.text,
          isFinal: result.isFinal,
        })
      },
      onStatus: (nextStatus) => {
        if (nextStatus === "unsupported") {
          return
        }
        setStatus(nextStatus)
        statusRef.current = nextStatus
      },
      onError: (message) => {
        setStatus("error")
        statusRef.current = "error"
        setError(message)
      },
    })
  )
  const mediaResourcesRef = useRef<{
    stream: MediaStream | null
    audioContext: AudioContext | null
    processorNode: ScriptProcessorNode | null
    sourceNode: MediaStreamAudioSourceNode | null
  }>({
    stream: null,
    audioContext: null,
    processorNode: null,
    sourceNode: null,
  })
  const audioStreamRef = useRef<Awaited<ReturnType<typeof pluginSpeechRuntime.openSessionAudioStream>> | null>(null)

  const cleanupMediaResources = useCallback(async () => {
    const resources = mediaResourcesRef.current
    audioStreamRef.current?.close()
    audioStreamRef.current = null
    resources.processorNode?.disconnect()
    resources.sourceNode?.disconnect()
    resources.stream?.getTracks().forEach((track) => track.stop())
    await resources.audioContext?.close().catch(() => undefined)
    resources.processorNode = null
    resources.sourceNode = null
    resources.audioContext = null
    resources.stream = null
    setStreamingActive(false)
  }, [])

  const stopStreaming = useCallback(async (activeSessionId: string | null, inputFinished: boolean) => {
    if (activeSessionId && inputFinished) {
      const finalPayload = {
        sessionId: activeSessionId,
        samples: [] as number[],
        sampleRate: 16000,
        channels: 1,
        encoding: "pcm_s16le",
        inputFinished: true,
      } as const
      if (audioStreamRef.current) {
        audioStreamRef.current.writeAudio(finalPayload)
      }
    }
    await cleanupMediaResources()
  }, [cleanupMediaResources])

  const feedAudioSamples = useCallback(async (activeSessionId: string, samples: number[]) => {
    if (samples.length === 0 || sessionIdRef.current !== activeSessionId || statusRef.current !== "listening") {
      return
    }

    if (audioStreamRef.current) {
      audioStreamRef.current.writeAudio({
        sessionId: activeSessionId,
        samples,
        sampleRate: 16000,
        channels: 1,
        encoding: "pcm_s16le",
      })
      return
    }

    setStatus("error")
    statusRef.current = "error"
    setError("语音流通道尚未建立，请重新开始跟读。")
  }, [])

  const startStreaming = useCallback(async (activeSessionId: string) => {
    await cleanupMediaResources()

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Current runtime does not support microphone capture")
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 1,
      },
    })

    const audioContext = new AudioContext()
    await audioContext.resume()
    const sourceNode = audioContext.createMediaStreamSource(stream)
    const processorNode = audioContext.createScriptProcessor(4096, 1, 1)
    const inputSampleRate = audioContext.sampleRate
    const ratio = inputSampleRate / 16000
    audioStreamRef.current = await pluginSpeechRuntime.openSessionAudioStream(
      {
        sessionId: activeSessionId,
        sampleRate: 16000,
        channels: 1,
        encoding: "pcm_s16le",
      },
      {
        onResult: (result) => {
          if (sessionIdRef.current !== activeSessionId) {
            return
          }
          setStreamedSamples((current) => current + result.acceptedSamples)
          if (result.normalized) {
            setLastResult({
              text: result.normalized,
              isFinal: result.isFinal,
            })
          }
        },
        onError: (streamError) => {
          if (sessionIdRef.current !== activeSessionId) {
            return
          }
          setStatus("error")
          statusRef.current = "error"
          setError(streamError.message)
        },
      },
    )

    processorNode.onaudioprocess = (event) => {
      const channelData = event.inputBuffer.getChannelData(0)
      const outputLength = Math.floor(channelData.length / ratio)
      const samples = new Array<number>(outputLength)

      for (let index = 0; index < outputLength; index += 1) {
        const start = Math.floor(index * ratio)
        const end = Math.min(Math.floor((index + 1) * ratio), channelData.length)
        let sum = 0
        for (let cursor = start; cursor < end; cursor += 1) {
          sum += channelData[cursor]
        }
        const sample = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)))
        samples[index] = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff)
      }

      void feedAudioSamples(activeSessionId, samples)
    }

    sourceNode.connect(processorNode)
    processorNode.connect(audioContext.destination)

    mediaResourcesRef.current.stream = stream
    mediaResourcesRef.current.audioContext = audioContext
    mediaResourcesRef.current.sourceNode = sourceNode
    mediaResourcesRef.current.processorNode = processorNode
    setStreamingActive(true)
  }, [cleanupMediaResources, feedAudioSamples])

  const start = useCallback(async () => {
    setError(null)
    setLastResult(null)

    if (statusRef.current === "paused" && sessionIdRef.current) {
      try {
        if (provider === "web-speech") {
          await browserSpeechControllerRef.current.start()
        } else {
          await startStreaming(sessionIdRef.current)
        }
        setStatus("listening")
        statusRef.current = "listening"
      } catch (startError) {
        setStatus("error")
        statusRef.current = "error"
        setError(startError instanceof Error ? startError.message : String(startError))
      }
      return
    }

    setStreamedSamples(0)
    try {
      const session = await pluginSpeechRuntime.startSession({
        provider,
      })
      sessionIdRef.current = session.sessionId
      setSessionId(session.sessionId)
      setStatus(session.status)
      statusRef.current = session.status

      if (provider === "web-speech") {
        await browserSpeechControllerRef.current.start()
      } else {
        await startStreaming(session.sessionId)
      }
    } catch (startError) {
      if (sessionIdRef.current) {
        await pluginSpeechRuntime.stopSession({ sessionId: sessionIdRef.current }).catch(() => undefined)
      }
      sessionIdRef.current = null
      setSessionId(null)
      setStatus("error")
      statusRef.current = "error"
      setError(startError instanceof Error ? startError.message : String(startError))
    }
  }, [provider, startStreaming])

  const pause = useCallback(() => {
    if (provider === "web-speech") {
      browserSpeechControllerRef.current.pause()
    } else {
      void stopStreaming(sessionIdRef.current, false)
    }
    setStatus("paused")
    statusRef.current = "paused"
  }, [provider, stopStreaming])

  const stop = useCallback(() => {
    const activeSessionId = sessionIdRef.current
    void (async () => {
      if (provider === "web-speech") {
        browserSpeechControllerRef.current.stop()
      } else {
        await stopStreaming(activeSessionId, true)
      }
      if (activeSessionId) {
        await pluginSpeechRuntime.stopSession({ sessionId: activeSessionId }).catch(() => undefined)
      }
      sessionIdRef.current = null
      setSessionId(null)
      setStatus("stopped")
      statusRef.current = "stopped"
    })()
  }, [provider, stopStreaming])

  const clearResult = useCallback(() => {
    setLastResult(null)
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const submitTranscript = useCallback(async (text: string) => {
    try {
      if (!sessionId) {
        throw new Error("Speech session is not active")
      }

      const result = await pluginSpeechRuntime.submitSessionText({
        sessionId,
        text,
        isFinal: true,
      })
      setError(null)
      setLastResult({
        text: result.normalized,
        isFinal: result.isFinal,
      })
      setStatus("listening")
      statusRef.current = "listening"
    } catch (submissionError) {
      setStatus("error")
      statusRef.current = "error"
      setError(submissionError instanceof Error ? submissionError.message : String(submissionError))
    }
  }, [sessionId])

  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => () => {
    void cleanupMediaResources()
    browserSpeechControllerRef.current.dispose()
  }, [cleanupMediaResources])

  return useMemo(() => ({
    status,
    error,
    lastResult,
    isSupported: provider === "web-speech" ? isBrowserSpeechRecognitionSupported() : true,
    streamedSamples,
    streamingActive,
    start,
    pause,
    stop,
    clearResult,
    clearError,
    submitTranscript,
  }), [clearError, clearResult, error, lastResult, pause, provider, start, status, stop, streamedSamples, streamingActive, submitTranscript])
}

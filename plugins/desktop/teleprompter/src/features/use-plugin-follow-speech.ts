import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { SpeechProvider } from "@thunder/teleprompter-core"
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

  const cleanupMediaResources = useCallback(async () => {
    const resources = mediaResourcesRef.current
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
    await cleanupMediaResources()

    if (activeSessionId && inputFinished) {
      await pluginSpeechRuntime.feedSessionAudio({
        sessionId: activeSessionId,
        samples: [],
        sampleRate: 16000,
        channels: 1,
        encoding: "pcm_s16le",
        inputFinished: true,
      }).catch(() => undefined)
    }
  }, [cleanupMediaResources])

  const feedAudioSamples = useCallback(async (activeSessionId: string, samples: number[]) => {
    if (samples.length === 0 || sessionIdRef.current !== activeSessionId || statusRef.current !== "listening") {
      return
    }

    try {
      const result = await pluginSpeechRuntime.feedSessionAudio({
        sessionId: activeSessionId,
        samples,
        sampleRate: 16000,
        channels: 1,
        encoding: "pcm_s16le",
      })
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
    } catch (feedError) {
      setStatus("error")
      statusRef.current = "error"
      setError(feedError instanceof Error ? feedError.message : String(feedError))
    }
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
        await startStreaming(sessionIdRef.current)
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
    const session = await pluginSpeechRuntime.startSession({
      provider,
    })
    sessionIdRef.current = session.sessionId
    setSessionId(session.sessionId)
    setStatus(session.status)
    statusRef.current = session.status
    try {
      await startStreaming(session.sessionId)
    } catch (startError) {
      await pluginSpeechRuntime.stopSession({ sessionId: session.sessionId }).catch(() => undefined)
      sessionIdRef.current = null
      setSessionId(null)
      setStatus("error")
      statusRef.current = "error"
      setError(startError instanceof Error ? startError.message : String(startError))
    }
  }, [startStreaming])

  const pause = useCallback(() => {
    void stopStreaming(sessionIdRef.current, false)
    setStatus("paused")
    statusRef.current = "paused"
  }, [stopStreaming])

  const stop = useCallback(() => {
    const activeSessionId = sessionIdRef.current
    void (async () => {
      await stopStreaming(activeSessionId, true)
      if (activeSessionId) {
        await pluginSpeechRuntime.stopSession({ sessionId: activeSessionId }).catch(() => undefined)
      }
      sessionIdRef.current = null
      setSessionId(null)
      setStatus("stopped")
      statusRef.current = "stopped"
    })()
  }, [stopStreaming])

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
  }, [cleanupMediaResources])

  return useMemo(() => ({
    status,
    error,
    lastResult,
    isSupported: true,
    streamedSamples,
    streamingActive,
    start,
    pause,
    stop,
    clearResult,
    clearError,
    submitTranscript,
  }), [clearError, clearResult, error, lastResult, pause, start, status, stop, streamedSamples, streamingActive, submitTranscript])
}

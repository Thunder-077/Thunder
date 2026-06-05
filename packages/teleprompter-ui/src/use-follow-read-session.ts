import { useCallback, useEffect, useRef, useState } from "react"
import type { FollowStatus } from "../../teleprompter-core/src/index"

type FollowReadSpeechResult = {
  text: string
  isFinal: boolean
  timestamps?: [number, number][]
}

type FollowReadSpeechController = {
  status: string
  error: string | null
  lastResult: FollowReadSpeechResult | null
  clearError: () => void
  clearResult: () => void
  start: () => Promise<void>
  pause: () => void
  stop: () => void
}

type FollowEngineUpdate = {
  confidence: number
  isOnScript: boolean
  segmentIndex: number
  displayReadOffset: number
  status: FollowStatus
  message?: string | null
}

type FollowEngineJumpUpdate = {
  confidence: number
  isOnScript: boolean
}

type FollowReadEngine = {
  push: (text: string, isFinal: boolean, timestamps?: [number, number][]) => FollowEngineUpdate
  transitionStatus: (event: { type: "start-listening" | "pause" | "resume" | "stop" }) => void
  reset: () => void
  jump?: (selectedOffset: number) => FollowEngineJumpUpdate | undefined
}

type UseFollowReadSessionOptions = {
  speech: FollowReadSpeechController
  followEngine: FollowReadEngine | null
  canFollow: boolean
  speechProvider: "web-speech" | "sherpa-onnx"
  hasInstalledSherpaModel: boolean
}

function getIncrementalAlignmentText(text: string, previousRecognitionText: string, isFinal: boolean) {
  const current = text.trim()
  const previous = previousRecognitionText.trim()
  if (!current) return ""
  if (!previous) return current
  if (current.startsWith(previous)) {
    const suffix = current.slice(previous.length).trim()
    if (isFinal && previous.length >= 2 && Array.from(suffix).length === 1) {
      return ""
    }
    return suffix
  }
  if (!isFinal && previous.startsWith(current)) {
    return ""
  }

  return isFinal ? current : ""
}

/**
 * 收敛 follow-read 会话状态、transcript 累积和启停控制。
 */
export function useFollowReadSession({
  speech,
  followEngine,
  canFollow,
  speechProvider,
  hasInstalledSherpaModel,
}: UseFollowReadSessionOptions) {
  const [followStatus, setFollowStatus] = useState<FollowStatus>("idle")
  const [currentIndex, setCurrentIndex] = useState(0)
  const [readOffset, setReadOffset] = useState(0)
  const [confidence, setConfidence] = useState(0)
  const [isOnScript, setIsOnScript] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [finalTranscript, setFinalTranscript] = useState("")
  const [interimTranscript, setInterimTranscript] = useState("")
  const processedResultRef = useRef<object | null>(null)
  const interimAlignmentTextRef = useRef("")

  const clearRecognitionSession = useCallback(() => {
    processedResultRef.current = null
    interimAlignmentTextRef.current = ""
    setFinalTranscript("")
    setInterimTranscript("")
    speech.clearResult()
  }, [speech])

  const resetPosition = useCallback(() => {
    followEngine?.reset()
    setCurrentIndex(0)
    setReadOffset(0)
    setConfidence(0)
    setIsOnScript(false)
    setMessage(null)
    clearRecognitionSession()
  }, [clearRecognitionSession, followEngine])

  const startFollowing = useCallback(async () => {
    if (!canFollow) {
      setMessage("请先输入一篇提词稿")
      return false
    }
    if (speechProvider === "sherpa-onnx" && !hasInstalledSherpaModel) {
      setMessage("暂无可用的 Sherpa ONNX 模型，请先下载模型。")
      return false
    }

    speech.clearError()
    setMessage(null)
    setConfidence(0)
    followEngine?.transitionStatus({ type: "start-listening" })
    setFollowStatus("listening")
    await speech.start()
    return true
  }, [canFollow, followEngine, hasInstalledSherpaModel, speech, speechProvider])

  const pauseFollowing = useCallback(() => {
    speech.pause()
    followEngine?.transitionStatus({ type: "pause" })
    setFollowStatus("paused")
  }, [followEngine, speech])

  const resumeFollowing = useCallback(async () => {
    if (!canFollow) {
      setMessage("请先输入一篇提词稿")
      return false
    }

    speech.clearError()
    setMessage(null)
    followEngine?.transitionStatus({ type: "resume" })
    setFollowStatus("listening")
    await speech.start()
    return true
  }, [canFollow, followEngine, speech])

  const stopFollowing = useCallback(() => {
    speech.stop()
    followEngine?.transitionStatus({ type: "stop" })
    setFollowStatus("idle")
    setConfidence(0)
    setMessage(null)
    clearRecognitionSession()
  }, [clearRecognitionSession, followEngine, speech])

  const returnToStart = useCallback(() => {
    followEngine?.reset()
    speech.clearError()
    clearRecognitionSession()
    setCurrentIndex(0)
    setReadOffset(0)
    setConfidence(0)
    setIsOnScript(false)
    setMessage(null)
  }, [clearRecognitionSession, followEngine, speech])

  const calibrateToCharacter = useCallback((selectedIndex: number, selectedOffset: number, isMicActive: boolean) => {
    const update = followEngine?.jump?.(selectedOffset)
    const nextStatus: FollowStatus = isMicActive
      ? "listening"
      : followStatus === "paused"
        ? "paused"
        : "idle"
    setMessage(null)
    setCurrentIndex(selectedIndex)
    setReadOffset(selectedOffset)
    setConfidence(update?.confidence ?? 1)
    setIsOnScript(update?.isOnScript ?? true)
    setFollowStatus(nextStatus)
    speech.clearError()
  }, [followEngine, followStatus, speech])

  useEffect(() => {
    if (!speech.lastResult || followStatus === "paused" || followStatus === "idle") {
      return
    }

    if (processedResultRef.current === speech.lastResult) {
      return
    }
    processedResultRef.current = speech.lastResult

    if (speech.lastResult.isFinal) {
      setFinalTranscript((prev) => `${prev}${speech.lastResult!.text}`.slice(-320))
      setInterimTranscript("")
    } else {
      setInterimTranscript(speech.lastResult.text)
    }

    if (!followEngine) return
    const alignmentText = getIncrementalAlignmentText(
      speech.lastResult.text,
      interimAlignmentTextRef.current,
      speech.lastResult.isFinal,
    )
    interimAlignmentTextRef.current = speech.lastResult.isFinal ? "" : speech.lastResult.text.trim()
    if (!alignmentText) return

    const update = followEngine.push(
      alignmentText,
      speech.lastResult.isFinal,
      speech.lastResult.timestamps,
    )

    setConfidence(update.confidence)
    setIsOnScript(update.isOnScript)
    setCurrentIndex(update.segmentIndex)
    setReadOffset(update.displayReadOffset)
    setFollowStatus(update.status)
    setMessage(update.message ?? null)
  }, [followEngine, followStatus, speech.lastResult])

  return {
    followStatus,
    currentIndex,
    readOffset,
    confidence,
    isOnScript,
    message,
    finalTranscript,
    interimTranscript,
    clearRecognitionSession,
    resetPosition,
    startFollowing,
    pauseFollowing,
    resumeFollowing,
    stopFollowing,
    returnToStart,
    calibrateToCharacter,
    setCurrentIndex,
    setReadOffset,
    setConfidence,
    setIsOnScript,
    setMessage,
    setFollowStatus,
  }
}

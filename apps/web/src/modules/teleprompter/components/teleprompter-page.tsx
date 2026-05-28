"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react"
import { PageHeader } from "@/components/page-header"
import { checkFunAsrRunning, isTauriDesktop, startFunAsrService } from "@/lib/platform"
import { useSpeechRecognition } from "../hooks/use-speech-recognition"
import { createFollowEngine } from "../utils/follow-engine"
import type { FollowStatus } from "../utils/follow-state-machine"
import { segmentScript } from "../utils/script-segmenter"
import type { SpeechProvider } from "../transcribers"
import { FollowStatusPanel } from "./follow-status-panel"
import { PrompterStage } from "./prompter-stage"

function getIncrementalAlignmentText(text: string, previousInterim: string, isFinal: boolean) {
  const current = text.trim()
  const previous = previousInterim.trim()
  if (!current) return ""
  if (!previous) return current
  if (current.startsWith(previous)) {
    return current.slice(previous.length).trim()
  }
  if (!isFinal && previous.startsWith(current)) {
    return ""
  }

  // ASR interim revisions are replacements, not append-only chunks. When the
  // replacement is ambiguous, wait for the final result instead of double-counting.
  return isFinal ? current : ""
}

export function TeleprompterPage() {
  const [script, setScript] = useState("")
  const [scriptDraft, setScriptDraft] = useState("")
  const [isEditingScript, setIsEditingScript] = useState(false)
  const [fontSize, setFontSize] = useState(44)
  const [lineHeight, setLineHeight] = useState(1.65)
  const [speechProvider, setSpeechProvider] = useState<SpeechProvider>("web-speech")
  const [followStatus, setFollowStatus] = useState<FollowStatus>("idle")
  const [currentIndex, setCurrentIndex] = useState(0)
  const [readOffset, setReadOffset] = useState(0)
  const [confidence, setConfidence] = useState(0)
  const [isOnScript, setIsOnScript] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [finalTranscript, setFinalTranscript] = useState("")
  const [interimTranscript, setInterimTranscript] = useState("")
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showFunAsr] = useState(() => isTauriDesktop())
  const [funasrReady, setFunasrReady] = useState(false)
  const [funasrStarting, setFunasrStarting] = useState(false)
  const [funAsrEndpoint, setFunAsrEndpoint] = useState("ws://127.0.0.1:10095")

  const stageRef = useRef<HTMLDivElement | null>(null)
  const prompterViewportRef = useRef<HTMLDivElement | null>(null)
  const segmentRefs = useRef<Array<HTMLParagraphElement | null>>([])
  const animationFrameRef = useRef<number | null>(null)
  const processedResultRef = useRef<object | null>(null)
  const interimAlignmentTextRef = useRef("")
  const scrollTargetRef = useRef<number | null>(null)

  const speech = useSpeechRecognition({
    provider: speechProvider,
    funAsrEndpoint,
  })
  const segments = useMemo(() => segmentScript(script), [script])
  const followEngine = useMemo(() => script ? createFollowEngine(script, segments) : null, [script, segments])

  const displayTranscript = `${finalTranscript.slice(-160)}${interimTranscript}`.trim()
  const canFollow = segments.length > 0
  const isMicActive = speech.status === "listening"
  const visibleCurrentIndex = Math.min(currentIndex, Math.max(segments.length - 1, 0))
  const visibleReadOffset = Math.max(0, Math.min(readOffset, script.length))
  const visibleStatus: FollowStatus = speech.error ? "failed" : followStatus
  const visibleMessage = message ?? speech.error

  useEffect(() => {
    if (!isTauriDesktop()) return
    checkFunAsrRunning()
      .then(setFunasrReady)
      .catch(() => setFunasrReady(false))
  }, [])

  useEffect(() => {
    segmentRefs.current = segmentRefs.current.slice(0, segments.length)
  }, [segments.length])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === stageRef.current)
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange)
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange)
    }
  }, [])

  const cancelScrollAnimation = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    scrollTargetRef.current = null
  }, [])

  const clearRecognitionSession = useCallback(() => {
    processedResultRef.current = null
    interimAlignmentTextRef.current = ""
    setFinalTranscript("")
    setInterimTranscript("")
    speech.clearResult()
  }, [speech])

  const animateScrollTo = useCallback((target: number) => {
    const viewport = prompterViewportRef.current
    if (!viewport) return

    scrollTargetRef.current = target

    if (animationFrameRef.current !== null) return

    const step = () => {
      const vp = prompterViewportRef.current
      if (!vp || scrollTargetRef.current === null) {
        animationFrameRef.current = null
        return
      }

      const current = vp.scrollTop
      const dest = scrollTargetRef.current
      const distance = dest - current

      if (Math.abs(distance) < 0.5) {
        vp.scrollTop = dest
        animationFrameRef.current = null
        scrollTargetRef.current = null
        return
      }

      // rAF 插值滚动允许目标位置连续更新，避免实时跟读时原生 smooth scroll 互相打断。
      vp.scrollTop = current + distance * 0.12
      animationFrameRef.current = requestAnimationFrame(step)
    }

    animationFrameRef.current = requestAnimationFrame(step)
  }, [])

  const scrollToReadPosition = useCallback((charOffset: number, segmentIndex: number) => {
    const viewport = prompterViewportRef.current
    if (!viewport) return

    const charEl = viewport.querySelector(`[data-offset="${charOffset}"]`) as HTMLElement | null
    const segmentEl = segmentRefs.current[segmentIndex]
    const targetEl = charEl ?? segmentEl
    if (!targetEl) return

    const targetTop = targetEl.offsetTop - viewport.clientHeight / 3
    animateScrollTo(Math.max(0, targetTop))
  }, [animateScrollTo])

  useEffect(() => cancelScrollAnimation, [cancelScrollAnimation])

  const resetScriptPosition = useCallback(() => {
    followEngine?.reset()
    setCurrentIndex(0)
    setReadOffset(0)
    setConfidence(0)
    setIsOnScript(false)
    setMessage(null)
    clearRecognitionSession()
  }, [clearRecognitionSession, followEngine])

  const replaceScript = (nextScript: string) => {
    setScript(nextScript)
    setScriptDraft(nextScript)
    setIsEditingScript(false)
    resetScriptPosition()
  }

  const handlePrompterPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const pastedText = event.clipboardData.getData("text/plain").trim()
    if (!pastedText) {
      return
    }

    event.preventDefault()
    replaceScript(pastedText)
  }

  const handleDraftScriptChange = (nextScript: string) => {
    setScriptDraft(nextScript)
  }

  const beginScriptEditing = () => {
    speech.stop()
    speech.clearError()
    clearRecognitionSession()
    setFollowStatus("idle")
    setCurrentIndex(0)
    setReadOffset(0)
    setConfidence(0)
    setIsOnScript(false)
    setMessage(null)
    setScriptDraft(script)
    setIsEditingScript(true)
  }

  const commitDraftScript = () => {
    const nextScript = scriptDraft.trim()
    if (!nextScript) {
      return
    }
    if (nextScript === script) {
      setIsEditingScript(false)
      return
    }
    replaceScript(nextScript)
  }

  /* eslint-disable react-hooks/set-state-in-effect */
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
    interimAlignmentTextRef.current = speech.lastResult.isFinal ? "" : speech.lastResult.text
    if (!alignmentText) return

    const update = followEngine.push(
      alignmentText,
      speech.lastResult.isFinal,
      speech.lastResult.timestamps,
    )

    setConfidence(update.confidence)
    setIsOnScript(update.isOnScript)
    setCurrentIndex(update.segmentIndex)
    setReadOffset(update.readOffset)
    setFollowStatus(update.status)
    setMessage(update.message ?? null)
  }, [followEngine, followStatus, speech.lastResult])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (followStatus === "paused" || followStatus === "idle") {
      return
    }

    scrollToReadPosition(visibleReadOffset, visibleCurrentIndex)
  }, [followStatus, visibleCurrentIndex, visibleReadOffset, scrollToReadPosition])

  const startFollowing = async () => {
    if (!canFollow) {
      setMessage("请先输入一篇提词稿")
      return
    }

    speech.clearError()
    setMessage(null)
    setConfidence(0)
    followEngine?.transitionStatus({ type: "start-listening" })
    setFollowStatus("listening")
    await speech.start()
  }

  const pauseFollowing = () => {
    speech.pause()
    followEngine?.transitionStatus({ type: "pause" })
    setFollowStatus("paused")
  }

  const resumeFollowing = async () => {
    if (!canFollow) {
      setMessage("请先输入一篇提词稿")
      return
    }

    speech.clearError()
    setMessage(null)
    followEngine?.transitionStatus({ type: "resume" })
    setFollowStatus("listening")
    await speech.start()
  }

  const stopFollowing = () => {
    speech.stop()
    followEngine?.transitionStatus({ type: "stop" })
    setFollowStatus("idle")
    setConfidence(0)
    setMessage(null)
    clearRecognitionSession()
  }

  const returnToStart = () => {
    followEngine?.reset()
    speech.clearError()
    clearRecognitionSession()
    setCurrentIndex(0)
    setReadOffset(0)
    setConfidence(0)
    setIsOnScript(false)
    setMessage(null)
    scrollToReadPosition(0, 0)
  }

  const calibrateToCharacter = (selectedIndex: number, selectedOffset: number) => {
    const update = followEngine?.jump(selectedOffset)
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
    scrollToReadPosition(selectedOffset, selectedIndex)
  }

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === stageRef.current) {
        await document.exitFullscreen()
        return
      }

      await stageRef.current?.requestFullscreen()
    } catch {
      setMessage("当前环境无法切换全屏模式")
    }
  }

  const startFunAsr = () => {
    if (funasrStarting) return
    setFunasrStarting(true)
    setMessage("正在启动 FunASR 引擎…")
    startFunAsrService()
      .then((endpoint) => {
        setFunAsrEndpoint(endpoint)
        setSpeechProvider("funasr")
        setFunasrReady(true)
        setMessage(null)
      })
      .catch((error) => {
        setMessage(`FunASR 启动失败: ${error instanceof Error ? error.message : String(error)}`)
      })
      .finally(() => setFunasrStarting(false))
  }

  return (
    <div>
      <PageHeader
        title="提词器"
        description="桌面端使用本地 FunASR 跟读定位，纯 Web 端自动使用浏览器 Web Speech。"
      />

      <div className="grid gap-4">
        <FollowStatusPanel
          visibleStatus={visibleStatus}
          followStatus={followStatus}
          isMicActive={isMicActive}
          speechProvider={speechProvider}
          speechSupported={speech.isSupported}
          isOnScript={isOnScript}
          confidence={confidence}
          displayTranscript={displayTranscript}
          visibleMessage={visibleMessage}
          fontSize={fontSize}
          lineHeight={lineHeight}
          showFunAsr={showFunAsr}
          funasrReady={funasrReady}
          funasrStarting={funasrStarting}
          onFontSizeChange={setFontSize}
          onLineHeightChange={setLineHeight}
          onStartFollowing={() => void startFollowing()}
          onPauseFollowing={pauseFollowing}
          onResumeFollowing={() => void resumeFollowing()}
          onStopFollowing={stopFollowing}
          onReturnToStart={returnToStart}
          onStartFunAsr={startFunAsr}
          onSelectWebSpeech={() => setSpeechProvider("web-speech")}
        />

        <PrompterStage
          stageRef={stageRef}
          prompterViewportRef={prompterViewportRef}
          segmentRefs={segmentRefs}
          script={script}
          segments={segments}
          isEditingScript={isEditingScript}
          fontSize={fontSize}
          lineHeight={lineHeight}
          visibleStatus={visibleStatus}
          isMicActive={isMicActive}
          visibleCurrentIndex={visibleCurrentIndex}
          visibleReadOffset={visibleReadOffset}
          isFullscreen={isFullscreen}
          onToggleFullscreen={() => void toggleFullscreen()}
          onBeginScriptEditing={beginScriptEditing}
          onPrompterPaste={handlePrompterPaste}
          scriptDraft={scriptDraft}
          onDraftScriptChange={handleDraftScriptChange}
          onDraftScriptCommit={commitDraftScript}
          onCalibrateToCharacter={calibrateToCharacter}
        />
      </div>
    </div>
  )
}

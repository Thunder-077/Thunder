"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react"
import { Mic, Play } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { cn } from "@/lib/utils"
import {
  activateSherpaModel,
  checkFunAsrRunning,
  checkSherpaRunning,
  downloadSherpaModel,
  isTauriDesktop,
  listSherpaModels,
  startFunAsrService,
  type SherpaModel,
} from "@/lib/platform"
import { notificationStore } from "@/lib/notification-store"
import { useSpeechRecognition } from "../hooks/use-speech-recognition"
import { createFollowEngine } from "../utils/follow-engine"
import type { FollowStatus } from "../utils/follow-state-machine"
import { segmentScript } from "../utils/script-segmenter"
import type { SpeechProvider } from "../transcribers"
import { AutoScrollPanel, type AutoScrollViewOptions } from "./auto-scroll-panel"
import { FollowStatusPanel } from "./follow-status-panel"
import { PrompterStage } from "./prompter-stage"

type TeleprompterMode = "follow-read" | "auto-scroll"

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

  // ASR interim revisions are replacements, not append-only chunks. When the
  // replacement is ambiguous, wait for the final result instead of double-counting.
  return isFinal ? current : ""
}

export function TeleprompterPage() {
  const [mode, setMode] = useState<TeleprompterMode>("auto-scroll")
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
  const [showSherpa] = useState(() => isTauriDesktop())
  const [funasrReady, setFunasrReady] = useState(false)
  const [funasrStarting, setFunasrStarting] = useState(false)
  const [funAsrEndpoint, setFunAsrEndpoint] = useState("ws://127.0.0.1:10095")
  const [sherpaReady, setSherpaReady] = useState(false)
  const [sherpaBusy, setSherpaBusy] = useState(false)
  const [sherpaLoading, setSherpaLoading] = useState(false)
  const [sherpaModels, setSherpaModels] = useState<SherpaModel[]>([])
  const [selectedSherpaModelId, setSelectedSherpaModelId] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<Record<string, { percentage: number; downloadedText: string; totalText: string }>>({})
  const [autoScrollViewOptions, setAutoScrollViewOptions] = useState<AutoScrollViewOptions>({
    mirrorDisplay: false,
    highlightLine: true,
  })
  const [autoScrollActiveIndex, setAutoScrollActiveIndex] = useState(0)

  const sherpaModelsRef = useRef(sherpaModels)
  useEffect(() => {
    sherpaModelsRef.current = sherpaModels
  }, [sherpaModels])

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
  const installedSherpaModels = useMemo(
    () => sherpaModels.filter((model) => model.installed),
    [sherpaModels],
  )
  const isMicActive = speech.status === "listening"
  const visibleCurrentIndex = Math.min(currentIndex, Math.max(segments.length - 1, 0))
  const visibleReadOffset = Math.max(0, Math.min(readOffset, script.length))
  const visibleStatus: FollowStatus = speech.error ? "failed" : followStatus
  const visibleMessage = message ?? speech.error

  const syncSherpaModels = useCallback((models: SherpaModel[]) => {
    setSherpaModels(models)
    setSelectedSherpaModelId((current) => {
      if (current && models.some((model) => model.id === current)) {
        return current
      }

      const preferredModel = models.find((model) => model.active) ?? models[0] ?? null
      return preferredModel?.id ?? null
    })
  }, [])

  const refreshSherpaModels = useCallback(async () => {
    if (!isTauriDesktop()) {
      return
    }

    setSherpaLoading(true)
    try {
      const models = await listSherpaModels()
      syncSherpaModels(models)
    } catch (error) {
      setMessage(`Sherpa 模型列表加载失败: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSherpaLoading(false)
    }
  }, [syncSherpaModels])

  useEffect(() => {
    if (!isTauriDesktop()) return
    checkFunAsrRunning()
      .then(setFunasrReady)
      .catch(() => setFunasrReady(false))
    checkSherpaRunning()
      .then(setSherpaReady)
      .catch(() => setSherpaReady(false))
    const refreshTimer = window.setTimeout(() => {
      void refreshSherpaModels()
    }, 0)
    return () => window.clearTimeout(refreshTimer)
  }, [refreshSherpaModels])

  useEffect(() => {
    if (!isTauriDesktop()) return

    let unlistenProgress: (() => void) | null = null
    let unlistenInstalled: (() => void) | null = null
    let unlistenFailed: (() => void) | null = null

    const setupListeners = async () => {
      const { listen } = await import("@tauri-apps/api/event")

      unlistenProgress = await listen<{ modelId: string; percentage: number; downloaded: number; total: number; status?: string }>(
        "sherpa-download-progress",
        (event) => {
          const { modelId, percentage, downloaded, total, status } = event.payload
          const downloadedText = (downloaded / 1024 / 1024).toFixed(1) + " MB"
          const totalText = (total / 1024 / 1024).toFixed(1) + " MB"

          setDownloadProgress((prev) => ({
            ...prev,
            [modelId]: {
              percentage,
              downloadedText,
              totalText,
              status: status || "downloading"
            }
          }))

          notificationStore.updateProgress(modelId, percentage, downloaded, total)
        }
      )

      unlistenInstalled = await listen<string>("sherpa-model-installed", (event) => {
        void refreshSherpaModels()
        const modelId = event.payload

        setDownloadProgress((prev) => {
          const next = { ...prev }
          delete next[modelId]
          return next
        })

        const modelName = sherpaModelsRef.current.find((m) => m.id === modelId)?.name || modelId
        notificationStore.completeNotification(modelId, true, `模型 ${modelName} 下载并激活成功！`)
        setMessage(`模型 ${modelName} 下载并激活成功！`)
      })

      unlistenFailed = await listen<{ modelId: string; error: string }>(
        "sherpa-model-download-failed",
        (event) => {
          void refreshSherpaModels()
          const { modelId, error } = event.payload

          setDownloadProgress((prev) => {
            const next = { ...prev }
            delete next[modelId]
            return next
          })

          const modelName = sherpaModelsRef.current.find((m) => m.id === modelId)?.name || modelId
          notificationStore.completeNotification(modelId, false, `模型 ${modelName} 下载失败: ${error}`)
          setMessage(`模型 ${modelName} 下载失败: ${error}`)
        }
      )
    }

    void setupListeners()

    return () => {
      if (unlistenProgress) unlistenProgress()
      if (unlistenInstalled) unlistenInstalled()
      if (unlistenFailed) unlistenFailed()
    }
  }, [refreshSherpaModels])

  useEffect(() => {
    segmentRefs.current = segmentRefs.current.slice(0, segments.length)
  }, [segments.length])

  useEffect(() => {
    if (mode !== "auto-scroll") return
    const viewport = prompterViewportRef.current
    if (!viewport) return

    const updateActiveIndex = () => {
      const viewportMiddle = viewport.scrollTop + viewport.clientHeight / 2
      let closestIndex = 0
      let closestDistance = Number.POSITIVE_INFINITY

      segmentRefs.current.forEach((segment, index) => {
        if (!segment) return
        const segmentMiddle = segment.offsetTop + segment.offsetHeight / 2
        const distance = Math.abs(segmentMiddle - viewportMiddle)
        if (distance < closestDistance) {
          closestDistance = distance
          closestIndex = index
        }
      })

      setAutoScrollActiveIndex(closestIndex)
    }

    updateActiveIndex()
    viewport.addEventListener("scroll", updateActiveIndex, { passive: true })
    return () => viewport.removeEventListener("scroll", updateActiveIndex)
  }, [mode, segments.length])

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
    setReadOffset(update.confirmedReadOffset)
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
    if (speechProvider === "sherpa-onnx" && installedSherpaModels.length === 0) {
      setMessage("暂无可用的 Sherpa ONNX 模型，请先下载模型。")
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

  const activateSelectedSherpaModel = async () => {
    if (!selectedSherpaModelId) {
      setMessage("请先选择一个 sherpa-onnx 模型")
      return
    }

    setSherpaBusy(true)
    try {
      const models = await activateSherpaModel(selectedSherpaModelId)
      syncSherpaModels(models)
      setMessage(null)
    } catch (error) {
      setMessage(`Sherpa 模型激活失败: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSherpaBusy(false)
    }
  }

  const downloadSelectedSherpaModel = async () => {
    if (!selectedSherpaModelId) {
      setMessage("请先选择一个 sherpa-onnx 模型")
      return
    }

    const modelName = sherpaModels.find((m) => m.id === selectedSherpaModelId)?.name || selectedSherpaModelId

    notificationStore.addNotificationWithId(selectedSherpaModelId, {
      title: "下载 Sherpa 模型",
      description: `准备下载并激活 ${modelName}…`,
      type: "progress",
      percentage: 0,
      status: "downloading",
    })

    setSherpaBusy(true)
    setMessage("已在后台启动模型下载，您可在下方模型按钮上实时查看进度。")
    try {
      const models = await downloadSherpaModel(selectedSherpaModelId)
      syncSherpaModels(models)
    } catch (error) {
      notificationStore.completeNotification(
        selectedSherpaModelId,
        false,
        `Sherpa 模型启动下载失败: ${error instanceof Error ? error.message : String(error)}`
      )
      setMessage(`Sherpa 模型启动下载失败: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSherpaBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="提词器"
      />

      <div className="grid gap-4">
        {/* ── 模式切换 Tab ── */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("follow-read")}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-5 py-2 text-sm font-medium transition-all",
              mode === "follow-read"
                ? "border-primary bg-primary/8 text-primary"
                : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
            )}
          >
            <Mic className="h-4 w-4" />
            跟读模式
          </button>
          <button
            type="button"
            onClick={() => setMode("auto-scroll")}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-5 py-2 text-sm font-medium transition-all",
              mode === "auto-scroll"
                ? "border-primary bg-primary/8 text-primary"
                : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
            )}
          >
            <Play className="h-4 w-4" />
            滚动模式
          </button>
        </div>

        {/* ── 模式对应面板 ── */}
        {mode === "follow-read" ? (
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
            showSherpa={showSherpa}
            funasrReady={funasrReady}
            funasrStarting={funasrStarting}
            sherpaReady={sherpaReady}
            sherpaBusy={sherpaBusy}
            sherpaLoading={sherpaLoading}
            sherpaModels={sherpaModels}
            selectedSherpaModelId={selectedSherpaModelId}
            downloadProgress={downloadProgress}
            onFontSizeChange={setFontSize}
            onLineHeightChange={setLineHeight}
            onStartFollowing={() => void startFollowing()}
            onPauseFollowing={pauseFollowing}
            onResumeFollowing={() => void resumeFollowing()}
            onStopFollowing={stopFollowing}
            onReturnToStart={returnToStart}
            onStartFunAsr={startFunAsr}
            onSelectSherpa={() => setSpeechProvider("sherpa-onnx")}
            onSelectWebSpeech={() => setSpeechProvider("web-speech")}
            onSelectSherpaModel={setSelectedSherpaModelId}
            onRefreshSherpaModels={() => void refreshSherpaModels()}
            onDownloadSelectedSherpaModel={() => void downloadSelectedSherpaModel()}
            onActivateSelectedSherpaModel={() => void activateSelectedSherpaModel()}
          />
        ) : (
          <AutoScrollPanel
            fontSize={fontSize}
            lineHeight={lineHeight}
            canScroll={segments.length > 0 && !isEditingScript}
            prompterViewportRef={prompterViewportRef}
            onFontSizeChange={setFontSize}
            onLineHeightChange={setLineHeight}
            onViewOptionsChange={setAutoScrollViewOptions}
          />
        )}

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
          mode={mode}
          autoScrollMirrorDisplay={autoScrollViewOptions.mirrorDisplay}
          autoScrollHighlightLine={autoScrollViewOptions.highlightLine}
          autoScrollActiveIndex={autoScrollActiveIndex}
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

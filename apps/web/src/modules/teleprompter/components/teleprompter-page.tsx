"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react"
import { Mic, Play } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { cn } from "@/lib/utils"
import {
  activateSherpaModel,
  checkSherpaRunning,
  downloadSherpaModel,
  isTauriDesktop,
  listSherpaModels,
  type SherpaModel,
} from "@/lib/platform"
import { notificationStore } from "@/lib/notification-store"
import { useAnimatedReadOffset } from "../hooks/use-animated-read-offset"
import { useSpeechRecognition } from "../hooks/use-speech-recognition"
import { createFollowEngine } from "../utils/follow-engine"
import type { FollowStatus } from "../utils/follow-state-machine"
import { segmentScript } from "../utils/script-segmenter"
import { shouldShowTeleprompterExperimentalInsights } from "../utils/teleprompter-env"
import {
  readTeleprompterStorage,
  writeTeleprompterStorage,
} from "../utils/teleprompter-storage"
import type { SpeechProvider } from "../transcribers"
import { AutoScrollPanel, type AutoScrollPanelHandle, type AutoScrollViewOptions } from "./auto-scroll-panel"
import { AsrDebugOverlay } from "./asr-debug-overlay"
import { FollowStatusPanel } from "./follow-status-panel"
import { PrompterStage } from "./prompter-stage"

type TeleprompterMode = "follow-read" | "auto-scroll"

const READING_ANCHOR_RATIO = 1 / 3
const TOP_EDGE_ANCHOR_BUFFER = 24
// Keep the stage visually dominant while still reserving space for the header and controls.
const TELEPROMPTER_PAGE_MIN_HEIGHT = "42rem"
const TELEPROMPTER_PAGE_HEIGHT = "calc(100dvh - var(--desktop-titlebar-height, 38px) - 4rem)"

function getDynamicReadingAnchorTop(viewport: HTMLElement) {
  const stableAnchorTop = viewport.clientHeight * READING_ANCHOR_RATIO
  return Math.min(stableAnchorTop, viewport.scrollTop + TOP_EDGE_ANCHOR_BUFFER)
}

function getReadPositionScrollTarget(viewport: HTMLElement, targetEl: HTMLElement) {
  const stableAnchorTop = viewport.clientHeight * READING_ANCHOR_RATIO
  const targetTop = targetEl.offsetTop
  if (targetTop <= stableAnchorTop) {
    return 0
  }

  const targetMiddle = targetTop + targetEl.offsetHeight / 2
  const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
  return Math.max(0, Math.min(maxScrollTop, targetMiddle - stableAnchorTop))
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

  // ASR interim revisions are replacements, not append-only chunks. When the
  // replacement is ambiguous, wait for the final result instead of double-counting.
  return isFinal ? current : ""
}

export function TeleprompterPage() {
  const showExperimentalInsights = shouldShowTeleprompterExperimentalInsights()

  const [mode, setMode] = useState<TeleprompterMode>("follow-read")
  const [script, setScript] = useState("")
  const [scriptDraft, setScriptDraft] = useState("")
  const [isEditingScript, setIsEditingScript] = useState(false)
  const [fontSize, setFontSize] = useState(44)
  const [lineHeight, setLineHeight] = useState(1.65)
  const [enablePrediction, setEnablePrediction] = useState(false)
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
  const [showSherpa] = useState(() => isTauriDesktop())
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
  const [autoScrollStatus, setAutoScrollStatus] = useState<"idle" | "countdown" | "scrolling" | "paused">("idle")
  const [readOffsetSnapKey, setReadOffsetSnapKey] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)

  const sherpaModelsRef = useRef(sherpaModels)
  useEffect(() => {
    sherpaModelsRef.current = sherpaModels
  }, [sherpaModels])

  const stageRef = useRef<HTMLDivElement | null>(null)
  const autoScrollPanelRef = useRef<AutoScrollPanelHandle>(null)
  const prompterViewportRef = useRef<HTMLDivElement | null>(null)
  const segmentRefs = useRef<Array<HTMLParagraphElement | null>>([])
  const animationFrameRef = useRef<number | null>(null)
  const processedResultRef = useRef<object | null>(null)
  const interimAlignmentTextRef = useRef("")
  const scrollTargetRef = useRef<number | null>(null)
  const storageHydratedRef = useRef(false)
  const storageSaveTimerRef = useRef<number | null>(null)
  const lastSavedStorageSnapshotRef = useRef<string | null>(null)
  const userScrollingRef = useRef(false)
  const userScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pausedScrollTopRef = useRef<number | null>(null)
  const prevAutoScrollIndexRef = useRef<number | null>(null)
  useEffect(() => {
    const viewport = prompterViewportRef.current
    if (!viewport) return

    setViewportHeight(viewport.clientHeight)

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportHeight(entry.target.clientHeight)
      }
    })

    resizeObserver.observe(viewport)
    return () => resizeObserver.disconnect()
  }, [])

  const speech = useSpeechRecognition({
    provider: speechProvider,
  })
  const segments = useMemo(() => segmentScript(script), [script])
  const followEngine = useMemo(() => script ? createFollowEngine(script, segments, { enablePrediction }) : null, [script, segments, enablePrediction])

  const displayTranscript = `${finalTranscript.slice(-160)}${interimTranscript}`.trim()
  const canFollow = segments.length > 0
  const installedSherpaModels = useMemo(
    () => sherpaModels.filter((model) => model.installed),
    [sherpaModels],
  )
  const isMicActive = speech.status === "listening"
  const visibleCurrentIndex = Math.min(currentIndex, Math.max(segments.length - 1, 0))
  const isFollowAnimationActive = mode === "follow-read" && followStatus !== "idle"
  const animatedReadOffset = useAnimatedReadOffset(readOffset, isFollowAnimationActive, readOffsetSnapKey)
  const visibleReadOffset = Math.max(0, Math.min(animatedReadOffset, script.length))
  const scrollReadOffset = Math.max(0, Math.min(readOffset, script.length))
  const visibleStatus: FollowStatus = speech.error ? "failed" : followStatus
  const visibleMessage = message ?? speech.error
  const storageSnapshot = useMemo(
    () => JSON.stringify({ script, scriptDraft }),
    [script, scriptDraft],
  )

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
    let cancelled = false

    const hydratePersistedScript = async () => {
      const persisted = await readTeleprompterStorage()
      if (cancelled) {
        return
      }

      storageHydratedRef.current = true
      if (!persisted) {
        return
      }

      lastSavedStorageSnapshotRef.current = JSON.stringify({
        script: persisted.script,
        scriptDraft: persisted.scriptDraft,
      })

      setScript((current) => current || persisted.script)
      setScriptDraft((current) => current || persisted.scriptDraft)
    }

    void hydratePersistedScript()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!storageHydratedRef.current) {
      return
    }

    if (storageSaveTimerRef.current !== null) {
      clearTimeout(storageSaveTimerRef.current)
      storageSaveTimerRef.current = null
    }

    if (storageSnapshot === lastSavedStorageSnapshotRef.current) {
      return
    }

    storageSaveTimerRef.current = window.setTimeout(() => {
      storageSaveTimerRef.current = null
      if (storageSnapshot === lastSavedStorageSnapshotRef.current) {
        return
      }

      void (async () => {
        await writeTeleprompterStorage({ script, scriptDraft })
        lastSavedStorageSnapshotRef.current = storageSnapshot
      })()
    }, 300)

    return () => {
      if (storageSaveTimerRef.current !== null) {
        clearTimeout(storageSaveTimerRef.current)
        storageSaveTimerRef.current = null
      }
    }
  }, [script, scriptDraft, storageSnapshot])

  useEffect(() => {
    if (mode !== "auto-scroll") return
    const viewport = prompterViewportRef.current
    if (!viewport) return

    const updateActiveIndex = () => {
      const viewportAnchor = viewport.scrollTop + getDynamicReadingAnchorTop(viewport)
      let closestIndex = 0
      let closestDistance = Number.POSITIVE_INFINITY

      segmentRefs.current.forEach((segment, index) => {
        if (!segment) return
        const segmentMiddle = segment.offsetTop + segment.offsetHeight / 2
        const distance = Math.abs(segmentMiddle - viewportAnchor)
        if (distance < closestDistance) {
          closestDistance = distance
          closestIndex = index
        }
      })

      if (autoScrollStatus !== "scrolling") {
        prevAutoScrollIndexRef.current = null
        setAutoScrollActiveIndex(closestIndex)
        // If the user manually scrolls while paused/idle, reset pausedScrollTopRef so we start from here
        pausedScrollTopRef.current = null
        return
      }

      prevAutoScrollIndexRef.current = closestIndex
      setAutoScrollActiveIndex(closestIndex)
    }

    updateActiveIndex()
    viewport.addEventListener("scroll", updateActiveIndex, { passive: true })
    return () => viewport.removeEventListener("scroll", updateActiveIndex)
  }, [mode, segments.length, autoScrollStatus])

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

    const targetTop = getReadPositionScrollTarget(viewport, targetEl)
    if (mode === "auto-scroll") {
      cancelScrollAnimation()
      viewport.scrollTop = targetTop
    } else {
      animateScrollTo(targetTop)
    }
  }, [animateScrollTo, mode, cancelScrollAnimation])

  const clearUserScrollLock = useCallback(() => {
    userScrollingRef.current = false
    if (userScrollTimeoutRef.current !== null) {
      clearTimeout(userScrollTimeoutRef.current)
      userScrollTimeoutRef.current = null
    }
  }, [])

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
    setReadOffset(update.displayReadOffset)
    setFollowStatus(update.status)
    setMessage(update.message ?? null)
  }, [followEngine, followStatus, speech.lastResult])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (followStatus === "paused" || followStatus === "idle") {
      return
    }
    if (userScrollingRef.current) return

    scrollToReadPosition(scrollReadOffset, visibleCurrentIndex)
  }, [followStatus, visibleCurrentIndex, scrollReadOffset, scrollToReadPosition])

  // 监听用户手动滚动，暂时挂起自动跟随滚动
  useEffect(() => {
    const viewport = prompterViewportRef.current
    if (!viewport) return

    const onUserScroll = () => {
      // 无论处于何种状态，用户手动滚动时都应取消正在运行的滚动动画
      cancelScrollAnimation()

      if (followStatus === "idle" || followStatus === "paused") return

      userScrollingRef.current = true

      if (userScrollTimeoutRef.current !== null) {
        clearTimeout(userScrollTimeoutRef.current)
      }
      userScrollTimeoutRef.current = setTimeout(() => {
        userScrollingRef.current = false
        userScrollTimeoutRef.current = null
      }, 3000)
    }

    viewport.addEventListener("wheel", onUserScroll, { passive: true })
    viewport.addEventListener("touchstart", onUserScroll, { passive: true })

    return () => {
      viewport.removeEventListener("wheel", onUserScroll)
      viewport.removeEventListener("touchstart", onUserScroll)
      clearUserScrollLock()
    }
  }, [followStatus, cancelScrollAnimation, clearUserScrollLock])

  // 跟读停止或暂停时释放滚动锁
  useEffect(() => {
    if (followStatus === "idle" || followStatus === "paused") {
      clearUserScrollLock()
    }
  }, [followStatus, clearUserScrollLock])

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

  const handleAutoScrollStop = () => {
    setCurrentIndex(0)
    setReadOffset(0)
    setReadOffsetSnapKey((k) => k + 1)
    setAutoScrollActiveIndex(0)
  }

  const handleAutoScrollReset = () => {
    setCurrentIndex(0)
    setReadOffset(0)
    setReadOffsetSnapKey((k) => k + 1)
    setAutoScrollActiveIndex(0)
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
    setAutoScrollActiveIndex(selectedIndex)
    setReadOffset(selectedOffset)
    setReadOffsetSnapKey((k) => k + 1)
    setConfidence(update?.confidence ?? 1)
    setIsOnScript(update?.isOnScript ?? true)
    setFollowStatus(nextStatus)
    speech.clearError()
    clearUserScrollLock()
    pausedScrollTopRef.current = null
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
    <div
      className="flex flex-col gap-4"
      style={{
        minHeight: TELEPROMPTER_PAGE_MIN_HEIGHT,
        height: TELEPROMPTER_PAGE_HEIGHT,
      }}
    >
      <PageHeader title="提词器" />

      {/* ── 模式切换 Tab ── */}
      <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => {
              setMode("follow-read")
              setAutoScrollActiveIndex(0)
            }}
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
            onClick={() => {
              setMode("auto-scroll")
              setCurrentIndex(0)
              setReadOffset(0)
              setReadOffsetSnapKey((k) => k + 1)
            }}
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
      <div className="shrink-0">
        {mode === "follow-read" ? (
          <FollowStatusPanel
            visibleStatus={visibleStatus}
            followStatus={followStatus}
            isMicActive={isMicActive}
            speechProvider={speechProvider}
            speechSupported={speech.isSupported}
            fontSize={fontSize}
            lineHeight={lineHeight}
            enablePrediction={enablePrediction}
            showSherpa={showSherpa}
            sherpaReady={sherpaReady}
            sherpaBusy={sherpaBusy}
            sherpaLoading={sherpaLoading}
            sherpaModels={sherpaModels}
            selectedSherpaModelId={selectedSherpaModelId}
            downloadProgress={downloadProgress}
            onFontSizeChange={setFontSize}
            onLineHeightChange={setLineHeight}
            onEnablePredictionChange={setEnablePrediction}
            onStartFollowing={() => void startFollowing()}
            onPauseFollowing={pauseFollowing}
            onResumeFollowing={() => void resumeFollowing()}
            onStopFollowing={stopFollowing}
            onReturnToStart={returnToStart}
            onSelectSherpa={() => setSpeechProvider("sherpa-onnx")}
            onSelectWebSpeech={() => setSpeechProvider("web-speech")}
            onSelectSherpaModel={setSelectedSherpaModelId}
            onRefreshSherpaModels={() => void refreshSherpaModels()}
            onDownloadSelectedSherpaModel={() => void downloadSelectedSherpaModel()}
            onActivateSelectedSherpaModel={() => void activateSelectedSherpaModel()}
          />
        ) : (
          <AutoScrollPanel
            ref={autoScrollPanelRef}
            fontSize={fontSize}
            lineHeight={lineHeight}
            canScroll={segments.length > 0 && !isEditingScript}
            prompterViewportRef={prompterViewportRef}
            onFontSizeChange={setFontSize}
            onLineHeightChange={setLineHeight}
            onViewOptionsChange={setAutoScrollViewOptions}
            onStatusChange={setAutoScrollStatus}
            onStop={handleAutoScrollStop}
            onReset={handleAutoScrollReset}
            onStart={cancelScrollAnimation}
            pausedScrollTopRef={pausedScrollTopRef}
          />
        )}
      </div>

      <div className="min-h-0 flex-1">
        <PrompterStage
          stageRef={stageRef}
          prompterViewportRef={prompterViewportRef}
          segmentRefs={segmentRefs}
          script={script}
          segments={segments}
          isEditingScript={isEditingScript}
          fontSize={fontSize}
          lineHeight={lineHeight}
          viewportHeight={viewportHeight}
          visibleStatus={visibleStatus}
          isMicActive={isMicActive}
          visibleCurrentIndex={visibleCurrentIndex}
          visibleReadOffset={visibleReadOffset}
          isFullscreen={isFullscreen}
          mode={mode}
          autoScrollMirrorDisplay={autoScrollViewOptions.mirrorDisplay}
          autoScrollHighlightLine={autoScrollViewOptions.highlightLine}
          autoScrollActiveIndex={autoScrollActiveIndex}
          followStatus={followStatus}
          autoScrollStatus={autoScrollStatus}
          onToggleFullscreen={() => void toggleFullscreen()}
          onBeginScriptEditing={beginScriptEditing}
          onPrompterPaste={handlePrompterPaste}
          scriptDraft={scriptDraft}
          onDraftScriptChange={handleDraftScriptChange}
          onDraftScriptCommit={commitDraftScript}
          onCalibrateToCharacter={calibrateToCharacter}
          onStartFollowing={() => void startFollowing()}
          onPauseFollowing={pauseFollowing}
          onResumeFollowing={() => void resumeFollowing()}
          onStopFollowing={stopFollowing}
          onReturnToStart={returnToStart}
          onAutoScrollStart={() => autoScrollPanelRef.current?.start()}
          onAutoScrollPause={() => autoScrollPanelRef.current?.pause()}
          onAutoScrollStop={() => autoScrollPanelRef.current?.stop()}
          onAutoScrollReset={() => autoScrollPanelRef.current?.reset()}
        />
      </div>

      {showExperimentalInsights && mode === "follow-read" && (
        <AsrDebugOverlay
          visibleStatus={visibleStatus}
          speechSupported={speech.isSupported}
          isOnScript={isOnScript}
          confidence={confidence}
          displayTranscript={displayTranscript}
          visibleMessage={visibleMessage}
        />
      )}
    </div>
  )
}

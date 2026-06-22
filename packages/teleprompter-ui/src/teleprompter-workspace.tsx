"use client"

import { Mic, Play } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type ReactNode } from "react"
import {
  createFollowEngine,
  segmentScript,
  type FollowStatus,
  type SpeechProvider,
  type TeleprompterStoragePayload,
} from "../../teleprompter-core/src/index"
import { useAnimatedReadOffset } from "./use-animated-read-offset"
import {
  type AutoScrollPanelHandle,
  type AutoScrollViewOptions,
  AutoScrollPanel,
} from "./auto-scroll-panel"
import { AsrDebugOverlay } from "./asr-debug-overlay"
import { FollowStatusPanel } from "./follow-status-panel"
import { PrompterStage } from "./prompter-stage"
import type { TeleprompterSpeechDownloadProgress, TeleprompterSpeechModel } from "./speech-ui-types"
import { Button, cn } from "@thunder/ui"
import { type FollowReadSpeechController, useFollowReadSession } from "./use-follow-read-session"
import { usePersistedTeleprompterDocument } from "./use-persisted-document"
import { useTeleprompterDocumentSession } from "./use-document-session"

type TeleprompterMode = "follow-read" | "auto-scroll"

export type TeleprompterDocumentIO = {
  readDocument: () => Promise<TeleprompterStoragePayload | null>
  writeDocument: (input: { script: string; scriptDraft: string }) => Promise<void>
}

export type TeleprompterSherpaRuntime = {
  supportsSherpa(): boolean
  checkSherpaReady(): Promise<boolean>
  listSherpaModels(): Promise<TeleprompterSpeechModel[]>
  downloadSherpaModel(modelId: string): Promise<TeleprompterSpeechModel[]>
  activateSherpaModel(modelId: string): Promise<TeleprompterSpeechModel[]>
  subscribeSherpaModelProgress?: (
    handler: (event: { modelId: string; percentage: number; downloaded: number; total: number; status?: string }) => void,
  ) => Promise<() => void>
  subscribeSherpaModelInstalled?: (handler: (modelId: string) => void) => Promise<() => void>
  subscribeSherpaModelDownloadFailed?: (
    handler: (event: { modelId: string; error: string }) => void,
  ) => Promise<() => void>
  notifySherpaDownloadQueued?: (modelId: string, modelName: string) => void
  notifySherpaDownloadProgress?: (modelId: string, percentage: number, downloaded: number, total: number) => void
  notifySherpaDownloadCompleted?: (modelId: string, modelName: string) => void
  notifySherpaDownloadFailed?: (modelId: string, modelName: string, error: string) => void
}

type TeleprompterWorkspaceProps = {
  header: ReactNode
  speech: FollowReadSpeechController
  speechProvider: SpeechProvider
  onSpeechProviderChange: (provider: SpeechProvider) => void
  sherpaRuntime?: TeleprompterSherpaRuntime
  documentIO: TeleprompterDocumentIO
  showExperimentalInsights?: boolean
  minHeight?: string
  height?: string
}

const READING_ANCHOR_RATIO = 1 / 3
const TOP_EDGE_ANCHOR_BUFFER = 24

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

function createDownloadProgressView(downloaded: number, total: number) {
  const formatMegabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return {
    downloadedText: formatMegabytes(downloaded),
    totalText: formatMegabytes(total),
  }
}

export function TeleprompterWorkspace({
  header,
  speech,
  speechProvider,
  onSpeechProviderChange,
  sherpaRuntime,
  documentIO,
  showExperimentalInsights = false,
  minHeight = "42rem",
  height = "calc(100dvh - var(--desktop-titlebar-height, 38px) - 4rem)",
}: TeleprompterWorkspaceProps) {
  const showSherpa = sherpaRuntime?.supportsSherpa() ?? false
  const [mode, setMode] = useState<TeleprompterMode>("follow-read")
  const {
    script,
    scriptDraft,
    isEditingScript,
    hydrateScript,
    replaceScript,
    beginEditing,
    commitDraft,
    setScriptDraft,
  } = useTeleprompterDocumentSession()
  const [fontSize, setFontSize] = useState(44)
  const [lineHeight, setLineHeight] = useState(1.65)
  const [enablePrediction, setEnablePrediction] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [sherpaReady, setSherpaReady] = useState(false)
  const [sherpaBusy, setSherpaBusy] = useState(false)
  const [sherpaLoading, setSherpaLoading] = useState(false)
  const [sherpaModels, setSherpaModels] = useState<TeleprompterSpeechModel[]>([])
  const [selectedSherpaModelId, setSelectedSherpaModelId] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<TeleprompterSpeechDownloadProgress>({})
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
  const scrollTargetRef = useRef<number | null>(null)
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

  const scriptSegments = useMemo(() => segmentScript(script), [script])
  const followEngine = useMemo(
    () => (script ? createFollowEngine(script, scriptSegments, { enablePrediction }) : null),
    [enablePrediction, script, scriptSegments],
  )
  const installedSherpaModels = useMemo(
    () => sherpaModels.filter((model) => model.installed),
    [sherpaModels],
  )

  const {
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
  } = useFollowReadSession({
    speech,
    followEngine,
    canFollow: scriptSegments.length > 0,
    speechProvider,
    hasInstalledSherpaModel: installedSherpaModels.length > 0,
  })

  const displayTranscript = `${finalTranscript.slice(-160)}${interimTranscript}`.trim()
  const isMicActive = speech.status === "listening"
  const visibleCurrentIndex = Math.min(currentIndex, Math.max(scriptSegments.length - 1, 0))
  const isFollowAnimationActive = mode === "follow-read" && followStatus !== "idle"
  const animatedReadOffset = useAnimatedReadOffset(readOffset, isFollowAnimationActive, readOffsetSnapKey)
  const visibleReadOffset = Math.max(0, Math.min(animatedReadOffset, script.length))
  const scrollReadOffset = Math.max(0, Math.min(readOffset, script.length))
  const visibleStatus: FollowStatus = speech.error ? "failed" : followStatus
  const visibleMessage = message ?? speech.error

  const handleHydrateDocument = useCallback((persisted: { script: string; scriptDraft: string }) => {
    hydrateScript(persisted.script, persisted.scriptDraft)
  }, [hydrateScript])

  usePersistedTeleprompterDocument({
    snapshot: { script, scriptDraft },
    readDocument: documentIO.readDocument,
    writeDocument: documentIO.writeDocument,
    onHydrate: handleHydrateDocument,
  })

  const syncSherpaModels = useCallback((models: TeleprompterSpeechModel[]) => {
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
    if (!sherpaRuntime?.supportsSherpa()) return
    setSherpaLoading(true)
    try {
      const models = await sherpaRuntime.listSherpaModels()
      syncSherpaModels(models)
    } catch (error) {
      setMessage(`Sherpa 模型列表加载失败: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSherpaLoading(false)
    }
  }, [setMessage, sherpaRuntime, syncSherpaModels])

  useEffect(() => {
    if (!sherpaRuntime?.supportsSherpa()) return
    sherpaRuntime.checkSherpaReady().then(setSherpaReady).catch(() => setSherpaReady(false))
    const refreshTimer = window.setTimeout(() => {
      void refreshSherpaModels()
    }, 0)
    return () => window.clearTimeout(refreshTimer)
  }, [refreshSherpaModels, sherpaRuntime])

  useEffect(() => {
    if (!sherpaRuntime?.supportsSherpa()) return
    let unlistenProgress: (() => void) | null = null
    let unlistenInstalled: (() => void) | null = null
    let unlistenFailed: (() => void) | null = null

    const setupListeners = async () => {
      unlistenProgress = await sherpaRuntime.subscribeSherpaModelProgress?.((event) => {
        const { downloadedText, totalText } = createDownloadProgressView(event.downloaded, event.total)
        setDownloadProgress((prev) => ({
          ...prev,
          [event.modelId]: {
            percentage: event.percentage,
            downloadedText,
            totalText,
            status: event.status || "downloading",
          },
        }))
        sherpaRuntime.notifySherpaDownloadProgress?.(event.modelId, event.percentage, event.downloaded, event.total)
      }) ?? null

      unlistenInstalled = await sherpaRuntime.subscribeSherpaModelInstalled?.((modelId) => {
        void refreshSherpaModels()
        setDownloadProgress((prev) => {
          const next = { ...prev }
          delete next[modelId]
          return next
        })
        const modelName = sherpaModelsRef.current.find((m) => m.id === modelId)?.name || modelId
        sherpaRuntime.notifySherpaDownloadCompleted?.(modelId, modelName)
      }) ?? null

      unlistenFailed = await sherpaRuntime.subscribeSherpaModelDownloadFailed?.((event) => {
        void refreshSherpaModels()
        setDownloadProgress((prev) => {
          const next = { ...prev }
          delete next[event.modelId]
          return next
        })
        const modelName = sherpaModelsRef.current.find((m) => m.id === event.modelId)?.name || event.modelId
        sherpaRuntime.notifySherpaDownloadFailed?.(event.modelId, modelName, event.error)
        setMessage(`模型 ${modelName} 下载失败: ${event.error}`)
      }) ?? null
    }

    void setupListeners()
    return () => {
      if (unlistenProgress) unlistenProgress()
      if (unlistenInstalled) unlistenInstalled()
      if (unlistenFailed) unlistenFailed()
    }
  }, [refreshSherpaModels, sherpaRuntime, setMessage])

  useEffect(() => {
    segmentRefs.current = segmentRefs.current.slice(0, scriptSegments.length)
  }, [scriptSegments.length])

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
        pausedScrollTopRef.current = null
        return
      }

      prevAutoScrollIndexRef.current = closestIndex
      setAutoScrollActiveIndex(closestIndex)
    }

    updateActiveIndex()
    viewport.addEventListener("scroll", updateActiveIndex, { passive: true })
    return () => viewport.removeEventListener("scroll", updateActiveIndex)
  }, [autoScrollStatus, mode])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === stageRef.current)
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange)
  }, [])

  const cancelScrollAnimation = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    scrollTargetRef.current = null
  }, [])

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
  }, [animateScrollTo, cancelScrollAnimation, mode])

  const clearUserScrollLock = useCallback(() => {
    userScrollingRef.current = false
    if (userScrollTimeoutRef.current !== null) {
      clearTimeout(userScrollTimeoutRef.current)
      userScrollTimeoutRef.current = null
    }
  }, [])

  useEffect(() => cancelScrollAnimation, [cancelScrollAnimation])

  const handlePrompterPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const pastedText = event.clipboardData.getData("text/plain").trim()
    if (!pastedText) return
    event.preventDefault()
    replaceScript(pastedText, {
      onReplaced: () => resetPosition(),
    })
  }

  const beginScriptEditing = () => {
    beginEditing({
      onBeforeEdit: () => {
        speech.stop()
        speech.clearError()
        clearRecognitionSession()
        setFollowStatus("idle")
        setCurrentIndex(0)
        setReadOffset(0)
        setConfidence(0)
        setIsOnScript(false)
        setMessage(null)
      },
    })
  }

  const commitDraftScript = () => {
    commitDraft({
      onCommitted: () => resetPosition(),
    })
  }

  useEffect(() => {
    if (followStatus === "paused" || followStatus === "idle") return
    if (userScrollingRef.current) return
    scrollToReadPosition(scrollReadOffset, visibleCurrentIndex)
  }, [followStatus, scrollReadOffset, scrollToReadPosition, visibleCurrentIndex])

  useEffect(() => {
    const viewport = prompterViewportRef.current
    if (!viewport) return
    const onUserScroll = () => {
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
  }, [cancelScrollAnimation, clearUserScrollLock, followStatus])

  useEffect(() => {
    if (followStatus === "idle" || followStatus === "paused") {
      clearUserScrollLock()
    }
  }, [clearUserScrollLock, followStatus])

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

  const handleCalibrateToCharacter = useCallback((selectedIndex: number, selectedOffset: number) => {
    calibrateToCharacter(selectedIndex, selectedOffset, isMicActive)
    setAutoScrollActiveIndex(selectedIndex)
    setReadOffsetSnapKey((k) => k + 1)
    clearUserScrollLock()
    pausedScrollTopRef.current = null
    scrollToReadPosition(selectedOffset, selectedIndex)
  }, [calibrateToCharacter, clearUserScrollLock, isMicActive, scrollToReadPosition])

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
    if (!selectedSherpaModelId || !sherpaRuntime) {
      setMessage("请先选择一个 sherpa-onnx 模型")
      return
    }

    setSherpaBusy(true)
    try {
      const models = await sherpaRuntime.activateSherpaModel(selectedSherpaModelId)
      syncSherpaModels(models)
      setMessage(null)
    } catch (error) {
      setMessage(`Sherpa 模型激活失败: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSherpaBusy(false)
    }
  }

  const downloadSelectedSherpaModel = async () => {
    if (!selectedSherpaModelId || !sherpaRuntime) {
      setMessage("请先选择一个 sherpa-onnx 模型")
      return
    }

    const modelName = sherpaModels.find((m) => m.id === selectedSherpaModelId)?.name || selectedSherpaModelId
    sherpaRuntime.notifySherpaDownloadQueued?.(selectedSherpaModelId, modelName)

    setSherpaBusy(true)
    try {
      const models = await sherpaRuntime.downloadSherpaModel(selectedSherpaModelId)
      syncSherpaModels(models)
    } catch (error) {
      sherpaRuntime.notifySherpaDownloadFailed?.(
        selectedSherpaModelId,
        modelName,
        error instanceof Error ? error.message : String(error),
      )
      setMessage(`Sherpa 模型启动下载失败: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSherpaBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-background p-4" style={{ minHeight, height }}>
      {header}

      <div className="flex shrink-0 gap-2 pl-0.5">
        <Button
          variant="outline"
          onClick={() => {
            setMode("follow-read")
            setAutoScrollActiveIndex(0)
          }}
          className={cn(
            "px-5 py-2 text-sm font-medium",
            mode === "follow-read"
              ? "border-primary bg-primary/8 text-primary hover:bg-primary/10 hover:text-primary"
              : "text-muted-foreground hover:border-border/80 hover:text-foreground",
          )}
        >
          <Mic className="h-4 w-4" />
          跟读模式
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setMode("auto-scroll")
            setCurrentIndex(0)
            setReadOffset(0)
            setReadOffsetSnapKey((k) => k + 1)
          }}
          className={cn(
            "px-5 py-2 text-sm font-medium",
            mode === "auto-scroll"
              ? "border-primary bg-primary/8 text-primary hover:bg-primary/10 hover:text-primary"
              : "text-muted-foreground hover:border-border/80 hover:text-foreground",
          )}
        >
          <Play className="h-4 w-4" />
          滚动模式
        </Button>
      </div>

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
            onReturnToStart={() => {
              returnToStart()
              scrollToReadPosition(0, 0)
            }}
            onSelectSherpa={() => onSpeechProviderChange("sherpa-onnx")}
            onSelectWebSpeech={() => onSpeechProviderChange("web-speech")}
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
            canScroll={scriptSegments.length > 0 && !isEditingScript}
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
          scriptDraft={scriptDraft}
          segments={scriptSegments}
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
          onDraftScriptChange={setScriptDraft}
          onDraftScriptCommit={commitDraftScript}
          onCalibrateToCharacter={handleCalibrateToCharacter}
          onStartFollowing={() => void startFollowing()}
          onPauseFollowing={pauseFollowing}
          onResumeFollowing={() => void resumeFollowing()}
          onStopFollowing={stopFollowing}
          onReturnToStart={() => {
            returnToStart()
            scrollToReadPosition(0, 0)
          }}
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

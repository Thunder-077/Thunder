"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type FormEvent } from "react"
import {
  BadgeInfo,
  Maximize2,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Square,
  Type,
} from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { checkFunAsrRunning, isTauriDesktop, startFunAsrService } from "@/lib/platform"
import { cn } from "@/lib/utils"
import { useSpeechRecognition } from "../hooks/use-speech-recognition"
import { findBestSegmentMatch } from "../utils/fuzzy-match"
import { segmentScript, type ScriptSegment } from "../utils/script-segmenter"
import { normalizeSpeechText } from "../utils/text-normalizer"
import type { SpeechProvider } from "../transcribers"

export function VoiceWaveform({ status }: { status: FollowStatus }) {
  const barsRef = useRef<HTMLDivElement[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameIdRef = useRef<number | null>(null)

  const isActive = status === "following" || status === "listening"

  const cleanupAudio = useCallback(() => {
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current)
      animationFrameIdRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    analyserRef.current = null
  }, [])

  useEffect(() => {
    if (!isActive) {
      cleanupAudio()
      return
    }

    const initAudio = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        streamRef.current = stream

        const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        const audioContext = new AudioContextClass()
        audioContextRef.current = audioContext

        const source = audioContext.createMediaStreamSource(stream)
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 64
        source.connect(analyser)
        analyserRef.current = analyser

        const bufferLength = analyser.frequencyBinCount
        const dataArray = new Uint8Array(bufferLength)

        const updateWave = () => {
          if (!analyserRef.current) return
          analyserRef.current.getByteFrequencyData(dataArray)

          let sum = 0
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i]
          }
          const average = sum / bufferLength
          const volume = Math.min(Math.max(average / 110, 0), 1)

          barsRef.current.forEach((bar, index) => {
            if (!bar) return
            const multipliers = [0.5, 1.0, 1.4, 0.9, 0.6]
            const baseScales = [0.25, 0.4, 0.5, 0.4, 0.25]
            const multiplier = multipliers[index] || 1
            const baseScale = baseScales[index] || 0.25
            const scaleY = baseScale + volume * multiplier * 0.8
            const finalScaleY = Math.min(scaleY, 1.4)
            bar.style.transform = `scaleY(${finalScaleY})`
          })

          animationFrameIdRef.current = requestAnimationFrame(updateWave)
        }

        updateWave()
      } catch (err) {
        console.warn("Failed to initialize audio visualization:", err)
      }
    }

    initAudio()

    return () => {
      cleanupAudio()
    }
  }, [isActive, cleanupAudio])

  const getBarColorClass = () => {
    switch (status) {
      case "following":
      case "listening":
        return "bg-emerald-400"
      case "paused":
        return "bg-amber-400"
      case "failed":
        return "bg-rose-400"
      default:
        return "bg-slate-400/80"
    }
  }

  const getBarStyle = (index: number) => {
    if (isActive) {
      return {
        transform: `scaleY(${[0.25, 0.4, 0.5, 0.4, 0.25][index]})`,
      }
    }

    const baseScales = [0.25, 0.4, 0.5, 0.4, 0.25]
    const delays = [0, 0.15, 0.3, 0.15, 0]
    const dur = status === "paused" ? "2.5s" : "2s"
    const animName = status === "failed" ? "voice-failed-shake" : "voice-idle-breath"

    return {
      transform: `scaleY(${baseScales[index]})`,
      animation: `${animName} ${dur} ease-in-out infinite`,
      animationDelay: `${delays[index]}s`,
    }
  }

  return (
    <div className="flex h-5 w-8 items-center justify-between gap-[2.5px] px-[2px]">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes voice-idle-breath {
          0%, 100% { transform: scaleY(0.25); }
          50% { transform: scaleY(0.65); }
        }
        @keyframes voice-failed-shake {
          0%, 100% { transform: scaleY(0.25); opacity: 0.5; }
          50% { transform: scaleY(0.4); opacity: 1; }
        }
      `}} />
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          ref={(el) => {
            if (el) barsRef.current[i] = el
          }}
          className={cn(
            "h-full w-[3.2px] rounded-full origin-center transition-transform duration-75",
            getBarColorClass()
          )}
          style={getBarStyle(i)}
        />
      ))}
    </div>
  )
}

type FollowStatus = "idle" | "listening" | "following" | "paused" | "failed"

const CONFIDENCE_THRESHOLD = 0.62

const statusLabels: Record<FollowStatus, string> = {
  idle: "未开始",
  listening: "正在监听",
  following: "正在跟读",
  paused: "已暂停",
  failed: "定位失败",
}

function getSegmentTextStartOffset(script: string, segment: ScriptSegment) {
  const originalSlice = script.slice(segment.startOffset, segment.endOffset)
  const leadingWhitespaceLength = originalSlice.length - originalSlice.trimStart().length
  return segment.startOffset + leadingWhitespaceLength
}

function estimateReadOffset(script: string, segment: ScriptSegment, transcript: string, fallbackOffset: number) {
  const normalizedTranscript = normalizeSpeechText(transcript).slice(-96)
  const segmentStartOffset = getSegmentTextStartOffset(script, segment)
  const units = Array.from(segment.raw).flatMap((char, charIndex) => {
    const normalized = normalizeSpeechText(char)
    return Array.from(normalized).map((normalizedChar) => ({
      normalizedChar,
      rawEndOffset: segmentStartOffset + charIndex + 1,
    }))
  })
  const normalizedSegment = units.map((unit) => unit.normalizedChar).join("")

  if (normalizedTranscript.length < 2 || normalizedSegment.length < 2) {
    return fallbackOffset
  }

  // Strategy: find the longest common substring between the segment and the
  // TAIL of the transcript using a standard DP approach. By scanning the
  // transcript suffix we anchor to "what is being said right now", which
  // naturally handles noisy/fragmented recognition like "AI。AI。查。哎，
  // 不是在。AI不是在替代程序员" — the algorithm will find the latest and
  // longest contiguous match rather than getting stuck on an early short match.

  const m = normalizedSegment.length
  const n = normalizedTranscript.length
  let bestLength = 0
  let bestSegEnd = -1  // end index (exclusive) in normalizedSegment

  // DP: previous[j] = length of common suffix ending at segment[i-1] and transcript[j-1]
  const previous = new Array<number>(n + 1).fill(0)
  const current = new Array<number>(n + 1).fill(0)

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      if (normalizedSegment[i - 1] === normalizedTranscript[j - 1]) {
        current[j] = previous[j - 1] + 1
      } else {
        current[j] = 0
      }

      // Prefer matches that end later in the segment (farthest read position)
      // and for equal segment end prefer the match anchored later in the
      // transcript (most recent speech).
      if (current[j] >= 2) {
        const segEnd = i
        if (
          current[j] > bestLength ||
          (current[j] === bestLength && segEnd >= bestSegEnd)
        ) {
          bestLength = current[j]
          bestSegEnd = segEnd
        }
      }
    }

    // Swap rows
    for (let k = 0; k <= n; k += 1) {
      previous[k] = current[k]
      current[k] = 0
    }
  }

  if (bestSegEnd <= 0 || bestLength < 2) {
    return fallbackOffset
  }

  return Math.max(fallbackOffset, units[Math.min(bestSegEnd - 1, units.length - 1)]?.rawEndOffset ?? fallbackOffset)
}

export function TeleprompterPage() {
  const [script, setScript] = useState("")
  const [fontSize, setFontSize] = useState(44)
  const [lineHeight, setLineHeight] = useState(1.65)
  const [speechProvider, setSpeechProvider] = useState<SpeechProvider>("web-speech")
  const [followStatus, setFollowStatus] = useState<FollowStatus>("idle")
  const [currentIndex, setCurrentIndex] = useState(0)
  const [stableIndex, setStableIndex] = useState(0)
  const [readOffset, setReadOffset] = useState(0)
  const [confidence, setConfidence] = useState(0)
  const [matched, setMatched] = useState(false)
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
  const speech = useSpeechRecognition({
    provider: speechProvider,
    funAsrEndpoint,
  })
  const segments = useMemo(() => segmentScript(script), [script])
  const displayTranscript = `${finalTranscript.slice(-160)}${interimTranscript}`.trim()
  const canFollow = segments.length > 0
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

  // ── rAF 平滑滚动引擎 ──────────────────────────────────────────────────
  // 使用 requestAnimationFrame 持续插值到目标位置，替代浏览器原生 smooth scroll。
  // 优势：可随时更新目标、不会被新 scrollTo 打断、缓出手感更可控。
  const scrollTargetRef = useRef<number | null>(null)

  const cancelScrollAnimation = () => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    scrollTargetRef.current = null
  }

  const animateScrollTo = useCallback((target: number) => {
    const viewport = prompterViewportRef.current
    if (!viewport) return

    scrollTargetRef.current = target

    // 动画已在运行时只更新目标，不重复启动
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

      // 缓出插值：系数 0.12 在 60fps 下约 300ms 到 95%，跟手且不突兀
      vp.scrollTop = current + distance * 0.12
      animationFrameRef.current = requestAnimationFrame(step)
    }

    animationFrameRef.current = requestAnimationFrame(step)
  }, [])

  const scrollToReadPosition = useCallback((charOffset: number, segmentIndex: number) => {
    const viewport = prompterViewportRef.current
    if (!viewport) return

    // 优先通过 data-offset 定位到具体字符按钮，退回到 segment 段落级别
    const charEl = viewport.querySelector(`[data-offset="${charOffset}"]`) as HTMLElement | null
    const segmentEl = segmentRefs.current[segmentIndex]
    const targetEl = charEl ?? segmentEl
    if (!targetEl) return

    // 将当前朗读位置放在视口上方 1/3，下方 2/3 留给即将要读的文字
    const targetTop = targetEl.offsetTop - viewport.clientHeight / 3
    animateScrollTo(Math.max(0, targetTop))
  }, [animateScrollTo])

  // 组件卸载时取消动画帧
  useEffect(() => cancelScrollAnimation, [])

  const resetScriptPosition = () => {
    setCurrentIndex(0)
    setStableIndex(0)
    setReadOffset(0)
    setMatched(false)
    setConfidence(0)
    setMessage(null)
    setFinalTranscript("")
    setInterimTranscript("")
  }

  const replaceScript = (nextScript: string) => {
    setScript(nextScript)
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

  const handleEmptyPrompterInput = (event: FormEvent<HTMLDivElement>) => {
    const nextScript = event.currentTarget.innerText.trim()
    if (nextScript) {
      replaceScript(nextScript)
    }
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

    const nextFinalTranscript = speech.lastResult.isFinal
      ? `${finalTranscript}${speech.lastResult.text}`.slice(-320)
      : finalTranscript

    if (speech.lastResult.isFinal) {
      // Speech results arrive from an external browser API; state updates here synchronize that stream with UI state.
      setFinalTranscript(nextFinalTranscript)
      setInterimTranscript("")
    } else {
      setInterimTranscript(speech.lastResult.text)
    }

    const matchText = `${nextFinalTranscript.slice(-180)}${speech.lastResult.isFinal ? "" : speech.lastResult.text}`
    const result = findBestSegmentMatch(segments, matchText, stableIndex)
    setConfidence(result.confidence)

    if (result.index >= 0 && result.confidence >= CONFIDENCE_THRESHOLD) {
      const matchedSegment = segments[result.index]
      const previousOffset = result.index === currentIndex ? readOffset : getSegmentTextStartOffset(script, matchedSegment)
      const nextReadOffset = estimateReadOffset(script, matchedSegment, matchText, previousOffset)

      setMatched(true)
      setMessage(null)
      setCurrentIndex(result.index)
      setStableIndex((current) => Math.max(current, result.index))
      setReadOffset(nextReadOffset)
      setFollowStatus("following")
      return
    }

    setMatched(false)
    if (speech.lastResult.isFinal) {
      setFollowStatus("failed")
    }
  }, [currentIndex, finalTranscript, followStatus, readOffset, script, segments, speech.lastResult, stableIndex])
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
    setMatched(false)
    setConfidence(0)
    setFollowStatus("listening")
    await speech.start()
  }

  const pauseFollowing = () => {
    speech.pause()
    setFollowStatus("paused")
  }

  const resumeFollowing = async () => {
    if (!canFollow) {
      setMessage("请先输入一篇提词稿")
      return
    }

    speech.clearError()
    setMessage(null)
    setFollowStatus("listening")
    await speech.start()
  }

  const stopFollowing = () => {
    speech.stop()
    setFollowStatus("idle")
    setMatched(false)
    setConfidence(0)
    setMessage(null)
    setInterimTranscript("")
  }

  const returnToStart = () => {
    speech.clearError()
    setCurrentIndex(0)
    setStableIndex(0)
    setReadOffset(0)
    setMatched(false)
    setConfidence(0)
    setMessage(null)
    scrollToReadPosition(0, 0)
  }

  const calibrateToCharacter = (selectedIndex: number, selectedOffset: number) => {
    setMessage(null)
    setCurrentIndex(selectedIndex)
    setStableIndex(selectedIndex)
    setReadOffset(selectedOffset)
    setMatched(true)
    setConfidence(1)
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

  return (
    <div>
      <PageHeader
        title="提词器"
        description="桌面端使用本地 FunASR 跟读定位，纯 Web 端自动使用浏览器 Web Speech。"
      />

      <div className="grid gap-4">
        <Card className="surface-card">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3">
              <div className="min-w-[260px] flex-[1_1_280px] rounded-2xl border border-border/70 bg-background/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">跟读控制</div>
                    <p className="mt-1 text-xs text-muted-foreground">稿件直接粘贴到下方提词屏。</p>
                  </div>
                  <span
                    className={cn(
                      "flex h-9 w-14 items-center justify-center rounded-2xl border transition-all duration-300",
                      visibleStatus === "following" || visibleStatus === "listening"
                        ? "border-success/30 bg-success/15"
                        : visibleStatus === "paused"
                        ? "border-amber-500/30 bg-amber-500/15"
                        : visibleStatus === "failed"
                        ? "border-destructive/30 bg-destructive/15"
                        : "border-border bg-muted/40"
                    )}
                  >
                    <VoiceWaveform status={visibleStatus} />
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant={speech.isSupported ? "secondary" : "destructive"}>
                    {speech.isSupported ? (speechProvider === "funasr" ? "FunASR" : "浏览器识别") : "不支持识别"}
                  </Badge>
                  <span>{statusLabels[visibleStatus]}</span>
                  <span>{matched ? "匹配成功" : "等待匹配"}</span>
                </div>
              </div>

              <div className="min-w-[360px] flex-[2_1_420px] rounded-2xl border border-border/70 bg-muted/25 p-3">
                <div className="grid gap-2 sm:grid-cols-4">
                  {followStatus === "paused" ? (
                    <Button onClick={() => void resumeFollowing()} className="h-11 gap-2 sm:col-span-2">
                      <Play className="h-4 w-4" />
                      继续跟读
                    </Button>
                  ) : (
                    <Button onClick={() => void startFollowing()} className="h-11 gap-2 sm:col-span-2">
                      <Mic className="h-4 w-4" />
                      开始跟读
                    </Button>
                  )}
                  <Button variant="outline" onClick={pauseFollowing} className="h-11 gap-2" disabled={followStatus === "idle"}>
                    <Pause className="h-4 w-4" />
                    暂停
                  </Button>
                  <Button variant="outline" onClick={stopFollowing} className="h-11 gap-2">
                    <Square className="h-4 w-4" />
                    停止
                  </Button>
                  <Button variant="outline" onClick={returnToStart} className="h-10 gap-2 sm:col-span-4">
                    <RotateCcw className="h-4 w-4" />
                    回到开头
                  </Button>
                </div>
              </div>

              <div className="grid min-w-[560px] flex-[1_1_560px] gap-3 sm:grid-cols-[minmax(280px,1fr)_minmax(240px,0.9fr)]">
                <div className="min-w-0 rounded-2xl border border-border/70 bg-background/60 p-3">
                  <div className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Type className="h-3.5 w-3.5" />
                    显示
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1">
                      <span className="text-[11px] text-muted-foreground">字号</span>
                      <Input
                        className="min-w-0 px-3 text-center text-sm"
                        type="number"
                        min={28}
                        max={88}
                        value={fontSize}
                        onChange={(event) => setFontSize(Number(event.target.value))}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] text-muted-foreground">行距</span>
                      <Input
                        className="min-w-0 px-3 text-center text-sm"
                        type="number"
                        min={1.2}
                        max={2.4}
                        step={0.05}
                        value={lineHeight}
                        onChange={(event) => setLineHeight(Number(event.target.value))}
                      />
                    </label>
                  </div>
                </div>

                <div className="min-w-0 rounded-2xl border border-border/70 bg-background/60 p-3">
                  <div className="mb-3 text-xs font-medium text-muted-foreground">识别引擎</div>
                  <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/30 p-1">
                    {showFunAsr && (
                      <button
                        type="button"
                        disabled={funasrStarting}
                        onClick={() => {
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
                        }}
                        className={cn(
                          "h-8 min-w-0 flex-1 truncate rounded-lg border px-3 text-xs font-semibold transition-all",
                          speechProvider === "funasr"
                            ? "border-primary/35 bg-primary text-primary-foreground shadow-sm"
                            : funasrStarting
                              ? "cursor-not-allowed border-transparent text-muted-foreground/50"
                              : "border-transparent text-muted-foreground hover:bg-background/70 hover:text-foreground"
                        )}
                      >
                        {funasrStarting ? "启动中…" : funasrReady ? "FunASR · 已就绪" : "FunASR"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSpeechProvider("web-speech")}
                      className={cn(
                        "h-8 min-w-0 flex-1 truncate rounded-lg border px-3 text-xs font-semibold transition-all",
                        speechProvider === "web-speech"
                          ? "border-primary/35 bg-primary text-primary-foreground shadow-sm"
                          : "border-transparent text-muted-foreground hover:bg-background/70 hover:text-foreground"
                      )}
                    >
                      Web Speech
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-border/70 bg-muted/25 px-4 py-3 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <div className="flex items-center gap-2 text-foreground">
                  <BadgeInfo className="h-4 w-4 text-brand" />
                  识别状态
                </div>
                <div>置信度 {Math.round(confidence * 100)}%</div>
                <div className="min-w-0 flex-1 truncate">识别文本：{displayTranscript || "暂无"}</div>
              </div>
              {visibleMessage && (
                <div className="mt-2 rounded-xl border border-warning/35 bg-warning/10 px-3 py-2 text-warning-foreground">
                  {visibleMessage}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <section
          ref={stageRef}
          className="relative flex h-[72vh] min-h-[680px] flex-col overflow-hidden rounded-[2rem] border shadow-2xl fullscreen:h-screen fullscreen:min-h-screen fullscreen:rounded-none fullscreen:border-0"
          style={{
            backgroundColor: "oklch(0.1 0.018 252)",
            borderColor: "oklch(0.28 0.03 252)",
            color: "oklch(0.94 0.004 252)",
          }}
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 18% 10%, oklch(0.62 0.16 250 / 0.2), transparent 34%), radial-gradient(circle at 82% 0%, oklch(0.78 0.14 78 / 0.16), transparent 30%), linear-gradient(180deg, oklch(1 0 0 / 0.04), transparent 36%)",
            }}
          />
          <div className="relative z-10 flex items-center justify-between gap-3 border-b border-border/30 px-5 py-3">
            <div className="flex items-center gap-3 text-sm text-slate-300">
              <VoiceWaveform status={visibleStatus} />
              <span className="font-medium tracking-wide">{statusLabels[visibleStatus]}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void toggleFullscreen()} className="text-slate-200 hover:bg-muted/20 hover:text-foreground">
              <Maximize2 className="h-4 w-4" />
              {isFullscreen ? "还原提词" : "全屏提词"}
            </Button>
          </div>

          <div
            ref={prompterViewportRef}
            role="textbox"
            aria-label="提词稿输入和跟读显示区"
            tabIndex={0}
            onPaste={handlePrompterPaste}
            className="relative z-10 min-h-0 flex-1 overflow-y-auto px-5 py-16 outline-none sm:px-10 lg:px-16"
          >
            {segments.length === 0 ? (
              <div
                contentEditable
                suppressContentEditableWarning
                onInput={handleEmptyPrompterInput}
                data-placeholder="点击这里输入或粘贴提词稿"
                className="mx-auto flex min-h-full max-w-5xl items-center justify-center whitespace-pre-wrap text-center text-lg font-medium text-slate-200 outline-none empty:before:text-slate-500 empty:before:content-[attr(data-placeholder)]"
              />
            ) : (
              <div
                className="mx-auto max-w-5xl font-serif tracking-wide"
                style={{
                  fontSize,
                  lineHeight,
                }}
              >
                {segments.map((segment, index) => {
                  const textStartOffset = getSegmentTextStartOffset(script, segment)

                  return (
                    <p
                      key={segment.id}
                      ref={(node) => {
                        segmentRefs.current[index] = node
                      }}
                      className={cn(
                        "my-8 scroll-m-40 rounded-2xl px-4 py-2 transition-all duration-300",
                        index === visibleCurrentIndex && "bg-amber-300/18 shadow-[0_0_42px_rgba(251,191,36,0.14)]"
                      )}
                    >
                      {Array.from(segment.raw).map((char, charIndex) => {
                        const absoluteOffset = textStartOffset + charIndex
                        const isRead = absoluteOffset < visibleReadOffset
                        const isCurrentChar = absoluteOffset === visibleReadOffset && index === visibleCurrentIndex

                        return (
                          <button
                            key={`${segment.id}-${absoluteOffset}`}
                            type="button"
                            data-offset={absoluteOffset}
                            onClick={() => calibrateToCharacter(index, absoluteOffset)}
                            className={cn(
                              "inline cursor-pointer appearance-none rounded-sm border-0 bg-transparent px-0.5 py-0 text-left font-[inherit] leading-[inherit] transition-colors hover:bg-muted/20",
                              isRead && "text-slate-500/70",
                              !isRead && "text-slate-100",
                              isCurrentChar && "bg-amber-300/25 text-amber-50"
                            )}
                          >
                            {char}
                          </button>
                        )
                      })}
                    </p>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

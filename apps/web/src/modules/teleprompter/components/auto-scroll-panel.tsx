"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type RefObject } from "react"
import { Pause, Play, RotateCcw, Settings2, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { AutoScrollSettingsDialog } from "./auto-scroll-settings-dialog"

type AutoScrollStatus = "idle" | "countdown" | "scrolling" | "paused"
type AutoScrollDirection = "up" | "down"

export type AutoScrollViewOptions = {
  mirrorDisplay: boolean
  highlightLine: boolean
}

export type AutoScrollPanelHandle = {
  start: () => void
  pause: () => void
  stop: () => void
  reset: () => void
}

type AutoScrollPanelProps = {
  fontSize: number
  lineHeight: number
  canScroll: boolean
  prompterViewportRef: RefObject<HTMLDivElement | null>
  onFontSizeChange: (value: number) => void
  onLineHeightChange: (value: number) => void
  onViewOptionsChange: (options: AutoScrollViewOptions) => void
  onStatusChange?: (status: AutoScrollStatus) => void
  onStop?: () => void
  onReset?: () => void
  onStart?: () => void
  pausedScrollTopRef: RefObject<number | null>
}

export const AutoScrollPanel = forwardRef<AutoScrollPanelHandle, AutoScrollPanelProps>(function AutoScrollPanel({
  fontSize,
  lineHeight,
  canScroll,
  prompterViewportRef,
  onFontSizeChange,
  onLineHeightChange,
  onViewOptionsChange,
  onStatusChange,
  onStop,
  onReset,
  onStart,
  pausedScrollTopRef,
}: AutoScrollPanelProps, ref) {
  const [status, setStatus] = useState<AutoScrollStatus>("idle")
  const [speed, setSpeed] = useState(1.25)
  const [direction, setDirection] = useState<AutoScrollDirection>("up")
  const [countdown, setCountdown] = useState("off")
  const [countdownSeconds, setCountdownSeconds] = useState(3)
  const [countdownRemaining, setCountdownRemaining] = useState(0)
  const [smoothScroll, setSmoothScroll] = useState(true)
  const [loopPlayback, setLoopPlayback] = useState(false)
  const [mirrorDisplay, setMirrorDisplay] = useState(false)
  const [highlightLine, setHighlightLine] = useState(true)
  const [progress, setProgress] = useState(0)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const animationFrameRef = useRef<number | null>(null)
  const lastFrameTimeRef = useRef<number | null>(null)
  const elapsedBaseRef = useRef(0)
  const startedAtRef = useRef<number | null>(null)

  useEffect(() => {
    onStatusChange?.(status)
  }, [status, onStatusChange])

  useEffect(() => {
    onViewOptionsChange({ mirrorDisplay, highlightLine })
  }, [highlightLine, mirrorDisplay, onViewOptionsChange])

  useEffect(() => {
    if (canScroll || status === "idle") return

    const timer = window.setTimeout(() => {
      setStatus("idle")
      setCountdownRemaining(0)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [canScroll, status])

  useEffect(() => {
    if (status !== "countdown") return
    if (countdownRemaining <= 0) {
      const timer = window.setTimeout(() => {
        startedAtRef.current = performance.now()
        lastFrameTimeRef.current = null
        setStatus("scrolling")
      }, 0)
      return () => window.clearTimeout(timer)
    }

    const timer = window.setTimeout(() => {
      setCountdownRemaining((value) => Math.max(0, value - 1))
    }, 1000)

    return () => window.clearTimeout(timer)
  }, [countdownRemaining, status])

  useEffect(() => {
    if (status !== "scrolling") return

    const viewport = prompterViewportRef.current
    if (!viewport) {
      setStatus("idle")
      return
    }

    const step = (time: number) => {
      if (lastFrameTimeRef.current === null) {
        lastFrameTimeRef.current = time
      }
      if (startedAtRef.current === null) {
        startedAtRef.current = time
      }

      const deltaSeconds = Math.max(0, (time - lastFrameTimeRef.current) / 1000)
      lastFrameTimeRef.current = time

      const pixelsPerSecond = speed * fontSize * lineHeight
      const directionMultiplier = direction === "up" ? 1 : -1
      const rawDelta = pixelsPerSecond * deltaSeconds * directionMultiplier
      // scrollTop 支持小数累积；非平滑模式只关闭 CSS 行为，不应把低速位移截断成 0。
      viewport.scrollTop += rawDelta

      const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
      const reachedEnd = direction === "up"
        ? viewport.scrollTop >= maxScrollTop - 1
        : viewport.scrollTop <= 1

      if (reachedEnd && maxScrollTop > 0) {
        if (loopPlayback) {
          viewport.scrollTop = direction === "up" ? 0 : maxScrollTop
        } else {
          setStatus("idle")
          setProgress(100)
          setElapsedSeconds(elapsedBaseRef.current + Math.floor((time - startedAtRef.current) / 1000))
          return
        }
      }

      const currentProgress = maxScrollTop <= 0
        ? 0
        : direction === "up"
          ? (viewport.scrollTop / maxScrollTop) * 100
          : ((maxScrollTop - viewport.scrollTop) / maxScrollTop) * 100
      setProgress(Math.max(0, Math.min(100, Math.round(currentProgress))))
      setElapsedSeconds(elapsedBaseRef.current + Math.floor((time - startedAtRef.current) / 1000))

      animationFrameRef.current = requestAnimationFrame(step)
    }

    animationFrameRef.current = requestAnimationFrame(step)

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [direction, fontSize, lineHeight, loopPlayback, prompterViewportRef, smoothScroll, speed, status])

  const updateProgressFromViewport = () => {
    const viewport = prompterViewportRef.current
    if (!viewport) {
      setProgress(0)
      return
    }

    const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
    if (maxScrollTop <= 0) {
      setProgress(0)
      return
    }

    const currentProgress = direction === "up"
      ? (viewport.scrollTop / maxScrollTop) * 100
      : ((maxScrollTop - viewport.scrollTop) / maxScrollTop) * 100
    setProgress(Math.max(0, Math.min(100, Math.round(currentProgress))))
  }

  const handleStart = () => {
    if (!canScroll) return
    onStart?.()
    const viewport = prompterViewportRef.current
    if (viewport) {
      if (status === "paused" && pausedScrollTopRef.current !== null) {
        viewport.scrollTop = pausedScrollTopRef.current
      } else {
        const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
        if (direction === "down" && viewport.scrollTop <= 1) {
          viewport.scrollTop = maxScrollTop
        }
        if (direction === "up" && viewport.scrollTop >= maxScrollTop - 1) {
          viewport.scrollTop = 0
        }
      }
      updateProgressFromViewport()
    }
    pausedScrollTopRef.current = null
    elapsedBaseRef.current = elapsedSeconds
    lastFrameTimeRef.current = null
    startedAtRef.current = null

    if (countdown === "on" && countdownSeconds > 0) {
      setCountdownRemaining(countdownSeconds)
      setStatus("countdown")
      return
    }

    setStatus("scrolling")
  }
  const handlePause = () => {
    if (startedAtRef.current !== null) {
      elapsedBaseRef.current = elapsedSeconds
    }
    const viewport = prompterViewportRef.current
    if (viewport) {
      pausedScrollTopRef.current = viewport.scrollTop
    }
    setStatus("paused")
  }
  const handleStop = () => {
    pausedScrollTopRef.current = null
    setStatus("idle")
    setCountdownRemaining(0)
    onStop?.()
  }
  const handleReset = () => {
    const viewport = prompterViewportRef.current
    if (viewport) {
      viewport.scrollTop = direction === "up" ? 0 : Math.max(0, viewport.scrollHeight - viewport.clientHeight)
    }
    pausedScrollTopRef.current = null
    elapsedBaseRef.current = 0
    startedAtRef.current = null
    lastFrameTimeRef.current = null
    setElapsedSeconds(0)
    setStatus("idle")
    setCountdownRemaining(0)
    updateProgressFromViewport()
    onReset?.()
  }

  const handlersRef = useRef({ start: handleStart, pause: handlePause, stop: handleStop, reset: handleReset })
  handlersRef.current = { start: handleStart, pause: handlePause, stop: handleStop, reset: handleReset }

  useImperativeHandle(ref, () => ({
    start: () => handlersRef.current.start(),
    pause: () => handlersRef.current.pause(),
    stop: () => handlersRef.current.stop(),
    reset: () => handlersRef.current.reset(),
  }), [])

  const formattedElapsed = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:${String(elapsedSeconds % 60).padStart(2, "0")}`

  return (
    <div className="space-y-3">
      {/* ── 操作栏（顶部水平条） ── */}
      <Card size="sm">
        <CardContent className="p-3 flex flex-col md:flex-row items-center justify-between gap-4">
          {/* 左侧：滚动状态圆点 + 状态文字 + 滚动动画 */}
          <div className="flex items-center gap-2.5 text-xs">
            <span className={cn(
              "h-2.5 w-2.5 rounded-full transition-all duration-300",
              status === "scrolling" ? "bg-success animate-pulse" : status === "paused" ? "bg-warning animate-pulse" : "bg-muted-foreground/40"
            )} />
            <span className="text-muted-foreground">滚动状态:</span>
            <span className="font-semibold text-foreground">
              {status === "countdown"
                ? `${countdownRemaining} 秒后开始`
                : status === "scrolling"
                  ? "正在滚动"
                  : status === "paused"
                    ? "已暂停"
                    : "未启动"}
            </span>
            <span className="text-muted-foreground">进度 {progress}%</span>
            <span className="text-muted-foreground">时间 {formattedElapsed}</span>
            {status === "scrolling" && (
              <span className="flex gap-0.5 items-end h-3 ml-1">
                <span className="w-[3px] bg-success rounded-full animate-[bounce_0.8s_infinite_100ms] h-2" />
                <span className="w-[3px] bg-success rounded-full animate-[bounce_0.8s_infinite_200ms] h-3" />
                <span className="w-[3px] bg-success rounded-full animate-[bounce_0.8s_infinite_300ms] h-1.5" />
              </span>
            )}
          </div>

          {/* 中间：4个按钮水平排列（开始、暂停、停止、回到开头） */}
          <div className="flex flex-wrap items-center gap-2">
            {(status === "scrolling" || status === "countdown") ? (
              <Button
                onClick={handlePause}
                className="h-8 gap-1.5 text-xs shadow-sm px-3"
              >
                <Pause className="h-3.5 w-3.5" />
                暂停
              </Button>
            ) : (
              <Button
                onClick={handleStart}
                className="h-8 gap-1.5 text-xs shadow-sm px-3"
                disabled={!canScroll}
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                {status === "paused" ? "继续" : "开始"}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={handleStop}
              className="h-8 gap-1.5 text-xs text-destructive border-destructive/20 hover:bg-destructive/10 hover:text-destructive px-3"
            >
              <Square className="h-3.5 w-3.5 fill-destructive/80 stroke-none" />
              停止
            </Button>
            <Button variant="outline" onClick={handleReset} className="h-8 gap-1.5 text-xs px-3">
              <RotateCcw className="h-3.5 w-3.5" />
              回到开头
            </Button>
          </div>

          {/* 右侧：滚动设置按钮（打开 Sheet/Dialog） */}
          <AutoScrollSettingsDialog
            fontSize={fontSize}
            lineHeight={lineHeight}
            speed={speed}
            direction={direction}
            countdown={countdown}
            countdownSeconds={countdownSeconds}
            smoothScroll={smoothScroll}
            loopPlayback={loopPlayback}
            mirrorDisplay={mirrorDisplay}
            highlightLine={highlightLine}
            onFontSizeChange={onFontSizeChange}
            onLineHeightChange={onLineHeightChange}
            onSpeedChange={setSpeed}
            onDirectionChange={(value) => setDirection(value as AutoScrollDirection)}
            onCountdownChange={setCountdown}
            onCountdownSecondsChange={setCountdownSeconds}
            onSmoothScrollChange={setSmoothScroll}
            onLoopPlaybackChange={setLoopPlayback}
            onMirrorDisplayChange={setMirrorDisplay}
            onHighlightLineChange={setHighlightLine}
            trigger={(
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <Settings2 className="h-3.5 w-3.5" />
                滚动设置
              </Button>
            )}
          />
        </CardContent>
      </Card>
    </div>
  )
})

"use client"

import { useState } from "react"
import { Pause, Play, RotateCcw, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select, type SelectOption } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { NumberStepper } from "./number-stepper"

type AutoScrollStatus = "idle" | "scrolling" | "paused"

type AutoScrollPanelProps = {
  fontSize: number
  lineHeight: number
  onFontSizeChange: (value: number) => void
  onLineHeightChange: (value: number) => void
}

const directionOptions: SelectOption[] = [
  { value: "up", label: "向上滚动" },
  { value: "down", label: "向下滚动" },
]

const countdownOptions: SelectOption[] = [
  { value: "off", label: "关闭" },
  { value: "on", label: "开启" },
]

export function AutoScrollPanel({
  fontSize,
  lineHeight,
  onFontSizeChange,
  onLineHeightChange,
}: AutoScrollPanelProps) {
  const [status, setStatus] = useState<AutoScrollStatus>("idle")
  const [speed, setSpeed] = useState(1.25)
  const [direction, setDirection] = useState("up")
  const [countdown, setCountdown] = useState("off")
  const [countdownSeconds, setCountdownSeconds] = useState(3)
  const [smoothScroll, setSmoothScroll] = useState(true)
  const [loopPlayback, setLoopPlayback] = useState(false)
  const [mirrorDisplay, setMirrorDisplay] = useState(false)
  const [highlightLine, setHighlightLine] = useState(true)

  const handleStart = () => setStatus("scrolling")
  const handlePause = () => setStatus("paused")
  const handleStop = () => setStatus("idle")
  const handleReset = () => setStatus("idle")

  return (
    <div className="space-y-3">
      {/* ── 三列仪表盘 ── */}
      <div className="grid gap-3 lg:grid-cols-[1fr_1.5fr_1fr]">
        {/* ── 左列：自动滚动控制 ── */}
        <Card size="sm">
          <CardContent className="space-y-3 p-4">
            <div className="text-sm font-semibold">自动滚动控制</div>
            <p className="text-xs text-muted-foreground">
              自动滚动您的台词，助您从容表达，专注演讲。
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Button
                onClick={status === "paused" ? handleStart : handleStart}
                className="h-9 gap-1.5 text-xs"
                disabled={status === "scrolling"}
              >
                <Play className="h-3.5 w-3.5" />
                开始
              </Button>
              <Button
                variant="outline"
                onClick={handlePause}
                disabled={status !== "scrolling"}
                className="h-9 gap-1.5 text-xs"
              >
                <Pause className="h-3.5 w-3.5" />
                暂停
              </Button>
              <Button
                variant="outline"
                onClick={handleStop}
                className="h-9 gap-1.5 text-xs text-destructive hover:text-destructive"
              >
                <Square className="h-3.5 w-3.5" />
                停止
              </Button>
            </div>
            <Button variant="outline" onClick={handleReset} className="h-9 w-full gap-1.5 text-xs">
              <RotateCcw className="h-3.5 w-3.5" />
              回到开头
            </Button>
          </CardContent>
        </Card>

        {/* ── 中列：滚动设置 ── */}
        <Card size="sm">
          <CardContent className="space-y-3 p-4">
            <div className="text-sm font-semibold">滚动设置</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <label className="space-y-1.5">
                <span className="text-xs text-muted-foreground">滚动速度</span>
                <NumberStepper value={speed} onChange={setSpeed} min={0.25} max={5} step={0.25} formatValue={(v) => v.toFixed(2)} />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs text-muted-foreground">字体大小</span>
                <NumberStepper value={fontSize} onChange={onFontSizeChange} min={28} max={88} step={2} />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs text-muted-foreground">行距</span>
                <NumberStepper value={lineHeight} onChange={onLineHeightChange} min={1.2} max={2.4} step={0.05} formatValue={(v) => v.toFixed(2)} />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs text-muted-foreground">滚动方向</span>
                <Select value={direction} onChange={setDirection} options={directionOptions} size="compact" className="w-full" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs text-muted-foreground">倒计时</span>
                <Select value={countdown} onChange={setCountdown} options={countdownOptions} size="compact" className="w-full" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs text-muted-foreground">开始前倒计时</span>
                <NumberStepper value={countdownSeconds} onChange={setCountdownSeconds} min={0} max={10} step={1} />
              </label>
            </div>
          </CardContent>
        </Card>

        {/* ── 右列：滚动状态 ── */}
        <Card size="sm">
          <CardContent className="space-y-3 p-4">
            <div className="text-sm font-semibold">滚动状态</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-muted-foreground">当前进度</div>
                <div className="mt-1 text-2xl font-bold tabular-nums">0%</div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted/60">
                  <div className="h-full rounded-full bg-primary" style={{ width: "0%" }} />
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">预计剩余时间</div>
                <div className="mt-1 text-2xl font-bold tabular-nums">--:--</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">当前速度</div>
                <div className="mt-1 text-base font-bold tabular-nums">
                  {speed.toFixed(2)}{" "}
                  <span className="text-xs font-normal text-muted-foreground">行/秒</span>
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">已滚动时间</div>
                <div className="mt-1 text-base font-bold tabular-nums">00:00</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── 开关选项栏 ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-center justify-between rounded-xl border border-border/70 bg-card px-4 py-3">
          <div>
            <div className="text-sm font-medium">平滑滚动</div>
            <p className="text-xs text-muted-foreground">开启后滚动更平滑自然</p>
          </div>
          <Switch checked={smoothScroll} onCheckedChange={setSmoothScroll} size="sm" />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border/70 bg-card px-4 py-3">
          <div>
            <div className="text-sm font-medium">循环播放</div>
            <p className="text-xs text-muted-foreground">到结尾后自动回到开头</p>
          </div>
          <Switch checked={loopPlayback} onCheckedChange={setLoopPlayback} size="sm" />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border/70 bg-card px-4 py-3">
          <div>
            <div className="text-sm font-medium">镜像显示</div>
            <p className="text-xs text-muted-foreground">适合摄像机拍摄使用</p>
          </div>
          <Switch checked={mirrorDisplay} onCheckedChange={setMirrorDisplay} size="sm" />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border/70 bg-card px-4 py-3">
          <div>
            <div className="text-sm font-medium">高亮当前行</div>
            <p className="text-xs text-muted-foreground">突出显示正在阅读的行</p>
          </div>
          <Switch checked={highlightLine} onCheckedChange={setHighlightLine} size="sm" />
        </div>
      </div>
    </div>
  )
}

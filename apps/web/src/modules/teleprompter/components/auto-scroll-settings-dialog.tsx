"use client"

import type { ReactElement } from "react"
import { Monitor, Sliders, Settings2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Select, type SelectOption } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { NumberStepper } from "./number-stepper"

type AutoScrollSettingsDialogProps = {
  fontSize: number
  lineHeight: number
  speed: number
  direction: string
  countdown: string
  countdownSeconds: number
  smoothScroll: boolean
  loopPlayback: boolean
  mirrorDisplay: boolean
  highlightLine: boolean
  trigger: ReactElement
  onFontSizeChange: (value: number) => void
  onLineHeightChange: (value: number) => void
  onSpeedChange: (value: number) => void
  onDirectionChange: (value: string) => void
  onCountdownChange: (value: string) => void
  onCountdownSecondsChange: (value: number) => void
  onSmoothScrollChange: (value: boolean) => void
  onLoopPlaybackChange: (value: boolean) => void
  onMirrorDisplayChange: (value: boolean) => void
  onHighlightLineChange: (value: boolean) => void
}

const directionOptions: SelectOption[] = [
  { value: "up", label: "向上滚动" },
  { value: "down", label: "向下滚动" },
]

const countdownOptions: SelectOption[] = [
  { value: "off", label: "关闭" },
  { value: "on", label: "开启" },
]

export function AutoScrollSettingsDialog({
  fontSize,
  lineHeight,
  speed,
  direction,
  countdown,
  countdownSeconds,
  smoothScroll,
  loopPlayback,
  mirrorDisplay,
  highlightLine,
  trigger,
  onFontSizeChange,
  onLineHeightChange,
  onSpeedChange,
  onDirectionChange,
  onCountdownChange,
  onCountdownSecondsChange,
  onSmoothScrollChange,
  onLoopPlaybackChange,
  onMirrorDisplayChange,
  onHighlightLineChange,
}: AutoScrollSettingsDialogProps) {
  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-[720px] gap-0 overflow-hidden p-0 sm:max-w-[720px] bg-background" hideClose>
        <DialogHeader className="gap-3 border-b border-border/70 bg-background/95 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 bg-muted/40">
              <Settings2 className="h-4.5 w-4.5 text-foreground" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold">自动滚动设置</DialogTitle>
              <DialogDescription className="mt-1 text-xs leading-5">
                调整台词滚动属性与辅助显示选项。设置会立即生效。
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-0 md:grid-cols-[1fr_1.1fr]">
          {/* 左列：显示与排版 */}
          <section className="space-y-4 px-6 py-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Monitor className="h-4 w-4 text-muted-foreground" />
              显示与排版
            </div>

            <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/[0.18] p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm font-medium text-foreground">字号</div>
                <NumberStepper value={fontSize} onChange={onFontSizeChange} min={28} max={88} step={2} />
              </div>

              <Separator />

              <div className="flex items-center justify-between gap-4">
                <div className="text-sm font-medium text-foreground">行距</div>
                <NumberStepper
                  value={lineHeight}
                  onChange={onLineHeightChange}
                  min={1.2}
                  max={2.4}
                  step={0.05}
                  formatValue={(value) => value.toFixed(2)}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between gap-4">
                <div className="text-sm font-medium text-foreground">滚动方向</div>
                <Select
                  value={direction}
                  onChange={onDirectionChange}
                  options={directionOptions}
                  size="compact"
                  className="w-[120px]"
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between gap-4 pt-0.5">
                <div className="text-sm font-medium text-foreground">镜像显示</div>
                <Switch checked={mirrorDisplay} onCheckedChange={onMirrorDisplayChange} size="sm" />
              </div>

              <Separator />

              <div className="flex items-center justify-between gap-4">
                <div className="text-sm font-medium text-foreground">高亮当前行</div>
                <Switch checked={highlightLine} onCheckedChange={onHighlightLineChange} size="sm" />
              </div>
            </div>
          </section>

          {/* 右列：滚动与速度 */}
          <section className="border-t border-border/70 px-6 py-5 md:border-t-0 md:border-l">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Sliders className="h-4 w-4 text-muted-foreground" />
              滚动与速度
            </div>

            <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/[0.18] p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm font-medium text-foreground">滚动速度</div>
                <NumberStepper
                  value={speed}
                  onChange={onSpeedChange}
                  min={0.25}
                  max={5}
                  step={0.25}
                  formatValue={(value) => value.toFixed(2)}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between gap-4">
                <div className="text-sm font-medium text-foreground">倒计时</div>
                <Select
                  value={countdown}
                  onChange={onCountdownChange}
                  options={countdownOptions}
                  size="compact"
                  className="w-[100px]"
                />
              </div>

              <Separator />

              <div className={cn(
                "flex items-center justify-between gap-4 transition-all duration-200",
                countdown === "off" && "opacity-40 pointer-events-none"
              )}>
                <div className="text-sm font-medium text-foreground">倒计时长</div>
                <NumberStepper
                  value={countdownSeconds}
                  onChange={onCountdownSecondsChange}
                  min={0}
                  max={10}
                  step={1}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between gap-4 pt-0.5">
                <div className="text-sm font-medium text-foreground">平滑滚动</div>
                <Switch checked={smoothScroll} onCheckedChange={onSmoothScrollChange} size="sm" />
              </div>

              <Separator />

              <div className="flex items-center justify-between gap-4">
                <div className="text-sm font-medium text-foreground">循环播放</div>
                <Switch checked={loopPlayback} onCheckedChange={onLoopPlaybackChange} size="sm" />
              </div>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

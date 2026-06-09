"use client"

import type { ReactElement } from "react"
import {
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Select,
  Toggle,
} from "@thunder/ui"
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

export function AutoScrollSettingsDialog(props: AutoScrollSettingsDialogProps) {
  return (
    <Dialog>
      <DialogTrigger render={props.trigger} />
      <DialogContent className="max-w-[720px] gap-0 overflow-hidden p-0 sm:max-w-[720px]">
        <DialogHeader className="border-b border-border/70 bg-background/95 px-6 py-5">
          <DialogTitle>自动滚动设置</DialogTitle>
          <DialogDescription>调整台词滚动属性与辅助显示选项。设置会立即生效。</DialogDescription>
        </DialogHeader>
        <div className="grid gap-0 md:grid-cols-[1fr_1.1fr]">
          <section className="space-y-4 px-6 py-5">
            <div className="text-sm font-semibold text-foreground">显示与排版</div>

            <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/[0.18] p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm font-medium text-foreground">字号</div>
                <NumberStepper value={props.fontSize} onChange={props.onFontSizeChange} min={28} max={88} step={2} />
              </div>

              <div className="h-px bg-border/70" />

              <div className="flex items-center justify-between gap-4">
                <div className="text-sm font-medium text-foreground">行距</div>
                <NumberStepper
                  value={props.lineHeight}
                  onChange={props.onLineHeightChange}
                  min={1.2}
                  max={2.4}
                  step={0.05}
                  formatValue={(value) => value.toFixed(2)}
                />
              </div>

              <div className="h-px bg-border/70" />

              <div className="flex items-center justify-between gap-4">
                <div className="text-sm font-medium text-foreground">滚动方向</div>
                <Select
                  value={props.direction}
                  onChange={props.onDirectionChange}
                  size="compact"
                  className="w-[120px]"
                  options={[
                    { value: "up", label: "向上滚动" },
                    { value: "down", label: "向下滚动" },
                  ]}
                />
              </div>

              <div className="h-px bg-border/70" />

              <div className="flex items-center justify-between gap-4 pt-0.5">
                <div className="text-sm font-medium text-foreground">镜像显示</div>
                <Toggle checked={props.mirrorDisplay} onChange={props.onMirrorDisplayChange} />
              </div>

              <div className="h-px bg-border/70" />

              <div className="flex items-center justify-between gap-4">
                <div className="text-sm font-medium text-foreground">高亮当前行</div>
                <Toggle checked={props.highlightLine} onChange={props.onHighlightLineChange} />
              </div>
            </div>
          </section>

          <section className="border-t border-border/70 px-6 py-5 md:border-t-0 md:border-l">
            <div className="mb-4 text-sm font-semibold text-foreground">滚动与速度</div>

            <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/[0.18] p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm font-medium text-foreground">滚动速度</div>
                <NumberStepper
                  value={props.speed}
                  onChange={props.onSpeedChange}
                  min={0.25}
                  max={5}
                  step={0.25}
                  formatValue={(value) => value.toFixed(2)}
                />
              </div>

              <div className="h-px bg-border/70" />

              <div className="flex items-center justify-between gap-4">
                <div className="text-sm font-medium text-foreground">倒计时</div>
                <Select
                  value={props.countdown}
                  onChange={props.onCountdownChange}
                  size="compact"
                  className="w-[100px]"
                  options={[
                    { value: "off", label: "关闭" },
                    { value: "on", label: "开启" },
                  ]}
                />
              </div>

              <div className="h-px bg-border/70" />

              <div
                className={cn(
                  "flex items-center justify-between gap-4 transition-all duration-200",
                  props.countdown === "off" && "pointer-events-none opacity-40",
                )}
              >
                <div className="text-sm font-medium text-foreground">倒计时长</div>
                <NumberStepper
                  value={props.countdownSeconds}
                  onChange={props.onCountdownSecondsChange}
                  min={0}
                  max={10}
                  step={1}
                />
              </div>

              <div className="h-px bg-border/70" />

              <div className="flex items-center justify-between gap-4 pt-0.5">
                <div className="text-sm font-medium text-foreground">平滑滚动</div>
                <Toggle checked={props.smoothScroll} onChange={props.onSmoothScrollChange} />
              </div>

              <div className="h-px bg-border/70" />

              <div className="flex items-center justify-between gap-4">
                <div className="text-sm font-medium text-foreground">循环播放</div>
                <Toggle checked={props.loopPlayback} onChange={props.onLoopPlaybackChange} />
              </div>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

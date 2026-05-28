"use client"

import { BadgeInfo, Mic, Pause, Play, RotateCcw, Square, Type } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { SpeechProvider } from "../transcribers"
import type { FollowStatus } from "../utils/follow-state-machine"
import { ProviderSelector } from "./provider-selector"
import { statusLabels } from "./follow-status-labels"
import { VoiceWaveform } from "./voice-waveform"

type FollowStatusPanelProps = {
  visibleStatus: FollowStatus
  followStatus: FollowStatus
  isMicActive: boolean
  speechProvider: SpeechProvider
  speechSupported: boolean
  isOnScript: boolean
  confidence: number
  displayTranscript: string
  visibleMessage: string | null
  fontSize: number
  lineHeight: number
  showFunAsr: boolean
  funasrReady: boolean
  funasrStarting: boolean
  onFontSizeChange: (value: number) => void
  onLineHeightChange: (value: number) => void
  onStartFollowing: () => void
  onPauseFollowing: () => void
  onResumeFollowing: () => void
  onStopFollowing: () => void
  onReturnToStart: () => void
  onStartFunAsr: () => void
  onSelectWebSpeech: () => void
}

export function FollowStatusPanel({
  visibleStatus,
  followStatus,
  isMicActive,
  speechProvider,
  speechSupported,
  isOnScript,
  confidence,
  displayTranscript,
  visibleMessage,
  fontSize,
  lineHeight,
  showFunAsr,
  funasrReady,
  funasrStarting,
  onFontSizeChange,
  onLineHeightChange,
  onStartFollowing,
  onPauseFollowing,
  onResumeFollowing,
  onStopFollowing,
  onReturnToStart,
  onStartFunAsr,
  onSelectWebSpeech,
}: FollowStatusPanelProps) {
  return (
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
                <VoiceWaveform status={visibleStatus} isMicActive={isMicActive} />
              </span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant={speechSupported ? "secondary" : "destructive"}>
                {speechSupported ? (speechProvider === "funasr" ? "FunASR" : "浏览器识别") : "不支持识别"}
              </Badge>
              <span>{statusLabels[visibleStatus]}</span>
              <span>{isOnScript ? "匹配成功" : "等待匹配"}</span>
            </div>
          </div>

          <div className="min-w-[360px] flex-[2_1_420px] rounded-2xl border border-border/70 bg-muted/25 p-3">
            <div className="grid gap-2 sm:grid-cols-4">
              {followStatus === "paused" ? (
                <Button onClick={onResumeFollowing} className="h-11 gap-2 sm:col-span-2">
                  <Play className="h-4 w-4" />
                  继续跟读
                </Button>
              ) : (
                <Button onClick={onStartFollowing} className="h-11 gap-2 sm:col-span-2">
                  <Mic className="h-4 w-4" />
                  开始跟读
                </Button>
              )}
              <Button variant="outline" onClick={onPauseFollowing} className="h-11 gap-2" disabled={followStatus === "idle"}>
                <Pause className="h-4 w-4" />
                暂停
              </Button>
              <Button variant="outline" onClick={onStopFollowing} className="h-11 gap-2">
                <Square className="h-4 w-4" />
                停止
              </Button>
              <Button variant="outline" onClick={onReturnToStart} className="h-10 gap-2 sm:col-span-4">
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
                    onChange={(event) => onFontSizeChange(Number(event.target.value))}
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
                    onChange={(event) => onLineHeightChange(Number(event.target.value))}
                  />
                </label>
              </div>
            </div>

            <ProviderSelector
              showFunAsr={showFunAsr}
              funasrReady={funasrReady}
              funasrStarting={funasrStarting}
              speechProvider={speechProvider}
              onStartFunAsr={onStartFunAsr}
              onSelectWebSpeech={onSelectWebSpeech}
            />
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-border/70 bg-muted/25 px-4 py-3 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex items-center gap-2 text-foreground">
              <BadgeInfo className="h-4 w-4 text-brand" />
              识别状态
            </div>
            <div>置信度 {Math.round(confidence * 100)}%</div>
          </div>
          <div className="mt-2 rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-sm leading-6 text-foreground">
            <div className="mb-1 text-[11px] text-muted-foreground">识别文本</div>
            <div className="max-h-24 overflow-y-auto whitespace-pre-wrap break-all">
              {displayTranscript || "暂无"}
            </div>
          </div>
          {visibleMessage && (
            <div className="mt-2 rounded-xl border border-warning/35 bg-warning/10 px-3 py-2 text-warning-foreground">
              {visibleMessage}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

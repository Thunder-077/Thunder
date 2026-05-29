"use client"

import { HelpCircle, Mic, Pause, RotateCcw, Settings, Square } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { SherpaModel } from "@/lib/platform"
import type { SpeechProvider } from "../transcribers"
import type { FollowStatus } from "../utils/follow-state-machine"
import { ProviderSelector } from "./provider-selector"
import { statusLabels } from "./follow-status-labels"
import { VoiceWaveform } from "./voice-waveform"
import { NumberStepper } from "./number-stepper"

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
  totalSegments: number
  visibleCurrentIndex: number
  showFunAsr: boolean
  showSherpa: boolean
  funasrReady: boolean
  funasrStarting: boolean
  sherpaReady: boolean
  sherpaBusy: boolean
  sherpaLoading: boolean
  sherpaModels: SherpaModel[]
  selectedSherpaModelId: string | null
  downloadProgress: Record<string, { percentage: number; downloadedText: string; totalText: string; status?: string }>
  onFontSizeChange: (value: number) => void
  onLineHeightChange: (value: number) => void
  onStartFollowing: () => void
  onPauseFollowing: () => void
  onResumeFollowing: () => void
  onStopFollowing: () => void
  onReturnToStart: () => void
  onStartFunAsr: () => void
  onSelectSherpa: () => void
  onSelectWebSpeech: () => void
  onSelectSherpaModel: (value: string) => void
  onRefreshSherpaModels: () => void
  onDownloadSelectedSherpaModel: () => void
  onActivateSelectedSherpaModel: () => void
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
  totalSegments,
  visibleCurrentIndex,
  showFunAsr,
  showSherpa,
  funasrReady,
  funasrStarting,
  sherpaReady,
  sherpaBusy,
  sherpaLoading,
  sherpaModels,
  selectedSherpaModelId,
  downloadProgress,
  onFontSizeChange,
  onLineHeightChange,
  onStartFollowing,
  onPauseFollowing,
  onResumeFollowing,
  onStopFollowing,
  onReturnToStart,
  onStartFunAsr,
  onSelectSherpa,
  onSelectWebSpeech,
  onSelectSherpaModel,
  onRefreshSherpaModels,
  onDownloadSelectedSherpaModel,
  onActivateSelectedSherpaModel,
}: FollowStatusPanelProps) {
  const progressPercent = totalSegments > 0 ? Math.round(((visibleCurrentIndex + 1) / totalSegments) * 100) : 0

  return (
    <div className="space-y-3">
      {/* ── 第一行：跟读控制 + 识别引擎 ── */}
      <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr]">
        {/* ── 左：跟读控制 ── */}
        <Card size="sm" className="bg-card/50">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold">跟读控制</div>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
              >
                <Settings className="h-3.5 w-3.5" />
                跟读设置
              </button>
            </div>

            <div className="flex flex-col md:flex-row gap-5 items-center justify-between">
              <div className="flex-1 space-y-2.5">
                <p className="text-xs text-muted-foreground leading-normal">
                  请跟随提示逐句跟读，系统将识别您的语音进度。
                </p>
                <div className="flex items-center gap-2 text-xs">
                  <span className={cn(
                    "h-2.5 w-2.5 rounded-full transition-all duration-300",
                    (visibleStatus === "following" || visibleStatus === "listening") ? "bg-success animate-pulse" : "bg-muted-foreground/40"
                  )} />
                  <span className="text-muted-foreground">麦克风状态:</span>
                  <span className="font-semibold text-foreground">
                    {(visibleStatus === "following" || visibleStatus === "listening") ? "正在监听" : "未监听"}
                  </span>
                  {(visibleStatus === "following" || visibleStatus === "listening") && (
                    <div className="h-4 flex items-center">
                      <VoiceWaveform status={visibleStatus} isMicActive={isMicActive} />
                    </div>
                  )}
                  {!speechSupported && (
                    <Badge variant="destructive" className="ml-auto text-[9px] h-4 px-1.5 py-0">不支持识别</Badge>
                  )}
                </div>
              </div>

              <div className="flex-1 w-full space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  {followStatus === "paused" ? (
                    <Button onClick={onResumeFollowing} className="h-9 gap-1 text-xs bg-primary text-primary-foreground hover:bg-primary/95 shadow-sm">
                      <Mic className="h-3.5 w-3.5" />
                      开始跟读
                    </Button>
                  ) : (
                    <Button onClick={onStartFollowing} className="h-9 gap-1 text-xs bg-primary text-primary-foreground hover:bg-primary/95 shadow-sm">
                      <Mic className="h-3.5 w-3.5" />
                      开始跟读
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={onPauseFollowing}
                    disabled={followStatus === "idle"}
                    className="h-9 gap-1 text-xs"
                  >
                    <Pause className="h-3.5 w-3.5" />
                    暂停
                  </Button>
                  <Button
                    variant="outline"
                    onClick={onStopFollowing}
                    className="h-9 gap-1 text-xs text-destructive border-destructive/20 hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Square className="h-3.5 w-3.5 fill-destructive/80 stroke-none" />
                    停止
                  </Button>
                </div>
                <Button variant="outline" onClick={onReturnToStart} className="h-9 w-full gap-1.5 text-xs">
                  <RotateCcw className="h-3.5 w-3.5" />
                  回到开头
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── 右：识别引擎 ── */}
        <Card size="sm" className="bg-card/50">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-1">
              <div className="text-sm font-bold">识别引擎</div>
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help hover:text-primary transition-colors" />
            </div>

            <ProviderSelector
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
              speechProvider={speechProvider}
              onStartFunAsr={onStartFunAsr}
              onSelectSherpa={onSelectSherpa}
              onSelectWebSpeech={onSelectWebSpeech}
              onSelectSherpaModel={onSelectSherpaModel}
              onRefreshSherpaModels={onRefreshSherpaModels}
              onDownloadSelectedSherpaModel={onDownloadSelectedSherpaModel}
              onActivateSelectedSherpaModel={onActivateSelectedSherpaModel}
            />
          </CardContent>
        </Card>
      </div>

      {/* ── 第二行：显示设置 + 识别状态 + 识别文本 ── */}
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.5fr]">
        {/* ── 左：显示设置 ── */}
        <Card size="sm" className="bg-card/50">
          <CardContent className="p-4 space-y-3">
            <div className="text-sm font-bold">显示设置</div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1.5">
                <span className="text-xs text-muted-foreground">字号</span>
                <NumberStepper value={fontSize} onChange={onFontSizeChange} min={28} max={88} step={2} />
              </div>
              <div className="space-y-1.5">
                <span className="text-xs text-muted-foreground">行距</span>
                <NumberStepper value={lineHeight} onChange={onLineHeightChange} min={1.2} max={2.4} step={0.05} formatValue={(v) => v.toFixed(2)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── 中：识别状态 ── */}
        <Card size="sm" className="bg-card/50">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-sm font-bold text-primary">
                <span className="flex gap-0.5 items-end h-3">
                  <span className="w-[3px] bg-primary rounded-full animate-[bounce_0.8s_infinite_100ms] h-2" />
                  <span className="w-[3px] bg-primary rounded-full animate-[bounce_0.8s_infinite_200ms] h-3" />
                  <span className="w-[3px] bg-primary rounded-full animate-[bounce_0.8s_infinite_300ms] h-1.5" />
                </span>
                识别状态
              </div>
              <Badge
                variant="secondary"
                className={cn(
                  "text-[10px] px-2 py-0.5",
                  (visibleStatus === "following" || visibleStatus === "listening")
                    ? "bg-primary/10 text-primary border-primary/20"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {statusLabels[visibleStatus]}
              </Badge>
            </div>

            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  置信度 <span className="font-semibold text-foreground">{Math.round(confidence * 100)}%</span>
                  <span className="text-muted-foreground/30">|</span>
                  <span className={cn("font-medium transition-colors", isOnScript ? "text-success" : "text-muted-foreground/60")}>
                    {isOnScript ? "已匹配" : "等待匹配"}
                  </span>
                </span>
                <span>
                  进度 <span className="font-semibold text-foreground">{progressPercent}%</span>
                  <span className="opacity-80"> (第 {Math.min(visibleCurrentIndex + 1, totalSegments)}/{totalSegments} 行)</span>
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted/60">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── 右：识别文本 ── */}
        <Card size="sm" className="bg-card/50">
          <CardContent className="p-4 space-y-2">
            <div className="text-sm font-bold flex items-center gap-1">
              识别文本 <span className="text-xs font-normal text-muted-foreground/60">(实时)</span>
            </div>

            <div className="h-[4.5rem] overflow-y-auto rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-xs leading-normal select-text">
              {displayTranscript ? (
                <p className="text-foreground transition-all duration-300">{displayTranscript}</p>
              ) : (
                <p className="text-muted-foreground/50 italic">等待语音输入...</p>
              )}
            </div>

            {visibleMessage && (
              <div className="rounded-lg border border-warning/35 bg-warning/10 px-3 py-1.5 text-[11px] text-warning-foreground animate-pulse">
                {visibleMessage}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

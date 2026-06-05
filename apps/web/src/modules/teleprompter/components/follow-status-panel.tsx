"use client"

import { Pause, Play, RotateCcw, Settings2, Square } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { SherpaModel } from "@/lib/platform"
import type { SpeechProvider } from "../transcribers"
import type { FollowStatus } from "../utils/follow-state-machine"
import { FollowSettingsDialog } from "./follow-settings-dialog"
import { statusLabels } from "./follow-status-labels"
import { VoiceWaveform } from "./voice-waveform"

type FollowStatusPanelProps = {
  visibleStatus: FollowStatus
  followStatus: FollowStatus
  isMicActive: boolean
  speechProvider: SpeechProvider
  speechSupported: boolean
  fontSize: number
  lineHeight: number
  enablePrediction: boolean
  showSherpa: boolean
  sherpaReady: boolean
  sherpaBusy: boolean
  sherpaLoading: boolean
  sherpaModels: SherpaModel[]
  selectedSherpaModelId: string | null
  downloadProgress: Record<string, { percentage: number; downloadedText: string; totalText: string; status?: string }>
  onFontSizeChange: (value: number) => void
  onLineHeightChange: (value: number) => void
  onEnablePredictionChange: (value: boolean) => void
  onStartFollowing: () => void
  onPauseFollowing: () => void
  onResumeFollowing: () => void
  onStopFollowing: () => void
  onReturnToStart: () => void
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
  fontSize,
  lineHeight,
  enablePrediction,
  showSherpa,
  sherpaReady,
  sherpaBusy,
  sherpaLoading,
  sherpaModels,
  selectedSherpaModelId,
  downloadProgress,
  onFontSizeChange,
  onLineHeightChange,
  onEnablePredictionChange,
  onStartFollowing,
  onPauseFollowing,
  onResumeFollowing,
  onStopFollowing,
  onReturnToStart,
  onSelectSherpa,
  onSelectWebSpeech,
  onSelectSherpaModel,
  onRefreshSherpaModels,
  onDownloadSelectedSherpaModel,
  onActivateSelectedSherpaModel,
}: FollowStatusPanelProps) {
  return (
    <div className="space-y-3">
      {/* ── 操作栏（顶部水平条） ── */}
      <Card size="sm">
        <CardContent className="p-3 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-xs">
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
              <Badge variant="destructive" className="text-[9px] h-4 px-1.5 py-0">不支持识别</Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(followStatus === "following" || followStatus === "listening") ? (
              <Button onClick={onPauseFollowing} className="h-8 gap-1.5 text-xs shadow-sm px-3">
                <Pause className="h-3.5 w-3.5" />
                暂停
              </Button>
            ) : (
              <Button onClick={followStatus === "paused" ? onResumeFollowing : onStartFollowing} className="h-8 gap-1.5 text-xs shadow-sm px-3">
                <Play className="h-3.5 w-3.5 fill-current" />
                {followStatus === "paused" ? "继续" : "开始"}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={onStopFollowing}
              className="h-8 gap-1.5 text-xs text-destructive border-destructive/20 hover:bg-destructive/10 hover:text-destructive px-3"
            >
              <Square className="h-3.5 w-3.5 fill-destructive/80 stroke-none" />
              停止
            </Button>
            <Button variant="outline" onClick={onReturnToStart} className="h-8 gap-1.5 text-xs px-3">
              <RotateCcw className="h-3.5 w-3.5" />
              回到开头
            </Button>
          </div>

          <FollowSettingsDialog
            fontSize={fontSize}
            lineHeight={lineHeight}
            enablePrediction={enablePrediction}
            speechProvider={speechProvider}
            showSherpa={showSherpa}
            sherpaReady={sherpaReady}
            sherpaBusy={sherpaBusy}
            sherpaLoading={sherpaLoading}
            sherpaModels={sherpaModels}
            selectedSherpaModelId={selectedSherpaModelId}
            downloadProgress={downloadProgress}
            onFontSizeChange={onFontSizeChange}
            onLineHeightChange={onLineHeightChange}
            onEnablePredictionChange={onEnablePredictionChange}
            onSelectSherpa={onSelectSherpa}
            onSelectWebSpeech={onSelectWebSpeech}
            onSelectSherpaModel={onSelectSherpaModel}
            onRefreshSherpaModels={onRefreshSherpaModels}
            onDownloadSelectedSherpaModel={onDownloadSelectedSherpaModel}
            onActivateSelectedSherpaModel={onActivateSelectedSherpaModel}
            trigger={(
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <Settings2 className="h-3.5 w-3.5" />
                跟读设置
              </Button>
            )}
          />
        </CardContent>
      </Card>
    </div>
  )
}

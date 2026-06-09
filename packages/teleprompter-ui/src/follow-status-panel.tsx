"use client"

import { Pause, Play, RotateCcw, Settings2, Square } from "lucide-react"
import type { FollowStatus } from "../../teleprompter-core/src/index"
import {
  TeleprompterSpeechDownloadProgress,
  TeleprompterSpeechModel,
  TeleprompterSpeechProvider,
} from "./speech-ui-types"
import { FollowSettingsDialog } from "./follow-settings-dialog"
import { statusLabels } from "./follow-status-labels"
import { VoiceWaveform } from "./voice-waveform"
import { Button, Card, CardContent, cn } from "@thunder/ui"

type FollowStatusPanelProps = {
  visibleStatus: FollowStatus
  followStatus: FollowStatus
  isMicActive: boolean
  speechProvider: TeleprompterSpeechProvider
  speechSupported: boolean
  fontSize: number
  lineHeight: number
  enablePrediction: boolean
  showSherpa: boolean
  sherpaReady: boolean
  sherpaBusy: boolean
  sherpaLoading: boolean
  sherpaModels: TeleprompterSpeechModel[]
  selectedSherpaModelId: string | null
  downloadProgress: TeleprompterSpeechDownloadProgress
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

export function FollowStatusPanel(props: FollowStatusPanelProps) {
  return (
    <div className="space-y-3">
      <Card size="sm">
        <CardContent className="flex flex-col items-center justify-between gap-4 p-3 md:flex-row">
          <div className="flex items-center gap-2.5 text-xs">
            <span
              className={cn(
                "h-2.5 w-2.5 rounded-full transition-all duration-300",
                props.visibleStatus === "following" || props.visibleStatus === "listening"
                  ? "bg-success animate-pulse"
                  : "bg-muted-foreground/40",
              )}
            />
            <span className="text-muted-foreground">麦克风状态:</span>
            <span className="font-semibold text-foreground">
              {props.visibleStatus === "following" || props.visibleStatus === "listening" ? "正在监听" : "未监听"}
            </span>
            {(props.visibleStatus === "following" || props.visibleStatus === "listening") && (
              <div className="flex h-4 items-center">
                <VoiceWaveform status={props.visibleStatus} isMicActive={props.isMicActive} />
              </div>
            )}
            {!props.speechSupported && (
              <span className="rounded-full bg-destructive/10 px-1.5 py-0 text-[9px] text-destructive">不支持识别</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {props.followStatus === "following" || props.followStatus === "listening" ? (
              <Button onClick={props.onPauseFollowing} className="h-8 gap-1.5 px-3 text-xs shadow-sm">
                <Pause className="h-3.5 w-3.5" />
                暂停
              </Button>
            ) : (
              <Button
                onClick={props.followStatus === "paused" ? props.onResumeFollowing : props.onStartFollowing}
                className="h-8 gap-1.5 px-3 text-xs shadow-sm"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                {props.followStatus === "paused" ? "继续" : "开始"}
              </Button>
            )}
            <Button
              onClick={props.onStopFollowing}
              variant="destructive-outline"
              className="h-8 gap-1.5 px-3 text-xs"
            >
              <Square className="h-3.5 w-3.5 fill-destructive/80 stroke-none" />
              停止
            </Button>
            <Button
              onClick={props.onReturnToStart}
              variant="outline"
              className="h-8 gap-1.5 px-3 text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              回到开头
            </Button>
          </div>

          <FollowSettingsDialog
            fontSize={props.fontSize}
            lineHeight={props.lineHeight}
            enablePrediction={props.enablePrediction}
            speechProvider={props.speechProvider}
            showSherpa={props.showSherpa}
            sherpaReady={props.sherpaReady}
            sherpaBusy={props.sherpaBusy}
            sherpaLoading={props.sherpaLoading}
            sherpaModels={props.sherpaModels}
            selectedSherpaModelId={props.selectedSherpaModelId}
            downloadProgress={props.downloadProgress}
            onFontSizeChange={props.onFontSizeChange}
            onLineHeightChange={props.onLineHeightChange}
            onEnablePredictionChange={props.onEnablePredictionChange}
            onSelectSherpa={props.onSelectSherpa}
            onSelectWebSpeech={props.onSelectWebSpeech}
            onSelectSherpaModel={props.onSelectSherpaModel}
            onRefreshSherpaModels={props.onRefreshSherpaModels}
            onDownloadSelectedSherpaModel={props.onDownloadSelectedSherpaModel}
            onActivateSelectedSherpaModel={props.onActivateSelectedSherpaModel}
            trigger={(
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground">
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

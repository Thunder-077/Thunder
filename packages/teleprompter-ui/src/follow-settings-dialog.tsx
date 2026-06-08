"use client"

import type { ReactElement } from "react"
import {
  TeleprompterSpeechDownloadProgress,
  TeleprompterSpeechModel,
  TeleprompterSpeechProvider,
} from "./speech-ui-types"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Toggle,
} from "@thunder/ui"
import { NumberStepper } from "./number-stepper"
import { ProviderSelector } from "./provider-selector"

type FollowSettingsDialogProps = {
  fontSize: number
  lineHeight: number
  enablePrediction: boolean
  speechProvider: TeleprompterSpeechProvider
  showSherpa: boolean
  sherpaReady: boolean
  sherpaBusy: boolean
  sherpaLoading: boolean
  sherpaModels: TeleprompterSpeechModel[]
  selectedSherpaModelId: string | null
  downloadProgress: TeleprompterSpeechDownloadProgress
  trigger: ReactElement
  onFontSizeChange: (value: number) => void
  onLineHeightChange: (value: number) => void
  onEnablePredictionChange: (value: boolean) => void
  onSelectSherpa: () => void
  onSelectWebSpeech: () => void
  onSelectSherpaModel: (value: string) => void
  onRefreshSherpaModels: () => void
  onDownloadSelectedSherpaModel: () => void
  onActivateSelectedSherpaModel: () => void
}

export function FollowSettingsDialog(props: FollowSettingsDialogProps) {
  return (
    <Dialog>
      <DialogTrigger render={props.trigger} />
      <DialogContent className="max-w-[720px] gap-0 overflow-hidden p-0 sm:max-w-[720px]">
        <DialogHeader className="border-b border-border/70 bg-background/95 px-6 py-5">
          <DialogTitle>跟读设置</DialogTitle>
          <DialogDescription>调整提词显示和识别引擎。设置会立即生效。</DialogDescription>
        </DialogHeader>
        <div className="grid gap-0 md:grid-cols-[0.95fr_1.25fr]">
          <section className="space-y-4 self-start px-6 py-5">
            <div className="text-sm font-semibold text-foreground">显示</div>

            <div className="max-w-[280px] space-y-3 rounded-2xl border border-border/70 bg-muted/[0.18] px-4 py-3.5">
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
                <label className="flex flex-col gap-0.5">
                  <div className="text-sm font-medium text-foreground">语速预测</div>
                  <div className="text-[11px] leading-tight text-muted-foreground/70">根据语速预判推进位置</div>
                </label>
                <Toggle checked={props.enablePrediction} onChange={props.onEnablePredictionChange} />
              </div>
            </div>
          </section>

          <section className="border-t border-border/70 px-6 py-5 md:border-t-0 md:border-l">
            <div className="mb-4 text-sm font-semibold text-foreground">识别引擎</div>

            <ProviderSelector
              showSherpa={props.showSherpa}
              sherpaReady={props.sherpaReady}
              sherpaBusy={props.sherpaBusy}
              sherpaLoading={props.sherpaLoading}
              sherpaModels={props.sherpaModels}
              selectedSherpaModelId={props.selectedSherpaModelId}
              downloadProgress={props.downloadProgress}
              speechProvider={props.speechProvider}
              onSelectSherpa={props.onSelectSherpa}
              onSelectWebSpeech={props.onSelectWebSpeech}
              onSelectSherpaModel={props.onSelectSherpaModel}
              onRefreshSherpaModels={props.onRefreshSherpaModels}
              onDownloadSelectedSherpaModel={props.onDownloadSelectedSherpaModel}
              onActivateSelectedSherpaModel={props.onActivateSelectedSherpaModel}
            />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

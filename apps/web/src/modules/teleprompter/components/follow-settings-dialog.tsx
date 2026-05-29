"use client"

import type { ReactElement } from "react"
import { Monitor, Radio, Settings2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import type { SherpaModel } from "@/lib/platform"
import type { SpeechProvider } from "../transcribers"
import { NumberStepper } from "./number-stepper"
import { ProviderSelector } from "./provider-selector"

type FollowSettingsDialogProps = {
  fontSize: number
  lineHeight: number
  speechProvider: SpeechProvider
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
  trigger: ReactElement
  onFontSizeChange: (value: number) => void
  onLineHeightChange: (value: number) => void
  onStartFunAsr: () => void
  onSelectSherpa: () => void
  onSelectWebSpeech: () => void
  onSelectSherpaModel: (value: string) => void
  onRefreshSherpaModels: () => void
  onDownloadSelectedSherpaModel: () => void
  onActivateSelectedSherpaModel: () => void
}

export function FollowSettingsDialog({
  fontSize,
  lineHeight,
  speechProvider,
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
  trigger,
  onFontSizeChange,
  onLineHeightChange,
  onStartFunAsr,
  onSelectSherpa,
  onSelectWebSpeech,
  onSelectSherpaModel,
  onRefreshSherpaModels,
  onDownloadSelectedSherpaModel,
  onActivateSelectedSherpaModel,
}: FollowSettingsDialogProps) {
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
              <DialogTitle className="text-lg font-semibold">跟读设置</DialogTitle>
              <DialogDescription className="mt-1 text-xs leading-5">
                调整提词显示和识别引擎。设置会立即生效。
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-0 md:grid-cols-[0.95fr_1.25fr]">
          <section className="space-y-4 px-6 py-5 self-start">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Monitor className="h-4 w-4 text-muted-foreground" />
              显示
            </div>

            <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/[0.18] py-3.5 px-4 max-w-[280px]">
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
            </div>
          </section>

          <section className="border-t border-border/70 px-6 py-5 md:border-t-0 md:border-l">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Radio className="h-4 w-4 text-muted-foreground" />
              识别引擎
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
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

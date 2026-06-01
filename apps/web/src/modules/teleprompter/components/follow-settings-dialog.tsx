"use client"

import { useEffect, useState, type ReactElement } from "react"
import { Monitor, Radio, Settings2, X, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import type { SherpaModel } from "@/lib/platform"
import type { SpeechProvider } from "../transcribers"
import { NumberStepper } from "./number-stepper"
import { ProviderSelector } from "./provider-selector"

type FollowSettingsDialogProps = {
  fontSize: number
  lineHeight: number
  enablePrediction: boolean
  speechProvider: SpeechProvider
  showSherpa: boolean
  sherpaReady: boolean
  sherpaBusy: boolean
  sherpaLoading: boolean
  sherpaModels: SherpaModel[]
  selectedSherpaModelId: string | null
  downloadProgress: Record<string, { percentage: number; downloadedText: string; totalText: string; status?: string }>
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

export function FollowSettingsDialog({
  fontSize,
  lineHeight,
  enablePrediction,
  speechProvider,
  showSherpa,
  sherpaReady,
  sherpaBusy,
  sherpaLoading,
  sherpaModels,
  selectedSherpaModelId,
  downloadProgress,
  trigger,
  onFontSizeChange,
  onLineHeightChange,
  onEnablePredictionChange,
  onSelectSherpa,
  onSelectWebSpeech,
  onSelectSherpaModel,
  onRefreshSherpaModels,
  onDownloadSelectedSherpaModel,
  onActivateSelectedSherpaModel,
}: FollowSettingsDialogProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false)
      }
    }

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", handleKeyDown)

    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  return (
    <>
      <span
        className="inline-flex"
        onClick={() => setOpen(true)}
      >
        {trigger}
      </span>
      {open && (
        <div
          className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-foreground/10 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative grid max-h-[calc(100vh-2rem)] w-full max-w-[720px] gap-0 overflow-hidden rounded-[20px] border border-border/70 bg-background text-sm text-popover-foreground shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border/70 bg-background/95 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 bg-muted/40">
                  <Settings2 className="h-4.5 w-4.5 text-foreground" />
                </div>
                <div>
                  <div className="text-lg font-semibold text-foreground">跟读设置</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">
                    调整提词显示和识别引擎。设置会立即生效。
                  </div>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="-mr-1 shrink-0"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-0 overflow-y-auto md:grid-cols-[0.95fr_1.25fr]">
              <section className="space-y-4 self-start px-6 py-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Monitor className="h-4 w-4 text-muted-foreground" />
                  显示
                </div>

                <div className="max-w-[280px] space-y-3 rounded-2xl border border-border/70 bg-muted/[0.18] px-4 py-3.5">
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
                    <label className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                        语速预测
                      </div>
                      <div className="text-[11px] leading-tight text-muted-foreground/70">
                        根据语速预判推进位置
                      </div>
                    </label>
                    <Switch
                      size="sm"
                      checked={enablePrediction}
                      onCheckedChange={onEnablePredictionChange}
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
                  showSherpa={showSherpa}
                  sherpaReady={sherpaReady}
                  sherpaBusy={sherpaBusy}
                  sherpaLoading={sherpaLoading}
                  sherpaModels={sherpaModels}
                  selectedSherpaModelId={selectedSherpaModelId}
                  downloadProgress={downloadProgress}
                  speechProvider={speechProvider}
                  onSelectSherpa={onSelectSherpa}
                  onSelectWebSpeech={onSelectWebSpeech}
                  onSelectSherpaModel={onSelectSherpaModel}
                  onRefreshSherpaModels={onRefreshSherpaModels}
                  onDownloadSelectedSherpaModel={onDownloadSelectedSherpaModel}
                  onActivateSelectedSherpaModel={onActivateSelectedSherpaModel}
                />
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

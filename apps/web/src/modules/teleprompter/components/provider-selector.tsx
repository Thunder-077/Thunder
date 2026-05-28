"use client"

import { Download, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, type SelectOption } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { SherpaModel } from "@/lib/platform"
import type { SpeechProvider } from "../transcribers"

type ProviderSelectorProps = {
  showFunAsr: boolean
  showSherpa: boolean
  funasrReady: boolean
  funasrStarting: boolean
  sherpaReady: boolean
  sherpaStarting: boolean
  sherpaBusy: boolean
  sherpaLoading: boolean
  sherpaModels: SherpaModel[]
  selectedSherpaModelId: string | null
  speechProvider: SpeechProvider
  onStartFunAsr: () => void
  onStartSherpa: () => void
  onSelectWebSpeech: () => void
  onSelectSherpaModel: (value: string) => void
  onRefreshSherpaModels: () => void
  onDownloadSelectedSherpaModel: () => void
  onActivateSelectedSherpaModel: () => void
}

export function ProviderSelector({
  showFunAsr,
  showSherpa,
  funasrReady,
  funasrStarting,
  sherpaReady,
  sherpaStarting,
  sherpaBusy,
  sherpaLoading,
  sherpaModels,
  selectedSherpaModelId,
  speechProvider,
  onStartFunAsr,
  onStartSherpa,
  onSelectWebSpeech,
  onSelectSherpaModel,
  onRefreshSherpaModels,
  onDownloadSelectedSherpaModel,
  onActivateSelectedSherpaModel,
}: ProviderSelectorProps) {
  const sherpaOptions: SelectOption[] = sherpaModels.map((model) => ({
    value: model.id,
    label: model.name,
    description: `${model.language} · ${model.installed ? (model.active ? "已激活" : "已下载") : "未下载"}`,
  }))
  const selectedSherpaModel = sherpaModels.find((model) => model.id === selectedSherpaModelId) ?? null

  return (
    <div className="min-w-0 rounded-2xl border border-border/70 bg-background/60 p-3">
      <div className="mb-3 text-xs font-medium text-muted-foreground">识别引擎</div>
      <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/30 p-1">
        {showSherpa && (
          <button
            type="button"
            disabled={sherpaStarting}
            onClick={onStartSherpa}
            className={cn(
              "h-8 min-w-0 flex-1 truncate rounded-lg border px-3 text-xs font-semibold transition-all",
              speechProvider === "sherpa-onnx"
                ? "border-primary/35 bg-primary text-primary-foreground shadow-sm"
                : sherpaStarting
                  ? "cursor-not-allowed border-transparent text-muted-foreground/50"
                  : "border-transparent text-muted-foreground hover:bg-background/70 hover:text-foreground"
            )}
          >
            {sherpaStarting ? "启动中…" : sherpaReady ? "Sherpa ONNX · 已就绪" : "Sherpa ONNX"}
          </button>
        )}
        {showFunAsr && (
          <button
            type="button"
            disabled={funasrStarting}
            onClick={onStartFunAsr}
            className={cn(
              "h-8 min-w-0 flex-1 truncate rounded-lg border px-3 text-xs font-semibold transition-all",
              speechProvider === "funasr"
                ? "border-primary/35 bg-primary text-primary-foreground shadow-sm"
                : funasrStarting
                  ? "cursor-not-allowed border-transparent text-muted-foreground/50"
                  : "border-transparent text-muted-foreground hover:bg-background/70 hover:text-foreground"
            )}
          >
            {funasrStarting ? "启动中…" : funasrReady ? "FunASR · 已就绪" : "FunASR"}
          </button>
        )}
        <button
          type="button"
          onClick={onSelectWebSpeech}
          className={cn(
            "h-8 min-w-0 flex-1 truncate rounded-lg border px-3 text-xs font-semibold transition-all",
            speechProvider === "web-speech"
              ? "border-primary/35 bg-primary text-primary-foreground shadow-sm"
              : "border-transparent text-muted-foreground hover:bg-background/70 hover:text-foreground"
          )}
        >
          Web Speech
        </button>
      </div>

      {showSherpa && (
        <div className="mt-3 space-y-2 rounded-xl border border-border/70 bg-muted/20 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-medium text-muted-foreground">Sherpa 模型</div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onRefreshSherpaModels}
              disabled={sherpaLoading || sherpaBusy}
              title="刷新模型状态"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", sherpaLoading && "animate-spin")} />
            </Button>
          </div>

          <Select
            value={selectedSherpaModelId}
            onChange={onSelectSherpaModel}
            options={sherpaOptions}
            size="compact"
            placeholder={sherpaLoading ? "加载模型中…" : "选择可下载模型"}
            disabled={sherpaLoading || sherpaModels.length === 0}
            className="w-full"
          />

          {selectedSherpaModel && (
            <>
              <div className="text-[11px] leading-5 text-muted-foreground">{selectedSherpaModel.description}</div>
              {!selectedSherpaModel.installed ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onDownloadSelectedSherpaModel}
                  disabled={sherpaBusy}
                  className="h-8 w-full gap-2 text-xs"
                >
                  <Download className="h-3.5 w-3.5" />
                  下载并设为当前
                </Button>
              ) : !selectedSherpaModel.active ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onActivateSelectedSherpaModel}
                  disabled={sherpaBusy}
                  className="h-8 w-full text-xs"
                >
                  设为当前模型
                </Button>
              ) : (
                <div className="text-[11px] text-emerald-600">当前已激活，可直接启动 sherpa-onnx。</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

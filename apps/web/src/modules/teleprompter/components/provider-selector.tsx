"use client"

import { Check, Download, RefreshCw } from "lucide-react"
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
  sherpaBusy: boolean
  sherpaLoading: boolean
  sherpaModels: SherpaModel[]
  selectedSherpaModelId: string | null
  downloadProgress: Record<string, { percentage: number; downloadedText: string; totalText: string; status?: string }>
  speechProvider: SpeechProvider
  onStartFunAsr: () => void
  onSelectSherpa: () => void
  onSelectWebSpeech: () => void
  onSelectSherpaModel: (value: string) => void
  onRefreshSherpaModels: () => void
  onDownloadSelectedSherpaModel: () => void
  onActivateSelectedSherpaModel: () => void
}

export function ProviderSelector({
  showFunAsr,
  showSherpa,
  funasrStarting,
  sherpaBusy,
  sherpaLoading,
  sherpaModels,
  selectedSherpaModelId,
  downloadProgress,
  speechProvider,
  onStartFunAsr,
  onSelectSherpa,
  onSelectWebSpeech,
  onSelectSherpaModel,
  onRefreshSherpaModels,
  onDownloadSelectedSherpaModel,
  onActivateSelectedSherpaModel,
}: ProviderSelectorProps) {
  const installedSherpaModels = sherpaModels.filter((model) => model.installed)
  const sherpaOptions: SelectOption[] = sherpaModels.map((model) => ({
    value: model.id,
    label: `${model.name} (${model.size})`,
  }))
  const selectedSherpaModel = sherpaModels.find((model) => model.id === selectedSherpaModelId) ?? null
  const showSherpaPanel = showSherpa && speechProvider === "sherpa-onnx"
  const hasInstalledSherpaModel = installedSherpaModels.length > 0
  const selectedModelProgress = selectedSherpaModelId ? downloadProgress[selectedSherpaModelId] : null

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2.5">
        {showSherpa && (
          <button
            type="button"
            onClick={onSelectSherpa}
            className={cn(
              "relative flex items-center justify-center rounded-xl border p-2 text-center transition-all h-12 cursor-pointer select-none",
              speechProvider === "sherpa-onnx"
                ? "border-primary bg-primary/5 text-primary shadow-[0_0_0_1px_rgba(59,130,246,0.1)]"
                : "border-border bg-background text-muted-foreground hover:bg-muted/40 hover:border-muted-foreground/30"
            )}
          >
            <span className="text-xs font-bold leading-tight">Sherpa ONNX</span>
            {speechProvider === "sherpa-onnx" && (
              <span className="absolute bottom-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                <Check className="h-2.5 w-2.5 stroke-[3]" />
              </span>
            )}
          </button>
        )}

        {showFunAsr && (
          <button
            type="button"
            disabled={funasrStarting}
            onClick={onStartFunAsr}
            className={cn(
              "relative flex items-center justify-center rounded-xl border p-2 text-center transition-all h-12 cursor-pointer select-none",
              speechProvider === "funasr"
                ? "border-primary bg-primary/5 text-primary shadow-[0_0_0_1px_rgba(59,130,246,0.1)]"
                : funasrStarting
                  ? "cursor-not-allowed border-transparent opacity-50 bg-muted/20 text-muted-foreground/50"
                  : "border-border bg-background text-muted-foreground hover:bg-muted/40 hover:border-muted-foreground/30"
            )}
          >
            <span className="text-xs font-bold leading-tight">FunASR</span>
            {speechProvider === "funasr" && (
              <span className="absolute bottom-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                <Check className="h-2.5 w-2.5 stroke-[3]" />
              </span>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={onSelectWebSpeech}
          className={cn(
            "relative flex items-center justify-center rounded-xl border p-2 text-center transition-all h-12 cursor-pointer select-none",
            speechProvider === "web-speech"
              ? "border-primary bg-primary/5 text-primary shadow-[0_0_0_1px_rgba(59,130,246,0.1)]"
              : "border-border bg-background text-muted-foreground hover:bg-muted/40 hover:border-muted-foreground/30"
          )}
        >
          <span className="text-xs font-bold leading-tight">Web Speech</span>
          {speechProvider === "web-speech" && (
            <span className="absolute bottom-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
              <Check className="h-2.5 w-2.5 stroke-[3]" />
            </span>
          )}
        </button>
      </div>

      {showSherpaPanel && (
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
            placeholder={sherpaLoading ? "加载模型中…" : sherpaModels.length === 0 ? "暂无模型" : "选择模型"}
            disabled={sherpaLoading || sherpaModels.length === 0}
            className="w-full"
          />

          {!hasInstalledSherpaModel && (
            <div className="text-[11px] text-muted-foreground">暂无模型，不可用 Sherpa ONNX 引擎。</div>
          )}

          {selectedSherpaModel && (
            <>
              {selectedSherpaModel.downloading ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled
                  className="h-8 w-full gap-2 text-xs font-mono"
                >
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  {selectedModelProgress 
                    ? selectedModelProgress.status === "extracting"
                      ? "正在解压并激活模型，请稍候…"
                      : `正在后台下载并激活 (${selectedModelProgress.percentage}% - ${selectedModelProgress.downloadedText}/${selectedModelProgress.totalText})`
                    : "正在后台下载并激活…"}
                </Button>
              ) : !selectedSherpaModel.installed ? (
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

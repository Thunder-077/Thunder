"use client"

import { Check, Download, RefreshCw } from "lucide-react"
import { Button, cn, SegmentedControl, Select } from "@thunder/ui"
import type {
  TeleprompterSpeechDownloadProgress,
  TeleprompterSpeechModel,
  TeleprompterSpeechProvider,
} from "./speech-ui-types"

type ProviderSelectorProps = {
  showSherpa: boolean
  sherpaReady: boolean
  sherpaBusy: boolean
  sherpaLoading: boolean
  sherpaModels: TeleprompterSpeechModel[]
  selectedSherpaModelId: string | null
  downloadProgress: TeleprompterSpeechDownloadProgress
  speechProvider: TeleprompterSpeechProvider
  onSelectSherpa: () => void
  onSelectWebSpeech: () => void
  onSelectSherpaModel: (value: string) => void
  onRefreshSherpaModels: () => void
  onDownloadSelectedSherpaModel: () => void
  onActivateSelectedSherpaModel: () => void
}

export function ProviderSelector({
  showSherpa,
  sherpaBusy,
  sherpaLoading,
  sherpaModels,
  selectedSherpaModelId,
  downloadProgress,
  speechProvider,
  onSelectSherpa,
  onSelectWebSpeech,
  onSelectSherpaModel,
  onRefreshSherpaModels,
  onDownloadSelectedSherpaModel,
  onActivateSelectedSherpaModel,
}: ProviderSelectorProps) {
  const installedSherpaModels = sherpaModels.filter((model) => model.installed)
  const selectedSherpaModel = sherpaModels.find((model) => model.id === selectedSherpaModelId) ?? null
  const showSherpaPanel = showSherpa && speechProvider === "sherpa-onnx"
  const hasInstalledSherpaModel = installedSherpaModels.length > 0
  const selectedModelProgress = selectedSherpaModelId ? downloadProgress[selectedSherpaModelId] : null

  return (
    <div className="space-y-3">
      <SegmentedControl
        value={speechProvider}
        onChange={(value) => {
          if (value === "sherpa-onnx") {
            onSelectSherpa()
            return
          }
          onSelectWebSpeech()
        }}
        options={[
          ...(showSherpa
            ? [
                {
                  value: "sherpa-onnx",
                  label: (
                    <>
                      <span className="text-xs font-bold leading-tight">Sherpa ONNX</span>
                      {speechProvider === "sherpa-onnx" ? (
                        <span className="absolute bottom-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                          <Check className="h-2.5 w-2.5 stroke-[3]" />
                        </span>
                      ) : null}
                    </>
                  ),
                },
              ]
            : []),
          {
            value: "web-speech",
            label: (
              <>
                <span className="text-xs font-bold leading-tight">Web Speech</span>
                {speechProvider === "web-speech" ? (
                  <span className="absolute bottom-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                    <Check className="h-2.5 w-2.5 stroke-[3]" />
                  </span>
                ) : null}
              </>
            ),
          },
        ]}
      />

      {showSherpaPanel && (
        <div className="mt-3 space-y-2 rounded-xl border border-border/70 bg-muted/20 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-medium text-muted-foreground">Sherpa 模型</div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onRefreshSherpaModels}
              disabled={sherpaLoading || sherpaBusy}
              className="h-7 w-7"
              title="刷新模型状态"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", sherpaLoading && "animate-spin")} />
            </Button>
          </div>

          <Select
            value={selectedSherpaModelId ?? ""}
            onChange={(value) => {
              if (value) onSelectSherpaModel(value)
            }}
            disabled={sherpaLoading || sherpaModels.length === 0}
            size="compact"
            placeholder={sherpaLoading ? "加载模型中…" : sherpaModels.length === 0 ? "暂无模型" : "选择模型"}
            options={sherpaModels.map((model) => ({
              value: model.id,
              label: `${model.name} (${model.size})`,
            }))}
          />

          {!hasInstalledSherpaModel && (
            <div className="text-[11px] text-muted-foreground">暂无模型，不可用 Sherpa ONNX 引擎。</div>
          )}

          {selectedSherpaModel && (
            <>
              {selectedSherpaModel.downloading ? (
                <Button
                  variant="outline"
                  className="h-8 w-full gap-2 text-xs font-mono"
                  disabled
                >
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  {selectedModelProgress
                    ? selectedModelProgress.status === "extracting"
                      ? "正在解压并激活模型，请稍候…"
                      : `正在下载并激活 (${selectedModelProgress.percentage}% - ${selectedModelProgress.downloadedText}/${selectedModelProgress.totalText})`
                    : "正在下载并激活…"}
                </Button>
              ) : !selectedSherpaModel.installed ? (
                <Button
                  variant="outline"
                  className="h-8 w-full gap-2 text-xs"
                  onClick={onDownloadSelectedSherpaModel}
                  disabled={sherpaBusy}
                >
                  <Download className="h-3.5 w-3.5" />
                  下载并设为当前
                </Button>
              ) : !selectedSherpaModel.active ? (
                <Button
                  variant="outline"
                  className="h-8 w-full text-xs"
                  onClick={onActivateSelectedSherpaModel}
                  disabled={sherpaBusy}
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

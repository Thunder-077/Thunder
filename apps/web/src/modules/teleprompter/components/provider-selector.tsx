"use client"

import { cn } from "@/lib/utils"
import type { SpeechProvider } from "../transcribers"

type ProviderSelectorProps = {
  showFunAsr: boolean
  funasrReady: boolean
  funasrStarting: boolean
  speechProvider: SpeechProvider
  onStartFunAsr: () => void
  onSelectWebSpeech: () => void
}

export function ProviderSelector({
  showFunAsr,
  funasrReady,
  funasrStarting,
  speechProvider,
  onStartFunAsr,
  onSelectWebSpeech,
}: ProviderSelectorProps) {
  return (
    <div className="min-w-0 rounded-2xl border border-border/70 bg-background/60 p-3">
      <div className="mb-3 text-xs font-medium text-muted-foreground">识别引擎</div>
      <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/30 p-1">
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
    </div>
  )
}

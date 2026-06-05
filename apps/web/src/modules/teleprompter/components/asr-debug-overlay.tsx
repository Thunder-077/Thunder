"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { FollowStatus } from "../utils/follow-state-machine"
import { statusLabels } from "./follow-status-labels"

type AsrDebugOverlayProps = {
  visibleStatus: FollowStatus
  speechSupported: boolean
  isOnScript: boolean
  confidence: number
  displayTranscript: string
  visibleMessage: string | null
}

export function AsrDebugOverlay({
  visibleStatus,
  speechSupported,
  isOnScript,
  confidence,
  displayTranscript,
  visibleMessage,
}: AsrDebugOverlayProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-40 flex max-w-[min(26rem,calc(100vw-2rem))] flex-col items-end gap-2">
      {expanded && (
        <div className="pointer-events-auto w-full rounded-2xl border border-border/70 bg-background/95 p-4 shadow-[0_16px_48px_rgba(15,23,42,0.18)] backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              ASR 调试
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                DEV
              </Badge>
            </div>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setExpanded(false)}>
              收起
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              状态
              <Badge
                variant="secondary"
                className={cn(
                  "h-5 px-2 text-[10px]",
                  (visibleStatus === "following" || visibleStatus === "listening")
                    ? "bg-primary/10 text-primary border-primary/20"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {statusLabels[visibleStatus]}
              </Badge>
            </span>
            <span>置信度 <span className="font-semibold text-foreground">{Math.round(confidence * 100)}%</span></span>
            <span className={cn("font-medium", isOnScript ? "text-success" : "text-muted-foreground")}>
              {isOnScript ? "已匹配" : "等待匹配"}
            </span>
            {!speechSupported && (
              <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                不支持识别
              </Badge>
            )}
          </div>

          <div className="mt-3 rounded-xl border border-border/50 bg-background/70 px-3 py-2 text-xs leading-normal">
            <div className="mb-1 flex items-center gap-1 text-xs font-medium text-foreground">
              识别文本 <span className="font-normal text-muted-foreground/60">(实时)</span>
            </div>
            <div className="max-h-28 overflow-y-auto select-text whitespace-pre-wrap break-words">
              {displayTranscript ? (
                <p className="text-foreground transition-all duration-300">{displayTranscript}</p>
              ) : (
                <p className="text-muted-foreground/50 italic">等待语音输入...</p>
              )}
            </div>
          </div>

          {visibleMessage && (
            <div className="mt-3 rounded-lg border border-warning/35 bg-warning/10 px-3 py-1.5 text-[11px] text-warning-foreground">
              {visibleMessage}
            </div>
          )}
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        className="pointer-events-auto h-8 rounded-full border-border/70 bg-background/95 px-3 text-xs shadow-sm backdrop-blur"
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? "隐藏 ASR 调试" : "ASR 调试"}
      </Button>
    </div>
  )
}

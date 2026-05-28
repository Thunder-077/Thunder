"use client"

import type { ClipboardEvent, FormEvent, RefObject } from "react"
import { Maximize2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ScriptSegment } from "../utils/script-segmenter"
import { getSegmentTextStartOffset } from "../utils/follow-engine"
import type { FollowStatus } from "../utils/follow-state-machine"
import { statusLabels } from "./follow-status-labels"
import { VoiceWaveform } from "./voice-waveform"

type PrompterStageProps = {
  stageRef: RefObject<HTMLDivElement | null>
  prompterViewportRef: RefObject<HTMLDivElement | null>
  segmentRefs: RefObject<Array<HTMLParagraphElement | null>>
  script: string
  segments: ScriptSegment[]
  fontSize: number
  lineHeight: number
  visibleStatus: FollowStatus
  visibleCurrentIndex: number
  visibleReadOffset: number
  isFullscreen: boolean
  onToggleFullscreen: () => void
  onPrompterPaste: (event: ClipboardEvent<HTMLDivElement>) => void
  onEmptyPrompterInput: (event: FormEvent<HTMLDivElement>) => void
  onCalibrateToCharacter: (selectedIndex: number, selectedOffset: number) => void
}

export function PrompterStage({
  stageRef,
  prompterViewportRef,
  segmentRefs,
  script,
  segments,
  fontSize,
  lineHeight,
  visibleStatus,
  visibleCurrentIndex,
  visibleReadOffset,
  isFullscreen,
  onToggleFullscreen,
  onPrompterPaste,
  onEmptyPrompterInput,
  onCalibrateToCharacter,
}: PrompterStageProps) {
  return (
    <section
      ref={stageRef}
      className="relative flex h-[72vh] min-h-[680px] flex-col overflow-hidden rounded-[2rem] border shadow-2xl fullscreen:h-screen fullscreen:min-h-screen fullscreen:rounded-none fullscreen:border-0"
      style={{
        backgroundColor: "oklch(0.1 0.018 252)",
        borderColor: "oklch(0.28 0.03 252)",
        color: "oklch(0.94 0.004 252)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 18% 10%, oklch(0.62 0.16 250 / 0.2), transparent 34%), radial-gradient(circle at 82% 0%, oklch(0.78 0.14 78 / 0.16), transparent 30%), linear-gradient(180deg, oklch(1 0 0 / 0.04), transparent 36%)",
        }}
      />
      <div className="relative z-10 flex items-center justify-between gap-3 border-b border-border/30 px-5 py-3">
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <VoiceWaveform status={visibleStatus} />
          <span className="font-medium tracking-wide">{statusLabels[visibleStatus]}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onToggleFullscreen} className="text-slate-200 hover:bg-muted/20 hover:text-foreground">
          <Maximize2 className="h-4 w-4" />
          {isFullscreen ? "还原提词" : "全屏提词"}
        </Button>
      </div>

      <div
        ref={prompterViewportRef}
        role="textbox"
        aria-label="提词稿输入和跟读显示区"
        tabIndex={0}
        onPaste={onPrompterPaste}
        className="relative z-10 min-h-0 flex-1 overflow-y-auto px-5 py-16 outline-none sm:px-10 lg:px-16"
      >
        {segments.length === 0 ? (
          <div
            contentEditable
            suppressContentEditableWarning
            onInput={onEmptyPrompterInput}
            data-placeholder="点击这里输入或粘贴提词稿"
            className="mx-auto flex min-h-full max-w-5xl items-center justify-center whitespace-pre-wrap text-center text-lg font-medium text-slate-200 outline-none empty:before:text-slate-500 empty:before:content-[attr(data-placeholder)]"
          />
        ) : (
          <div
            className="mx-auto max-w-5xl font-serif tracking-wide"
            style={{
              fontSize,
              lineHeight,
            }}
          >
            {segments.map((segment, index) => {
              const textStartOffset = getSegmentTextStartOffset(script, segment)

              return (
                <p
                  key={segment.id}
                  ref={(node) => {
                    segmentRefs.current[index] = node
                  }}
                  className={cn(
                    "my-8 scroll-m-40 rounded-2xl px-4 py-2 transition-all duration-300",
                    index === visibleCurrentIndex && "bg-amber-300/18 shadow-[0_0_42px_rgba(251,191,36,0.14)]"
                  )}
                >
                  {Array.from(segment.raw).map((char, charIndex) => {
                    const absoluteOffset = textStartOffset + charIndex
                    const isRead = absoluteOffset < visibleReadOffset
                    const isCurrentChar = absoluteOffset === visibleReadOffset && index === visibleCurrentIndex

                    return (
                      <button
                        key={`${segment.id}-${absoluteOffset}`}
                        type="button"
                        data-offset={absoluteOffset}
                        onClick={() => onCalibrateToCharacter(index, absoluteOffset)}
                        className={cn(
                          "inline cursor-pointer appearance-none rounded-sm border-0 bg-transparent px-0.5 py-0 text-left font-[inherit] leading-[inherit] transition-colors hover:bg-muted/20",
                          isRead && "text-slate-500/70",
                          !isRead && "text-slate-100",
                          isCurrentChar && "bg-amber-300/25 text-amber-50"
                        )}
                      >
                        {char}
                      </button>
                    )
                  })}
                </p>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

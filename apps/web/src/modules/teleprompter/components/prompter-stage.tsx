"use client"

import type { ClipboardEvent, KeyboardEvent, RefObject } from "react"
import { Check, Maximize2, PencilLine } from "lucide-react"
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
  scriptDraft: string
  segments: ScriptSegment[]
  isEditingScript: boolean
  fontSize: number
  lineHeight: number
  visibleStatus: FollowStatus
  isMicActive: boolean
  visibleCurrentIndex: number
  visibleReadOffset: number
  isFullscreen: boolean
  onToggleFullscreen: () => void
  onBeginScriptEditing: () => void
  onPrompterPaste: (event: ClipboardEvent<HTMLDivElement>) => void
  onDraftScriptChange: (value: string) => void
  onDraftScriptCommit: () => void
  onCalibrateToCharacter: (selectedIndex: number, selectedOffset: number) => void
}

export function PrompterStage({
  stageRef,
  prompterViewportRef,
  segmentRefs,
  script,
  scriptDraft,
  segments,
  isEditingScript,
  fontSize,
  lineHeight,
  visibleStatus,
  isMicActive,
  visibleCurrentIndex,
  visibleReadOffset,
  isFullscreen,
  onToggleFullscreen,
  onBeginScriptEditing,
  onPrompterPaste,
  onDraftScriptChange,
  onDraftScriptCommit,
  onCalibrateToCharacter,
}: PrompterStageProps) {
  const handleDraftKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault()
      onDraftScriptCommit()
    }
  }

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
          <VoiceWaveform status={visibleStatus} isMicActive={isMicActive} />
          <span className="font-medium tracking-wide">{statusLabels[visibleStatus]}</span>
        </div>
        <div className="flex items-center gap-2">
          {script ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={isEditingScript ? onDraftScriptCommit : onBeginScriptEditing}
              className="text-slate-200 hover:bg-muted/20 hover:text-foreground"
            >
              {isEditingScript ? <Check className="h-4 w-4" /> : <PencilLine className="h-4 w-4" />}
              {isEditingScript ? "保存稿件" : "编辑稿件"}
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={onToggleFullscreen} className="text-slate-200 hover:bg-muted/20 hover:text-foreground">
            <Maximize2 className="h-4 w-4" />
            {isFullscreen ? "还原提词" : "全屏提词"}
          </Button>
        </div>
      </div>

      <div
        ref={prompterViewportRef}
        role="textbox"
        aria-label="提词稿输入和跟读显示区"
        tabIndex={0}
        onPaste={onPrompterPaste}
        className="relative z-10 min-h-0 flex-1 overflow-y-auto px-5 py-16 outline-none sm:px-10 lg:px-16"
      >
        {segments.length === 0 || isEditingScript ? (
          <div className="mx-auto flex min-h-full w-full max-w-5xl items-center justify-center">
            <textarea
              value={scriptDraft}
              onChange={(event) => onDraftScriptChange(event.target.value)}
              onBlur={onDraftScriptCommit}
              onKeyDown={handleDraftKeyDown}
              placeholder="点击这里输入或粘贴提词稿，失焦或 Ctrl+Enter 后开始提词"
              className="min-h-[60vh] w-full resize-none border-0 bg-transparent text-center text-lg font-medium leading-9 text-slate-200 outline-none placeholder:text-slate-500"
            />
          </div>
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
                    const charEndOffset = absoluteOffset + 1
                    const isRead = charEndOffset < visibleReadOffset
                    const isCurrentChar = charEndOffset === visibleReadOffset && index === visibleCurrentIndex

                    return (
                      <button
                        key={`${segment.id}-${charEndOffset}`}
                        type="button"
                        data-offset={charEndOffset}
                        onClick={() => onCalibrateToCharacter(index, charEndOffset)}
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

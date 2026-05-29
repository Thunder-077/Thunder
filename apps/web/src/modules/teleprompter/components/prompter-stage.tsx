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

type TeleprompterMode = "follow-read" | "auto-scroll"

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
  viewportHeight: number
  visibleStatus: FollowStatus
  isMicActive: boolean
  visibleCurrentIndex: number
  visibleReadOffset: number
  isFullscreen: boolean
  mode: TeleprompterMode
  autoScrollMirrorDisplay: boolean
  autoScrollHighlightLine: boolean
  autoScrollActiveIndex: number
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
  viewportHeight,
  visibleStatus,
  isMicActive,
  visibleCurrentIndex,
  visibleReadOffset,
  isFullscreen,
  mode,
  autoScrollMirrorDisplay,
  autoScrollHighlightLine,
  autoScrollActiveIndex,
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

  const totalSegments = segments.length
  const stageCurrentIndex = mode === "auto-scroll" ? autoScrollActiveIndex : visibleCurrentIndex
  const progressPercent = totalSegments > 0
    ? Math.round(((stageCurrentIndex + 1) / totalSegments) * 100)
    : 0

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
      {/* ── 装饰渐变 ── */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 18% 10%, oklch(0.62 0.16 250 / 0.2), transparent 34%), radial-gradient(circle at 82% 0%, oklch(0.78 0.14 78 / 0.16), transparent 30%), linear-gradient(180deg, oklch(1 0 0 / 0.04), transparent 36%)",
        }}
      />

      {/* ── 顶部状态栏 ── */}
      <div className="relative z-10 flex items-center justify-between gap-3 border-b border-border/30 px-5 py-3">
        <div className="flex items-center gap-3 text-sm text-slate-300">
          {mode === "follow-read" ? (
            <>
              <VoiceWaveform status={visibleStatus} isMicActive={isMicActive} />
              <span className="font-medium tracking-wide">{statusLabels[visibleStatus]}</span>
            </>
          ) : (
            <>
              <span className={cn(
                "h-2 w-2 rounded-full",
                "bg-slate-500"
              )} />
              <span className="font-medium tracking-wide">自动滚动</span>
            </>
          )}
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
            {isFullscreen ? "还原" : "全屏"}
          </Button>
        </div>
      </div>

      {/* ── 滚动内容区 ── */}
      <div
        ref={prompterViewportRef}
        role="textbox"
        aria-label="提词稿输入和跟读显示区"
        tabIndex={0}
        onPaste={onPrompterPaste}
        className={cn(
          "relative z-10 min-h-0 flex-1 overflow-y-auto px-5 pt-6 pb-24 outline-none sm:px-10 lg:px-16",
          mode === "auto-scroll" && autoScrollMirrorDisplay && "[transform:scaleX(-1)]"
        )}
      >
        {segments.length === 0 || isEditingScript ? (
          <div className="mx-auto flex min-h-full w-full max-w-5xl items-center justify-center">
            <textarea
              value={scriptDraft}
              onChange={(event) => onDraftScriptChange(event.target.value)}
              onBlur={onDraftScriptCommit}
              onKeyDown={handleDraftKeyDown}
              placeholder="点击这里输入或粘贴提词稿。"
              className="min-h-[60vh] w-full resize-none border-0 bg-transparent text-center text-lg font-medium leading-9 text-slate-200 outline-none placeholder:text-slate-500"
            />
          </div>
        ) : (
          <div
            className="mx-auto max-w-5xl font-serif tracking-wide"
            style={{
              fontSize,
              lineHeight,
              paddingTop: viewportHeight ? `${viewportHeight / 3}px` : "33vh",
              paddingBottom: viewportHeight ? `${viewportHeight * 0.7}px` : "70vh",
            }}
          >
            {segments.map((segment, index) => {
              const textStartOffset = getSegmentTextStartOffset(script, segment)
              const isFollowActive = mode === "follow-read" && index === visibleCurrentIndex
              const isAutoScrollActive = mode === "auto-scroll" && autoScrollHighlightLine && index === autoScrollActiveIndex

              return (
                <div key={segment.id} className="my-3 flex items-center gap-5">
                  {/* ── 行号 ── */}
                  <span
                    className={cn(
                      "w-8 shrink-0 select-none text-right font-mono text-sm leading-[inherit]",
                      isFollowActive || isAutoScrollActive ? "text-cyan-300 animate-pulse" : "text-slate-600"
                    )}
                  >
                    {index + 1}
                  </span>

                  {/* ── 段落内容（保留逐字跟随 + 点击校准） ── */}
                  <p
                    ref={(node) => {
                      segmentRefs.current[index] = node
                    }}
                    className={cn(
                      "flex-1 scroll-m-40 rounded-xl border-l-[3px] border-transparent px-4 py-2 transition-all duration-300",
                      isFollowActive && "border-l-cyan-400/80 bg-cyan-500/10 shadow-[0_0_42px_rgba(34,211,238,0.08)]",
                      isAutoScrollActive && "border-l-cyan-400/50 bg-cyan-500/5"
                    )}
                  >
                    {Array.from(segment.raw).map((char, charIndex) => {
                      const absoluteOffset = textStartOffset + charIndex
                      const charEndOffset = absoluteOffset + 1
                      const isRead = mode === "follow-read"
                        ? charEndOffset < visibleReadOffset
                        : index < autoScrollActiveIndex
                      const isCurrentChar = charEndOffset === visibleReadOffset && index === visibleCurrentIndex

                      return (
                        <span
                          key={`${segment.id}-${charEndOffset}`}
                          data-offset={charEndOffset}
                          onClick={() => {
                            // 如果用户当前正在划选/选择文本，不触发进度校准
                            const selection = window.getSelection()?.toString()
                            if (selection && selection.length > 0) return
                            onCalibrateToCharacter(index, charEndOffset)
                          }}
                          className={cn(
                            "inline cursor-pointer rounded-sm px-0.5 py-0 text-left font-[inherit] leading-[inherit] transition-colors hover:bg-muted/20 select-text",
                            isRead && "text-slate-500/70",
                            !isRead && "text-slate-100",
                            isCurrentChar && "bg-cyan-400/25 text-cyan-50"
                          )}
                        >
                          {char}
                        </span>
                      )
                    })}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── 底部进度条 ── */}
      {segments.length > 0 && !isEditingScript && (
        <div className="absolute bottom-5 left-6 right-6 z-10">
          <div className="h-1 overflow-hidden rounded-full bg-border/20">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}
    </section>
  )
}

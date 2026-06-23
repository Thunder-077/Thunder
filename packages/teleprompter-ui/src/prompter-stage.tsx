"use client"

import { memo, useCallback, useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type RefObject } from "react"
import { Check, Maximize2, Minimize2, PencilLine, Pause, Play, RotateCcw, Square } from "lucide-react"
import { getSegmentTextStartOffset, type FollowStatus, type ScriptSegment } from "../../teleprompter-core/src/index"
import { TeleprompterDocumentEditor } from "./document-editor"
import { statusLabels } from "./follow-status-labels"
import { VoiceWaveform } from "./voice-waveform"
import { getAutoSegmentVisualState, getFollowSegmentVisualState } from "./prompter-segment-visual-state"
import { Button, cn } from "@thunder/ui"

type TeleprompterMode = "follow-read" | "auto-scroll"
type AutoScrollStatus = "idle" | "countdown" | "scrolling" | "paused"

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
  followStatus: FollowStatus
  autoScrollStatus: AutoScrollStatus
  onToggleFullscreen: () => void
  onBeginScriptEditing: () => void
  onPrompterPaste: (event: ClipboardEvent<HTMLDivElement>) => void
  onDraftScriptChange: (value: string) => void
  onDraftScriptCommit: () => void
  onCalibrateToCharacter: (selectedIndex: number, selectedOffset: number) => void
  onStartFollowing: () => void
  onPauseFollowing: () => void
  onResumeFollowing: () => void
  onStopFollowing: () => void
  onReturnToStart: () => void
  onAutoScrollStart: () => void
  onAutoScrollPause: () => void
  onAutoScrollStop: () => void
  onAutoScrollReset: () => void
}

const CONTROLS_HIDE_DELAY = 2500
const fullscreenStopButtonClass =
  "h-8 gap-1.5 border-destructive/35 bg-destructive/10 px-3 text-xs text-destructive shadow-none hover:border-destructive/50 hover:bg-destructive/20 hover:text-destructive"
const fullscreenResetButtonClass =
  "h-8 gap-1.5 border-primary-foreground/25 bg-primary-foreground/10 px-3 text-xs text-primary-foreground shadow-none hover:border-primary-foreground/40 hover:bg-primary-foreground/20 hover:text-primary-foreground"
const readCharClass = "text-slate-500/70"
const unreadCharClass = "text-slate-100"
const currentCharClasses = ["bg-cyan-400/25", "text-cyan-50"] as const

type PrompterCharVisualState = "read" | "current" | "unread"
type FollowDomVisualSnapshot = {
  index: number
  offset: number
  boundaryIndex: number | null
}

type PrompterSegmentRowProps = {
  segment: ScriptSegment
  index: number
  script: string
  segmentRefs: RefObject<Array<HTMLParagraphElement | null>>
  fontSize: number
  lineHeight: number
  mode: TeleprompterMode
  visibleCurrentIndex: number
  visibleReadOffset: number
  autoScrollActiveIndex: number
  autoScrollHighlightLine: boolean
  onCalibrateToCharacter: (selectedIndex: number, selectedOffset: number) => void
}

function getSegmentTextEndOffset(script: string, segment: ScriptSegment) {
  return getSegmentTextStartOffset(script, segment) + Array.from(segment.raw).length
}

function getPrompterSegmentVisualState(props: PrompterSegmentRowProps) {
  const textStartOffset = getSegmentTextStartOffset(props.script, props.segment)
  const textEndOffset = getSegmentTextEndOffset(props.script, props.segment)

  if (props.mode === "auto-scroll") {
    return getAutoSegmentVisualState({
      index: props.index,
      autoScrollActiveIndex: props.autoScrollActiveIndex,
      highlightLine: props.autoScrollHighlightLine,
    })
  }

  const followState = getFollowSegmentVisualState({
    index: props.index,
    segmentStartOffset: textStartOffset,
    segmentEndOffset: textEndOffset,
    visibleCurrentIndex: props.visibleCurrentIndex,
    visibleReadOffset: props.visibleReadOffset,
  })

  return followState
}

function getInitialCharVisualState(input: {
  mode: TeleprompterMode
  index: number
  charEndOffset: number
  visibleCurrentIndex: number
  visibleReadOffset: number
  autoScrollActiveIndex: number
}): PrompterCharVisualState {
  if (input.mode === "auto-scroll") {
    return input.index < input.autoScrollActiveIndex ? "read" : "unread"
  }

  if (input.charEndOffset <= input.visibleReadOffset) {
    return "read"
  }

  if (input.charEndOffset === input.visibleReadOffset + 1 && input.index === input.visibleCurrentIndex) {
    return "current"
  }

  return "unread"
}

function getPrompterCharVisualClass(state: PrompterCharVisualState) {
  if (state === "read") return readCharClass
  if (state === "current") return currentCharClasses.join(" ")
  return unreadCharClass
}

function setPrompterCharVisualState(element: HTMLElement, state: PrompterCharVisualState) {
  if (element.dataset.followVisual === state) return

  // 高频跟读动画只切换字符 class，不让 React 重新渲染整段字符。
  element.classList.remove(readCharClass, unreadCharClass, ...currentCharClasses)
  if (state === "current") {
    element.classList.add(...currentCharClasses)
  } else {
    element.classList.add(state === "read" ? readCharClass : unreadCharClass)
  }
  element.dataset.followVisual = state
}

function getSegmentCharElements(segmentEl: HTMLElement) {
  return Array.from(segmentEl.querySelectorAll<HTMLElement>("[data-offset]"))
}

function findSegmentIndexByOffset(segments: ScriptSegment[], script: string, offset: number) {
  return segments.findIndex((segment) => {
    const segmentStartOffset = getSegmentTextStartOffset(script, segment)
    const segmentEndOffset = getSegmentTextEndOffset(script, segment)
    return offset >= segmentStartOffset && offset <= segmentEndOffset
  })
}

function updateWholeSegmentVisualState(input: {
  segmentEl: HTMLElement | null | undefined
  index: number
  visibleCurrentIndex: number
  visibleReadOffset: number
}) {
  if (!input.segmentEl) return

  for (const charEl of getSegmentCharElements(input.segmentEl)) {
    const charEndOffset = Number(charEl.dataset.offset)
    if (!Number.isFinite(charEndOffset)) continue

    const state = input.index < input.visibleCurrentIndex
      ? "read"
      : input.index > input.visibleCurrentIndex
        ? "unread"
        : charEndOffset <= input.visibleReadOffset
          ? "read"
          : charEndOffset === input.visibleReadOffset + 1
            ? "current"
            : "unread"
    setPrompterCharVisualState(charEl, state)
  }
}

function updateActiveSegmentVisualRange(input: {
  segmentEl: HTMLElement | null | undefined
  previousOffset: number
  nextOffset: number
}) {
  if (!input.segmentEl) return

  if (input.nextOffset <= input.previousOffset) {
    updateWholeSegmentVisualState({
      segmentEl: input.segmentEl,
      index: 0,
      visibleCurrentIndex: 0,
      visibleReadOffset: input.nextOffset,
    })
    return
  }

  for (let offset = input.previousOffset + 1; offset <= input.nextOffset; offset += 1) {
    const charEl = input.segmentEl.querySelector<HTMLElement>(`[data-offset="${offset}"]`)
    if (charEl) {
      setPrompterCharVisualState(charEl, "read")
    }
  }

  const currentCharEl = input.segmentEl.querySelector<HTMLElement>(`[data-offset="${input.nextOffset + 1}"]`)
  if (currentCharEl) {
    setPrompterCharVisualState(currentCharEl, "current")
  }
}

function arePrompterSegmentRowsEqual(prev: PrompterSegmentRowProps, next: PrompterSegmentRowProps) {
  if (
    prev.segment !== next.segment
    || prev.script !== next.script
    || prev.fontSize !== next.fontSize
    || prev.lineHeight !== next.lineHeight
    || prev.mode !== next.mode
    || prev.segmentRefs !== next.segmentRefs
    || prev.onCalibrateToCharacter !== next.onCalibrateToCharacter
  ) {
    return false
  }

  // 长文本跟读时只让视觉状态真正变化的段落重渲染，避免每个字符偏移都刷新整篇稿件。
  return getPrompterSegmentVisualState(prev) === getPrompterSegmentVisualState(next)
}

const PrompterSegmentRow = memo(function PrompterSegmentRow({
  segment,
  index,
  script,
  segmentRefs,
  fontSize,
  lineHeight,
  mode,
  visibleCurrentIndex,
  visibleReadOffset,
  autoScrollActiveIndex,
  autoScrollHighlightLine,
  onCalibrateToCharacter,
}: PrompterSegmentRowProps) {
  const textStartOffset = getSegmentTextStartOffset(script, segment)
  const isFollowActive = mode === "follow-read" && index === visibleCurrentIndex
  const isAutoScrollActive = mode === "auto-scroll" && autoScrollHighlightLine && index === autoScrollActiveIndex

  return (
    <div className="flex items-start gap-5 py-3 first:pt-0">
      <span
        className={cn(
          "flex w-8 shrink-0 select-none items-center justify-end text-right font-mono text-sm",
          isFollowActive || isAutoScrollActive ? "text-cyan-300 animate-pulse" : "text-slate-600",
        )}
        style={{
          height: `${lineHeight * fontSize}px`,
          marginTop: "0.5rem",
        }}
      >
        {index + 1}
      </span>

      <p
        ref={(node) => {
          segmentRefs.current[index] = node
        }}
        className={cn(
          "flex-1 scroll-m-40 rounded-xl border-l-[3px] border-transparent px-4 py-2 transition-all duration-300",
          isFollowActive && "border-l-cyan-400/80 bg-cyan-500/10 shadow-[0_0_42px_rgba(34,211,238,0.08)]",
          isAutoScrollActive && "border-l-cyan-400/50 bg-cyan-500/5",
        )}
      >
        {Array.from(segment.raw).map((char, charIndex) => {
          const absoluteOffset = textStartOffset + charIndex
          const charEndOffset = absoluteOffset + 1
          const charVisualState = getInitialCharVisualState({
            mode,
            index,
            charEndOffset,
            visibleCurrentIndex,
            visibleReadOffset,
            autoScrollActiveIndex,
          })

          return (
            <span
              key={`${segment.id}-${charEndOffset}`}
              data-offset={charEndOffset}
              data-follow-visual={charVisualState}
              onClick={() => {
                const selection = window.getSelection()?.toString()
                if (selection && selection.length > 0) return
                onCalibrateToCharacter(index, charEndOffset)
              }}
              className={cn(
                "inline cursor-pointer rounded-sm px-0.5 py-0 text-left font-[inherit] leading-[inherit] transition-colors hover:bg-muted/20 select-text",
                getPrompterCharVisualClass(charVisualState),
              )}
            >
              {char}
            </span>
          )
        })}
      </p>
    </div>
  )
}, arePrompterSegmentRowsEqual)

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
  followStatus,
  autoScrollStatus,
  onToggleFullscreen,
  onBeginScriptEditing,
  onPrompterPaste,
  onDraftScriptChange,
  onDraftScriptCommit,
  onCalibrateToCharacter,
  onStartFollowing,
  onPauseFollowing,
  onResumeFollowing,
  onStopFollowing,
  onReturnToStart,
  onAutoScrollStart,
  onAutoScrollPause,
  onAutoScrollStop,
  onAutoScrollReset,
}: PrompterStageProps) {
  const [controlsVisible, setControlsVisible] = useState(true)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const followDomVisualRef = useRef<FollowDomVisualSnapshot | null>(null)

  const showControls = useCallback(() => {
    setControlsVisible(true)
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current)
    }
    hideTimerRef.current = setTimeout(() => {
      setControlsVisible(false)
    }, CONTROLS_HIDE_DELAY)
  }, [])

  useEffect(() => {
    if (!isFullscreen) {
      if (hideTimerRef.current !== null) {
        clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
      return
    }

    const initialShowTimer = window.setTimeout(showControls, 0)

    const stage = stageRef.current
    if (!stage) {
      return () => window.clearTimeout(initialShowTimer)
    }

    const onMouseMove = () => showControls()
    stage.addEventListener("mousemove", onMouseMove)
    stage.addEventListener("touchstart", onMouseMove)

    return () => {
      stage.removeEventListener("mousemove", onMouseMove)
      stage.removeEventListener("touchstart", onMouseMove)
      window.clearTimeout(initialShowTimer)
      if (hideTimerRef.current !== null) {
        clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
    }
  }, [isFullscreen, showControls, stageRef])

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

  const isFollowPlaying = followStatus === "following" || followStatus === "listening"
  const isAutoScrollPlaying = autoScrollStatus === "scrolling" || autoScrollStatus === "countdown"

  useEffect(() => {
    if (mode !== "follow-read" || isEditingScript || segments.length === 0) {
      followDomVisualRef.current = null
      return
    }

    const previous = followDomVisualRef.current
    const boundaryIndex = findSegmentIndexByOffset(segments, script, visibleReadOffset)
    const activeSegmentEl = segmentRefs.current[visibleCurrentIndex]
    const boundarySegmentEl = boundaryIndex >= 0 ? segmentRefs.current[boundaryIndex] : null
    const shouldRescanActiveSegment =
      !previous
      || previous.index !== visibleCurrentIndex
      || visibleReadOffset <= previous.offset
    const shouldRescanBoundarySegment =
      boundaryIndex >= 0
      && (
        !previous
        || previous.boundaryIndex !== boundaryIndex
        || previous.index !== visibleCurrentIndex
        || visibleReadOffset <= previous.offset
      )

    if (previous && previous.index !== visibleCurrentIndex) {
      updateWholeSegmentVisualState({
        segmentEl: segmentRefs.current[previous.index],
        index: previous.index,
        visibleCurrentIndex,
        visibleReadOffset,
      })
    }

    if (
      previous?.boundaryIndex !== null
      && previous?.boundaryIndex !== undefined
      && previous.boundaryIndex !== previous.index
      && previous.boundaryIndex !== visibleCurrentIndex
      && previous.boundaryIndex !== boundaryIndex
    ) {
      updateWholeSegmentVisualState({
        segmentEl: segmentRefs.current[previous.boundaryIndex],
        index: previous.boundaryIndex,
        visibleCurrentIndex,
        visibleReadOffset,
      })
    }

    if (shouldRescanActiveSegment) {
      updateWholeSegmentVisualState({
        segmentEl: activeSegmentEl,
        index: visibleCurrentIndex,
        visibleCurrentIndex,
        visibleReadOffset,
      })
    } else {
      updateActiveSegmentVisualRange({
        segmentEl: activeSegmentEl,
        previousOffset: previous.offset,
        nextOffset: visibleReadOffset,
      })
    }

    if (boundaryIndex >= 0 && boundaryIndex !== visibleCurrentIndex) {
      if (shouldRescanBoundarySegment) {
        updateWholeSegmentVisualState({
          segmentEl: boundarySegmentEl,
          index: boundaryIndex,
          visibleCurrentIndex,
          visibleReadOffset,
        })
      } else if (previous) {
        updateActiveSegmentVisualRange({
          segmentEl: boundarySegmentEl,
          previousOffset: previous.offset,
          nextOffset: visibleReadOffset,
        })
      }
    }

    followDomVisualRef.current = {
      index: visibleCurrentIndex,
      offset: visibleReadOffset,
      boundaryIndex,
    }
  }, [isEditingScript, mode, script, segmentRefs, segments, visibleCurrentIndex, visibleReadOffset])

  return (
    <section
      ref={stageRef}
      className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[2rem] border shadow-2xl fullscreen:h-screen fullscreen:min-h-screen fullscreen:rounded-none fullscreen:border-0"
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
          {mode === "follow-read" ? (
            <>
              <VoiceWaveform status={visibleStatus} isMicActive={isMicActive} />
              <span className="font-medium tracking-wide">{statusLabels[visibleStatus]}</span>
            </>
          ) : (
            <>
              <span className={cn("h-2 w-2 rounded-full", "bg-slate-500")} />
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
              {isEditingScript ? "保存" : "编辑"}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleFullscreen}
            className="text-slate-200 hover:bg-muted/20 hover:text-foreground"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            {isFullscreen ? "还原" : "全屏"}
          </Button>
        </div>
      </div>

      <div
        ref={prompterViewportRef}
        role="textbox"
        aria-label="提词稿输入和跟读显示区"
        tabIndex={0}
        onPaste={onPrompterPaste}
        className={cn(
          "relative z-10 min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-24 outline-none sm:px-10 lg:px-16",
          mode === "auto-scroll" && autoScrollMirrorDisplay && "[transform:scaleX(-1)]",
        )}
      >
        {segments.length === 0 || isEditingScript ? (
          <TeleprompterDocumentEditor
            value={scriptDraft}
            onChange={onDraftScriptChange}
            onBlur={onDraftScriptCommit}
            onKeyDown={handleDraftKeyDown}
            placeholder="点击这里输入或粘贴提词稿。"
            wrapperClassName="mx-auto flex min-h-full w-full max-w-5xl items-center justify-center"
            textareaClassName="min-h-[60vh] w-full resize-none border-0 bg-transparent text-center text-lg font-medium leading-9 text-slate-200 outline-none placeholder:text-slate-500"
          />
        ) : (
          <div
            className="mx-auto flex w-full max-w-5xl flex-col justify-start font-serif tracking-wide"
            style={{
              fontSize,
              lineHeight,
              paddingTop: 0,
              paddingBottom: viewportHeight ? `${viewportHeight * 0.7}px` : "70vh",
            }}
          >
            {segments.map((segment, index) => (
              <PrompterSegmentRow
                key={segment.id}
                segment={segment}
                index={index}
                script={script}
                segmentRefs={segmentRefs}
                fontSize={fontSize}
                lineHeight={lineHeight}
                mode={mode}
                visibleCurrentIndex={visibleCurrentIndex}
                visibleReadOffset={visibleReadOffset}
                autoScrollActiveIndex={autoScrollActiveIndex}
                autoScrollHighlightLine={autoScrollHighlightLine}
                onCalibrateToCharacter={onCalibrateToCharacter}
              />
            ))}
          </div>
        )}
      </div>

      {segments.length > 0 && !isEditingScript && (
        <div className={cn(
          "absolute bottom-5 left-6 right-6 z-10 transition-opacity duration-500",
          isFullscreen && !controlsVisible && "opacity-0",
        )}>
          <div className="h-1 overflow-hidden rounded-full bg-border/20">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      )}

      {isFullscreen && segments.length > 0 && !isEditingScript && (
        <div
          className={cn(
            "absolute bottom-8 left-1/2 z-20 -translate-x-1/2 transition-all duration-500",
            controlsVisible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
          )}
        >
          <div
            className="flex items-center gap-3 rounded-2xl border border-border/30 px-5 py-3 backdrop-blur-xl"
            style={{ backgroundColor: "oklch(0.12 0.02 252 / 0.85)" }}
          >
            {mode === "follow-read" ? (
              <>
                {isFollowPlaying ? (
                  <Button onClick={onPauseFollowing} className="h-8 gap-1.5 px-3 text-xs shadow-sm">
                    <Pause className="h-3.5 w-3.5" />
                    暂停
                  </Button>
                ) : (
                  <Button
                    onClick={followStatus === "paused" ? onResumeFollowing : onStartFollowing}
                    className="h-8 gap-1.5 px-3 text-xs shadow-sm"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    {followStatus === "paused" ? "继续" : "开始"}
                  </Button>
                )}
                <Button variant="ghost" onClick={onStopFollowing} className={fullscreenStopButtonClass}>
                  <Square className="h-3.5 w-3.5 fill-current stroke-none" />
                  停止
                </Button>
                <Button variant="ghost" onClick={onReturnToStart} className={fullscreenResetButtonClass}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  回到开头
                </Button>
              </>
            ) : (
              <>
                {isAutoScrollPlaying ? (
                  <Button onClick={onAutoScrollPause} className="h-8 gap-1.5 px-3 text-xs shadow-sm">
                    <Pause className="h-3.5 w-3.5" />
                    暂停
                  </Button>
                ) : (
                  <Button onClick={onAutoScrollStart} className="h-8 gap-1.5 px-3 text-xs shadow-sm">
                    <Play className="h-3.5 w-3.5 fill-current" />
                    {autoScrollStatus === "paused" ? "继续" : "开始"}
                  </Button>
                )}
                <Button variant="ghost" onClick={onAutoScrollStop} className={fullscreenStopButtonClass}>
                  <Square className="h-3.5 w-3.5 fill-current stroke-none" />
                  停止
                </Button>
                <Button variant="ghost" onClick={onAutoScrollReset} className={fullscreenResetButtonClass}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  回到开头
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

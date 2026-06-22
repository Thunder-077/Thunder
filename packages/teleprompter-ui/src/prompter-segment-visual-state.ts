export type PrompterSegmentVisualState = "read" | "partial" | "active" | "unread"

/**
 * 计算跟读模式下单个段落的视觉状态，用于判断长文本中哪些段落需要重渲染。
 */
export function getFollowSegmentVisualState(input: {
  index: number
  segmentStartOffset: number
  segmentEndOffset: number
  visibleCurrentIndex: number
  visibleReadOffset: number
}): PrompterSegmentVisualState {
  if (input.index === input.visibleCurrentIndex) {
    return "active"
  }

  if (input.visibleReadOffset <= input.segmentStartOffset) {
    return "unread"
  }

  if (input.visibleReadOffset > input.segmentEndOffset) {
    return "read"
  }

  return "partial"
}

/**
 * 计算自动滚动模式下单个段落的视觉状态，避免滚动进度变化时刷新无关段落。
 */
export function getAutoSegmentVisualState(input: {
  index: number
  autoScrollActiveIndex: number
  highlightLine: boolean
}): PrompterSegmentVisualState {
  if (input.highlightLine && input.index === input.autoScrollActiveIndex) {
    return "active"
  }

  return input.index < input.autoScrollActiveIndex ? "read" : "unread"
}

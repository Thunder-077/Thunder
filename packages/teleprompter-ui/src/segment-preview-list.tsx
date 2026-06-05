import type { CSSProperties } from "react"
import type { ScriptSegment } from "../../teleprompter-core/src/index"

type TeleprompterSegmentPreviewListProps = {
  segments: ScriptSegment[]
  emptyLabel?: string
  activeIndex?: number | null
  listStyle?: CSSProperties
  emptyStyle?: CSSProperties
  itemStyle?: CSSProperties
  activeItemStyle?: CSSProperties
  itemLabelStyle?: CSSProperties
  activeItemLabelStyle?: CSSProperties
  itemTextStyle?: CSSProperties
  activeItemTextStyle?: CSSProperties
}

/**
 * 共享的分段预览列表。插件和宿主都可以复用同一份段落遍历和空状态逻辑。
 */
export function TeleprompterSegmentPreviewList({
  segments,
  emptyLabel = "还没有可预览的段落。",
  activeIndex = null,
  listStyle,
  emptyStyle,
  itemStyle,
  activeItemStyle,
  itemLabelStyle,
  activeItemLabelStyle,
  itemTextStyle,
  activeItemTextStyle,
}: TeleprompterSegmentPreviewListProps) {
  if (segments.length === 0) {
    return <div style={emptyStyle}>{emptyLabel}</div>
  }

  return (
    <div style={listStyle}>
      {segments.map((segment, index) => (
        <article
          key={segment.id}
          style={index === activeIndex ? { ...itemStyle, ...activeItemStyle } : itemStyle}
        >
          <div style={index === activeIndex ? { ...itemLabelStyle, ...activeItemLabelStyle } : itemLabelStyle}>
            第 {index + 1} 段
          </div>
          <div style={index === activeIndex ? { ...itemTextStyle, ...activeItemTextStyle } : itemTextStyle}>
            {segment.raw}
          </div>
        </article>
      ))}
    </div>
  )
}

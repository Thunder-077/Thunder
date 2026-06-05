import type { CSSProperties, KeyboardEventHandler } from "react"

type TeleprompterDocumentEditorProps = {
  value: string
  placeholder?: string
  wrapperClassName?: string
  wrapperStyle?: CSSProperties
  textareaClassName?: string
  textareaStyle?: CSSProperties
  onChange: (value: string) => void
  onBlur?: () => void
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>
}

/**
 * 共享的提词稿编辑器，统一 textarea 的行为接口，让宿主自行决定视觉风格。
 */
export function TeleprompterDocumentEditor({
  value,
  placeholder,
  wrapperClassName,
  wrapperStyle,
  textareaClassName,
  textareaStyle,
  onChange,
  onBlur,
  onKeyDown,
}: TeleprompterDocumentEditorProps) {
  return (
    <div className={wrapperClassName} style={wrapperStyle}>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={textareaClassName}
        style={textareaStyle}
      />
    </div>
  )
}

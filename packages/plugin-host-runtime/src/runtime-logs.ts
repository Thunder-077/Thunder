export interface RuntimeLogEntry {
  message: string
  timestamp: string
}

export interface RuntimeLogBufferOptions {
  maxLines?: number
  maxLineBytes?: number
  now?: () => string
}

const DEFAULT_MAX_LINES = 200
const DEFAULT_MAX_LINE_BYTES = 64 * 1024

/**
 * Truncate without splitting a UTF-8 code point.
 */
function truncateUtf8(value: string, maxBytes: number): string {
  const bytes = Buffer.from(value, "utf8")
  if (bytes.length <= maxBytes) {
    return value
  }

  let end = Math.max(0, maxBytes)
  while (end > 0 && (bytes[end] & 0b1100_0000) === 0b1000_0000) {
    end -= 1
  }

  const leadingByte = bytes[end]
  const expectedLength =
    leadingByte === undefined
      ? 0
      : leadingByte < 0b1000_0000
        ? 1
        : leadingByte < 0b1110_0000
          ? 2
          : leadingByte < 0b1111_0000
            ? 3
            : 4

  if (end + expectedLength > maxBytes) {
    return bytes.subarray(0, end).toString("utf8")
  }

  return bytes.subarray(0, maxBytes).toString("utf8")
}

export interface RuntimeLogBuffer {
  append(message: string): void
  list(): RuntimeLogEntry[]
  clear(): void
}

class BoundedRuntimeLogBuffer implements RuntimeLogBuffer {
  private readonly entries: RuntimeLogEntry[] = []
  private readonly maxLines: number
  private readonly maxLineBytes: number
  private readonly now: () => string

  constructor(options: RuntimeLogBufferOptions = {}) {
    this.maxLines = Math.max(0, Math.trunc(options.maxLines ?? DEFAULT_MAX_LINES))
    this.maxLineBytes = Math.max(
      0,
      Math.trunc(options.maxLineBytes ?? DEFAULT_MAX_LINE_BYTES),
    )
    this.now = options.now ?? (() => new Date().toISOString())
  }

  append(message: string): void {
    if (this.maxLines === 0) {
      return
    }

    this.entries.push({
      message: truncateUtf8(message, this.maxLineBytes),
      timestamp: this.now(),
    })

    if (this.entries.length > this.maxLines) {
      this.entries.splice(0, this.entries.length - this.maxLines)
    }
  }

  list(): RuntimeLogEntry[] {
    return this.entries.map((entry) => ({ ...entry }))
  }

  clear(): void {
    this.entries.length = 0
  }
}

/**
 * Create one bounded log buffer for a runtime output stream.
 */
export function createRuntimeLogBuffer(
  options: RuntimeLogBufferOptions = {},
): RuntimeLogBuffer {
  return new BoundedRuntimeLogBuffer(options)
}

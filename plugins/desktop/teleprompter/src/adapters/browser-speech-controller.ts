type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition

type BrowserSpeechRecognitionResult = {
  readonly isFinal: boolean
  readonly length: number
  item: (index: number) => BrowserSpeechRecognitionAlternative
  [index: number]: BrowserSpeechRecognitionAlternative
}

type BrowserSpeechRecognitionAlternative = {
  readonly transcript: string
  readonly confidence: number
}

type BrowserSpeechRecognitionEvent = Event & {
  readonly resultIndex: number
  readonly results: {
    readonly length: number
    item: (index: number) => BrowserSpeechRecognitionResult
    [index: number]: BrowserSpeechRecognitionResult
  }
}

type BrowserSpeechRecognitionErrorEvent = Event & {
  readonly error: string
}

type BrowserSpeechRecognition = EventTarget & {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  onend: (() => void) | null
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type BrowserSpeechRecognitionHost = typeof globalThis & {
  window?: {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor
    setTimeout: typeof setTimeout
  }
}

type BrowserSpeechControllerCallbacks = {
  onResult: (result: { text: string; isFinal: boolean }) => void
  onStatus: (status: "listening" | "paused" | "stopped" | "error" | "unsupported") => void
  onError: (message: string) => void
}

function resolveSpeechRecognition(
  host: BrowserSpeechRecognitionHost
): BrowserSpeechRecognitionConstructor | null {
  const candidateWindow = host.window
  if (!candidateWindow) {
    return null
  }

  return candidateWindow.SpeechRecognition ?? candidateWindow.webkitSpeechRecognition ?? null
}

function toChineseSpeechError(error: string): string {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return "麦克风权限被拒绝，请允许浏览器访问麦克风后重试。"
  }

  if (error === "audio-capture") {
    return "未检测到可用麦克风，请检查设备后重试。"
  }

  if (error === "network") {
    return "语音识别服务网络异常，请检查网络后重试。"
  }

  if (error === "no-speech") {
    return "暂未识别到讲话内容，请靠近麦克风后继续。"
  }

  return "语音识别发生异常，请停止后重试。"
}

export function isBrowserSpeechRecognitionSupported(
  host: BrowserSpeechRecognitionHost = globalThis as BrowserSpeechRecognitionHost
): boolean {
  return resolveSpeechRecognition(host) !== null
}

/**
 * 插件 iframe 内沿用浏览器原生 SpeechRecognition，实现 web-speech 提供方的实时文本回传。
 */
export function createBrowserSpeechController(
  callbacks: BrowserSpeechControllerCallbacks,
  host: BrowserSpeechRecognitionHost = globalThis as BrowserSpeechRecognitionHost
) {
  let recognition: BrowserSpeechRecognition | null = null
  let shouldRestart = false
  let endingIntentionally = false

  function ensureRecognition(): BrowserSpeechRecognition {
    const Recognition = resolveSpeechRecognition(host)
    if (!Recognition) {
      callbacks.onStatus("unsupported")
      throw new Error("当前运行环境不支持浏览器语音识别，请使用支持 SpeechRecognition 的桌面环境。")
    }

    if (!recognition) {
      recognition = new Recognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = "zh-CN"
      recognition.maxAlternatives = 1

      recognition.onresult = (event) => {
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const item = event.results[index]
          const alternative = item[0]
          if (!alternative?.transcript.trim()) {
            continue
          }

          callbacks.onResult({
            text: alternative.transcript,
            isFinal: item.isFinal,
          })
          callbacks.onStatus("listening")
        }
      }

      recognition.onerror = (event) => {
        const isPermissionDenied = event.error === "not-allowed" || event.error === "service-not-allowed"
        if (isPermissionDenied) {
          shouldRestart = false
        }

        if (!isPermissionDenied && (endingIntentionally || !shouldRestart || event.error === "aborted")) {
          return
        }

        callbacks.onStatus("error")
        callbacks.onError(toChineseSpeechError(event.error))
      }

      recognition.onend = () => {
        if (!shouldRestart) {
          endingIntentionally = false
          return
        }

        host.window?.setTimeout(() => {
          if (!shouldRestart || !recognition) {
            return
          }

          try {
            recognition.start()
            callbacks.onStatus("listening")
          } catch {
            // 浏览器激活窗口切换时可能短暂拒绝重启，保留下一轮 onend 重试。
          }
        }, 250)
      }
    }

    return recognition
  }

  return {
    isSupported() {
      return isBrowserSpeechRecognitionSupported(host)
    },
    async start() {
      const activeRecognition = ensureRecognition()
      shouldRestart = true
      endingIntentionally = false
      callbacks.onStatus("listening")

      try {
        activeRecognition.start()
      } catch {
        // Chrome 在已有会话未完全结束时会抛错，这里保持幂等。
      }
    },
    pause() {
      shouldRestart = false
      endingIntentionally = true
      recognition?.stop()
      callbacks.onStatus("paused")
    },
    stop() {
      shouldRestart = false
      endingIntentionally = true
      recognition?.stop()
      callbacks.onStatus("stopped")
    },
    dispose() {
      shouldRestart = false
      endingIntentionally = true
      recognition?.abort()
      recognition = null
    },
  }
}

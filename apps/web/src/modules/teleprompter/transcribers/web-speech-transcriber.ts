import type { SpeechTranscriber, TranscriberStatus, TranscriptionResult } from "./types"
import { createSpeechChunk, SPEECH_PROVIDER_CAPABILITIES } from "./speech-chunk"

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition

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

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

function resolveSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") {
    return null
  }

  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
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

export class WebSpeechTranscriber implements SpeechTranscriber {
  private recognition: BrowserSpeechRecognition | null = null
  private shouldRestart = false
  private endingIntentionally = false
  private resultHandlers = new Set<(result: TranscriptionResult) => void>()
  private statusHandlers = new Set<(status: TranscriberStatus) => void>()
  private errorHandlers = new Set<(message: string) => void>()

  isSupported() {
    return resolveSpeechRecognition() !== null
  }

  getCapabilities() {
    return SPEECH_PROVIDER_CAPABILITIES["web-speech"]
  }

  async start() {
    const Recognition = resolveSpeechRecognition()
    if (!Recognition) {
      this.emitStatus("unsupported")
      this.emitError("当前浏览器或运行环境不支持语音识别，请使用 Chrome 或 Edge。")
      return
    }

    if (!this.recognition) {
      this.recognition = new Recognition()
      this.recognition.continuous = true
      this.recognition.interimResults = true
      this.recognition.lang = "zh-CN"
      this.recognition.maxAlternatives = 1
      this.bindRecognition(this.recognition)
    }

    this.shouldRestart = true
    this.endingIntentionally = false
    this.emitStatus("listening")

    try {
      this.recognition.start()
    } catch {
      // Chrome throws if start() is called while an existing session is active.
    }
  }

  pause() {
    this.shouldRestart = false
    this.endingIntentionally = true
    this.recognition?.stop()
    this.emitStatus("paused")
  }

  stop() {
    this.shouldRestart = false
    this.endingIntentionally = true
    this.recognition?.stop()
    this.emitStatus("stopped")
  }

  onResult(handler: (result: TranscriptionResult) => void) {
    this.resultHandlers.add(handler)
    return () => this.resultHandlers.delete(handler)
  }

  onStatusChange(handler: (status: TranscriberStatus) => void) {
    this.statusHandlers.add(handler)
    return () => this.statusHandlers.delete(handler)
  }

  onError(handler: (message: string) => void) {
    this.errorHandlers.add(handler)
    return () => this.errorHandlers.delete(handler)
  }

  private bindRecognition(recognition: BrowserSpeechRecognition) {
    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const item = event.results[index]
        const alternative = item[0]
        if (!alternative?.transcript.trim()) {
          continue
        }

        const chunk = createSpeechChunk({
          provider: "web-speech",
          text: alternative.transcript,
          isFinal: item.isFinal,
          confidence: alternative.confidence,
        })

        this.emitResult({
          text: alternative.transcript,
          isFinal: item.isFinal,
          confidence: alternative.confidence,
          chunk,
        })
      }
    }

    recognition.onerror = (event) => {
      const isPermissionDenied = event.error === "not-allowed" || event.error === "service-not-allowed"
      if (isPermissionDenied) {
        this.shouldRestart = false
      }

      // Browsers can dispatch "aborted" or implementation-specific errors after
      // a user-driven stop. Those events are teardown signals, not recognition failures.
      if (!isPermissionDenied && (this.endingIntentionally || !this.shouldRestart || event.error === "aborted")) {
        return
      }

      this.emitStatus("error")
      this.emitError(toChineseSpeechError(event.error))
    }

    recognition.onend = () => {
      if (!this.shouldRestart) {
        this.endingIntentionally = false
        return
      }

      window.setTimeout(() => {
        if (!this.shouldRestart) {
          return
        }

        try {
          recognition.start()
          this.emitStatus("listening")
        } catch {
          // Ignore transient restart races; the next onend cycle can retry.
        }
      }, 250)
    }
  }

  private emitResult(result: TranscriptionResult) {
    for (const handler of this.resultHandlers) {
      handler(result)
    }
  }

  private emitStatus(status: TranscriberStatus) {
    for (const handler of this.statusHandlers) {
      handler(status)
    }
  }

  private emitError(message: string) {
    for (const handler of this.errorHandlers) {
      handler(message)
    }
  }
}

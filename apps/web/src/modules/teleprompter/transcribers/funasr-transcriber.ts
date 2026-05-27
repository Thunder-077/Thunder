import type { SpeechTranscriber, TranscriberStatus, TranscriptionResult } from "./types"

type FunAsrTranscriberOptions = {
  endpoint: string
  mode?: "online" | "2pass"
  hotwords?: string
}

type FunAsrMessage = {
  text?: string
  mode?: string
  is_final?: boolean
  isFinal?: boolean
}

const TARGET_SAMPLE_RATE = 16000
const DEFAULT_CHUNK_SIZE = [5, 10, 5] as const
const DEFAULT_CHUNK_INTERVAL = 10

export class FunAsrTranscriber implements SpeechTranscriber {
  private options: FunAsrTranscriberOptions
  private socket: WebSocket | null = null
  private mediaStream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private processorNode: ScriptProcessorNode | null = null
  private resultHandlers = new Set<(result: TranscriptionResult) => void>()
  private statusHandlers = new Set<(status: TranscriberStatus) => void>()
  private errorHandlers = new Set<(message: string) => void>()

  constructor(options: FunAsrTranscriberOptions) {
    this.options = options
  }

  updateOptions(options: FunAsrTranscriberOptions) {
    this.options = options
  }

  isSupported() {
    return typeof window !== "undefined" && "WebSocket" in window && navigator.mediaDevices?.getUserMedia !== undefined
  }

  async start() {
    if (!this.isSupported()) {
      this.emitStatus("unsupported")
      this.emitError("当前浏览器不支持麦克风采集或 WebSocket，无法连接 FunASR。")
      return
    }

    if (!this.options.endpoint.trim()) {
      this.emitStatus("error")
      this.emitError("请先填写 FunASR WebSocket 地址。")
      return
    }

    this.stop(false)
    this.emitStatus("listening")

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      })
      this.socket = await this.openSocket(this.options.endpoint.trim())
      this.sendConfig()
      await this.startAudioPump()
    } catch (error) {
      this.stop(false)
      this.emitStatus("error")
      this.emitError(toFunAsrError(error))
    }
  }

  pause() {
    this.stop(false)
    this.emitStatus("paused")
  }

  stop(emitStopped = true) {
    try {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ is_speaking: false }))
      }
    } catch {
      // The socket may already be closing; stop should stay idempotent.
    }

    this.processorNode?.disconnect()
    this.sourceNode?.disconnect()
    void this.audioContext?.close()
    this.mediaStream?.getTracks().forEach((track) => track.stop())
    this.socket?.close()

    this.processorNode = null
    this.sourceNode = null
    this.audioContext = null
    this.mediaStream = null
    this.socket = null

    if (emitStopped) {
      this.emitStatus("stopped")
    }
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

  private openSocket(endpoint: string) {
    return new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(endpoint)
      socket.binaryType = "arraybuffer"

      socket.onopen = () => resolve(socket)
      socket.onerror = () => reject(new Error("funasr-socket-error"))
      socket.onclose = () => {
        if (this.socket === socket) {
          this.emitStatus("stopped")
        }
      }
      socket.onmessage = (event) => this.handleMessage(event.data)
    })
  }

  private sendConfig() {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return
    }

    this.socket.send(JSON.stringify({
      mode: this.options.mode ?? "2pass",
      wav_name: "thunder-teleprompter",
      wav_format: "pcm",
      audio_fs: TARGET_SAMPLE_RATE,
      is_speaking: true,
      chunk_size: DEFAULT_CHUNK_SIZE,
      chunk_interval: DEFAULT_CHUNK_INTERVAL,
      itn: true,
      hotwords: this.options.hotwords?.trim() || undefined,
    }))
  }

  private async startAudioPump() {
    if (!this.mediaStream || !this.socket) {
      return
    }

    this.audioContext = new AudioContext()
    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream)
    this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1)

    this.processorNode.onaudioprocess = (event) => {
      if (this.socket?.readyState !== WebSocket.OPEN || !this.audioContext) {
        return
      }

      const input = event.inputBuffer.getChannelData(0)
      const pcm = downsampleTo16kPcm(input, this.audioContext.sampleRate)
      if (pcm.byteLength > 0) {
        this.socket.send(pcm)
      }
    }

    this.sourceNode.connect(this.processorNode)
    this.processorNode.connect(this.audioContext.destination)
  }

  private handleMessage(data: unknown) {
    if (typeof data !== "string") {
      return
    }

    try {
      const message = JSON.parse(data) as FunAsrMessage
      const text = message.text?.trim()
      if (!text) {
        return
      }

      this.emitResult({
        text,
        isFinal: message.is_final ?? message.isFinal ?? message.mode === "2pass-offline",
        source: message.mode,
      })
      this.emitStatus("listening")
    } catch {
      // Ignore non-JSON server logs.
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

function downsampleTo16kPcm(input: Float32Array, inputSampleRate: number): ArrayBuffer {
  if (inputSampleRate === TARGET_SAMPLE_RATE) {
    return floatTo16BitPcm(input)
  }

  const ratio = inputSampleRate / TARGET_SAMPLE_RATE
  const outputLength = Math.floor(input.length / ratio)
  const output = new Float32Array(outputLength)

  for (let index = 0; index < outputLength; index += 1) {
    const start = Math.floor(index * ratio)
    const end = Math.min(Math.floor((index + 1) * ratio), input.length)
    let sum = 0
    for (let inputIndex = start; inputIndex < end; inputIndex += 1) {
      sum += input[inputIndex]
    }
    output[index] = sum / Math.max(1, end - start)
  }

  return floatTo16BitPcm(output)
}

function floatTo16BitPcm(input: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(input.length * 2)
  const view = new DataView(buffer)

  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index]))
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }

  return buffer
}

function toFunAsrError(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "麦克风权限被拒绝，请允许浏览器访问麦克风后重试。"
  }

  if (error instanceof Error && error.message === "funasr-socket-error") {
    return "无法连接 FunASR 服务，请确认 WebSocket 地址和服务状态。"
  }

  return "FunASR 识别发生异常，请检查服务连接后重试。"
}

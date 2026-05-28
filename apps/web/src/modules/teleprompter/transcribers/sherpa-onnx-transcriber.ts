import type { SpeechTranscriber, TranscriberStatus, TranscriptionResult } from "./types"
import { createSpeechChunk, SPEECH_PROVIDER_CAPABILITIES } from "./speech-chunk"

type SherpaOnnxTranscriberOptions = {
  endpoint: string
}

type SherpaOnnxMessage = {
  text?: string
  segment?: number
  isFinal?: boolean
}

export class SherpaOnnxTranscriber implements SpeechTranscriber {
  private options: SherpaOnnxTranscriberOptions
  private socket: WebSocket | null = null
  private mediaStream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private workletNode: AudioWorkletNode | null = null
  private resultHandlers = new Set<(result: TranscriptionResult) => void>()
  private statusHandlers = new Set<(status: TranscriberStatus) => void>()
  private errorHandlers = new Set<(message: string) => void>()

  constructor(options: SherpaOnnxTranscriberOptions) {
    this.options = options
  }

  updateOptions(options: SherpaOnnxTranscriberOptions) {
    this.options = options
  }

  isSupported() {
    return typeof window !== "undefined" && "WebSocket" in window && navigator.mediaDevices?.getUserMedia !== undefined
  }

  getCapabilities() {
    return SPEECH_PROVIDER_CAPABILITIES["sherpa-onnx"]
  }

  async start() {
    if (!this.isSupported()) {
      this.emitStatus("unsupported")
      this.emitError("当前浏览器不支持麦克风采集或 WebSocket，无法连接 sherpa-onnx。")
      return
    }

    if (!this.options.endpoint.trim()) {
      this.emitStatus("error")
      this.emitError("请先准备 sherpa-onnx 服务地址。")
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
      await this.startAudioPump()
    } catch (error) {
      this.stop(false)
      this.emitStatus("error")
      this.emitError(toSherpaError(error))
    }
  }

  pause() {
    this.stop(false)
    this.emitStatus("paused")
  }

  stop(emitStopped = true) {
    try {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send("Done")
      }
    } catch {
      // The socket may already be closing; stop should stay idempotent.
    }

    this.workletNode?.disconnect()
    this.workletNode?.port.close()
    this.sourceNode?.disconnect()
    void this.audioContext?.close()
    this.mediaStream?.getTracks().forEach((track) => track.stop())
    this.socket?.close()

    this.workletNode = null
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
      socket.onerror = () => reject(new Error("sherpa-socket-error"))
      socket.onclose = () => {
        if (this.socket === socket) {
          this.emitStatus("stopped")
        }
      }
      socket.onmessage = (event) => this.handleMessage(event.data)
    })
  }

  private async startAudioPump() {
    if (!this.mediaStream || !this.socket) {
      return
    }

    this.audioContext = new AudioContext()
    await this.audioContext.audioWorklet.addModule("/audio-worklet/pcm-processor.js")

    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream)
    this.workletNode = new AudioWorkletNode(this.audioContext, "pcm-processor", {
      processorOptions: { inputSampleRate: this.audioContext.sampleRate },
    })

    this.workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      if (this.socket?.readyState !== WebSocket.OPEN || event.data.byteLength === 0) {
        return
      }

      this.socket.send(convertInt16PcmToFloat32(event.data))
    }

    this.sourceNode.connect(this.workletNode)
  }

  private handleMessage(data: unknown) {
    if (typeof data !== "string") {
      return
    }

    try {
      const message = JSON.parse(data) as SherpaOnnxMessage
      const text = message.text?.trim()
      if (!text) {
        return
      }

      const chunk = createSpeechChunk({
        provider: "sherpa-onnx",
        text,
        isFinal: Boolean(message.isFinal),
      })

      this.emitResult({
        text,
        isFinal: chunk.isFinal,
        source: message.isFinal ? "endpoint" : "streaming",
        chunk,
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

function convertInt16PcmToFloat32(pcm: ArrayBuffer): ArrayBuffer {
  const input = new Int16Array(pcm)
  const float32 = new Float32Array(input.length)
  for (let i = 0; i < input.length; i += 1) {
    float32[i] = input[i] / 0x8000
  }
  return float32.buffer
}

function toSherpaError(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "麦克风权限被拒绝，请允许浏览器访问麦克风后重试。"
  }

  if (error instanceof Error && error.message === "sherpa-socket-error") {
    return "无法连接 sherpa-onnx 服务，请确认模型已下载并且本地服务已启动。"
  }

  return "sherpa-onnx 识别发生异常，请检查服务状态后重试。"
}

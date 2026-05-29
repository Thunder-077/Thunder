"use client"

import {
  feedSherpaAudio,
  isTauriDesktop,
  startSherpaService,
  stopSherpaService,
  type SherpaRecognitionUpdate,
} from "@/lib/platform"
import { createSpeechChunk, SPEECH_PROVIDER_CAPABILITIES } from "./speech-chunk"
import type { SpeechTranscriber, TranscriberStatus, TranscriptionResult } from "./types"

export class SherpaOnnxTranscriber implements SpeechTranscriber {
  private mediaStream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private workletNode: AudioWorkletNode | null = null
  private resultHandlers = new Set<(result: TranscriptionResult) => void>()
  private statusHandlers = new Set<(status: TranscriberStatus) => void>()
  private errorHandlers = new Set<(message: string) => void>()
  private active = false
  private feeding = false
  private pendingChunks: Int16Array[] = []

  isSupported() {
    return isTauriDesktop() && typeof window !== "undefined" && navigator.mediaDevices?.getUserMedia !== undefined
  }

  getCapabilities() {
    return SPEECH_PROVIDER_CAPABILITIES["sherpa-onnx"]
  }

  async start() {
    if (!this.isSupported()) {
      this.emitStatus("unsupported")
      this.emitError("当前环境不支持桌面端 sherpa-onnx 直连识别。")
      return
    }

    this.stop(false)
    this.emitStatus("listening")
    this.active = true

    try {
      // 每次开始跟读都重建一条新的 sherpa 会话，避免沿用上次残留的流式状态。
      await startSherpaService()

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      })

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
    this.active = false
    this.workletNode?.disconnect()
    this.workletNode?.port.close()
    this.sourceNode?.disconnect()
    void this.audioContext?.close()
    this.mediaStream?.getTracks().forEach((track) => track.stop())

    this.workletNode = null
    this.sourceNode = null
    this.audioContext = null
    this.mediaStream = null
    this.feeding = false
    this.pendingChunks = []

    if (emitStopped) {
      void stopSherpaService()
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

  private async startAudioPump() {
    if (!this.mediaStream) {
      return
    }

    this.audioContext = new AudioContext()
    await this.audioContext.audioWorklet.addModule("/audio-worklet/pcm-processor.js")

    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream)
    this.workletNode = new AudioWorkletNode(this.audioContext, "pcm-processor", {
      processorOptions: { inputSampleRate: this.audioContext.sampleRate },
    })

    this.workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      if (!this.active || event.data.byteLength === 0) {
        return
      }

      this.pendingChunks.push(new Int16Array(event.data.slice(0)))
      void this.drainAudioQueue()
    }

    this.sourceNode.connect(this.workletNode)
  }

  private async drainAudioQueue() {
    if (this.feeding || !this.active) {
      return
    }

    this.feeding = true
    try {
      while (this.active && this.pendingChunks.length > 0) {
        const chunk = this.pendingChunks.shift()
        if (!chunk) {
          break
        }

        const update = await feedSherpaAudio(Array.from(chunk))
        if (update) {
          this.handleUpdate(update)
        }
      }
    } catch (error) {
      this.emitStatus("error")
      this.emitError(toSherpaError(error))
      this.stop(false)
    } finally {
      this.feeding = false
    }
  }

  private handleUpdate(message: SherpaRecognitionUpdate) {
    const text = message.text.trim()
    if (!text) {
      return
    }

    const chunk = createSpeechChunk({
      provider: "sherpa-onnx",
      text,
      isFinal: message.isFinal,
    })

    this.emitResult({
      text,
      isFinal: chunk.isFinal,
      source: message.isFinal ? "endpoint" : "streaming",
      chunk,
    })
    this.emitStatus("listening")
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

function toSherpaError(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "麦克风权限被拒绝，请允许浏览器访问麦克风后重试。"
  }

  if (error instanceof Error) {
    return error.message || "sherpa-onnx 识别发生异常，请检查模型和本地引擎状态。"
  }

  return "sherpa-onnx 识别发生异常，请检查模型和本地引擎状态。"
}

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
  private acceptingAudio = false
  private feeding = false
  private stopping = false
  private stopPromise: Promise<void> | null = null
  private pendingChunks: Int16Array[] = []
  private queueDrainResolvers = new Set<() => void>()

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

    await this.stopInternal(null)
    this.emitStatus("listening")
    this.active = true
    this.acceptingAudio = true
    this.stopping = false

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
      if (!this.active) {
        return
      }
      await this.stopInternal(null)
      this.emitStatus("error")
      this.emitError(toSherpaError(error))
    }
  }

  async pause() {
    await this.stopInternal("paused")
  }

  async stop() {
    await this.stopInternal("stopped")
  }

  private async stopInternal(finalStatus: "paused" | "stopped" | null) {
    if (this.stopPromise) {
      await this.stopPromise
      if (finalStatus) {
        this.emitStatus(finalStatus)
      }
      return
    }

    if (!this.active && !this.acceptingAudio && this.pendingChunks.length === 0 && !this.feeding) {
      this.releaseAudioResources()
      if (finalStatus) {
        this.emitStatus(finalStatus)
      }
      return
    }

    this.stopPromise = this.flushAndStop(finalStatus)
    await this.stopPromise
  }

  private async flushAndStop(finalStatus: "paused" | "stopped" | null) {
    this.stopping = true
    this.acceptingAudio = false
    this.releaseAudioResources()

    try {
      if (!this.feeding && this.pendingChunks.length > 0) {
        await this.drainAudioQueue()
      }

      await this.waitForPendingAudio()

      if (this.active) {
        const update = await feedSherpaAudio([], true)
        if (update) {
          this.handleUpdate(update)
        }
      }
    } catch {
      // Graceful stop prefers preserving confirmed text and closing the session cleanly.
      // Tail-end flush failures during teardown should not surface as user-facing errors.
    } finally {
      this.active = false
      this.acceptingAudio = false
      this.feeding = false
      this.stopping = false
      this.pendingChunks = []
      this.resolveQueueDrain()
      this.stopPromise = null

      try {
        await stopSherpaService()
      } catch {
        // The local service may already be closed by the time teardown completes.
      }

      if (finalStatus) {
        this.emitStatus(finalStatus)
      }
    }
  }

  private releaseAudioResources() {
    this.workletNode?.disconnect()
    this.workletNode?.port.close()
    this.sourceNode?.disconnect()
    void this.audioContext?.close()
    this.mediaStream?.getTracks().forEach((track) => track.stop())

    this.workletNode = null
    this.sourceNode = null
    this.audioContext = null
    this.mediaStream = null
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
      if (!this.acceptingAudio || event.data.byteLength === 0) {
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
      // Clicking stop can invalidate the in-flight sherpa request while the Promise is
      // still resolving. Once the transcriber is no longer active, that rejection is
      // expected teardown noise and should not surface as a user-facing error.
      if (!this.active || this.stopping) {
        return
      }
      this.emitStatus("error")
      this.emitError(toSherpaError(error))
      await this.stopInternal(null)
    } finally {
      this.feeding = false
      if (this.pendingChunks.length === 0) {
        this.resolveQueueDrain()
      }
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
    if (!this.stopping) {
      this.emitStatus("listening")
    }
  }

  private waitForPendingAudio(): Promise<void> {
    if (!this.feeding && this.pendingChunks.length === 0) {
      return Promise.resolve()
    }

    return new Promise((resolve) => {
      this.queueDrainResolvers.add(resolve)
    })
  }

  private resolveQueueDrain() {
    for (const resolve of this.queueDrainResolvers) {
      resolve()
    }
    this.queueDrainResolvers.clear()
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

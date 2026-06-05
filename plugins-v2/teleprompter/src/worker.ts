import { defineWorker } from "@thunder/plugin-sdk/worker"
import { nativeSpeechBridge } from "./adapters/native-speech-bridge"
import type {
  SpeechModelsActivatePayload,
  SpeechModelsDownloadPayload,
  SpeechSessionFeedPayload,
  SpeechSessionFeedResult,
  SpeechRuntimeHealthResult,
  SpeechSessionStartPayload,
  SpeechSessionStartResult,
  SpeechSessionStopPayload,
  SpeechSessionStopResult,
  SpeechSessionSubmitPayload,
  SpeechSessionSubmitResult,
  SpeechTranscribePayload,
  SpeechTranscribeResult,
  SpeechWorkerModelRecord,
} from "./adapters/speech-worker-types"

type WorkerSpeechSession = {
  sessionId: string
  provider: "web-speech" | "sherpa-onnx"
  status: "listening" | "stopped"
  samplesReceived: number
  chunksReceived: number
  sampleRate: 16000 | null
}

const speechSessions = new Map<string, WorkerSpeechSession>()
let nextSpeechSessionId = 1

function normalizeSpeechText(text: string): string {
  return text.trim().replace(/\s+/g, " ")
}

function parseSpeechTranscribePayload(payload: unknown): SpeechTranscribePayload {
  if (!payload || typeof payload !== "object" || typeof (payload as { text?: unknown }).text !== "string") {
    throw new Error("speech.transcribe payload.text must be a string")
  }

  return {
    text: (payload as { text: string }).text,
  }
}

function parseSpeechSessionStartPayload(payload: unknown): SpeechSessionStartPayload {
  if (
    !payload ||
    typeof payload !== "object" ||
    (((payload as { provider?: unknown }).provider !== "web-speech") &&
      ((payload as { provider?: unknown }).provider !== "sherpa-onnx"))
  ) {
    throw new Error("speech.session.start payload.provider must be a supported provider")
  }

  return {
    provider: (payload as { provider: "web-speech" | "sherpa-onnx" }).provider,
  }
}

function parseSpeechSessionSubmitPayload(payload: unknown): SpeechSessionSubmitPayload {
  if (
    !payload ||
    typeof payload !== "object" ||
    typeof (payload as { sessionId?: unknown }).sessionId !== "string" ||
    typeof (payload as { text?: unknown }).text !== "string"
  ) {
    throw new Error("speech.session.submit requires payload.sessionId and payload.text")
  }

  return {
    sessionId: (payload as { sessionId: string }).sessionId,
    text: (payload as { text: string }).text,
    isFinal: (payload as { isFinal?: boolean }).isFinal,
  }
}

function parseSpeechSessionStopPayload(payload: unknown): SpeechSessionStopPayload {
  if (!payload || typeof payload !== "object" || typeof (payload as { sessionId?: unknown }).sessionId !== "string") {
    throw new Error("speech.session.stop payload.sessionId must be a string")
  }

  return {
    sessionId: (payload as { sessionId: string }).sessionId,
  }
}

function parseSpeechSessionFeedPayload(payload: unknown): SpeechSessionFeedPayload {
  if (
    !payload ||
    typeof payload !== "object" ||
    typeof (payload as { sessionId?: unknown }).sessionId !== "string" ||
    !Array.isArray((payload as { samples?: unknown }).samples)
  ) {
    throw new Error("speech.session.feed requires payload.sessionId and payload.samples")
  }

  const samples = (payload as { samples: unknown[] }).samples
  if (samples.some((sample) => typeof sample !== "number" || !Number.isFinite(sample))) {
    throw new Error("speech.session.feed payload.samples must be numeric")
  }
  if ((payload as { sampleRate?: unknown }).sampleRate !== 16000) {
    throw new Error("speech.session.feed payload.sampleRate must be 16000")
  }
  if ((payload as { channels?: unknown }).channels !== 1) {
    throw new Error("speech.session.feed payload.channels must be 1")
  }
  if ((payload as { encoding?: unknown }).encoding !== "pcm_s16le") {
    throw new Error("speech.session.feed payload.encoding must be pcm_s16le")
  }

  return {
    sessionId: (payload as { sessionId: string }).sessionId,
    samples: samples as number[],
    sampleRate: 16000,
    channels: 1,
    encoding: "pcm_s16le",
    inputFinished: (payload as { inputFinished?: boolean }).inputFinished,
  }
}

function parseSpeechModelsDownloadPayload(payload: unknown): SpeechModelsDownloadPayload {
  if (!payload || typeof payload !== "object" || typeof (payload as { modelId?: unknown }).modelId !== "string") {
    throw new Error("speech.models.download payload.modelId must be a string")
  }

  return {
    modelId: (payload as { modelId: string }).modelId,
  }
}

function parseSpeechModelsActivatePayload(payload: unknown): SpeechModelsActivatePayload {
  if (!payload || typeof payload !== "object" || typeof (payload as { modelId?: unknown }).modelId !== "string") {
    throw new Error("speech.models.activate payload.modelId must be a string")
  }

  return {
    modelId: (payload as { modelId: string }).modelId,
  }
}

async function listAvailableModels(): Promise<SpeechWorkerModelRecord[]> {
  if (!nativeSpeechBridge.isConfigured()) {
    return []
  }

  return nativeSpeechBridge.listSherpaModels()
}

async function buildRuntimeHealth(): Promise<SpeechRuntimeHealthResult> {
  if (!nativeSpeechBridge.isConfigured()) {
    return {
      available: true,
      transport: "trusted-worker",
      capabilities: {
        modelManagement: false,
        realtimeRecognition: false,
        sessionControl: true,
      },
      reason: "Desktop native speech bridge is not configured for this trusted worker session.",
    }
  }

  const sherpaRunning = await nativeSpeechBridge.checkSherpaRunning().catch(() => false)
  return {
    available: true,
    transport: "trusted-worker",
    capabilities: {
      modelManagement: true,
      realtimeRecognition: sherpaRunning,
      sessionControl: true,
    },
    reason: sherpaRunning
      ? "Sherpa ONNX bridge is connected and ready for realtime audio recognition."
      : "Sherpa ONNX bridge is connected, but the local recognition engine is not running yet.",
  }
}

function createSpeechSession(provider: "web-speech" | "sherpa-onnx"): WorkerSpeechSession {
  const sessionId = `speech-session-${nextSpeechSessionId++}`
  const session: WorkerSpeechSession = {
    sessionId,
    provider,
    status: "listening",
    samplesReceived: 0,
    chunksReceived: 0,
    sampleRate: null,
  }
  speechSessions.set(sessionId, session)
  return session
}

function getActiveSpeechSession(sessionId: string): WorkerSpeechSession {
  const session = speechSessions.get(sessionId)
  if (!session || session.status !== "listening") {
    throw new Error(`Unknown or inactive speech session: ${sessionId}`)
  }

  return session
}

export default defineWorker({
  handlers: {
    async "speech.health.check"(): Promise<SpeechRuntimeHealthResult> {
      return buildRuntimeHealth()
    },
    async "speech.session.start"(payload: unknown): Promise<SpeechSessionStartResult> {
      const parsedPayload = parseSpeechSessionStartPayload(payload)
      if (parsedPayload.provider === "sherpa-onnx") {
        await nativeSpeechBridge.startSherpaService()
      }
      const session = createSpeechSession(parsedPayload.provider)
      return {
        sessionId: session.sessionId,
        provider: session.provider,
        status: "listening",
      }
    },
    async "speech.session.submit"(payload: unknown): Promise<SpeechSessionSubmitResult> {
      const parsedPayload = parseSpeechSessionSubmitPayload(payload)
      const session = getActiveSpeechSession(parsedPayload.sessionId)
      return {
        sessionId: session.sessionId,
        accepted: true,
        normalized: normalizeSpeechText(parsedPayload.text),
        isFinal: parsedPayload.isFinal ?? true,
      }
    },
    async "speech.session.feed"(payload: unknown): Promise<SpeechSessionFeedResult> {
      const parsedPayload = parseSpeechSessionFeedPayload(payload)
      const session = getActiveSpeechSession(parsedPayload.sessionId)
      session.samplesReceived += parsedPayload.samples.length
      session.chunksReceived += 1
      session.sampleRate = parsedPayload.sampleRate
      speechSessions.set(session.sessionId, session)

      const sherpaUpdate = session.provider === "sherpa-onnx"
        ? await nativeSpeechBridge.feedSherpaAudio(parsedPayload.samples, parsedPayload.inputFinished ?? false)
        : null

      return {
        sessionId: session.sessionId,
        accepted: true,
        acceptedSamples: parsedPayload.samples.length,
        isFinal: sherpaUpdate?.isFinal ?? Boolean(parsedPayload.inputFinished),
        normalized: sherpaUpdate?.text ? normalizeSpeechText(sherpaUpdate.text) : null,
      }
    },
    async "speech.session.stop"(payload: unknown): Promise<SpeechSessionStopResult> {
      const parsedPayload = parseSpeechSessionStopPayload(payload)
      const session = getActiveSpeechSession(parsedPayload.sessionId)
      if (session.provider === "sherpa-onnx") {
        await nativeSpeechBridge.stopSherpaService().catch(() => undefined)
      }
      session.status = "stopped"
      speechSessions.set(session.sessionId, session)
      return {
        sessionId: session.sessionId,
        stopped: true,
      }
    },
    async "speech.transcribe"(payload: unknown): Promise<SpeechTranscribeResult> {
      const parsedPayload = parseSpeechTranscribePayload(payload)
      return {
        normalized: normalizeSpeechText(parsedPayload.text),
      }
    },
    async "speech.models.list"(): Promise<SpeechWorkerModelRecord[]> {
      return listAvailableModels()
    },
    async "speech.models.download"(payload: unknown): Promise<SpeechWorkerModelRecord[]> {
      const parsedPayload = parseSpeechModelsDownloadPayload(payload)
      return nativeSpeechBridge.downloadSherpaModel(parsedPayload.modelId)
    },
    async "speech.models.activate"(payload: unknown): Promise<SpeechWorkerModelRecord[]> {
      const parsedPayload = parseSpeechModelsActivatePayload(payload)
      return nativeSpeechBridge.activateSherpaModel(parsedPayload.modelId)
    },
  },
})

import { defineWorker } from "@thunder/plugin-sdk/worker"
import type { SpeechTranscribePayload, SpeechTranscribeResult } from "./adapters/speech-worker-types"

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

export default defineWorker({
  handlers: {
    async "speech.transcribe"(payload: unknown): Promise<SpeechTranscribeResult> {
      const parsedPayload = parseSpeechTranscribePayload(payload)
      return {
        normalized: normalizeSpeechText(parsedPayload.text),
      }
    },
    async "speech.models.list"() {
      return []
    },
  },
})

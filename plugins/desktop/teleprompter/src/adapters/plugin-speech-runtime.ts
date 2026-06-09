import { thunder } from "@thunder/plugin-sdk/browser"
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
} from "./speech-worker-types"

/**
 * 统一封装插件面板到 trusted worker 的调用，避免 UI 直接散落 RPC method 字符串。
 */
export const pluginSpeechRuntime = {
  checkHealth() {
    return thunder.worker.invoke<SpeechRuntimeHealthResult>("speech.health.check")
  },
  listModels() {
    return thunder.worker.invoke<SpeechWorkerModelRecord[]>("speech.models.list")
  },
  downloadModel(payload: SpeechModelsDownloadPayload) {
    return thunder.worker.invoke<SpeechWorkerModelRecord[], SpeechModelsDownloadPayload>("speech.models.download", payload)
  },
  activateModel(payload: SpeechModelsActivatePayload) {
    return thunder.worker.invoke<SpeechWorkerModelRecord[], SpeechModelsActivatePayload>("speech.models.activate", payload)
  },
  startSession(payload: SpeechSessionStartPayload) {
    return thunder.worker.invoke<SpeechSessionStartResult, SpeechSessionStartPayload>("speech.session.start", payload)
  },
  feedSessionAudio(payload: SpeechSessionFeedPayload) {
    return thunder.worker.invoke<SpeechSessionFeedResult, SpeechSessionFeedPayload>("speech.session.feed", payload)
  },
  submitSessionText(payload: SpeechSessionSubmitPayload) {
    return thunder.worker.invoke<SpeechSessionSubmitResult, SpeechSessionSubmitPayload>("speech.session.submit", payload)
  },
  stopSession(payload: SpeechSessionStopPayload) {
    return thunder.worker.invoke<SpeechSessionStopResult, SpeechSessionStopPayload>("speech.session.stop", payload)
  },
  transcribe(payload: SpeechTranscribePayload) {
    return thunder.worker.invoke<SpeechTranscribeResult, SpeechTranscribePayload>("speech.transcribe", payload)
  },
}

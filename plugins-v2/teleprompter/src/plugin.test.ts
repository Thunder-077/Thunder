import assert from "node:assert/strict"
import plugin from "./index"
import type {
  SpeechRuntimeHealthResult,
  SpeechSessionFeedResult,
  SpeechSessionStartResult,
  SpeechSessionStopResult,
  SpeechSessionSubmitResult,
  SpeechTranscribeResult,
  SpeechWorkerModelRecord,
} from "./adapters/speech-worker-types"
import worker from "./worker"

function createJsonResponse<T>(data: T): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  })
}

assert.equal(typeof plugin.setup, "function")
assert.equal(typeof worker.handlers["speech.health.check"], "function")
assert.equal(typeof worker.handlers["speech.session.start"], "function")
assert.equal(typeof worker.handlers["speech.session.feed"], "function")
assert.equal(typeof worker.handlers["speech.session.submit"], "function")
assert.equal(typeof worker.handlers["speech.session.stop"], "function")
assert.equal(typeof worker.handlers["speech.transcribe"], "function")
assert.equal(typeof worker.handlers["speech.models.list"], "function")
assert.equal(typeof worker.handlers["speech.models.download"], "function")
assert.equal(typeof worker.handlers["speech.models.activate"], "function")

const originalBridgeUrl = process.env.THUNDER_DESKTOP_NATIVE_API_URL
const originalFetch = globalThis.fetch

try {
  process.env.THUNDER_DESKTOP_NATIVE_API_URL = "http://127.0.0.1:43102"
  globalThis.fetch = (async (input, init) => {
    const url = String(input)
    if (url.endsWith("/sherpa/status")) {
      return createJsonResponse(true)
    }
    if (url.endsWith("/sherpa/models")) {
      return createJsonResponse([
        {
          id: "sherpa-zh",
          name: "Sherpa Chinese",
          description: "Chinese offline model",
          language: "zh-CN",
          runtime: "sherpa-onnx",
          size: "1.2GB",
          installed: true,
          active: true,
        },
      ])
    }
    if (url.endsWith("/sherpa/models/download")) {
      return createJsonResponse([
        {
          id: "sherpa-zh",
          name: "Sherpa Chinese",
          description: "Chinese offline model",
          language: "zh-CN",
          runtime: "sherpa-onnx",
          size: "1.2GB",
          installed: false,
          active: false,
          downloading: true,
          downloadProgress: {
            percentage: 42,
            downloaded: 420,
            total: 1000,
            status: "downloading",
          },
        },
      ])
    }
    if (url.endsWith("/sherpa/models/activate")) {
      return createJsonResponse([
        {
          id: "sherpa-zh",
          name: "Sherpa Chinese",
          description: "Chinese offline model",
          language: "zh-CN",
          runtime: "sherpa-onnx",
          size: "1.2GB",
          installed: true,
          active: true,
        },
      ])
    }
    if (url.endsWith("/sherpa/start")) {
      return createJsonResponse("started")
    }
    if (url.endsWith("/sherpa/feed")) {
      const payload = JSON.parse(String(init?.body ?? "{}")) as { inputFinished?: boolean }
      return createJsonResponse({
        text: payload.inputFinished ? "大家好 thunder" : "大家好",
        segment: 0,
        isFinal: Boolean(payload.inputFinished),
      })
    }
    if (url.endsWith("/sherpa/stop")) {
      return createJsonResponse(null)
    }

    throw new Error(`Unexpected fetch url: ${url}`)
  }) as typeof fetch

  const health = await worker.handlers["speech.health.check"](undefined) as SpeechRuntimeHealthResult
  assert.equal(health.available, true)
  assert.equal(health.capabilities.sessionControl, true)
  assert.equal(health.capabilities.realtimeRecognition, true)

  const session = await worker.handlers["speech.session.start"]({
    provider: "sherpa-onnx",
  }) as SpeechSessionStartResult
  assert.equal(session.status, "listening")

  const feedResult = await worker.handlers["speech.session.feed"]({
    sessionId: session.sessionId,
    samples: [0, 128, -256, 512],
    sampleRate: 16000,
    channels: 1,
    encoding: "pcm_s16le",
  }) as SpeechSessionFeedResult
  assert.equal(feedResult.accepted, true)
  assert.equal(feedResult.acceptedSamples, 4)
  assert.equal(feedResult.normalized, "大家好")

  const submitResult = await worker.handlers["speech.session.submit"]({
    sessionId: session.sessionId,
    text: "  hello   thunder  ",
    isFinal: true,
  }) as SpeechSessionSubmitResult
  assert.equal(submitResult.normalized, "hello thunder")
  assert.equal(submitResult.isFinal, true)

  const stopResult = await worker.handlers["speech.session.stop"]({
    sessionId: session.sessionId,
  }) as SpeechSessionStopResult
  assert.equal(stopResult.stopped, true)

  const transcribeResult = await worker.handlers["speech.transcribe"]({
    text: "  plugin   speech  runtime ",
  }) as SpeechTranscribeResult
  assert.equal(transcribeResult.normalized, "plugin speech runtime")

  const models = await worker.handlers["speech.models.list"](undefined) as SpeechWorkerModelRecord[]
  assert.deepEqual(models, [
    {
      id: "sherpa-zh",
      name: "Sherpa Chinese",
      description: "Chinese offline model",
      language: "zh-CN",
      runtime: "sherpa-onnx",
      size: "1.2GB",
      installed: true,
      active: true,
      downloading: undefined,
      downloadProgress: null,
    },
  ])

  const downloadingModels = await worker.handlers["speech.models.download"]({
    modelId: "sherpa-zh",
  }) as SpeechWorkerModelRecord[]
  assert.equal(downloadingModels[0]?.downloading, true)
  assert.equal(downloadingModels[0]?.downloadProgress?.percentage, 42)

  const activatedModels = await worker.handlers["speech.models.activate"]({
    modelId: "sherpa-zh",
  }) as SpeechWorkerModelRecord[]
  assert.equal(activatedModels[0]?.active, true)
} finally {
  process.env.THUNDER_DESKTOP_NATIVE_API_URL = originalBridgeUrl
  globalThis.fetch = originalFetch
}

console.log("[teleprompter-v2] tests passed")

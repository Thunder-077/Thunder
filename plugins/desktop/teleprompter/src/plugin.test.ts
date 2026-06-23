import assert from "node:assert/strict"
import { createBrowserSpeechController, isBrowserSpeechRecognitionSupported } from "./adapters/browser-speech-controller"
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

class FakeSpeechRecognition extends EventTarget {
  static last: FakeSpeechRecognition | null = null
  continuous = false
  interimResults = false
  lang = ""
  maxAlternatives = 1
  onend: (() => void) | null = null
  onerror: ((event: Event & { error: string }) => void) | null = null
  onresult: ((event: Event & {
    resultIndex: number
    results: ArrayLike<{
      isFinal: boolean
      0: { transcript: string; confidence: number }
      item: (index: number) => { transcript: string; confidence: number }
      length: number
    }>
  }) => void) | null = null

  constructor() {
    super()
    FakeSpeechRecognition.last = this
  }

  start() {}
  stop() {}
  abort() {}

  emitResult(transcript: string, isFinal: boolean) {
    this.onresult?.({
      resultIndex: 0,
      results: [
        {
          isFinal,
          0: { transcript, confidence: 0.91 },
          item: () => ({ transcript, confidence: 0.91 }),
          length: 1,
        },
      ],
    } as unknown as Event & {
      resultIndex: number
      results: ArrayLike<{
        isFinal: boolean
        0: { transcript: string; confidence: number }
        item: (index: number) => { transcript: string; confidence: number }
        length: number
      }>
    })
  }
}

function createJsonResponse<T>(data: T): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  })
}

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
const originalWindow = (globalThis as typeof globalThis & { window?: unknown }).window

{
  const speechWindow = globalThis as unknown as {
    window?: {
      SpeechRecognition: typeof FakeSpeechRecognition
      setTimeout: typeof setTimeout
    }
  }
  speechWindow.window = {
    SpeechRecognition: FakeSpeechRecognition,
    setTimeout,
  }

  assert.equal(isBrowserSpeechRecognitionSupported(), true)
  let browserStatus = "idle"
  let browserResult: { text: string; isFinal: boolean } | null = null
  let browserError: string | null = null
  const controller = createBrowserSpeechController({
    onResult: (result) => {
      browserResult = result
    },
    onStatus: (status) => {
      browserStatus = status
    },
    onError: (message) => {
      browserError = message
    },
  })

  await controller.start()
  assert.equal(browserStatus, "listening")
  FakeSpeechRecognition.last?.emitResult("插件 语音", false)
  assert.deepEqual(browserResult, {
    text: "插件 语音",
    isFinal: false,
  })
  assert.equal(browserError, null)
  controller.stop()
  controller.dispose()
}

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
  ;(globalThis as typeof globalThis & { window?: unknown }).window = originalWindow
}

console.log("[teleprompter-v2] tests passed")

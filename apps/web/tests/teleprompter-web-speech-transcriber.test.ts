import assert from "node:assert/strict"
import { WebSpeechTranscriber } from "../src/modules/teleprompter/transcribers/web-speech-transcriber"
import type { TranscriberStatus } from "../src/modules/teleprompter/transcribers/types"

type SpeechErrorEvent = Event & { readonly error: string }

class FakeSpeechRecognition {
  static last: FakeSpeechRecognition | null = null

  continuous = false
  interimResults = false
  lang = ""
  maxAlternatives = 1
  onend: (() => void) | null = null
  onerror: ((event: SpeechErrorEvent) => void) | null = null
  onresult = null
  started = false

  constructor() {
    FakeSpeechRecognition.last = this
  }

  start() {
    this.started = true
  }

  stop() {
    this.started = false
  }

  abort() {
    this.started = false
  }

  emitError(error: string) {
    this.onerror?.(Object.assign(new Event("error"), { error }) as SpeechErrorEvent)
  }

  emitEnd() {
    this.onend?.()
  }
}

function installFakeSpeechRecognition() {
  const previousWindow = globalThis.window
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      SpeechRecognition: FakeSpeechRecognition,
    },
  })

  return () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: previousWindow,
    })
  }
}

async function main() {
  const restoreWindow = installFakeSpeechRecognition()
  try {
    const transcriber = new WebSpeechTranscriber()
    const errors: string[] = []
    const statuses: TranscriberStatus[] = []

    transcriber.onError((message) => errors.push(message))
    transcriber.onStatusChange((status) => statuses.push(status))

    await transcriber.start()
    await transcriber.stop()

    FakeSpeechRecognition.last?.emitError("aborted")
    FakeSpeechRecognition.last?.emitError("network")
    FakeSpeechRecognition.last?.emitEnd()
    FakeSpeechRecognition.last?.emitError("network")

    assert.deepEqual(errors, [])
    assert.deepEqual(statuses, ["listening", "stopped"])
  } finally {
    restoreWindow()
  }

  console.log("[web-speech-transcriber] tests passed")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

import assert from "node:assert/strict"
import {
  defineWorker,
  type ThunderPluginWorkerMethodMap,
  type ThunderPluginWorkerRequest,
  type ThunderPluginWorkerResponse,
} from "./index"

async function main() {
  type TeleprompterWorkerMethods = {
    "speech.transcribe": {
      payload: {
        text: string
      }
      result: {
        normalized: string
      }
    }
    "speech.models.list": {
      payload: {
        provider: "local"
      }
      result: string[]
    }
  }

  const worker = defineWorker<TeleprompterWorkerMethods>({
    handlers: {
      "speech.transcribe": async ({ text }) => ({ normalized: text.trim() }),
      "speech.models.list": ({ provider }) => {
        assert.equal(provider, "local")
        return ["base", "large"]
      },
    },
  })

  const request: ThunderPluginWorkerRequest<
    TeleprompterWorkerMethods,
    "speech.transcribe"
  > = {
    id: "1",
    method: "speech.transcribe",
    payload: {
      text: "  hello  ",
    },
  }

  const result = await worker.handlers[request.method](request.payload)
  assert.deepEqual(result, { normalized: "hello" })

  const models = await worker.handlers["speech.models.list"]({
    provider: "local",
  })

  const response: ThunderPluginWorkerResponse<
    TeleprompterWorkerMethods,
    "speech.models.list"
  > = {
    id: "2",
    method: "speech.models.list",
    ok: true,
    result: models,
  }
  assert.deepEqual(response.result, ["base", "large"])

  console.log("[plugin-sdk-worker] tests passed")
}

void main()

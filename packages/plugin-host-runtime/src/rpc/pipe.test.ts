import assert from "node:assert/strict"
import { createPipeClient, createPipeServer } from "../index"

const server = await createPipeServer({
  handle(method, payload) {
    if (method === "speech.transcribe") {
      return {
        ok: true,
        text: String((payload as { text: string }).text).trim(),
      }
    }

    throw new Error(`unknown method: ${method}`)
  },
})

const client = await createPipeClient(server.endpoint)
const result = await client.invoke("speech.transcribe", { text: "  hello  " })

assert.deepEqual(result, { ok: true, text: "hello" })

await client.close()
await server.close()

console.log("[plugin-host-runtime] pipe tests passed")

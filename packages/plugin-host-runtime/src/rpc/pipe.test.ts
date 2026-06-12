import assert from "node:assert/strict"
import {
  createPipeClient,
  createPipeServer,
  decodeEnvelope,
  PluginRuntimeError,
} from "../index"

const PLUGIN_ID = "test-plugin"
const CAPABILITY = "secret"
const MEBIBYTE = 1024 * 1024

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function assertRuntimeError(
  action: () => Promise<unknown>,
  code: PluginRuntimeError["code"],
): Promise<PluginRuntimeError> {
  try {
    await action()
  } catch (error) {
    assert.ok(error instanceof PluginRuntimeError)
    assert.equal(error.code, code)
    return error
  }

  assert.fail(`Expected PluginRuntimeError with code ${code}`)
}

async function testRoundtripAndConcurrentRequests(): Promise<void> {
  const server = await createPipeServer({
    pluginId: PLUGIN_ID,
    capability: CAPABILITY,
    handle(method, payload) {
      if (method === "speech.transcribe") {
        return {
          ok: true,
          text: String((payload as { text: string }).text).trim(),
        }
      }

      throw new PluginRuntimeError(
        "RPC_METHOD_NOT_FOUND",
        `unknown method: ${method}`,
      )
    },
  })
  const client = await createPipeClient(server.endpoint, {
    pluginId: PLUGIN_ID,
    capability: CAPABILITY,
  })

  try {
    const [first, second] = await Promise.all([
      client.invoke("speech.transcribe", { text: "  hello  " }),
      client.invoke("speech.transcribe", { text: "  thunder  " }),
    ])

    assert.deepEqual(first, { ok: true, text: "hello" })
    assert.deepEqual(second, { ok: true, text: "thunder" })
  } finally {
    await client.close()
    await server.close()
  }
}

function testStrictProtocolDecoding(): void {
  assert.throws(
    () =>
      decodeEnvelope(
        JSON.stringify({
          version: 2,
          type: "request",
          id: "request-1",
          pluginId: PLUGIN_ID,
          capability: CAPABILITY,
          method: "speech.transcribe",
        }),
      ),
    /version is invalid/,
  )
  assert.throws(
    () =>
      decodeEnvelope(
        JSON.stringify({
          version: 1,
          type: "error",
          id: "request-1",
          pluginId: PLUGIN_ID,
          error: {
            code: "NOT_A_RUNTIME_ERROR",
            message: "invalid",
          },
        }),
      ),
    /error code is invalid/,
  )
}

async function testUnauthorizedCapability(): Promise<void> {
  let handlerCalls = 0
  const server = await createPipeServer({
    pluginId: PLUGIN_ID,
    capability: CAPABILITY,
    handle() {
      handlerCalls += 1
      return null
    },
  })
  const client = await createPipeClient(server.endpoint, {
    pluginId: PLUGIN_ID,
    capability: "wrong-capability",
  })

  try {
    await assertRuntimeError(
      () => client.invoke("speech.transcribe"),
      "RPC_UNAUTHORIZED",
    )
    assert.equal(handlerCalls, 0)
  } finally {
    await client.close()
    await server.close()
  }
}

async function testOversizedRequest(): Promise<void> {
  let handlerCalls = 0
  const server = await createPipeServer({
    pluginId: PLUGIN_ID,
    capability: CAPABILITY,
    handle() {
      handlerCalls += 1
      return null
    },
  })
  const client = await createPipeClient(server.endpoint, {
    pluginId: PLUGIN_ID,
    capability: CAPABILITY,
  })

  try {
    await assertRuntimeError(
      () => client.invoke("speech.transcribe", { text: "x".repeat(MEBIBYTE) }),
      "RPC_PAYLOAD_TOO_LARGE",
    )
    await delay(20)
    assert.equal(handlerCalls, 0)
  } finally {
    await client.close()
    await server.close()
  }
}

async function testInvocationTimeout(): Promise<void> {
  const server = await createPipeServer({
    pluginId: PLUGIN_ID,
    capability: CAPABILITY,
    async handle() {
      await delay(100)
      return "late"
    },
  })
  const client = await createPipeClient(server.endpoint, {
    pluginId: PLUGIN_ID,
    capability: CAPABILITY,
    invocationTimeoutMs: 20,
  })

  try {
    await assertRuntimeError(
      () => client.invoke("speech.transcribe"),
      "RPC_TIMEOUT",
    )
  } finally {
    await client.close()
    await server.close()
  }
}

async function testOversizedResponse(): Promise<void> {
  const server = await createPipeServer({
    pluginId: PLUGIN_ID,
    capability: CAPABILITY,
    handle() {
      return { text: "x".repeat(5 * MEBIBYTE) }
    },
  })
  const client = await createPipeClient(server.endpoint, {
    pluginId: PLUGIN_ID,
    capability: CAPABILITY,
  })

  try {
    await assertRuntimeError(
      () => client.invoke("speech.transcribe"),
      "RPC_RESPONSE_TOO_LARGE",
    )
  } finally {
    await client.close()
    await server.close()
  }
}

async function testStructuredMethodNotFound(): Promise<void> {
  const server = await createPipeServer({
    pluginId: PLUGIN_ID,
    capability: CAPABILITY,
    handle(method) {
      throw new PluginRuntimeError(
        "RPC_METHOD_NOT_FOUND",
        `unknown method: ${method}`,
        { retryable: false },
      )
    },
  })
  const client = await createPipeClient(server.endpoint, {
    pluginId: PLUGIN_ID,
    capability: CAPABILITY,
  })

  try {
    const error = await assertRuntimeError(
      () => client.invoke("missing.method"),
      "RPC_METHOD_NOT_FOUND",
    )
    assert.equal(error.message, "unknown method: missing.method")
    assert.equal(error.retryable, false)
  } finally {
    await client.close()
    await server.close()
  }
}

testStrictProtocolDecoding()
await testRoundtripAndConcurrentRequests()
await testUnauthorizedCapability()
await testOversizedRequest()
await testInvocationTimeout()
await testOversizedResponse()
await testStructuredMethodNotFound()

console.log("[plugin-host-runtime] pipe tests passed")

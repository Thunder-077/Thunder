import assert from "node:assert/strict"
import { createConnection, type Socket } from "node:net"
import {
  createPipeClient,
  createPipeServer,
  decodeEnvelope,
  encodeEnvelope,
  NewlineFrameDecoder,
  PluginRuntimeError,
  RPC_PROTOCOL_VERSION,
  type RpcEnvelope,
} from "../index"

const PLUGIN_ID = "test-plugin"
const CAPABILITY = "secret"
const MEBIBYTE = 1024 * 1024

if (false) {
  // @ts-expect-error Pipe clients must always bind an explicit identity.
  void createPipeClient("unused-endpoint")
  // @ts-expect-error Pipe servers must always require plugin identity and capability.
  void createPipeServer({ handle: () => null })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function connectRaw(endpoint: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(endpoint)
    socket.once("connect", () => resolve(socket))
    socket.once("error", reject)
  })
}

function readRawEnvelopes(
  socket: Socket,
  expectedCount: number,
): Promise<RpcEnvelope[]> {
  return new Promise((resolve, reject) => {
    let buffer = ""
    const envelopes: RpcEnvelope[] = []

    const cleanup = () => {
      socket.off("data", onData)
      socket.off("error", onError)
      socket.off("close", onClose)
    }
    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }
    const onClose = () => {
      cleanup()
      reject(new Error("Raw RPC socket closed before all envelopes arrived"))
    }
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8")
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        if (line.trim()) {
          envelopes.push(decodeEnvelope(line))
        }
      }

      if (envelopes.length >= expectedCount) {
        cleanup()
        resolve(envelopes)
      }
    }

    socket.on("data", onData)
    socket.once("error", onError)
    socket.once("close", onClose)
  })
}

async function waitForSocketClose(socket: Socket): Promise<void> {
  if (socket.destroyed) {
    return
  }

  await new Promise<void>((resolve) => socket.once("close", () => resolve()))
}

function createRawRequest(
  id: string,
  method: string,
  payload?: unknown,
): string {
  return encodeEnvelope({
    version: RPC_PROTOCOL_VERSION,
    type: "request",
    id,
    pluginId: PLUGIN_ID,
    capability: CAPABILITY,
    method,
    payload,
  })
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

function assertInvalidEnvelope(value: unknown): PluginRuntimeError {
  try {
    decodeEnvelope(JSON.stringify(value))
  } catch (error) {
    assert.ok(error instanceof PluginRuntimeError)
    assert.equal(error.code, "RPC_INVALID_REQUEST")
    return error
  }

  assert.fail("Expected an invalid RPC envelope")
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
  assertInvalidEnvelope({
    version: 2,
    type: "request",
    id: "request-1",
    pluginId: PLUGIN_ID,
    capability: CAPABILITY,
    method: "speech.transcribe",
  })
  assertInvalidEnvelope({
    version: 1,
    type: "error",
    id: "request-1",
    pluginId: PLUGIN_ID,
    error: {
      code: "NOT_A_RUNTIME_ERROR",
      message: "invalid",
    },
  })
  assertInvalidEnvelope({
    version: 1,
    type: "request",
    id: "request-1",
    pluginId: PLUGIN_ID,
    capability: CAPABILITY,
    method: "speech.transcribe",
    unexpected: true,
  })
  assertInvalidEnvelope({
    version: 1,
    type: "response",
    id: "request-1",
    pluginId: PLUGIN_ID,
    unexpected: true,
  })
  assertInvalidEnvelope({
    version: 1,
    type: "error",
    id: "request-1",
    pluginId: PLUGIN_ID,
    error: {
      code: "RPC_TIMEOUT",
      message: "timeout",
      unexpected: true,
    },
  })
}

function testIncrementalFrameDecoderLimit(): void {
  const decoder = new NewlineFrameDecoder(64 * 1024)
  const byte = Buffer.from("x")

  for (let index = 0; index < 64 * 1024; index += 1) {
    assert.deepEqual(decoder.push(byte), {
      frames: [],
      overflow: false,
    })
  }

  assert.deepEqual(decoder.push(byte), {
    frames: [],
    overflow: true,
  })
}

async function testFragmentedAndBatchedFrames(): Promise<void> {
  const server = await createPipeServer({
    pluginId: PLUGIN_ID,
    capability: CAPABILITY,
    handle(method, payload) {
      return { method, payload }
    },
  })
  const socket = await connectRaw(server.endpoint)

  try {
    const fragmented = createRawRequest("fragmented", "fragmented", {
      value: 1,
    })
    const batched =
      createRawRequest("batched-1", "batched", { value: 2 }) +
      createRawRequest("batched-2", "batched", { value: 3 })
    const responsesPromise = readRawEnvelopes(socket, 3)

    socket.write(fragmented.slice(0, 17))
    socket.write(fragmented.slice(17))
    socket.write(batched)

    const responses = await responsesPromise
    assert.deepEqual(
      new Set(responses.map((response) => response.id)),
      new Set(["fragmented", "batched-1", "batched-2"]),
    )
  } finally {
    socket.destroy()
    await server.close()
  }
}

async function testMalformedRawRequests(): Promise<void> {
  const server = await createPipeServer({
    pluginId: PLUGIN_ID,
    capability: CAPABILITY,
    handle() {
      return null
    },
  })

  try {
    for (const request of [
      {
        version: 2,
        type: "request",
        id: "bad-version",
        pluginId: PLUGIN_ID,
        capability: CAPABILITY,
        method: "test",
      },
      {
        version: 1,
        type: "request",
        id: "unknown-field",
        pluginId: PLUGIN_ID,
        capability: CAPABILITY,
        method: "test",
        unexpected: true,
      },
      {
        version: 1,
        type: "request",
        id: 42,
        pluginId: PLUGIN_ID,
        capability: CAPABILITY,
        method: "test",
      },
    ]) {
      const socket = await connectRaw(server.endpoint)
      const responsePromise = readRawEnvelopes(socket, 1)
      socket.write(`${JSON.stringify(request)}\n`)
      const [response] = await responsePromise
      assert.equal(response.type, "error")
      if (response.type === "error") {
        assert.equal(response.error.code, "RPC_INVALID_REQUEST")
      }
      socket.destroy()
    }
  } finally {
    await server.close()
  }
}

async function testUnterminatedOversizedFrame(): Promise<void> {
  const server = await createPipeServer({
    pluginId: PLUGIN_ID,
    capability: CAPABILITY,
    maxRequestBytes: 128,
    handle() {
      return null
    },
  })
  const socket = await connectRaw(server.endpoint)

  try {
    const closedPromise = waitForSocketClose(socket)
    for (let index = 0; index < 128 + 64 * 1024 + 1; index += 1) {
      socket.write("x")
    }
    await closedPromise
  } finally {
    socket.destroy()
    await server.close()
  }
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
  let calls = 0
  const server = await createPipeServer({
    pluginId: PLUGIN_ID,
    capability: CAPABILITY,
    async handle() {
      calls += 1
      if (calls === 1) {
        await delay(100)
        return "late"
      }
      return "current"
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
    await delay(120)
    assert.equal(await client.invoke("speech.transcribe"), "current")
  } finally {
    await client.close()
    await server.close()
  }
}

async function testServerCloseWithActiveClient(): Promise<void> {
  const server = await createPipeServer({
    pluginId: PLUGIN_ID,
    capability: CAPABILITY,
    async handle() {
      await new Promise(() => undefined)
    },
  })
  const client = await createPipeClient(server.endpoint, {
    pluginId: PLUGIN_ID,
    capability: CAPABILITY,
  })
  const pendingRejection = assertRuntimeError(
    () => client.invoke("never.returns"),
    "RUNTIME_CRASHED",
  )

  await delay(20)
  const firstClose = server.close()
  const secondClose = server.close()
  assert.equal(firstClose, secondClose)
  await Promise.race([
    firstClose,
    delay(500).then(() => assert.fail("Pipe server close timed out")),
  ])
  await pendingRejection
  await server.close()
  await client.close()
}

async function testDestroyedSocketRejectsPendingRequest(): Promise<void> {
  const server = await createPipeServer({
    pluginId: PLUGIN_ID,
    capability: CAPABILITY,
    async handle() {
      await new Promise(() => undefined)
    },
  })
  const client = await createPipeClient(server.endpoint, {
    pluginId: PLUGIN_ID,
    capability: CAPABILITY,
  })
  const pendingRejection = assertRuntimeError(
    () => client.invoke("never.returns"),
    "RUNTIME_CRASHED",
  )

  await delay(20)
  await server.close()
  await pendingRejection
  await client.close()
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

async function testOversizedHandlerError(): Promise<void> {
  const server = await createPipeServer({
    pluginId: PLUGIN_ID,
    capability: CAPABILITY,
    maxResponseBytes: 8 * 1024,
    handle() {
      throw new PluginRuntimeError(
        "RPC_HANDLER_FAILED",
        `handler failed: ${"x".repeat(6 * MEBIBYTE)}`,
      )
    },
  })
  const client = await createPipeClient(server.endpoint, {
    pluginId: PLUGIN_ID,
    capability: CAPABILITY,
    maxResponseBytes: 8 * 1024,
  })

  try {
    const error = await assertRuntimeError(
      () => client.invoke("large.error"),
      "RPC_HANDLER_FAILED",
    )
    assert.match(error.message, /^handler failed:/)
    assert.ok(Buffer.byteLength(error.message, "utf8") <= 4 * 1024)
  } finally {
    await client.close()
    await server.close()
  }
}

async function testPlainHandlerErrorIsSanitized(): Promise<void> {
  const secret = "database-password=super-secret"
  const sensitivePath = "C:\\Users\\private\\plugin-data"
  const server = await createPipeServer({
    pluginId: PLUGIN_ID,
    capability: CAPABILITY,
    handle() {
      throw new Error(`${secret} at ${sensitivePath}`)
    },
  })
  const client = await createPipeClient(server.endpoint, {
    pluginId: PLUGIN_ID,
    capability: CAPABILITY,
  })

  try {
    const error = await assertRuntimeError(
      () => client.invoke("plain.error"),
      "RPC_HANDLER_FAILED",
    )
    assert.equal(error.message, "Trusted runtime handler failed")
    assert.equal(error.message.includes(secret), false)
    assert.equal(error.message.includes(sensitivePath), false)
  } finally {
    await client.close()
    await server.close()
  }
}

testStrictProtocolDecoding()
testIncrementalFrameDecoderLimit()
await testRoundtripAndConcurrentRequests()
await testFragmentedAndBatchedFrames()
await testMalformedRawRequests()
await testUnterminatedOversizedFrame()
await testUnauthorizedCapability()
await testOversizedRequest()
await testInvocationTimeout()
await testServerCloseWithActiveClient()
await testDestroyedSocketRejectsPendingRequest()
await testOversizedResponse()
await testStructuredMethodNotFound()
await testOversizedHandlerError()
await testPlainHandlerErrorIsSanitized()

console.log("[plugin-host-runtime] pipe tests passed")

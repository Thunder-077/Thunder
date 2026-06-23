import { randomUUID } from "node:crypto"
import { mkdir, rm } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const VERSION = 1
const OVERHEAD_BYTES = 64 * 1024
const REQUEST_KEYS = new Set(["capability", "id", "method", "payload", "pluginId", "type", "version"])
const REQUIRED_REQUEST_KEYS = ["capability", "id", "method", "pluginId", "type", "version"]
let server
let endpoint
let initialized = false
let shuttingDown = false

function send(message) {
  if (process.send) process.send(message)
}

function isInside(child, parent) {
  const path = relative(resolve(parent), resolve(child))
  return path === "" || (!path.startsWith("..") && !isAbsolute(path))
}

function createEndpoint(socketDirectory) {
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\thunder-plugin-${randomUUID()}`
  }
  return join(resolve(socketDirectory ?? tmpdir()), `thunder-plugin-${randomUUID()}.sock`)
}

function write(socket, envelope, maxBytes) {
  const encoded = `${JSON.stringify(envelope)}\n`
  if (Buffer.byteLength(encoded, "utf8") > maxBytes) {
    socket.destroy()
    return
  }
  socket.write(encoded)
}

function errorEnvelope(config, id, code, message, retryable = false) {
  return {
    version: VERSION,
    type: "error",
    id,
    pluginId: config.pluginId,
    error: { code, message, ...(retryable ? { retryable: true } : {}) },
  }
}

function hasOnlyRequestKeys(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const keys = Object.keys(value)
  return keys.every((key) => REQUEST_KEYS.has(key)) &&
    REQUIRED_REQUEST_KEYS.every((key) => Object.hasOwn(value, key))
}

function isRequestEnvelope(value) {
  return hasOnlyRequestKeys(value) &&
    value.version === VERSION &&
    value.type === "request" &&
    typeof value.id === "string" &&
    typeof value.pluginId === "string" &&
    typeof value.capability === "string" &&
    typeof value.method === "string"
}

/**
 * Buffer only the unfinished frame. Complete frames are concatenated once,
 * avoiding quadratic copies when a large request arrives in small chunks.
 */
function createFrameDecoder(maxBytes, onFrame, onOverflow) {
  let chunks = []
  let bytes = 0

  function append(chunk) {
    if (chunk.length === 0) return true
    chunks.push(chunk)
    bytes += chunk.length
    if (bytes + 1 > maxBytes) {
      onOverflow()
      return false
    }
    return true
  }

  return {
    push(chunk) {
      let start = 0
      for (let index = 0; index < chunk.length; index += 1) {
        if (chunk[index] !== 10) continue
        if (!append(chunk.subarray(start, index))) return
        const frame = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, bytes)
        chunks = []
        bytes = 0
        start = index + 1
        if (frame.length > 0) onFrame(frame)
      }
      append(chunk.subarray(start))
    },
  }
}

async function startRuntime(config) {
  const entryPath = resolve(config.pluginRoot, config.runtimeEntry)
  if (!isInside(entryPath, config.pluginRoot)) {
    throw new Error("Trusted runtime entry escapes the plugin root")
  }

  const workerModule = await import(pathToFileURL(entryPath).href)
  const definition = workerModule.default
  if (!definition || typeof definition !== "object" || !definition.handlers || typeof definition.handlers !== "object" || Array.isArray(definition.handlers)) {
    throw new Error(`Trusted plugin ${config.pluginId} runtime must export default worker handlers`)
  }

  endpoint = createEndpoint(config.socketDirectory)
  if (process.platform !== "win32") await mkdir(dirname(endpoint), { recursive: true })

  const sockets = new Set()
  server = createServer((socket) => {
    sockets.add(socket)
    socket.once("close", () => sockets.delete(socket))
    socket.on("error", () => socket.destroy())
    const decoder = createFrameDecoder(
      config.maxRequestBytes + OVERHEAD_BYTES,
      (frame) => void handleFrame(socket, frame, definition.handlers, config),
      () => socket.destroy(),
    )
    socket.on("data", (chunk) => decoder.push(chunk))
  })

  await new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise)
    server.listen(endpoint, () => {
      server.off("error", rejectPromise)
      resolvePromise()
    })
  })

  return async () => {
    for (const socket of sockets) socket.destroy()
    await new Promise((resolvePromise) => server.close(() => resolvePromise()))
    if (process.platform !== "win32") await rm(endpoint, { force: true })
  }
}

async function handleFrame(socket, frame, handlers, config) {
  let request
  try {
    request = JSON.parse(frame.toString("utf8"))
    if (frame.length + 1 > config.maxRequestBytes || !isRequestEnvelope(request)) throw new Error("invalid")
  } catch {
    write(socket, errorEnvelope(config, randomUUID(), "RPC_INVALID_REQUEST", "RPC request is invalid"), config.maxResponseBytes)
    return
  }

  if (request.pluginId !== config.pluginId || request.capability !== config.capability) {
    write(socket, errorEnvelope(config, request.id, "RPC_UNAUTHORIZED", "RPC request is unauthorized"), config.maxResponseBytes)
    return
  }

  const handler = handlers[request.method]
  if (typeof handler !== "function") {
    write(socket, errorEnvelope(config, request.id, "RPC_METHOD_NOT_FOUND", "Trusted runtime method was not found"), config.maxResponseBytes)
    return
  }

  try {
    const payload = await handler(request.payload)
    const response = {
      version: VERSION,
      type: "response",
      id: request.id,
      pluginId: config.pluginId,
      payload,
    }
    const encoded = `${JSON.stringify(response)}\n`
    if (Buffer.byteLength(encoded, "utf8") > config.maxResponseBytes) {
      write(socket, errorEnvelope(config, request.id, "RPC_RESPONSE_TOO_LARGE", "RPC response is too large"), config.maxResponseBytes)
      return
    }
    socket.write(encoded)
  } catch {
    write(socket, errorEnvelope(config, request.id, "RPC_HANDLER_FAILED", "Trusted runtime handler failed"), config.maxResponseBytes)
  }
}

async function shutdown(closeRuntime) {
  if (shuttingDown) return
  shuttingDown = true
  try {
    if (closeRuntime) await closeRuntime()
    send({ type: "stopped", version: VERSION })
  } finally {
    process.exit(0)
  }
}

send({ type: "bootstrap-ready", version: VERSION })

process.on("message", async (message) => {
  if (message?.type === "initialize" && !initialized) {
    initialized = true
    try {
      const closeRuntime = await startRuntime(message.config)
      process.on("disconnect", () => void shutdown(closeRuntime))
      process.on("SIGTERM", () => void shutdown(closeRuntime))
      process.on("SIGINT", () => void shutdown(closeRuntime))
      process.on("message", (control) => {
        if (control?.type === "shutdown") void shutdown(closeRuntime)
      })
      send({
        type: "ready",
        version: VERSION,
        pluginId: message.config.pluginId,
        endpoint,
      })
    } catch (error) {
      send({
        type: "init-error",
        version: VERSION,
        error: error instanceof Error ? error.message : String(error),
      })
      process.exit(1)
    }
  }
})

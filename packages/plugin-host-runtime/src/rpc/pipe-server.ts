import { randomUUID } from "node:crypto"
import { mkdir, rm } from "node:fs/promises"
import { createServer, type Server, type Socket } from "node:net"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"

import { PluginRuntimeError } from "../runtime-errors"
import { TRUSTED_RUNTIME_LIMITS } from "../runtime-policy"
import {
  decodeEnvelope,
  encodeEnvelope,
  NewlineFrameDecoder,
  RPC_PROTOCOL_VERSION,
  type RpcErrorEnvelope,
  type RpcRequestEnvelope,
} from "./host-protocol"

const ENVELOPE_OVERHEAD_BYTES = 64 * 1024
const MAX_ERROR_MESSAGE_BYTES = 4 * 1024

export interface PipeServer {
  readonly endpoint: string
  close(): Promise<void>
}

export interface PipeServerOptions {
  pluginId: string
  capability: string
  handle(method: string, payload: unknown): Promise<unknown> | unknown
  socketDirectory?: string
  maxRequestBytes?: number
  maxResponseBytes?: number
}

interface ResolvedPipeServerOptions {
  pluginId: string
  capability: string
  handle(method: string, payload: unknown): Promise<unknown> | unknown
  socketDirectory?: string
  maxRequestBytes: number
  maxResponseBytes: number
}

function createPipeEndpoint(socketDirectory?: string): string {
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\thunder-plugin-${randomUUID()}`
  }

  const baseDir = resolve(socketDirectory ?? tmpdir())
  return join(baseDir, `thunder-plugin-${randomUUID()}.sock`)
}

async function ensureSocketDirectory(endpoint: string): Promise<void> {
  if (process.platform === "win32") {
    return
  }

  await mkdir(dirname(endpoint), { recursive: true })
}

function toErrorEnvelope(
  options: ResolvedPipeServerOptions,
  id: string,
  error: unknown,
): RpcErrorEnvelope {
  const runtimeError =
    error instanceof PluginRuntimeError
      ? error
      : new PluginRuntimeError(
          "RPC_HANDLER_FAILED",
          "Trusted runtime handler failed",
          { cause: error },
        )
  const message = truncateUtf8(runtimeError.message, MAX_ERROR_MESSAGE_BYTES)

  return {
    version: RPC_PROTOCOL_VERSION,
    type: "error",
    id,
    pluginId: options.pluginId,
    error: {
      code: runtimeError.code,
      message: message || "RPC request failed",
      ...(runtimeError.retryable
        ? { retryable: runtimeError.retryable }
        : {}),
    },
  }
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) {
    return value
  }

  let result = ""
  let usedBytes = 0
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, "utf8")
    if (usedBytes + characterBytes > maxBytes) {
      break
    }
    result += character
    usedBytes += characterBytes
  }
  return result
}

async function writeEnvelope(
  socket: Socket,
  envelope: RpcErrorEnvelope | ReturnType<typeof createResponseEnvelope>,
  maxResponseBytes: number,
): Promise<boolean> {
  if (socket.destroyed || !socket.writable) {
    return false
  }

  const encoded = encodeEnvelope(envelope)
  if (Buffer.byteLength(encoded, "utf8") > maxResponseBytes) {
    socket.destroy()
    return false
  }

  await new Promise<void>((resolvePromise, rejectPromise) => {
    try {
      socket.write(encoded, (error) => {
        if (error) {
          rejectPromise(error)
          return
        }
        resolvePromise()
      })
    } catch (error) {
      rejectPromise(error)
    }
  })
  return true
}

function createResponseEnvelope(
  options: ResolvedPipeServerOptions,
  request: RpcRequestEnvelope,
  payload: unknown,
) {
  return {
    version: RPC_PROTOCOL_VERSION,
    type: "response" as const,
    id: request.id,
    pluginId: options.pluginId,
    payload,
  }
}

async function handleRequest(
  socket: Socket,
  line: string,
  lineBytes: number,
  options: ResolvedPipeServerOptions,
): Promise<void> {
  let request: RpcRequestEnvelope

  try {
    const envelope = decodeEnvelope(line)
    if (envelope.type !== "request") {
      throw new PluginRuntimeError(
        "RPC_INVALID_REQUEST",
        "RPC server only accepts request envelopes",
      )
    }
    request = envelope
  } catch (error) {
    await writeEnvelope(
      socket,
      toErrorEnvelope(options, randomUUID(), error),
      options.maxResponseBytes,
    ).catch(() => socket.destroy())
    return
  }

  if (lineBytes > options.maxRequestBytes) {
    await writeEnvelope(
      socket,
      toErrorEnvelope(
        options,
        request.id,
        new PluginRuntimeError(
          "RPC_PAYLOAD_TOO_LARGE",
          `RPC request exceeded ${options.maxRequestBytes} bytes`,
        ),
      ),
      options.maxResponseBytes,
    ).catch(() => socket.destroy())
    return
  }

  if (
    request.pluginId !== options.pluginId ||
    request.capability !== options.capability
  ) {
    await writeEnvelope(
      socket,
      toErrorEnvelope(
        options,
        request.id,
        new PluginRuntimeError(
          "RPC_UNAUTHORIZED",
          "RPC plugin identity or capability is invalid",
        ),
      ),
      options.maxResponseBytes,
    ).catch(() => socket.destroy())
    return
  }

  try {
    const payload = await options.handle(request.method, request.payload)
    const response = createResponseEnvelope(options, request, payload)
    const encodedResponse = encodeEnvelope(response)

    if (
      Buffer.byteLength(encodedResponse, "utf8") >
      options.maxResponseBytes
    ) {
      throw new PluginRuntimeError(
        "RPC_RESPONSE_TOO_LARGE",
        `RPC response exceeded ${options.maxResponseBytes} bytes`,
      )
    }

    await writeEnvelope(socket, response, options.maxResponseBytes)
  } catch (error) {
    await writeEnvelope(
      socket,
      toErrorEnvelope(options, request.id, error),
      options.maxResponseBytes,
    ).catch(() => socket.destroy())
  }
}

function attachConnectionHandler(
  socket: Socket,
  options: ResolvedPipeServerOptions,
): void {
  const bufferLimit = options.maxRequestBytes + ENVELOPE_OVERHEAD_BYTES
  const decoder = new NewlineFrameDecoder(bufferLimit)

  socket.on("data", (chunk: Buffer) => {
    const result = decoder.push(chunk)
    for (const lineBuffer of result.frames) {
      const line = lineBuffer.toString("utf8").trim()

      if (line) {
        void handleRequest(
          socket,
          line,
          lineBuffer.length + 1,
          options,
        )
      }
    }

    if (result.overflow) {
      socket.destroy()
    }
  })
}

async function listen(server: Server, endpoint: string): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const onError = (error: Error) => {
      server.off("listening", onListening)
      rejectPromise(error)
    }
    const onListening = () => {
      server.off("error", onError)
      resolvePromise()
    }

    server.once("error", onError)
    server.once("listening", onListening)
    server.listen(endpoint)
  })
}

function waitForSocketClose(socket: Socket): Promise<void> {
  if (socket.destroyed) {
    return Promise.resolve()
  }

  return new Promise<void>((resolvePromise) => {
    socket.once("close", () => resolvePromise())
  })
}

async function closeServer(
  server: Server,
  sockets: ReadonlySet<Socket>,
  endpoint: string,
): Promise<void> {
  const serverClosed = new Promise<void>((resolvePromise, rejectPromise) => {
    server.close((error) => {
      if (error) {
        rejectPromise(error)
        return
      }

      resolvePromise()
    })
  })

  const socketClosures = [...sockets].map((socket) => {
    const closed = waitForSocketClose(socket)
    socket.destroy()
    return closed
  })

  await Promise.all([serverClosed, ...socketClosures])

  if (process.platform !== "win32") {
    await rm(endpoint, { force: true })
  }
}

export async function createPipeServer(
  options: PipeServerOptions,
): Promise<PipeServer> {
  const resolvedOptions: ResolvedPipeServerOptions = {
    pluginId: options.pluginId,
    capability: options.capability,
    handle: options.handle,
    socketDirectory: options.socketDirectory,
    maxRequestBytes:
      options.maxRequestBytes ?? TRUSTED_RUNTIME_LIMITS.maxRequestBytes,
    maxResponseBytes:
      options.maxResponseBytes ?? TRUSTED_RUNTIME_LIMITS.maxResponseBytes,
  }
  const endpoint = createPipeEndpoint(resolvedOptions.socketDirectory)

  await ensureSocketDirectory(endpoint)

  const sockets = new Set<Socket>()
  const server = createServer((socket) => {
    sockets.add(socket)
    socket.on("error", () => {
      socket.destroy()
    })
    socket.once("close", () => {
      sockets.delete(socket)
    })
    attachConnectionHandler(socket, resolvedOptions)
  })

  await listen(server, endpoint)
  let closePromise: Promise<void> | undefined

  return {
    endpoint,
    close() {
      closePromise ??= closeServer(server, sockets, endpoint)
      return closePromise
    },
  }
}

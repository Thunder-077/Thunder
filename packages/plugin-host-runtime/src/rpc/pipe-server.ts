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
  RPC_PROTOCOL_VERSION,
  type RpcErrorEnvelope,
  type RpcRequestEnvelope,
} from "./host-protocol"

const LEGACY_RPC_IDENTITY = "__legacy__"
const ENVELOPE_OVERHEAD_BYTES = 64 * 1024

export interface PipeServer {
  readonly endpoint: string
  close(): Promise<void>
}

export interface PipeServerLimits {
  maxRequestBytes?: number
  maxResponseBytes?: number
}

export interface PipeServerOptions {
  pluginId: string
  capability: string
  handle(method: string, payload: unknown): Promise<unknown> | unknown
  socketDirectory?: string
  limits?: PipeServerLimits
}

interface LegacyPipeServerOptions {
  handle(method: string, payload: unknown): Promise<unknown> | unknown
  socketDirectory?: string
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
          error instanceof Error ? error.message : String(error),
          { cause: error },
        )

  return {
    version: RPC_PROTOCOL_VERSION,
    type: "error",
    id,
    pluginId: options.pluginId,
    error: {
      code: runtimeError.code,
      message: runtimeError.message,
      ...(runtimeError.retryable
        ? { retryable: runtimeError.retryable }
        : {}),
    },
  }
}

async function writeEnvelope(
  socket: Socket,
  envelope: RpcErrorEnvelope | ReturnType<typeof createResponseEnvelope>,
): Promise<void> {
  if (socket.destroyed || !socket.writable) {
    return
  }

  const encoded = encodeEnvelope(envelope)
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

    await writeEnvelope(socket, response)
  } catch (error) {
    await writeEnvelope(
      socket,
      toErrorEnvelope(options, request.id, error),
    ).catch(() => socket.destroy())
  }
}

function attachConnectionHandler(
  socket: Socket,
  options: ResolvedPipeServerOptions,
): void {
  let buffer = Buffer.alloc(0)
  const bufferLimit = options.maxRequestBytes + ENVELOPE_OVERHEAD_BYTES

  socket.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk])

    let newlineIndex = buffer.indexOf(0x0a)
    while (newlineIndex >= 0) {
      const lineBuffer = buffer.subarray(0, newlineIndex)
      buffer = buffer.subarray(newlineIndex + 1)

      if (lineBuffer.length > bufferLimit) {
        socket.destroy()
        return
      }

      const line = lineBuffer.toString("utf8").trim()

      if (line) {
        void handleRequest(
          socket,
          line,
          lineBuffer.length + 1,
          options,
        )
      }

      newlineIndex = buffer.indexOf(0x0a)
    }

    if (buffer.length > bufferLimit) {
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

async function closeServer(server: Server, endpoint: string): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.close((error) => {
      if (error) {
        rejectPromise(error)
        return
      }

      resolvePromise()
    })
  })

  if (process.platform !== "win32") {
    await rm(endpoint, { force: true })
  }
}

export function createPipeServer(
  options: PipeServerOptions,
): Promise<PipeServer>
export function createPipeServer(
  options: LegacyPipeServerOptions,
): Promise<PipeServer>
export async function createPipeServer(
  options: PipeServerOptions | LegacyPipeServerOptions,
): Promise<PipeServer> {
  const secureOptions =
    "pluginId" in options && "capability" in options ? options : undefined
  const resolvedOptions: ResolvedPipeServerOptions = {
    pluginId: secureOptions?.pluginId ?? LEGACY_RPC_IDENTITY,
    capability: secureOptions?.capability ?? LEGACY_RPC_IDENTITY,
    handle: options.handle,
    socketDirectory: options.socketDirectory,
    maxRequestBytes:
      secureOptions?.limits?.maxRequestBytes ??
      TRUSTED_RUNTIME_LIMITS.maxRequestBytes,
    maxResponseBytes:
      secureOptions?.limits?.maxResponseBytes ??
      TRUSTED_RUNTIME_LIMITS.maxResponseBytes,
  }
  const endpoint = createPipeEndpoint(resolvedOptions.socketDirectory)

  await ensureSocketDirectory(endpoint)

  const server = createServer((socket) => {
    attachConnectionHandler(socket, resolvedOptions)
  })

  await listen(server, endpoint)

  return {
    endpoint,
    async close() {
      await closeServer(server, endpoint)
    },
  }
}

import { randomUUID } from "node:crypto"
import { createConnection, type Socket } from "node:net"

import { PluginRuntimeError } from "../runtime-errors"
import { TRUSTED_RUNTIME_LIMITS } from "../runtime-policy"
import {
  decodeEnvelope,
  encodeEnvelope,
  NewlineFrameDecoder,
  RPC_PROTOCOL_VERSION,
  type RpcErrorEnvelope,
  type RpcResponseEnvelope,
} from "./host-protocol"

export interface PipeInvokeOptions {
  timeoutMs?: number
}

export interface PipeClient {
  invoke<T>(
    method: string,
    payload?: unknown,
    options?: PipeInvokeOptions,
  ): Promise<T>
  openStream<TResult = unknown>(
    method: string,
    payload?: unknown,
    options?: PipeInvokeOptions,
  ): Promise<PipeClientStream<TResult>>
  close(): Promise<void>
}

export interface PipeClientStream<TResult = unknown> {
  readonly id: string
  write(payload?: unknown, options?: PipeInvokeOptions): Promise<TResult>
  close(options?: PipeInvokeOptions): Promise<void>
}

export interface PipeClientOptions {
  pluginId: string
  capability: string
  invocationTimeoutMs?: number
  maxRequestBytes?: number
  maxResponseBytes?: number
}

type PendingRequest = {
  timer: NodeJS.Timeout
  resolve(value: unknown): void
  reject(error: PluginRuntimeError): void
}

function assertPipeWritable(socket: Socket, closed: boolean): void {
  if (closed || socket.destroyed || !socket.writable) {
    throw new PluginRuntimeError(
      "RUNTIME_NOT_READY",
      "RPC pipe client is not connected",
      { retryable: true },
    )
  }
}

function clearPendingRequest(
  pending: Map<string, PendingRequest>,
  id: string,
): PendingRequest | undefined {
  const request = pending.get(id)
  if (!request) {
    return undefined
  }

  clearTimeout(request.timer)
  pending.delete(id)
  return request
}

function rejectPending(
  pending: Map<string, PendingRequest>,
  error: PluginRuntimeError,
): void {
  for (const id of [...pending.keys()]) {
    clearPendingRequest(pending, id)?.reject(error)
  }
}

function handleEnvelope(
  pending: Map<string, PendingRequest>,
  expectedPluginId: string,
  envelope: RpcResponseEnvelope | RpcErrorEnvelope,
): void {
  if (envelope.pluginId !== expectedPluginId) {
    rejectPending(
      pending,
      new PluginRuntimeError(
        "RPC_INVALID_REQUEST",
        "RPC response plugin identity does not match the client",
      ),
    )
    return
  }

  const request = clearPendingRequest(pending, envelope.id)
  if (!request) {
    return
  }

  if (envelope.type === "response") {
    request.resolve(envelope.payload)
    return
  }

  request.reject(
    new PluginRuntimeError(envelope.error.code, envelope.error.message, {
      retryable: envelope.error.retryable,
    }),
  )
}

function attachSocketReader(
  socket: Socket,
  pending: Map<string, PendingRequest>,
  pluginId: string,
  maxResponseBytes: number,
): void {
  const decoder = new NewlineFrameDecoder(maxResponseBytes)

  socket.on("data", (chunk: Buffer) => {
    const result = decoder.push(chunk)
    for (const lineBuffer of result.frames) {
      const line = lineBuffer.toString("utf8").trim()
      if (line) {
        try {
          const envelope = decodeEnvelope(line)
          if (envelope.type === "response" || envelope.type === "error") {
            handleEnvelope(pending, pluginId, envelope)
          }
        } catch (error) {
          rejectPending(
            pending,
            new PluginRuntimeError(
              "RPC_INVALID_REQUEST",
              error instanceof Error ? error.message : String(error),
              { cause: error },
            ),
          )
          socket.destroy()
          return
        }
      }
    }

    if (result.overflow) {
      rejectPending(
        pending,
        new PluginRuntimeError(
          "RPC_RESPONSE_TOO_LARGE",
          `RPC response exceeded ${maxResponseBytes} bytes`,
        ),
      )
      socket.destroy()
    }
  })
}

async function connectToEndpoint(endpoint: string): Promise<Socket> {
  return new Promise<Socket>((resolvePromise, rejectPromise) => {
    const socket = createConnection(endpoint)
    const onError = (error: Error) => {
      socket.off("connect", onConnect)
      rejectPromise(
        new PluginRuntimeError(
          "RUNTIME_NOT_READY",
          `Unable to connect to RPC pipe: ${error.message}`,
          { cause: error, retryable: true },
        ),
      )
    }
    const onConnect = () => {
      socket.off("error", onError)
      resolvePromise(socket)
    }

    socket.once("error", onError)
    socket.once("connect", onConnect)
  })
}

export async function createPipeClient(
  endpoint: string,
  options: PipeClientOptions,
): Promise<PipeClient> {
  const resolvedOptions: Required<PipeClientOptions> = {
    pluginId: options.pluginId,
    capability: options.capability,
    invocationTimeoutMs:
      options.invocationTimeoutMs ?? TRUSTED_RUNTIME_LIMITS.invocationTimeoutMs,
    maxRequestBytes:
      options.maxRequestBytes ?? TRUSTED_RUNTIME_LIMITS.maxRequestBytes,
    maxResponseBytes:
      options.maxResponseBytes ?? TRUSTED_RUNTIME_LIMITS.maxResponseBytes,
  }
  const socket = await connectToEndpoint(endpoint)
  const pending = new Map<string, PendingRequest>()
  let closed = false

  attachSocketReader(
    socket,
    pending,
    resolvedOptions.pluginId,
    resolvedOptions.maxResponseBytes,
  )

  socket.on("error", (error) => {
    rejectPending(
      pending,
      new PluginRuntimeError(
        "RUNTIME_CRASHED",
        `RPC pipe connection failed: ${error.message}`,
        { cause: error, retryable: true },
      ),
    )
  })
  socket.on("close", () => {
    closed = true
    rejectPending(
      pending,
      new PluginRuntimeError(
        "RUNTIME_CRASHED",
        "RPC pipe connection closed",
        { retryable: true },
      ),
    )
  })

  return {
    invoke<T>(
      method: string,
      payload?: unknown,
      invokeOptions: PipeInvokeOptions = {},
    ): Promise<T> {
      try {
        assertPipeWritable(socket, closed)
      } catch (error) {
        return Promise.reject(error)
      }

      const id = randomUUID()
      const encodedRequest = encodeEnvelope({
        version: RPC_PROTOCOL_VERSION,
        type: "request",
        id,
        pluginId: resolvedOptions.pluginId,
        capability: resolvedOptions.capability,
        method,
        payload,
      })
      const requestBytes = Buffer.byteLength(encodedRequest, "utf8")

      if (requestBytes > resolvedOptions.maxRequestBytes) {
        return Promise.reject(
          new PluginRuntimeError(
            "RPC_PAYLOAD_TOO_LARGE",
            `RPC request exceeded ${resolvedOptions.maxRequestBytes} bytes`,
          ),
        )
      }

      return new Promise<T>((resolvePromise, rejectPromise) => {
        const timeoutMs =
          invokeOptions.timeoutMs ?? resolvedOptions.invocationTimeoutMs
        const timer = setTimeout(() => {
          clearPendingRequest(pending, id)?.reject(
            new PluginRuntimeError(
              "RPC_TIMEOUT",
              `RPC invocation timed out after ${timeoutMs}ms`,
              { retryable: true },
            ),
          )
        }, timeoutMs)

        pending.set(id, {
          timer,
          resolve(value) {
            resolvePromise(value as T)
          },
          reject(error) {
            rejectPromise(error)
          },
        })

        try {
          socket.write(encodedRequest, (error) => {
            if (!error) {
              return
            }

            clearPendingRequest(pending, id)?.reject(
              new PluginRuntimeError(
                "RUNTIME_CRASHED",
                `RPC pipe write failed: ${error.message}`,
                { cause: error, retryable: true },
              ),
            )
          })
        } catch (error) {
          clearPendingRequest(pending, id)?.reject(
            new PluginRuntimeError(
              "RUNTIME_CRASHED",
              `RPC pipe write failed: ${
                error instanceof Error ? error.message : String(error)
              }`,
              { cause: error, retryable: true },
            ),
          )
        }
      })
    },
    async openStream<TResult = unknown>(
      method: string,
      payload?: unknown,
      openOptions: PipeInvokeOptions = {},
    ): Promise<PipeClientStream<TResult>> {
      assertPipeWritable(socket, closed)
      const streamId = randomUUID()
      let streamClosed = false

      const sendStreamFrame = <TResultValue>(
        type: "stream.open" | "stream.chunk" | "stream.close",
        framePayload?: unknown,
        frameOptions: PipeInvokeOptions = {},
      ): Promise<TResultValue> => {
        if (streamClosed && type !== "stream.close") {
          return Promise.reject(
            new PluginRuntimeError("RUNTIME_NOT_READY", "RPC stream is closed"),
          )
        }
        try {
          assertPipeWritable(socket, closed)
        } catch (error) {
          return Promise.reject(error)
        }

        const id = randomUUID()
        const requestEnvelope = type === "stream.open"
          ? {
              version: RPC_PROTOCOL_VERSION,
              type,
              id,
              pluginId: resolvedOptions.pluginId,
              capability: resolvedOptions.capability,
              streamId,
              method,
              payload: framePayload,
            } as const
          : type === "stream.chunk"
            ? {
                version: RPC_PROTOCOL_VERSION,
                type,
                id,
                pluginId: resolvedOptions.pluginId,
                capability: resolvedOptions.capability,
                streamId,
                payload: framePayload,
              } as const
            : {
                version: RPC_PROTOCOL_VERSION,
                type,
                id,
                pluginId: resolvedOptions.pluginId,
                capability: resolvedOptions.capability,
                streamId,
              } as const
        const encodedRequest = encodeEnvelope(requestEnvelope)
        const requestBytes = Buffer.byteLength(encodedRequest, "utf8")
        if (requestBytes > resolvedOptions.maxRequestBytes) {
          return Promise.reject(
            new PluginRuntimeError(
              "RPC_PAYLOAD_TOO_LARGE",
              `RPC stream frame exceeded ${resolvedOptions.maxRequestBytes} bytes`,
            ),
          )
        }

        return new Promise<TResultValue>((resolvePromise, rejectPromise) => {
          const timeoutMs = frameOptions.timeoutMs ?? resolvedOptions.invocationTimeoutMs
          const timer = setTimeout(() => {
            clearPendingRequest(pending, id)?.reject(
              new PluginRuntimeError(
                "RPC_TIMEOUT",
                `RPC stream frame timed out after ${timeoutMs}ms`,
                { retryable: true },
              ),
            )
          }, timeoutMs)
          pending.set(id, {
            timer,
            resolve(value) {
              resolvePromise(value as TResultValue)
            },
            reject(error) {
              rejectPromise(error)
            },
          })
          socket.write(encodedRequest, (error) => {
            if (!error) return
            clearPendingRequest(pending, id)?.reject(
              new PluginRuntimeError(
                "RUNTIME_CRASHED",
                `RPC stream write failed: ${error.message}`,
                { cause: error, retryable: true },
              ),
            )
          })
        })
      }

      // open 帧先得到 worker 确认，避免后续 chunk 写入不存在的流。
      await sendStreamFrame<void>("stream.open", payload, openOptions)

      return {
        id: streamId,
        write(framePayload?: unknown, frameOptions?: PipeInvokeOptions) {
          return sendStreamFrame<TResult>("stream.chunk", framePayload, frameOptions)
        },
        async close(frameOptions?: PipeInvokeOptions) {
          if (streamClosed) return
          streamClosed = true
          await sendStreamFrame<void>("stream.close", undefined, frameOptions)
        },
      }
    },
    async close() {
      if (closed) {
        return
      }

      closed = true
      rejectPending(
        pending,
        new PluginRuntimeError(
          "RUNTIME_NOT_READY",
          "RPC pipe client closed",
        ),
      )
      if (socket.destroyed) {
        return
      }
      await new Promise<void>((resolvePromise) => {
        socket.end(() => resolvePromise())
      })
    },
  }
}

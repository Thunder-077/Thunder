import { randomUUID } from "node:crypto"
import { createConnection, type Socket } from "node:net"

import {
  decodeEnvelope,
  encodeEnvelope,
  type RpcErrorEnvelope,
  type RpcResponseEnvelope,
} from "./host-protocol"

export interface PipeClient {
  invoke<T>(method: string, payload?: unknown): Promise<T>
  close(): Promise<void>
}

type PendingRequest = {
  resolve(value: unknown): void
  reject(error: Error): void
}

function rejectPending(
  pending: Map<string, PendingRequest>,
  message: string,
): void {
  for (const [id, request] of pending) {
    request.reject(new Error(message))
    pending.delete(id)
  }
}

function handleEnvelope(
  pending: Map<string, PendingRequest>,
  envelope: RpcResponseEnvelope | RpcErrorEnvelope,
): void {
  const request = pending.get(envelope.id)

  if (!request) {
    return
  }

  pending.delete(envelope.id)

  if (envelope.type === "response") {
    request.resolve(envelope.payload)
    return
  }

  request.reject(new Error(envelope.error.message))
}

function attachSocketReader(
  socket: Socket,
  pending: Map<string, PendingRequest>,
): void {
  let buffer = ""

  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8")
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""

    for (const line of lines) {
      const trimmedLine = line.trim()

      if (!trimmedLine) {
        continue
      }

      try {
        const envelope = decodeEnvelope(trimmedLine)
        if (envelope.type === "request") {
          continue
        }
        handleEnvelope(pending, envelope)
      } catch (error) {
        rejectPending(
          pending,
          error instanceof Error ? error.message : String(error),
        )
      }
    }
  })
}

async function connectToEndpoint(endpoint: string): Promise<Socket> {
  return new Promise<Socket>((resolvePromise, rejectPromise) => {
    const socket = createConnection(endpoint)
    const onError = (error: Error) => {
      socket.off("connect", onConnect)
      rejectPromise(error)
    }
    const onConnect = () => {
      socket.off("error", onError)
      resolvePromise(socket)
    }

    socket.once("error", onError)
    socket.once("connect", onConnect)
  })
}

export async function createPipeClient(endpoint: string): Promise<PipeClient> {
  const socket = await connectToEndpoint(endpoint)
  const pending = new Map<string, PendingRequest>()

  attachSocketReader(socket, pending)

  socket.on("error", (error) => {
    rejectPending(pending, error.message)
  })
  socket.on("close", () => {
    rejectPending(pending, "RPC pipe connection closed")
  })

  return {
    invoke<T>(method: string, payload?: unknown): Promise<T> {
      const id = randomUUID()

      return new Promise<T>((resolvePromise, rejectPromise) => {
        pending.set(id, {
          resolve(value) {
            resolvePromise(value as T)
          },
          reject(error) {
            rejectPromise(error)
          },
        })

        socket.write(
          encodeEnvelope({
            type: "request",
            id,
            method,
            payload,
          }),
        )
      })
    },
    async close() {
      rejectPending(pending, "RPC pipe client closed")
      await new Promise<void>((resolvePromise) => {
        socket.end(() => resolvePromise())
      })
    },
  }
}

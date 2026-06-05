import { randomUUID } from "node:crypto"
import { mkdir, rm } from "node:fs/promises"
import { createServer, type Server, type Socket } from "node:net"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"

import {
  decodeEnvelope,
  encodeEnvelope,
  type RpcRequestEnvelope,
} from "./host-protocol"

export interface PipeServer {
  readonly endpoint: string
  close(): Promise<void>
}

export interface PipeServerOptions {
  handle(method: string, payload: unknown): Promise<unknown> | unknown
  socketDirectory?: string
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

function attachConnectionHandler(socket: Socket, options: PipeServerOptions): void {
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

      void handleRequest(socket, trimmedLine, options)
    }
  })
}

async function handleRequest(
  socket: Socket,
  line: string,
  options: PipeServerOptions,
): Promise<void> {
  let request: RpcRequestEnvelope

  try {
    const envelope = decodeEnvelope(line)
    if (envelope.type !== "request") {
      throw new Error("RPC server only accepts request envelopes")
    }
    request = envelope
  } catch (error) {
    socket.write(
      encodeEnvelope({
        type: "error",
        id: randomUUID(),
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      }),
    )
    return
  }

  try {
    const payload = await options.handle(request.method, request.payload)
    socket.write(
      encodeEnvelope({
        type: "response",
        id: request.id,
        payload,
      }),
    )
  } catch (error) {
    socket.write(
      encodeEnvelope({
        type: "error",
        id: request.id,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      }),
    )
  }
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

export async function createPipeServer(
  options: PipeServerOptions,
): Promise<PipeServer> {
  const endpoint = createPipeEndpoint(options.socketDirectory)

  await ensureSocketDirectory(endpoint)

  const server = createServer((socket) => {
    attachConnectionHandler(socket, options)
  })

  await listen(server, endpoint)

  return {
    endpoint,
    async close() {
      await closeServer(server, endpoint)
    },
  }
}

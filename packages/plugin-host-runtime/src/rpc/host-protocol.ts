export interface RpcRequestEnvelope {
  type: "request"
  id: string
  method: string
  payload?: unknown
}

export interface RpcResponseEnvelope {
  type: "response"
  id: string
  payload?: unknown
}

export interface RpcErrorEnvelope {
  type: "error"
  id: string
  error: {
    message: string
  }
}

export type RpcEnvelope =
  | RpcRequestEnvelope
  | RpcResponseEnvelope
  | RpcErrorEnvelope

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

export function encodeEnvelope(envelope: RpcEnvelope): string {
  return `${JSON.stringify(envelope)}\n`
}

export function decodeEnvelope(line: string): RpcEnvelope {
  const envelope = JSON.parse(line) as Partial<RpcEnvelope> | null

  assert(envelope && typeof envelope === "object", "RPC envelope must be an object")
  assert(typeof envelope.id === "string" && envelope.id.length > 0, "RPC envelope id is required")
  assert(
    envelope.type === "request" ||
      envelope.type === "response" ||
      envelope.type === "error",
    "RPC envelope type is invalid",
  )

  if (envelope.type === "request") {
    assert(
      typeof envelope.method === "string" && envelope.method.length > 0,
      "RPC request method is required",
    )
  }

  if (envelope.type === "error") {
    assert(
      typeof envelope.error?.message === "string" && envelope.error.message.length > 0,
      "RPC error message is required",
    )
  }

  return envelope as RpcEnvelope
}

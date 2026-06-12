import {
  PLUGIN_RUNTIME_ERROR_CODES,
  PluginRuntimeError,
  type PluginRuntimeErrorCode,
} from "../runtime-errors"

export const RPC_PROTOCOL_VERSION = 1 as const

interface RpcEnvelopeBase {
  version: typeof RPC_PROTOCOL_VERSION
  id: string
  pluginId: string
}

export interface RpcRequestEnvelope extends RpcEnvelopeBase {
  type: "request"
  capability: string
  method: string
  payload?: unknown
}

export interface RpcResponseEnvelope extends RpcEnvelopeBase {
  type: "response"
  payload?: unknown
}

export interface RpcErrorEnvelope extends RpcEnvelopeBase {
  type: "error"
  error: {
    code: PluginRuntimeErrorCode
    message: string
    retryable?: boolean
  }
}

export type RpcEnvelope =
  | RpcRequestEnvelope
  | RpcResponseEnvelope
  | RpcErrorEnvelope

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new PluginRuntimeError("RPC_INVALID_REQUEST", message)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function assertNonEmptyString(
  value: unknown,
  fieldName: string,
): asserts value is string {
  assert(
    typeof value === "string" && value.length > 0,
    `${fieldName} is required`,
  )
}

function isPluginRuntimeErrorCode(
  value: unknown,
): value is PluginRuntimeErrorCode {
  return (
    typeof value === "string" &&
    (PLUGIN_RUNTIME_ERROR_CODES as readonly string[]).includes(value)
  )
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  fieldName: string,
): void {
  const allowed = new Set(allowedKeys)
  const unknownKey = Object.keys(value).find((key) => !allowed.has(key))
  assert(
    unknownKey === undefined,
    `${fieldName} contains unknown field: ${unknownKey ?? ""}`,
  )
}

export function encodeEnvelope(envelope: RpcEnvelope): string {
  return `${JSON.stringify(envelope)}\n`
}

/**
 * Decode an untrusted line without relying on TypeScript assertions for shape
 * validation. Payload values remain intentionally opaque.
 */
export function decodeEnvelope(line: string): RpcEnvelope {
  let parsed: unknown

  try {
    parsed = JSON.parse(line)
  } catch (error) {
    throw new PluginRuntimeError(
      "RPC_INVALID_REQUEST",
      "RPC envelope must contain valid JSON",
      { cause: error },
    )
  }

  assert(isRecord(parsed), "RPC envelope must be an object")
  assert(
    parsed.version === RPC_PROTOCOL_VERSION,
    "RPC envelope version is invalid",
  )
  assertNonEmptyString(parsed.id, "RPC envelope id")
  assertNonEmptyString(parsed.pluginId, "RPC envelope pluginId")
  assert(
    parsed.type === "request" ||
      parsed.type === "response" ||
      parsed.type === "error",
    "RPC envelope type is invalid",
  )

  if (parsed.type === "request") {
    assertExactKeys(
      parsed,
      [
        "version",
        "type",
        "id",
        "pluginId",
        "capability",
        "method",
        "payload",
      ],
      "RPC request envelope",
    )
    assertNonEmptyString(parsed.capability, "RPC request capability")
    assertNonEmptyString(parsed.method, "RPC request method")
    return {
      version: RPC_PROTOCOL_VERSION,
      type: "request",
      id: parsed.id,
      pluginId: parsed.pluginId,
      capability: parsed.capability,
      method: parsed.method,
      ...("payload" in parsed ? { payload: parsed.payload } : {}),
    }
  }

  if (parsed.type === "response") {
    assertExactKeys(
      parsed,
      ["version", "type", "id", "pluginId", "payload"],
      "RPC response envelope",
    )
    return {
      version: RPC_PROTOCOL_VERSION,
      type: "response",
      id: parsed.id,
      pluginId: parsed.pluginId,
      ...("payload" in parsed ? { payload: parsed.payload } : {}),
    }
  }

  assertExactKeys(
    parsed,
    ["version", "type", "id", "pluginId", "error"],
    "RPC error envelope",
  )
  assert(isRecord(parsed.error), "RPC error is required")
  assertExactKeys(
    parsed.error,
    ["code", "message", "retryable"],
    "RPC error",
  )
  assert(
    isPluginRuntimeErrorCode(parsed.error.code),
    "RPC error code is invalid",
  )
  assertNonEmptyString(parsed.error.message, "RPC error message")
  assert(
    parsed.error.retryable === undefined ||
      typeof parsed.error.retryable === "boolean",
    "RPC error retryable must be a boolean",
  )

  return {
    version: RPC_PROTOCOL_VERSION,
    type: "error",
    id: parsed.id,
    pluginId: parsed.pluginId,
    error: {
      code: parsed.error.code,
      message: parsed.error.message,
      ...(parsed.error.retryable === undefined
        ? {}
        : { retryable: parsed.error.retryable }),
    },
  }
}

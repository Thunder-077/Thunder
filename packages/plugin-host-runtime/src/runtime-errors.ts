export const PLUGIN_RUNTIME_ERROR_CODES = [
  "RUNTIME_START_FAILED",
  "RUNTIME_NOT_READY",
  "RUNTIME_CRASHED",
  "RUNTIME_CIRCUIT_OPEN",
  "RPC_INVALID_REQUEST",
  "RPC_METHOD_NOT_FOUND",
  "RPC_PAYLOAD_TOO_LARGE",
  "RPC_RESPONSE_TOO_LARGE",
  "RPC_TIMEOUT",
  "RPC_CONCURRENCY_LIMIT",
  "RPC_HANDLER_FAILED",
  "RPC_UNAUTHORIZED",
] as const

export type PluginRuntimeErrorCode =
  (typeof PLUGIN_RUNTIME_ERROR_CODES)[number]

export interface PluginRuntimeErrorOptions {
  cause?: unknown
  retryable?: boolean
}

/**
 * Stable runtime error exposed across supervisor and RPC boundaries.
 */
export class PluginRuntimeError extends Error {
  readonly cause?: unknown
  readonly code: PluginRuntimeErrorCode
  readonly retryable: boolean

  constructor(
    code: PluginRuntimeErrorCode,
    message: string,
    options: PluginRuntimeErrorOptions = {},
  ) {
    super(message)
    this.name = "PluginRuntimeError"
    this.cause = options.cause
    this.code = code
    this.retryable = options.retryable ?? false
  }
}

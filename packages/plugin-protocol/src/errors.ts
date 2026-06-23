export type PluginProtocolErrorCode =
  | "INVALID_ENVELOPE"
  | "UNSUPPORTED_METHOD"
  | "INVALID_PARAMS"

export class PluginProtocolError extends Error {
  constructor(
    readonly code: PluginProtocolErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "PluginProtocolError"
  }
}

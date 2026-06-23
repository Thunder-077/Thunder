import {
  isRecord,
  type ThunderPluginManifest,
  type ThunderPluginPermission,
} from "@thunder/plugin-schema"
import { PluginProtocolError } from "./errors"

export const PLUGIN_BRIDGE_REQUEST_SOURCE = "thunder-plugin"
export const PLUGIN_BRIDGE_RESPONSE_SOURCE = "thunder-host"
export const PLUGIN_BRIDGE_VERSION = 1

export interface PluginNotificationParams {
  type?: "info" | "success" | "error"
  title?: string
  description?: string
}

export interface PluginActivityParams {
  action: string
  title: string
  description?: string
  metadata?: Record<string, unknown>
}

/**
 * Parameters for broadcasting an event from one plugin to all others.
 * The host forwards the event to every other loaded plugin's iframe.
 */
export interface PluginEventBroadcastParams {
  /** Event type name, e.g. "transcription.updated" */
  event: string
  /** Arbitrary JSON-serializable payload */
  data?: unknown
}

export type PluginNetworkMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

export interface PluginNetworkRequestParams {
  url: string
  method?: PluginNetworkMethod
  headers?: Record<string, string>
  body?: string
  /**
   * Controls how the response body is encoded.
   * - `"text"` (default): UTF-8 decoded string. Suitable for JSON/text APIs.
   * - `"base64"`: Base64-encoded string of the raw bytes. Required for binary
   *   data (images, protobuf, gzip, etc.) to avoid corruption.
   */
  responseType?: "text" | "base64"
}

export interface PluginNetworkResponse {
  status: number
  headers: Record<string, string>
  body: string
  /**
   * Present only when the body is base64-encoded. Absent for plain text
   * responses (backward compatible).
   */
  encoding?: "base64"
}

export interface PluginBridgeMethodMap {
  "plugin.getManifest": {
    params: undefined
    result: ThunderPluginManifest
  }
  "layout.setFrameHeight": {
    params: { height: number }
    result: undefined
  }
  "storage.get": {
    params: { key: string }
    result: unknown | null
  }
  "storage.set": {
    params: { key: string; value: unknown }
    result: undefined
  }
  "storage.remove": {
    params: { key: string }
    result: undefined
  }
  "storage.keys": {
    params: undefined
    result: string[]
  }
  "storage.clear": {
    params: undefined
    result: undefined
  }
  "notification.add": {
    params: PluginNotificationParams
    result: undefined
  }
  "activity.track": {
    params: PluginActivityParams
    result: undefined
  }
  "network.request": {
    params: PluginNetworkRequestParams
    result: PluginNetworkResponse
  }
  "worker.invoke": {
    params: { method: string; payload?: unknown }
    result: { ok: true; result: unknown }
  }
  "events.broadcast": {
    params: PluginEventBroadcastParams
    result: undefined
  }
}

export type PluginBridgeMethod = keyof PluginBridgeMethodMap

export type PluginBridgeRequest<
  TMethod extends PluginBridgeMethod = PluginBridgeMethod,
> = TMethod extends PluginBridgeMethod
  ? {
      source: typeof PLUGIN_BRIDGE_REQUEST_SOURCE
      version: typeof PLUGIN_BRIDGE_VERSION
      id: string
      method: TMethod
      params: PluginBridgeMethodMap[TMethod]["params"]
    }
  : never

export type PluginBridgeResponse<TResult = unknown> = {
  source: typeof PLUGIN_BRIDGE_RESPONSE_SOURCE
  version: typeof PLUGIN_BRIDGE_VERSION
  id: string
  ok: boolean
  data?: TResult
  error?: string
}

export type PluginThemeChangeEvent = {
  source: typeof PLUGIN_BRIDGE_RESPONSE_SOURCE
  version: typeof PLUGIN_BRIDGE_VERSION
  type: "theme.change"
  theme: "light" | "dark"
}

export type PluginHmrScope = "ui" | "worker" | "all"

export type PluginUpdatedEvent = {
  source: typeof PLUGIN_BRIDGE_RESPONSE_SOURCE
  version: typeof PLUGIN_BRIDGE_VERSION
  type: "plugin.updated"
  scope: PluginHmrScope
  timestamp: number
}

/**
 * Inbound event from another plugin, forwarded by the host.
 * Received via postMessage in the plugin iframe.
 */
export type PluginBroadcastEvent = {
  source: typeof PLUGIN_BRIDGE_RESPONSE_SOURCE
  version: typeof PLUGIN_BRIDGE_VERSION
  type: "plugin.event"
  /** ID of the plugin that sent the event */
  senderId: string
  /** Event type name */
  event: string
  /** Arbitrary JSON-serializable payload */
  data?: unknown
}

export const pluginBridgeMethods = [
  "plugin.getManifest",
  "layout.setFrameHeight",
  "storage.get",
  "storage.set",
  "storage.remove",
  "storage.keys",
  "storage.clear",
  "notification.add",
  "activity.track",
  "network.request",
  "worker.invoke",
  "events.broadcast",
] as const satisfies readonly PluginBridgeMethod[]

const METHOD_PERMISSIONS: Partial<
  Record<PluginBridgeMethod, ThunderPluginPermission>
> = {
  "storage.get": "storage",
  "storage.set": "storage",
  "storage.remove": "storage",
  "storage.keys": "storage",
  "storage.clear": "storage",
  "notification.add": "notifications",
  "activity.track": "activity",
  "worker.invoke": "native-runtime",
}

function invalidParams(method: PluginBridgeMethod, message: string): never {
  throw new PluginProtocolError(
    "INVALID_PARAMS",
    `Invalid parameters for ${method}: ${message}`,
  )
}

export function normalizePluginStorageKey(key: unknown): string {
  if (typeof key !== "string") {
    throw new PluginProtocolError("INVALID_PARAMS", "Plugin storage key must be a string")
  }

  const normalized = key.trim()
  if (
    !normalized ||
    normalized.length > 128 ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new PluginProtocolError("INVALID_PARAMS", "Plugin storage key is invalid")
  }
  return normalized
}

export function normalizePluginWorkerMethod(method: unknown): string {
  if (
    typeof method !== "string" ||
    !method.trim() ||
    method.trim().length > 128 ||
    !/^[a-z0-9._-]+$/i.test(method.trim())
  ) {
    throw new PluginProtocolError("INVALID_PARAMS", "Plugin worker method is invalid")
  }
  return method.trim()
}

export function getRequiredPluginPermission(
  method: PluginBridgeMethod,
): ThunderPluginPermission | null {
  return METHOD_PERMISSIONS[method] ?? null
}

export function isPluginBridgeMethod(value: string): value is PluginBridgeMethod {
  return (pluginBridgeMethods as readonly string[]).includes(value)
}

export function parsePluginBridgeRequest(input: unknown): PluginBridgeRequest {
  if (!isRecord(input)) {
    throw new PluginProtocolError("INVALID_ENVELOPE", "Plugin bridge request must be an object")
  }
  if (
    input.source !== PLUGIN_BRIDGE_REQUEST_SOURCE ||
    input.version !== PLUGIN_BRIDGE_VERSION ||
    typeof input.id !== "string" ||
    !input.id.trim()
  ) {
    throw new PluginProtocolError("INVALID_ENVELOPE", "Plugin bridge request envelope is invalid")
  }
  if (typeof input.method !== "string" || !isPluginBridgeMethod(input.method)) {
    throw new PluginProtocolError(
      "UNSUPPORTED_METHOD",
      `Unsupported plugin bridge method: ${String(input.method)}`,
    )
  }

  const method = input.method
  const params = parsePluginBridgeParams(method, input.params)
  return {
    source: PLUGIN_BRIDGE_REQUEST_SOURCE,
    version: PLUGIN_BRIDGE_VERSION,
    id: input.id,
    method,
    params,
  } as PluginBridgeRequest
}

export function parsePluginBridgeParams(
  method: PluginBridgeMethod,
  input: unknown,
): PluginBridgeMethodMap[PluginBridgeMethod]["params"] {
  if (
    method === "plugin.getManifest" ||
    method === "storage.keys" ||
    method === "storage.clear"
  ) {
    if (input !== undefined) invalidParams(method, "parameters are not accepted")
    return undefined
  }

  if (!isRecord(input)) invalidParams(method, "an object is required")

  if (method === "layout.setFrameHeight") {
    if (typeof input.height !== "number" || !Number.isFinite(input.height)) {
      invalidParams(method, "height must be a finite number")
    }
    return { height: Math.max(320, Math.ceil(input.height)) }
  }

  if (method === "storage.get" || method === "storage.remove") {
    return { key: normalizePluginStorageKey(input.key) }
  }

  if (method === "storage.set") {
    const serialized = JSON.stringify(input.value ?? null)
    if (new TextEncoder().encode(serialized).byteLength > 256 * 1024) {
      invalidParams(method, "value exceeds 256 KiB")
    }
    return {
      key: normalizePluginStorageKey(input.key),
      value: input.value,
    }
  }

  if (method === "notification.add") {
    const type = input.type
    if (
      type !== undefined &&
      type !== "info" &&
      type !== "success" &&
      type !== "error"
    ) {
      invalidParams(method, "type is invalid")
    }
    if (input.title !== undefined && typeof input.title !== "string") {
      invalidParams(method, "title must be a string")
    }
    if (
      input.description !== undefined &&
      typeof input.description !== "string"
    ) {
      invalidParams(method, "description must be a string")
    }
    return {
      type,
      title: input.title,
      description: input.description,
    } as PluginNotificationParams
  }

  if (method === "activity.track") {
    if (
      typeof input.action !== "string" ||
      !input.action.trim() ||
      typeof input.title !== "string" ||
      !input.title.trim()
    ) {
      invalidParams(method, "action and title are required")
    }
    if (
      input.description !== undefined &&
      typeof input.description !== "string"
    ) {
      invalidParams(method, "description must be a string")
    }
    if (input.metadata !== undefined && !isRecord(input.metadata)) {
      invalidParams(method, "metadata must be an object")
    }
    return {
      action: input.action.trim(),
      title: input.title.trim(),
      description: input.description,
      metadata: input.metadata,
    } as PluginActivityParams
  }

  if (method === "network.request") {
    if (typeof input.url !== "string") invalidParams(method, "url is required")
    let url: URL
    try {
      url = new URL(input.url)
    } catch {
      invalidParams(method, "url is invalid")
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      invalidParams(method, "url protocol is invalid")
    }
    const requestMethod = input.method ?? "GET"
    if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(String(requestMethod))) {
      invalidParams(method, "method is invalid")
    }
    if (
      input.headers !== undefined &&
      (!isRecord(input.headers) ||
        Object.values(input.headers).some((value) => typeof value !== "string"))
    ) {
      invalidParams(method, "headers must contain string values")
    }
    if (input.body !== undefined && typeof input.body !== "string") {
      invalidParams(method, "body must be a string")
    }
    const responseType = input.responseType ?? "text"
    if (responseType !== "text" && responseType !== "base64") {
      invalidParams(method, "responseType must be \"text\" or \"base64\"")
    }
    return {
      url: url.toString(),
      method: requestMethod as PluginNetworkMethod,
      headers: input.headers as Record<string, string> | undefined,
      body: input.body as string | undefined,
      responseType: responseType as "text" | "base64",
    }
  }

  if (method === "worker.invoke") {
    return {
      method: normalizePluginWorkerMethod(input.method),
      ...(input.payload === undefined ? {} : { payload: input.payload }),
    }
  }

  if (method === "events.broadcast") {
    if (typeof input.event !== "string" || input.event.trim().length === 0) {
      invalidParams(method, "event name is required")
    }
    return {
      event: input.event.trim(),
      ...(input.data === undefined ? {} : { data: input.data }),
    }
  }

  // Exhaustive — if we reach here, a new method was added to the type
  // without a corresponding parser case.
  invalidParams(method, "unknown bridge method")
}

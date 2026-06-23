import type { DesktopPluginPermission } from "@/lib/desktop-plugins"
import {
  PLUGIN_BRIDGE_REQUEST_SOURCE,
  PLUGIN_BRIDGE_VERSION,
  getRequiredPluginPermission,
  isPluginBridgeMethod,
  normalizePluginStorageKey,
} from "@thunder/plugin-protocol"

export { PLUGIN_BRIDGE_REQUEST_SOURCE, PLUGIN_BRIDGE_VERSION }

export type PluginBridgeRequest = {
  source?: string
  version?: number
  id?: string
  method?: string
  params?: unknown
}

export type StorageRequestParams = {
  key?: string
  value?: unknown
}

export function getRequiredPluginPermissionForBridgeMethod(method: string): DesktopPluginPermission | null {
  return isPluginBridgeMethod(method) ? getRequiredPluginPermission(method) : null
}

function getIsolatedLoopbackHostname(hostname: string): string | null {
  if (hostname === "localhost") return "127.0.0.1"
  if (hostname === "127.0.0.1") return "localhost"
  return null
}

export function createIsolatedPluginFrameUrl(webEntryUrl: string, hostOrigin: string): string {
  const hostUrl = new URL(hostOrigin)
  const frameUrl = new URL(webEntryUrl, hostUrl.origin)

  if (frameUrl.origin !== hostUrl.origin) {
    return frameUrl.toString()
  }

  const isolatedHostname = getIsolatedLoopbackHostname(hostUrl.hostname)
  if (!isolatedHostname) {
    return frameUrl.toString()
  }

  frameUrl.hostname = isolatedHostname
  return frameUrl.toString()
}

export function isAllowedPluginBridgeOrigin(eventOrigin: string, frameUrl: string): boolean {
  return eventOrigin === new URL(frameUrl).origin
}

export function isPluginFrameOriginIsolated(frameUrl: string, hostOrigin: string): boolean {
  return new URL(frameUrl).origin !== new URL(hostOrigin).origin
}

export function normalizeStorageKey(key: string | undefined): string {
  return normalizePluginStorageKey(key)
}

export function normalizePluginFrameHeight(height: number | undefined): number {
  if (!Number.isFinite(height) || height === undefined) {
    throw new Error("插件布局高度无效")
  }

  return Math.max(320, Math.ceil(height))
}

// ===== HTTP-based plugin storage =====

const ABSOLUTE_API_URL_REGEX = /^https?:\/\//i

function getPluginStorageApiUrl(pluginId: string): string {
  if (typeof window !== "undefined" && ABSOLUTE_API_URL_REGEX.test(window.location.origin)) {
    return `${window.location.origin}/api/v1/desktop/plugins/${encodeURIComponent(pluginId)}/storage`
  }
  return `/api/v1/desktop/plugins/${encodeURIComponent(pluginId)}/storage`
}

async function fetchPluginStorage(
  pluginId: string,
  path: string,
  options?: RequestInit,
): Promise<{
  ok?: boolean
  message?: string
  data?: unknown
}> {
  const baseUrl = getPluginStorageApiUrl(pluginId)
  const url = `${baseUrl}${path}`
  const response = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(options?.headers ?? {}),
    },
  })
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean
    message?: string
    data?: unknown
  } | null
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || "插件存储操作失败")
  }
  return payload
}

export async function getPluginStorageValue(pluginId: string, key: string): Promise<unknown> {
  const payload = await fetchPluginStorage(pluginId, `?key=${encodeURIComponent(key)}`)
  return payload.data ?? null
}

export async function setPluginStorageValue(
  pluginId: string,
  key: string,
  value: unknown,
): Promise<void> {
  await fetchPluginStorage(pluginId, "", {
    method: "PUT",
    body: JSON.stringify({ key, value }),
  })
}

export async function removePluginStorageValue(pluginId: string, key: string): Promise<void> {
  await fetchPluginStorage(pluginId, `?key=${encodeURIComponent(key)}`, {
    method: "DELETE",
  })
}

export async function listPluginStorageKeys(pluginId: string): Promise<string[]> {
  const payload = await fetchPluginStorage(pluginId, "/keys")
  return (payload.data as string[]) ?? []
}

export async function clearPluginStorage(pluginId: string): Promise<void> {
  await fetchPluginStorage(pluginId, "", {
    method: "DELETE",
  })
}

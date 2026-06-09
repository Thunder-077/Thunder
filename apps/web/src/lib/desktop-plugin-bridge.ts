import type { DesktopPluginPermission } from "@/lib/desktop-plugins"

export const PLUGIN_BRIDGE_REQUEST_SOURCE = "thunder-plugin"
export const PLUGIN_BRIDGE_VERSION = 1

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

type PluginStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">

const BRIDGE_METHOD_PERMISSIONS: Partial<Record<string, DesktopPluginPermission>> = {
  "storage.get": "storage",
  "storage.set": "storage",
  "storage.remove": "storage",
  "storage.keys": "storage",
  "storage.clear": "storage",
  "notification.add": "notifications",
  "activity.track": "activity",
  "worker.invoke": "native-runtime",
  "runtime.request": "native-runtime",
}

export function getRequiredPluginPermissionForBridgeMethod(method: string): DesktopPluginPermission | null {
  return BRIDGE_METHOD_PERMISSIONS[method] ?? null
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
  const rawKey = key?.trim()
  if (!rawKey || rawKey.length > 128 || /[\u0000-\u001f\u007f]/.test(rawKey)) {
    throw new Error("插件存储 key 无效")
  }
  return rawKey
}

export function normalizePluginFrameHeight(height: number | undefined): number {
  if (!Number.isFinite(height) || height === undefined) {
    throw new Error("插件布局高度无效")
  }

  return Math.max(320, Math.ceil(height))
}

export function pluginStoragePrefix(pluginId: string): string {
  return `thunder:desktop-plugin:${pluginId}:storage:`
}

export function pluginStorageKey(pluginId: string, key: string): string {
  return `${pluginStoragePrefix(pluginId)}${encodeURIComponent(key)}`
}

export function listPluginStorageKeys(storage: PluginStorage, pluginId: string): string[] {
  const prefix = pluginStoragePrefix(pluginId)
  const keys: string[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const storageKey = storage.key(index)
    if (!storageKey?.startsWith(prefix)) continue
    keys.push(decodeURIComponent(storageKey.slice(prefix.length)))
  }
  return keys.sort((a, b) => a.localeCompare(b))
}

export function getPluginStorageValue(storage: PluginStorage, pluginId: string, key: string): unknown {
  const rawValue = storage.getItem(pluginStorageKey(pluginId, normalizeStorageKey(key)))
  return rawValue === null ? null : JSON.parse(rawValue)
}

export function setPluginStorageValue(storage: PluginStorage, pluginId: string, key: string, value: unknown): void {
  storage.setItem(pluginStorageKey(pluginId, normalizeStorageKey(key)), JSON.stringify(value ?? null))
}

export function removePluginStorageValue(storage: PluginStorage, pluginId: string, key: string): void {
  storage.removeItem(pluginStorageKey(pluginId, normalizeStorageKey(key)))
}

export function clearPluginStorage(storage: PluginStorage, pluginId: string): void {
  for (const key of listPluginStorageKeys(storage, pluginId)) {
    storage.removeItem(pluginStorageKey(pluginId, key))
  }
}

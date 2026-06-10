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

// ===== IndexedDB-backed plugin storage =====

const IDB_NAME = "thunder-desktop-plugins"
const IDB_VERSION = 1
const IDB_KV_STORE = "kv"
const IDB_TOTALS_STORE = "totals"
const MAX_PLUGIN_STORAGE_BYTES = 1024 * 1024
const MAX_PLUGIN_STORAGE_VALUE_BYTES = 256 * 1024

interface KvRecord {
  pluginId: string
  key: string
  size: number
  value: unknown
}

interface TotalsRecord {
  pluginId: string
  bytes: number
}

function utf8Size(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function serializeValue(value: unknown): string {
  return JSON.stringify(value ?? null)
}

function getIdbFactory(): IDBFactory {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB 不可用")
  }
  return indexedDB
}

let openPromise: Promise<IDBDatabase> | null = null

function openIdb(): Promise<IDBDatabase> {
  if (openPromise) return openPromise
  openPromise = new Promise((resolve, reject) => {
    const request = getIdbFactory().open(IDB_NAME, IDB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(IDB_KV_STORE)) {
        db.createObjectStore(IDB_KV_STORE, { keyPath: ["pluginId", "key"] })
      }
      if (!db.objectStoreNames.contains(IDB_TOTALS_STORE)) {
        db.createObjectStore(IDB_TOTALS_STORE, { keyPath: "pluginId" })
      }
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => {
        openPromise = null
        db.close()
      }
      resolve(db)
    }
    request.onerror = () => {
      openPromise = null
      reject(request.error ?? new Error("打开 IndexedDB 失败"))
    }
    request.onblocked = () => {
      openPromise = null
      reject(new Error("IndexedDB 升级被阻塞"))
    }
  })
  return openPromise
}

function runIdb<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("IndexedDB 请求失败"))
  })
}

async function readTotalsBytes(db: IDBDatabase, pluginId: string): Promise<number> {
  const tx = db.transaction(IDB_TOTALS_STORE, "readonly")
  const record = (await runIdb(tx.objectStore(IDB_TOTALS_STORE).get(pluginId))) as
    | TotalsRecord
    | undefined
  return record?.bytes ?? 0
}

async function getKvRecord(db: IDBDatabase, pluginId: string, key: string): Promise<KvRecord | undefined> {
  const tx = db.transaction(IDB_KV_STORE, "readonly")
  return (await runIdb(tx.objectStore(IDB_KV_STORE).get([pluginId, key]))) as KvRecord | undefined
}

export async function getPluginStorageValue(pluginId: string, key: string): Promise<unknown> {
  const db = await openIdb()
  const record = await getKvRecord(db, pluginId, normalizePluginStorageKey(key))
  return record ? record.value : null
}

export async function setPluginStorageValue(
  pluginId: string,
  key: string,
  value: unknown,
): Promise<void> {
  const normalizedKey = normalizePluginStorageKey(key)
  const serialized = serializeValue(value)
  const newSize = utf8Size(serialized)
  if (newSize > MAX_PLUGIN_STORAGE_VALUE_BYTES) {
    throw new Error("插件单个存储值超过 256 KiB")
  }

  const db = await openIdb()
  const existing = await getKvRecord(db, pluginId, normalizedKey)
  const oldSize = existing?.size ?? 0
  const currentBytes = await readTotalsBytes(db, pluginId)
  const nextBytes = currentBytes - oldSize + newSize
  if (nextBytes > MAX_PLUGIN_STORAGE_BYTES) {
    throw new Error("插件存储空间超过 1 MiB")
  }

  const tx = db.transaction([IDB_KV_STORE, IDB_TOTALS_STORE], "readwrite")
  await runIdb(
    tx.objectStore(IDB_KV_STORE).put({
      pluginId,
      key: normalizedKey,
      size: newSize,
      value,
    } satisfies KvRecord),
  )
  await runIdb(
    tx
      .objectStore(IDB_TOTALS_STORE)
      .put({ pluginId, bytes: nextBytes } satisfies TotalsRecord),
  )
}

export async function removePluginStorageValue(pluginId: string, key: string): Promise<void> {
  const normalizedKey = normalizePluginStorageKey(key)
  const db = await openIdb()
  const existing = await getKvRecord(db, pluginId, normalizedKey)
  if (!existing) return

  const tx = db.transaction([IDB_KV_STORE, IDB_TOTALS_STORE], "readwrite")
  await runIdb(tx.objectStore(IDB_KV_STORE).delete([pluginId, normalizedKey]))
  const currentBytes = await readTotalsBytes(db, pluginId)
  const nextBytes = Math.max(0, currentBytes - existing.size)
  await runIdb(
    tx
      .objectStore(IDB_TOTALS_STORE)
      .put({ pluginId, bytes: nextBytes } satisfies TotalsRecord),
  )
}

export async function listPluginStorageKeys(pluginId: string): Promise<string[]> {
  const db = await openIdb()
  const tx = db.transaction(IDB_KV_STORE, "readonly")
  const range = IDBKeyRange.bound([pluginId, ""], [pluginId, "\uffff"])
  const records = (await runIdb(tx.objectStore(IDB_KV_STORE).getAll(range))) as KvRecord[]
  return records.map((record) => record.key).sort((a, b) => a.localeCompare(b))
}

export async function clearPluginStorage(pluginId: string): Promise<void> {
  const db = await openIdb()
  const tx = db.transaction([IDB_KV_STORE, IDB_TOTALS_STORE], "readwrite")
  const range = IDBKeyRange.bound([pluginId, ""], [pluginId, "\uffff"])
  await runIdb(tx.objectStore(IDB_KV_STORE).delete(range))
  await runIdb(tx.objectStore(IDB_TOTALS_STORE).delete(pluginId))
}

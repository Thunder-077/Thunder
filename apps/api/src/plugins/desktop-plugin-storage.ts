import { mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
// @ts-ignore node:sqlite types are provided by the Node runtime
import { DatabaseSync } from "node:sqlite"
import { normalizePluginStorageKey } from "@thunder/plugin-protocol"
import {
  DesktopPluginError,
  assertPluginId,
  getPluginDirs,
} from "./desktop-plugin-internal"
import { getInstalledPlugin } from "./desktop-plugin-manager"

const MAX_PLUGIN_STORAGE_BYTES = 1024 * 1024
const MAX_PLUGIN_STORAGE_VALUE_BYTES = 256 * 1024

// ---- Connection Pool ----

interface PooledConnection {
  db: DatabaseSync
  lastAccessMs: number
}

/**
 * Per-plugin SQLite connection cache. Avoids opening and closing the database
 * on every single storage operation. Idle connections are evicted after
 * IDLE_TIMEOUT_MS. The pool capacity is bounded at MAX_CONNECTIONS.
 */
const connectionPool = new Map<string, PooledConnection>()
const MAX_CONNECTIONS = 32
const IDLE_TIMEOUT_MS = 60_000

let evictionTimer: ReturnType<typeof setInterval> | undefined

function startEvictionTimer(): void {
  if (evictionTimer) return
  evictionTimer = setInterval(() => {
    const now = Date.now()
    for (const [pluginId, conn] of connectionPool) {
      if (now - conn.lastAccessMs > IDLE_TIMEOUT_MS) {
        try { conn.db.close() } catch { /* already closed */ }
        connectionPool.delete(pluginId)
      }
    }
    if (connectionPool.size === 0 && evictionTimer) {
      clearInterval(evictionTimer)
      evictionTimer = undefined
    }
  }, IDLE_TIMEOUT_MS)
  // Don't keep the process alive just for this timer.
  if (typeof evictionTimer === "object" && "unref" in evictionTimer) {
    evictionTimer.unref()
  }
}

function evictOldest(): void {
  let oldest: string | undefined
  let oldestTime = Infinity
  for (const [pluginId, conn] of connectionPool) {
    if (conn.lastAccessMs < oldestTime) {
      oldestTime = conn.lastAccessMs
      oldest = pluginId
    }
  }
  if (oldest) {
    const conn = connectionPool.get(oldest)
    try { conn?.db.close() } catch { /* already closed */ }
    connectionPool.delete(oldest)
  }
}

function getStorageDbPath(pluginId: string): string {
  const { pluginDataDir } = getPluginDirs()
  return join(pluginDataDir, pluginId, "storage.db")
}

function openStorageDb(pluginId: string): DatabaseSync {
  const dbPath = getStorageDbPath(pluginId)
  const db = new DatabaseSync(dbPath)
  // WAL mode for better concurrent read performance.
  db.exec("PRAGMA journal_mode=WAL")
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      size INTEGER NOT NULL
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      total_bytes INTEGER NOT NULL DEFAULT 0
    )
  `)
  // Ensure meta row exists
  db.exec(`INSERT OR IGNORE INTO meta (id, total_bytes) VALUES (1, 0)`)
  return db
}

function getPooledConnection(pluginId: string): DatabaseSync {
  const existing = connectionPool.get(pluginId)
  if (existing) {
    existing.lastAccessMs = Date.now()
    return existing.db
  }
  // Evict oldest if at capacity.
  if (connectionPool.size >= MAX_CONNECTIONS) {
    evictOldest()
  }
  const db = openStorageDb(pluginId)
  connectionPool.set(pluginId, { db, lastAccessMs: Date.now() })
  startEvictionTimer()
  return db
}

/**
 * Close and remove the cached connection for a specific plugin.
 * Called when a plugin is uninstalled to release the database handle.
 */
export function closePluginStorageConnection(pluginId: string): void {
  const conn = connectionPool.get(pluginId)
  if (conn) {
    try { conn.db.close() } catch { /* already closed */ }
    connectionPool.delete(pluginId)
  }
}

/**
 * Close all cached connections. Called during graceful shutdown.
 */
export function closeAllStorageConnections(): void {
  for (const [, conn] of connectionPool) {
    try { conn.db.close() } catch { /* already closed */ }
  }
  connectionPool.clear()
  if (evictionTimer) {
    clearInterval(evictionTimer)
    evictionTimer = undefined
  }
}

// ---- Helpers ----

async function assertInstalledPluginPermission(
  pluginId: string,
  permission: string,
): Promise<void> {
  const plugin = await getInstalledPlugin(pluginId)
  if (!plugin.manifest.permissions.some((item) => item === permission)) {
    throw new DesktopPluginError(`插件未声明 ${permission} 权限`, 403)
  }
}

async function withPluginStorageDb<T>(pluginId: string, fn: (db: DatabaseSync) => T): Promise<T> {
  assertPluginId(pluginId)
  await assertInstalledPluginPermission(pluginId, "storage")
  const dbPath = getStorageDbPath(pluginId)
  await mkdir(dirname(dbPath), { recursive: true })
  return fn(getPooledConnection(pluginId))
}

function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE")
  try {
    const result = fn()
    db.exec("COMMIT")
    return result
  } catch (err) {
    db.exec("ROLLBACK")
    throw err
  }
}

// ---- Public API ----

export async function getPluginStorage(pluginId: string, key: string): Promise<unknown | null> {
  const normalizedKey = normalizePluginStorageKey(key)
  return withPluginStorageDb(pluginId, (db) => {
    const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(normalizedKey) as { value: string } | undefined
    if (!row) return null
    return JSON.parse(row.value)
  })
}

export async function setPluginStorage(pluginId: string, key: string, value: unknown): Promise<void> {
  const normalizedKey = normalizePluginStorageKey(key)
  const serialized = JSON.stringify(value ?? null)
  const newSize = new TextEncoder().encode(serialized).byteLength
  if (newSize > MAX_PLUGIN_STORAGE_VALUE_BYTES) {
    throw new DesktopPluginError("插件单个存储值超过 256 KiB", 413)
  }

  await withPluginStorageDb(pluginId, (db) => {
    const existing = db.prepare("SELECT size FROM kv WHERE key = ?").get(normalizedKey) as { size: number } | undefined
    const oldSize = existing?.size ?? 0
    const meta = db.prepare("SELECT total_bytes FROM meta WHERE id = 1").get() as { total_bytes: number }
    const currentBytes = meta.total_bytes
    const nextBytes = currentBytes - oldSize + newSize
    if (nextBytes > MAX_PLUGIN_STORAGE_BYTES) {
      throw new DesktopPluginError("插件存储空间超过 1 MiB", 413)
    }

    withTransaction(db, () => {
      db.prepare("INSERT OR REPLACE INTO kv (key, value, size) VALUES (?, ?, ?)").run(normalizedKey, serialized, newSize)
      db.prepare("UPDATE meta SET total_bytes = ? WHERE id = 1").run(nextBytes)
    })
  })
}

export async function removePluginStorage(pluginId: string, key: string): Promise<void> {
  const normalizedKey = normalizePluginStorageKey(key)

  await withPluginStorageDb(pluginId, (db) => {
    const existing = db.prepare("SELECT size FROM kv WHERE key = ?").get(normalizedKey) as { size: number } | undefined
    if (!existing) return

    const meta = db.prepare("SELECT total_bytes FROM meta WHERE id = 1").get() as { total_bytes: number }
    const nextBytes = Math.max(0, meta.total_bytes - existing.size)

    withTransaction(db, () => {
      db.prepare("DELETE FROM kv WHERE key = ?").run(normalizedKey)
      db.prepare("UPDATE meta SET total_bytes = ? WHERE id = 1").run(nextBytes)
    })
  })
}

export async function listPluginStorageKeys(pluginId: string): Promise<string[]> {
  return withPluginStorageDb(pluginId, (db) => {
    const rows = db.prepare("SELECT key FROM kv ORDER BY key").all() as { key: string }[]
    return rows.map((r) => r.key)
  })
}

export async function clearPluginStorage(pluginId: string): Promise<void> {
  await withPluginStorageDb(pluginId, (db) => {
    withTransaction(db, () => {
      db.exec("DELETE FROM kv")
      db.prepare("UPDATE meta SET total_bytes = 0 WHERE id = 1").run()
    })
  })
}

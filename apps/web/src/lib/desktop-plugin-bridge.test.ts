import assert from "node:assert/strict"
import {
  clearPluginStorage,
  createIsolatedPluginFrameUrl,
  getRequiredPluginPermissionForBridgeMethod,
  getPluginStorageValue,
  isAllowedPluginBridgeOrigin,
  isPluginFrameOriginIsolated,
  listPluginStorageKeys,
  normalizePluginFrameHeight,
  normalizeStorageKey,
  pluginStorageKey,
  setPluginStorageValue,
} from "./desktop-plugin-bridge"

class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>()

  get length(): number {
    return this.data.size
  }

  clear(): void {
    this.data.clear()
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.data.delete(key)
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value)
  }
}

function rejects(fn: () => unknown, label: string): void {
  let rejected = false
  try {
    fn()
  } catch {
    rejected = true
  }
  assert.equal(rejected, true, label)
}

function main() {
  assert.equal(getRequiredPluginPermissionForBridgeMethod("plugin.getManifest"), null)
  assert.equal(getRequiredPluginPermissionForBridgeMethod("storage.get"), "storage")
  assert.equal(getRequiredPluginPermissionForBridgeMethod("notification.add"), "notifications")
  assert.equal(getRequiredPluginPermissionForBridgeMethod("activity.track"), "activity")
  assert.equal(getRequiredPluginPermissionForBridgeMethod("worker.invoke"), "native-runtime")

  const localhostFrameUrl = createIsolatedPluginFrameUrl(
    "/api/v1/desktop/plugins/teleprompter/ui/dist/index.html",
    "http://localhost:3000"
  )
  assert.equal(localhostFrameUrl, "http://127.0.0.1:3000/api/v1/desktop/plugins/teleprompter/ui/dist/index.html")
  assert.equal(isAllowedPluginBridgeOrigin("http://127.0.0.1:3000", localhostFrameUrl), true)
  assert.equal(isAllowedPluginBridgeOrigin("null", localhostFrameUrl), false)
  assert.equal(isPluginFrameOriginIsolated(localhostFrameUrl, "http://localhost:3000"), true)

  const loopbackFrameUrl = createIsolatedPluginFrameUrl(
    "/api/v1/desktop/plugins/teleprompter/ui/dist/index.html",
    "http://127.0.0.1:43100"
  )
  assert.equal(loopbackFrameUrl, "http://localhost:43100/api/v1/desktop/plugins/teleprompter/ui/dist/index.html")
  assert.equal(
    createIsolatedPluginFrameUrl("https://plugins.example.com/plugin/index.html", "http://localhost:3000"),
    "https://plugins.example.com/plugin/index.html"
  )
  const nonLoopbackFrameUrl = createIsolatedPluginFrameUrl("/plugin/index.html", "https://desktop.example.com")
  assert.equal(nonLoopbackFrameUrl, "https://desktop.example.com/plugin/index.html")
  assert.equal(isPluginFrameOriginIsolated(nonLoopbackFrameUrl, "https://desktop.example.com"), false)

  assert.equal(normalizeStorageKey(" theme "), "theme")
  assert.equal(normalizePluginFrameHeight(640.2), 641)
  assert.equal(normalizePluginFrameHeight(100), 320)
  rejects(() => normalizeStorageKey(""), "storage key must not be empty")
  rejects(() => normalizePluginFrameHeight(Number.NaN), "frame height must reject invalid number")
  rejects(() => normalizeStorageKey("x".repeat(129)), "storage key must enforce length")
  rejects(() => normalizeStorageKey("bad\nkey"), "storage key must reject control characters")

  const storage = new MemoryStorage()
  setPluginStorageValue(storage, "alpha", "theme", { compact: true })
  setPluginStorageValue(storage, "alpha", "space key", 1)
  setPluginStorageValue(storage, "beta", "theme", "dark")
  assert.deepEqual(getPluginStorageValue(storage, "alpha", "theme"), { compact: true })
  assert.equal(storage.getItem(pluginStorageKey("alpha", "space key")), "1")
  assert.deepEqual(listPluginStorageKeys(storage, "alpha"), ["space key", "theme"])
  clearPluginStorage(storage, "alpha")
  assert.deepEqual(listPluginStorageKeys(storage, "alpha"), [])
  assert.equal(getPluginStorageValue(storage, "beta", "theme"), "dark")

  console.log("[desktop-plugin-bridge] tests passed")
}

main()

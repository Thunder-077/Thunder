import "fake-indexeddb/auto"
import assert from "node:assert/strict"
import {
  clearPluginStorage,
  createIsolatedPluginFrameUrl,
  getPluginStorageValue,
  getRequiredPluginPermissionForBridgeMethod,
  isAllowedPluginBridgeOrigin,
  isPluginFrameOriginIsolated,
  listPluginStorageKeys,
  normalizePluginFrameHeight,
  normalizeStorageKey,
  setPluginStorageValue,
} from "./desktop-plugin-bridge"

function rejects(fn: () => unknown, label: string): void {
  let rejected = false
  try {
    fn()
  } catch {
    rejected = true
  }
  assert.equal(rejected, true, label)
}

async function main() {
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

  await setPluginStorageValue("alpha", "theme", { compact: true })
  await setPluginStorageValue("alpha", "space key", 1)
  await setPluginStorageValue("beta", "theme", "dark")
  assert.deepEqual(await getPluginStorageValue("alpha", "theme"), { compact: true })
  assert.deepEqual(await getPluginStorageValue("alpha", "space key"), 1)
  assert.deepEqual(await listPluginStorageKeys("alpha"), ["space key", "theme"])
  await clearPluginStorage("alpha")
  assert.deepEqual(await listPluginStorageKeys("alpha"), [])
  assert.equal(await getPluginStorageValue("beta", "theme"), "dark")

  const bigValue = "x".repeat(200 * 1024)
  await setPluginStorageValue("quota", "a", bigValue)
  await setPluginStorageValue("quota", "b", bigValue)
  await setPluginStorageValue("quota", "c", bigValue)
  await setPluginStorageValue("quota", "d", bigValue)
  await setPluginStorageValue("quota", "e", bigValue)
  await assert.rejects(
    setPluginStorageValue("quota", "f", bigValue),
    /插件存储空间超过 1 MiB/,
  )
  await assert.rejects(
    setPluginStorageValue("big", "huge", "z".repeat(256 * 1024 + 1)),
    /插件单个存储值超过 256 KiB/,
  )

  console.log("[desktop-plugin-bridge] tests passed")
}

void main()

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

function installPluginStorageFetchMock(): void {
  const stores = new Map<string, Map<string, unknown>>()

  // 当前插件存储通过宿主 HTTP API 访问；测试环境没有浏览器 origin，
  // 因此在这里用 fetch mock 验证 URL、方法和配额语义。
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), "http://localhost:3000")
    const match = url.pathname.match(/^\/api\/v1\/desktop\/plugins\/([^/]+)\/storage(\/keys)?$/)
    if (!match) {
      return Response.json({ ok: false, message: "unexpected url" }, { status: 404 })
    }

    const pluginId = decodeURIComponent(match[1])
    const store = stores.get(pluginId) ?? new Map<string, unknown>()
    stores.set(pluginId, store)

    if (match[2] === "/keys") {
      return Response.json({ ok: true, data: [...store.keys()].sort() })
    }

    const method = init?.method ?? "GET"
    if (method === "GET") {
      return Response.json({ ok: true, data: store.get(url.searchParams.get("key") ?? "") ?? null })
    }

    if (method === "PUT") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { key: string; value: unknown }
      const serialized = JSON.stringify(body.value ?? null)
      if (new TextEncoder().encode(serialized).byteLength > 256 * 1024) {
        return Response.json({ ok: false, message: "插件单个存储值超过 256 KiB" }, { status: 413 })
      }

      const nextStore = new Map(store)
      nextStore.set(body.key, body.value)
      const totalBytes = [...nextStore.values()].reduce<number>(
        (total, value) => total + new TextEncoder().encode(JSON.stringify(value ?? null)).byteLength,
        0,
      )
      if (totalBytes > 1024 * 1024) {
        return Response.json({ ok: false, message: "插件存储空间超过 1 MiB" }, { status: 413 })
      }

      store.set(body.key, body.value)
      return Response.json({ ok: true, data: { pluginId, key: body.key } })
    }

    if (method === "DELETE") {
      const key = url.searchParams.get("key")
      if (key) {
        store.delete(key)
      } else {
        store.clear()
      }
      return Response.json({ ok: true, data: { pluginId } })
    }

    return Response.json({ ok: false, message: "unexpected method" }, { status: 405 })
  }
}

async function main() {
  installPluginStorageFetchMock()

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

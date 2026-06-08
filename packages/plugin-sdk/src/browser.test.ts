import assert from "node:assert/strict"
import {
  createPluginApi,
  definePlugin,
} from "./index"
import type { ThunderPluginManifest } from "@thunder/plugin-schema"
import {
  createThunderPluginClient,
  normalizeThunderPluginRuntimePath,
  normalizeThunderPluginStorageKey,
} from "./browser"

function rejects(fn: () => unknown, label: string): void {
  let rejected = false
  try {
    fn()
  } catch {
    rejected = true
  }
  assert.equal(rejected, true, label)
}

type MessageListener = (event: MessageEvent<unknown>) => void

function createBridgeWindow() {
  const postedRequests: Array<Record<string, unknown>> = []
  const listeners = new Set<MessageListener>()
  let nextTimerId = 1

  const windowMock = {
    parent: {
      postMessage: (payload: unknown) => {
        postedRequests.push(payload as Record<string, unknown>)
      },
    },
    addEventListener: (type: string, listener: MessageListener) => {
      if (type === "message") {
        listeners.add(listener)
      }
    },
    removeEventListener: (type: string, listener: MessageListener) => {
      if (type === "message") {
        listeners.delete(listener)
      }
    },
    setTimeout: () => nextTimerId++,
    clearTimeout: () => {},
  }

  function lastRequest() {
    const request = postedRequests.at(-1)
    assert.ok(request, "expected a bridge request")
    return request
  }

  function respond<T>(data: T) {
    const request = lastRequest()
    for (const listener of listeners) {
      listener({
        source: windowMock.parent,
        data: {
          source: "thunder-host",
          version: 1,
          id: request.id,
          ok: true,
          data,
        },
      } as MessageEvent<T>)
    }
  }

  function reject(message: string) {
    const request = lastRequest()
    for (const listener of listeners) {
      listener({
        source: windowMock.parent,
        data: {
          source: "thunder-host",
          version: 1,
          id: request.id,
          ok: false,
          error: message,
        },
      } as MessageEvent<unknown>)
    }
  }

  return {
    postedRequests,
    windowMock,
    respond,
    reject,
  }
}

async function main() {
  const plugin = definePlugin({
    setup(app) {
      app.commands.register("teleprompter.open", async () => {
        await app.navigation.openPanel("main")
      })
    },
  })

  const api = createPluginApi()
  plugin.setup(api)
  await api.commands.execute("teleprompter.open")
  assert.equal(api.navigation.lastOpenedPanel, "main")

  assert.equal(normalizeThunderPluginRuntimePath("status"), "status")
  assert.equal(normalizeThunderPluginRuntimePath("native/sherpa/models?fresh=1"), "native/sherpa/models?fresh=1")
  rejects(() => normalizeThunderPluginRuntimePath("/status"), "runtime path must reject leading slash")
  rejects(() => normalizeThunderPluginRuntimePath("../secret"), "runtime path must reject parent segment")
  rejects(() => normalizeThunderPluginRuntimePath("native/%2e%2e/secret"), "runtime path must reject encoded parent segment")
  rejects(() => normalizeThunderPluginRuntimePath("native/%2Fsecret"), "runtime path must reject encoded slash")
  rejects(() => normalizeThunderPluginRuntimePath("native//status"), "runtime path must reject empty segment")

  assert.equal(normalizeThunderPluginStorageKey(" theme "), "theme")
  rejects(() => normalizeThunderPluginStorageKey(""), "storage key must reject empty string")
  rejects(() => normalizeThunderPluginStorageKey("x".repeat(129)), "storage key must reject overlong keys")
  rejects(() => normalizeThunderPluginStorageKey("bad\nkey"), "storage key must reject control characters")

  const bridge = createBridgeWindow()
  ;(globalThis as { window?: unknown }).window = bridge.windowMock

  const thunder = createThunderPluginClient()
  thunder.plugin.setFrameHeight(640.2)
  assert.equal(bridge.postedRequests.length, 1)
  assert.deepEqual(bridge.postedRequests[0], {
    source: "thunder-plugin",
    version: 1,
    id: bridge.postedRequests[0]?.id,
    method: "layout.setFrameHeight",
    params: {
      height: 641,
    },
  })
  rejects(() => thunder.plugin.setFrameHeight(Number.NaN), "frame height must reject invalid numbers")

  const runtimePromise = thunder.runtime.request<{ ok: true }>("native/sherpa/models", {
    method: "POST",
    headers: { authorization: "Bearer token" },
    body: { refresh: true },
    cache: "no-store",
  })
  assert.deepEqual(bridge.postedRequests.at(-1), {
    source: "thunder-plugin",
    version: 1,
    id: bridge.postedRequests.at(-1)?.id,
    method: "runtime.request",
    params: {
      path: "native/sherpa/models",
      method: "POST",
      headers: {
        authorization: "Bearer token",
      },
      cache: "no-store",
      body: {
        refresh: true,
      },
    },
  })
  bridge.respond({
    status: 200,
    ok: true,
    headers: {},
    data: { ok: true },
  })
  assert.deepEqual(await runtimePromise, {
    status: 200,
    ok: true,
    headers: {},
    data: { ok: true },
  })

  const networkPromise = thunder.network.post<{ ok: boolean }>("https://api.example.com/v1/test", { ping: true })
  assert.deepEqual(bridge.postedRequests.at(-1), {
    source: "thunder-plugin",
    version: 1,
    id: bridge.postedRequests.at(-1)?.id,
    method: "network.request",
    params: {
      url: "https://api.example.com/v1/test",
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: {
        ping: true,
      },
    },
  })
  bridge.respond({
    status: 201,
    ok: true,
    headers: {},
    data: { ok: true },
  })
  assert.deepEqual(await networkPromise, { ok: true })

  const workerInvokePromise = thunder.worker.invoke<{ normalized: string }, { text: string }>("speech.transcribe", {
    text: "  hello  ",
  })
  assert.deepEqual(bridge.postedRequests.at(-1), {
    source: "thunder-plugin",
    version: 1,
    id: bridge.postedRequests.at(-1)?.id,
    method: "worker.invoke",
    params: {
      method: "speech.transcribe",
      payload: {
        text: "  hello  ",
      },
    },
  })
  bridge.respond({
    ok: true,
    result: {
      normalized: "hello",
    },
  })
  assert.deepEqual(await workerInvokePromise, {
    normalized: "hello",
  })

  const storageGetPromise = thunder.storage.get<string>(" theme ")
  assert.deepEqual(bridge.postedRequests.at(-1), {
    source: "thunder-plugin",
    version: 1,
    id: bridge.postedRequests.at(-1)?.id,
    method: "storage.get",
    params: {
      key: "theme",
    },
  })
  bridge.respond("dark")
  assert.equal(await storageGetPromise, "dark")

  const storageSetPromise = thunder.storage.set("prefs", { fontSize: 32 })
  assert.deepEqual(bridge.postedRequests.at(-1), {
    source: "thunder-plugin",
    version: 1,
    id: bridge.postedRequests.at(-1)?.id,
    method: "storage.set",
    params: {
      key: "prefs",
      value: {
        fontSize: 32,
      },
    },
  })
  bridge.respond(undefined)
  await storageSetPromise

  const storageRemovePromise = thunder.storage.remove("prefs")
  assert.deepEqual(bridge.postedRequests.at(-1), {
    source: "thunder-plugin",
    version: 1,
    id: bridge.postedRequests.at(-1)?.id,
    method: "storage.remove",
    params: {
      key: "prefs",
    },
  })
  bridge.respond(undefined)
  await storageRemovePromise

  const storageKeysPromise = thunder.storage.keys()
  assert.deepEqual(bridge.postedRequests.at(-1), {
    source: "thunder-plugin",
    version: 1,
    id: bridge.postedRequests.at(-1)?.id,
    method: "storage.keys",
    params: undefined,
  })
  bridge.respond(["prefs", "theme"])
  assert.deepEqual(await storageKeysPromise, ["prefs", "theme"])

  const storageClearPromise = thunder.storage.clear()
  assert.deepEqual(bridge.postedRequests.at(-1), {
    source: "thunder-plugin",
    version: 1,
    id: bridge.postedRequests.at(-1)?.id,
    method: "storage.clear",
    params: undefined,
  })
  bridge.respond(undefined)
  await storageClearPromise

  const manifestPromise = thunder.plugin.getManifest()
  const manifest: ThunderPluginManifest = {
    manifestVersion: 2,
    id: "teleprompter",
    name: "Teleprompter",
    version: "2.0.0",
    kind: "trusted",
    engines: {
      thunder: "^2.0.0",
    },
    permissions: ["storage", "native-runtime"],
    contributes: {
      sidebar: {
        title: "Teleprompter",
        entry: "dist/index.html",
      },
    },
    runtime: {
      entry: "dist/worker.js",
    },
  }
  bridge.respond(manifest)
  assert.equal((await manifestPromise).manifestVersion, 2)

  const failedRequest = thunder.runtime.get("status")
  bridge.reject("bridge failed")
  await assert.rejects(failedRequest, /bridge failed/)

  delete (globalThis as { window?: unknown }).window
  const unavailableClient = createThunderPluginClient()
  await assert.rejects(
    unavailableClient.runtime.get("status"),
    /Thunder plugin host bridge is unavailable/
  )

  console.log("[plugin-sdk/browser] tests passed")
}

void main()

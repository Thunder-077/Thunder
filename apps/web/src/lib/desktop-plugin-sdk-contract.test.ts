import assert from "node:assert/strict"
import { createThunderPluginClient } from "@thunder/plugin-sdk/browser"
import {
  PLUGIN_BRIDGE_RESPONSE_SOURCE,
  PLUGIN_BRIDGE_VERSION,
  pluginBridgeMethods,
  type PluginBridgeMethod,
  type PluginBridgeResponse,
  type PluginThemeChangeEvent,
} from "@thunder/plugin-protocol"
import type { ThunderPluginManifest } from "@thunder/plugin-schema"
import { dispatchDesktopPluginHostRequest } from "./desktop-plugin-host-dispatcher"

type MessageListener = (event: MessageEvent<unknown>) => void

const manifest: ThunderPluginManifest = {
  manifestVersion: 2,
  id: "sdk-contract",
  name: "SDK Contract",
  version: "1.0.0",
  kind: "trusted",
  engines: { thunder: "^2.0.0" },
  permissions: ["storage", "notifications", "activity", "native-runtime", "network:https://example.com"],
  contributes: {
    sidebar: {
      title: "SDK Contract",
      entry: "dist/index.html",
    },
  },
  runtime: { entry: "dist/worker.js" },
}

async function main() {
  const listeners = new Set<MessageListener>()
  const seenMethods = new Set<PluginBridgeMethod>()
  const storage = new Map<string, unknown>()
  let frameHeight = 0
  let notificationCount = 0
  let activityCount = 0
  let activeManifest = manifest

  function emit(data: PluginBridgeResponse | PluginThemeChangeEvent): void {
    for (const listener of listeners) {
      listener({
        source: windowMock.parent,
        data,
      } as MessageEvent<unknown>)
    }
  }

  const windowMock = {
    parent: {
      postMessage(input: unknown) {
        void dispatchDesktopPluginHostRequest(input, {
          manifest: activeManifest,
          storage: {
            get: async (key) => storage.get(key) ?? null,
            set: async (key, value) => {
              storage.set(key, value)
            },
            remove: async (key) => {
              storage.delete(key)
            },
            keys: async () => [...storage.keys()].sort(),
            clear: async () => storage.clear(),
          },
          setFrameHeight(height) {
            frameHeight = height
          },
          addNotification() {
            notificationCount += 1
          },
          async trackActivity() {
            activityCount += 1
          },
          async invokeWorker(method, payload) {
            return { method, payload }
          },
          async requestNetwork() {
            return { status: 200, headers: { "content-type": "text/plain" }, body: "ok" }
          },
        })
          .then((dispatched) => {
            seenMethods.add(dispatched.request.method)
            emit({
              source: PLUGIN_BRIDGE_RESPONSE_SOURCE,
              version: PLUGIN_BRIDGE_VERSION,
              id: dispatched.request.id,
              ok: true,
              data: dispatched.result,
            })
          })
          .catch((error) => {
            const request = input as { id?: unknown }
            emit({
              source: PLUGIN_BRIDGE_RESPONSE_SOURCE,
              version: PLUGIN_BRIDGE_VERSION,
              id: typeof request.id === "string" ? request.id : "invalid",
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            })
          })
      },
    },
    addEventListener(type: string, listener: MessageListener) {
      if (type === "message") listeners.add(listener)
    },
    removeEventListener(type: string, listener: MessageListener) {
      if (type === "message") listeners.delete(listener)
    },
    setTimeout,
    clearTimeout,
  }

  ;(globalThis as { window?: unknown }).window = windowMock
  const thunder = createThunderPluginClient()

  assert.equal((await thunder.plugin.getManifest()).id, manifest.id)
  thunder.plugin.setFrameHeight(640.2)
  await thunder.storage.set("draft", { text: "hello" })
  assert.deepEqual(await thunder.storage.get("draft"), { text: "hello" })
  assert.deepEqual(await thunder.storage.keys(), ["draft"])
  await thunder.storage.remove("draft")
  await thunder.storage.clear()
  thunder.notification.add({ type: "success", title: "Saved" })
  await thunder.activity.track({ action: "save", title: "Saved" })
  assert.equal((await thunder.network.get("https://example.com/status")).body, "ok")
  assert.deepEqual(
    await thunder.worker.invoke("draft.normalize", { text: "hello" }),
    {
      method: "draft.normalize",
      payload: { text: "hello" },
    },
  )

  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(frameHeight, 641)
  assert.equal(notificationCount, 1)
  assert.equal(activityCount, 1)
  assert.deepEqual(
    [...seenMethods].sort(),
    [...pluginBridgeMethods].sort(),
  )

  let theme: string | null = null
  const unsubscribe = thunder.theme.onChange((value) => {
    theme = value
  })
  emit({
    source: PLUGIN_BRIDGE_RESPONSE_SOURCE,
    version: PLUGIN_BRIDGE_VERSION,
    type: "theme.change",
    theme: "dark",
  })
  assert.equal(theme, "dark")
  unsubscribe()

  activeManifest = { ...manifest, permissions: [] }
  await assert.rejects(
    thunder.storage.get("draft"),
    /插件未声明 storage 权限/,
  )

  delete (globalThis as { window?: unknown }).window
  console.log("[desktop-plugin-sdk-contract] tests passed")
}

void main()

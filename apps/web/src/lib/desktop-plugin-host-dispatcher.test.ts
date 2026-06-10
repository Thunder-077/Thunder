import assert from "node:assert/strict"
import {
  PLUGIN_BRIDGE_REQUEST_SOURCE,
  PLUGIN_BRIDGE_VERSION,
  pluginBridgeMethods,
  type PluginBridgeMethod,
} from "@thunder/plugin-protocol"
import type { ThunderPluginManifest } from "@thunder/plugin-schema"
import {
  dispatchDesktopPluginHostRequest,
  type DesktopPluginHostContext,
} from "./desktop-plugin-host-dispatcher"

const manifest: ThunderPluginManifest = {
  manifestVersion: 2,
  id: "contract-plugin",
  name: "Contract Plugin",
  version: "1.0.0",
  kind: "trusted",
  engines: { thunder: "^2.0.0" },
  permissions: ["storage", "notifications", "activity", "native-runtime"],
  contributes: {
    sidebar: {
      title: "Contract Plugin",
      entry: "dist/index.html",
    },
  },
  runtime: { entry: "dist/worker.js" },
}

function createContext(): DesktopPluginHostContext & {
  values: Map<string, unknown>
  frameHeight: number
  notifications: unknown[]
  activities: unknown[]
} {
  const values = new Map<string, unknown>()
  const context = {
    manifest,
    values,
    frameHeight: 0,
    notifications: [] as unknown[],
    activities: [] as unknown[],
    storage: {
      get: async (key: string) => values.get(key) ?? null,
      set: async (key: string, value: unknown) => {
        values.set(key, value)
      },
      remove: async (key: string) => {
        values.delete(key)
      },
      keys: async () => [...values.keys()].sort(),
      clear: async () => values.clear(),
    },
    setFrameHeight(height: number) {
      context.frameHeight = height
    },
    addNotification(params: unknown) {
      context.notifications.push(params)
    },
    async trackActivity(params: unknown) {
      context.activities.push(params)
    },
    async invokeWorker(method: string, payload: unknown) {
      return { method, payload }
    },
    async requestNetwork() {
      return { status: 200, headers: {}, body: "ok" }
    },
  }
  return context
}

function request(
  method: PluginBridgeMethod,
  params?: unknown,
): Record<string, unknown> {
  return {
    source: PLUGIN_BRIDGE_REQUEST_SOURCE,
    version: PLUGIN_BRIDGE_VERSION,
    id: `request-${method}`,
    method,
    params,
  }
}

const inputs: Record<PluginBridgeMethod, unknown> = {
  "plugin.getManifest": undefined,
  "layout.setFrameHeight": { height: 640.2 },
  "storage.get": { key: "draft" },
  "storage.set": { key: "draft", value: { text: "hello" } },
  "storage.remove": { key: "draft" },
  "storage.keys": undefined,
  "storage.clear": undefined,
  "notification.add": { type: "success", title: "Saved" },
  "activity.track": { action: "save", title: "Saved draft" },
  "network.request": { url: "https://example.com", method: "GET" },
  "worker.invoke": { method: "draft.normalize", payload: { text: "hello" } },
}

async function main() {
  for (const method of pluginBridgeMethods) {
    const context = createContext()
    if (method === "network.request") {
      context.manifest = {
        ...manifest,
        permissions: [...manifest.permissions, "network:https://example.com"],
      }
    }
    await dispatchDesktopPluginHostRequest(request(method, inputs[method]), context)
  }

  const storageContext = createContext()
  await dispatchDesktopPluginHostRequest(
    request("storage.set", { key: " draft ", value: "hello" }),
    storageContext,
  )
  assert.equal(storageContext.values.get("draft"), "hello")
  assert.equal(
    (
      await dispatchDesktopPluginHostRequest(
        request("storage.get", { key: "draft" }),
        storageContext,
      )
    ).result,
    "hello",
  )

  const deniedContext = createContext()
  deniedContext.manifest = { ...manifest, permissions: [] }
  await assert.rejects(
    dispatchDesktopPluginHostRequest(
      request("worker.invoke", { method: "draft.normalize" }),
      deniedContext,
    ),
    /插件未声明 native-runtime 权限/,
  )

  console.log("[desktop-plugin-host-dispatcher] tests passed")
}

void main()

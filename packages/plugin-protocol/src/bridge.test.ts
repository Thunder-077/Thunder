import assert from "node:assert/strict"
import {
  PLUGIN_BRIDGE_REQUEST_SOURCE,
  PLUGIN_BRIDGE_VERSION,
  PluginProtocolError,
  getRequiredPluginPermission,
  parsePluginBridgeRequest,
  pluginBridgeMethods,
} from "./index"

assert.deepEqual(pluginBridgeMethods, [
  "plugin.getManifest",
  "layout.setFrameHeight",
  "storage.get",
  "storage.set",
  "storage.remove",
  "storage.keys",
  "storage.clear",
  "notification.add",
  "activity.track",
  "network.request",
  "worker.invoke",
])
assert.equal(getRequiredPluginPermission("plugin.getManifest"), null)
assert.equal(getRequiredPluginPermission("storage.get"), "storage")
assert.equal(getRequiredPluginPermission("worker.invoke"), "native-runtime")

assert.deepEqual(
  parsePluginBridgeRequest({
    source: PLUGIN_BRIDGE_REQUEST_SOURCE,
    version: PLUGIN_BRIDGE_VERSION,
    id: "request-1",
    method: "storage.set",
    params: { key: " theme ", value: "dark" },
  }),
  {
    source: PLUGIN_BRIDGE_REQUEST_SOURCE,
    version: PLUGIN_BRIDGE_VERSION,
    id: "request-1",
    method: "storage.set",
    params: { key: "theme", value: "dark" },
  },
)

assert.deepEqual(
  parsePluginBridgeRequest({
    source: PLUGIN_BRIDGE_REQUEST_SOURCE,
    version: PLUGIN_BRIDGE_VERSION,
    id: "request-2",
    method: "network.request",
    params: { url: "https://example.com/api", method: "GET" },
  }).params,
  { url: "https://example.com/api", method: "GET", headers: undefined, body: undefined },
)

assert.throws(
  () =>
    parsePluginBridgeRequest({
      source: PLUGIN_BRIDGE_REQUEST_SOURCE,
      version: PLUGIN_BRIDGE_VERSION,
      id: "request-3",
      method: "worker.invoke",
      params: { method: "../escape" },
    }),
  (error) =>
    error instanceof PluginProtocolError &&
    error.code === "INVALID_PARAMS",
)

console.log("[plugin-protocol] bridge tests passed")

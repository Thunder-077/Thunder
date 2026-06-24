import assert from "node:assert/strict"
import {
  PLUGIN_BRIDGE_REQUEST_SOURCE,
  PLUGIN_BRIDGE_RESPONSE_SOURCE,
  PLUGIN_BRIDGE_VERSION,
  PluginProtocolError,
  getRequiredPluginPermission,
  parsePluginBridgeRequest,
  pluginBridgeMethods,
  type PluginUpdatedEvent,
  type PluginHmrScope,
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
  "speech.stream.open",
  "events.broadcast",
])
assert.equal(getRequiredPluginPermission("plugin.getManifest"), null)
assert.equal(getRequiredPluginPermission("storage.get"), "storage")
assert.equal(getRequiredPluginPermission("worker.invoke"), "native-runtime")
assert.equal(getRequiredPluginPermission("speech.stream.open"), "native-runtime")

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
  { url: "https://example.com/api", method: "GET", headers: undefined, body: undefined, responseType: "text" },
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

assert.deepEqual(
  parsePluginBridgeRequest({
    source: PLUGIN_BRIDGE_REQUEST_SOURCE,
    version: PLUGIN_BRIDGE_VERSION,
    id: "request-4",
    method: "speech.stream.open",
    params: {
      sessionId: "speech-session-1",
      sampleRate: 16000,
      channels: 1,
      encoding: "pcm_s16le",
    },
  }).params,
  {
    sessionId: "speech-session-1",
    sampleRate: 16000,
    channels: 1,
    encoding: "pcm_s16le",
  },
)

// PluginUpdatedEvent type check — verify the event shape is correctly typed
const validScopes: PluginHmrScope[] = ["ui", "worker", "all"]
for (const scope of validScopes) {
  const event: PluginUpdatedEvent = {
    source: PLUGIN_BRIDGE_RESPONSE_SOURCE,
    version: PLUGIN_BRIDGE_VERSION,
    type: "plugin.updated",
    scope,
    timestamp: Date.now(),
  }
  assert.equal(event.type, "plugin.updated")
  assert.equal(event.scope, scope)
  assert.equal(typeof event.timestamp, "number")
}

console.log("[plugin-protocol] bridge tests passed")

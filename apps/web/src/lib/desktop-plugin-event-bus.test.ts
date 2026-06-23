import assert from "node:assert/strict"
import {
  PLUGIN_BRIDGE_RESPONSE_SOURCE,
  PLUGIN_BRIDGE_VERSION,
} from "@thunder/plugin-protocol"
import { pluginEventBus } from "./desktop-plugin-event-bus"

function createIframeRecorder() {
  const messages: Array<{ message: unknown; origin: string }> = []
  const iframe = {
    contentWindow: {
      postMessage(message: unknown, origin: string) {
        messages.push({ message, origin })
      },
    },
  } as HTMLIFrameElement

  return { iframe, messages }
}

async function main() {
  const first = createIframeRecorder()
  const second = createIframeRecorder()

  pluginEventBus.subscribe("first-plugin", first.iframe, "https://first.example")
  pluginEventBus.subscribe("second-plugin", second.iframe, "https://second.example")

  pluginEventBus.broadcast("first-plugin", "draft.updated", { text: "hello" })

  assert.equal(first.messages.length, 0)
  assert.equal(second.messages.length, 1)
  assert.deepEqual(second.messages[0], {
    origin: "https://second.example",
    message: {
      source: PLUGIN_BRIDGE_RESPONSE_SOURCE,
      version: PLUGIN_BRIDGE_VERSION,
      type: "plugin.event",
      senderId: "first-plugin",
      event: "draft.updated",
      data: { text: "hello" },
    },
  })

  pluginEventBus.unsubscribe("second-plugin")
  pluginEventBus.broadcast("first-plugin", "draft.updated", { text: "ignored" })
  assert.equal(second.messages.length, 1)

  pluginEventBus.unsubscribe("first-plugin")
  console.log("[desktop-plugin-event-bus] tests passed")
}

void main()

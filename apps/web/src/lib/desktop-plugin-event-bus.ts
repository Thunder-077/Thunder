import {
  PLUGIN_BRIDGE_RESPONSE_SOURCE,
  PLUGIN_BRIDGE_VERSION,
  type PluginBroadcastEvent,
} from "@thunder/plugin-protocol"

interface PluginEventSubscriber {
  pluginId: string
  iframe: HTMLIFrameElement
  origin: string
}

/**
 * Host-side event bus for inter-plugin communication.
 *
 * When a plugin calls `thunder.events.broadcast(event, data)`, the host
 * dispatcher routes the event through this bus, which forwards it as a
 * `plugin.event` postMessage to every other subscribed plugin iframe.
 */
class DesktopPluginEventBus {
  private subscribers = new Map<string, PluginEventSubscriber>()

  /** Register a plugin iframe to receive broadcast events. */
  subscribe(pluginId: string, iframe: HTMLIFrameElement, origin: string): void {
    this.subscribers.set(pluginId, { pluginId, iframe, origin })
  }

  /** Remove a plugin from the bus (e.g. when navigating away). */
  unsubscribe(pluginId: string): void {
    this.subscribers.delete(pluginId)
  }

  /** Broadcast an event from `senderId` to all other subscribers. */
  broadcast(senderId: string, event: string, data?: unknown): void {
    const message: PluginBroadcastEvent = {
      source: PLUGIN_BRIDGE_RESPONSE_SOURCE,
      version: PLUGIN_BRIDGE_VERSION,
      type: "plugin.event",
      senderId,
      event,
      data,
    }

    for (const [id, sub] of this.subscribers) {
      if (id === senderId) continue
      try {
        sub.iframe.contentWindow?.postMessage(message, sub.origin)
      } catch {
        // iframe may have been removed — ignore
      }
    }
  }
}

/** Singleton event bus shared across the web app. */
export const pluginEventBus = new DesktopPluginEventBus()

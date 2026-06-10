import type { ThunderPluginManifest } from "@thunder/plugin-schema"
import {
  PLUGIN_BRIDGE_REQUEST_SOURCE,
  PLUGIN_BRIDGE_RESPONSE_SOURCE,
  PLUGIN_BRIDGE_VERSION,
  normalizePluginStorageKey,
  normalizePluginWorkerMethod,
  type PluginActivityParams,
  type PluginBridgeMethod,
  type PluginBridgeRequest,
  type PluginBridgeResponse,
  type PluginNotificationParams,
  type PluginNetworkRequestParams,
  type PluginNetworkResponse,
  type PluginThemeChangeEvent,
} from "@thunder/plugin-protocol"

type WorkerInvokeResponse<T> = {
  ok: true
  result: T
}

type ThemeChangeCallback = (theme: "light" | "dark") => void

export interface ThunderBrowserPluginClient {
  plugin: {
    getManifest(): Promise<ThunderPluginManifest>
    setFrameHeight(height: number): void
  }
  theme: {
    onChange(callback: ThemeChangeCallback): () => void
  }
  worker: {
    invoke<TResult = unknown, TPayload = unknown>(method: string, payload?: TPayload): Promise<TResult>
  }
  notification: {
    add(notification: PluginNotificationParams): void
  }
  storage: {
    get<T = unknown>(key: string): Promise<T | null>
    set(key: string, value: unknown): Promise<void>
    remove(key: string): Promise<void>
    keys(): Promise<string[]>
    clear(): Promise<void>
  }
  activity: {
    track(params: PluginActivityParams): Promise<void>
  }
  network: {
    request(params: PluginNetworkRequestParams): Promise<PluginNetworkResponse>
    get(url: string, headers?: Record<string, string>): Promise<PluginNetworkResponse>
    post(url: string, body?: string, headers?: Record<string, string>): Promise<PluginNetworkResponse>
  }
}

let nextRequestId = 1

export function normalizeThunderPluginStorageKey(key: string): string {
  return normalizePluginStorageKey(key)
}

function postHostMessage<T>(method: PluginBridgeMethod, params?: unknown): Promise<T> {
  if (typeof window === "undefined" || !window.parent || window.parent === window) {
    return Promise.reject(new Error("Thunder plugin host bridge is unavailable"))
  }

  const id = `plugin-${Date.now()}-${nextRequestId++}`
  const request = {
    source: PLUGIN_BRIDGE_REQUEST_SOURCE,
    version: PLUGIN_BRIDGE_VERSION,
    id,
    method,
    params,
  } as PluginBridgeRequest

  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", handleMessage)
      reject(new Error(`Thunder plugin host bridge timed out: ${method}`))
    }, 30_000)

    function handleMessage(event: MessageEvent<PluginBridgeResponse<T>>) {
      const response = event.data
      if (
        event.source !== window.parent ||
        !response ||
        response.source !== PLUGIN_BRIDGE_RESPONSE_SOURCE ||
        response.version !== PLUGIN_BRIDGE_VERSION ||
        response.id !== id
      ) {
        return
      }

      window.clearTimeout(timeout)
      window.removeEventListener("message", handleMessage)

      if (!response.ok) {
        reject(new Error(response.error || `Thunder plugin host bridge failed: ${method}`))
        return
      }

      resolve(response.data as T)
    }

    window.addEventListener("message", handleMessage)
    // The host validates event.source, event.origin, message source, version, and request id.
    // Plugin frames can run on an isolated loopback origin, so their own location.origin is not the parent origin.
    window.parent.postMessage(request, "*")
  })
}

function postHostEvent(method: PluginBridgeMethod, params?: unknown): void {
  if (typeof window === "undefined" || !window.parent || window.parent === window) {
    return
  }

  const request = {
    source: PLUGIN_BRIDGE_REQUEST_SOURCE,
    version: PLUGIN_BRIDGE_VERSION,
    id: `plugin-event-${Date.now()}-${nextRequestId++}`,
    method,
    params,
  } as PluginBridgeRequest

  window.parent.postMessage(request, "*")
}

export function createThunderPluginClient(): ThunderBrowserPluginClient {
  return {
    plugin: {
      getManifest: () => postHostMessage<ThunderPluginManifest>("plugin.getManifest"),
      setFrameHeight: (height: number) => {
        if (!Number.isFinite(height)) {
          throw new Error("Thunder plugin frame height is invalid")
        }

        postHostEvent("layout.setFrameHeight", {
          height: Math.max(320, Math.ceil(height)),
        })
      },
    },
    theme: {
      onChange: (callback: ThemeChangeCallback) => {
        if (typeof window === "undefined") return () => {}

        function handleMessage(event: MessageEvent<PluginThemeChangeEvent>) {
          const data = event.data
          if (
            !data ||
            data.source !== PLUGIN_BRIDGE_RESPONSE_SOURCE ||
            data.type !== "theme.change" ||
            (data.theme !== "light" && data.theme !== "dark")
          ) {
            return
          }
          callback(data.theme)
        }

        window.addEventListener("message", handleMessage)
        return () => window.removeEventListener("message", handleMessage)
      },
    },
    worker: {
      async invoke<TResult = unknown, TPayload = unknown>(method: string, payload?: TPayload) {
        const response = await postHostMessage<WorkerInvokeResponse<TResult>>("worker.invoke", {
          method: normalizePluginWorkerMethod(method),
          payload,
        })
        return response.result
      },
    },
    notification: {
      add: (notification: PluginNotificationParams) => {
        postHostEvent("notification.add", notification)
      },
    },
    storage: {
      get: <T = unknown>(key: string) =>
        postHostMessage<T | null>("storage.get", {
          key: normalizeThunderPluginStorageKey(key),
        }),
      set: (key: string, value: unknown) =>
        postHostMessage<void>("storage.set", {
          key: normalizeThunderPluginStorageKey(key),
          value,
        }),
      remove: (key: string) =>
        postHostMessage<void>("storage.remove", {
          key: normalizeThunderPluginStorageKey(key),
        }),
      keys: () => postHostMessage<string[]>("storage.keys"),
      clear: () => postHostMessage<void>("storage.clear"),
    },
    activity: {
      track: (params: PluginActivityParams) => {
        return postHostMessage<void>("activity.track", params)
      },
    },
    network: {
      request: (params) => postHostMessage<PluginNetworkResponse>("network.request", params),
      get: (url, headers) =>
        postHostMessage<PluginNetworkResponse>("network.request", { url, method: "GET", headers }),
      post: (url, body, headers) =>
        postHostMessage<PluginNetworkResponse>("network.request", { url, method: "POST", body, headers }),
    },
  }
}

export const thunder = createThunderPluginClient()

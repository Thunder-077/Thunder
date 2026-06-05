import type { ThunderPluginManifestLike } from "./index"

type BridgeMethod =
  | "plugin.getManifest"
  | "layout.setFrameHeight"
  | "runtime.request"
  | "worker.invoke"
  | "network.request"
  | "notification.add"
  | "storage.get"
  | "storage.set"
  | "storage.remove"
  | "storage.keys"
  | "storage.clear"
  | "activity.track"

type BridgeRequest = {
  source: "thunder-plugin"
  version: 1
  id: string
  method: BridgeMethod
  params?: unknown
}

type BridgeResponse<T> = {
  source: "thunder-host"
  version: 1
  id: string
  ok: boolean
  data?: T
  error?: string
}

type RuntimeRequestOptions = {
  method?: string
  headers?: Record<string, string>
  body?: unknown
  cache?: RequestCache
}

type RuntimeResponse<T> = {
  status: number
  ok: boolean
  headers: Record<string, string>
  data: T
}

type WorkerInvokeResponse<T> = {
  ok: true
  result: T
}

type NetworkRequestOptions = {
  method?: string
  headers?: Record<string, string>
  body?: unknown
}

type NetworkResponse<T> = {
  status: number
  ok: boolean
  headers: Record<string, string>
  data: T
}

type NotificationParams = {
  type?: "info" | "success" | "error"
  title?: string
  description?: string
}

type StorageSetOptions = {
  value: unknown
}

type ThemeChangeMessage = {
  source: "thunder-host"
  type: "theme.change"
  theme: "light" | "dark"
}

type ThemeChangeCallback = (theme: "light" | "dark") => void

export interface ThunderBrowserPluginClient {
  plugin: {
    getManifest(): Promise<ThunderPluginManifestLike>
    setFrameHeight(height: number): void
  }
  theme: {
    onChange(callback: ThemeChangeCallback): () => void
  }
  runtime: {
    request<T = unknown>(path: string, options?: RuntimeRequestOptions): Promise<RuntimeResponse<T>>
    get<T = unknown>(path: string, options?: Omit<RuntimeRequestOptions, "method" | "body">): Promise<T>
    post<T = unknown>(path: string, body?: unknown, options?: Omit<RuntimeRequestOptions, "method" | "body">): Promise<T>
  }
  worker: {
    invoke<TResult = unknown, TPayload = unknown>(method: string, payload?: TPayload): Promise<TResult>
  }
  network: {
    request<T = unknown>(url: string, options?: NetworkRequestOptions): Promise<NetworkResponse<T>>
    get<T = unknown>(url: string, options?: Omit<NetworkRequestOptions, "method" | "body">): Promise<T>
    post<T = unknown>(url: string, body?: unknown, options?: Omit<NetworkRequestOptions, "method" | "body">): Promise<T>
  }
  notification: {
    add(notification: NotificationParams): void
  }
  storage: {
    get<T = unknown>(key: string): Promise<T | null>
    set(key: string, value: unknown): Promise<void>
    remove(key: string): Promise<void>
    keys(): Promise<string[]>
    clear(): Promise<void>
  }
  activity: {
    track(params: { action: string; title: string; description?: string; metadata?: Record<string, unknown> }): Promise<void>
  }
}

let nextRequestId = 1

export function normalizeThunderPluginRuntimePath(path: string): string {
  const normalized = path.trim()
  if (!normalized || normalized.startsWith("/") || normalized.startsWith("\\")) {
    throw new Error("Thunder plugin runtime request path cannot be empty")
  }

  const pathOnly = normalized.split(/[?#]/, 1)[0]
  const segments = pathOnly.split("/")
  for (const segment of segments) {
    if (!segment || segment.includes("\\")) {
      throw new Error("Thunder plugin runtime request path is invalid")
    }

    let decodedSegment = segment
    try {
      decodedSegment = decodeURIComponent(segment)
    } catch {
      throw new Error("Thunder plugin runtime request path is invalid")
    }

    if (
      decodedSegment === "." ||
      decodedSegment === ".." ||
      decodedSegment.includes("/") ||
      decodedSegment.includes("\\")
    ) {
      throw new Error("Thunder plugin runtime request path is invalid")
    }
  }

  return normalized
}

export function normalizeThunderPluginStorageKey(key: string): string {
  const normalized = key.trim()
  if (!normalized || normalized.length > 128 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error("Thunder plugin storage key cannot be empty")
  }
  return normalized
}

function withOptionalBody<T extends { headers?: Record<string, string> }>(
  options: T,
  body: unknown
): T & { headers: Record<string, string>; body?: unknown } {
  const headers = body === undefined ? { ...(options.headers ?? {}) } : { "content-type": "application/json", ...(options.headers ?? {}) }
  return body === undefined ? { ...options, headers } : { ...options, headers, body }
}

function postHostMessage<T>(method: BridgeMethod, params?: unknown): Promise<T> {
  if (typeof window === "undefined" || !window.parent || window.parent === window) {
    return Promise.reject(new Error("Thunder plugin host bridge is unavailable"))
  }

  const id = `plugin-${Date.now()}-${nextRequestId++}`
  const request: BridgeRequest = {
    source: "thunder-plugin",
    version: 1,
    id,
    method,
    params,
  }

  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", handleMessage)
      reject(new Error(`Thunder plugin host bridge timed out: ${method}`))
    }, 30_000)

    function handleMessage(event: MessageEvent<BridgeResponse<T>>) {
      const response = event.data
      if (
        event.source !== window.parent ||
        !response ||
        response.source !== "thunder-host" ||
        response.version !== 1 ||
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

function postHostEvent(method: BridgeMethod, params?: unknown): void {
  if (typeof window === "undefined" || !window.parent || window.parent === window) {
    return
  }

  const request: BridgeRequest = {
    source: "thunder-plugin",
    version: 1,
    id: `plugin-event-${Date.now()}-${nextRequestId++}`,
    method,
    params,
  }

  window.parent.postMessage(request, "*")
}

function normalizeThunderPluginWorkerMethod(method: string): string {
  const normalized = method.trim()
  if (!normalized || normalized.length > 128) {
    throw new Error("Thunder plugin worker method cannot be empty")
  }

  if (!/^[a-z0-9._-]+$/i.test(normalized)) {
    throw new Error("Thunder plugin worker method is invalid")
  }

  return normalized
}

export function createThunderPluginClient(): ThunderBrowserPluginClient {
  return {
    plugin: {
      getManifest: () => postHostMessage<ThunderPluginManifestLike>("plugin.getManifest"),
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

        function handleMessage(event: MessageEvent<ThemeChangeMessage>) {
          const data = event.data
          if (
            !data ||
            data.source !== "thunder-host" ||
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
    runtime: {
      request: <T = unknown>(path: string, options: RuntimeRequestOptions = {}) =>
        postHostMessage<RuntimeResponse<T>>("runtime.request", {
          path: normalizeThunderPluginRuntimePath(path),
          method: options.method ?? "GET",
          headers: options.headers ?? {},
          cache: options.cache,
          ...(options.body === undefined ? {} : { body: options.body }),
        }),
      get: async <T = unknown>(path: string, options: Omit<RuntimeRequestOptions, "method" | "body"> = {}) => {
        const response = await postHostMessage<RuntimeResponse<T>>("runtime.request", {
          path: normalizeThunderPluginRuntimePath(path),
          method: "GET",
          headers: options.headers ?? {},
          cache: options.cache,
        })
        return response.data
      },
      post: async <T = unknown>(
        path: string,
        body?: unknown,
        options: Omit<RuntimeRequestOptions, "method" | "body"> = {}
      ) => {
        const response = await postHostMessage<RuntimeResponse<T>>("runtime.request", {
          path: normalizeThunderPluginRuntimePath(path),
          method: "POST",
          ...withOptionalBody(options, body),
        })
        return response.data
      },
    },
    worker: {
      async invoke<TResult = unknown, TPayload = unknown>(method: string, payload?: TPayload) {
        const response = await postHostMessage<WorkerInvokeResponse<TResult>>("worker.invoke", {
          method: normalizeThunderPluginWorkerMethod(method),
          payload,
        })
        return response.result
      },
    },
    network: {
      request: <T = unknown>(url: string, options: NetworkRequestOptions = {}) =>
        postHostMessage<NetworkResponse<T>>("network.request", {
          url,
          method: options.method ?? "GET",
          headers: options.headers ?? {},
          ...(options.body === undefined ? {} : { body: options.body }),
        }),
      get: async <T = unknown>(url: string, options: Omit<NetworkRequestOptions, "method" | "body"> = {}) => {
        const response = await postHostMessage<NetworkResponse<T>>("network.request", {
          url,
          method: "GET",
          headers: options.headers ?? {},
        })
        return response.data
      },
      post: async <T = unknown>(
        url: string,
        body?: unknown,
        options: Omit<NetworkRequestOptions, "method" | "body"> = {}
      ) => {
        const response = await postHostMessage<NetworkResponse<T>>("network.request", {
          url,
          method: "POST",
          ...withOptionalBody(options, body),
        })
        return response.data
      },
    },
    notification: {
      add: (notification: NotificationParams) => {
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
        } satisfies { key: string } & StorageSetOptions),
      remove: (key: string) =>
        postHostMessage<void>("storage.remove", {
          key: normalizeThunderPluginStorageKey(key),
        }),
      keys: () => postHostMessage<string[]>("storage.keys"),
      clear: () => postHostMessage<void>("storage.clear"),
    },
    activity: {
      track: (params: { action: string; title: string; description?: string; metadata?: Record<string, unknown> }) => {
        return postHostMessage<void>("activity.track", params)
      },
    },
  }
}

export const thunder = createThunderPluginClient()

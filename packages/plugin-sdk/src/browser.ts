import type { ThunderPluginManifest } from "./index"

type BridgeMethod = "plugin.getManifest" | "runtime.request"

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

export interface ThunderBrowserPluginClient {
  plugin: {
    getManifest(): Promise<ThunderPluginManifest>
  }
  runtime: {
    request<T = unknown>(path: string, options?: RuntimeRequestOptions): Promise<RuntimeResponse<T>>
    get<T = unknown>(path: string, options?: Omit<RuntimeRequestOptions, "method" | "body">): Promise<T>
    post<T = unknown>(path: string, body?: unknown, options?: Omit<RuntimeRequestOptions, "method" | "body">): Promise<T>
  }
}

let nextRequestId = 1

function normalizeRuntimePath(path: string): string {
  const normalized = path.trim()
  if (!normalized) {
    throw new Error("Thunder plugin runtime request path cannot be empty")
  }
  return normalized.startsWith("/") ? normalized.slice(1) : normalized
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
    window.parent.postMessage(request, window.location.origin)
  })
}

export function createThunderPluginClient(): ThunderBrowserPluginClient {
  return {
    plugin: {
      getManifest: () => postHostMessage<ThunderPluginManifest>("plugin.getManifest"),
    },
    runtime: {
      request: <T = unknown>(path: string, options: RuntimeRequestOptions = {}) =>
        postHostMessage<RuntimeResponse<T>>("runtime.request", {
          path: normalizeRuntimePath(path),
          method: options.method ?? "GET",
          headers: options.headers ?? {},
          body: options.body,
          cache: options.cache,
        }),
      get: async <T = unknown>(path: string, options: Omit<RuntimeRequestOptions, "method" | "body"> = {}) => {
        const response = await postHostMessage<RuntimeResponse<T>>("runtime.request", {
          path: normalizeRuntimePath(path),
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
          path: normalizeRuntimePath(path),
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(options.headers ?? {}),
          },
          body,
          cache: options.cache,
        })
        return response.data
      },
    },
  }
}

export const thunder = createThunderPluginClient()

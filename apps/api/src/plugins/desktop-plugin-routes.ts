import { Hono } from "hono"
import { createMiddleware } from "hono/factory"
import {
  DesktopPluginError,
} from "./desktop-plugin-internal"
import {
  getInstalledPlugin,
  isDesktopPluginRuntimeEnabled,
  listInstalledDesktopPlugins,
} from "./desktop-plugin-registry"
import {
  installBundledDesktopPlugin,
  installPackagedPlugin,
  uninstallDesktopPlugin,
} from "./desktop-plugin-install-service"
import {
  readDesktopPluginUiAsset,
} from "./desktop-plugin-asset-service"
import {
  getDesktopPluginRuntimeStatus,
  invokeDesktopPluginWorker,
  restartDesktopPluginRuntime,
  startDesktopPluginRuntime,
  stopDesktopPluginRuntime,
} from "./desktop-plugin-runtime-service"
import { fetchDesktopPluginMarketplace } from "./desktop-plugin-marketplace"
import {
  getPluginStorage,
  setPluginStorage,
  removePluginStorage,
  listPluginStorageKeys,
  clearPluginStorage,
} from "./desktop-plugin-storage"
import {
  proxyDesktopPluginNetworkRequest,
} from "./desktop-plugin-network"

export const desktopPlugins = new Hono()

/**
 * Guard middleware: rejects all plugin API requests when the plugin system
 * is not enabled (i.e. non-desktop environments). Applied globally so
 * individual routes don't need to duplicate the check.
 */
const pluginSystemGuard = createMiddleware(async (c, next) => {
  if (!isDesktopPluginRuntimeEnabled()) {
    return c.json({ ok: false, message: "插件系统仅在桌面端启用" }, 403)
  }
  await next()
})

// Apply the guard to all routes that operate on a specific plugin.
// The list and marketplace endpoints intentionally skip the guard —
// listInstalledDesktopPlugins already returns [] when disabled, and
// marketplace browsing is allowed regardless.
desktopPlugins.use("/:id/*", pluginSystemGuard)
desktopPlugins.use("/:id", pluginSystemGuard)

// Installation and uninstallation endpoints also need the guard.
desktopPlugins.use("/install/*", pluginSystemGuard)

const BLOCKED_PLUGIN_API_PROXY_HEADERS = new Set([
  "authorization",
  "connection",
  "content-length",
  "cookie",
  "host",
  "proxy-authorization",
  "transfer-encoding",
])

export function sanitizePluginApiProxyHeaders(headers: Headers): Headers {
  const sanitized = new Headers()
  for (const [name, value] of headers.entries()) {
    const normalizedName = name.trim().toLowerCase()
    if (!normalizedName || BLOCKED_PLUGIN_API_PROXY_HEADERS.has(normalizedName)) {
      continue
    }
    sanitized.set(normalizedName, value)
  }
  return sanitized
}

function toErrorResponse(error: unknown) {
  if (error instanceof DesktopPluginError) {
    // Covers DesktopPluginError and all subclasses (e.g. DesktopPluginTrustError).
    return { status: error.status, body: { ok: false, message: error.message } }
  }
  console.error("[desktop-plugins] unexpected error", error)
  return { status: 500, body: { ok: false, message: "插件系统内部错误" } }
}

function jsonError(error: unknown): Response {
  const response = toErrorResponse(error)
  return new Response(JSON.stringify(response.body), {
    status: response.status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  })
}

desktopPlugins.get("/", async (c) => {
  const plugins = await listInstalledDesktopPlugins()
  return c.json({ ok: true, data: { enabled: isDesktopPluginRuntimeEnabled(), plugins } })
})

desktopPlugins.get("/marketplace", async (c) => {
  try {
    const index = await fetchDesktopPluginMarketplace()
    return c.json({ ok: true, data: index })
  } catch (error) {
    return jsonError(error)
  }
})

desktopPlugins.get("/:id", async (c) => {
  try {
    const plugin = await getInstalledPlugin(c.req.param("id"))
    return c.json({ ok: true, data: plugin })
  } catch (error) {
    return jsonError(error)
  }
})

desktopPlugins.post("/install/local", async (c) => {
  try {
    const body = (await c.req.json().catch(() => null)) as
      | {
          pluginPath?: string
          trustDecision?: Parameters<typeof installPackagedPlugin>[0]["trustDecision"]
        }
      | null

    if (!body?.pluginPath) {
      return c.json({ ok: false, message: "pluginPath 不能为空" }, 400)
    }

    const plugin = await installPackagedPlugin({
      pluginPath: body.pluginPath,
      trustDecision: body.trustDecision,
    })
    return c.json({ ok: true, data: plugin }, 201)
  } catch (error) {
    return jsonError(error)
  }
})

desktopPlugins.post("/install/package", async (c) => {
  return c.json({ ok: false, message: "正式插件系统暂不支持远程包安装，请使用本地目录或官方内置插件" }, 501)
})

desktopPlugins.post("/install/bundled", async (c) => {
  try {
    const body = (await c.req.json().catch(() => null)) as { pluginId?: string } | null

    if (!body?.pluginId) {
      return c.json({ ok: false, message: "pluginId 不能为空" }, 400)
    }

    const plugin = await installBundledDesktopPlugin(body.pluginId)
    return c.json({ ok: true, data: plugin }, 201)
  } catch (error) {
    return jsonError(error)
  }
})

desktopPlugins.delete("/:id", async (c) => {
  try {
    await uninstallDesktopPlugin(c.req.param("id"))
    return c.json({ ok: true, data: { id: c.req.param("id") } })
  } catch (error) {
    return jsonError(error)
  }
})

desktopPlugins.post("/:id/worker/invoke", async (c) => {
  try {
    const body = (await c.req.json().catch(() => null)) as
      | {
          method?: string
          payload?: unknown
        }
      | null

    if (!body?.method || typeof body.method !== "string") {
      return c.json({ ok: false, message: "method 不能为空" }, 400)
    }

    const result = await invokeDesktopPluginWorker(c.req.param("id"), body.method, body.payload)
    return c.json({ ok: true, data: { ok: true, result } })
  } catch (error) {
    return jsonError(error)
  }
})

desktopPlugins.post("/:id/network/request", async (c) => {
  try {
    const rawBody = await c.req.text()
    if (Buffer.byteLength(rawBody, "utf8") > 1024 * 1024) {
      throw new DesktopPluginError("插件网络请求超过 1 MiB", 400)
    }
    let body: unknown
    try {
      body = JSON.parse(rawBody)
    } catch {
      throw new DesktopPluginError("插件网络请求 JSON 无效", 400)
    }
    const plugin = await getInstalledPlugin(c.req.param("id"))
    const result = await proxyDesktopPluginNetworkRequest(plugin.manifest, body)
    return c.json({ ok: true, data: result })
  } catch (error) {
    return jsonError(error)
  }
})

desktopPlugins.get("/:id/runtime", async (c) => {
  try {
    const status = getDesktopPluginRuntimeStatus(c.req.param("id"))
    return c.json({ ok: true, data: status })
  } catch (error) {
    return jsonError(error)
  }
})

/**
 * SSE endpoint for runtime status changes. Pushes a JSON event whenever the
 * runtime phase or PID changes, eliminating the need for 3-second polling.
 * Falls back gracefully — clients that don't support SSE can still use the
 * regular GET /:id/runtime endpoint.
 */
desktopPlugins.get("/:id/runtime/events", async (c) => {
  const pluginId = c.req.param("id")
  try {
    // Validate plugin exists (throws 404 if not).
    getDesktopPluginRuntimeStatus(pluginId)
  } catch (error) {
    return jsonError(error)
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      let lastSignature = ""

      function sendStatus(): void {
        try {
          const status = getDesktopPluginRuntimeStatus(pluginId)
          const signature = JSON.stringify(status)
          if (signature !== lastSignature) {
            lastSignature = signature
            controller.enqueue(encoder.encode(`data: ${signature}\n\n`))
          }
        } catch {
          // Plugin may have been uninstalled — close the stream.
          clearInterval(timer)
          controller.close()
        }
      }

      // Send current status immediately.
      sendStatus()

      // Check for changes every 1 second (server-side poll, much cheaper
      // than client-side HTTP polling). Only pushes when something changes.
      const timer = setInterval(sendStatus, 1000)

      // Clean up when the client disconnects.
      c.req.raw.signal.addEventListener("abort", () => {
        clearInterval(timer)
        try { controller.close() } catch { /* already closed */ }
      })
    },
  })

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "connection": "keep-alive",
    },
  })
})

desktopPlugins.post("/:id/runtime/start", async (c) => {
  try {
    const status = await startDesktopPluginRuntime(c.req.param("id"))
    return c.json({ ok: true, data: status })
  } catch (error) {
    return jsonError(error)
  }
})

desktopPlugins.post("/:id/runtime/stop", async (c) => {
  try {
    const status = await stopDesktopPluginRuntime(c.req.param("id"))
    return c.json({ ok: true, data: status })
  } catch (error) {
    return jsonError(error)
  }
})

desktopPlugins.post("/:id/runtime/reload", async (c) => {
  try {
    const body = (await c.req.json().catch(() => null)) as
      | {
          scope?: string
        }
      | null

    const scope = body?.scope ?? "all"
    if (scope !== "ui" && scope !== "worker" && scope !== "all") {
      return c.json({ ok: false, message: "scope 必须是 ui、worker 或 all" }, 400)
    }

    let runtimeStatus = undefined
    if (scope === "worker" || scope === "all") {
      runtimeStatus = await restartDesktopPluginRuntime(c.req.param("id"))
    } else {
      runtimeStatus = getDesktopPluginRuntimeStatus(c.req.param("id"))
    }

    const reloadId = crypto.randomUUID()
    return c.json({ ok: true, data: { scope, runtimeStatus, reloadId } })
  } catch (error) {
    return jsonError(error)
  }
})

desktopPlugins.get("/:id/ui/*", async (c) => {
  try {
    const id = c.req.param("id")
    if (!id) {
      return c.json({ ok: false, message: "插件 id 不能为空" }, 400)
    }

    const rawPath = c.req.path.split(`/api/v1/desktop/plugins/${id}/ui/`)[1] ?? ""
    const asset = await readDesktopPluginUiAsset(
      id,
      rawPath
        .split("/")
        .map((part) => decodeURIComponent(part))
        .filter(Boolean)
    )

    // Support conditional requests — avoid re-transmitting unchanged assets.
    if (asset.etag) {
      const ifNoneMatch = c.req.header("if-none-match")
      if (ifNoneMatch && ifNoneMatch === asset.etag) {
        return new Response(null, {
          status: 304,
          headers: {
            etag: asset.etag,
            "cache-control": "max-age=3600, must-revalidate",
          },
        })
      }
    }

    if (asset.lastModified) {
      const ifModifiedSince = c.req.header("if-modified-since")
      if (ifModifiedSince && ifModifiedSince === asset.lastModified) {
        return new Response(null, {
          status: 304,
          headers: {
            "last-modified": asset.lastModified,
            "cache-control": "max-age=3600, must-revalidate",
          },
        })
      }
    }

    const headers: Record<string, string> = {
      "content-type": asset.contentType,
      "cache-control": "max-age=3600, must-revalidate",
      "x-content-type-options": "nosniff",
    }

    if (asset.etag) {
      headers["etag"] = asset.etag
    }
    if (asset.lastModified) {
      headers["last-modified"] = asset.lastModified
    }
    if (asset.contentSecurityPolicy) {
      headers["content-security-policy"] = asset.contentSecurityPolicy
    }

    return new Response(new Uint8Array(asset.bytes), { headers })
  } catch (error) {
    return jsonError(error)
  }
})

// ===== Plugin Storage endpoints =====
desktopPlugins.get("/:id/storage", async (c) => {
  try {
    const pluginId = c.req.param("id")
    const key = c.req.query("key")
    if (!key) {
      return c.json({ ok: false, message: "key query 参数不能为空" }, 400)
    }
    const value = await getPluginStorage(pluginId, key)
    return c.json({ ok: true, data: value })
  } catch (error) {
    return jsonError(error)
  }
})

desktopPlugins.get("/:id/storage/keys", async (c) => {
  try {
    const pluginId = c.req.param("id")
    const keys = await listPluginStorageKeys(pluginId)
    return c.json({ ok: true, data: keys })
  } catch (error) {
    return jsonError(error)
  }
})

desktopPlugins.put("/:id/storage", async (c) => {
  try {
    const pluginId = c.req.param("id")
    const body = (await c.req.json().catch(() => null)) as
      | {
          key?: string
          value?: unknown
        }
      | null

    if (!body?.key || typeof body.key !== "string") {
      return c.json({ ok: false, message: "key 必须是非空字符串" }, 400)
    }

    await setPluginStorage(pluginId, body.key, body.value)
    return c.json({ ok: true, data: { pluginId, key: body.key } })
  } catch (error) {
    return jsonError(error)
  }
})

desktopPlugins.delete("/:id/storage", async (c) => {
  try {
    const pluginId = c.req.param("id")
    const key = c.req.query("key")
    if (!key) {
      // No key means clear all storage
      await clearPluginStorage(pluginId)
      return c.json({ ok: true, data: { pluginId, cleared: true } })
    }
    // With key means delete single key
    await removePluginStorage(pluginId, key)
    return c.json({ ok: true, data: { pluginId, key } })
  } catch (error) {
    return jsonError(error)
  }
})

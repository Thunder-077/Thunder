import { Hono } from "hono"
import {
  DesktopPluginError,
  fetchDesktopPluginMarketplace,
  getDesktopPluginRuntimeStatus,
  getInstalledPlugin,
  installBundledDesktopPlugin,
  installPackagedPlugin,
  isDesktopPluginRuntimeEnabled,
  listInstalledDesktopPlugins,
  readDesktopPluginUiAsset,
  startDesktopPluginRuntime,
  uninstallDesktopPlugin,
  invokeDesktopPluginWorker,
} from "./desktop-plugin-manager"
import {
  proxyDesktopPluginNetworkRequest,
} from "./desktop-plugin-network"

export const desktopPlugins = new Hono()

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
        }
      | null

    if (!body?.pluginPath) {
      return new Response(JSON.stringify({ ok: false, message: "pluginPath 不能为空" }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
      })
    }

    const plugin = await installPackagedPlugin({
      pluginPath: body.pluginPath,
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
      return new Response(JSON.stringify({ ok: false, message: "pluginId 不能为空" }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
      })
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
      return new Response(JSON.stringify({ ok: false, message: "method 不能为空" }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
      })
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

desktopPlugins.post("/:id/runtime/start", async (c) => {
  try {
    const status = await startDesktopPluginRuntime(c.req.param("id"))
    return c.json({ ok: true, data: status })
  } catch (error) {
    return jsonError(error)
  }
})

desktopPlugins.get("/:id/ui/*", async (c) => {
  try {
    const id = c.req.param("id")
    if (!id) {
      return new Response(JSON.stringify({ ok: false, message: "插件 id 不能为空" }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
      })
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

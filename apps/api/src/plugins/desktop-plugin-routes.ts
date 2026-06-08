import { Hono } from "hono"
import {
  DesktopPluginError,
  fetchDesktopPluginMarketplace,
  getDesktopPluginRuntimeStatus,
  getInstalledPluginV2,
  installBundledDesktopPlugin,
  installPackagedPluginV2,
  isDesktopPluginRuntimeEnabled,
  listInstalledDesktopPluginsV2,
  readDesktopPluginUiAsset,
  startDesktopPluginRuntime,
  uninstallDesktopPlugin,
  invokeDesktopPluginWorker,
} from "./desktop-plugin-manager"

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
  const plugins = await listInstalledDesktopPluginsV2()
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
    const plugin = await getInstalledPluginV2(c.req.param("id"))
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

    const plugin = await installPackagedPluginV2({
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

    return new Response(new Uint8Array(asset.bytes), {
      headers: {
        "content-type": asset.contentType,
        "cache-control": "no-store, max-age=0",
        pragma: "no-cache",
        expires: "0",
        "content-security-policy": asset.contentSecurityPolicy ?? "",
        "x-content-type-options": "nosniff",
      },
    })
  } catch (error) {
    return jsonError(error)
  }
})

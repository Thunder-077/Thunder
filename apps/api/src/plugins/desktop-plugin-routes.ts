import { Hono, type Context } from "hono"
import {
  DesktopPluginError,
  fetchDesktopPluginMarketplace,
  getDesktopPluginRuntimeStatus,
  getInstalledDesktopPlugin,
  installLocalDesktopPlugin,
  installBundledDesktopPlugin,
  installPackagedDesktopPlugin,
  isDesktopPluginRuntimeEnabled,
  listInstalledDesktopPlugins,
  readDesktopPluginAsset,
  resolveDesktopPluginApiProxyTarget,
  rollbackDesktopPlugin,
  runDesktopPluginMigrations,
  startDesktopPluginRuntime,
  stopDesktopPluginRuntime,
  trustDesktopPlugin,
  untrustDesktopPlugin,
  uninstallDesktopPlugin,
} from "./desktop-plugin-manager"

export const desktopPlugins = new Hono()

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
    const plugin = await getInstalledDesktopPlugin(c.req.param("id"))
    return c.json({ ok: true, data: plugin })
  } catch (error) {
    return jsonError(error)
  }
})

desktopPlugins.post("/install/local", async (c) => {
  try {
    const body = (await c.req.json().catch(() => null)) as
      | {
          sourcePath?: string
          expectedSha256?: string
          signature?: {
            keyId: string
            algorithm: "ed25519"
            signature: string
          }
        }
      | null

    if (!body?.sourcePath) {
      return new Response(JSON.stringify({ ok: false, message: "sourcePath 不能为空" }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
      })
    }

    const plugin = await installLocalDesktopPlugin({
      sourcePath: body.sourcePath,
      expectedSha256: body.expectedSha256,
      signature: body.signature,
    })
    return c.json({ ok: true, data: plugin }, 201)
  } catch (error) {
    return jsonError(error)
  }
})

desktopPlugins.post("/install/package", async (c) => {
  try {
    const body = (await c.req.json().catch(() => null)) as
      | {
          packageUrl?: string
          packageSha256?: string
          signature?: {
            keyId: string
            algorithm: "ed25519"
            signature: string
          }
        }
      | null

    if (!body?.packageUrl || !body.packageSha256 || !body.signature) {
      return new Response(JSON.stringify({ ok: false, message: "packageUrl、packageSha256 和 signature 不能为空" }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
      })
    }

    const plugin = await installPackagedDesktopPlugin({
      packageUrl: body.packageUrl,
      packageSha256: body.packageSha256,
      signature: body.signature,
    })
    return c.json({ ok: true, data: plugin }, 201)
  } catch (error) {
    return jsonError(error)
  }
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

desktopPlugins.post("/:id/rollback", async (c) => {
  try {
    const plugin = await rollbackDesktopPlugin(c.req.param("id"))
    return c.json({ ok: true, data: plugin })
  } catch (error) {
    return jsonError(error)
  }
})

desktopPlugins.post("/:id/trust", async (c) => {
  try {
    const plugin = await trustDesktopPlugin(c.req.param("id"))
    return c.json({ ok: true, data: plugin })
  } catch (error) {
    return jsonError(error)
  }
})

desktopPlugins.post("/:id/untrust", async (c) => {
  try {
    const plugin = await untrustDesktopPlugin(c.req.param("id"))
    return c.json({ ok: true, data: plugin })
  } catch (error) {
    return jsonError(error)
  }
})

desktopPlugins.post("/:id/migrations/run", async (c) => {
  try {
    const result = await runDesktopPluginMigrations(c.req.param("id"))
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

desktopPlugins.post("/:id/runtime/stop", async (c) => {
  try {
    const status = await stopDesktopPluginRuntime(c.req.param("id"))
    return c.json({ ok: true, data: status })
  } catch (error) {
    return jsonError(error)
  }
})

desktopPlugins.get("/:id/web/*", async (c) => {
  try {
    const id = c.req.param("id")
    if (!id) {
      return new Response(JSON.stringify({ ok: false, message: "插件 id 不能为空" }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
      })
    }
    const rawPath = c.req.path.split(`/api/v1/desktop/plugins/${id}/web/`)[1] ?? ""
    const asset = await readDesktopPluginAsset(
      id,
      rawPath
        .split("/")
        .map((part) => decodeURIComponent(part))
        .filter(Boolean)
    )

    return new Response(new Uint8Array(asset.bytes), {
      headers: {
        "content-type": asset.contentType,
        "content-security-policy": asset.contentSecurityPolicy ?? "",
        "x-content-type-options": "nosniff",
      },
    })
  } catch (error) {
    return jsonError(error)
  }
})

async function handlePluginApiProxy(c: Context) {
  try {
    const id = c.req.param("id")
    if (!id) {
      return new Response(JSON.stringify({ ok: false, message: "插件 id 不能为空" }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
      })
    }
    const rawPath = c.req.path.split(`/api/v1/desktop/plugins/${id}/api/`)[1] ?? ""
    const target = await resolveDesktopPluginApiProxyTarget(
      id,
      rawPath
        .split("/")
        .map((part) => decodeURIComponent(part))
        .filter(Boolean),
      new URL(c.req.url).search
    )

    const method = c.req.method.toUpperCase()
    const headers = new Headers(c.req.raw.headers)
    headers.delete("host")
    headers.set("x-thunder-plugin-id", id)

    const body = method === "GET" || method === "HEAD" ? undefined : c.req.raw.body
    const upstream = await fetch(target.url, {
      method,
      headers,
      body,
      ...(body ? { duplex: "half" as const } : {}),
      redirect: "manual",
    })

    const responseHeaders = new Headers(upstream.headers)
    responseHeaders.delete("transfer-encoding")
    responseHeaders.delete("connection")
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    })
  } catch (error) {
    return jsonError(error)
  }
}

desktopPlugins.on(["GET", "POST", "PUT", "PATCH", "DELETE"], "/:id/api/*", handlePluginApiProxy)

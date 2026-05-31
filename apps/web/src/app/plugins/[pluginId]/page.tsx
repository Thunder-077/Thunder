"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { AlertTriangle, ShieldCheck } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  getDesktopPlugin,
  shouldLoadDesktopPlugins,
  startDesktopPluginRuntime,
  type InstalledDesktopPlugin,
} from "@/lib/desktop-plugins"

const PLUGIN_BRIDGE_REQUEST_SOURCE = "thunder-plugin"
const PLUGIN_BRIDGE_VERSION = 1
const ALLOWED_RUNTIME_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"])

type PluginBridgeRequest = {
  source?: string
  version?: number
  id?: string
  method?: string
  params?: unknown
}

type RuntimeRequestParams = {
  path?: string
  method?: string
  headers?: Record<string, string>
  body?: unknown
  cache?: RequestCache
}

function normalizeRuntimeRequestPath(path: string | undefined): string {
  const rawPath = path?.trim()
  if (!rawPath || rawPath.startsWith("/") || rawPath.startsWith("\\")) {
    throw new Error("插件 runtime 请求路径无效")
  }

  const pathOnly = rawPath.split(/[?#]/, 1)[0]
  const segments = pathOnly.split("/")
  for (const segment of segments) {
    if (!segment || segment.includes("\\")) {
      throw new Error("插件 runtime 请求路径无效")
    }

    let decodedSegment = segment
    try {
      decodedSegment = decodeURIComponent(segment)
    } catch {
      throw new Error("插件 runtime 请求路径无效")
    }

    if (decodedSegment === "." || decodedSegment === ".." || decodedSegment.includes("/") || decodedSegment.includes("\\")) {
      throw new Error("插件 runtime 请求路径无效")
    }
  }

  return rawPath
}

function sanitizeRuntimeRequestHeaders(headers: Record<string, string> | undefined): Headers {
  const sanitized = new Headers()
  for (const [name, value] of Object.entries(headers ?? {})) {
    const normalizedName = name.trim().toLowerCase()
    if (!normalizedName || ["authorization", "cookie", "host"].includes(normalizedName)) {
      continue
    }
    sanitized.set(normalizedName, value)
  }
  return sanitized
}

export default function DesktopPluginPage() {
  const params = useParams<{ pluginId: string }>()
  const pluginId = params.pluginId
  const desktopEnabled = shouldLoadDesktopPlugins()
  const [plugin, setPlugin] = useState<InstalledDesktopPlugin | null>(null)
  const [error, setError] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  const postBridgeResponse = useCallback((id: string, ok: boolean, data?: unknown, bridgeError?: string) => {
    iframeRef.current?.contentWindow?.postMessage(
      {
        source: "thunder-host",
        version: PLUGIN_BRIDGE_VERSION,
        id,
        ok,
        data,
        error: bridgeError,
      },
      "*"
    )
  }, [])

  useEffect(() => {
    if (!desktopEnabled) {
      return
    }

    let cancelled = false
    getDesktopPlugin(pluginId)
      .then(async (result) => {
        if (result.manifest.api?.runtime) {
          await startDesktopPluginRuntime(result.manifest.id)
        }
        if (!cancelled) setPlugin(result)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "插件加载失败")
      })

    return () => {
      cancelled = true
    }
  }, [desktopEnabled, pluginId])

  useEffect(() => {
    if (!plugin) return
    const currentPlugin = plugin

    async function handleBridgeMessage(event: MessageEvent) {
      const request = event.data as PluginBridgeRequest | null

      if (
        event.origin !== "null" ||
        event.source !== iframeRef.current?.contentWindow ||
        !request ||
        request.source !== PLUGIN_BRIDGE_REQUEST_SOURCE ||
        request.version !== PLUGIN_BRIDGE_VERSION ||
        typeof request.id !== "string" ||
        typeof request.method !== "string"
      ) {
        return
      }

      try {
        if (request.method === "plugin.getManifest") {
          postBridgeResponse(request.id, true, currentPlugin.manifest)
          return
        }

        if (request.method === "runtime.request") {
          if (!currentPlugin.manifest.permissions.includes("local-api-proxy")) {
            throw new Error("插件未声明 local-api-proxy 权限")
          }

          const params = request.params as RuntimeRequestParams | null
          const rawPath = normalizeRuntimeRequestPath(params?.path)
          const method = (params?.method ?? "GET").toUpperCase()
          if (!ALLOWED_RUNTIME_METHODS.has(method)) {
            throw new Error("插件 runtime 请求方法无效")
          }

          const hasBody = method !== "GET" && params && "body" in params
          const response = await fetch(
            `/api/v1/desktop/plugins/${encodeURIComponent(currentPlugin.manifest.id)}/api/${rawPath}`,
            {
              method,
              headers: sanitizeRuntimeRequestHeaders(params?.headers),
              body: hasBody ? JSON.stringify(params.body) : undefined,
              cache: params?.cache ?? "no-store",
              credentials: "omit",
            }
          )

          const contentType = response.headers.get("content-type") ?? ""
          const data = contentType.includes("application/json") ? await response.json() : await response.text()
          postBridgeResponse(request.id, true, {
            status: response.status,
            ok: response.ok,
            headers: Object.fromEntries(response.headers.entries()),
            data,
          })
          return
        }

        throw new Error(`未知插件 Host API: ${request.method}`)
      } catch (err) {
        postBridgeResponse(request.id, false, undefined, err instanceof Error ? err.message : "插件 Host API 调用失败")
      }
    }

    window.addEventListener("message", handleBridgeMessage)
    return () => window.removeEventListener("message", handleBridgeMessage)
  }, [plugin, postBridgeResponse])

  if (!desktopEnabled) {
    return (
      <div>
        <PageHeader title="插件不可用" />
        <Card>
          <CardContent className="flex items-start gap-3 p-5 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <span>插件系统仅在桌面端启用</span>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <PageHeader title="插件不可用" />
        <Card>
          <CardContent className="flex items-start gap-3 p-5 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <span>{error}</span>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!plugin) {
    return (
      <div>
        <PageHeader title="插件" />
        <div className="h-[calc(100vh-10rem)] rounded-md border border-border/70 bg-muted/20" />
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-0 flex-col">
      <PageHeader title={plugin.manifest.name} />
      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary">v{plugin.manifest.version}</Badge>
        <span>{plugin.manifest.author.name}</span>
        <span className="inline-flex items-center gap-1">
          <ShieldCheck className="h-3.5 w-3.5" />
          沙箱插件
        </span>
      </div>
      <iframe
        ref={iframeRef}
        title={plugin.manifest.name}
        src={plugin.webEntryUrl}
        allow="microphone"
        sandbox="allow-forms allow-modals allow-popups allow-scripts"
        referrerPolicy="no-referrer"
        className="min-h-0 flex-1 rounded-md border border-border/70 bg-background"
      />
    </div>
  )
}

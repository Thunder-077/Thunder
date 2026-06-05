"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { AlertTriangle } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { useTheme } from "@/components/theme-provider"
import {
  type LayoutRequestParams,
  PLUGIN_BRIDGE_REQUEST_SOURCE,
  PLUGIN_BRIDGE_VERSION,
  clearPluginStorage,
  createIsolatedPluginFrameUrl,
  ensurePluginPermission,
  getRequiredPluginPermissionForBridgeMethod,
  getPluginStorageValue,
  isAllowedPluginBridgeOrigin,
  isPluginFrameOriginIsolated,
  listPluginStorageKeys,
  normalizePluginFrameHeight,
  normalizeRuntimeRequestMethod,
  normalizeRuntimeRequestPath,
  normalizeStorageKey,
  removePluginStorageValue,
  sanitizeNetworkRequestParams,
  sanitizeRuntimeRequestHeaders,
  setPluginStorageValue,
  type NetworkRequestParams,
  type PluginBridgeRequest,
  type RuntimeRequestParams,
  type StorageRequestParams,
} from "@/lib/desktop-plugin-bridge"
import {
  getDesktopPlugin,
  getDesktopPluginEntryUrl,
  isInstalledDesktopPluginV2,
  shouldLoadDesktopPlugins,
  startDesktopPluginRuntime,
  invokeDesktopPluginWorker,
  type DesktopInstalledPlugin,
} from "@/lib/desktop-plugins"
import { notificationStore } from "@/lib/notification-store"
import { ActivityClient } from "@thunder/api-client"
import { getRequiredPermissionForRpcMethod } from "@/lib/plugin-v2-bridge"

export default function DesktopPluginPage() {
  const params = useParams<{ pluginId: string }>()
  const pluginId = params.pluginId
  const desktopEnabled = shouldLoadDesktopPlugins()
  const [plugin, setPlugin] = useState<DesktopInstalledPlugin | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hostOrigin] = useState<string | null>(() => (typeof window === "undefined" ? null : window.location.origin))
  const [frameHeight, setFrameHeight] = useState(960)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const { resolvedTheme } = useTheme()

  const postBridgeResponse = useCallback(
    (targetOrigin: string, id: string, ok: boolean, data?: unknown, bridgeError?: string) => {
      iframeRef.current?.contentWindow?.postMessage(
        {
          source: "thunder-host",
          version: PLUGIN_BRIDGE_VERSION,
          id,
          ok,
          data,
          error: bridgeError,
        },
        targetOrigin
      )
    },
    []
  )

  useEffect(() => {
    if (!desktopEnabled) {
      return
    }

    let cancelled = false
    getDesktopPlugin(pluginId)
      .then(async (result) => {
        if (!isInstalledDesktopPluginV2(result) && result.manifest.api?.runtime) {
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

  // Record plugin.opened activity
  useEffect(() => {
    if (!plugin) return
    const activityClient = new ActivityClient()
    activityClient
      .recordActivity({
        module: `plugin:${pluginId}`,
        action: "plugin.opened",
        title: `打开了${plugin.manifest.name}`,
      })
      .catch((e) => {
        console.error("[plugin-activity] Failed to record plugin.opened", e)
      })
  }, [plugin, pluginId])

  // Push theme changes to the plugin iframe
  useEffect(() => {
    if (!plugin || !hostOrigin) return
    const entryUrl = getDesktopPluginEntryUrl(plugin)
    if (!entryUrl) return
    const frameUrl = createIsolatedPluginFrameUrl(entryUrl, hostOrigin)
    const frameOrigin = new URL(frameUrl).origin
    iframeRef.current?.contentWindow?.postMessage(
      { source: "thunder-host", type: "theme.change", theme: resolvedTheme },
      frameOrigin
    )
  }, [hostOrigin, plugin, resolvedTheme])

  useEffect(() => {
    if (!plugin || !hostOrigin) return
    const currentPlugin = plugin
    const entryUrl = getDesktopPluginEntryUrl(currentPlugin)
    if (!entryUrl) return
    const frameUrl = createIsolatedPluginFrameUrl(entryUrl, hostOrigin)
    const frameOrigin = new URL(frameUrl).origin

    async function handleBridgeMessage(event: MessageEvent) {
      const request = event.data as PluginBridgeRequest | null

      if (
        !isAllowedPluginBridgeOrigin(event.origin, frameUrl) ||
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
        if (isInstalledDesktopPluginV2(currentPlugin)) {
          const requiredPermission = getRequiredPermissionForRpcMethod(request.method)
          if (requiredPermission && !currentPlugin.manifest.permissions.includes(requiredPermission)) {
            throw new Error(`插件未声明 ${requiredPermission} 权限`)
          }
        } else {
          const requiredPermission = getRequiredPluginPermissionForBridgeMethod(request.method)
          if (requiredPermission) {
            ensurePluginPermission(currentPlugin.manifest.permissions, requiredPermission)
          }
        }

        if (request.method === "plugin.getManifest") {
          postBridgeResponse(frameOrigin, request.id, true, currentPlugin.manifest)
          return
        }

        if (request.method === "layout.setFrameHeight") {
          const params = request.params as LayoutRequestParams | null
          setFrameHeight(normalizePluginFrameHeight(params?.height))
          return
        }

        if (request.method === "runtime.request") {
          if (isInstalledDesktopPluginV2(currentPlugin)) {
            throw new Error("manifest v2 插件不支持 runtime.request，请改用 worker.invoke")
          }
          const params = request.params as RuntimeRequestParams | null
          const rawPath = normalizeRuntimeRequestPath(params?.path)
          const method = normalizeRuntimeRequestMethod(params?.method)
          const headers = sanitizeRuntimeRequestHeaders(params?.headers)
          const hasBody =
            method !== "GET" &&
            method !== "HEAD" &&
            params !== null &&
            typeof params === "object" &&
            Object.prototype.hasOwnProperty.call(params, "body")

          // Keep empty POSTs body-less so plugin runtimes do not try to parse a fake JSON payload.
          if (!hasBody) {
            headers.delete("content-type")
          }

          const response = await fetch(
            `/api/v1/desktop/plugins/${encodeURIComponent(currentPlugin.manifest.id)}/api/${rawPath}`,
            {
              method,
              headers,
              body: hasBody ? JSON.stringify(params.body) : undefined,
              cache: params?.cache ?? "no-store",
              // Runtime requests are issued by the host page, so they must carry the
              // current session cookie or middleware will reject them as anonymous.
              credentials: "same-origin",
            }
          )

          const contentType = response.headers.get("content-type") ?? ""
          const data = contentType.includes("application/json") ? await response.json() : await response.text()
          postBridgeResponse(frameOrigin, request.id, true, {
            status: response.status,
            ok: response.ok,
            headers: Object.fromEntries(response.headers.entries()),
            data,
          })
          return
        }

        if (request.method === "network.request") {
          const response = await fetch(`/api/v1/desktop/plugins/${encodeURIComponent(currentPlugin.manifest.id)}/network`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify(sanitizeNetworkRequestParams(request.params as NetworkRequestParams | null)),
            cache: "no-store",
            credentials: "same-origin",
          })
          const payload = (await response.json()) as {
            ok?: boolean
            data?: unknown
            message?: string
          }
          if (!response.ok || !payload.ok) {
            throw new Error(payload.message || "插件网络代理请求失败")
          }
          postBridgeResponse(frameOrigin, request.id, true, payload.data)
          return
        }

        if (request.method === "worker.invoke") {
          if (!isInstalledDesktopPluginV2(currentPlugin)) {
            throw new Error("仅 manifest v2 插件支持 worker.invoke")
          }

          const params = request.params as {
            method?: string
            payload?: unknown
          } | null

          if (!params?.method || typeof params.method !== "string") {
            throw new Error("worker.invoke 缺少 method")
          }

          const result = await invokeDesktopPluginWorker(currentPlugin.manifest.id, params.method, params.payload)
          postBridgeResponse(frameOrigin, request.id, true, {
            ok: true,
            result,
          })
          return
        }

        if (request.method === "notification.add" || request.method === "notifications.show") {
          const params = request.params as {
            type?: "info" | "success" | "error"
            title?: string
            description?: string
          } | null
          notificationStore.addNotification({
            type: params?.type === "success" || params?.type === "error" ? params.type : "info",
            title: params?.title?.trim() || currentPlugin.manifest.name,
            description: params?.description?.trim() || "",
          })
          return
        }

        if (request.method === "storage.get") {
          const params = request.params as StorageRequestParams | null
          const key = normalizeStorageKey(params?.key)
          postBridgeResponse(
            frameOrigin,
            request.id,
            true,
            getPluginStorageValue(window.localStorage, currentPlugin.manifest.id, key)
          )
          return
        }

        if (request.method === "storage.set") {
          const params = request.params as StorageRequestParams | null
          const key = normalizeStorageKey(params?.key)
          setPluginStorageValue(window.localStorage, currentPlugin.manifest.id, key, params?.value)
          postBridgeResponse(frameOrigin, request.id, true)
          return
        }

        if (request.method === "storage.remove") {
          const params = request.params as StorageRequestParams | null
          const key = normalizeStorageKey(params?.key)
          removePluginStorageValue(window.localStorage, currentPlugin.manifest.id, key)
          postBridgeResponse(frameOrigin, request.id, true)
          return
        }

        if (request.method === "storage.keys") {
          postBridgeResponse(frameOrigin, request.id, true, listPluginStorageKeys(window.localStorage, currentPlugin.manifest.id))
          return
        }

        if (request.method === "storage.clear") {
          clearPluginStorage(window.localStorage, currentPlugin.manifest.id)
          postBridgeResponse(frameOrigin, request.id, true)
          return
        }

        if (request.method === "activity.track" || request.method === "activity.record") {
          const params = request.params as {
            action?: string
            title?: string
            description?: string
            metadata?: Record<string, unknown>
          } | null
          const activityClient = new ActivityClient()
          await activityClient.recordActivity({
            module: `plugin:${currentPlugin.manifest.id}`,
            action: params?.action ?? "",
            title: params?.title ?? "",
            description: params?.description,
            metadataJson: params?.metadata ? JSON.stringify(params.metadata) : undefined,
          })
          postBridgeResponse(frameOrigin, request.id, true)
          return
        }

        throw new Error(`未知插件 Host API: ${request.method}`)
      } catch (err) {
        postBridgeResponse(
          frameOrigin,
          request.id,
          false,
          undefined,
          err instanceof Error ? err.message : "插件 Host API 调用失败"
        )
      }
    }

    window.addEventListener("message", handleBridgeMessage)
    return () => window.removeEventListener("message", handleBridgeMessage)
  }, [hostOrigin, plugin, postBridgeResponse])

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

  if (!plugin || !hostOrigin) {
    return <div className="h-[calc(100vh-4rem)] min-h-0 overflow-hidden rounded-md bg-muted/20" />
  }

  const entryUrl = getDesktopPluginEntryUrl(plugin)
  if (!entryUrl) {
    return (
      <div>
        <PageHeader title={plugin.manifest.name} />
        <Card>
          <CardContent className="flex items-start gap-3 p-5 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <span>插件未声明可加载的 UI 入口</span>
          </CardContent>
        </Card>
      </div>
    )
  }

  const frameUrl = createIsolatedPluginFrameUrl(entryUrl, hostOrigin)
  const frameSandbox = isPluginFrameOriginIsolated(frameUrl, hostOrigin)
    ? "allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
    : "allow-forms allow-modals allow-popups allow-scripts"

  return (
    <div className="min-h-0">
      <iframe
        ref={iframeRef}
        title={plugin.manifest.name}
        src={frameUrl}
        allow="microphone; fullscreen"
        allowFullScreen
        sandbox={frameSandbox}
        referrerPolicy="no-referrer"
        className="block w-full border-0 bg-transparent"
        style={{ height: `${frameHeight}px` }}
      />
    </div>
  )
}

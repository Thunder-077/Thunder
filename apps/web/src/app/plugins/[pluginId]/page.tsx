"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { AlertTriangle } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { useTheme } from "@/components/theme-provider"
import {
  PLUGIN_BRIDGE_REQUEST_SOURCE,
  PLUGIN_BRIDGE_VERSION,
  clearPluginStorage,
  createIsolatedPluginFrameUrl,
  getRequiredPluginPermissionForBridgeMethod,
  getPluginStorageValue,
  isAllowedPluginBridgeOrigin,
  isPluginFrameOriginIsolated,
  listPluginStorageKeys,
  normalizePluginFrameHeight,
  normalizeStorageKey,
  removePluginStorageValue,
  setPluginStorageValue,
  type PluginBridgeRequest,
  type StorageRequestParams,
} from "@/lib/desktop-plugin-bridge"
import {
  getDesktopPluginRuntimeStatus,
  getDesktopPlugin,
  getDesktopPluginEntryUrl,
  shouldLoadDesktopPlugins,
  invokeDesktopPluginWorker,
  type DesktopInstalledPlugin,
} from "@/lib/desktop-plugins"
import { notificationStore } from "@/lib/notification-store"
import { ActivityClient } from "@thunder/api-client"
import type { PluginLogEntry, PluginRpcLogEntry, PluginWorkerStatus } from "@thunder/plugin-devtools"

export default function DesktopPluginPage() {
  const params = useParams<{ pluginId: string }>()
  const pluginId = params.pluginId
  const desktopEnabled = shouldLoadDesktopPlugins()
  const [plugin, setPlugin] = useState<DesktopInstalledPlugin | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hostOrigin] = useState<string | null>(() => (typeof window === "undefined" ? null : window.location.origin))
  const [frameHeight, setFrameHeight] = useState(960)
  const [workerStatus, setWorkerStatus] = useState<PluginWorkerStatus>({ running: false })
  const [rpcCalls, setRpcCalls] = useState<PluginRpcLogEntry[]>([])
  const [devLogs, setDevLogs] = useState<PluginLogEntry[]>([])
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const previousWorkerStatusRef = useRef<string | null>(null)
  const { resolvedTheme } = useTheme()

  const appendLog = useCallback((level: PluginLogEntry["level"], message: string) => {
    setDevLogs((previous) => [
      {
        id: crypto.randomUUID(),
        level,
        message,
        at: new Date().toISOString(),
      },
      ...previous,
    ].slice(0, 100))
  }, [])

  const appendRpcCall = useCallback((entry: Omit<PluginRpcLogEntry, "id" | "at">) => {
    setRpcCalls((previous) => [
      {
        ...entry,
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
      },
      ...previous,
    ].slice(0, 100))
  }, [])

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

  const refreshWorkerStatus = useCallback(async () => {
    if (!plugin) {
      setWorkerStatus({ running: false })
      return
    }

    try {
      const runtimeStatus = await getDesktopPluginRuntimeStatus(plugin.manifest.id)
      setWorkerStatus({
        running: runtimeStatus.running,
        endpoint: runtimeStatus.endpoint,
        lastError: runtimeStatus.lastError,
      })
    } catch (runtimeError) {
      setWorkerStatus({
        running: false,
        lastError: runtimeError instanceof Error ? runtimeError.message : "运行时状态读取失败",
      })
    }
  }, [plugin])

  useEffect(() => {
    if (!desktopEnabled) {
      return
    }

    let cancelled = false
    getDesktopPlugin(pluginId)
      .then((result) => {
        if (!cancelled) setPlugin(result)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "插件加载失败")
          appendLog("error", err instanceof Error ? err.message : "插件加载失败")
        }
      })

    return () => {
      cancelled = true
    }
  }, [appendLog, desktopEnabled, pluginId])

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
    void refreshWorkerStatus()
  }, [refreshWorkerStatus])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshWorkerStatus()
    }, 3000)

    return () => window.clearInterval(timer)
  }, [refreshWorkerStatus])

  useEffect(() => {
    const nextSignature = JSON.stringify(workerStatus)
    if (previousWorkerStatusRef.current === null) {
      previousWorkerStatusRef.current = nextSignature
      return
    }

    if (previousWorkerStatusRef.current !== nextSignature) {
      previousWorkerStatusRef.current = nextSignature
      appendLog(
        workerStatus.running ? "info" : "warn",
        workerStatus.running
          ? `worker 已连接${workerStatus.endpoint ? `: ${workerStatus.endpoint}` : ""}`
          : `worker 未运行${workerStatus.lastError ? `: ${workerStatus.lastError}` : ""}`,
      )
    }
  }, [appendLog, workerStatus])

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
        const startedAt = performance.now()
        const requiredPermission = getRequiredPluginPermissionForBridgeMethod(request.method)
        if (requiredPermission && !currentPlugin.manifest.permissions.includes(requiredPermission)) {
          throw new Error(`插件未声明 ${requiredPermission} 权限`)
        }

        if (request.method === "plugin.getManifest") {
          postBridgeResponse(frameOrigin, request.id, true, currentPlugin.manifest)
          appendRpcCall({
            method: request.method,
            status: "ok",
            durationMs: Math.round(performance.now() - startedAt),
            payload: request.params,
            result: currentPlugin.manifest,
          })
          return
        }

        if (request.method === "layout.setFrameHeight") {
          const params = request.params as { height?: number } | null
          setFrameHeight(normalizePluginFrameHeight(params?.height))
          appendRpcCall({
            method: request.method,
            status: "ok",
            durationMs: Math.round(performance.now() - startedAt),
            payload: request.params,
          })
          return
        }

        if (request.method === "worker.invoke") {
          const params = request.params as {
            method?: string
            payload?: unknown
          } | null

          if (!params?.method || typeof params.method !== "string") {
            throw new Error("worker.invoke 缺少 method")
          }

          const result = await invokeDesktopPluginWorker(currentPlugin.manifest.id, params.method, params.payload)
          await refreshWorkerStatus()
          postBridgeResponse(frameOrigin, request.id, true, {
            ok: true,
            result,
          })
          appendRpcCall({
            method: `${request.method}:${params.method}`,
            status: "ok",
            durationMs: Math.round(performance.now() - startedAt),
            payload: params.payload,
            result,
          })
          return
        }

        if (request.method === "notification.add") {
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
          appendRpcCall({
            method: request.method,
            status: "ok",
            durationMs: Math.round(performance.now() - startedAt),
            payload: request.params,
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
          appendRpcCall({
            method: request.method,
            status: "ok",
            durationMs: Math.round(performance.now() - startedAt),
            payload: request.params,
            result: getPluginStorageValue(window.localStorage, currentPlugin.manifest.id, key),
          })
          return
        }

        if (request.method === "storage.set") {
          const params = request.params as StorageRequestParams | null
          const key = normalizeStorageKey(params?.key)
          setPluginStorageValue(window.localStorage, currentPlugin.manifest.id, key, params?.value)
          postBridgeResponse(frameOrigin, request.id, true)
          appendRpcCall({
            method: request.method,
            status: "ok",
            durationMs: Math.round(performance.now() - startedAt),
            payload: request.params,
          })
          return
        }

        if (request.method === "storage.remove") {
          const params = request.params as StorageRequestParams | null
          const key = normalizeStorageKey(params?.key)
          removePluginStorageValue(window.localStorage, currentPlugin.manifest.id, key)
          postBridgeResponse(frameOrigin, request.id, true)
          appendRpcCall({
            method: request.method,
            status: "ok",
            durationMs: Math.round(performance.now() - startedAt),
            payload: request.params,
          })
          return
        }

        if (request.method === "storage.keys") {
          const keys = listPluginStorageKeys(window.localStorage, currentPlugin.manifest.id)
          postBridgeResponse(frameOrigin, request.id, true, keys)
          appendRpcCall({
            method: request.method,
            status: "ok",
            durationMs: Math.round(performance.now() - startedAt),
            result: keys,
          })
          return
        }

        if (request.method === "storage.clear") {
          clearPluginStorage(window.localStorage, currentPlugin.manifest.id)
          postBridgeResponse(frameOrigin, request.id, true)
          appendRpcCall({
            method: request.method,
            status: "ok",
            durationMs: Math.round(performance.now() - startedAt),
          })
          return
        }

        if (request.method === "activity.track") {
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
          appendRpcCall({
            method: request.method,
            status: "ok",
            durationMs: Math.round(performance.now() - startedAt),
            payload: request.params,
          })
          return
        }

        throw new Error(`未知插件 Host API: ${request.method}`)
      } catch (err) {
        appendRpcCall({
          method: request.method,
          status: "error",
          durationMs: 0,
          payload: request.params,
          errorMessage: err instanceof Error ? err.message : "插件 Host API 调用失败",
        })
        appendLog("error", err instanceof Error ? err.message : "插件 Host API 调用失败")
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
  }, [appendLog, appendRpcCall, hostOrigin, plugin, postBridgeResponse, refreshWorkerStatus])

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
        onLoad={() => appendLog("info", "插件 iframe 已加载")}
        allow="microphone; fullscreen"
        sandbox={frameSandbox}
        referrerPolicy="no-referrer"
        className="block w-full border-0 bg-transparent"
        style={{ height: `${frameHeight}px` }}
      />
    </div>
  )
}

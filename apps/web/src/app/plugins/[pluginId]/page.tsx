"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { AlertTriangle } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { useTheme } from "@/components/theme-provider"
import {
  clearPluginStorage,
  createIsolatedPluginFrameUrl,
  getPluginStorageValue,
  isAllowedPluginBridgeOrigin,
  isPluginFrameOriginIsolated,
  listPluginStorageKeys,
  removePluginStorageValue,
  setPluginStorageValue,
  type PluginBridgeRequest,
} from "@/lib/desktop-plugin-bridge"
import { dispatchDesktopPluginHostRequest } from "@/lib/desktop-plugin-host-dispatcher"
import { DesktopPluginRateLimiter } from "@/lib/desktop-plugin-rate-limit"
import {
  getDesktopPluginRuntimeStatus,
  getDesktopPlugin,
  getDesktopPluginEntryUrl,
  shouldLoadDesktopPlugins,
  invokeDesktopPluginWorker,
  requestDesktopPluginNetwork,
  subscribeDesktopPluginRuntimeStatus,
  type DesktopInstalledPlugin,
} from "@/lib/desktop-plugins"
import { pluginEventBus } from "@/lib/desktop-plugin-event-bus"
import { notificationStore } from "@/lib/notification-store"
import { ActivityClient } from "@thunder/api-client"
import type { PluginLogEntry, PluginRpcLogEntry, PluginWorkerStatus } from "@thunder/plugin-devtools"
import {
  PLUGIN_BRIDGE_RESPONSE_SOURCE,
  PLUGIN_BRIDGE_VERSION,
} from "@thunder/plugin-protocol"
import type { PluginHmrScope } from "@thunder/plugin-protocol"
import type { ThunderPluginManifest } from "@thunder/plugin-schema"

export default function DesktopPluginPage() {
  const params = useParams<{ pluginId: string }>()
  const pluginId = params.pluginId
  const desktopEnabled = shouldLoadDesktopPlugins()
  const [plugin, setPlugin] = useState<DesktopInstalledPlugin | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hostOrigin] = useState<string | null>(() => (typeof window === "undefined" ? null : window.location.origin))
  const [frameHeight, setFrameHeight] = useState(960)
  const [workerStatus, setWorkerStatus] = useState<PluginWorkerStatus>({
    phase: "stopped",
    running: false,
    consecutiveCrashCount: 0,
  })
  // Dev logs and RPC calls are collected for future devtools integration.
  // Use refs instead of state to avoid re-renders on every append.
  const rpcCallsRef = useRef<PluginRpcLogEntry[]>([])
  const devLogsRef = useRef<PluginLogEntry[]>([])
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const previousWorkerStatusRef = useRef<string | null>(null)
  const lastKnownPidRef = useRef<number | undefined>(undefined)
  const rateLimiterRef = useRef(new DesktopPluginRateLimiter())
  const activityClientRef = useRef(new ActivityClient())
  const [reloadKey, setReloadKey] = useState(0)
  const { resolvedTheme } = useTheme()

  const appendLog = useCallback((level: PluginLogEntry["level"], message: string) => {
    devLogsRef.current = [
      {
        id: crypto.randomUUID(),
        level,
        message,
        at: new Date().toISOString(),
      },
      ...devLogsRef.current,
    ].slice(0, 100)
  }, [])

  const appendRpcCall = useCallback((entry: Omit<PluginRpcLogEntry, "id" | "at">) => {
    rpcCallsRef.current = [
      {
        ...entry,
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
      },
      ...rpcCallsRef.current,
    ].slice(0, 100)
  }, [])

  const postBridgeResponse = useCallback(
    (targetOrigin: string, id: string, ok: boolean, data?: unknown, bridgeError?: string) => {
      iframeRef.current?.contentWindow?.postMessage(
        {
          source: PLUGIN_BRIDGE_RESPONSE_SOURCE,
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

  const pushPluginUpdatedEvent = useCallback(
    (scope: PluginHmrScope, frameOrigin: string) => {
      iframeRef.current?.contentWindow?.postMessage(
        {
          source: PLUGIN_BRIDGE_RESPONSE_SOURCE,
          version: PLUGIN_BRIDGE_VERSION,
          type: "plugin.updated",
          scope,
          timestamp: Date.now(),
        },
        frameOrigin
      )
    },
    []
  )

  const refreshWorkerStatus = useCallback(async () => {
    if (!plugin || plugin.manifest.kind === "sandboxed") {
      setWorkerStatus({ phase: "stopped", running: false, consecutiveCrashCount: 0 })
      return
    }

    try {
      const runtimeStatus = await getDesktopPluginRuntimeStatus(plugin.manifest.id)

      // Detect worker restart by PID change — push update event and reload iframe
      const prevPid = lastKnownPidRef.current
      if (
        runtimeStatus.running &&
        runtimeStatus.pid &&
        prevPid !== undefined &&
        prevPid !== runtimeStatus.pid
      ) {
        const entryUrl = getDesktopPluginEntryUrl(plugin)
        if (entryUrl && hostOrigin) {
          const frameUrl = createIsolatedPluginFrameUrl(entryUrl, hostOrigin)
          const frameOrigin = new URL(frameUrl).origin
          pushPluginUpdatedEvent("worker", frameOrigin)
        }
        // Give the iframe a brief window to persist state before reload
        await new Promise((r) => setTimeout(r, 200))
        setReloadKey((k) => k + 1)
        appendLog("info", `worker 已热重载: PID ${prevPid} → ${runtimeStatus.pid}`)
      }
      if (runtimeStatus.pid) {
        lastKnownPidRef.current = runtimeStatus.pid
      }

      setWorkerStatus({
        phase: runtimeStatus.phase,
        running: runtimeStatus.running,
        pid: runtimeStatus.pid,
        startedAt: runtimeStatus.startedAt,
        consecutiveCrashCount: runtimeStatus.consecutiveCrashCount,
        circuitOpenUntil: runtimeStatus.circuitOpenUntil,
        lastError: runtimeStatus.lastError,
      })
    } catch (runtimeError) {
      setWorkerStatus({
        phase: "crashed",
        running: false,
        consecutiveCrashCount: 0,
        lastError: runtimeError instanceof Error ? runtimeError.message : "运行时状态读取失败",
      })
    }
  }, [appendLog, hostOrigin, plugin, pushPluginUpdatedEvent])

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
    activityClientRef.current
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
      { source: PLUGIN_BRIDGE_RESPONSE_SOURCE, version: PLUGIN_BRIDGE_VERSION, type: "theme.change", theme: resolvedTheme },
      frameOrigin
    )
  }, [hostOrigin, plugin, resolvedTheme])

  // Register the current iframe as a receiver for controlled inter-plugin events.
  useEffect(() => {
    if (!plugin || !hostOrigin || !iframeRef.current) return
    const entryUrl = getDesktopPluginEntryUrl(plugin)
    if (!entryUrl) return

    const frameUrl = createIsolatedPluginFrameUrl(entryUrl, hostOrigin)
    const frameOrigin = new URL(frameUrl).origin
    pluginEventBus.subscribe(plugin.manifest.id, iframeRef.current, frameOrigin)

    return () => {
      pluginEventBus.unsubscribe(plugin.manifest.id)
    }
  }, [hostOrigin, plugin, reloadKey])

  // Subscribe to runtime status changes via SSE (with polling fallback).
  // Replaces the previous 3-second polling interval, reducing unnecessary
  // network traffic while still being responsive to status changes.
  useEffect(() => {
    if (!plugin || plugin.manifest.kind === "sandboxed") {
      return
    }

    const unsubscribe = subscribeDesktopPluginRuntimeStatus(
      plugin.manifest.id,
      (runtimeStatus) => {
        // Detect worker restart by PID change — push update event and reload iframe
        const prevPid = lastKnownPidRef.current
        if (
          runtimeStatus.running &&
          runtimeStatus.pid &&
          prevPid !== undefined &&
          prevPid !== runtimeStatus.pid
        ) {
          if (hostOrigin) {
            const entryUrl = getDesktopPluginEntryUrl(plugin)
            if (entryUrl) {
              const frameUrl = createIsolatedPluginFrameUrl(entryUrl, hostOrigin)
              const frameOrigin = new URL(frameUrl).origin
              pushPluginUpdatedEvent("worker", frameOrigin)
            }
          }
          // Give the iframe a brief window to persist state before reload
          setTimeout(() => setReloadKey((k) => k + 1), 200)
          appendLog("info", `worker 已热重载: PID ${prevPid} → ${runtimeStatus.pid}`)
        }
        if (runtimeStatus.pid) {
          lastKnownPidRef.current = runtimeStatus.pid
        }

        setWorkerStatus({
          phase: runtimeStatus.phase,
          running: runtimeStatus.running,
          pid: runtimeStatus.pid,
          startedAt: runtimeStatus.startedAt,
          consecutiveCrashCount: runtimeStatus.consecutiveCrashCount,
          circuitOpenUntil: runtimeStatus.circuitOpenUntil,
          lastError: runtimeStatus.lastError,
        })
      },
      (err) => {
        setWorkerStatus({
          phase: "crashed",
          running: false,
          consecutiveCrashCount: 0,
          lastError: err.message || "运行时状态读取失败",
        })
      },
    )

    return unsubscribe
  }, [appendLog, hostOrigin, plugin, pushPluginUpdatedEvent])

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
          ? `worker 已启动${workerStatus.pid ? `: PID ${workerStatus.pid}` : ""}`
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
        typeof request.id !== "string" ||
        typeof request.method !== "string"
      ) {
        return
      }

      try {
        const requestBytes = new TextEncoder().encode(JSON.stringify(request)).byteLength
        if (requestBytes > 512 * 1024) {
          throw new Error("插件 Host Bridge 请求超过 512 KiB")
        }
        rateLimiterRef.current.assertAllowedMethod(request.method)
        const startedAt = performance.now()
        const dispatched = await dispatchDesktopPluginHostRequest(request, {
          manifest: currentPlugin.manifest as ThunderPluginManifest,
          storage: {
            get: (key) => getPluginStorageValue(currentPlugin.manifest.id, key),
            set: (key, value) =>
              setPluginStorageValue(currentPlugin.manifest.id, key, value),
            remove: (key) => removePluginStorageValue(currentPlugin.manifest.id, key),
            keys: () => listPluginStorageKeys(currentPlugin.manifest.id),
            clear: () => clearPluginStorage(currentPlugin.manifest.id),
          },
          setFrameHeight,
          addNotification: (params) => {
            notificationStore.addNotification({
              type:
                params.type === "success" || params.type === "error"
                  ? params.type
                  : "info",
              title: params.title?.trim() || currentPlugin.manifest.name,
              description: params.description?.trim() || "",
            })
          },
          trackActivity: async (params) => {
            await activityClientRef.current.recordActivity({
              module: `plugin:${currentPlugin.manifest.id}`,
              action: params.action,
              title: params.title,
              description: params.description,
              metadataJson: params.metadata
                ? JSON.stringify(params.metadata)
                : undefined,
            })
          },
          invokeWorker: (method, payload) =>
            invokeDesktopPluginWorker(
              currentPlugin.manifest.id,
              method,
              payload,
            ),
          requestNetwork: (params) =>
            requestDesktopPluginNetwork(currentPlugin.manifest.id, params),
          broadcastEvent: (params) => {
            pluginEventBus.broadcast(
              currentPlugin.manifest.id,
              params.event,
              params.data,
            )
          },
        })

        if (dispatched.request.method === "worker.invoke") {
          await refreshWorkerStatus()
        }
        postBridgeResponse(
          frameOrigin,
          dispatched.request.id,
          true,
          dispatched.result,
        )
        appendRpcCall({
          method: dispatched.diagnosticMethod,
          status: "ok",
          durationMs: Math.round(performance.now() - startedAt),
          payload: dispatched.request.params,
          result: dispatched.result,
        })
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
  const isolated = isPluginFrameOriginIsolated(frameUrl, hostOrigin)
  const frameSandbox = plugin.manifest.kind === "sandboxed"
    ? `allow-forms allow-scripts${isolated ? " allow-same-origin" : ""}`
    : `allow-forms allow-modals allow-popups allow-scripts${isolated ? " allow-same-origin" : ""}`
  const frameAllow = plugin.manifest.permissions.includes("microphone")
    ? "microphone; fullscreen"
    : "fullscreen"
  return (
    <div className="min-h-0 overflow-hidden rounded-xl border border-border/30 bg-background shadow-sm">
      <iframe
        key={reloadKey}
        ref={iframeRef}
        title={plugin.manifest.name}
        src={frameUrl}
        onLoad={() => appendLog("info", "插件 iframe 已加载")}
        allow={frameAllow}
        sandbox={frameSandbox}
        referrerPolicy="no-referrer"
        className="block w-full border-0 bg-transparent"
        style={{ height: `${frameHeight}px` }}
      />
    </div>
  )
}

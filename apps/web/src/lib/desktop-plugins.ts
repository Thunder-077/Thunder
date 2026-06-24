import { isTauriDesktop } from "@/lib/platform"
import type { ThunderPluginManifest } from "@thunder/plugin-schema"

export const DESKTOP_PLUGINS_CHANGED_EVENT = "thunder:desktop-plugins-changed"

export type DesktopPluginPermission = string

export type DesktopPluginManifest = ThunderPluginManifest & {
  description?: string
  category?: string
  order?: number
}

export interface InstalledDesktopPlugin {
  manifest: DesktopPluginManifest
  pluginRoot?: string
  record?: {
    id: string
    version: string
    installedAt: string
    updatedAt: string
    source: "local-directory" | "package-url" | "bundled"
    sourceRef: string
    packageSha256?: string
    manifestSha256: string
    signature?: {
      keyId: string
      algorithm: "ed25519"
      signature: string
    }
    trust?: DesktopPluginTrustRecord
  }
  trust?: DesktopPluginTrustRecord
  route: string
  webEntryUrl?: string
  uiEntryUrl?: string | null
  installedAt?: string
  updatedAt?: string
  installed: true
}

export type DesktopInstalledPlugin = InstalledDesktopPlugin

export interface DesktopPluginRuntimeStatus {
  pluginId: string
  phase: "stopped" | "starting" | "running" | "degraded" | "crashed" | "stopping"
  running: boolean
  pid?: number
  startedAt?: string
  lastExitAt?: string
  lastExitCode?: number | null
  lastExitSignal?: string | null
  consecutiveCrashCount: number
  circuitOpenUntil?: string
  lastError?: string
}

export interface DesktopPluginListResponse {
  enabled: boolean
  plugins: DesktopInstalledPlugin[]
}

export interface DesktopPluginMarketplaceEntry {
  id: string
  name: string
  version: string
  description: string
  icon: string
  category: string
  author: {
    name: string
    url?: string
  }
  permissions: string[]
  kind?: "sandboxed" | "trusted"
  highRiskPermissions?: string[]
  requiresTrustConfirmation?: boolean
  manifestSha256?: string
  source?: "package" | "bundled"
  packageUrl?: string
  packageSha256?: string
  signature?: {
    keyId: string
    algorithm: "ed25519"
    signature: string
  }
}

export interface DesktopPluginTrustRecord {
  source: "sandboxed-default" | "user-confirmed" | "official-bundled"
  trustedAt: string
  manifestSha256: string
  kind: "sandboxed" | "trusted"
  permissions: string[]
  highRiskPermissions: string[]
  acceptedRisk: boolean
  reason?: string
}

export interface DesktopPluginTrustDecision {
  acceptedRisk: boolean
  permissions: string[]
  kind: "sandboxed" | "trusted"
  manifestSha256: string
  reason?: string
}

export interface DesktopPluginMarketplaceIndex {
  version: 1
  generatedAt: string
  plugins: DesktopPluginMarketplaceEntry[]
  signature?: {
    keyId: string
    algorithm: "ed25519"
    signature: string
  }
}

export function shouldLoadDesktopPlugins(): boolean {
  return process.env.NEXT_PUBLIC_PLATFORM === "desktop" || isTauriDesktop()
}

function notifyDesktopPluginsChanged(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(DESKTOP_PLUGINS_CHANGED_EVENT))
}

export async function listDesktopPlugins(): Promise<DesktopPluginListResponse> {
  if (!shouldLoadDesktopPlugins()) {
    return { enabled: false, plugins: [] }
  }

  const response = await fetch("/api/v1/desktop/plugins", {
    credentials: "same-origin",
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error("桌面插件列表加载失败")
  }

  const payload = (await response.json()) as {
    ok: boolean
    data?: DesktopPluginListResponse
    message?: string
  }

  if (!payload.ok || !payload.data) {
    throw new Error(payload.message || "桌面插件列表加载失败")
  }

  return payload.data
}

export async function getDesktopPlugin(pluginId: string): Promise<DesktopInstalledPlugin> {
  const response = await fetch(`/api/v1/desktop/plugins/${encodeURIComponent(pluginId)}`, {
    credentials: "same-origin",
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error("桌面插件不存在或未安装")
  }

  const payload = (await response.json()) as {
    ok: boolean
    data?: DesktopInstalledPlugin
    message?: string
  }

  if (!payload.ok || !payload.data) {
    throw new Error(payload.message || "桌面插件不存在或未安装")
  }

  return payload.data
}

export function getDesktopPluginEntryUrl(plugin: DesktopInstalledPlugin): string | null {
  return plugin.uiEntryUrl ?? null
}

export function getDesktopPluginInstalledAt(plugin: DesktopInstalledPlugin): string | undefined {
  return plugin.installedAt ?? plugin.record?.installedAt
}

export async function listDesktopPluginMarketplace(): Promise<DesktopPluginMarketplaceIndex> {
  const response = await fetch("/api/v1/desktop/plugins/marketplace", {
    credentials: "same-origin",
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error("插件市场加载失败")
  }

  const payload = (await response.json()) as {
    ok: boolean
    data?: DesktopPluginMarketplaceIndex
    message?: string
  }

  if (!payload.ok || !payload.data) {
    throw new Error(payload.message || "插件市场加载失败")
  }

  return payload.data
}

export async function installLocalDesktopPlugin(
  pluginPath: string,
  trustDecision?: DesktopPluginTrustDecision,
): Promise<InstalledDesktopPlugin> {
  const response = await fetch("/api/v1/desktop/plugins/install/local", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ pluginPath, trustDecision }),
  })

  const payload = (await response.json()) as {
    ok: boolean
    data?: InstalledDesktopPlugin
    message?: string
  }

  if (!response.ok || !payload.ok || !payload.data) {
    throw new Error(payload.message || "插件安装失败")
  }

  notifyDesktopPluginsChanged()
  return payload.data
}

export async function installPackagedDesktopPlugin(
  entry: DesktopPluginMarketplaceEntry,
  trustDecision?: DesktopPluginTrustDecision,
): Promise<InstalledDesktopPlugin> {
  void trustDecision
  // 远程签名包安装的打包与索引结构已存在，但桌面端安装入口尚未开放。
  // 在前端统一给出明确错误，避免外部开发者以为是包内容或签名配置错误。
  throw new Error(`远程插件包安装暂未开放：${entry.name}`)
}

export async function installBundledDesktopPlugin(pluginId: string): Promise<InstalledDesktopPlugin> {
  const response = await fetch("/api/v1/desktop/plugins/install/bundled", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ pluginId }),
  })

  const payload = (await response.json()) as {
    ok: boolean
    data?: InstalledDesktopPlugin
    message?: string
  }

  if (!response.ok || !payload.ok || !payload.data) {
    throw new Error(payload.message || "插件安装失败")
  }

  notifyDesktopPluginsChanged()
  return payload.data
}

export async function uninstallDesktopPlugin(pluginId: string): Promise<void> {
  const response = await fetch(`/api/v1/desktop/plugins/${encodeURIComponent(pluginId)}`, {
    method: "DELETE",
    credentials: "same-origin",
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(payload?.message || "插件卸载失败")
  }
  notifyDesktopPluginsChanged()
}

export async function startDesktopPluginRuntime(pluginId: string): Promise<DesktopPluginRuntimeStatus> {
  return postRuntimeAction(pluginId, "start")
}

export async function stopDesktopPluginRuntime(pluginId: string): Promise<DesktopPluginRuntimeStatus> {
  return postRuntimeAction(pluginId, "stop")
}

export async function getDesktopPluginRuntimeStatus(pluginId: string): Promise<DesktopPluginRuntimeStatus> {
  const response = await fetch(`/api/v1/desktop/plugins/${encodeURIComponent(pluginId)}/runtime`, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  })

  const payload = (await response.json()) as {
    ok: boolean
    data?: DesktopPluginRuntimeStatus
    message?: string
  }

  if (!response.ok || !payload.ok || !payload.data) {
    throw new Error(payload.message || "插件运行时状态读取失败")
  }

  return payload.data
}

export async function invokeDesktopPluginWorker<TResult = unknown, TPayload = unknown>(
  pluginId: string,
  method: string,
  payload?: TPayload,
): Promise<TResult> {
  const response = await fetch(`/api/v1/desktop/plugins/${encodeURIComponent(pluginId)}/worker/invoke`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ method, payload }),
  })

  const data = (await response.json()) as {
    ok: boolean
    data?: {
      ok: true
      result: TResult
    }
    message?: string
  }

  if (!response.ok || !data.ok || !data.data) {
    throw new Error(data.message || "插件 worker 调用失败")
  }

  return data.data.result
}

export interface DesktopPluginWorkerStream<TResult = unknown> {
  write(payload?: unknown): void
  close(): void
  closed: Promise<void>
  onResult(handler: (result: TResult) => void): void
  onError(handler: (message: string) => void): void
}

function encodeWorkerStreamInput(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(payload)}\n`)
}

/**
 * 打开浏览器 Host 到 API runtime 的长连接流式 worker 通道。
 * 音频块进入同一个 HTTP request body，识别结果从同一个 response body 回流。
 */
export function openDesktopPluginWorkerStream<TResult = unknown>(
  pluginId: string,
  method: string,
  openPayload?: unknown,
): DesktopPluginWorkerStream<TResult> {
  const resultHandlers = new Set<(result: TResult) => void>()
  const errorHandlers = new Set<(message: string) => void>()
  let closedByCaller = false
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null
  const pendingInputs: Uint8Array[] = []

  const body = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController
      for (const input of pendingInputs.splice(0)) {
        streamController.enqueue(input)
      }
    },
  })

  const closed = (async () => {
    const response = await fetch(
      `/api/v1/desktop/plugins/${encodeURIComponent(pluginId)}/worker/stream?method=${encodeURIComponent(method)}`,
      {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/x-ndjson",
          "x-thunder-worker-stream-open": JSON.stringify(openPayload ?? null),
        },
        body,
        duplex: "half",
      } as RequestInit & { duplex: "half" },
    )
    if (!response.ok || !response.body) {
      throw new Error("插件 worker stream 打开失败")
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newlineIndex = buffer.indexOf("\n")
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (line) {
          const event = JSON.parse(line) as { ok: boolean; type: string; result?: TResult; message?: string }
          if (event.ok && event.type === "result") {
            for (const handler of resultHandlers) handler(event.result as TResult)
          } else if (!event.ok) {
            for (const handler of errorHandlers) handler(event.message ?? "插件 worker stream 失败")
          }
        }
        newlineIndex = buffer.indexOf("\n")
      }
    }
  })().catch((error) => {
    const message = error instanceof Error ? error.message : "插件 worker stream 失败"
    for (const handler of errorHandlers) handler(message)
  })

  const enqueue = (input: unknown): void => {
    const encoded = encodeWorkerStreamInput(input)
    if (controller) {
      controller.enqueue(encoded)
      return
    }
    pendingInputs.push(encoded)
  }

  return {
    write(payload?: unknown) {
      if (closedByCaller) return
      enqueue({ type: "chunk", payload })
    },
    close() {
      if (closedByCaller) return
      closedByCaller = true
      enqueue({ type: "close" })
      controller?.close()
    },
    closed,
    onResult(handler) {
      resultHandlers.add(handler)
    },
    onError(handler) {
      errorHandlers.add(handler)
    },
  }
}

export async function requestDesktopPluginNetwork(
  pluginId: string,
  request: import("@thunder/plugin-protocol").PluginNetworkRequestParams,
): Promise<import("@thunder/plugin-protocol").PluginNetworkResponse> {
  const response = await fetch(
    `/api/v1/desktop/plugins/${encodeURIComponent(pluginId)}/network/request`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    },
  )
  const payload = (await response.json()) as {
    ok: boolean
    data?: import("@thunder/plugin-protocol").PluginNetworkResponse
    message?: string
  }
  if (!response.ok || !payload.ok || !payload.data) {
    throw new Error(payload.message || "插件网络请求失败")
  }
  return payload.data
}

const DESKTOP_PLUGIN_PERMISSION_LABELS: Record<string, string> = {
  storage: "保存插件私有数据",
  notifications: "显示通知",
  activity: "记录活动",
  microphone: "使用麦克风",
  "filesystem:plugin-data": "写入插件数据目录",
  "native-runtime": "运行本地高权限代码",
}

export function describeDesktopPluginPermission(permission: string): string {
  return DESKTOP_PLUGIN_PERMISSION_LABELS[permission] ?? permission
}

async function postRuntimeAction(pluginId: string, action: "start" | "stop"): Promise<DesktopPluginRuntimeStatus> {
  const response = await fetch(`/api/v1/desktop/plugins/${encodeURIComponent(pluginId)}/runtime/${action}`, {
    method: "POST",
    credentials: "same-origin",
  })

  const payload = (await response.json()) as {
    ok: boolean
    data?: DesktopPluginRuntimeStatus
    message?: string
  }

  if (!response.ok || !payload.ok || !payload.data) {
    throw new Error(payload.message || "插件运行时状态更新失败")
  }

  return payload.data
}

/**
 * Subscribe to runtime status changes via Server-Sent Events.
 * Returns an unsubscribe function. Falls back to polling if SSE is
 * unavailable (e.g. non-browser environments or network errors).
 */
export function subscribeDesktopPluginRuntimeStatus(
  pluginId: string,
  onStatus: (status: DesktopPluginRuntimeStatus) => void,
  onError?: (error: Error) => void,
): () => void {
  const url = `/api/v1/desktop/plugins/${encodeURIComponent(pluginId)}/runtime/events`
  let eventSource: EventSource | null = null
  let fallbackTimer: ReturnType<typeof setInterval> | null = null
  let closed = false

  function startSSE(): void {
    if (closed) return
    try {
      eventSource = new EventSource(url)
      eventSource.onmessage = (event) => {
        try {
          const status = JSON.parse(event.data) as DesktopPluginRuntimeStatus
          onStatus(status)
        } catch {
          // Malformed event data — ignore.
        }
      }
      eventSource.onerror = () => {
        // SSE connection failed — fall back to polling.
        eventSource?.close()
        eventSource = null
        if (!closed) {
          startPollingFallback()
        }
      }
    } catch {
      // EventSource constructor failed — fall back to polling.
      startPollingFallback()
    }
  }

  function startPollingFallback(): void {
    if (closed || fallbackTimer) return
    fallbackTimer = setInterval(async () => {
      try {
        const status = await getDesktopPluginRuntimeStatus(pluginId)
        onStatus(status)
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error("运行时状态读取失败"))
      }
    }, 3000)
  }

  startSSE()

  return () => {
    closed = true
    eventSource?.close()
    eventSource = null
    if (fallbackTimer) {
      clearInterval(fallbackTimer)
      fallbackTimer = null
    }
  }
}

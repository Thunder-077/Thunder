import { isTauriDesktop } from "@/lib/platform"

export const DESKTOP_PLUGINS_CHANGED_EVENT = "thunder:desktop-plugins-changed"

export type DesktopPluginPermission = string

export interface DesktopPluginManifest {
  manifestVersion: number
  id: string
  name: string
  version: string
  description: string
  kind?: "sandboxed" | "trusted"
  category?: string
  order?: number
  engines?: {
    thunder: string
  }
  author: {
    name: string
    email?: string
    url?: string
  }
  icon: string
  permissions: DesktopPluginPermission[]
  web?: {
    entry: string
    contentSecurityPolicy?: string
  }
  api?: {
    baseUrl?: string
    healthPath?: string
    runtime?: {
      kind: "node"
      entry: string
      args?: string[]
      portEnv?: string
      env?: Record<string, string>
    }
  }
  contributes?: {
    sidebar?: {
      title: string
      icon?: string
      entry: string
    }
  }
  runtime?: {
    entry: string
  }
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
  }
  route: string
  webEntryUrl?: string
  uiEntryUrl?: string | null
  installedAt?: string
  updatedAt?: string
  installed: true
}

export type DesktopInstalledPlugin = InstalledDesktopPlugin

export interface DesktopPluginMigrationResult {
  pluginId: string
  applied: Array<{ name: string; sha256: string; appliedAt: string }>
  skipped: Array<{ name: string; sha256: string; appliedAt: string }>
}

export interface DesktopPluginRuntimeStatus {
  pluginId: string
  running: boolean
  pid?: number
  port?: number
  baseUrl?: string
  endpoint?: string
  startedAt?: string
  lastExitAt?: string
  lastExitCode?: number | null
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
  source?: "package" | "bundled"
  packageUrl?: string
  packageSha256?: string
  signature?: {
    keyId: string
    algorithm: "ed25519"
    signature: string
  }
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

export async function installLocalDesktopPlugin(pluginPath: string): Promise<InstalledDesktopPlugin> {
  const response = await fetch("/api/v1/desktop/plugins/install/local", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ pluginPath }),
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
  entry: DesktopPluginMarketplaceEntry
): Promise<InstalledDesktopPlugin> {
  if (!entry.packageUrl || !entry.packageSha256 || !entry.signature) {
    throw new Error("插件市场条目缺少签名包信息")
  }

  const response = await fetch("/api/v1/desktop/plugins/install/package", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      packageUrl: entry.packageUrl,
      packageSha256: entry.packageSha256,
      signature: entry.signature,
    }),
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

export async function runDesktopPluginMigrations(pluginId: string): Promise<DesktopPluginMigrationResult> {
  const response = await fetch(`/api/v1/desktop/plugins/${encodeURIComponent(pluginId)}/migrations/run`, {
    method: "POST",
    credentials: "same-origin",
  })

  const payload = (await response.json()) as {
    ok: boolean
    data?: DesktopPluginMigrationResult
    message?: string
  }

  if (!response.ok || !payload.ok || !payload.data) {
    throw new Error(payload.message || "插件迁移执行失败")
  }

  return payload.data
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

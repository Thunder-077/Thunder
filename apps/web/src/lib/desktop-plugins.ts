import type { ModuleCategory } from "@thunder/core"
import { isTauriDesktop } from "@/lib/platform"

export const DESKTOP_PLUGINS_CHANGED_EVENT = "thunder:desktop-plugins-changed"

export type DesktopPluginPermission =
  | "webview"
  | "plugin-storage"
  | "network-proxy"
  | "local-api-proxy"

export interface DesktopPluginManifest {
  manifestVersion: 1
  id: string
  name: string
  version: string
  description: string
  icon: string
  category: ModuleCategory
  order?: number
  author: {
    name: string
    url?: string
  }
  permissions: DesktopPluginPermission[]
  web: {
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
  migrations?: {
    sqlite?: string
  }
}

export interface InstalledDesktopPlugin {
  manifest: DesktopPluginManifest
  record: {
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
  webEntryUrl: string
  installed: true
}

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
  startedAt?: string
  lastExitAt?: string
  lastExitCode?: number | null
  lastError?: string
}

export interface DesktopPluginListResponse {
  enabled: boolean
  plugins: InstalledDesktopPlugin[]
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
  permissions: DesktopPluginPermission[]
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

export async function getDesktopPlugin(pluginId: string): Promise<InstalledDesktopPlugin> {
  const response = await fetch(`/api/v1/desktop/plugins/${encodeURIComponent(pluginId)}`, {
    credentials: "same-origin",
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error("桌面插件不存在或未安装")
  }

  const payload = (await response.json()) as {
    ok: boolean
    data?: InstalledDesktopPlugin
    message?: string
  }

  if (!payload.ok || !payload.data) {
    throw new Error(payload.message || "桌面插件不存在或未安装")
  }

  return payload.data
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

export async function installLocalDesktopPlugin(sourcePath: string): Promise<InstalledDesktopPlugin> {
  const response = await fetch("/api/v1/desktop/plugins/install/local", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ sourcePath }),
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

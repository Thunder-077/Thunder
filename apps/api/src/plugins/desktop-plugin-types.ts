export type {
  ThunderPluginCategory as DesktopPluginCategory,
  ThunderPluginPermission as DesktopPluginPermission,
  ThunderPluginManifest as DesktopPluginManifest,
} from "@thunder/plugin-sdk"
export type {
  ThunderPluginManifestV2 as DesktopPluginManifestV2,
  ThunderPluginPermission as DesktopPluginPermissionV2,
} from "@thunder/plugin-schema"

export interface DesktopPluginInstallRecord {
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

export interface InstalledDesktopPlugin {
  manifest: import("@thunder/plugin-sdk").ThunderPluginManifest
  record: DesktopPluginInstallRecord
  route: string
  webEntryUrl: string
  installed: true
}

export interface InstalledDesktopPluginV2 {
  manifest: import("@thunder/plugin-schema").ThunderPluginManifestV2
  pluginRoot: string
  route: string
  uiEntryUrl: string | null
  installedAt?: string
  updatedAt?: string
  installed: true
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

export interface DesktopPluginNetworkProxyRequest {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: unknown
}

export interface DesktopPluginNetworkProxyResponse<T = unknown> {
  status: number
  ok: boolean
  headers: Record<string, string>
  data: T
}

export interface DesktopPluginMigrationRecord {
  pluginId: string
  version: string
  name: string
  sha256: string
  appliedAt: string
}

export interface DesktopPluginMarketplaceEntry {
  id: string
  name: string
  version: string
  description: string
  icon: string
  category: import("@thunder/plugin-sdk").ThunderPluginCategory
  author: {
    name: string
    url?: string
  }
  permissions: import("@thunder/plugin-sdk").ThunderPluginPermission[]
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

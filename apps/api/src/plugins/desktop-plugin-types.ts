export type DesktopPluginCategory =
  | "productivity"
  | "security"
  | "ai"
  | "notes"
  | "tools"
  | "dashboard"
  | "other"

export type DesktopPluginPermission =
  | "webview"
  | "plugin-storage"
  | "network-proxy"
  | "local-api-proxy"

export interface DesktopPluginWebConfig {
  entry: string
  contentSecurityPolicy?: string
}

export interface DesktopPluginApiConfig {
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

export interface DesktopPluginMigrationConfig {
  sqlite?: string
}

export interface DesktopPluginManifest {
  manifestVersion: 1
  id: string
  name: string
  version: string
  description: string
  icon: string
  category: DesktopPluginCategory
  order?: number
  author: {
    name: string
    url?: string
  }
  homepage?: string
  permissions: DesktopPluginPermission[]
  web: DesktopPluginWebConfig
  api?: DesktopPluginApiConfig
  migrations?: DesktopPluginMigrationConfig
}

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
  manifest: DesktopPluginManifest
  record: DesktopPluginInstallRecord
  trust: DesktopPluginTrustRecord
  route: string
  webEntryUrl: string
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

export interface DesktopPluginTrustRecord {
  trusted: boolean
  trustedAt?: string
  trustedBy?: string
  manifestSha256?: string
  permissionsSnapshot?: DesktopPluginPermission[]
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
  category: DesktopPluginCategory
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

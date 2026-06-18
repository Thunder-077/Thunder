export type {
  ThunderPluginPermission as DesktopPluginPermission,
  ThunderPluginManifest as DesktopPluginManifest,
  ThunderPluginManifest as DesktopPluginSchemaManifest,
} from "@thunder/plugin-schema"

export type DesktopPluginCategory =
  | "productivity"
  | "security"
  | "ai"
  | "notes"
  | "tools"
  | "dashboard"
  | "other"

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
  trust?: DesktopPluginTrustRecord
}

export type DesktopPluginTrustSource =
  | "sandboxed-default"
  | "user-confirmed"
  | "official-bundled"

export interface DesktopPluginTrustRecord {
  source: DesktopPluginTrustSource
  trustedAt: string
  manifestSha256: string
  kind: import("@thunder/plugin-schema").ThunderPluginKind
  permissions: string[]
  highRiskPermissions: string[]
  acceptedRisk: boolean
  reason?: string
}

export interface InstalledDesktopPlugin {
  manifest: import("@thunder/plugin-schema").ThunderPluginManifest
  pluginRoot: string
  trust?: DesktopPluginTrustRecord
  route: string
  uiEntryUrl: string | null
  installedAt?: string
  updatedAt?: string
  installed: true
}

export interface DesktopPluginRuntimeStatus {
  pluginId: string
  phase: import("@thunder/plugin-host-runtime").PluginRuntimePhase
  running: boolean
  pid?: number
  startedAt?: string
  lastExitAt?: string
  lastExitCode?: number | null
  lastExitSignal?: NodeJS.Signals | null
  consecutiveCrashCount: number
  circuitOpenUntil?: string
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
  category: DesktopPluginCategory
  author: {
    name: string
    url?: string
  }
  permissions: string[]
  kind?: import("@thunder/plugin-schema").ThunderPluginKind
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

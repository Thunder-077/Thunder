export type ThunderPluginCategory =
  | "productivity"
  | "security"
  | "ai"
  | "notes"
  | "tools"
  | "dashboard"
  | "other"

export type ThunderPluginPermission =
  | "webview"
  | "plugin-storage"
  | "network-proxy"
  | "local-api-proxy"

export interface ThunderPluginManifest {
  manifestVersion: 1
  id: string
  name: string
  version: string
  description: string
  icon: string
  category: ThunderPluginCategory
  order?: number
  author: {
    name: string
    url?: string
  }
  homepage?: string
  permissions: ThunderPluginPermission[]
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

export interface ThunderPluginRuntimeEnv {
  THUNDER_PLUGIN_ID: string
  THUNDER_PLUGIN_VERSION: string
  THUNDER_PLUGIN_STATE_DIR: string
  PORT: string
}

export function defineThunderPluginManifest(manifest: ThunderPluginManifest): ThunderPluginManifest {
  return manifest
}

type RuntimeEnvSource = Record<string, string | undefined>

export function getThunderPluginRuntimeEnv(env: RuntimeEnvSource): ThunderPluginRuntimeEnv {
  const required = [
    "THUNDER_PLUGIN_ID",
    "THUNDER_PLUGIN_VERSION",
    "THUNDER_PLUGIN_STATE_DIR",
    "PORT",
  ] as const

  for (const key of required) {
    if (!env[key]) {
      throw new Error(`Missing Thunder plugin runtime env: ${key}`)
    }
  }

  return {
    THUNDER_PLUGIN_ID: env.THUNDER_PLUGIN_ID!,
    THUNDER_PLUGIN_VERSION: env.THUNDER_PLUGIN_VERSION!,
    THUNDER_PLUGIN_STATE_DIR: env.THUNDER_PLUGIN_STATE_DIR!,
    PORT: env.PORT!,
  }
}

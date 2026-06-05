export type {
  ThunderPluginAuthor as ThunderPluginAuthorV2,
  ThunderPluginCommandContribution,
  ThunderPluginContributes,
  ThunderPluginKind,
  ThunderPluginManifestV2,
  ThunderPluginPermission as ThunderPluginPermissionV2,
  ThunderPluginRuntime as ThunderPluginRuntimeV2,
  ThunderPluginSettingContribution,
  ThunderPluginSidebarContribution,
} from "@thunder/plugin-schema"

export interface ThunderPluginPanelDefinition {
  title: string
  component: unknown
}

export type ThunderPluginCommandHandler = () => Promise<void> | void

export interface ThunderPluginApp {
  panels: {
    register(id: string, panel: ThunderPluginPanelDefinition): void
  }
  commands: {
    register(id: string, handler: ThunderPluginCommandHandler): void
    execute(id: string): Promise<void>
  }
  navigation: {
    openPanel(id: string): Promise<void>
    lastOpenedPanel?: string
  }
}

export interface ThunderPluginDefinition<TApp extends ThunderPluginApp = ThunderPluginApp> {
  setup(app: TApp): void | Promise<void>
}

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

export type ThunderPluginManifestLike =
  | ThunderPluginManifest
  | import("@thunder/plugin-schema").ThunderPluginManifestV2

export interface ThunderPluginRuntimeEnv {
  THUNDER_PLUGIN_ID: string
  THUNDER_PLUGIN_VERSION: string
  THUNDER_PLUGIN_STATE_DIR: string
  PORT: string
}

export function defineThunderPluginManifest(manifest: ThunderPluginManifest): ThunderPluginManifest {
  return manifest
}

export function definePlugin<TDefinition extends ThunderPluginDefinition>(
  definition: TDefinition
): TDefinition {
  return definition
}

function createPanelRegistry(): ThunderPluginApp["panels"] {
  const panels = new Map<string, ThunderPluginPanelDefinition>()

  return {
    register(id, panel) {
      if (!id.trim()) {
        throw new Error("Plugin panel id is required")
      }

      panels.set(id, panel)
    },
  }
}

function createCommandRegistry(): ThunderPluginApp["commands"] {
  const commands = new Map<string, ThunderPluginCommandHandler>()

  return {
    register(id, handler) {
      if (!id.trim()) {
        throw new Error("Plugin command id is required")
      }

      commands.set(id, handler)
    },
    async execute(id) {
      const handler = commands.get(id)
      if (!handler) {
        throw new Error(`Unknown command: ${id}`)
      }

      await handler()
    },
  }
}

function createNavigationApi(): ThunderPluginApp["navigation"] {
  return {
    lastOpenedPanel: undefined,
    async openPanel(id) {
      if (!id.trim()) {
        throw new Error("Plugin panel id is required")
      }

      this.lastOpenedPanel = id
    },
  }
}

export function createPluginApi(): ThunderPluginApp {
  return {
    panels: createPanelRegistry(),
    commands: createCommandRegistry(),
    navigation: createNavigationApi(),
  }
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

export type {
  ThunderPluginAuthor,
  ThunderPluginCommandContribution,
  ThunderPluginContributes,
  ThunderPluginKind,
  ThunderPluginManifest,
  ThunderPluginPermission,
  ThunderPluginRuntime,
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

import type { PluginRuntimeStatus, RegisteredPlugin, SandboxedPluginRuntime } from "./types"

export function createSandboxedRuntime(): SandboxedPluginRuntime {
  const statuses = new Map<string, PluginRuntimeStatus>()

  return {
    async start(plugin: RegisteredPlugin) {
      const status: PluginRuntimeStatus = {
        pluginId: plugin.manifest.id,
        kind: plugin.manifest.kind,
        running: true,
      }

      statuses.set(plugin.manifest.id, status)
      return status
    },
    async stop(pluginId: string) {
      const status: PluginRuntimeStatus = {
        pluginId,
        kind: "sandboxed",
        running: false,
      }

      statuses.set(pluginId, status)
      return status
    },
    getStatus(pluginId: string) {
      return (
        statuses.get(pluginId) ?? {
          pluginId,
          kind: "sandboxed",
          running: false,
        }
      )
    },
  }
}

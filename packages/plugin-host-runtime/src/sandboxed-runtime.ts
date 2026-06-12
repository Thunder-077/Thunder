import type { PluginRuntimeStatus, RegisteredPlugin, SandboxedPluginRuntime } from "./types"

export function createSandboxedRuntime(): SandboxedPluginRuntime {
  const statuses = new Map<string, PluginRuntimeStatus>()

  return {
    async start(plugin: RegisteredPlugin) {
      const status: PluginRuntimeStatus = {
        pluginId: plugin.manifest.id,
        kind: "sandboxed",
        phase: "running",
        running: true,
        consecutiveCrashCount: 0,
      }

      statuses.set(plugin.manifest.id, status)
      return status
    },
    async stop(pluginId: string) {
      const status: PluginRuntimeStatus = {
        pluginId,
        kind: "sandboxed",
        phase: "stopped",
        running: false,
        consecutiveCrashCount: 0,
      }

      statuses.set(pluginId, status)
      return status
    },
    getStatus(pluginId: string) {
      return (
        statuses.get(pluginId) ?? {
          pluginId,
          kind: "sandboxed",
          phase: "stopped",
          running: false,
          consecutiveCrashCount: 0,
        }
      )
    },
  }
}

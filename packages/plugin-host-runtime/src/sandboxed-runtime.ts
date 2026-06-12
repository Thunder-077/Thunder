import { createPluginRuntimeStatus } from "./runtime-policy"
import type {
  PluginRuntimeStatus,
  RegisteredPlugin,
  SandboxedPluginRuntime,
} from "./types"

export function createSandboxedRuntime(): SandboxedPluginRuntime {
  const statuses = new Map<string, PluginRuntimeStatus>()

  return {
    async start(plugin: RegisteredPlugin) {
      const status = createPluginRuntimeStatus({
        pluginId: plugin.manifest.id,
        kind: "sandboxed",
        phase: "running",
        consecutiveCrashCount: 0,
      })

      statuses.set(plugin.manifest.id, status)
      return status
    },
    async stop(pluginId: string) {
      const status = createPluginRuntimeStatus({
        pluginId,
        kind: "sandboxed",
        phase: "stopped",
        consecutiveCrashCount: 0,
      })

      statuses.set(pluginId, status)
      return status
    },
    getStatus(pluginId: string) {
      return (
        statuses.get(pluginId) ??
        createPluginRuntimeStatus({
          pluginId,
          kind: "sandboxed",
          phase: "stopped",
          consecutiveCrashCount: 0,
        })
      )
    },
  }
}

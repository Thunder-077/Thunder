import { createPipeServer, type PipeServer } from "./rpc/pipe-server"
import type {
  PluginRuntimeStatus,
  RegisteredPlugin,
  TrustedPluginRuntimeSupervisor,
} from "./types"

export interface TrustedRuntimeSupervisorOptions {
  handleRpc?(
    plugin: RegisteredPlugin,
    method: string,
    payload: unknown,
  ): Promise<unknown> | unknown
  socketDirectory?: string
}

export function createTrustedRuntimeSupervisor(
  options: TrustedRuntimeSupervisorOptions = {},
): TrustedPluginRuntimeSupervisor {
  const statuses = new Map<string, PluginRuntimeStatus>()
  const servers = new Map<string, PipeServer>()

  return {
    async start(plugin: RegisteredPlugin) {
      const existingServer = servers.get(plugin.manifest.id)
      if (existingServer) {
        await existingServer.close()
        servers.delete(plugin.manifest.id)
      }

      const server = await createPipeServer({
        socketDirectory: options.socketDirectory,
        handle(method, payload) {
          if (options.handleRpc) {
            return options.handleRpc(plugin, method, payload)
          }

          return {
            ok: true,
            pluginId: plugin.manifest.id,
            method,
            payload,
          }
        },
      })

      const status: PluginRuntimeStatus = {
        pluginId: plugin.manifest.id,
        kind: plugin.manifest.kind,
        running: true,
        endpoint: server.endpoint,
      }

      servers.set(plugin.manifest.id, server)
      statuses.set(plugin.manifest.id, status)
      return status
    },
    async stop(pluginId: string) {
      const server = servers.get(pluginId)

      if (server) {
        await server.close()
        servers.delete(pluginId)
      }

      const status: PluginRuntimeStatus = {
        pluginId,
        kind: "trusted",
        running: false,
      }

      statuses.set(pluginId, status)
      return status
    },
    getStatus(pluginId: string) {
      return (
        statuses.get(pluginId) ?? {
          pluginId,
          kind: "trusted",
          running: false,
        }
      )
    },
    getEndpoint(pluginId: string) {
      return statuses.get(pluginId)?.endpoint ?? null
    },
  }
}

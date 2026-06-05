import { pathToFileURL } from "node:url"
import { resolve } from "node:path"
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

type LoadedWorker = {
  handlers: Record<string, (payload: unknown) => Promise<unknown> | unknown>
}

async function loadTrustedWorker(plugin: RegisteredPlugin): Promise<LoadedWorker> {
  const entry = plugin.manifest.runtime?.entry
  if (!entry) {
    throw new Error(`Trusted plugin ${plugin.manifest.id} is missing runtime.entry`)
  }

  const entryPath = resolve(plugin.pluginRoot, entry)
  const workerModule = (await import(pathToFileURL(entryPath).href)) as { default?: LoadedWorker }
  const worker = workerModule.default

  if (!worker || typeof worker !== "object" || !worker.handlers || typeof worker.handlers !== "object") {
    throw new Error(`Trusted plugin ${plugin.manifest.id} runtime must export default worker handlers`)
  }

  return worker
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

      const worker = await loadTrustedWorker(plugin)

      const server = await createPipeServer({
        socketDirectory: options.socketDirectory,
        async handle(method, payload) {
          if (options.handleRpc) {
            return options.handleRpc(plugin, method, payload)
          }

          const handler = worker.handlers[method]
          if (!handler) {
            throw new Error(`Unknown trusted plugin worker method: ${method}`)
          }

          return handler(payload)
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

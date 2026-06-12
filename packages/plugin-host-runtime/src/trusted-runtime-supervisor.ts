import { randomUUID } from "node:crypto"
import { Worker } from "node:worker_threads"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
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

/**
 * Resolve the absolute path to the worker thread bootstrap script.
 *
 * Dynamically resolved to support both ESM (via import.meta.url in package test)
 * and CommonJS (via __dirname in consuming apps/api).
 */
let currentDir: string
try {
  // @ts-ignore
  currentDir = __dirname
} catch {
  // @ts-ignore
  currentDir = dirname(fileURLToPath(import.meta.url))
}

const WORKER_BOOTSTRAP_PATH = join(currentDir, "worker-thread-bootstrap.mjs")

type PendingInvoke = {
  resolve(value: unknown): void
  reject(error: Error): void
}

interface IsolatedWorker {
  worker: Worker
  pending: Map<string, PendingInvoke>
}

/**
 * Spawn a worker thread that loads the plugin's `dist/worker.js` in
 * isolation.  Returns the `Worker` handle once the child thread reports
 * `ready`.  From that point the parent can send `invoke` messages and
 * receive `result`/`error` replies keyed by request id.
 */
async function spawnIsolatedWorker(
  plugin: RegisteredPlugin,
): Promise<IsolatedWorker> {
  const entry = plugin.manifest.runtime?.entry
  if (!entry) {
    throw new Error(
      `Trusted plugin ${plugin.manifest.id} is missing runtime.entry`,
    )
  }

  const pending = new Map<string, PendingInvoke>()

  const worker = new Worker(WORKER_BOOTSTRAP_PATH, {
    workerData: {
      pluginId: plugin.manifest.id,
      pluginRoot: plugin.pluginRoot,
      runtimeEntry: entry,
    },
  })

  await new Promise<void>((resolve, reject) => {
    const onMessage = (msg: { type: string; error?: string }) => {
      if (msg.type === "ready") {
        worker.off("error", onError)
        worker.off("exit", onExit)
        resolve()
      } else if (msg.type === "init-error") {
        worker.off("error", onError)
        worker.off("exit", onExit)
        reject(new Error(msg.error ?? "Worker init failed"))
      }
    }

    const onError = (err: Error) => {
      worker.off("message", onMessage)
      worker.off("exit", onExit)
      reject(err)
    }

    const onExit = (code: number) => {
      worker.off("message", onMessage)
      worker.off("error", onError)
      reject(new Error(`Worker exited during init with code ${code}`))
    }

    worker.once("message", onMessage)
    worker.once("error", onError)
    worker.once("exit", onExit)
  })

  // After init, set up permanent message listener for RPC responses.
  worker.on(
    "message",
    (msg: { type: string; id?: string; result?: unknown; error?: string }) => {
      if (msg.type === "result" && msg.id) {
        const p = pending.get(msg.id)
        if (p) {
          pending.delete(msg.id)
          p.resolve(msg.result)
        }
      } else if (msg.type === "error" && msg.id) {
        const p = pending.get(msg.id)
        if (p) {
          pending.delete(msg.id)
          p.reject(new Error(msg.error ?? "Worker RPC failed"))
        }
      }
    },
  )

  // If the worker dies unexpectedly, reject any pending calls.
  worker.on("exit", () => {
    for (const [, p] of pending) {
      p.reject(new Error("Worker thread exited unexpectedly"))
    }
    pending.clear()
  })

  worker.on("error", (err) => {
    for (const [, p] of pending) {
      p.reject(err)
    }
    pending.clear()
  })

  return { worker, pending }
}

export function createTrustedRuntimeSupervisor(
  options: TrustedRuntimeSupervisorOptions = {},
): TrustedPluginRuntimeSupervisor {
  const statuses = new Map<string, PluginRuntimeStatus>()
  const servers = new Map<string, PipeServer>()
  const workers = new Map<string, IsolatedWorker>()

  return {
    async start(plugin: RegisteredPlugin) {
      // Tear down any existing instance for this plugin first.
      const existingServer = servers.get(plugin.manifest.id)
      if (existingServer) {
        await existingServer.close()
        servers.delete(plugin.manifest.id)
      }
      const existingWorker = workers.get(plugin.manifest.id)
      if (existingWorker) {
        await existingWorker.worker.terminate()
        workers.delete(plugin.manifest.id)
      }

      // Spawn the plugin worker in an isolated thread.
      const isolated = await spawnIsolatedWorker(plugin)
      workers.set(plugin.manifest.id, isolated)

      // Create the pipe server in the main thread; it forwards RPC
      // calls to the isolated worker thread via MessagePort.
      const server = await createPipeServer({
        socketDirectory: options.socketDirectory,
        async handle(method, payload) {
          if (options.handleRpc) {
            return options.handleRpc(plugin, method, payload)
          }

          const id = randomUUID()
          return new Promise<unknown>((resolve, reject) => {
            isolated.pending.set(id, { resolve, reject })
            isolated.worker.postMessage({ type: "invoke", id, method, payload })
          })
        },
      })

      const status: PluginRuntimeStatus = {
        pluginId: plugin.manifest.id,
        kind: "trusted",
        phase: "running",
        running: true,
        startedAt: new Date().toISOString(),
        consecutiveCrashCount: 0,
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

      const isolated = workers.get(pluginId)
      if (isolated) {
        // Try graceful shutdown first, then force-terminate.
        try {
          isolated.worker.postMessage({ type: "shutdown" })
          await Promise.race([
            new Promise<void>((resolve) => {
              isolated.worker.once("exit", () => resolve())
            }),
            new Promise<void>((resolve) =>
              setTimeout(() => resolve(), 3000),
            ),
          ])
        } catch {
          // ignore
        }
        await isolated.worker.terminate()
        workers.delete(pluginId)
      }

      const status: PluginRuntimeStatus = {
        pluginId,
        kind: "trusted",
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
          kind: "trusted",
          phase: "stopped",
          running: false,
          consecutiveCrashCount: 0,
        }
      )
    },
    getEndpoint(pluginId: string) {
      return servers.get(pluginId)?.endpoint ?? null
    },
  }
}

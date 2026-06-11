/**
 * Worker thread bootstrap for trusted plugin runtime isolation.
 *
 * This file runs inside a `worker_threads.Worker` spawned by the
 * `TrustedRuntimeSupervisor`. It loads the plugin's `dist/worker.js`,
 * listens for RPC messages from the parent thread, and dispatches
 * them to the plugin's exported handlers.
 *
 * This is a plain `.mjs` file (not TypeScript) so it can be loaded
 * by `worker_threads.Worker` in both development and production
 * without requiring a TypeScript loader in the worker thread.
 */

import { parentPort, workerData } from "node:worker_threads"
import { pathToFileURL } from "node:url"
import { resolve } from "node:path"

async function main() {
  const { pluginId, pluginRoot, runtimeEntry } = workerData

  const entryPath = resolve(pluginRoot, runtimeEntry)
  /** @type {{ default?: { handlers: Record<string, (payload: unknown) => unknown> } }} */
  const workerModule = await import(pathToFileURL(entryPath).href)
  const worker = workerModule.default

  if (
    !worker ||
    typeof worker !== "object" ||
    !worker.handlers ||
    typeof worker.handlers !== "object"
  ) {
    throw new Error(
      `Trusted plugin ${pluginId} runtime must export default worker handlers`,
    )
  }

  parentPort.on("message", async (msg) => {
    if (msg.type === "invoke") {
      try {
        const handler = worker.handlers[msg.method]
        if (!handler || typeof handler !== "function") {
          throw new Error(
            `Unknown trusted plugin worker method: ${msg.method}`,
          )
        }
        const result = await handler(msg.payload)
        parentPort.postMessage({ type: "result", id: msg.id, result })
      } catch (err) {
        parentPort.postMessage({
          type: "error",
          id: msg.id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    } else if (msg.type === "shutdown") {
      parentPort.postMessage({ type: "stopped" })
      process.exit(0)
    }
  })

  parentPort.postMessage({ type: "ready" })
}

main().catch((err) => {
  if (parentPort) {
    parentPort.postMessage({
      type: "init-error",
      error: err instanceof Error ? err.message : String(err),
    })
  }
  process.exit(1)
})

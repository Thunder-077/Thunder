import app from "./app"
import { refreshEnabledPlaylistCaches } from "./modules/emby/emby-routes"

interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void
}

function applyBindingsToProcessEnv(bindings: Record<string, unknown>) {
  for (const [key, value] of Object.entries(bindings)) {
    if (typeof value === "string") {
      process.env[key] = value
    }
  }
}

export default {
  fetch: app.fetch,
  async scheduled(
    _controller: { cron: string; scheduledTime: number },
    env: Record<string, unknown>,
    ctx: WorkerExecutionContext
  ) {
    applyBindingsToProcessEnv(env)

    ctx.waitUntil(
      refreshEnabledPlaylistCaches().catch((error) => {
        console.error("[emby-worker] scheduled cache refresh failed", error)
      })
    )
  },
}

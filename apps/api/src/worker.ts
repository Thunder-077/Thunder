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
    controller: { cron: string; scheduledTime: number },
    env: Record<string, unknown>,
    ctx: WorkerExecutionContext
  ) {
    console.info("[emby-worker] 定时触发", {
      cron: controller.cron,
      scheduledTime: new Date(controller.scheduledTime).toISOString(),
    })

    applyBindingsToProcessEnv(env)

    ctx.waitUntil(
      refreshEnabledPlaylistCaches()
        .then(() => {
          console.info("[emby-worker] 定时任务完成")
        })
        .catch((error) => {
          console.error("[emby-worker] 定时任务失败", error)
        })
    )
  },
}

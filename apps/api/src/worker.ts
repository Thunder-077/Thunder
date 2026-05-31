import app from "./app"
import { runEnabledScheduledTasks } from "./generated/enabled-routes"

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
    console.info("[emby-refresh-scheduler] trigger received", {
      cron: controller.cron,
      scheduledTime: new Date(controller.scheduledTime).toISOString(),
    })

    applyBindingsToProcessEnv(env)

    ctx.waitUntil(
      runEnabledScheduledTasks()
        .then(() => {
          console.info("[emby-refresh-scheduler] trigger completed")
        })
        .catch((error) => {
          console.error("[emby-refresh-scheduler] trigger failed", {
            cron: controller.cron,
            scheduledTime: new Date(controller.scheduledTime).toISOString(),
            error: error instanceof Error ? error.message : String(error),
          })
        })
    )
  },
}

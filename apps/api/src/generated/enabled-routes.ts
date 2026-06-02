import type { Hono } from "hono"
import { vault as vault0 } from "../modules/vault/vault-routes"
import { emby as emby1 } from "../modules/emby/emby-routes"
import { serverEmby as serverEmby2 } from "../modules/emby/emby-routes"
import { refreshEnabledPlaylistCaches as refreshEnabledPlaylistCaches3 } from "../modules/emby/emby-routes"

export function registerEnabledModuleRoutes(app: Hono<any>): void {
  app.route("/api/v1/vault", vault0)
  app.route("/api/v1/emby", emby1)
  app.route("/server/emby", serverEmby2)
}

export async function runEnabledScheduledTasks(): Promise<void> {
  await refreshEnabledPlaylistCaches3()
}

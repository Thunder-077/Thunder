import type { Hono } from "hono"
import { vault as vault0 } from "../modules/vault/vault-routes"


export function registerEnabledModuleRoutes(app: Hono<any>): void {
  app.route("/api/v1/vault", vault0)
}

export async function runEnabledScheduledTasks(): Promise<void> {
  return
}

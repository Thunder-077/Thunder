import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { auth } from "./modules/auth/auth-routes"
import { weather } from "./modules/weather/weather-routes"
import { registerEnabledModuleRoutes } from "./generated/enabled-routes"

type ThunderBindings = {
  DATABASE_URL?: string
  EMBY_PUBLIC_BASE_URL?: string
  EMBY_EMOS_BASE_URL?: string
  EMBY_EMOS_TOKEN?: string
  EMBY_TMDB_API_TOKEN?: string
  QWEATHER_API_HOST?: string
  QWEATHER_KEY_ID?: string
  QWEATHER_PROJECT_ID?: string
  QWEATHER_PRIVATE_KEY?: string
}

const app = new Hono<{ Bindings: ThunderBindings }>()

app.use("*", logger())
app.use("*", cors())
app.use("*", async (c, next) => {
  const bindings = (c.env ?? {}) as Record<string, unknown>

  for (const [key, value] of Object.entries(bindings)) {
    if (typeof value === "string") {
      process.env[key] = value
    }
  }

  await next()
})

app.get("/health", (c) => {
  return c.json({ ok: true, service: "thunder-api", version: "0.1.0" })
})

app.route("/api/v1/weather", weather)
app.route("/api/v1/auth", auth)
registerEnabledModuleRoutes(app)

export default app

import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { vault } from "./modules/vault/vault-routes"
import { weather } from "./modules/weather/weather-routes"

const app = new Hono()

app.use("*", logger())
app.use("*", cors())

app.get("/health", (c) => {
  return c.json({ ok: true, service: "thunder-api", version: "0.1.0" })
})

app.route("/api/v1/vault", vault)
app.route("/api/v1/weather", weather)

export default app

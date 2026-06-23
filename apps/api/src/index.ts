import "dotenv/config"
import { serve } from "@hono/node-server"
import app from "./app"
import { ensureDatabaseInitialized } from "./db-init"
import { shutdownPluginSystem } from "./plugins/desktop-plugin-manager"

// Auto-migrate and seed local SQLite database on startup if active
ensureDatabaseInitialized()

const port = Number(process.env.API_PORT) || 3001

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Thunder API running on http://localhost:${info.port}`)
  console.log(`Health check: http://localhost:${info.port}/health`)
  console.log(`API base: http://localhost:${info.port}/api/v1`)
})

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\n[thunder-api] Received ${signal}, shutting down gracefully...`)
  try {
    await shutdownPluginSystem()
    console.log("[thunder-api] Plugin runtimes stopped")
  } catch (error) {
    console.error("[thunder-api] Error stopping plugin runtimes", error)
  }
  server.close(() => {
    console.log("[thunder-api] Server closed")
    process.exit(0)
  })
  // Force exit if graceful close takes too long.
  setTimeout(() => {
    console.error("[thunder-api] Forced exit after timeout")
    process.exit(1)
  }, 10_000).unref()
}

process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"))
process.on("SIGINT", () => void gracefulShutdown("SIGINT"))

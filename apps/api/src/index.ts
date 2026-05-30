import "dotenv/config"
import { serve } from "@hono/node-server"
import app from "./app"
import { ensureDatabaseInitialized } from "./db-init"

// Auto-migrate and seed local SQLite database on startup if active
ensureDatabaseInitialized()

const port = Number(process.env.API_PORT) || 3001

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Thunder API running on http://localhost:${info.port}`)
  console.log(`Health check: http://localhost:${info.port}/health`)
  console.log(`API base: http://localhost:${info.port}/api/v1`)
})


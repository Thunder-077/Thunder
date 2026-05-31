import { createServer } from "node:http"

const port = Number(process.env.PORT || "0")
const pluginId = process.env.THUNDER_PLUGIN_ID || "hello-plugin"

const server = createServer((request, response) => {
  response.setHeader("content-type", "application/json; charset=utf-8")

  if (request.url === "/health") {
    response.end(JSON.stringify({ ok: true, pluginId }))
    return
  }

  response.end(
    JSON.stringify({
      ok: true,
      pluginId,
      path: request.url,
      stateDir: process.env.THUNDER_PLUGIN_STATE_DIR,
    })
  )
})

server.listen(port, "127.0.0.1", () => {
  const address = server.address()
  if (address && typeof address === "object") {
    console.log(`${pluginId} listening on ${address.port}`)
  }
})

import { createServer } from "node:http"

const port = Number(process.env.PORT || "0")
const nativeApiUrl = process.env.THUNDER_DESKTOP_NATIVE_API_URL || "http://127.0.0.1:43102"

function sendJson(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  })
  response.end(JSON.stringify(body))
}

async function readJson(request) {
  const chunks = []
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk))
  }
  if (chunks.length === 0) return undefined
  const raw = Buffer.concat(chunks).toString("utf8").trim()
  return raw ? JSON.parse(raw) : undefined
}

async function proxyNative(request, response, path) {
  const url = new URL(path, nativeApiUrl)
  const method = request.method || "GET"
  const body = method === "GET" || method === "HEAD" ? undefined : JSON.stringify(await readJson(request))
  const upstream = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body,
  })

  const text = await upstream.text()
  response.writeHead(upstream.status, {
    "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
    "cache-control": "no-store",
  })
  response.end(text)
}

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1")

  Promise.resolve()
    .then(async () => {
      if (url.pathname === "/health") {
        sendJson(response, 200, {
          ok: true,
          pluginId: process.env.THUNDER_PLUGIN_ID || "teleprompter",
          nativeApiUrl,
        })
        return
      }

      if (url.pathname.startsWith("/native/")) {
        await proxyNative(request, response, url.pathname.slice("/native".length) + url.search)
        return
      }

      sendJson(response, 404, { ok: false, message: "Unknown teleprompter plugin API path" })
    })
    .catch((error) => {
      sendJson(response, 500, {
        ok: false,
        message: error instanceof Error ? error.message : "Teleprompter plugin runtime error",
      })
    })
})

server.listen(port, "127.0.0.1", () => {
  const address = server.address()
  if (address && typeof address === "object") {
    console.log(`teleprompter plugin runtime listening on ${address.port}`)
  }
})

import assert from "node:assert/strict"
import { sanitizePluginApiProxyHeaders } from "./desktop-plugin-routes"

function main() {
  const headers = sanitizePluginApiProxyHeaders(
    new Headers({
      authorization: "Bearer secret",
      cookie: "sid=secret",
      host: "127.0.0.1:3001",
      "proxy-authorization": "secret",
      "x-plugin-header": "ok",
    })
  )

  assert.equal(headers.get("authorization"), null)
  assert.equal(headers.get("cookie"), null)
  assert.equal(headers.get("host"), null)
  assert.equal(headers.get("proxy-authorization"), null)
  assert.equal(headers.get("x-plugin-header"), "ok")

  console.log("[desktop-plugin-routes] tests passed")
}

main()

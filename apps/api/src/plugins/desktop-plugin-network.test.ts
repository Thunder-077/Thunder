import assert from "node:assert/strict"
import type { ThunderPluginManifest } from "@thunder/plugin-schema"
import { proxyDesktopPluginNetworkRequest } from "./desktop-plugin-network"

const manifest: ThunderPluginManifest = {
  manifestVersion: 2,
  id: "network-test",
  name: "Network Test",
  version: "1.0.0",
  kind: "sandboxed",
  engines: { thunder: "^2.0.0" },
  permissions: ["network:https://example.com"],
}

async function main() {
  let receivedAuthorization: string | null = null
  const response = await proxyDesktopPluginNetworkRequest(
    manifest,
    {
      url: "https://example.com/data",
      headers: { authorization: "secret", accept: "text/plain" },
    },
    async (_input, init) => {
      receivedAuthorization = new Headers(init?.headers).get("authorization")
      return new Response("ok", {
        status: 200,
        headers: { "content-type": "text/plain", "set-cookie": "secret=1" },
      })
    },
  )

  assert.equal(receivedAuthorization, null)
  assert.equal(response.body, "ok")
  assert.equal(response.headers["set-cookie"], undefined)
  await assert.rejects(
    proxyDesktopPluginNetworkRequest(
      manifest,
      { url: "https://denied.example/data" },
      fetch,
    ),
    /未声明 network:https:\/\/denied\.example 权限/,
  )
  await assert.rejects(
    proxyDesktopPluginNetworkRequest(manifest, { url: "https://example.com", method: "TRACE" }),
    /请求方法无效/,
  )

  console.log("[desktop-plugin-network] tests passed")
}

void main()

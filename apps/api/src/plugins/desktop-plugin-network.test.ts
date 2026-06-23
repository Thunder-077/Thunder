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

  // ---- Test: base64 responseType preserves binary data ----
  const binaryPayload = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe])
  const base64Response = await proxyDesktopPluginNetworkRequest(
    manifest,
    {
      url: "https://example.com/image.png",
      responseType: "base64",
    },
    async () => new Response(binaryPayload, {
      status: 200,
      headers: { "content-type": "image/png" },
    }),
  )
  assert.equal(base64Response.encoding, "base64", "base64 response should have encoding field")
  const decodedBytes = Buffer.from(base64Response.body, "base64")
  assert.deepEqual(
    new Uint8Array(decodedBytes),
    binaryPayload,
    "base64 body should round-trip binary data without corruption",
  )

  // ---- Test: text responseType (default) omits encoding field ----
  const textResponse = await proxyDesktopPluginNetworkRequest(
    manifest,
    { url: "https://example.com/data" },
    async () => new Response("hello", { status: 200 }),
  )
  assert.equal(textResponse.body, "hello")
  assert.equal(textResponse.encoding, undefined, "text response should not have encoding field")

  console.log("[desktop-plugin-network] tests passed")
}

void main()

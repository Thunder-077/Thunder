import assert from "node:assert/strict"
import {
  createThunderPluginClient,
  normalizeThunderPluginRuntimePath,
  normalizeThunderPluginStorageKey,
} from "./browser"

function rejects(fn: () => unknown, label: string): void {
  let rejected = false
  try {
    fn()
  } catch {
    rejected = true
  }
  assert.equal(rejected, true, label)
}

function main() {
  assert.equal(normalizeThunderPluginRuntimePath("status"), "status")
  assert.equal(normalizeThunderPluginRuntimePath("native/sherpa/models?fresh=1"), "native/sherpa/models?fresh=1")
  rejects(() => normalizeThunderPluginRuntimePath("/status"), "runtime path must reject leading slash")
  rejects(() => normalizeThunderPluginRuntimePath("../secret"), "runtime path must reject parent segment")
  rejects(() => normalizeThunderPluginRuntimePath("native/%2e%2e/secret"), "runtime path must reject encoded parent segment")
  rejects(() => normalizeThunderPluginRuntimePath("native/%2Fsecret"), "runtime path must reject encoded slash")
  rejects(() => normalizeThunderPluginRuntimePath("native//status"), "runtime path must reject empty segment")

  assert.equal(normalizeThunderPluginStorageKey(" theme "), "theme")
  rejects(() => normalizeThunderPluginStorageKey(""), "storage key must reject empty string")
  rejects(() => normalizeThunderPluginStorageKey("x".repeat(129)), "storage key must reject overlong keys")
  rejects(() => normalizeThunderPluginStorageKey("bad\nkey"), "storage key must reject control characters")

  const postedRequests: unknown[] = []
  ;(globalThis as { window?: unknown }).window = {
    parent: {
      postMessage: (payload: unknown) => {
        postedRequests.push(payload)
      },
    },
  }

  const thunder = createThunderPluginClient()
  thunder.plugin.setFrameHeight(640.2)
  assert.equal(postedRequests.length, 1)
  assert.deepEqual(postedRequests[0], {
    source: "thunder-plugin",
    version: 1,
    id: postedRequests[0] && typeof postedRequests[0] === "object" ? (postedRequests[0] as { id: string }).id : undefined,
    method: "layout.setFrameHeight",
    params: {
      height: 641,
    },
  })
  rejects(() => thunder.plugin.setFrameHeight(Number.NaN), "frame height must reject invalid numbers")

  console.log("[plugin-sdk/browser] tests passed")
}

main()

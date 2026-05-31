import assert from "node:assert/strict"
import { normalizeThunderPluginRuntimePath, normalizeThunderPluginStorageKey } from "./browser"

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

  console.log("[plugin-sdk/browser] tests passed")
}

main()

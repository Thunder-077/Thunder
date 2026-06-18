import assert from "node:assert/strict"
import type { ThunderPluginManifest } from "@thunder/plugin-schema"
import {
  assertPluginTrustedForRuntime,
  createDesktopPluginTrustRecord,
  getHighRiskPluginPermissions,
  pluginRequiresTrustConfirmation,
} from "./desktop-plugin-trust"

const sandboxedManifest: ThunderPluginManifest = {
  manifestVersion: 2,
  id: "notes",
  name: "Notes",
  version: "1.0.0",
  kind: "sandboxed",
  engines: { thunder: "^2.0.0" },
  permissions: ["storage"],
}

const trustedManifest: ThunderPluginManifest = {
  ...sandboxedManifest,
  id: "native-notes",
  kind: "trusted",
  permissions: ["storage", "native-runtime", "filesystem:plugin-data"],
  runtime: { entry: "dist/worker.js" },
}

assert.equal(pluginRequiresTrustConfirmation(sandboxedManifest), false)
assert.equal(pluginRequiresTrustConfirmation(trustedManifest), true)
assert.deepEqual(getHighRiskPluginPermissions(trustedManifest), [
  "filesystem:plugin-data",
  "native-runtime",
  "trusted-runtime",
])

const sandboxedTrust = createDesktopPluginTrustRecord({
  manifest: sandboxedManifest,
  manifestSha256: "sandboxed-sha",
  source: "user-confirmed",
})
assert.equal(sandboxedTrust.source, "sandboxed-default")
assert.equal(sandboxedTrust.acceptedRisk, true)

assert.throws(
  () =>
    createDesktopPluginTrustRecord({
      manifest: trustedManifest,
      manifestSha256: "trusted-sha",
      source: "user-confirmed",
    }),
  /需要确认权限和信任风险/,
)

assert.throws(
  () =>
    createDesktopPluginTrustRecord({
      manifest: trustedManifest,
      manifestSha256: "trusted-sha",
      source: "user-confirmed",
      decision: {
        acceptedRisk: true,
        kind: "trusted",
        manifestSha256: "old-sha",
        permissions: trustedManifest.permissions,
      },
    }),
  /已过期/,
)

const confirmedTrust = createDesktopPluginTrustRecord({
  manifest: trustedManifest,
  manifestSha256: "trusted-sha",
  source: "user-confirmed",
  decision: {
    acceptedRisk: true,
    kind: "trusted",
    manifestSha256: "trusted-sha",
    permissions: trustedManifest.permissions,
    reason: "test acceptance",
  },
})
assert.equal(confirmedTrust.source, "user-confirmed")
assert.equal(confirmedTrust.reason, "test acceptance")

assert.doesNotThrow(() =>
  assertPluginTrustedForRuntime(
    {
      id: trustedManifest.id,
      version: trustedManifest.version,
      installedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      source: "local-directory",
      sourceRef: "/tmp/plugin",
      manifestSha256: "trusted-sha",
      trust: confirmedTrust,
    },
    trustedManifest,
  ),
)

assert.throws(
  () => assertPluginTrustedForRuntime(null, trustedManifest),
  /未完成信任确认/,
)

console.log("[desktop-plugin-trust] tests passed")

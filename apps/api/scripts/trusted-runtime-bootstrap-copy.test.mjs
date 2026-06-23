/**
 * Validates that the desktop API bundle includes the trusted runtime bootstrap
 * and that the bundled server.cjs resolves it beside itself rather than from a
 * workspace source path.
 *
 * Run after `pnpm --filter @thunder/api build:desktop-bundle`:
 *
 *   node apps/api/scripts/trusted-runtime-bootstrap-copy.test.mjs
 */

import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = resolve(scriptDir, "..", "..", "..")
const runtimeApiDir = resolve(workspaceRoot, "apps", "desktop", "runtime", "api")

// 1. The bootstrap artifact must exist beside the bundle.
const bootstrapPath = resolve(runtimeApiDir, "trusted-process-bootstrap.mjs")
await access(bootstrapPath).catch(() => {
  throw new Error(
    "Desktop API runtime is missing trusted-process-bootstrap.mjs. " +
    "Run pnpm --filter @thunder/api build:desktop-bundle first."
  )
})

// 2. The copied bootstrap must be byte-identical to the source.
const sourcePath = resolve(
  workspaceRoot,
  "packages",
  "plugin-host-runtime",
  "src",
  "trusted-process-bootstrap.mjs",
)
const [sourceContent, copiedContent] = await Promise.all([
  readFile(sourcePath, "utf8"),
  readFile(bootstrapPath, "utf8"),
])
assert.equal(
  copiedContent,
  sourceContent,
  "Copied bootstrap must be byte-identical to the source in plugin-host-runtime",
)

// 3. The bundled server.cjs must resolve the bootstrap beside itself (using
//    __dirname or import.meta) rather than pointing at a workspace source path.
const serverBundlePath = resolve(runtimeApiDir, "server.cjs")
let serverBundle
try {
  serverBundle = await readFile(serverBundlePath, "utf8")
} catch {
  throw new Error(
    "Desktop API bundle server.cjs not found. " +
    "Run pnpm --filter @thunder/api build:desktop-bundle first."
  )
}

// The bundle should NOT contain a hard-coded workspace source path to the
// bootstrap. It should resolve via __dirname or a relative reference.
assert.ok(
  !serverBundle.includes("packages/plugin-host-runtime/src/trusted-process-bootstrap.mjs"),
  "server.cjs must not contain a hard-coded workspace path to the bootstrap; " +
  "it should resolve via __dirname or THUNDER_TRUSTED_RUNTIME_BOOTSTRAP_PATH",
)

console.log("✓ trusted-runtime-bootstrap-copy: all assertions passed")

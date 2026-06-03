import assert from "node:assert/strict"
import { resolve } from "node:path"
import {
  resolvePnpmPeerNodeModulesDir,
  resolveStandaloneSymlinkTarget,
  shouldPruneRuntimeFile,
} from "./runtime-copy-utils.mjs"

const workspaceRoot = resolve("D:/workspace/thunder")
const standaloneDir = resolve(workspaceRoot, "apps/web/.next/standalone")
const linkPath = resolve(standaloneDir, "apps/web/node_modules/next")
const rootPnpmTarget = resolve(
  workspaceRoot,
  "node_modules/.pnpm/next@16.2.4/node_modules/next"
)

assert.equal(
  resolveStandaloneSymlinkTarget({
    linkPath,
    linkTarget: rootPnpmTarget,
    standaloneDir,
    workspaceRoot,
  }),
  resolve(standaloneDir, "node_modules/.pnpm/next@16.2.4/node_modules/next")
)

assert.equal(
  resolvePnpmPeerNodeModulesDir({
    resolvedTarget: resolve(standaloneDir, "node_modules/.pnpm/next@16.2.4/node_modules/next"),
    standaloneDir,
  }),
  resolve(standaloneDir, "node_modules/.pnpm/next@16.2.4/node_modules")
)

assert.equal(
  resolvePnpmPeerNodeModulesDir({
    resolvedTarget: resolve(standaloneDir, "apps/web/node_modules/next"),
    standaloneDir,
  }),
  null
)

assert.equal(shouldPruneRuntimeFile("server.js.map"), true)
assert.equal(shouldPruneRuntimeFile("index.d.ts"), true)
assert.equal(shouldPruneRuntimeFile("server.js"), false)

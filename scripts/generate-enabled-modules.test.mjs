import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { spawn } from "node:child_process"

const workspaceRoot = resolve(import.meta.dirname, "..")
const runtimeDepsPath = resolve(workspaceRoot, "apps/api/src/generated/runtime-dependencies.json")

async function runGenerator(target) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [resolve(workspaceRoot, "scripts/generate-enabled-modules.mjs"), "--target", target], {
      cwd: workspaceRoot,
      stdio: "inherit",
    })

    child.on("error", rejectPromise)
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }
      rejectPromise(new Error(`generate-enabled-modules exited with code ${code ?? -1}`))
    })
  })

  return JSON.parse(await readFile(runtimeDepsPath, "utf8"))
}

const desktopManifest = await runGenerator("desktop")
assert.equal(desktopManifest.targetPlatform, "desktop")
assert.deepEqual(desktopManifest.enabledModuleIds, ["vault"])
assert.deepEqual(desktopManifest.api.dependencies, [])
assert.ok(
  desktopManifest.api.excludedDependencies.includes("sharp"),
  "desktop target should report sharp as excluded because the only module that needs it is web-only"
)

const webManifest = await runGenerator("web")
assert.equal(webManifest.targetPlatform, "web")
assert.ok(webManifest.enabledModuleIds.includes("emby"))
assert.ok(
  webManifest.api.dependencies.includes("sharp"),
  "web target should keep sharp because Emby API routes need it"
)

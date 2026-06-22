import assert from "node:assert/strict"
import { createServer } from "node:http"
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { buildPlugin } from "./commands/build"
import { createPluginProject } from "./commands/create"
import {
  createDesktopDevHostClient,
  getOpenCommand,
  prepareDevInstallDirectory,
  shouldIgnoreReinstallPath,
  waitForCondition,
} from "./commands/dev"
import { packPlugin } from "./commands/pack"
import { runPublishCommand } from "./commands/publish"
import { validatePluginProject } from "./commands/validate"

const pluginRoot = await mkdtemp(join(tmpdir(), "thunder-plugin-cli-"))
const sandboxedFiles = await createPluginProject({ name: "hello-sandboxed", template: "sandboxed-ui" }, pluginRoot)
assert.equal(sandboxedFiles["plugin.json"].includes('"kind": "sandboxed"'), true)
assert.equal("src/worker.ts" in sandboxedFiles, false)

const files = await createPluginProject({ name: "teleprompter", template: "trusted-app" }, pluginRoot)

assert.equal(files["plugin.json"].includes('"kind": "trusted"'), true)
assert.equal(files["src/worker.ts"].includes("defineWorker"), true)
assert.equal(files["src/index.tsx"].includes("@thunder/plugin-sdk/browser"), true)
assert.equal(files["src/index.tsx"].includes("definePlugin"), false)
assert.equal(files["package.json"].includes('"@thunder/plugin-cli"'), true)
assert.equal(typeof files["tsconfig.json"], "string")
assert.equal(typeof files[".gitignore"], "string")
assert.equal(typeof files["README.md"], "string")

for (const [relativePath, contents] of Object.entries(files)) {
  const filePath = join(pluginRoot, relativePath)
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, contents, "utf8")
}

const buildResult = await buildPlugin({ rootDir: pluginRoot })
assert.equal(buildResult.outputs.includes("dist/index.html"), true)
assert.equal(buildResult.outputs.includes("dist/index.js"), true)
assert.equal(buildResult.outputs.includes("dist/worker.js"), true)
assert.equal(
  (await readFile(join(pluginRoot, "dist/index.html"), "utf8")).includes("index.js"),
  true,
)

const validationResult = await validatePluginProject(pluginRoot)
assert.equal(validationResult.requiresTrustConfirmation, true)
assert.deepEqual(
  validationResult.highRiskPermissions.sort(),
  ["native-runtime"].sort(),
)

const packResult = await packPlugin({
  rootDir: pluginRoot,
  writeEntry: true,
  baseUrl: "https://plugins.example.test/",
})
assert.equal(packResult.packagePath.endsWith(".tar.gz"), true)
assert.equal(packResult.packageSha256.length, 64)
assert.equal(packResult.manifestSha256.length, 64)
assert.equal(packResult.marketplaceEntry?.id, "teleprompter")
assert.equal(packResult.marketplaceEntry?.kind, "trusted")
assert.equal(packResult.marketplaceEntry?.packageSha256, packResult.packageSha256)
assert.equal(packResult.marketplaceEntry?.manifestSha256, packResult.manifestSha256)
assert.equal(packResult.marketplaceEntry?.packageUrl, "https://plugins.example.test/teleprompter-0.1.0.tar.gz")
assert.equal((await readdir(join(pluginRoot, "artifacts"))).length > 0, true)

const publishResult = await runPublishCommand({
  entriesDir: join(pluginRoot, "artifacts"),
  outPath: join(pluginRoot, "artifacts", "index.json"),
})
assert.equal(publishResult.index.version, 1)
assert.equal(publishResult.index.plugins.length, 1)
assert.equal(publishResult.index.plugins[0]?.id, "teleprompter")
assert.equal(
  JSON.parse(await readFile(join(pluginRoot, "artifacts", "index.json"), "utf8")).plugins.length,
  1,
)

assert.equal(shouldIgnoreReinstallPath("dist/index.js"), true)
assert.equal(shouldIgnoreReinstallPath(".thunder-plugin-dev/teleprompter/plugin.json"), true)
assert.equal(shouldIgnoreReinstallPath("src/index.tsx"), true, "src/ is now handled by esbuild HMR watcher")
assert.equal(shouldIgnoreReinstallPath("plugin.json"), false, "plugin.json should still trigger full reinstall")
const devInstallDir = await prepareDevInstallDirectory(buildResult.project)
assert.equal((await readFile(join(devInstallDir, "plugin.json"), "utf8")).includes('"id": "teleprompter"'), true)
assert.equal((await readFile(join(devInstallDir, "dist", "index.html"), "utf8")).includes("index.js"), true)

const openCommand = getOpenCommand("http://127.0.0.1:3000/plugins/teleprompter?devtools=1")
assert.equal(Array.isArray(openCommand.args), true)
assert.equal(openCommand.args.length > 0, true)

let installRequests = 0
let startRequests = 0
let reloadRequests = 0
let installPayload: unknown = null
let lastReloadScope: string | null = null
const server = createServer((request, response) => {
  if (request.url === "/api/v1/desktop/plugins" && request.method === "GET") {
    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify({ ok: true, data: { enabled: true, plugins: [] } }))
    return
  }

  if (request.url === "/api/v1/desktop/plugins/install/local" && request.method === "POST") {
    installRequests += 1
    let body = ""
    request.on("data", (chunk) => {
      body += String(chunk)
    })
    request.on("end", () => {
      installPayload = JSON.parse(body)
      response.writeHead(201, { "content-type": "application/json" })
      response.end(JSON.stringify({ ok: true, data: { installed: true } }))
    })
    return
  }

  if (request.url === "/api/v1/desktop/plugins/teleprompter/runtime/start" && request.method === "POST") {
    startRequests += 1
    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify({ ok: true, data: { running: true } }))
    return
  }

  if (request.url === "/api/v1/desktop/plugins/teleprompter/runtime" && request.method === "GET") {
    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify({
      ok: true,
      data: {
        phase: "running",
        running: true,
        pid: 1234,
        consecutiveCrashCount: 0,
      },
    }))
    return
  }

  if (request.url === "/api/v1/desktop/plugins/teleprompter/runtime/reload" && request.method === "POST") {
    reloadRequests += 1
    let body = ""
    request.on("data", (chunk) => {
      body += String(chunk)
    })
    request.on("end", () => {
      const parsed = JSON.parse(body) as { scope?: string }
      lastReloadScope = parsed.scope ?? null
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify({
        ok: true,
        data: {
          scope: parsed.scope,
          runtimeStatus: { phase: "running", running: true },
          reloadId: "test-reload-id",
        },
      }))
    })
    return
  }

  response.writeHead(404, { "content-type": "application/json" })
  response.end(JSON.stringify({ ok: false, message: "not found" }))
})

await new Promise<void>((resolvePromise) => {
  server.listen(0, "127.0.0.1", () => resolvePromise())
})

const address = server.address()
assert.equal(address !== null && typeof address === "object", true)
if (address === null || typeof address !== "object") {
  throw new Error("expected test server to expose an object address")
}
const apiBaseUrl = `http://127.0.0.1:${address.port}`
const client = createDesktopDevHostClient(apiBaseUrl)
const hostReady = await waitForCondition(
  async () => {
    const status = await client.getRuntimeStatus("teleprompter")
    return status.running
  },
  2000,
  50,
)
assert.equal(hostReady, true)
await client.installLocalPlugin(buildResult.project, devInstallDir)
await client.startRuntime("teleprompter")
assert.equal(installRequests, 1)
assert.equal(startRequests, 1)
assert.equal((installPayload as { pluginPath?: string }).pluginPath, devInstallDir)
assert.equal((installPayload as { trustDecision?: { acceptedRisk?: boolean } }).trustDecision?.acceptedRisk, true)
assert.equal((installPayload as { trustDecision?: { kind?: string } }).trustDecision?.kind, "trusted")
assert.equal(
  (installPayload as { trustDecision?: { permissions?: string[] } }).trustDecision?.permissions?.includes("native-runtime"),
  true,
)
assert.equal(
  (installPayload as { trustDecision?: { manifestSha256?: string } }).trustDecision?.manifestSha256?.length,
  64,
)

// Test reloadPlugin client method (HMR)
await client.reloadPlugin("teleprompter", "worker")
assert.equal(reloadRequests, 1)
assert.equal(lastReloadScope, "worker")

await client.reloadPlugin("teleprompter", "ui")
assert.equal(reloadRequests, 2)
assert.equal(lastReloadScope, "ui")

await client.reloadPlugin("teleprompter", "all")
assert.equal(reloadRequests, 3)
assert.equal(lastReloadScope, "all")

await new Promise<void>((resolvePromise, reject) => {
  server.close((error) => {
    if (error) {
      reject(error)
      return
    }
    resolvePromise()
  })
})

console.log("[plugin-cli] tests passed")

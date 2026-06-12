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
  shouldIgnoreReinstallPath,
  waitForCondition,
} from "./commands/dev"
import { packPlugin } from "./commands/pack"

const pluginRoot = await mkdtemp(join(tmpdir(), "thunder-plugin-cli-"))
const sandboxedFiles = await createPluginProject({ name: "hello-sandboxed", template: "sandboxed-ui" }, pluginRoot)
assert.equal(sandboxedFiles["plugin.json"].includes('"kind": "sandboxed"'), true)
assert.equal("src/worker.ts" in sandboxedFiles, false)

const files = await createPluginProject({ name: "teleprompter", template: "trusted-app" }, pluginRoot)

assert.equal(files["plugin.json"].includes('"kind": "trusted"'), true)
assert.equal(files["src/worker.ts"].includes("defineWorker"), true)
assert.equal(files["src/index.tsx"].includes("@thunder/plugin-sdk/browser"), true)
assert.equal(files["src/index.tsx"].includes("definePlugin"), false)
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

const packResult = await packPlugin(pluginRoot)
assert.equal(packResult.packagePath.endsWith(".tar.gz"), true)
assert.equal(packResult.packageSha256.length, 64)
assert.equal((await readdir(join(pluginRoot, "artifacts"))).length > 0, true)
assert.equal(shouldIgnoreReinstallPath("dist/index.js"), true)
assert.equal(shouldIgnoreReinstallPath("src/index.tsx"), false)

const openCommand = getOpenCommand("http://127.0.0.1:3000/plugins/teleprompter?devtools=1")
assert.equal(Array.isArray(openCommand.args), true)
assert.equal(openCommand.args.length > 0, true)

let installRequests = 0
let startRequests = 0
const server = createServer((request, response) => {
  if (request.url === "/api/v1/desktop/plugins" && request.method === "GET") {
    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify({ ok: true, data: { enabled: true, plugins: [] } }))
    return
  }

  if (request.url === "/api/v1/desktop/plugins/install/local" && request.method === "POST") {
    installRequests += 1
    response.writeHead(201, { "content-type": "application/json" })
    response.end(JSON.stringify({ ok: true, data: { installed: true } }))
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
await client.installLocalPlugin(pluginRoot)
await client.startRuntime("teleprompter")
assert.equal(installRequests, 1)
assert.equal(startRequests, 1)
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

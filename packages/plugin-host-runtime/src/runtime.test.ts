import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createPipeClient,
  createPluginInstaller,
  createPluginRegistry,
  createSandboxedRuntime,
  createTrustedRuntimeSupervisor,
  loadInstalledPluginManifest,
} from "./index"

const root = mkdtempSync(join(tmpdir(), "thunder-plugin-host-"))
const pluginDir = join(root, "teleprompter")

mkdirSync(join(pluginDir, "dist"), { recursive: true })
writeFileSync(
  join(pluginDir, "dist", "worker.js"),
  [
    'export default {',
    '  handlers: {',
    '    async "speech.transcribe"(payload) {',
    '      return { normalized: String(payload?.text ?? "").trim() }',
    '    },',
    '  },',
    '}',
    "",
  ].join("\n"),
)
writeFileSync(
  join(pluginDir, "plugin.json"),
  JSON.stringify({
    manifestVersion: 2,
    id: "teleprompter",
    name: "提词器",
    version: "2.0.0",
    description: "plugin",
    kind: "trusted",
    engines: { thunder: "^2.0.0" },
    author: { name: "Thunder" },
    icon: "ScrollText",
    permissions: [
      "storage",
      "native-runtime",
      "filesystem:plugin-data",
      "microphone",
    ],
    contributes: {
      sidebar: {
        title: "提词器",
        icon: "ScrollText",
        entry: "dist/index.html",
      },
    },
    runtime: { entry: "dist/worker.js" },
  }),
)

const manifest = loadInstalledPluginManifest(pluginDir)
assert.equal(manifest.id, "teleprompter")

const registry = createPluginRegistry(root)
registry.register(pluginDir, manifest)
assert.equal(registry.list().length, 1)

const installer = createPluginInstaller(root)
const installed = await installer.installFromDirectory(pluginDir)
assert.equal(installed.manifest.id, "teleprompter")
assert.equal(installed.pluginRoot, join(root, "plugins", "teleprompter"))

const sandboxedRuntime = createSandboxedRuntime()
const sandboxedStatus = await sandboxedRuntime.start({
  manifest: {
    ...manifest,
    kind: "sandboxed",
    permissions: ["storage"],
    runtime: undefined,
  },
  pluginRoot: join(root, "plugins", "teleprompter"),
})
assert.deepEqual(sandboxedStatus, {
  pluginId: "teleprompter",
  kind: "sandboxed",
  running: true,
})
assert.equal((await sandboxedRuntime.stop("teleprompter")).running, false)

const trustedRuntime = createTrustedRuntimeSupervisor()
const trustedStatus = await trustedRuntime.start({
  manifest,
  pluginRoot: join(root, "plugins", "teleprompter"),
})
assert.equal(trustedStatus.pluginId, "teleprompter")
assert.equal(trustedStatus.kind, "trusted")
assert.equal(trustedStatus.running, true)
assert.equal(typeof trustedStatus.endpoint, "string")
assert.equal(trustedRuntime.getEndpoint("teleprompter"), trustedStatus.endpoint ?? null)

const trustedClient = await createPipeClient(trustedStatus.endpoint ?? "")
const trustedRpcResult = await trustedClient.invoke<{
  normalized: string
}>("speech.transcribe", {
  text: "  hello  ",
})
assert.deepEqual(trustedRpcResult, {
  normalized: "hello",
})
await trustedClient.close()
assert.equal((await trustedRuntime.stop("teleprompter")).running, false)
assert.equal(trustedRuntime.getEndpoint("teleprompter"), null)

const symlinkRoot = mkdtempSync(join(tmpdir(), "thunder-plugin-host-symlink-"))
const symlinkPluginDir = join(symlinkRoot, "teleprompter")
mkdirSync(join(symlinkPluginDir, "dist"), { recursive: true })
writeFileSync(join(symlinkPluginDir, "dist", "index.html"), "<html></html>")
writeFileSync(
  join(symlinkPluginDir, "plugin.json"),
  JSON.stringify({
    manifestVersion: 2,
    id: "teleprompter",
    name: "提词器",
    version: "2.0.0",
    description: "plugin",
    kind: "trusted",
    engines: { thunder: "^2.0.0" },
    author: { name: "Thunder" },
    icon: "ScrollText",
    permissions: ["storage", "native-runtime", "filesystem:plugin-data", "microphone"],
    contributes: {
      sidebar: { title: "提词器", icon: "ScrollText", entry: "dist/index.html" },
    },
    runtime: { entry: "dist/worker.js" },
  }),
)
mkdirSync(join(symlinkRoot, "outside-dir"), { recursive: true })
writeFileSync(join(symlinkRoot, "outside-dir", "escape.txt"), "outside")
symlinkSync(
  join(symlinkRoot, "outside-dir"),
  join(symlinkPluginDir, "linked-dir"),
  "junction",
)
await assert.rejects(
  installer.installFromDirectory(symlinkPluginDir),
  /symbolic links/,
)
rmSync(symlinkRoot, { recursive: true, force: true })

console.log("[plugin-host-runtime] tests passed")

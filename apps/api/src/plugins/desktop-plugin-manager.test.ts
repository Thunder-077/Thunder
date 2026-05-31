import { createServer } from "node:http"
import { createHash, generateKeyPairSync, sign } from "node:crypto"
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import assert from "node:assert/strict"
import { c as createTar } from "tar"
import {
  fetchDesktopPluginMarketplace,
  installBundledDesktopPlugin,
  installLocalDesktopPlugin,
  installPackagedDesktopPlugin,
  readDesktopPluginAsset,
  resolveDesktopPluginApiProxyTarget,
  runDesktopPluginMigrations,
  startDesktopPluginRuntime,
  stopDesktopPluginRuntime,
  uninstallDesktopPlugin,
} from "./desktop-plugin-manager"

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex")
}

async function expectRejects(fn: () => Promise<unknown>, label: string): Promise<void> {
  let rejected = false
  try {
    await fn()
  } catch {
    rejected = true
  }
  assert.equal(rejected, true, label)
}

async function main() {
  const workspaceRoot = resolve(process.cwd(), "..", "..")
  const testRoot = resolve(workspaceRoot, ".thunder-plugin-test")
  const examplePlugin = resolve(workspaceRoot, "examples", "desktop-plugins", "hello")

  await rm(testRoot, { recursive: true, force: true })
  await mkdir(testRoot, { recursive: true })

  process.env.THUNDER_ENABLE_DESKTOP_PLUGINS = "1"
  process.env.THUNDER_ALLOW_UNSIGNED_PLUGINS = "1"
  process.env.THUNDER_DESKTOP_DATA_DIR = testRoot
  process.env.DATABASE_URL = `file:${join(testRoot, "app.db")}`
  process.env.THUNDER_BUNDLED_PLUGIN_DIRS = resolve(workspaceRoot, "plugins", "desktop")
  delete process.env.THUNDER_PLUGIN_MARKETPLACE_URL
  delete process.env.THUNDER_PLUGIN_MARKETPLACE_TRUSTED_KEYS

  const bundledMarketplace = await fetchDesktopPluginMarketplace()
  assert.deepEqual(
    bundledMarketplace.plugins.map((plugin) => ({ id: plugin.id, source: plugin.source })),
    [{ id: "teleprompter", source: "bundled" }]
  )
  const bundled = await installBundledDesktopPlugin("teleprompter")
  assert.equal(bundled.record.source, "bundled")
  await uninstallDesktopPlugin("teleprompter")

  const unknownPermissionDir = join(testRoot, "hello-unknown-permission")
  await cp(examplePlugin, unknownPermissionDir, { recursive: true })
  const unknownPermissionManifestPath = join(unknownPermissionDir, "plugin.json")
  const unknownPermissionManifest = JSON.parse(await readFile(unknownPermissionManifestPath, "utf8"))
  unknownPermissionManifest.permissions = [...unknownPermissionManifest.permissions, "unknown-permission"]
  await writeFile(unknownPermissionManifestPath, JSON.stringify(unknownPermissionManifest, null, 2))
  await expectRejects(
    () => installLocalDesktopPlugin({ sourcePath: unknownPermissionDir }),
    "unknown manifest permissions must be denied"
  )

  const missingWebviewDir = join(testRoot, "hello-missing-webview")
  await cp(examplePlugin, missingWebviewDir, { recursive: true })
  const missingWebviewManifestPath = join(missingWebviewDir, "plugin.json")
  const missingWebviewManifest = JSON.parse(await readFile(missingWebviewManifestPath, "utf8"))
  missingWebviewManifest.permissions = missingWebviewManifest.permissions.filter(
    (permission: string) => permission !== "webview"
  )
  await writeFile(missingWebviewManifestPath, JSON.stringify(missingWebviewManifest, null, 2))
  await expectRejects(
    () => installLocalDesktopPlugin({ sourcePath: missingWebviewDir }),
    "plugins with web.entry must declare webview"
  )

  const installed = await installLocalDesktopPlugin({ sourcePath: examplePlugin })
  assert.equal(installed.record.source, "local-directory")

  const asset = await readDesktopPluginAsset("hello-plugin", ["web", "index.html"])
  assert.equal(asset.contentType, "text/html; charset=utf-8")

  const firstMigration = await runDesktopPluginMigrations("hello-plugin")
  const secondMigration = await runDesktopPluginMigrations("hello-plugin")
  assert.equal(firstMigration.applied.length, 1)
  assert.equal(secondMigration.skipped.length, 1)

  const runtime = await startDesktopPluginRuntime("hello-plugin")
  assert.equal(runtime.running, true)
  assert.equal(typeof runtime.port, "number")
  const target = await resolveDesktopPluginApiProxyTarget("hello-plugin", ["status"], "")
  const proxied = await fetch(target.url).then((response) => response.json() as Promise<{ ok: boolean; pluginId: string }>)
  assert.equal(proxied.ok, true)
  assert.equal(proxied.pluginId, "hello-plugin")
  const stopped = await stopDesktopPluginRuntime("hello-plugin")
  assert.equal(stopped.running, false)

  const upgradeDir = join(testRoot, "hello-v101")
  await cp(examplePlugin, upgradeDir, { recursive: true })
  const manifestPath = join(upgradeDir, "plugin.json")
  const upgradedManifest = JSON.parse(await readFile(manifestPath, "utf8"))
  upgradedManifest.version = "1.0.1"
  await writeFile(manifestPath, JSON.stringify(upgradedManifest, null, 2))
  const upgraded = await installLocalDesktopPlugin({ sourcePath: upgradeDir })
  assert.equal(upgraded.manifest.version, "1.0.1")
  const downgraded = await installLocalDesktopPlugin({ sourcePath: examplePlugin })
  assert.equal(downgraded.manifest.version, "1.0.0")
  const auditLog = await readFile(join(testRoot, "plugin-audit.jsonl"), "utf8")
  assert.match(auditLog, /plugin\.upgraded/)

  await uninstallDesktopPlugin("hello-plugin")

  const { publicKey, privateKey } = generateKeyPairSync("ed25519")
  const packageDir = join(testRoot, "packages")
  await mkdir(packageDir, { recursive: true })
  const packagePath = join(packageDir, "hello-plugin.tar.gz")
  await createTar({ gzip: true, file: packagePath, cwd: resolve(examplePlugin, "..") }, ["hello"])
  const manifest = JSON.parse(await readFile(resolve(examplePlugin, "plugin.json"), "utf8"))
  const signature = sign(null, Buffer.from(stableJson(manifest)), privateKey).toString("base64")
  process.env.THUNDER_PLUGIN_TRUSTED_KEYS = JSON.stringify([
    { keyId: "test", publicKey: publicKey.export({ type: "spki", format: "pem" }) },
  ])
  const packaged = await installPackagedDesktopPlugin({
    packageUrl: pathToFileURL(packagePath).toString(),
    packageSha256: sha256(await readFile(packagePath)),
    signature: { keyId: "test", algorithm: "ed25519", signature },
  })
  assert.equal(packaged.manifest.id, "hello-plugin")
  await uninstallDesktopPlugin("hello-plugin")

  const indexBase = {
    version: 1 as const,
    generatedAt: "2026-01-01T00:00:00.000Z",
    plugins: [],
  }
  const indexSignature = sign(null, Buffer.from(stableJson(indexBase)), privateKey).toString("base64")
  let body: unknown = indexBase
  const server = createServer((_, response) => {
    response.setHeader("content-type", "application/json")
    response.end(JSON.stringify(body))
  })
  await new Promise<void>((resolveServer) => server.listen(0, "127.0.0.1", resolveServer))
  const address = server.address()
  assert.equal(typeof address, "object")
  const port = address && typeof address === "object" ? address.port : 0
  process.env.THUNDER_PLUGIN_MARKETPLACE_URL = `http://127.0.0.1:${port}/index.json`
  process.env.THUNDER_PLUGIN_MARKETPLACE_TRUSTED_KEYS = JSON.stringify([
    { keyId: "test", publicKey: publicKey.export({ type: "spki", format: "pem" }) },
  ])
  await expectRejects(() => fetchDesktopPluginMarketplace(), "unsigned marketplace index must be denied")
  body = {
    ...indexBase,
    signature: {
      keyId: "test",
      algorithm: "ed25519",
      signature: indexSignature,
    },
  }
  const index = await fetchDesktopPluginMarketplace()
  assert.deepEqual(
    index.plugins.map((plugin) => ({ id: plugin.id, source: plugin.source })),
    [{ id: "teleprompter", source: "bundled" }]
  )
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()))

  await rm(testRoot, { recursive: true, force: true })
  console.log("[desktop-plugins] tests passed")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

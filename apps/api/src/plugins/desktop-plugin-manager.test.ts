import { createServer } from "node:http"
import { generateKeyPairSync, sign } from "node:crypto"
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import assert from "node:assert/strict"
// @ts-ignore node:sqlite types are provided by the Node runtime used by desktop.
import { DatabaseSync } from "node:sqlite"
import {
  fetchDesktopPluginMarketplace,
  getInstalledPluginV2,
  installBundledDesktopPlugin,
  installPackagedPluginV2,
  listInstalledDesktopPluginsV2,
  readDesktopPluginUiAsset,
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

function ensureActivityLogTable(databasePath: string): void {
  const database = new DatabaseSync(databasePath)
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS "activity_logs" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "module" TEXT NOT NULL,
        "action" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "description" TEXT,
        "metadata_json" TEXT,
        "created_at" TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "activity_logs_created_at_idx" ON "activity_logs"("created_at");
    `)
  } finally {
    database.close()
  }
}

async function main() {
  const workspaceRoot = resolve(process.cwd(), "..", "..")
  const testRoot = resolve(workspaceRoot, ".thunder-plugin-manager-v2-test")

  await rm(testRoot, { recursive: true, force: true })
  await mkdir(testRoot, { recursive: true })

  try {
    process.env.THUNDER_ENABLE_DESKTOP_PLUGINS = "1"
    process.env.THUNDER_ALLOW_UNSIGNED_PLUGINS = "1"
    process.env.THUNDER_DESKTOP_DATA_DIR = testRoot
    const databasePath = join(testRoot, "app.db")
    process.env.DATABASE_URL = `file:${databasePath}`
    ensureActivityLogTable(databasePath)

    const bundledRoot = join(testRoot, "bundled-plugins")
    const bundledTeleprompterRoot = join(bundledRoot, "teleprompter")
    await mkdir(bundledRoot, { recursive: true })
    await cp(resolve(workspaceRoot, "plugins", "desktop", "teleprompter"), bundledTeleprompterRoot, {
      recursive: true,
      filter: (source) => !source.includes(`${resolve(workspaceRoot, "plugins", "desktop", "teleprompter", "node_modules")}`),
    })
    process.env.THUNDER_BUNDLED_PLUGIN_DIRS = bundledRoot

    const marketplace = await fetchDesktopPluginMarketplace()
    assert.deepEqual(
      marketplace.plugins.map((plugin) => ({ id: plugin.id, source: plugin.source })),
      [{ id: "teleprompter", source: "bundled" }],
    )

    const bundled = await installBundledDesktopPlugin("teleprompter")
    assert.equal(bundled.manifest.id, "teleprompter")
    assert.equal(bundled.manifest.kind, "trusted")
    await uninstallDesktopPlugin("teleprompter")

    const stagedPluginRoot = resolve(testRoot, "teleprompter-package")
    await cp(resolve(workspaceRoot, "plugins", "desktop", "teleprompter"), stagedPluginRoot, {
      recursive: true,
      filter: (source) => !source.includes(`${resolve(workspaceRoot, "plugins", "desktop", "teleprompter", "node_modules")}`),
    })
    await mkdir(join(stagedPluginRoot, "dist"), { recursive: true })
    await writeFile(join(stagedPluginRoot, "dist", "index.html"), "<!doctype html><div id=\"root\"></div>\n", "utf8")
    await writeFile(
      join(stagedPluginRoot, "dist", "worker.js"),
      [
        "export default {",
        "  handlers: {",
        "    async ping() {",
        "      return { ok: true }",
        "    },",
        "  },",
        "}",
        "",
      ].join("\n"),
      "utf8",
    )

    const installed = await installPackagedPluginV2({ pluginPath: stagedPluginRoot })
    assert.equal(installed.manifest.id, "teleprompter")

    const plugins = await listInstalledDesktopPluginsV2()
    assert.equal(plugins.length, 1)
    assert.equal(plugins[0]?.manifest.id, "teleprompter")

    const storedPlugin = await getInstalledPluginV2("teleprompter")
    assert.equal(storedPlugin.uiEntryUrl?.includes("/api/v1/desktop/plugins/teleprompter/ui/"), true)

    const uiAsset = await readDesktopPluginUiAsset("teleprompter", ["dist", "index.html"])
    assert.equal(uiAsset.contentType, "text/html; charset=utf-8")
    assert.equal(uiAsset.bytes.toString("utf8").includes("<div id=\"root\"></div>"), true)

    const { publicKey, privateKey } = generateKeyPairSync("ed25519")
    const indexBase = {
      version: 1 as const,
      generatedAt: "2026-01-01T00:00:00.000Z",
      plugins: [],
    }
    const indexSignature = sign(null, Buffer.from(stableJson(indexBase)), privateKey).toString("base64")
    let body: unknown = {
      ...indexBase,
      signature: {
        keyId: "test",
        algorithm: "ed25519",
        signature: indexSignature,
      },
    }

    process.env.THUNDER_PLUGIN_MARKETPLACE_TRUSTED_KEYS = JSON.stringify([
      { keyId: "test", publicKey: publicKey.export({ type: "spki", format: "pem" }) },
    ])

    const server = createServer((_, response) => {
      response.setHeader("content-type", "application/json")
      response.end(JSON.stringify(body))
    })

    try {
      await new Promise<void>((resolveServer) => server.listen(0, "127.0.0.1", resolveServer))
      const address = server.address()
      assert.equal(typeof address, "object")
      const port = address && typeof address === "object" ? address.port : 0
      process.env.THUNDER_PLUGIN_MARKETPLACE_URL = `http://127.0.0.1:${port}/index.json`
      const signedIndex = await fetchDesktopPluginMarketplace()
      assert.equal(signedIndex.plugins.some((plugin) => plugin.id === "teleprompter"), true)
    } finally {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()))
      delete process.env.THUNDER_PLUGIN_MARKETPLACE_URL
      delete process.env.THUNDER_PLUGIN_MARKETPLACE_TRUSTED_KEYS
    }

    await uninstallDesktopPlugin("teleprompter")
    console.log("[desktop-plugin-manager] tests passed")
  } finally {
    await rm(testRoot, { recursive: true, force: true }).catch(() => undefined)
  }
}

void main()

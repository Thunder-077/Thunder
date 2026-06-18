import { createServer } from "node:http"
import { createHash, generateKeyPairSync, sign } from "node:crypto"
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import assert from "node:assert/strict"
// @ts-ignore node:sqlite types are provided by the Node runtime used by desktop.
import { DatabaseSync } from "node:sqlite"
import {
  fetchDesktopPluginMarketplace,
  getInstalledPlugin,
  installBundledDesktopPlugin,
  installPackagedPlugin,
  listInstalledDesktopPlugins,
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

async function pluginManifestSha256(pluginRoot: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(join(pluginRoot, "plugin.json")))
    .digest("hex")
}

async function createTrustedInstallDecision(pluginRoot: string) {
  return {
    acceptedRisk: true,
    kind: "trusted" as const,
    permissions: [
      "storage",
      "notifications",
      "activity",
      "microphone",
      "native-runtime",
      "filesystem:plugin-data",
    ],
    manifestSha256: await pluginManifestSha256(pluginRoot),
    reason: "test trusted install",
  }
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
  const testRoot = resolve(workspaceRoot, ".thunder-plugin-manager-test")

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
    assert.equal(bundled.trust?.source, "official-bundled")
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

    await assert.rejects(
      installPackagedPlugin({ pluginPath: stagedPluginRoot }),
      /需要确认权限和信任风险/,
    )

    const installed = await installPackagedPlugin({
      pluginPath: stagedPluginRoot,
      trustDecision: await createTrustedInstallDecision(stagedPluginRoot),
    })
    assert.equal(installed.manifest.id, "teleprompter")
    assert.equal(installed.trust?.source, "user-confirmed")

    const plugins = await listInstalledDesktopPlugins()
    assert.equal(plugins.length, 1)
    assert.equal(plugins[0]?.manifest.id, "teleprompter")

    const storedPlugin = await getInstalledPlugin("teleprompter")
    assert.equal(storedPlugin.uiEntryUrl?.includes("/api/v1/desktop/plugins/teleprompter/ui/"), true)

    const uiAsset = await readDesktopPluginUiAsset("teleprompter", ["dist", "index.html"])
    assert.equal(uiAsset.contentType, "text/html; charset=utf-8")
    assert.equal(uiAsset.bytes.toString("utf8").includes("<div id=\"root\"></div>"), true)

    const upgradePluginRoot = resolve(testRoot, "teleprompter-upgrade-package")
    await cp(stagedPluginRoot, upgradePluginRoot, { recursive: true })
    const upgradeManifestPath = join(upgradePluginRoot, "plugin.json")
    const upgradeManifest = JSON.parse(await readFile(upgradeManifestPath, "utf8")) as Record<string, unknown>
    upgradeManifest.version = "0.2.0"
    upgradeManifest.name = "提词器升级版"
    await writeFile(upgradeManifestPath, `${JSON.stringify(upgradeManifest, null, 2)}\n`, "utf8")
    await writeFile(join(upgradePluginRoot, "dist", "index.html"), "<!doctype html><div id=\"upgraded\"></div>\n", "utf8")

    await assert.rejects(
      installPackagedPlugin({
        pluginPath: upgradePluginRoot,
        trustDecision: await createTrustedInstallDecision(upgradePluginRoot),
        installTransactionFailurePoint: "after-backup",
      }),
      /测试注入：插件安装备份后失败/,
    )

    const rolledBackPlugin = await getInstalledPlugin("teleprompter")
    assert.equal(rolledBackPlugin.manifest.version, "0.1.0")
    const rolledBackUiAsset = await readDesktopPluginUiAsset("teleprompter", ["dist", "index.html"])
    assert.equal(rolledBackUiAsset.bytes.toString("utf8").includes("<div id=\"root\"></div>"), true)
    assert.equal(rolledBackUiAsset.bytes.toString("utf8").includes("upgraded"), false)
    assert.deepEqual(await readdir(join(testRoot, "plugin-staging")), [])

    const upgradedPlugin = await installPackagedPlugin({
      pluginPath: upgradePluginRoot,
      trustDecision: await createTrustedInstallDecision(upgradePluginRoot),
    })
    assert.equal(upgradedPlugin.manifest.version, "0.2.0")
    const upgradedUiAsset = await readDesktopPluginUiAsset("teleprompter", ["dist", "index.html"])
    assert.equal(upgradedUiAsset.bytes.toString("utf8").includes("<div id=\"upgraded\"></div>"), true)

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

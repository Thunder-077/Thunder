import assert from "node:assert/strict"
import { join, resolve } from "node:path"
import { cp, mkdir, rm, writeFile } from "node:fs/promises"
// @ts-ignore node:sqlite types are provided by the Node runtime used by desktop.
import { DatabaseSync } from "node:sqlite"
import {
  getDesktopPluginRuntimeStatus,
  getInstalledPlugin,
  installPackagedPlugin,
  invokeDesktopPluginWorker,
  readDesktopPluginUiAsset,
  startDesktopPluginRuntime,
  stopDesktopPluginRuntime,
  uninstallDesktopPlugin,
} from "./desktop-plugin-manager"

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
  const testRoot = resolve(workspaceRoot, ".thunder-plugin-e2e-test")

  await rm(testRoot, { recursive: true, force: true })
  await mkdir(testRoot, { recursive: true })

  try {
    process.env.THUNDER_ENABLE_DESKTOP_PLUGINS = "1"
    process.env.THUNDER_ALLOW_UNSIGNED_PLUGINS = "1"
    process.env.THUNDER_DESKTOP_DATA_DIR = testRoot
    const databasePath = join(testRoot, "app.db")
    process.env.DATABASE_URL = `file:${databasePath}`
    ensureActivityLogTable(databasePath)

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
        "    async \"speech.transcribe\"(payload) {",
        "      return { normalized: String(payload?.text ?? '').trim() }",
        "    },",
        "    async \"speech.models.list\"() {",
        "      return []",
        "    },",
        "  },",
        "}",
        "",
      ].join("\n"),
      "utf8",
    )

    const plugin = await installPackagedPlugin({
      pluginPath: stagedPluginRoot,
    })

    assert.equal(plugin.manifest.id, "teleprompter")
    assert.equal(plugin.manifest.kind, "trusted")
    assert.equal(plugin.manifest.permissions.includes("native-runtime"), true)

    const installedPlugin = await getInstalledPlugin("teleprompter")
    assert.equal(installedPlugin.manifest.id, "teleprompter")
    assert.equal(installedPlugin.uiEntryUrl?.includes("/api/v1/desktop/plugins/teleprompter/ui/"), true)
    assert.equal(installedPlugin.manifest.permissions.includes("microphone"), true)
    assert.equal(installedPlugin.manifest.permissions.includes("filesystem:plugin-data"), true)

    const uiAsset = await readDesktopPluginUiAsset("teleprompter", ["dist", "index.html"])
    assert.equal(uiAsset.contentType, "text/html; charset=utf-8")
    assert.equal(uiAsset.bytes.toString("utf8").includes("<div id=\"root\"></div>"), true)

    const initialRuntimeStatus = getDesktopPluginRuntimeStatus("teleprompter")
    assert.equal(initialRuntimeStatus.running, false)

    const startedRuntimeStatus = await startDesktopPluginRuntime("teleprompter")
    assert.equal(startedRuntimeStatus.running, true)
    assert.equal(typeof startedRuntimeStatus.endpoint, "string")

    const workerResult = await invokeDesktopPluginWorker("teleprompter", "speech.transcribe", {
      text: "  hello thunder v2  ",
    }) as { normalized: string }
    assert.deepEqual(workerResult, { normalized: "hello thunder v2" })

    const stoppedRuntimeStatus = await stopDesktopPluginRuntime("teleprompter")
    assert.equal(stoppedRuntimeStatus.running, false)

    await uninstallDesktopPlugin("teleprompter")

    console.log("[desktop-plugin-e2e] tests passed")
  } finally {
    await rm(testRoot, { recursive: true, force: true }).catch(() => undefined)
  }
}

void main()

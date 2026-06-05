import assert from "node:assert/strict"
import { join, resolve } from "node:path"
import { cp, mkdir, rm, writeFile } from "node:fs/promises"
import { getInstalledPluginV2, installPackagedPluginV2, uninstallDesktopPlugin } from "./desktop-plugin-manager"

async function main() {
  const workspaceRoot = resolve(process.cwd(), "..", "..")
  const testRoot = resolve(workspaceRoot, ".thunder-plugin-v2-test")

  await rm(testRoot, { recursive: true, force: true })
  await mkdir(testRoot, { recursive: true })

  try {
    process.env.THUNDER_ENABLE_DESKTOP_PLUGINS = "1"
    process.env.THUNDER_ALLOW_UNSIGNED_PLUGINS = "1"
    process.env.THUNDER_DESKTOP_DATA_DIR = testRoot
    process.env.DATABASE_URL = `file:${join(testRoot, "app.db")}`

    const stagedPluginRoot = resolve(testRoot, "teleprompter-package")
    await cp(resolve(workspaceRoot, "plugins-v2", "teleprompter"), stagedPluginRoot, {
      recursive: true,
      filter: (source) => !source.includes(`${resolve(workspaceRoot, "plugins-v2", "teleprompter", "node_modules")}`),
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

    const plugin = await installPackagedPluginV2({
      pluginPath: stagedPluginRoot,
    })

    assert.equal(plugin.manifest.id, "teleprompter")
    assert.equal(plugin.manifest.kind, "trusted")
    assert.equal(plugin.manifest.permissions.includes("native-runtime"), true)

    const installedPlugin = await getInstalledPluginV2("teleprompter")
    assert.equal(installedPlugin.manifest.id, "teleprompter")
    assert.equal(installedPlugin.uiEntryUrl?.includes("/api/v1/desktop/plugins/teleprompter/ui/"), true)

    await uninstallDesktopPlugin("teleprompter")

    console.log("[plugin-v2-e2e] tests passed")
  } finally {
    await rm(testRoot, { recursive: true, force: true }).catch(() => undefined)
  }
}

void main()

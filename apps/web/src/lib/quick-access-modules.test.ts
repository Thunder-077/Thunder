import assert from "node:assert/strict"
import type { ModuleManifest } from "@thunder/core"
import type { InstalledDesktopPlugin } from "@/lib/desktop-plugins"
import { buildQuickAccessModules } from "./quick-access-modules"

function createModule(id: string, order: number): ModuleManifest {
  return {
    id,
    name: `Module ${id}`,
    description: "Test module",
    icon: "Package",
    route: `/modules/${id}`,
    category: "tools",
    order,
    enabled: true,
  }
}

function createPlugin(id: string, order: number): InstalledDesktopPlugin {
  return {
    manifest: {
      manifestVersion: 1,
      id,
      name: `Plugin ${id}`,
      version: "1.0.0",
      description: "Plugin description",
      icon: "Package",
      category: "tools",
      order,
      author: { name: "Thunder" },
      permissions: ["webview"],
      web: { entry: "web/index.html" },
    },
    record: {
      id,
      version: "1.0.0",
      installedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      source: "package-url",
      sourceRef: "https://example.com/plugin.tgz",
      manifestSha256: "sha256",
    },
    route: `/plugins/${id}`,
    webEntryUrl: `https://example.com/${id}`,
    installed: true,
  }
}

function main() {
  const modules = [createModule("vault", 10), createModule("emby", 30)]
  const plugins = [createPlugin("teleprompter", 20)]

  const result = buildQuickAccessModules(modules, plugins)

  assert.deepEqual(
    result.map((item) => ({ id: item.id, route: item.route })),
    [
      { id: "vault", route: "/modules/vault" },
      { id: "plugin:teleprompter", route: "/plugins/teleprompter" },
      { id: "emby", route: "/modules/emby" },
    ]
  )

  console.log("[quick-access-modules] tests passed")
}

main()

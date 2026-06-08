import { resolve } from "node:path"
import type { ThunderPluginManifest } from "@thunder/plugin-schema"
import type { PluginRegistry, RegisteredPlugin } from "./types"

export function createPluginRegistry(root: string): PluginRegistry {
  const normalizedRoot = resolve(root)
  const plugins = new Map<string, RegisteredPlugin>()

  return {
    root: normalizedRoot,
    register(pluginRoot: string, manifest: ThunderPluginManifest) {
      const plugin = {
        pluginRoot: resolve(pluginRoot),
        manifest,
      }

      plugins.set(manifest.id, plugin)
      return plugin
    },
    get(id: string) {
      return plugins.get(id) ?? null
    },
    has(id: string) {
      return plugins.has(id)
    },
    list() {
      return [...plugins.values()]
    },
  }
}

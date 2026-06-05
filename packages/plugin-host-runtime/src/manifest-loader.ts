import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { parseThunderPluginManifest } from "@thunder/plugin-schema"
import type { LoadedPluginManifest } from "./types"

export function loadInstalledPluginManifest(pluginRoot: string): LoadedPluginManifest["manifest"] {
  const normalizedRoot = resolve(pluginRoot)
  const manifestPath = join(normalizedRoot, "plugin.json")
  const content = readFileSync(manifestPath, "utf8")

  return parseThunderPluginManifest(JSON.parse(content))
}

export function loadInstalledPluginManifestRecord(pluginRoot: string): LoadedPluginManifest {
  const normalizedRoot = resolve(pluginRoot)

  return {
    manifest: loadInstalledPluginManifest(normalizedRoot),
    pluginRoot: normalizedRoot,
    manifestPath: join(normalizedRoot, "plugin.json"),
  }
}

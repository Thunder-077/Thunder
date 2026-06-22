import { access, readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { parseThunderPluginManifest, type ThunderPluginManifest } from "@thunder/plugin-schema"

export interface PluginProject {
  rootDir: string
  manifestPath: string
  manifest: ThunderPluginManifest
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function loadPluginProject(rootDir: string): Promise<PluginProject> {
  const resolvedRoot = resolve(rootDir)
  const manifestPath = join(resolvedRoot, "plugin.json")
  const manifest = parseThunderPluginManifest(
    JSON.parse(await readFile(manifestPath, "utf8")),
  )

  return {
    rootDir: resolvedRoot,
    manifestPath,
    manifest,
  }
}

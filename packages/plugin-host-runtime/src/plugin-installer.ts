import { cp, lstat, mkdir, readdir, rm } from "node:fs/promises"
import { join, resolve } from "node:path"
import { PLUGIN_ID_PATTERN } from "@thunder/plugin-schema"
import { loadInstalledPluginManifest } from "./manifest-loader"
import type { PluginInstallResult, PluginInstaller } from "./types"

function assertSafePluginId(pluginId: string): void {
  if (!PLUGIN_ID_PATTERN.test(pluginId)) {
    throw new Error(`Invalid plugin id for host runtime install: ${pluginId}`)
  }
}

function assertPathInside(childPath: string, parentPath: string): void {
  const normalizedChild = resolve(childPath)
  const normalizedParent = resolve(parentPath)

  if (
    normalizedChild !== normalizedParent &&
    !normalizedChild.startsWith(`${normalizedParent}\\`) &&
    !normalizedChild.startsWith(`${normalizedParent}/`)
  ) {
    throw new Error(`Plugin install path escaped host runtime root: ${normalizedChild}`)
  }
}

async function assertNoSymlinks(currentPath: string): Promise<void> {
  const currentStat = await lstat(currentPath)
  if (currentStat.isSymbolicLink()) {
    throw new Error(`Plugin install source cannot contain symbolic links: ${currentPath}`)
  }

  if (!currentStat.isDirectory()) {
    return
  }

  const entries = await readdir(currentPath, { withFileTypes: true })
  for (const entry of entries) {
    await assertNoSymlinks(join(currentPath, entry.name))
  }
}

export function createPluginInstaller(root: string): PluginInstaller {
  const normalizedRoot = resolve(root)
  const pluginsDir = join(normalizedRoot, "plugins")

  return {
    root: normalizedRoot,
    pluginsDir,
    async installFromDirectory(sourcePath: string): Promise<PluginInstallResult> {
      const sourceRoot = resolve(sourcePath)
      const manifest = loadInstalledPluginManifest(sourceRoot)
      assertSafePluginId(manifest.id)
      await assertNoSymlinks(sourceRoot)

      const targetRoot = join(pluginsDir, manifest.id)
      assertPathInside(targetRoot, pluginsDir)

      await mkdir(pluginsDir, { recursive: true })
      await rm(targetRoot, { recursive: true, force: true })
      await cp(sourceRoot, targetRoot, { recursive: true, force: true })

      return {
        manifest,
        pluginRoot: targetRoot,
      }
    },
  }
}

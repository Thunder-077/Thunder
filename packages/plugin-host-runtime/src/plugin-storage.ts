import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import type { PluginStorage } from "./types"

const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9-]{1,62}$/

function assertSafePluginId(pluginId: string): void {
  if (!PLUGIN_ID_PATTERN.test(pluginId)) {
    throw new Error(`Invalid plugin id for host runtime storage: ${pluginId}`)
  }
}

function getPluginStoragePath(storageRoot: string, pluginId: string): string {
  assertSafePluginId(pluginId)

  const path = join(storageRoot, `${pluginId}.json`)
  const normalizedPath = resolve(path)
  const normalizedRoot = resolve(storageRoot)

  if (
    normalizedPath !== normalizedRoot &&
    !normalizedPath.startsWith(`${normalizedRoot}\\`) &&
    !normalizedPath.startsWith(`${normalizedRoot}/`)
  ) {
    throw new Error(`Plugin storage path escaped host runtime storage root: ${normalizedPath}`)
  }

  return normalizedPath
}

function readStorageFile(path: string): Record<string, unknown> {
  if (!existsSync(path)) {
    return {}
  }

  try {
    const content = readFileSync(path, "utf8")
    return JSON.parse(content) as Record<string, unknown>
  } catch {
    return {}
  }
}

export function createPluginStorage(root: string): PluginStorage {
  const normalizedRoot = resolve(root)
  const storageRoot = join(normalizedRoot, ".storage")

  mkdirSync(storageRoot, { recursive: true })

  return {
    root: storageRoot,
    get<T>(pluginId: string, key: string) {
      const path = getPluginStoragePath(storageRoot, pluginId)
      const data = readStorageFile(path)
      return (data[key] as T | undefined) ?? null
    },
    set(pluginId, key, value) {
      const path = getPluginStoragePath(storageRoot, pluginId)
      const data = readStorageFile(path)

      data[key] = value
      writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8")
    },
    delete(pluginId, key) {
      const path = getPluginStoragePath(storageRoot, pluginId)
      const data = readStorageFile(path)

      if (!(key in data)) {
        return false
      }

      delete data[key]
      writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8")
      return true
    },
  }
}

import { readdir } from "node:fs/promises"
import { join } from "node:path"
import type { ThunderPluginManifest } from "@thunder/plugin-schema"
import type {
  DesktopPluginInstallRecord,
  InstalledDesktopPlugin,
} from "./desktop-plugin-types"
import {
  DesktopPluginError,
  assertPluginId,
  ensureDirs,
  getPluginDirs,
  isLocalSqliteDatabase,
  parseInstallRecord,
  readJsonFile,
  readManifest,
  readManifestVersion,
} from "./desktop-plugin-internal"

let pluginRuntimeEnabled: boolean | null = null

/**
 * 判断桌面插件系统是否启用。
 * 结果按进程缓存，避免每次请求重复读取环境变量和数据库 URL。
 */
export function isDesktopPluginRuntimeEnabled(): boolean {
  if (pluginRuntimeEnabled === null) {
    pluginRuntimeEnabled =
      process.env.THUNDER_TARGET_PLATFORM === "desktop" ||
      process.env.NEXT_PUBLIC_PLATFORM === "desktop" ||
      process.env.THUNDER_ENABLE_DESKTOP_PLUGINS === "1" ||
      isLocalSqliteDatabase()
  }
  return pluginRuntimeEnabled
}

/**
 * 测试专用：重置启用状态缓存，便于测试用例修改环境变量后重新计算。
 */
export function _resetPluginRuntimeEnabledCache(): void {
  pluginRuntimeEnabled = null
}

export function toInstalledPlugin(
  manifest: ThunderPluginManifest,
  pluginRoot: string,
  trust: DesktopPluginInstallRecord["trust"],
  installedAt?: string,
  updatedAt?: string,
): InstalledDesktopPlugin {
  const sidebarEntry = manifest.contributes?.sidebar?.entry ?? null

  return {
    manifest,
    pluginRoot,
    trust,
    route: `/plugins/${manifest.id}`,
    uiEntryUrl: sidebarEntry ? `/api/v1/desktop/plugins/${manifest.id}/ui/${sidebarEntry}` : null,
    installedAt,
    updatedAt,
    installed: true,
  }
}

/**
 * 扫描安装目录并返回有效的 manifestVersion 2 插件。
 * 无效目录会被忽略并输出警告，不阻断其他插件加载。
 */
export async function listInstalledDesktopPlugins(): Promise<InstalledDesktopPlugin[]> {
  if (!isDesktopPluginRuntimeEnabled()) return []

  await ensureDirs()
  const { pluginsDir } = getPluginDirs()
  const entries = await readdir(pluginsDir, { withFileTypes: true }).catch(() => [])
  const plugins: InstalledDesktopPlugin[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const pluginRoot = join(pluginsDir, entry.name)
    try {
      if ((await readManifestVersion(pluginRoot)) !== 2) {
        continue
      }
      const manifest = await readManifest(pluginRoot)
      const installRecord = await readJsonFile(join(pluginRoot, ".thunder-install.json"), parseInstallRecord).catch(() => null)
      plugins.push(toInstalledPlugin(manifest, pluginRoot, installRecord?.trust, installRecord?.installedAt, installRecord?.updatedAt))
    } catch (error) {
      console.warn("[desktop-plugins] ignored invalid plugin", entry.name, error)
    }
  }

  return plugins.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name))
}

/**
 * 读取单个已安装插件，并统一把不存在或无效 manifest 映射为 404。
 */
export async function getInstalledPlugin(id: string): Promise<InstalledDesktopPlugin> {
  assertPluginId(id)
  if (!isDesktopPluginRuntimeEnabled()) {
    throw new DesktopPluginError("插件未安装", 404)
  }

  await ensureDirs()
  const { pluginsDir } = getPluginDirs()
  const pluginRoot = join(pluginsDir, id)
  if ((await readManifestVersion(pluginRoot).catch(() => 0)) !== 2) {
    throw new DesktopPluginError("插件未安装", 404)
  }

  try {
    const manifest = await readManifest(pluginRoot)
    const installRecord = await readJsonFile(join(pluginRoot, ".thunder-install.json"), parseInstallRecord).catch(() => null)
    return toInstalledPlugin(manifest, pluginRoot, installRecord?.trust, installRecord?.installedAt, installRecord?.updatedAt)
  } catch {
    throw new DesktopPluginError("插件未安装", 404)
  }
}

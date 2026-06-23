import { randomUUID } from "node:crypto"
import { cp, mkdir, readFile, rm, stat, writeFile, rename } from "node:fs/promises"
import { join, resolve } from "node:path"
import { satisfiesSemverRange } from "@thunder/plugin-schema"
import type {
  DesktopPluginInstallRecord,
  InstalledDesktopPlugin,
} from "./desktop-plugin-types"
import { recordActivity } from "../modules/activity/activity-service"
import {
  closePluginStorageConnection,
} from "./desktop-plugin-storage"
import {
  createDesktopPluginTrustRecord,
  type DesktopPluginTrustDecision,
} from "./desktop-plugin-trust"
import {
  DesktopPluginError,
  appendAudit,
  assertNoSymlinks,
  assertPathInside,
  assertPluginId,
  ensureDirs,
  getBundledPluginRoots,
  getPluginDirs,
  isPathInside,
  parseInstallRecord,
  pathExists,
  readJsonFile,
  readManifest,
  readManifestVersion,
  sha256,
} from "./desktop-plugin-internal"
import {
  getInstalledPlugin,
  isDesktopPluginRuntimeEnabled,
  toInstalledPlugin,
} from "./desktop-plugin-registry"
import { stopDesktopPluginRuntime } from "./desktop-plugin-runtime-service"

const pluginOperationLocks = new Map<string, Promise<void>>()

/**
 * 当前 Thunder 平台版本，用于校验插件 engines.thunder 兼容范围。
 */
const THUNDER_PLATFORM_VERSION = process.env.THUNDER_VERSION ?? "0.1.1"

export interface InstallLocalPluginOptions {
  pluginPath: string
  trustDecision?: DesktopPluginTrustDecision
  trustSource?: "user-confirmed" | "official-bundled"
  /**
   * 测试专用故障注入点。HTTP 安装入口不会传入该字段。
   */
  installTransactionFailurePoint?: "after-backup" | "after-target-install"
}

export function clearPluginOperationLocksForShutdown(): void {
  pluginOperationLocks.clear()
}

async function withPluginOperationLock<T>(pluginId: string, operation: () => Promise<T>): Promise<T> {
  const previousOperation = pluginOperationLocks.get(pluginId) ?? Promise.resolve()
  let releaseCurrentOperation!: () => void
  const currentOperation = new Promise<void>((resolveCurrentOperation) => {
    releaseCurrentOperation = resolveCurrentOperation
  })
  const activeOperation = previousOperation.catch(() => undefined).then(() => currentOperation)

  pluginOperationLocks.set(pluginId, activeOperation)
  await previousOperation.catch(() => undefined)

  try {
    return await operation()
  } finally {
    releaseCurrentOperation()
    if (pluginOperationLocks.get(pluginId) === activeOperation) {
      pluginOperationLocks.delete(pluginId)
    }
  }
}

async function replaceInstalledPluginDirectory(options: {
  pluginId: string
  targetDir: string
  preparedDir: string
  backupDir: string
  failurePoint?: InstallLocalPluginOptions["installTransactionFailurePoint"]
}): Promise<void> {
  const { pluginsDir, stagingDir } = getPluginDirs()
  await assertPathInside(pluginsDir, options.targetDir)
  await assertPathInside(stagingDir, options.preparedDir)
  await assertPathInside(stagingDir, options.backupDir)

  let backupCreated = false
  let preparedInstalled = false

  try {
    if (await pathExists(options.targetDir)) {
      await rm(options.backupDir, { recursive: true, force: true })
      await rename(options.targetDir, options.backupDir)
      backupCreated = true

      if (options.failurePoint === "after-backup") {
        throw new DesktopPluginError("测试注入：插件安装备份后失败", 500)
      }
    }

    await rename(options.preparedDir, options.targetDir)
    preparedInstalled = true

    if (options.failurePoint === "after-target-install") {
      throw new DesktopPluginError("测试注入：插件安装切换后失败", 500)
    }

    if (backupCreated) {
      await rm(options.backupDir, { recursive: true, force: true })
    }
  } catch (error) {
    // 替换失败时优先恢复旧版本目录，避免升级失败后插件消失。
    if (preparedInstalled) {
      await rm(options.targetDir, { recursive: true, force: true }).catch(() => undefined)
    }
    if (backupCreated && (await pathExists(options.backupDir))) {
      await rm(options.targetDir, { recursive: true, force: true }).catch(() => undefined)
      await rename(options.backupDir, options.targetDir)
    }
    throw error
  }
}

async function appendInstallFailureAudit(
  pluginId: string,
  version: string,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error)
  await appendAudit("plugin.install-failed", {
    pluginId,
    version,
    message,
  }).catch((auditError) => {
    console.error("[desktop-plugins] Failed to append install failure audit", auditError)
  })
}

export async function installPackagedPlugin(
  options: InstallLocalPluginOptions,
): Promise<InstalledDesktopPlugin> {
  if (!isDesktopPluginRuntimeEnabled()) {
    throw new DesktopPluginError("插件系统仅在桌面端启用", 403)
  }

  await ensureDirs()
  const sourcePath = resolve(options.pluginPath)
  const sourceStat = await stat(sourcePath).catch(() => null)
  if (!sourceStat?.isDirectory()) {
    throw new DesktopPluginError("pluginPath 必须是已解压的正式插件目录")
  }

  if ((await readManifestVersion(sourcePath)) !== 2) {
    throw new DesktopPluginError("当前只支持正式插件 manifest")
  }

  const manifest = await readManifest(sourcePath)
  const manifestSha256 = sha256(await readFile(join(sourcePath, "plugin.json")))

  // 安装前校验平台版本，避免不兼容插件进入正式目录。
  if (
    manifest.engines?.thunder &&
    manifest.engines.thunder !== "*" &&
    !satisfiesSemverRange(THUNDER_PLATFORM_VERSION, manifest.engines.thunder)
  ) {
    throw new DesktopPluginError(
      `插件要求 Thunder ${manifest.engines.thunder}，当前版本为 ${THUNDER_PLATFORM_VERSION}`,
    )
  }

  await assertNoSymlinks(sourcePath)

  const { pluginsDir, stagingDir } = getPluginDirs()
  const targetDir = join(pluginsDir, manifest.id)
  const transactionDir = join(stagingDir, `${manifest.id}-${Date.now()}-${randomUUID()}`)
  const preparedDir = join(transactionDir, "prepared")
  const backupDir = join(transactionDir, "backup")
  await assertPathInside(pluginsDir, targetDir)
  await assertPathInside(stagingDir, transactionDir)
  await assertPathInside(stagingDir, preparedDir)
  await assertPathInside(stagingDir, backupDir)

  await rm(transactionDir, { recursive: true, force: true })
  await mkdir(transactionDir, { recursive: true })
  await cp(sourcePath, preparedDir, { recursive: true, dereference: true })

  try {
    return await withPluginOperationLock(manifest.id, async () => {
      const previousPlugin = await getInstalledPlugin(manifest.id).catch(() => null)
      const previousRecord = previousPlugin
        ? await readJsonFile(join(previousPlugin.pluginRoot, ".thunder-install.json"), parseInstallRecord).catch(() => null)
        : null
      const trust = createDesktopPluginTrustRecord({
        manifest,
        manifestSha256,
        previousRecord,
        source: options.trustSource ?? "user-confirmed",
        decision: options.trustDecision,
      })

      const now = new Date().toISOString()
      const installRecord: DesktopPluginInstallRecord = {
        id: manifest.id,
        version: manifest.version,
        installedAt: previousPlugin?.installedAt ?? now,
        updatedAt: now,
        source: "local-directory",
        sourceRef: sourcePath,
        manifestSha256,
        trust,
      }

      await writeFile(join(preparedDir, ".thunder-install.json"), `${JSON.stringify(installRecord, null, 2)}\n`, "utf8")
      await readManifest(preparedDir)

      try {
        if (previousPlugin) {
          await stopDesktopPluginRuntime(manifest.id)
        }

        await replaceInstalledPluginDirectory({
          pluginId: manifest.id,
          targetDir,
          preparedDir,
          backupDir,
          failurePoint: options.installTransactionFailurePoint,
        })
      } catch (error) {
        await appendInstallFailureAudit(manifest.id, manifest.version, error)
        throw error
      }

      await appendAudit(previousPlugin ? "plugin.upgraded" : "plugin.installed", {
        pluginId: manifest.id,
        version: manifest.version,
        source: installRecord.source,
        sourceRef: installRecord.sourceRef,
        trustSource: trust.source,
        highRiskPermissions: trust.highRiskPermissions,
      })

      try {
        await recordActivity({
          module: `plugin:${manifest.id}`,
          action: previousPlugin ? "plugin.upgraded" : "plugin.installed",
          title: previousPlugin ? `升级了插件 ${manifest.name}` : `安装了插件 ${manifest.name}`,
        })
      } catch (error) {
        console.error("[plugin-activity] Failed to record activity", error)
      }

      return toInstalledPlugin(manifest, targetDir, installRecord.trust, installRecord.installedAt, installRecord.updatedAt)
    })
  } finally {
    await rm(transactionDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function findBundledPluginSource(pluginId: string): Promise<string> {
  assertPluginId(pluginId)

  for (const root of getBundledPluginRoots()) {
    const sourcePath = resolve(root, pluginId)
    if (!isPathInside(sourcePath, root)) continue
    if (!(await pathExists(join(sourcePath, "plugin.json")))) continue
    if ((await readManifestVersion(sourcePath).catch(() => 0)) !== 2) continue
    return sourcePath
  }

  throw new DesktopPluginError("内置插件不存在或未随应用打包", 404)
}

async function prepareBundledPluginSource(sourcePath: string, pluginId: string): Promise<string> {
  await ensureDirs()
  const { stagingDir } = getPluginDirs()
  const preparedSource = join(stagingDir, `${pluginId}-bundled-source-${Date.now()}-${randomUUID()}`)
  const excludedDevelopmentDirs = new Set(["node_modules", ".turbo"])

  // 仓库内官方插件是 workspace 包，开发态会出现 node_modules symlink。
  // bundled 安装只需要运行产物和 manifest，先过滤开发目录再交给通用安装事务。
  await cp(sourcePath, preparedSource, {
    recursive: true,
    dereference: false,
    filter: (source) => {
      const name = source.split(/[\\/]/).at(-1)
      return !name || !excludedDevelopmentDirs.has(name)
    },
  })
  return preparedSource
}

export async function installBundledDesktopPlugin(pluginId: string): Promise<InstalledDesktopPlugin> {
  const sourcePath = await findBundledPluginSource(pluginId)
  const preparedSource = await prepareBundledPluginSource(sourcePath, pluginId)

  let plugin: InstalledDesktopPlugin
  try {
    plugin = await installPackagedPlugin({
      pluginPath: preparedSource,
      trustSource: "official-bundled",
    })
  } finally {
    await rm(preparedSource, { recursive: true, force: true }).catch(() => undefined)
  }

  await appendAudit("plugin.bundled-installed", {
    pluginId: plugin.manifest.id,
    version: plugin.manifest.version,
    sourcePath,
  })

  try {
    await recordActivity({
      module: `plugin:${plugin.manifest.id}`,
      action: "plugin.bundled-installed",
      title: `启用了内置插件 ${plugin.manifest.name}`,
    })
  } catch (error) {
    console.error("[plugin-activity] Failed to record activity", error)
  }

  return plugin
}

export async function uninstallDesktopPlugin(id: string): Promise<void> {
  assertPluginId(id)
  await withPluginOperationLock(id, async () => {
    await stopDesktopPluginRuntime(id)
    closePluginStorageConnection(id)

    const { pluginsDir } = getPluginDirs()
    const targetDir = join(pluginsDir, id)
    await assertPathInside(pluginsDir, targetDir)
    const plugin = await getInstalledPlugin(id).catch(() => null)
    await rm(targetDir, { recursive: true, force: true })

    // 清理插件私有存储，避免卸载后留下旧版本本地数据。
    try {
      const { pluginDataDir } = getPluginDirs()
      const storageDir = join(pluginDataDir, id)
      await rm(storageDir, { recursive: true, force: true })
    } catch (storageCleanupError) {
      console.warn("[desktop-plugins] Failed to clean up plugin storage data", storageCleanupError)
    }

    await appendAudit("plugin.uninstalled", {
      pluginId: id,
      version: plugin?.manifest.version,
    })

    try {
      await recordActivity({
        module: `plugin:${id}`,
        action: "plugin.uninstalled",
        title: `卸载了插件 ${plugin?.manifest.name ?? id}`,
      })
    } catch (error) {
      console.error("[plugin-activity] Failed to record activity", error)
    }
  })
}

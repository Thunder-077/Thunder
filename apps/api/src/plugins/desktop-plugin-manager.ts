import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { dirname, extname, join, resolve, sep } from "node:path"
import {
  createTrustedRuntimeSupervisor,
  PluginRuntimeError,
} from "@thunder/plugin-host-runtime"
import type {
  DesktopPluginInstallRecord,
  DesktopPluginRuntimeStatus,
  InstalledDesktopPlugin,
} from "./desktop-plugin-types"
import { recordActivity } from "../modules/activity/activity-service"
import {
  assertPluginTrustedForRuntime,
  createDesktopPluginTrustRecord,
  type DesktopPluginTrustDecision,
} from "./desktop-plugin-trust"
import {
  DesktopPluginError,
  getDesktopPluginRoot,
  getPluginDirs,
  getBundledPluginRoots,
  isPathInside,
  ensureDirs,
  appendAudit,
  assertPluginId,
  readJsonFile,
  parseInstallRecord,
  pathExists,
  assertNoSymlinks,
  assertPathInside,
  readManifestVersion,
  readManifest,
  sha256,
  isLocalSqliteDatabase,
} from "./desktop-plugin-internal"

// Re-export for backward compatibility (consumed by routes, network, tests)
export { DesktopPluginError, getDesktopPluginRoot } from "./desktop-plugin-internal"

const STATIC_CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
}
const trustedRuntimeSupervisor = createTrustedRuntimeSupervisor()
const pluginOperationLocks = new Map<string, Promise<void>>()

export interface InstallLocalPluginOptions {
  pluginPath: string
  trustDecision?: DesktopPluginTrustDecision
  trustSource?: "user-confirmed" | "official-bundled"
  /**
   * 测试专用故障注入点。HTTP 安装入口不会传入该字段。
   */
  installTransactionFailurePoint?: "after-backup" | "after-target-install"
}

export interface StaticPluginAsset {
  bytes: Buffer
  contentType: string
  contentSecurityPolicy?: string
  etag?: string
  lastModified?: string
}

export function isDesktopPluginRuntimeEnabled(): boolean {
  return (
    process.env.THUNDER_TARGET_PLATFORM === "desktop" ||
    process.env.NEXT_PUBLIC_PLATFORM === "desktop" ||
    process.env.THUNDER_ENABLE_DESKTOP_PLUGINS === "1" ||
    isLocalSqliteDatabase()
  )
}

async function getTrustedPluginDataDirectory(
  plugin: InstalledDesktopPlugin,
): Promise<string | undefined> {
  if (!plugin.manifest.permissions.includes("filesystem:plugin-data")) {
    return undefined
  }
  const { pluginDataDir } = getPluginDirs()
  const dataDirectory = resolve(pluginDataDir, plugin.manifest.id)
  await assertPathInside(pluginDataDir, dataDirectory)
  await mkdir(dataDirectory, { recursive: true })
  return dataDirectory
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

export function toInstalledPlugin(
  manifest: import("@thunder/plugin-schema").ThunderPluginManifest,
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

export async function installBundledDesktopPlugin(pluginId: string): Promise<InstalledDesktopPlugin> {
  const sourcePath = await findBundledPluginSource(pluginId)
  const plugin = await installPackagedPlugin({
    pluginPath: sourcePath,
    trustSource: "official-bundled",
  })

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

export async function readDesktopPluginUiAsset(id: string, assetPathParts: string[]): Promise<StaticPluginAsset> {
  const plugin = await getInstalledPlugin(id)
  const sidebarEntry = plugin.manifest.contributes?.sidebar?.entry
  if (!sidebarEntry) {
    throw new DesktopPluginError("插件未声明 UI 入口", 404)
  }

  const requestedAsset = assetPathParts.join("/")
  const resolvedAssetPath = resolve(plugin.pluginRoot, requestedAsset)
  await assertPathInside(plugin.pluginRoot, resolvedAssetPath)

  const sidebarRoot = dirname(resolve(plugin.pluginRoot, sidebarEntry))
  if (!isPathInside(resolvedAssetPath, sidebarRoot) && resolvedAssetPath !== resolve(plugin.pluginRoot, sidebarEntry)) {
    throw new DesktopPluginError("插件 UI 资源路径越界", 403)
  }

  const fileStat = await stat(resolvedAssetPath).catch(() => null)
  if (!fileStat || !fileStat.isFile()) {
    throw new DesktopPluginError("插件 UI 资源不存在", 404)
  }

  const bytes = await readFile(resolvedAssetPath)

  // Weak ETag based on file size + mtime — cheap to compute, good enough
  // for immutable build artifacts that only change on plugin re-install.
  const etag = `W/"${fileStat.size.toString(16)}-${fileStat.mtimeMs.toString(16)}"`
  const lastModified = fileStat.mtime.toUTCString()

  return {
    bytes,
    contentType: STATIC_CONTENT_TYPES[extname(resolvedAssetPath).toLowerCase()] ?? "application/octet-stream",
    contentSecurityPolicy:
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'",
    etag,
    lastModified,
  }
}

// ---- Runtime Management ----

async function startTrustedDesktopPluginRuntime(
  plugin: InstalledDesktopPlugin,
  manual = false,
): Promise<DesktopPluginRuntimeStatus> {
  if (plugin.manifest.kind !== "trusted") {
    throw new DesktopPluginError("当前仅支持 trusted runtime", 501)
  }
  const installRecord = await readJsonFile(join(plugin.pluginRoot, ".thunder-install.json"), parseInstallRecord).catch(() => null)
  assertPluginTrustedForRuntime(installRecord, plugin.manifest)

  const currentStatus = trustedRuntimeSupervisor.getStatus(plugin.manifest.id)
  if (currentStatus.running) {
    return toDesktopPluginRuntimeStatus(currentStatus)
  }

  const status = await trustedRuntimeSupervisor.start(
    {
      manifest: plugin.manifest,
      pluginRoot: plugin.pluginRoot,
      dataDirectory: await getTrustedPluginDataDirectory(plugin),
    },
    { manual },
  )

  return toDesktopPluginRuntimeStatus(status)
}

function toDesktopPluginRuntimeStatus(
  status: import("@thunder/plugin-host-runtime").PluginRuntimeStatus,
): DesktopPluginRuntimeStatus {
  return {
    pluginId: status.pluginId,
    phase: status.phase,
    running: status.running,
    pid: status.pid,
    startedAt: status.startedAt,
    lastExitAt: status.lastExitAt,
    lastExitCode: status.lastExitCode,
    lastExitSignal: status.lastExitSignal,
    consecutiveCrashCount: status.consecutiveCrashCount,
    circuitOpenUntil: status.circuitOpenUntil,
    lastError: status.lastError,
  }
}

export async function startDesktopPluginRuntime(id: string): Promise<DesktopPluginRuntimeStatus> {
  const plugin = await getInstalledPlugin(id)
  return startTrustedDesktopPluginRuntime(plugin, true)
}

export async function stopDesktopPluginRuntime(id: string): Promise<DesktopPluginRuntimeStatus> {
  assertPluginId(id)
  const status = await trustedRuntimeSupervisor.stop(id)
  return toDesktopPluginRuntimeStatus(status)
}

export function getDesktopPluginRuntimeStatus(id: string): DesktopPluginRuntimeStatus {
  assertPluginId(id)
  const status = trustedRuntimeSupervisor.getStatus(id)
  return toDesktopPluginRuntimeStatus(status)
}

export async function invokeDesktopPluginWorker(
  id: string,
  method: string,
  payload: unknown,
): Promise<unknown> {
  const plugin = await getInstalledPlugin(id)
  if (plugin.manifest.kind !== "trusted") {
    throw new DesktopPluginError("当前仅支持 trusted worker.invoke", 501)
  }
  if (!plugin.manifest.permissions.includes("native-runtime")) {
    throw new DesktopPluginError("插件未声明 native-runtime 权限", 403)
  }

  try {
    return await trustedRuntimeSupervisor.invoke(
      {
        manifest: plugin.manifest,
        pluginRoot: plugin.pluginRoot,
        dataDirectory: await getTrustedPluginDataDirectory(plugin),
      },
      method,
      payload,
    )
  } catch (error) {
    if (error instanceof PluginRuntimeError) {
      const status =
        error.code === "RUNTIME_CIRCUIT_OPEN" ||
        error.code === "RPC_CONCURRENCY_LIMIT"
          ? 429
          : error.code === "RPC_TIMEOUT"
            ? 504
            : error.code === "RUNTIME_CRASHED" ||
                error.code === "RUNTIME_NOT_READY" ||
                error.code === "RUNTIME_START_FAILED"
              ? 503
              : 502
      throw new DesktopPluginError(error.message, status)
    }
    throw error
  }
}

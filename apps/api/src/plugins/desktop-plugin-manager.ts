import { constants as fsConstants } from "node:fs"
import { access, appendFile, cp, lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises"
import { createHash, createPublicKey, randomUUID, verify } from "node:crypto"
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep, extname } from "node:path"
import {
  createTrustedRuntimeSupervisor,
  PluginRuntimeError,
} from "@thunder/plugin-host-runtime"
import { parseThunderPluginManifest } from "@thunder/plugin-schema"
import type {
  DesktopPluginInstallRecord,
  DesktopPluginSchemaManifest,
  DesktopPluginMarketplaceIndex,
  DesktopPluginRuntimeStatus,
  InstalledDesktopPlugin,
} from "./desktop-plugin-types"
// @ts-ignore node:sqlite types are provided by the Node runtime
import { DatabaseSync } from "node:sqlite"
import { normalizePluginStorageKey } from "@thunder/plugin-protocol"
import { recordActivity } from "../modules/activity/activity-service"
import {
  assertPluginTrustedForRuntime,
  createDesktopPluginTrustRecord,
  getHighRiskPluginPermissions,
  pluginRequiresTrustConfirmation,
  type DesktopPluginTrustDecision,
} from "./desktop-plugin-trust"

const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9-]{1,62}$/
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

export class DesktopPluginError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message)
  }
}

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

function isLocalSqliteDatabase(): boolean {
  const url = process.env.DATABASE_URL ?? ""
  return url.startsWith("file:") || url.startsWith("sqlite:")
}

function workspaceFallbackDataDir(): string {
  return resolve(process.cwd(), ".thunder", "desktop")
}

function normalizeFileDatabasePath(databaseUrl: string): string | null {
  if (!databaseUrl.startsWith("file:") && !databaseUrl.startsWith("sqlite:")) {
    return null
  }

  const raw = databaseUrl.replace(/^sqlite:/, "").replace(/^file:/, "")
  return resolve(raw)
}

export function getDesktopPluginRoot(): string {
  if (process.env.THUNDER_DESKTOP_DATA_DIR) {
    return resolve(process.env.THUNDER_DESKTOP_DATA_DIR)
  }

  const dbPath = process.env.DATABASE_URL ? normalizeFileDatabasePath(process.env.DATABASE_URL) : null
  if (dbPath) {
    return dirname(dbPath)
  }

  return workspaceFallbackDataDir()
}

function getPluginDirs() {
  const root = getDesktopPluginRoot()
  return {
    root,
    pluginsDir: join(root, "plugins"),
    stagingDir: join(root, "plugin-staging"),
    pluginDataDir: join(root, "plugin-data"),
    auditLogPath: join(root, "plugin-audit.jsonl"),
  }
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

async function assertInstalledPluginPermission(
  pluginId: string,
  permission: string,
): Promise<void> {
  const plugin = await getInstalledPlugin(pluginId)
  if (!plugin.manifest.permissions.some((item) => item === permission)) {
    throw new DesktopPluginError(`插件未声明 ${permission} 权限`, 403)
  }
}

function getBundledPluginRoots(): string[] {
  const configuredRoots = (process.env.THUNDER_BUNDLED_PLUGIN_DIRS ?? "")
    .split(delimiter)
    .map((item) => item.trim())
    .filter(Boolean)

  const cwd = process.cwd()
  const candidates = [
    ...configuredRoots,
    join(cwd, "plugins", "desktop"),
    join(cwd, "runtime", "plugins", "desktop"),
    join(cwd, "..", "plugins", "desktop"),
    join(cwd, "..", "..", "plugins", "desktop"),
  ].map((item) => resolve(item))

  return [...new Set(candidates)]
}

function isPathInside(childPath: string, parentPath: string): boolean {
  const child = resolve(childPath)
  const parent = resolve(parentPath)
  const path = relative(parent, child)
  return path === "" || (!path.startsWith("..") && !isAbsolute(path))
}

async function ensureDirs(): Promise<void> {
  const dirs = getPluginDirs()
  await mkdir(dirs.pluginsDir, { recursive: true })
  await mkdir(dirs.stagingDir, { recursive: true })
}

async function appendAudit(event: string, details: Record<string, unknown>): Promise<void> {
  await ensureDirs()
  const { auditLogPath } = getPluginDirs()
  const record = {
    event,
    at: new Date().toISOString(),
    ...details,
  }
  await appendFile(auditLogPath, `${JSON.stringify(record)}\n`, "utf8")
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

function assertPluginId(id: string): void {
  if (!PLUGIN_ID_PATTERN.test(id)) {
    throw new DesktopPluginError("插件 id 只能使用小写字母、数字和连字符，并且必须以字母开头")
  }
}

function assertRelativeAssetPath(path: string, label: string): void {
  if (!path || path.startsWith("/") || path.startsWith("\\") || path.includes("..")) {
    throw new DesktopPluginError(`${label} 必须是插件目录内的相对路径`)
  }
}

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T
}

async function pathExists(path: string): Promise<boolean> {
  return access(path, fsConstants.F_OK)
    .then(() => true)
    .catch(() => false)
}

async function assertNoSymlinks(current: string): Promise<void> {
  const entries = await readdir(current, { withFileTypes: true })
  for (const entry of entries) {
    const entryPath = join(current, entry.name)
    const entryStat = await lstat(entryPath)
    if (entryStat.isSymbolicLink()) {
      throw new DesktopPluginError("插件目录不能包含符号链接")
    }
    if (entry.isDirectory()) {
      await assertNoSymlinks(entryPath)
    }
  }
}

async function assertPathInside(root: string, target: string): Promise<void> {
  const normalizedRoot = resolve(root)
  const normalizedTarget = resolve(target)
  if (normalizedTarget !== normalizedRoot && !normalizedTarget.startsWith(`${normalizedRoot}${sep}`)) {
    throw new DesktopPluginError("插件路径越界访问被拒绝", 403)
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

async function readManifestVersion(pluginRoot: string): Promise<number> {
  const manifest = await readJsonFile<{ manifestVersion?: unknown }>(join(pluginRoot, "plugin.json"))
  return typeof manifest.manifestVersion === "number" ? manifest.manifestVersion : 0
}

async function readManifest(pluginRoot: string): Promise<DesktopPluginSchemaManifest> {
  const manifest = parseThunderPluginManifest(await readJsonFile(join(pluginRoot, "plugin.json")))
  const sidebarEntry = manifest.contributes?.sidebar?.entry

  if (sidebarEntry) {
    assertRelativeAssetPath(sidebarEntry, "插件 contributes.sidebar.entry")
    const uiEntryPath = resolve(pluginRoot, sidebarEntry)
    await assertPathInside(pluginRoot, uiEntryPath)
    if (!(await pathExists(uiEntryPath))) {
      throw new DesktopPluginError("插件 contributes.sidebar.entry 指向的文件不存在")
    }
  }

  if (manifest.runtime?.entry) {
    assertRelativeAssetPath(manifest.runtime.entry, "插件 runtime.entry")
    const runtimeEntryPath = resolve(pluginRoot, manifest.runtime.entry)
    await assertPathInside(pluginRoot, runtimeEntryPath)
    if (!(await pathExists(runtimeEntryPath))) {
      throw new DesktopPluginError("插件 runtime.entry 指向的文件不存在")
    }
  }

  return manifest
}

function sha256(buffer: Buffer | string): string {
  return createHash("sha256").update(buffer).digest("hex")
}

export function toInstalledPlugin(
  manifest: DesktopPluginSchemaManifest,
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
      const installRecord = await readJsonFile<DesktopPluginInstallRecord>(join(pluginRoot, ".thunder-install.json")).catch(() => null)
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
    const installRecord = await readJsonFile<DesktopPluginInstallRecord>(join(pluginRoot, ".thunder-install.json")).catch(() => null)
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
        ? await readJsonFile<DesktopPluginInstallRecord>(join(previousPlugin.pluginRoot, ".thunder-install.json")).catch(() => null)
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

async function startTrustedDesktopPluginRuntime(
  plugin: InstalledDesktopPlugin,
  manual = false,
): Promise<DesktopPluginRuntimeStatus> {
  if (plugin.manifest.kind !== "trusted") {
    throw new DesktopPluginError("当前仅支持 trusted runtime", 501)
  }
  const installRecord = await readJsonFile<DesktopPluginInstallRecord>(join(plugin.pluginRoot, ".thunder-install.json")).catch(() => null)
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

// ---- Plugin Storage (SQLite) ----

const MAX_PLUGIN_STORAGE_BYTES = 1024 * 1024
const MAX_PLUGIN_STORAGE_VALUE_BYTES = 256 * 1024

function getStorageDbPath(pluginId: string): string {
  const { pluginDataDir } = getPluginDirs()
  return join(pluginDataDir, pluginId, "storage.db")
}

function openStorageDb(pluginId: string): DatabaseSync {
  const dbPath = getStorageDbPath(pluginId)
  const db = new DatabaseSync(dbPath)
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      size INTEGER NOT NULL
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      total_bytes INTEGER NOT NULL DEFAULT 0
    )
  `)
  // Ensure meta row exists
  db.exec(`INSERT OR IGNORE INTO meta (id, total_bytes) VALUES (1, 0)`)
  return db
}

export async function getPluginStorage(pluginId: string, key: string): Promise<unknown | null> {
  assertPluginId(pluginId)
  await assertInstalledPluginPermission(pluginId, "storage")
  const dbPath = getStorageDbPath(pluginId)
  await mkdir(dirname(dbPath), { recursive: true })
  const db = openStorageDb(pluginId)
  try {
    const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | undefined
    if (!row) return null
    return JSON.parse(row.value)
  } finally {
    db.close()
  }
}

export async function setPluginStorage(pluginId: string, key: string, value: unknown): Promise<void> {
  assertPluginId(pluginId)
  await assertInstalledPluginPermission(pluginId, "storage")
  const normalizedKey = normalizePluginStorageKey(key)
  const serialized = JSON.stringify(value ?? null)
  const newSize = new TextEncoder().encode(serialized).byteLength
  if (newSize > MAX_PLUGIN_STORAGE_VALUE_BYTES) {
    throw new DesktopPluginError("插件单个存储值超过 256 KiB", 413)
  }

  const dbPath = getStorageDbPath(pluginId)
  await mkdir(dirname(dbPath), { recursive: true })
  const db = openStorageDb(pluginId)
  try {
    const existing = db.prepare("SELECT size FROM kv WHERE key = ?").get(normalizedKey) as { size: number } | undefined
    const oldSize = existing?.size ?? 0
    const meta = db.prepare("SELECT total_bytes FROM meta WHERE id = 1").get() as { total_bytes: number }
    const currentBytes = meta.total_bytes
    const nextBytes = currentBytes - oldSize + newSize
    if (nextBytes > MAX_PLUGIN_STORAGE_BYTES) {
      throw new DesktopPluginError("插件存储空间超过 1 MiB", 413)
    }

    db.exec("BEGIN IMMEDIATE")
    try {
      db.prepare("INSERT OR REPLACE INTO kv (key, value, size) VALUES (?, ?, ?)").run(normalizedKey, serialized, newSize)
      db.prepare("UPDATE meta SET total_bytes = ? WHERE id = 1").run(nextBytes)
      db.exec("COMMIT")
    } catch (err) {
      db.exec("ROLLBACK")
      throw err
    }
  } finally {
    db.close()
  }
}

export async function removePluginStorage(pluginId: string, key: string): Promise<void> {
  assertPluginId(pluginId)
  await assertInstalledPluginPermission(pluginId, "storage")
  const normalizedKey = normalizePluginStorageKey(key)
  const dbPath = getStorageDbPath(pluginId)
  await mkdir(dirname(dbPath), { recursive: true })
  const db = openStorageDb(pluginId)
  try {
    const existing = db.prepare("SELECT size FROM kv WHERE key = ?").get(normalizedKey) as { size: number } | undefined
    if (!existing) return

    const meta = db.prepare("SELECT total_bytes FROM meta WHERE id = 1").get() as { total_bytes: number }
    const nextBytes = Math.max(0, meta.total_bytes - existing.size)

    db.exec("BEGIN IMMEDIATE")
    try {
      db.prepare("DELETE FROM kv WHERE key = ?").run(normalizedKey)
      db.prepare("UPDATE meta SET total_bytes = ? WHERE id = 1").run(nextBytes)
      db.exec("COMMIT")
    } catch (err) {
      db.exec("ROLLBACK")
      throw err
    }
  } finally {
    db.close()
  }
}

export async function listPluginStorageKeys(pluginId: string): Promise<string[]> {
  assertPluginId(pluginId)
  await assertInstalledPluginPermission(pluginId, "storage")
  const dbPath = getStorageDbPath(pluginId)
  await mkdir(dirname(dbPath), { recursive: true })
  const db = openStorageDb(pluginId)
  try {
    const rows = db.prepare("SELECT key FROM kv ORDER BY key").all() as { key: string }[]
    return rows.map((r) => r.key)
  } finally {
    db.close()
  }
}

export async function clearPluginStorage(pluginId: string): Promise<void> {
  assertPluginId(pluginId)
  await assertInstalledPluginPermission(pluginId, "storage")
  const dbPath = getStorageDbPath(pluginId)
  await mkdir(dirname(dbPath), { recursive: true })
  const db = openStorageDb(pluginId)
  try {
    db.exec("BEGIN IMMEDIATE")
    try {
      db.exec("DELETE FROM kv")
      db.prepare("UPDATE meta SET total_bytes = 0 WHERE id = 1").run()
      db.exec("COMMIT")
    } catch (err) {
      db.exec("ROLLBACK")
      throw err
    }
  } finally {
    db.close()
  }
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

async function listBundledMarketplaceEntries(): Promise<DesktopPluginMarketplaceIndex["plugins"]> {
  const entries: DesktopPluginMarketplaceIndex["plugins"] = []

  for (const root of getBundledPluginRoots()) {
    const rootEntries = await readdir(root, { withFileTypes: true }).catch(() => [])
    for (const entry of rootEntries) {
      if (!entry.isDirectory()) continue
      const sourcePath = resolve(root, entry.name)
      if (!isPathInside(sourcePath, root)) continue
      if ((await readManifestVersion(sourcePath).catch(() => 0)) !== 2) continue

      const manifest = await readManifest(sourcePath).catch(() => null)
      const sidebarEntry = manifest?.contributes?.sidebar?.entry
      if (!manifest || !sidebarEntry) continue
      if (!(await pathExists(join(sourcePath, sidebarEntry)))) continue

      entries.push({
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description ?? "",
        icon: manifest.icon ?? "Package",
        category: "tools",
        author: manifest.author ?? { name: "Thunder" },
        permissions: [...manifest.permissions],
        kind: manifest.kind,
        highRiskPermissions: getHighRiskPluginPermissions(manifest),
        requiresTrustConfirmation: pluginRequiresTrustConfirmation(manifest),
        manifestSha256: sha256(await readFile(join(sourcePath, "plugin.json"))),
        source: "bundled",
      })
    }
  }

  return mergeMarketplaceEntries(entries).sort((a, b) => a.name.localeCompare(b.name))
}

function mergeMarketplaceEntries(entries: DesktopPluginMarketplaceIndex["plugins"]): DesktopPluginMarketplaceIndex["plugins"] {
  const map = new Map<string, DesktopPluginMarketplaceIndex["plugins"][number]>()
  for (const entry of entries) {
    map.set(entry.id, entry)
  }
  return [...map.values()]
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

function trustedKeys(): Map<string, string> {
  const raw = process.env.THUNDER_PLUGIN_TRUSTED_KEYS
  if (!raw) return new Map()

  try {
    const parsed = JSON.parse(raw) as Array<{ keyId: string; publicKey: string }>
    return new Map(parsed.map((item) => [item.keyId, item.publicKey]))
  } catch {
    throw new DesktopPluginError("THUNDER_PLUGIN_TRUSTED_KEYS 必须是 JSON 数组")
  }
}

function marketplaceTrustedKeys(): Map<string, string> {
  const raw = process.env.THUNDER_PLUGIN_MARKETPLACE_TRUSTED_KEYS
  if (!raw) return trustedKeys()

  try {
    const parsed = JSON.parse(raw) as Array<{ keyId: string; publicKey: string }>
    return new Map(parsed.map((item) => [item.keyId, item.publicKey]))
  } catch {
    throw new DesktopPluginError("THUNDER_PLUGIN_MARKETPLACE_TRUSTED_KEYS 必须是 JSON 数组")
  }
}

function verifyMarketplaceIndex(index: DesktopPluginMarketplaceIndex): void {
  const keys = marketplaceTrustedKeys()
  if (keys.size === 0) return
  if (!index.signature) {
    throw new DesktopPluginError("插件市场索引缺少签名", 403)
  }
  if (index.signature.algorithm !== "ed25519") {
    throw new DesktopPluginError("插件市场索引签名算法仅支持 ed25519", 403)
  }

  const publicKey = keys.get(index.signature.keyId)
  if (!publicKey) {
    throw new DesktopPluginError(`插件市场索引 keyId 未被信任: ${index.signature.keyId}`, 403)
  }

  const { signature, ...signedIndex } = index
  const ok = verify(
    null,
    Buffer.from(stableJson(signedIndex)),
    createPublicKey(publicKey),
    Buffer.from(signature.signature, "base64"),
  )
  if (!ok) {
    throw new DesktopPluginError("插件市场索引签名校验失败", 403)
  }
}

export async function fetchDesktopPluginMarketplace(): Promise<DesktopPluginMarketplaceIndex> {
  const bundledPlugins = await listBundledMarketplaceEntries()
  const indexUrl = process.env.THUNDER_PLUGIN_MARKETPLACE_URL
  if (!indexUrl) {
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      plugins: bundledPlugins,
    }
  }

  const response = await fetch(indexUrl)
  if (!response.ok) {
    throw new DesktopPluginError(`插件市场索引拉取失败: ${response.status}`, 502)
  }

  const index = (await response.json()) as DesktopPluginMarketplaceIndex
  if (index.version !== 1 || !Array.isArray(index.plugins)) {
    throw new DesktopPluginError("插件市场索引格式不正确", 502)
  }

  verifyMarketplaceIndex(index)
  return {
    ...index,
    plugins: mergeMarketplaceEntries([...bundledPlugins, ...index.plugins]),
  }
}

import { constants as fsConstants } from "node:fs"
import { access, appendFile, cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import { spawn, type ChildProcess } from "node:child_process"
import { createHash, createPublicKey, verify } from "node:crypto"
import { delimiter, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { createServer } from "node:net"
// @ts-ignore node:sqlite types are provided by the Node runtime used by desktop.
import { DatabaseSync } from "node:sqlite"
import { x as extractTar } from "tar"
import type {
  DesktopPluginMigrationRecord,
  DesktopPluginInstallRecord,
  DesktopPluginManifest,
  DesktopPluginMarketplaceIndex,
  DesktopPluginRuntimeStatus,
  DesktopPluginTrustRecord,
  InstalledDesktopPlugin,
} from "./desktop-plugin-types"

const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9-]{1,62}$/
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/
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
const RUNTIME_START_TIMEOUT_MS = 10_000
const RUNTIME_STOP_TIMEOUT_MS = 5_000

export class DesktopPluginError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message)
  }
}

export interface InstallLocalPluginOptions {
  sourcePath: string
  expectedSha256?: string
  signature?: DesktopPluginInstallRecord["signature"]
}

interface InstallLocalPluginInternalOptions extends InstallLocalPluginOptions {
  allowUnsignedBundled?: boolean
  source?: DesktopPluginInstallRecord["source"]
}

export interface InstallPackagePluginOptions {
  packageUrl: string
  packageSha256: string
  signature: DesktopPluginInstallRecord["signature"]
}

export interface StaticPluginAsset {
  bytes: Buffer
  contentType: string
  contentSecurityPolicy?: string
}

export interface DesktopPluginProxyTarget {
  url: string
}

export interface DesktopPluginMigrationResult {
  pluginId: string
  applied: DesktopPluginMigrationRecord[]
  skipped: DesktopPluginMigrationRecord[]
}

interface RuntimeProcessRecord {
  pluginId: string
  child: ChildProcess
  port: number
  baseUrl: string
  startedAt: string
}

const runtimeProcesses = new Map<string, RuntimeProcessRecord>()
const runtimeStatus = new Map<string, DesktopPluginRuntimeStatus>()

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
    backupsDir: join(root, "plugin-backups"),
    stagingDir: join(root, "plugin-staging"),
    stateDir: join(root, "plugin-state"),
    auditLogPath: join(root, "plugin-audit.jsonl"),
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

async function findBundledPluginSource(pluginId: string): Promise<string> {
  assertPluginId(pluginId)

  for (const root of getBundledPluginRoots()) {
    const sourcePath = resolve(root, pluginId)
    if (!isPathInside(sourcePath, root)) {
      continue
    }
    const manifestPath = join(sourcePath, "plugin.json")
    if (await pathExists(manifestPath)) {
      return sourcePath
    }
  }

  throw new DesktopPluginError("内置插件不存在或未随应用打包", 404)
}

function trustRecordPath(pluginRoot: string): string {
  return join(pluginRoot, ".thunder-trust.json")
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

function sha256(buffer: Buffer | string): string {
  return createHash("sha256").update(buffer).digest("hex")
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

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new DesktopPluginError(`${label} 不能为空`)
  }
}

function validateManifest(input: unknown): DesktopPluginManifest {
  const manifest = input as DesktopPluginManifest
  if (!manifest || typeof manifest !== "object") {
    throw new DesktopPluginError("插件 manifest 必须是对象")
  }
  if (manifest.manifestVersion !== 1) {
    throw new DesktopPluginError("仅支持 manifestVersion=1 的插件")
  }

  assertString(manifest.id, "插件 id")
  assertPluginId(manifest.id)
  assertString(manifest.name, "插件名称")
  assertString(manifest.version, "插件版本")
  if (!SEMVER_PATTERN.test(manifest.version)) {
    throw new DesktopPluginError("插件版本必须是 semver 格式，例如 1.0.0")
  }
  assertString(manifest.description, "插件描述")
  assertString(manifest.icon, "插件图标")
  assertString(manifest.category, "插件分类")
  assertString(manifest.author?.name, "插件作者")
  assertString(manifest.web?.entry, "插件 web.entry")
  assertRelativeAssetPath(manifest.web.entry, "插件 web.entry")

  if (!Array.isArray(manifest.permissions)) {
    throw new DesktopPluginError("插件 permissions 必须是数组")
  }

  if (manifest.api) {
    if (!manifest.api.baseUrl && !manifest.api.runtime) {
      throw new DesktopPluginError("插件 api 必须声明 baseUrl 或 runtime")
    }
    if (manifest.api.baseUrl) {
      const baseUrl = new URL(manifest.api.baseUrl)
      const isLoopback =
        baseUrl.hostname === "127.0.0.1" || baseUrl.hostname === "localhost" || baseUrl.hostname === "::1"
      if (!isLoopback) {
        throw new DesktopPluginError("插件本地 API 代理只允许指向 loopback 地址")
      }
    }
    if (manifest.api.runtime) {
      if (manifest.api.runtime.kind !== "node") {
        throw new DesktopPluginError("插件后端 runtime 仅支持 node")
      }
      assertString(manifest.api.runtime.entry, "插件 api.runtime.entry")
      assertRelativeAssetPath(manifest.api.runtime.entry, "插件 api.runtime.entry")
      for (const arg of manifest.api.runtime.args ?? []) {
        if (arg.includes("..")) {
          throw new DesktopPluginError("插件 api.runtime.args 不能包含路径越界片段")
        }
      }
    }
    if (!manifest.permissions.includes("local-api-proxy")) {
      throw new DesktopPluginError("声明 api 的插件必须申请 local-api-proxy 权限")
    }
  }

  if (manifest.migrations?.sqlite) {
    assertRelativeAssetPath(manifest.migrations.sqlite, "插件 migrations.sqlite")
  }

  return manifest
}

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T
}

async function pathExists(path: string): Promise<boolean> {
  return access(path, fsConstants.F_OK)
    .then(() => true)
    .catch(() => false)
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

function allowUnsignedPlugins(): boolean {
  return process.env.THUNDER_ALLOW_UNSIGNED_PLUGINS === "1" || process.env.NODE_ENV !== "production"
}

function verifyManifestSignature(
  manifest: DesktopPluginManifest,
  signature?: DesktopPluginInstallRecord["signature"]
): void {
  if (!signature) {
    if (allowUnsignedPlugins()) return
    throw new DesktopPluginError("生产环境禁止安装未签名插件", 403)
  }

  if (signature.algorithm !== "ed25519") {
    throw new DesktopPluginError("插件签名算法仅支持 ed25519")
  }

  const publicKey = trustedKeys().get(signature.keyId)
  if (!publicKey) {
    throw new DesktopPluginError(`插件签名 keyId 未被信任: ${signature.keyId}`, 403)
  }

  const key = createPublicKey(publicKey)
  const ok = verify(null, Buffer.from(stableJson(manifest)), key, Buffer.from(signature.signature, "base64"))
  if (!ok) {
    throw new DesktopPluginError("插件签名校验失败", 403)
  }
}

async function readManifest(pluginRoot: string): Promise<DesktopPluginManifest> {
  const manifest = validateManifest(await readJsonFile(join(pluginRoot, "plugin.json")))
  const entryPath = resolve(pluginRoot, manifest.web.entry)
  await assertPathInside(pluginRoot, entryPath)
  if (!(await pathExists(entryPath))) {
    throw new DesktopPluginError("插件 web.entry 指向的文件不存在")
  }
  if (manifest.migrations?.sqlite) {
    const migrationDir = resolve(pluginRoot, manifest.migrations.sqlite)
    await assertPathInside(pluginRoot, migrationDir)
  }
  if (manifest.api?.runtime) {
    const runtimeEntry = resolve(pluginRoot, manifest.api.runtime.entry)
    await assertPathInside(pluginRoot, runtimeEntry)
    if (!(await pathExists(runtimeEntry))) {
      throw new DesktopPluginError("插件 api.runtime.entry 指向的文件不存在")
    }
  }
  return manifest
}

async function assertPathInside(root: string, target: string): Promise<void> {
  const normalizedRoot = resolve(root)
  const normalizedTarget = resolve(target)
  if (normalizedTarget !== normalizedRoot && !normalizedTarget.startsWith(`${normalizedRoot}${sep}`)) {
    throw new DesktopPluginError("插件路径越界访问被拒绝", 403)
  }
}

async function ensureDirs(): Promise<void> {
  const dirs = getPluginDirs()
  await mkdir(dirs.pluginsDir, { recursive: true })
  await mkdir(dirs.backupsDir, { recursive: true })
  await mkdir(dirs.stagingDir, { recursive: true })
  await mkdir(dirs.stateDir, { recursive: true })
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

function backupName(id: string, version: string): string {
  return `${id}-${version}-${new Date().toISOString().replace(/[:.]/g, "-")}`
}

async function backupInstalledPlugin(pluginRoot: string, manifest: DesktopPluginManifest): Promise<string | null> {
  const pluginStat = await stat(pluginRoot).catch(() => null)
  if (!pluginStat?.isDirectory()) return null

  const { backupsDir } = getPluginDirs()
  const backupDir = join(backupsDir, backupName(manifest.id, manifest.version))
  await cp(pluginRoot, backupDir, { recursive: true, dereference: true })
  await appendAudit("plugin.backup.created", {
    pluginId: manifest.id,
    version: manifest.version,
    backupDir,
  })
  return backupDir
}

function shouldPreserveTrust(
  previousTrust: DesktopPluginTrustRecord,
  manifestSha256: string,
  permissions: string[]
): boolean {
  if (!previousTrust.trusted) return false
  if (previousTrust.manifestSha256 === manifestSha256) return true
  const previousPermissions = [...(previousTrust.permissionsSnapshot ?? [])].sort().join(",")
  const nextPermissions = [...permissions].sort().join(",")
  return previousPermissions === nextPermissions
}

async function downloadPackage(packageUrl: string, expectedSha256: string): Promise<string> {
  const url = new URL(packageUrl)
  if (url.protocol !== "https:" && url.protocol !== "file:") {
    throw new DesktopPluginError("插件包只允许通过 https 或 file URL 安装", 403)
  }

  const tempDir = await mkdtemp(join(tmpdir(), "thunder-plugin-"))
  const packagePath = join(tempDir, "plugin.tar.gz")

  if (url.protocol === "file:") {
    const sourcePath = fileURLToPath(url)
    await cp(sourcePath, packagePath)
  } else {
    const response = await fetch(url)
    if (!response.ok || !response.body) {
      throw new DesktopPluginError(`插件包下载失败: ${response.status}`, 502)
    }
    const bytes = Buffer.from(await response.arrayBuffer())
    await writeFile(packagePath, bytes)
  }

  const actualSha256 = sha256(await readFile(packagePath))
  if (actualSha256 !== expectedSha256) {
    throw new DesktopPluginError("插件包 sha256 校验失败", 403)
  }

  return packagePath
}

function toInstalledPlugin(
  manifest: DesktopPluginManifest,
  record: DesktopPluginInstallRecord,
  trust: DesktopPluginTrustRecord
): InstalledDesktopPlugin {
  return {
    manifest,
    record,
    trust,
    route: `/plugins/${manifest.id}`,
    webEntryUrl: `/api/v1/desktop/plugins/${manifest.id}/web/${manifest.web.entry}`,
    installed: true,
  }
}

async function readPluginTrust(pluginRoot: string): Promise<DesktopPluginTrustRecord> {
  return readJsonFile<DesktopPluginTrustRecord>(trustRecordPath(pluginRoot)).catch(() => ({
    trusted: false,
  }))
}

async function writePluginTrust(pluginRoot: string, trust: DesktopPluginTrustRecord): Promise<void> {
  await writeFile(trustRecordPath(pluginRoot), `${JSON.stringify(trust, null, 2)}\n`, "utf8")
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
      const manifest = await readManifest(pluginRoot)
      const record = await readJsonFile<DesktopPluginInstallRecord>(join(pluginRoot, ".thunder-install.json"))
      const trust = await readPluginTrust(pluginRoot)
      plugins.push(toInstalledPlugin(manifest, record, trust))
    } catch (error) {
      console.warn("[desktop-plugins] ignored invalid plugin", entry.name, error)
    }
  }

  return plugins.sort((a, b) => (a.manifest.order ?? 1000) - (b.manifest.order ?? 1000))
}

export async function getInstalledDesktopPlugin(id: string): Promise<InstalledDesktopPlugin> {
  assertPluginId(id)
  const plugin = (await listInstalledDesktopPlugins()).find((item) => item.manifest.id === id)
  if (!plugin) {
    throw new DesktopPluginError("插件未安装", 404)
  }
  return plugin
}

async function installLocalDesktopPluginInternal(
  options: InstallLocalPluginInternalOptions
): Promise<InstalledDesktopPlugin> {
  if (!isDesktopPluginRuntimeEnabled()) {
    throw new DesktopPluginError("插件系统仅在桌面端启用", 403)
  }
  await ensureDirs()
  const sourcePath = resolve(options.sourcePath)
  const sourceStat = await stat(sourcePath).catch(() => null)
  if (!sourceStat?.isDirectory()) {
    throw new DesktopPluginError("当前安装接口需要传入已解压的本地插件目录")
  }

  const manifest = await readManifest(sourcePath)
  if (!options.allowUnsignedBundled) {
    verifyManifestSignature(manifest, options.signature)
  }

  const manifestBuffer = await readFile(join(sourcePath, "plugin.json"))
  const manifestSha256 = sha256(manifestBuffer)
  if (options.expectedSha256 && options.expectedSha256 !== manifestSha256) {
    throw new DesktopPluginError("插件 manifest sha256 校验失败", 403)
  }

  const { pluginsDir, stagingDir } = getPluginDirs()
  const targetDir = join(pluginsDir, manifest.id)
  const stageDir = join(stagingDir, `${manifest.id}-${Date.now()}`)
  const previousManifest = await readManifest(targetDir).catch(() => null)
  const previousTrust = previousManifest ? await readPluginTrust(targetDir) : { trusted: false }

  await rm(stageDir, { recursive: true, force: true })
  await cp(sourcePath, stageDir, { recursive: true, dereference: true })

  const now = new Date().toISOString()
  const installRecord: DesktopPluginInstallRecord = {
    id: manifest.id,
    version: manifest.version,
    installedAt: now,
    updatedAt: now,
    source: options.source ?? "local-directory",
    sourceRef: sourcePath,
    manifestSha256,
    signature: options.signature,
  }
  await writeFile(join(stageDir, ".thunder-install.json"), `${JSON.stringify(installRecord, null, 2)}\n`, "utf8")
  if (previousManifest) {
    await stopDesktopPluginRuntime(manifest.id)
    await backupInstalledPlugin(targetDir, previousManifest)
  }
  await rm(targetDir, { recursive: true, force: true })
  await cp(stageDir, targetDir, { recursive: true, dereference: true })
  await rm(stageDir, { recursive: true, force: true })

  const trust = shouldPreserveTrust(previousTrust, manifestSha256, manifest.permissions)
    ? {
        ...previousTrust,
        manifestSha256,
        permissionsSnapshot: [...manifest.permissions],
      }
    : { trusted: false }
  await writePluginTrust(targetDir, trust)
  await appendAudit(previousManifest ? "plugin.upgraded" : "plugin.installed", {
    pluginId: manifest.id,
    version: manifest.version,
    source: installRecord.source,
    sourceRef: installRecord.sourceRef,
    trusted: trust.trusted,
  })

  return toInstalledPlugin(manifest, installRecord, trust)
}

export async function installLocalDesktopPlugin(options: InstallLocalPluginOptions): Promise<InstalledDesktopPlugin> {
  return installLocalDesktopPluginInternal(options)
}

export async function installBundledDesktopPlugin(pluginId: string): Promise<InstalledDesktopPlugin> {
  const sourcePath = await findBundledPluginSource(pluginId)
  const plugin = await installLocalDesktopPluginInternal({
    sourcePath,
    allowUnsignedBundled: true,
    source: "bundled",
  })
  await appendAudit("plugin.bundled-installed", {
    pluginId: plugin.manifest.id,
    version: plugin.manifest.version,
    sourcePath,
  })
  return plugin
}

export async function installPackagedDesktopPlugin(
  options: InstallPackagePluginOptions
): Promise<InstalledDesktopPlugin> {
  if (!options.signature) {
    throw new DesktopPluginError("市场插件必须提供签名", 403)
  }
  await ensureDirs()
  const packagePath = await downloadPackage(options.packageUrl, options.packageSha256)
  const packageDir = dirname(packagePath)
  const extractDir = join(packageDir, "extract")
  await mkdir(extractDir, { recursive: true })
  await extractTar({
    file: packagePath,
    cwd: extractDir,
    gzip: true,
    filter: (path) => !path.includes("..") && !path.startsWith("/") && !path.startsWith("\\"),
  })

  const entries = await readdir(extractDir, { withFileTypes: true })
  const rootEntry = entries.find((entry) => entry.isDirectory())?.name
  const pluginSourceDir = rootEntry ? join(extractDir, rootEntry) : extractDir
  const plugin = await installLocalDesktopPluginInternal({
    sourcePath: pluginSourceDir,
    expectedSha256: undefined,
    signature: options.signature,
  })

  const { pluginsDir } = getPluginDirs()
  const recordPath = join(pluginsDir, plugin.manifest.id, ".thunder-install.json")
  const record = await readJsonFile<DesktopPluginInstallRecord>(recordPath)
  record.source = "package-url"
  record.sourceRef = options.packageUrl
  record.packageSha256 = options.packageSha256
  await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8")
  await rm(packageDir, { recursive: true, force: true })
  await appendAudit("plugin.package-installed", {
    pluginId: plugin.manifest.id,
    version: plugin.manifest.version,
    packageSha256: options.packageSha256,
  })
  return toInstalledPlugin(plugin.manifest, record, plugin.trust)
}

export async function trustDesktopPlugin(id: string, trustedBy = "local-user"): Promise<InstalledDesktopPlugin> {
  assertPluginId(id)
  const plugin = await getInstalledDesktopPlugin(id)
  const { pluginsDir } = getPluginDirs()
  const pluginRoot = join(pluginsDir, id)
  const manifestSha256 = sha256(await readFile(join(pluginRoot, "plugin.json")))
  const trust: DesktopPluginTrustRecord = {
    trusted: true,
    trustedAt: new Date().toISOString(),
    trustedBy,
    manifestSha256,
    permissionsSnapshot: [...plugin.manifest.permissions],
  }
  await writePluginTrust(pluginRoot, trust)
  await appendAudit("plugin.trusted", {
    pluginId: id,
    version: plugin.manifest.version,
    trustedBy,
  })
  return toInstalledPlugin(plugin.manifest, plugin.record, trust)
}

export async function untrustDesktopPlugin(id: string): Promise<InstalledDesktopPlugin> {
  assertPluginId(id)
  await stopDesktopPluginRuntime(id)
  const plugin = await getInstalledDesktopPlugin(id)
  const { pluginsDir } = getPluginDirs()
  const pluginRoot = join(pluginsDir, id)
  const trust: DesktopPluginTrustRecord = { trusted: false }
  await writePluginTrust(pluginRoot, trust)
  await appendAudit("plugin.untrusted", {
    pluginId: id,
    version: plugin.manifest.version,
  })
  return toInstalledPlugin(plugin.manifest, plugin.record, trust)
}

function assertPluginTrusted(plugin: InstalledDesktopPlugin): void {
  if (!plugin.trust.trusted) {
    throw new DesktopPluginError("插件尚未被信任，不能加载或执行", 403)
  }
}

export async function uninstallDesktopPlugin(id: string): Promise<void> {
  assertPluginId(id)
  await stopDesktopPluginRuntime(id)
  const { pluginsDir } = getPluginDirs()
  const targetDir = join(pluginsDir, id)
  await assertPathInside(pluginsDir, targetDir)
  const plugin = await getInstalledDesktopPlugin(id).catch(() => null)
  await rm(targetDir, { recursive: true, force: true })
  await appendAudit("plugin.uninstalled", {
    pluginId: id,
    version: plugin?.manifest.version,
  })
}

export async function rollbackDesktopPlugin(id: string): Promise<InstalledDesktopPlugin> {
  assertPluginId(id)
  await stopDesktopPluginRuntime(id)
  const { pluginsDir, backupsDir } = getPluginDirs()
  const entries = await readdir(backupsDir, { withFileTypes: true }).catch(() => [])
  const candidates = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(`${id}-`))
    .map((entry) => join(backupsDir, entry.name))
    .sort((a, b) => b.localeCompare(a))

  const backupDir = candidates[0]
  if (!backupDir) {
    throw new DesktopPluginError("没有可回滚的插件备份", 404)
  }

  const manifest = await readManifest(backupDir)
  const targetDir = join(pluginsDir, id)
  const currentManifest = await readManifest(targetDir).catch(() => null)
  if (currentManifest) {
    await backupInstalledPlugin(targetDir, currentManifest)
  }
  await rm(targetDir, { recursive: true, force: true })
  await cp(backupDir, targetDir, { recursive: true, dereference: true })
  const record = await readJsonFile<DesktopPluginInstallRecord>(join(targetDir, ".thunder-install.json"))
  const trust = await readPluginTrust(targetDir)
  await appendAudit("plugin.rolled-back", {
    pluginId: id,
    version: manifest.version,
    backupDir,
  })
  return toInstalledPlugin(manifest, record, trust)
}

export async function readDesktopPluginAsset(id: string, assetPathParts: string[]): Promise<StaticPluginAsset> {
  assertPluginId(id)
  const plugin = await getInstalledDesktopPlugin(id)
  assertPluginTrusted(plugin)
  const { pluginsDir } = getPluginDirs()
  const pluginRoot = join(pluginsDir, id)
  const relativePath = assetPathParts.join("/")
  const assetPath = resolve(pluginRoot, relativePath || plugin.manifest.web.entry)
  await assertPathInside(pluginRoot, assetPath)
  const assetStat = await stat(assetPath).catch(() => null)
  if (!assetStat?.isFile()) {
    throw new DesktopPluginError("插件资源不存在", 404)
  }

  const bytes = await readFile(assetPath)
  const contentType = STATIC_CONTENT_TYPES[extname(assetPath).toLowerCase()] ?? "application/octet-stream"
  return {
    bytes,
    contentType,
    contentSecurityPolicy:
      plugin.manifest.web.contentSecurityPolicy ??
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'",
  }
}

export async function resolveDesktopPluginApiProxyTarget(
  id: string,
  pathParts: string[],
  search: string
): Promise<DesktopPluginProxyTarget> {
  const plugin = await getInstalledDesktopPlugin(id)
  assertPluginTrusted(plugin)
  if (!plugin.manifest.api || !plugin.manifest.permissions.includes("local-api-proxy")) {
    throw new DesktopPluginError("插件未声明本地 API 代理权限", 403)
  }

  const baseUrl = new URL(await ensureDesktopPluginRuntime(plugin))
  const relativePath = pathParts.map(encodeURIComponent).join("/")
  const target = new URL(relativePath, baseUrl.href.endsWith("/") ? baseUrl.href : `${baseUrl.href}/`)
  target.search = search
  return { url: target.toString() }
}

async function allocatePort(): Promise<number> {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer()
    server.unref()
    server.once("error", rejectPort)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      server.close(() => {
        if (address && typeof address === "object") {
          resolvePort(address.port)
          return
        }
        rejectPort(new Error("无法分配插件运行时端口"))
      })
    })
  })
}

function pluginStateDir(id: string): string {
  return join(getPluginDirs().stateDir, id)
}

function setRuntimeStatus(id: string, patch: Partial<DesktopPluginRuntimeStatus>): DesktopPluginRuntimeStatus {
  const current = runtimeStatus.get(id) ?? { pluginId: id, running: false }
  const next = { ...current, ...patch, pluginId: id }
  runtimeStatus.set(id, next)
  return next
}

async function waitForRuntimeHealth(baseUrl: string, healthPath = "/health"): Promise<void> {
  const deadline = Date.now() + RUNTIME_START_TIMEOUT_MS
  const healthUrl = new URL(healthPath, baseUrl).toString()
  let lastError = ""

  while (Date.now() < deadline) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 1000)
      const response = await fetch(healthUrl, { signal: controller.signal })
      clearTimeout(timeout)
      if (response.ok) return
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
  }

  throw new DesktopPluginError(`插件后端健康检查失败: ${lastError || healthUrl}`, 502)
}

async function ensureDesktopPluginRuntime(plugin: InstalledDesktopPlugin): Promise<string> {
  const api = plugin.manifest.api
  if (!api) {
    throw new DesktopPluginError("插件未声明本地 API", 403)
  }
  if (api.baseUrl) {
    return api.baseUrl
  }
  if (!api.runtime) {
    throw new DesktopPluginError("插件 API 配置不完整", 500)
  }

  const existing = runtimeProcesses.get(plugin.manifest.id)
  if (existing && !existing.child.killed) {
    return existing.baseUrl
  }

  const { pluginsDir } = getPluginDirs()
  const pluginRoot = join(pluginsDir, plugin.manifest.id)
  const entryPath = resolve(pluginRoot, api.runtime.entry)
  await assertPathInside(pluginRoot, entryPath)
  const port = await allocatePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const stateDir = pluginStateDir(plugin.manifest.id)
  await mkdir(stateDir, { recursive: true })

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...(api.runtime.env ?? {}),
    THUNDER_PLUGIN_ID: plugin.manifest.id,
    THUNDER_PLUGIN_VERSION: plugin.manifest.version,
    THUNDER_PLUGIN_STATE_DIR: stateDir,
    THUNDER_PLUGIN_TRUSTED: "1",
    [api.runtime.portEnv ?? "PORT"]: String(port),
  }

  const child = spawn(process.execPath, [entryPath, ...(api.runtime.args ?? [])], {
    cwd: pluginRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  })

  const startedAt = new Date().toISOString()
  const record: RuntimeProcessRecord = {
    pluginId: plugin.manifest.id,
    child,
    port,
    baseUrl,
    startedAt,
  }
  runtimeProcesses.set(plugin.manifest.id, record)
  setRuntimeStatus(plugin.manifest.id, {
    running: true,
    pid: child.pid,
    port,
    baseUrl,
    startedAt,
    lastError: undefined,
  })

  child.stdout.on("data", (chunk) => {
    console.log(`[plugin:${plugin.manifest.id}:stdout] ${String(chunk).trimEnd()}`)
  })
  child.stderr.on("data", (chunk) => {
    console.warn(`[plugin:${plugin.manifest.id}:stderr] ${String(chunk).trimEnd()}`)
  })
  child.once("exit", (code) => {
    runtimeProcesses.delete(plugin.manifest.id)
    setRuntimeStatus(plugin.manifest.id, {
      running: false,
      pid: undefined,
      port: undefined,
      baseUrl: undefined,
      lastExitAt: new Date().toISOString(),
      lastExitCode: code,
    })
  })

  try {
    await waitForRuntimeHealth(baseUrl, api.healthPath)
    return baseUrl
  } catch (error) {
    await stopDesktopPluginRuntime(plugin.manifest.id)
    setRuntimeStatus(plugin.manifest.id, {
      running: false,
      lastError: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

export async function startDesktopPluginRuntime(id: string): Promise<DesktopPluginRuntimeStatus> {
  assertPluginId(id)
  const plugin = await getInstalledDesktopPlugin(id)
  assertPluginTrusted(plugin)
  const baseUrl = await ensureDesktopPluginRuntime(plugin)
  return runtimeStatus.get(id) ?? {
    pluginId: id,
    running: true,
    baseUrl,
  }
}

export async function stopDesktopPluginRuntime(id: string): Promise<DesktopPluginRuntimeStatus> {
  assertPluginId(id)
  const record = runtimeProcesses.get(id)
  if (record && !record.child.killed) {
    const exited = new Promise<void>((resolveExit) => {
      record.child.once("exit", () => resolveExit())
    })
    record.child.kill()
    await Promise.race([
      exited,
      new Promise<void>((resolveTimeout) => setTimeout(resolveTimeout, RUNTIME_STOP_TIMEOUT_MS)),
    ])
    runtimeProcesses.delete(id)
  }
  return setRuntimeStatus(id, {
    running: false,
    pid: undefined,
    port: undefined,
    baseUrl: undefined,
    lastExitAt: new Date().toISOString(),
  })
}

export function getDesktopPluginRuntimeStatus(id: string): DesktopPluginRuntimeStatus {
  assertPluginId(id)
  return runtimeStatus.get(id) ?? {
    pluginId: id,
    running: false,
  }
}

process.once("exit", () => {
  for (const record of runtimeProcesses.values()) {
    if (!record.child.killed) {
      record.child.kill()
    }
  }
})

function getSqliteDatabasePath(): string {
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl || (!dbUrl.startsWith("file:") && !dbUrl.startsWith("sqlite:"))) {
    throw new DesktopPluginError("插件迁移仅支持桌面本地 SQLite 数据库", 400)
  }
  return resolve(dbUrl.replace(/^(file:|sqlite:)/, ""))
}

async function listPluginMigrationFiles(pluginRoot: string, manifest: DesktopPluginManifest): Promise<string[]> {
  if (!manifest.migrations?.sqlite) return []
  const migrationDir = resolve(pluginRoot, manifest.migrations.sqlite)
  await assertPathInside(pluginRoot, migrationDir)
  const dirStat = await stat(migrationDir).catch(() => null)
  if (!dirStat?.isDirectory()) {
    throw new DesktopPluginError("插件声明的 SQLite 迁移目录不存在")
  }
  const entries = await readdir(migrationDir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => join(migrationDir, entry.name))
    .sort((a, b) => a.localeCompare(b))
}

export async function runDesktopPluginMigrations(id: string): Promise<DesktopPluginMigrationResult> {
  assertPluginId(id)
  const plugin = await getInstalledDesktopPlugin(id)
  assertPluginTrusted(plugin)
  const { pluginsDir } = getPluginDirs()
  const pluginRoot = join(pluginsDir, id)
  const files = await listPluginMigrationFiles(pluginRoot, plugin.manifest)
  const db = new DatabaseSync(getSqliteDatabasePath())
  const applied: DesktopPluginMigrationRecord[] = []
  const skipped: DesktopPluginMigrationRecord[] = []

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS plugin_migrations (
        plugin_id TEXT NOT NULL,
        version TEXT NOT NULL,
        name TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        PRIMARY KEY (plugin_id, name)
      );
    `)

    for (const file of files) {
      const sql = await readFile(file, "utf8")
      const record: DesktopPluginMigrationRecord = {
        pluginId: plugin.manifest.id,
        version: plugin.manifest.version,
        name: file.slice(pluginRoot.length + 1).replace(/\\/g, "/"),
        sha256: sha256(sql),
        appliedAt: new Date().toISOString(),
      }
      const existing = db
        .prepare("SELECT sha256, applied_at FROM plugin_migrations WHERE plugin_id = ? AND name = ?")
        .get(record.pluginId, record.name) as { sha256: string; applied_at: string } | undefined

      if (existing) {
        if (existing.sha256 !== record.sha256) {
          throw new DesktopPluginError(`插件迁移已执行但内容发生变化: ${record.name}`, 409)
        }
        skipped.push({ ...record, appliedAt: existing.applied_at })
        continue
      }

      try {
        db.exec("BEGIN TRANSACTION;")
        db.exec(sql)
        db.prepare(
          "INSERT INTO plugin_migrations (plugin_id, version, name, sha256, applied_at) VALUES (?, ?, ?, ?, ?)"
        ).run(record.pluginId, record.version, record.name, record.sha256, record.appliedAt)
        db.exec("COMMIT;")
        applied.push(record)
        await appendAudit("plugin.migration.applied", {
          pluginId: record.pluginId,
          version: record.version,
          name: record.name,
          sha256: record.sha256,
        })
      } catch (error) {
        db.exec("ROLLBACK;")
        throw error
      }
    }
  } finally {
    db.close()
  }

  return {
    pluginId: plugin.manifest.id,
    applied,
    skipped,
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

async function listBundledMarketplaceEntries(): Promise<DesktopPluginMarketplaceIndex["plugins"]> {
  const entries: DesktopPluginMarketplaceIndex["plugins"] = []

  for (const root of getBundledPluginRoots()) {
    const rootEntries = await readdir(root, { withFileTypes: true }).catch(() => [])
    for (const entry of rootEntries) {
      if (!entry.isDirectory()) continue
      const sourcePath = resolve(root, entry.name)
      if (!isPathInside(sourcePath, root)) continue
      const manifest = await readManifest(sourcePath).catch(() => null)
      if (!manifest) continue
      if (!(await pathExists(join(sourcePath, manifest.web.entry)))) continue
      entries.push({
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        icon: manifest.icon,
        category: manifest.category,
        author: manifest.author,
        permissions: manifest.permissions,
        source: "bundled",
      })
    }
  }

  return mergeMarketplaceEntries(entries).sort(
    (a, b) => String(a.category).localeCompare(String(b.category)) || a.name.localeCompare(b.name)
  )
}

function mergeMarketplaceEntries(entries: DesktopPluginMarketplaceIndex["plugins"]): DesktopPluginMarketplaceIndex["plugins"] {
  const map = new Map<string, DesktopPluginMarketplaceIndex["plugins"][number]>()
  for (const entry of entries) {
    map.set(entry.id, entry)
  }
  return [...map.values()]
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
  const ok = verify(null, Buffer.from(stableJson(signedIndex)), createPublicKey(publicKey), Buffer.from(signature.signature, "base64"))
  if (!ok) {
    throw new DesktopPluginError("插件市场索引签名校验失败", 403)
  }
}

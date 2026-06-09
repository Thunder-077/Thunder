import { constants as fsConstants } from "node:fs"
import { access, appendFile, cp, lstat, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import { createHash, createPublicKey, verify } from "node:crypto"
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep, extname } from "node:path"
import { createPipeClient, createTrustedRuntimeSupervisor } from "@thunder/plugin-host-runtime"
import { parseThunderPluginManifest } from "@thunder/plugin-schema"
import type {
  DesktopPluginInstallRecord,
  DesktopPluginSchemaManifest,
  DesktopPluginMarketplaceIndex,
  DesktopPluginRuntimeStatus,
  InstalledDesktopPlugin,
} from "./desktop-plugin-types"
import { recordActivity } from "../modules/activity/activity-service"

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
}

export interface StaticPluginAsset {
  bytes: Buffer
  contentType: string
  contentSecurityPolicy?: string
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
  installedAt?: string,
  updatedAt?: string,
): InstalledDesktopPlugin {
  const sidebarEntry = manifest.contributes?.sidebar?.entry ?? null

  return {
    manifest,
    pluginRoot,
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
      plugins.push(toInstalledPlugin(manifest, pluginRoot, installRecord?.installedAt, installRecord?.updatedAt))
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
    return toInstalledPlugin(manifest, pluginRoot, installRecord?.installedAt, installRecord?.updatedAt)
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
  await assertNoSymlinks(sourcePath)

  const { pluginsDir, stagingDir } = getPluginDirs()
  const targetDir = join(pluginsDir, manifest.id)
  const stageDir = join(stagingDir, `${manifest.id}-${Date.now()}`)
  const previousPlugin = await getInstalledPlugin(manifest.id).catch(() => null)

  await rm(stageDir, { recursive: true, force: true })
  await cp(sourcePath, stageDir, { recursive: true, dereference: true })

  const now = new Date().toISOString()
  const installRecord: DesktopPluginInstallRecord = {
    id: manifest.id,
    version: manifest.version,
    installedAt: previousPlugin?.installedAt ?? now,
    updatedAt: now,
    source: "local-directory",
    sourceRef: sourcePath,
    manifestSha256: sha256(await readFile(join(sourcePath, "plugin.json"))),
  }

  await writeFile(join(stageDir, ".thunder-install.json"), `${JSON.stringify(installRecord, null, 2)}\n`, "utf8")
  if (previousPlugin) {
    await stopDesktopPluginRuntime(manifest.id)
  }
  await rm(targetDir, { recursive: true, force: true })
  await cp(stageDir, targetDir, { recursive: true, dereference: true })
  await rm(stageDir, { recursive: true, force: true })

  await appendAudit(previousPlugin ? "plugin.upgraded" : "plugin.installed", {
    pluginId: manifest.id,
    version: manifest.version,
    source: installRecord.source,
    sourceRef: installRecord.sourceRef,
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

  return toInstalledPlugin(manifest, targetDir, installRecord.installedAt, installRecord.updatedAt)
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
  const plugin = await installPackagedPlugin({ pluginPath: sourcePath })

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
  await stopDesktopPluginRuntime(id)

  const { pluginsDir } = getPluginDirs()
  const targetDir = join(pluginsDir, id)
  await assertPathInside(pluginsDir, targetDir)
  const plugin = await getInstalledPlugin(id).catch(() => null)
  await rm(targetDir, { recursive: true, force: true })

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

  const bytes = await readFile(resolvedAssetPath).catch(() => null)
  if (!bytes) {
    throw new DesktopPluginError("插件 UI 资源不存在", 404)
  }

  return {
    bytes,
    contentType: STATIC_CONTENT_TYPES[extname(resolvedAssetPath).toLowerCase()] ?? "application/octet-stream",
    contentSecurityPolicy:
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'",
  }
}

async function startTrustedDesktopPluginRuntime(plugin: InstalledDesktopPlugin): Promise<DesktopPluginRuntimeStatus> {
  if (plugin.manifest.kind !== "trusted") {
    throw new DesktopPluginError("当前仅支持 trusted runtime", 501)
  }

  const currentStatus = trustedRuntimeSupervisor.getStatus(plugin.manifest.id)
  if (currentStatus.running && currentStatus.endpoint) {
    return {
      pluginId: currentStatus.pluginId,
      running: currentStatus.running,
      endpoint: currentStatus.endpoint,
    }
  }

  const status = await trustedRuntimeSupervisor.start({
    manifest: plugin.manifest,
    pluginRoot: plugin.pluginRoot,
  })

  return {
    pluginId: status.pluginId,
    running: status.running,
    endpoint: status.endpoint,
  }
}

export async function startDesktopPluginRuntime(id: string): Promise<DesktopPluginRuntimeStatus> {
  const plugin = await getInstalledPlugin(id)
  return startTrustedDesktopPluginRuntime(plugin)
}

export async function stopDesktopPluginRuntime(id: string): Promise<DesktopPluginRuntimeStatus> {
  assertPluginId(id)
  const status = await trustedRuntimeSupervisor.stop(id)
  return {
    pluginId: status.pluginId,
    running: status.running,
    endpoint: status.endpoint,
  }
}

export function getDesktopPluginRuntimeStatus(id: string): DesktopPluginRuntimeStatus {
  assertPluginId(id)
  const status = trustedRuntimeSupervisor.getStatus(id)
  return {
    pluginId: status.pluginId,
    running: status.running,
    endpoint: status.endpoint,
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

  const status = await startTrustedDesktopPluginRuntime(plugin)
  const endpoint = status.endpoint ?? trustedRuntimeSupervisor.getEndpoint(plugin.manifest.id)
  if (!endpoint) {
    throw new DesktopPluginError("trusted runtime endpoint 不可用", 502)
  }

  const client = await createPipeClient(endpoint)
  try {
    return await client.invoke(method, payload)
  } finally {
    await client.close()
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

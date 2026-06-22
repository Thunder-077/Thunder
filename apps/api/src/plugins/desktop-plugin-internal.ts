import { constants as fsConstants } from "node:fs"
import { access, appendFile, lstat, mkdir, readFile, readdir } from "node:fs/promises"
import { createHash } from "node:crypto"
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { parseThunderPluginManifest, PLUGIN_ID_PATTERN } from "@thunder/plugin-schema"
import type {
  DesktopPluginInstallRecord,
  DesktopPluginSchemaManifest,
} from "./desktop-plugin-types"

export class DesktopPluginError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message)
  }
}

export function isLocalSqliteDatabase(): boolean {
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

export function getPluginDirs() {
  const root = getDesktopPluginRoot()
  return {
    root,
    pluginsDir: join(root, "plugins"),
    stagingDir: join(root, "plugin-staging"),
    pluginDataDir: join(root, "plugin-data"),
    auditLogPath: join(root, "plugin-audit.jsonl"),
  }
}

export function getBundledPluginRoots(): string[] {
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

export function isPathInside(childPath: string, parentPath: string): boolean {
  const child = resolve(childPath)
  const parent = resolve(parentPath)
  const path = relative(parent, child)
  return path === "" || (!path.startsWith("..") && !isAbsolute(path))
}

export async function ensureDirs(): Promise<void> {
  const dirs = getPluginDirs()
  await mkdir(dirs.pluginsDir, { recursive: true })
  await mkdir(dirs.stagingDir, { recursive: true })
}

export async function appendAudit(event: string, details: Record<string, unknown>): Promise<void> {
  await ensureDirs()
  const { auditLogPath } = getPluginDirs()
  const record = {
    event,
    at: new Date().toISOString(),
    ...details,
  }
  await appendFile(auditLogPath, `${JSON.stringify(record)}\n`, "utf8")
}

export function assertPluginId(id: string): void {
  if (!PLUGIN_ID_PATTERN.test(id)) {
    throw new DesktopPluginError("插件 id 只能使用小写字母、数字和连字符，并且必须以字母开头")
  }
}

export function assertRelativeAssetPath(path: string, label: string): void {
  if (!path || path.startsWith("/") || path.startsWith("\\") || path.includes("..")) {
    throw new DesktopPluginError(`${label} 必须是插件目录内的相对路径`)
  }
}

export async function readJsonFile<T>(path: string, validate?: (raw: unknown) => T): Promise<T> {
  const raw: unknown = JSON.parse(await readFile(path, "utf8"))
  return validate ? validate(raw) : (raw as T)
}

export function parseInstallRecord(raw: unknown): DesktopPluginInstallRecord {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new DesktopPluginError("install record 格式无效")
  }
  const r = raw as Record<string, unknown>
  if (typeof r.id !== "string" || typeof r.version !== "string") {
    throw new DesktopPluginError("install record 缺少必要字段 (id, version)")
  }
  if (typeof r.installedAt !== "string" || typeof r.updatedAt !== "string") {
    throw new DesktopPluginError("install record 缺少时间戳字段 (installedAt, updatedAt)")
  }
  if (typeof r.source !== "string" || typeof r.sourceRef !== "string") {
    throw new DesktopPluginError("install record 缺少来源信息 (source, sourceRef)")
  }
  if (typeof r.manifestSha256 !== "string") {
    throw new DesktopPluginError("install record 缺少 manifestSha256")
  }
  return raw as DesktopPluginInstallRecord
}

export async function pathExists(path: string): Promise<boolean> {
  return access(path, fsConstants.F_OK)
    .then(() => true)
    .catch(() => false)
}

export async function assertNoSymlinks(current: string): Promise<void> {
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

export async function assertPathInside(root: string, target: string): Promise<void> {
  const normalizedRoot = resolve(root)
  const normalizedTarget = resolve(target)
  if (normalizedTarget !== normalizedRoot && !normalizedTarget.startsWith(`${normalizedRoot}${sep}`)) {
    throw new DesktopPluginError("插件路径越界访问被拒绝", 403)
  }
}

export async function readManifestVersion(pluginRoot: string): Promise<number> {
  const manifest = await readJsonFile<{ manifestVersion?: unknown }>(join(pluginRoot, "plugin.json"))
  return typeof manifest.manifestVersion === "number" ? manifest.manifestVersion : 0
}

export async function readManifest(pluginRoot: string): Promise<DesktopPluginSchemaManifest> {
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

export function sha256(buffer: Buffer | string): string {
  return createHash("sha256").update(buffer).digest("hex")
}

export function parseTrustedKeysArray(raw: string, label: string): Map<string, string> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new DesktopPluginError(`${label} 必须是 JSON 数组`)
  }
  if (!Array.isArray(parsed)) {
    throw new DesktopPluginError(`${label} 必须是 JSON 数组`)
  }
  const entries: Array<[string, string]> = []
  for (const item of parsed) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof (item as Record<string, unknown>).keyId !== "string" ||
      typeof (item as Record<string, unknown>).publicKey !== "string"
    ) {
      throw new DesktopPluginError(`${label} 中的每个元素必须包含 keyId 和 publicKey 字符串字段`)
    }
    entries.push([(item as Record<string, unknown>).keyId as string, (item as Record<string, unknown>).publicKey as string])
  }
  return new Map(entries)
}

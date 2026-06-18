import { createPrivateKey, sign } from "node:crypto"
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import type { ThunderPluginManifest } from "@thunder/plugin-schema"
import {
  getHighRiskPluginPermissions,
  pluginRequiresTrustConfirmation,
} from "./validate"

export interface MarketplaceSignature {
  keyId: string
  algorithm: "ed25519"
  signature: string
}

export interface MarketplaceSigningOptions {
  privateKeyPath?: string
  keyId?: string
}

export interface DesktopPluginMarketplaceEntry {
  id: string
  name: string
  version: string
  description?: string
  icon?: string
  category?: string
  author?: ThunderPluginManifest["author"]
  permissions: ThunderPluginManifest["permissions"]
  kind: ThunderPluginManifest["kind"]
  highRiskPermissions: ThunderPluginManifest["permissions"]
  requiresTrustConfirmation: boolean
  manifestSha256: string
  packageUrl: string
  packageSha256: string
  signature?: MarketplaceSignature
}

export interface DesktopPluginMarketplaceIndex {
  version: 1
  generatedAt: string
  plugins: DesktopPluginMarketplaceEntry[]
  signature?: MarketplaceSignature
}

export function stableJson(value: unknown): string {
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

async function signStableJson(
  value: unknown,
  options: MarketplaceSigningOptions,
): Promise<MarketplaceSignature | undefined> {
  if (!options.privateKeyPath && !options.keyId) {
    return undefined
  }
  if (!options.privateKeyPath || !options.keyId) {
    throw new Error("Signing requires both privateKeyPath and keyId")
  }

  const privateKey = createPrivateKey(await readFile(resolve(options.privateKeyPath), "utf8"))
  return {
    keyId: options.keyId,
    algorithm: "ed25519",
    signature: sign(null, Buffer.from(stableJson(value)), privateKey).toString("base64"),
  }
}

function resolvePackageUrl(packageName: string, baseUrl?: string): string {
  if (!baseUrl) {
    return packageName
  }
  return new URL(packageName, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString()
}

export async function createMarketplaceEntry(options: {
  manifest: ThunderPluginManifest
  manifestSha256: string
  packageName: string
  packageSha256: string
  baseUrl?: string
  signing?: MarketplaceSigningOptions
}): Promise<DesktopPluginMarketplaceEntry> {
  const unsignedEntry: DesktopPluginMarketplaceEntry = {
    id: options.manifest.id,
    name: options.manifest.name,
    version: options.manifest.version,
    description: options.manifest.description,
    icon: options.manifest.icon,
    author: options.manifest.author,
    permissions: [...options.manifest.permissions],
    kind: options.manifest.kind,
    highRiskPermissions: getHighRiskPluginPermissions(options.manifest),
    requiresTrustConfirmation: pluginRequiresTrustConfirmation(options.manifest),
    manifestSha256: options.manifestSha256,
    packageUrl: resolvePackageUrl(options.packageName, options.baseUrl),
    packageSha256: options.packageSha256,
  }

  const signature = await signStableJson(options.manifest, options.signing ?? {})
  return signature ? { ...unsignedEntry, signature } : unsignedEntry
}

export async function writeMarketplaceEntry(
  entry: DesktopPluginMarketplaceEntry,
  outPath: string,
): Promise<string> {
  const resolvedOutPath = resolve(outPath)
  await mkdir(dirname(resolvedOutPath), { recursive: true })
  await writeFile(resolvedOutPath, `${JSON.stringify(entry, null, 2)}\n`, "utf8")
  return resolvedOutPath
}

export async function publishMarketplaceIndex(options: {
  entriesDir: string
  outPath: string
  signing?: MarketplaceSigningOptions
  generatedAt?: string
}): Promise<{ outPath: string; index: DesktopPluginMarketplaceIndex }> {
  const entryRoot = resolve(options.entriesDir)
  const files = await readdir(entryRoot).catch(() => [])
  const plugins: DesktopPluginMarketplaceEntry[] = []

  for (const file of files) {
    if (!file.endsWith(".marketplace-entry.json")) {
      continue
    }
    plugins.push(JSON.parse(await readFile(join(entryRoot, file), "utf8")) as DesktopPluginMarketplaceEntry)
  }

  plugins.sort((a, b) => a.id.localeCompare(b.id) || a.version.localeCompare(b.version))

  const unsignedIndex: DesktopPluginMarketplaceIndex = {
    version: 1,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    plugins,
  }
  const signature = await signStableJson(unsignedIndex, options.signing ?? {})
  const index = signature ? { ...unsignedIndex, signature } : unsignedIndex
  const resolvedOutPath = resolve(options.outPath)

  await mkdir(dirname(resolvedOutPath), { recursive: true })
  await writeFile(resolvedOutPath, `${JSON.stringify(index, null, 2)}\n`, "utf8")

  return {
    outPath: resolvedOutPath,
    index,
  }
}

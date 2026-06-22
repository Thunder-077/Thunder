import { readFile, readdir } from "node:fs/promises"
import { createPublicKey, verify } from "node:crypto"
import { join, resolve } from "node:path"
import {
  DesktopPluginError,
  isPathInside,
  readManifestVersion,
  readManifest,
  pathExists,
  sha256,
  getBundledPluginRoots,
  parseTrustedKeysArray,
} from "./desktop-plugin-internal"
import type { DesktopPluginMarketplaceIndex } from "./desktop-plugin-types"
import {
  getHighRiskPluginPermissions,
  pluginRequiresTrustConfirmation,
} from "./desktop-plugin-trust"

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
  return parseTrustedKeysArray(raw, "THUNDER_PLUGIN_TRUSTED_KEYS")
}

function marketplaceTrustedKeys(): Map<string, string> {
  const raw = process.env.THUNDER_PLUGIN_MARKETPLACE_TRUSTED_KEYS
  if (!raw) return trustedKeys()
  return parseTrustedKeysArray(raw, "THUNDER_PLUGIN_MARKETPLACE_TRUSTED_KEYS")
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

  const raw: unknown = await response.json()
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new DesktopPluginError("插件市场索引格式不正确", 502)
  }
  const rawObj = raw as Record<string, unknown>
  if (rawObj.version !== 1 || !Array.isArray(rawObj.plugins)) {
    throw new DesktopPluginError("插件市场索引格式不正确", 502)
  }
  for (const entry of rawObj.plugins) {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof (entry as Record<string, unknown>).id !== "string" ||
      typeof (entry as Record<string, unknown>).name !== "string" ||
      typeof (entry as Record<string, unknown>).version !== "string"
    ) {
      throw new DesktopPluginError("插件市场索引中存在无效的插件条目", 502)
    }
  }
  const index = raw as DesktopPluginMarketplaceIndex

  verifyMarketplaceIndex(index)
  return {
    ...index,
    plugins: mergeMarketplaceEntries([...bundledPlugins, ...index.plugins]),
  }
}

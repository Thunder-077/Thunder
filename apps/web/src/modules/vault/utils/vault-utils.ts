import type { VaultItemPlain, VaultItemType } from "@thunder/vault"

export function getFaviconUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`
  } catch {
    return ""
  }
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

const TAG_COLORS = [
  "#94a3b8",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
]

const tagColorCache: Record<string, string> = {}

export function getTagColor(tagName: string | undefined): string {
  if (!tagName) return TAG_COLORS[0]

  if (tagColorCache[tagName]) {
    return tagColorCache[tagName]
  }

  let hash = 0
  for (let i = 0; i < tagName.length; i++) {
    hash = tagName.charCodeAt(i) + ((hash << 5) - hash)
  }

  const colorIndex = Math.abs(hash) % TAG_COLORS.length
  const color = TAG_COLORS[colorIndex]
  tagColorCache[tagName] = color

  return color
}

export function formatTimeAgo(dateString: string | null | undefined): string {
  if (!dateString) return ""

  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return "刚刚"
  if (diffMins < 60) return `${diffMins} 分钟前`
  if (diffHours < 24) return `${diffHours} 小时前`
  if (diffDays === 1) return "昨天"
  if (diffDays < 7) return `${diffDays} 天前`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} 周前`

  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
}

export function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export const VAULT_ITEM_TYPE_LABELS: Record<VaultItemType, string> = {
  website: "网站账号",
  secret: "密钥 / 令牌",
  totp: "双重验证",
  server: "服务器 / SSH",
  database: "数据库",
  note: "普通条目",
}

export const VAULT_ITEM_TYPE_OPTIONS: { value: VaultItemType; label: string }[] = [
  { value: "website", label: "网站账号" },
  { value: "secret", label: "密钥 / 令牌" },
  { value: "totp", label: "双重验证" },
  { value: "server", label: "服务器 / SSH" },
  { value: "database", label: "数据库" },
  { value: "note", label: "普通条目" },
]

export function inferVaultItemType(item: VaultItemPlain): VaultItemType {
  if (item.type) {
    return item.type
  }
  if (item.url) return "website"
  if (item.extraFields?.some((f) => f.type === "totp" || f.type === "recovery-code")) return "totp"
  if (item.extraFields?.some((f) => f.type === "secret")) return "secret"
  if (item.username || item.password) return "website"
  return "note"
}

export function getVaultItemTypeLabel(item: VaultItemPlain): string {
  return VAULT_ITEM_TYPE_LABELS[inferVaultItemType(item)] || "普通条目"
}

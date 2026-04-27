"use client"

import { useState } from "react"
import {
  KeyRound,
  Star,
  ChevronDown,
  SearchX,
  Globe,
  Shield,
  Terminal,
  Database,
  FileText,
  Lock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { VaultItemPlain, VaultItemType } from "@thunder/vault"
import { cn } from "@/lib/utils"
import {
  getFaviconUrl,
  getTagColor,
  inferVaultItemType,
  VAULT_ITEM_TYPE_LABELS,
} from "../utils/vault-utils"

interface VaultListPanelProps {
  items: VaultItemPlain[]
  totalItems: number
  selectedId: string | null
  filterType: "all" | "favorites" | "recent"
  onSelect: (item: VaultItemPlain) => void
  onToggleFavorite: (item: VaultItemPlain) => Promise<void>
  onAddItem: () => void
  onLoadMore: () => void
  hasMore: boolean
  onResetFilters: () => void
  isEmpty: boolean
}

const TYPE_ICONS: Record<VaultItemType, React.ReactNode> = {
  website: <Globe className="h-4 w-4" />,
  secret: <Lock className="h-4 w-4" />,
  totp: <Shield className="h-4 w-4" />,
  server: <Terminal className="h-4 w-4" />,
  database: <Database className="h-4 w-4" />,
  note: <FileText className="h-4 w-4" />,
}

function VaultListItem({
  item,
  selected,
  onSelect,
  onToggleFavorite,
}: {
  item: VaultItemPlain
  selected: boolean
  onSelect: (item: VaultItemPlain) => void
  onToggleFavorite: (item: VaultItemPlain) => Promise<void>
}) {
  const [imgError, setImgError] = useState(false)
  const faviconUrl = item.url ? getFaviconUrl(item.url) : ""
  const itemType = inferVaultItemType(item)
  const typeLabel = VAULT_ITEM_TYPE_LABELS[itemType]

  const showFavicon = itemType === "website" && faviconUrl && !imgError

  return (
    <div
      className={cn(
        "relative flex items-center gap-3 p-3 cursor-pointer transition-colors rounded-xl",
        selected
          ? "bg-gray-100 border-l-4 border-l-black pl-[9px]"
          : "hover:bg-muted/40 border-l-4 border-l-transparent"
      )}
      onClick={() => onSelect(item)}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground overflow-hidden">
        {showFavicon ? (
          <img
            src={faviconUrl}
            alt=""
            className="h-7 w-7 object-contain"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="text-muted-foreground">
            {TYPE_ICONS[itemType]}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1 flex flex-col">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 min-w-0">
            <h4 className="text-base font-medium truncate text-foreground">
              {item.title}
            </h4>
          </div>
          <span className="text-xs text-gray-400 shrink-0 ml-2">
            {new Date(item.updatedAt)
              .toLocaleDateString("zh-CN", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              })
              .replace(/\//g, "/")}
          </span>
        </div>

        <div className="flex justify-between items-center mt-1 gap-4">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <span className="text-sm text-gray-500 truncate">
              {item.username}
            </span>
            {item.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 shrink-0">
                {item.tags.slice(0, 2).map((tag, index) => {
                  const color = getTagColor(tag.name) || "#94a3b8"
                  return (
                    <span
                      key={tag.id || tag.name || `tag-${index}`}
                      className="text-[10px] px-2 py-0.5 rounded-full font-normal"
                      style={{
                        backgroundColor: color + "15",
                        color: color,
                      }}
                    >
                      {tag.name}
                    </span>
                  )
                })}
              </div>
            )}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleFavorite(item)
            }}
            className="shrink-0"
          >
            <Star
              className={cn(
                "h-4 w-4",
                item.favorite
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-gray-300 hover:text-gray-400"
              )}
            />
          </button>
        </div>
      </div>
    </div>
  )
}

export function VaultListPanel({
  items,
  totalItems,
  selectedId,
  filterType,
  onSelect,
  onToggleFavorite,
  onAddItem,
  onLoadMore,
  hasMore,
  onResetFilters,
  isEmpty,
}: VaultListPanelProps) {
  if (items.length === 0 && !isEmpty) {
    return (
      <Card className="rounded-xl border-border/50">
        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/80 text-muted-foreground">
            <KeyRound className="h-7 w-7" />
          </div>
          <h3 className="mt-5 text-sm font-medium">保险箱为空</h3>
          <p className="mt-1.5 max-w-[220px] text-xs text-muted-foreground leading-relaxed">
            点击上方「新建条目」按钮，添加你的第一个密码条目
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 h-8 text-xs"
            onClick={onAddItem}
          >
            创建第一个条目
          </Button>
        </div>
      </Card>
    )
  }

  if (isEmpty) {
    return (
      <Card className="rounded-xl border-border/50">
        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/80 text-muted-foreground">
            <SearchX className="h-7 w-7" />
          </div>
          <h3 className="mt-5 text-sm font-medium">未找到匹配条目</h3>
          <p className="mt-1.5 max-w-[220px] text-xs text-muted-foreground leading-relaxed">
            请调整搜索关键词或筛选条件
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 h-8 text-xs"
            onClick={onResetFilters}
          >
            重置筛选
          </Button>
        </div>
      </Card>
    )
  }

  const favoriteCount = items.filter((i) => i.favorite).length

  return (
    <Card className="rounded-xl border-border/50 overflow-hidden flex flex-col">
      <div className="border-b border-border/30 px-4 py-2.5">
        <div className="flex items-center gap-3 text-xs">
          <button
            className={cn(
              "font-medium transition-colors",
              filterType === "all"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            全部
          </button>
          <span className="text-muted-foreground text-[11px]">{totalItems}</span>

          <button className="text-muted-foreground hover:text-foreground transition-colors">
            收藏
          </button>
          <span className="text-muted-foreground text-[11px]">{favoriteCount}</span>

          <button className="text-muted-foreground hover:text-foreground transition-colors">
            最近访问
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {items.map((item) => (
          <VaultListItem
            key={item.id}
            item={item}
            selected={item.id === selectedId}
            onSelect={onSelect}
            onToggleFavorite={onToggleFavorite}
          />
        ))}
      </div>

      <div className="border-t border-border/30 px-4 py-2">
        {hasMore ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 gap-1.5 border-border/50 rounded-lg bg-background hover:bg-muted/50 text-xs text-muted-foreground"
            onClick={onLoadMore}
          >
            加载更多
            <ChevronDown className="h-3 w-3" />
          </Button>
        ) : (
          <div className="text-center py-1 text-[11px] text-muted-foreground">
            已全部加载
          </div>
        )}
      </div>
    </Card>
  )
}

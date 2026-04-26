"use client"

import { Lock, Plus, Download, Upload, Settings, Search, ChevronDown, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useVault } from "../state"
import type { VaultItemPlain } from "@thunder/vault"
import { inferVaultItemType, VAULT_ITEM_TYPE_LABELS } from "../utils/vault-utils"

interface VaultToolbarProps {
  searchKeyword: string
  onSearchChange: (keyword: string) => void
  scopeFilter: "all" | "favorites" | "recent"
  onScopeChange: (scope: "all" | "favorites" | "recent") => void
  tagFilter: string | null
  onTagChange: (tag: string | null) => void
  typeFilter: string | null
  onTypeChange: (type: string | null) => void
  onReset: () => void
  items: VaultItemPlain[]
  onAddItem: () => void
  onExport: () => void
  onImport: () => void
  onOpenSettings: () => void
}

export function VaultToolbar({
  searchKeyword,
  onSearchChange,
  scopeFilter,
  onScopeChange,
  tagFilter,
  onTagChange,
  typeFilter,
  onTypeChange,
  onReset,
  items,
  onAddItem,
  onExport,
  onImport,
  onOpenSettings,
}: VaultToolbarProps) {
  const { lockVault } = useVault()

  const scopeLabel = (() => {
    switch (scopeFilter) {
      case "all":
        return "全部"
      case "favorites":
        return "收藏"
      case "recent":
        return "最近访问"
    }
  })()

  const tagLabel = tagFilter || "标签"
  const typeLabel = typeFilter || "类型"

  const allTags = Array.from(new Set(items.flatMap((item) => item.tags.map((t) => t.name))))

  const scopeOptions = [
    { value: "all", label: "全部" },
    { value: "favorites", label: "收藏" },
    { value: "recent", label: "最近访问" },
  ]

  const typeOptions = [
    { value: null, label: "全部类型" },
    { value: VAULT_ITEM_TYPE_LABELS.website, label: VAULT_ITEM_TYPE_LABELS.website },
    { value: VAULT_ITEM_TYPE_LABELS.secret, label: VAULT_ITEM_TYPE_LABELS.secret },
    { value: VAULT_ITEM_TYPE_LABELS.totp, label: VAULT_ITEM_TYPE_LABELS.totp },
    { value: VAULT_ITEM_TYPE_LABELS.server, label: VAULT_ITEM_TYPE_LABELS.server },
    { value: VAULT_ITEM_TYPE_LABELS.database, label: VAULT_ITEM_TYPE_LABELS.database },
    { value: VAULT_ITEM_TYPE_LABELS.note, label: VAULT_ITEM_TYPE_LABELS.note },
  ]

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const availableTypes = Array.from(
    new Set(items.map((item) => VAULT_ITEM_TYPE_LABELS[inferVaultItemType(item)]))
  )

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="relative w-[260px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={searchKeyword}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索名称、用户名或标签"
            className="h-8 pl-8 pr-14 text-xs border-border/50 rounded-md bg-background"
          />
        </div>

        <div className="h-5 w-px bg-border/30" />

        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center justify-center gap-1 h-8 px-2.5 text-xs border border-border/50 rounded-md bg-background hover:bg-muted/50 transition-colors outline-none">
            {scopeLabel}
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-28">
            {scopeOptions.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => onScopeChange(option.value as "all" | "favorites" | "recent")}
                className={scopeFilter === option.value ? "bg-muted" : ""}
              >
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex items-center justify-center gap-1 h-8 px-2.5 text-xs border border-border/50 rounded-md bg-background hover:bg-muted/50 transition-colors outline-none disabled:opacity-50 disabled:pointer-events-none"
            disabled={allTags.length === 0}
          >
            {tagLabel}
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-32">
            <DropdownMenuItem onClick={() => onTagChange(null)} className={!tagFilter ? "bg-muted" : ""}>
              全部标签
            </DropdownMenuItem>
            {allTags.map((tag) => (
              <DropdownMenuItem key={tag} onClick={() => onTagChange(tag)} className={tagFilter === tag ? "bg-muted" : ""}>
                {tag}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex items-center justify-center gap-1 h-8 px-2.5 text-xs border border-border/50 rounded-md bg-background hover:bg-muted/50 transition-colors outline-none disabled:opacity-50 disabled:pointer-events-none"
            disabled={items.length === 0}
          >
            {typeLabel}
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-32">
            {typeOptions.map((option) => (
              <DropdownMenuItem
                key={option.value || "all"}
                onClick={() => onTypeChange(option.value)}
                className={(!typeFilter && option.value === null) || typeFilter === option.value ? "bg-muted" : ""}
              >
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground px-2" onClick={onReset}>
          <RotateCcw className="h-3 w-3" />
          重置
        </Button>
      </div>

      <div className="flex items-center gap-1.5">
        <Button size="sm" className="h-8 gap-1 text-xs bg-black text-white hover:bg-black/90 px-3" onClick={onAddItem}>
          <Plus className="h-3.5 w-3.5" />
          新建条目
        </Button>

        <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground px-2" onClick={onOpenSettings}>
          <Settings className="h-3.5 w-3.5" />
          设置
        </Button>

        <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground px-2" onClick={lockVault}>
          <Lock className="h-3.5 w-3.5" />
          锁定
        </Button>

        <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground px-2" onClick={onImport}>
          <Download className="h-3.5 w-3.5" />
          导入
        </Button>

        <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground px-2" onClick={onExport}>
          <Upload className="h-3.5 w-3.5" />
          导出
        </Button>
      </div>
    </div>
  )
}

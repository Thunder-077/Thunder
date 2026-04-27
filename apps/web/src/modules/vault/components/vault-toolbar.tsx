"use client"

import { Lock, Plus, Download, Upload, Settings, Search, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, type SelectOption } from "@/components/ui/select"
import { useVault } from "../state"
import type { VaultItemPlain } from "@thunder/vault"
import { inferVaultItemType, VAULT_ITEM_TYPE_LABELS } from "../utils/vault-utils"
import { cn } from "@/lib/utils"

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

const scopeTabs = [
  { value: "all", label: "全部" },
  { value: "favorites", label: "收藏" },
  { value: "recent", label: "最近访问" },
] as const

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

  const allTags = Array.from(new Set(items.flatMap((item) => item.tags.map((t) => t.name))))

  const typeOptions: SelectOption[] = [
    { value: "__all", label: "类型" },
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

  const tagOptions: SelectOption[] = [
    { value: "__all", label: "标签" },
    ...allTags.map((tag) => ({ value: tag, label: tag })),
  ]

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

        {/* Scope Tabs */}
        <div className="flex items-center gap-1">
          {scopeTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => onScopeChange(tab.value)}
              className={cn(
                "h-8 px-3 text-xs rounded-md transition-colors",
                scopeFilter === tab.value
                  ? "bg-[#F2F4F7] text-[#111827] font-medium"
                  : "text-muted-foreground hover:bg-[#F7F7F8] hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="h-5 w-px bg-border/30" />

        <Select
          value={tagFilter ?? "__all"}
          onChange={(next) => onTagChange(next === "__all" ? null : next)}
          options={tagOptions}
          size="compact"
          showDescription={false}
          className="w-20"
          disabled={allTags.length === 0}
          placeholder="标签"
        />

        <Select
          value={typeFilter ?? "__all"}
          onChange={(next) => onTypeChange(next === "__all" ? null : next)}
          options={typeOptions}
          size="compact"
          showDescription={false}
          className="w-20"
          disabled={items.length === 0}
          placeholder="类型"
        />

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
        </Button>

        <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground px-2" onClick={lockVault}>
          <Lock className="h-3.5 w-3.5" />
        </Button>

        <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground px-2" onClick={onImport}>
          <Download className="h-3.5 w-3.5" />
        </Button>

        <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground px-2" onClick={onExport}>
          <Upload className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

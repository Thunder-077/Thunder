"use client"

import { useRef, useState, useCallback } from "react"
import { Shield, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useVault } from "../state"
import { useVaultSettings } from "../hooks/use-vault-settings"
import { useClipboardProtection } from "../hooks/use-clipboard-protection"
import { useDialog } from "@/hooks/use-dialog"
import type { VaultItemPlain, VaultTag } from "@thunder/vault"
import { VaultToolbar } from "./vault-toolbar"
import { VaultListPanel } from "./vault-list-panel"
import { VaultDetailPanel } from "./vault-detail-panel"
import { VaultItemEditDialog } from "./vault-item-edit-dialog"
import { inferVaultItemType, VAULT_ITEM_TYPE_LABELS } from "../utils/vault-utils"

const PAGE_SIZE = 8

export function VaultMainPage({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { items, selectedItem, selectItem, addItem, updateItem, deleteItem, error, exportBackup, importBackup } = useVault()
  const { settings } = useVaultSettings()
  const { copyWithProtection } = useClipboardProtection(settings.clipboardAutoClear, settings.clipboardClearSeconds)
  const dialog = useDialog()
  
  const [searchKeyword, setSearchKeyword] = useState("")
  const [scopeFilter, setScopeFilter] = useState<"all" | "favorites" | "recent">("all")
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<VaultItemPlain | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filteredAndSortedItems = (() => {
    let result = [...items]

    if (scopeFilter === "favorites") {
      result = result.filter((item) => item.favorite)
    }

    if (tagFilter) {
      result = result.filter((item) =>
        item.tags.some((t) => t.name.toLowerCase() === tagFilter.toLowerCase())
      )
    }

    if (typeFilter) {
      result = result.filter((item) => VAULT_ITEM_TYPE_LABELS[inferVaultItemType(item)] === typeFilter)
    }

    if (searchKeyword) {
      const query = searchKeyword.toLowerCase()
      result = result.filter((item) => {
        const typeLabel = VAULT_ITEM_TYPE_LABELS[inferVaultItemType(item)]?.toLowerCase() || ""
        return (
          item.title.toLowerCase().includes(query) ||
          item.username.toLowerCase().includes(query) ||
          (item.url && item.url.toLowerCase().includes(query)) ||
          (item.notes && item.notes.toLowerCase().includes(query)) ||
          item.tags.some((t) => t.name.toLowerCase().includes(query)) ||
          typeLabel.includes(query) ||
          item.extraFields.some(
            (f) =>
              f.name.toLowerCase().includes(query) &&
              (!f.sensitive || f.type === "text" || f.type === "url" || f.type === "email" || f.type === "note")
          ) ||
          item.extraFields.some(
            (f) =>
              !f.sensitive &&
              f.type !== "secret" &&
              f.type !== "totp" &&
              f.type !== "recovery-code" &&
              f.value.toLowerCase().includes(query)
          )
        )
      })
    }

    if (scopeFilter === "recent") {
      result.sort((a, b) => {
        const timeA = a.lastAccessedAt ? new Date(a.lastAccessedAt).getTime() : 0
        const timeB = b.lastAccessedAt ? new Date(b.lastAccessedAt).getTime() : 0
        return timeB - timeA
      })
    } else {
      result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    }

    return result
  })()

  const visibleItems = filteredAndSortedItems.slice(0, visibleCount)
  const hasMore = visibleCount < filteredAndSortedItems.length

  const handleResetFilters = useCallback(() => {
    setSearchKeyword("")
    setScopeFilter("all")
    setTagFilter(null)
    setTypeFilter(null)
    setVisibleCount(PAGE_SIZE)
  }, [])

  const handleLoadMore = useCallback(() => {
    setVisibleCount((prev) => prev + PAGE_SIZE)
  }, [])

  const handleSearchChange = useCallback((keyword: string) => {
    setSearchKeyword(keyword)
    setVisibleCount(PAGE_SIZE)
  }, [])

  const handleScopeChange = useCallback((scope: "all" | "favorites" | "recent") => {
    setScopeFilter(scope)
    setVisibleCount(PAGE_SIZE)
  }, [])

  const handleTagChange = useCallback((tag: string | null) => {
    setTagFilter(tag)
    setVisibleCount(PAGE_SIZE)
  }, [])

  const handleTypeChange = useCallback((type: string | null) => {
    setTypeFilter(type)
    setVisibleCount(PAGE_SIZE)
  }, [])

  const handleSelectItem = useCallback(async (item: VaultItemPlain) => {
    selectItem(item)

    const now = new Date().toISOString()
    if (!item.lastAccessedAt || new Date(now).getTime() - new Date(item.lastAccessedAt).getTime() > 60000) {
      await updateItem({ ...item, lastAccessedAt: now })
    }
  }, [selectItem, updateItem])

  const handleAddItem = () => {
    setEditingItem(null)
    setIsCreating(true)
    setEditDialogOpen(true)
  }

  const handleEditItem = (item: VaultItemPlain) => {
    setEditingItem(item)
    setIsCreating(false)
    setEditDialogOpen(true)
  }

  const handleToggleFavorite = async (item: VaultItemPlain) => {
    await updateItem({ ...item, favorite: !item.favorite })
  }

  const handleCopyField = async (text: string, isSensitive: boolean = false) => {
    copyWithProtection(text, isSensitive)
  }

  const handleDeleteItem = async (item: VaultItemPlain) => {
    const ok = await dialog.confirm({
      type: "danger",
      title: `删除「${item.title}」？`,
      description: "删除后无法恢复，请确认是否继续。",
      confirmText: "确认删除",
      cancelText: "取消",
    })
    if (!ok) return
    await deleteItem(item.id)
  }

  const handleAddTag = async (item: VaultItemPlain, tagName: string): Promise<VaultItemPlain> => {
    const trimmedName = tagName.trim()
    if (!trimmedName) throw new Error("标签名不能为空")

    const existingTag = item.tags.find((t) => t.name.toLowerCase() === trimmedName.toLowerCase())
    if (existingTag) throw new Error("标签已存在")

    const newTag: VaultTag = {
      id: `tag-${Date.now()}`,
      name: trimmedName,
      color: "",
    }

    const updatedItem = { ...item, tags: [...item.tags, newTag] }
    await updateItem(updatedItem)
    return updatedItem
  }

  const handleRemoveTag = async (item: VaultItemPlain, tagId: string): Promise<VaultItemPlain> => {
    const updatedItem = { ...item, tags: item.tags.filter((t) => t.id !== tagId) }
    await updateItem(updatedItem)
    return updatedItem
  }

  const handleRemoveExtraField = async (item: VaultItemPlain, fieldId: string): Promise<VaultItemPlain> => {
    const updatedItem = { ...item, extraFields: item.extraFields.filter((f) => f.id !== fieldId) }
    await updateItem(updatedItem)
    return updatedItem
  }

  const handleSaveItem = async (data: Omit<VaultItemPlain, "id" | "createdAt" | "updatedAt">) => {
    if (isCreating) {
      await addItem(data)
    } else if (editingItem) {
      await updateItem({ ...editingItem, ...data })
    }
    setEditDialogOpen(false)
  }

  const handleExport = async () => {
    const ok = await dialog.confirm({
      type: "info",
      title: "导出加密备份？",
      description: "备份文件仍需主密码才能恢复，请妥善保存。",
      confirmText: "确认导出",
      cancelText: "取消",
      allowOverlayClose: true,
    })
    if (!ok) return
    try {
      const json = await exportBackup()
      const date = new Date().toISOString().slice(0, 10)
      const blob = new Blob([json], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `vault-backup-${date}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      await dialog.error({
        title: "导出失败",
        description: e instanceof Error ? e.message : "导出加密备份时发生未知错误。",
      })
    }
  }

  const handleImport = async () => {
    const ok = await dialog.confirm({
      type: "danger",
      title: "导入并覆盖当前保险箱？",
      description: "导入加密备份将覆盖当前本地保险箱的所有数据，此操作不可撤销。",
      confirmText: "确认导入",
      cancelText: "取消",
    })
    if (!ok) return
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      await importBackup(text)
    } catch (err) {
      await dialog.error({
        title: "导入失败",
        description: err instanceof Error ? err.message : "导入加密备份时发生未知错误。",
      })
    }
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1400px] px-8 py-6">
          <div className="mb-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-subtle text-brand">
                <Shield size={18} />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">密码保险箱</h1>
                <p className="mt-0.5 text-xs text-muted-foreground">安全管理你的账号、密码、令牌与备注</p>
              </div>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="flex flex-1 items-center justify-center py-24">
              <div className="flex max-w-sm flex-col items-center gap-5 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-subtle text-brand">
                  <Shield size={36} />
                </div>
                <div className="flex flex-col gap-2">
                  <h3 className="text-lg font-semibold text-foreground">暂无密码条目</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    点击下方按钮开始创建你的第一个密码条目，安全存储账号与密码。
                  </p>
                </div>
                <Button variant="default" size="default" className="mt-2 gap-2" onClick={handleAddItem}>
                  <Plus className="h-4 w-4" />
                  创建第一个条目
                </Button>
              </div>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <VaultToolbar
                searchKeyword={searchKeyword}
                onSearchChange={handleSearchChange}
                scopeFilter={scopeFilter}
                onScopeChange={handleScopeChange}
                tagFilter={tagFilter}
                onTagChange={handleTagChange}
                typeFilter={typeFilter}
                onTypeChange={handleTypeChange}
                onReset={handleResetFilters}
                items={items}
                onAddItem={handleAddItem}
                onExport={handleExport}
                onImport={handleImport}
                onOpenSettings={onOpenSettings}
              />

              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleFileChange}
              />

              <div className="mt-5 grid gap-5" style={{ gridTemplateColumns: "minmax(0, 360px) minmax(0, 1fr)" }}>
                <VaultListPanel
                  items={visibleItems}
                  totalItems={filteredAndSortedItems.length}
                  selectedId={selectedItem?.id ?? null}
                  filterType={scopeFilter}
                  onFilterTypeChange={handleScopeChange}
                  onSelect={handleSelectItem}
                  onToggleFavorite={handleToggleFavorite}
                  onAddItem={handleAddItem}
                  onLoadMore={handleLoadMore}
                  hasMore={hasMore}
                  onResetFilters={handleResetFilters}
                  isEmpty={filteredAndSortedItems.length === 0 && items.length > 0}
                />

                <VaultDetailPanel
                  item={selectedItem}
                  onCopyField={handleCopyField}
                  onEdit={handleEditItem}
                  onDelete={handleDeleteItem}
                  onAddTag={handleAddTag}
                  onRemoveTag={handleRemoveTag}
                  onRemoveExtraField={handleRemoveExtraField}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <VaultItemEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        item={editingItem}
        isCreating={isCreating}
        onSave={handleSaveItem}
      />
    </div>
  )
}

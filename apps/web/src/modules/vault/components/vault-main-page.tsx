"use client"

import { useRef, useState } from "react"
import { PageHeader } from "@/components/page-header"
import { useVault } from "../state"
import { useVaultSettings } from "../hooks/use-vault-settings"
import { useClipboardProtection } from "../hooks/use-clipboard-protection"
import type { VaultItemPlain } from "@thunder/vault"
import { VaultToolbar } from "./vault-toolbar"
import { VaultItemList } from "./vault-item-list"
import { VaultItemForm } from "./vault-item-form"
import { VaultItemEditDialog } from "./vault-item-edit-dialog"
import { Card, CardContent } from "@/components/ui/card"
import { KeyRound } from "lucide-react"

export function VaultMainPage({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { items, selectedItem, selectItem, addItem, updateItem, deleteItem, error, exportBackup, importBackup } = useVault()
  const { settings } = useVaultSettings()
  const { copyWithProtection } = useClipboardProtection(settings.clipboardAutoClear, settings.clipboardClearSeconds)
  const [searchQuery, setSearchQuery] = useState("")
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<VaultItemPlain | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filteredItems = items.filter(
    (item) =>
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
  )

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

  const handleCopyUsername = (item: VaultItemPlain) => {
    copyWithProtection(item.username, false)
  }

  const handleCopyPassword = (item: VaultItemPlain) => {
    copyWithProtection(item.password, true)
  }

  const handleDeleteItem = async (item: VaultItemPlain) => {
    if (!window.confirm(`确定要删除「${item.title}」吗？`)) return
    await deleteItem(item.id)
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
    if (!window.confirm("导出加密备份？备份文件仍需主密码才能恢复，请妥善保存。")) return
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
      alert(e instanceof Error ? e.message : "导出失败")
    }
  }

  const handleImport = () => {
    if (!window.confirm("导入加密备份将覆盖当前本地保险箱的所有数据，此操作不可撤销。确定要继续吗？")) return
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      await importBackup(text)
    } catch (err) {
      alert(err instanceof Error ? err.message : "导入失败")
    }
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return (
    <div>
      <PageHeader title="密码保险箱" description="本地优先的加密密码管理模块" />

      {error && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <VaultToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
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

      <div className="mt-4 flex gap-4">
        <div className="w-80 shrink-0">
          <VaultItemList
            items={filteredItems}
            selectedId={selectedItem?.id ?? null}
            onSelect={selectItem}
            onCopyUsername={handleCopyUsername}
            onCopyPassword={handleCopyPassword}
            onEdit={handleEditItem}
            onDelete={handleDeleteItem}
          />
        </div>

        <div className="flex-1 min-w-0">
          {selectedItem ? (
            <Card>
              <CardContent className="p-4">
                <VaultItemForm item={selectedItem} onEdit={handleEditItem} onCopyPassword={handleCopyPassword} />
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <KeyRound className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">选择一个条目查看详情</p>
            </div>
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

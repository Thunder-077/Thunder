"use client"

import { Lock, Plus, Download, Upload, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useVault } from "../state"

interface VaultToolbarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  onAddItem: () => void
  onExport: () => void
  onImport: () => void
  onOpenSettings: () => void
}

export function VaultToolbar({
  searchQuery,
  onSearchChange,
  onAddItem,
  onExport,
  onImport,
  onOpenSettings,
}: VaultToolbarProps) {
  const { lockVault } = useVault()

  return (
    <div className="flex items-center gap-2">
      <Input
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="搜索条目..."
        className="h-8 max-w-48 text-sm"
      />
      <div className="flex-1" />
      <Button size="sm" className="gap-1" onClick={onAddItem}>
        <Plus className="h-3.5 w-3.5" />
        新增条目
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onOpenSettings} aria-label="设置">
        <Settings className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={lockVault} aria-label="锁定保险箱">
        <Lock className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onExport} aria-label="导出加密备份">
        <Download className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onImport} aria-label="导入加密备份">
        <Upload className="h-4 w-4" />
      </Button>
    </div>
  )
}

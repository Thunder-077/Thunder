"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { PasswordInput } from "@/components/ui/password-input"
import { PasswordGenerator } from "./password-generator"
import type { VaultItemPlain } from "@thunder/vault"

interface VaultItemEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: VaultItemPlain | null
  isCreating: boolean
  onSave: (data: Omit<VaultItemPlain, "id" | "createdAt" | "updatedAt">) => Promise<void>
}

function EditForm({
  item,
  isCreating,
  onSave,
  onCancel,
}: {
  item: VaultItemPlain | null
  isCreating: boolean
  onSave: (data: Omit<VaultItemPlain, "id" | "createdAt" | "updatedAt">) => Promise<void>
  onCancel: () => void
}) {
  const [title, setTitle] = useState(item?.title ?? "")
  const [username, setUsername] = useState(item?.username ?? "")
  const [password, setPassword] = useState(item?.password ?? "")
  const [url, setUrl] = useState(item?.url ?? "")
  const [notes, setNotes] = useState(item?.notes ?? "")
  const [tagsInput, setTagsInput] = useState(item?.tags.join(", ") ?? "")
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    setSaving(true)
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
      await onSave({
        title: title.trim(),
        username: username.trim(),
        password,
        url: url.trim(),
        notes: notes.trim(),
        tags,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground" htmlFor="item-title">标题</label>
        <Input
          id="item-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例如：GitHub 账号"
          required
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground" htmlFor="item-username">用户名</label>
        <Input
          id="item-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="用户名或邮箱"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground" htmlFor="item-password">密码</label>
        <PasswordInput
          id="item-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="密码"
        />
        <PasswordGenerator compact onFill={setPassword} />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground" htmlFor="item-url">网址</label>
        <Input
          id="item-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground" htmlFor="item-notes">备注</label>
        <textarea
          id="item-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="可选备注"
          rows={2}
          className="flex w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring resize-none"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground" htmlFor="item-tags">标签（逗号分隔）</label>
        <Input
          id="item-tags"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="工作, 社交"
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "保存中..." : isCreating ? "创建" : "保存"}
        </Button>
      </div>
    </form>
  )
}

export function VaultItemEditDialog({
  open,
  onOpenChange,
  item,
  isCreating,
  onSave,
}: VaultItemEditDialogProps) {
  const formKey = isCreating ? "create" : `edit-${item?.id ?? "none"}`

  const handleSave = async (data: Omit<VaultItemPlain, "id" | "createdAt" | "updatedAt">) => {
    await onSave(data)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isCreating ? "新增条目" : "编辑条目"}</DialogTitle>
        </DialogHeader>
        <EditForm
          key={formKey}
          item={item}
          isCreating={isCreating}
          onSave={handleSave}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

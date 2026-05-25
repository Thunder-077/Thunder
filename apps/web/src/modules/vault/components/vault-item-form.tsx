"use client"

import { useState } from "react"
import { Eye, EyeOff, Copy, ExternalLink, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import type { VaultItemPlain } from "@thunder/vault"
import { platform } from "@thunder/platform"

interface VaultItemFormProps {
  item: VaultItemPlain
  onEdit: (item: VaultItemPlain) => void
  onCopyPassword?: (item: VaultItemPlain) => void
}

export function VaultItemForm({ item, onEdit, onCopyPassword }: VaultItemFormProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const copyToClipboard = async (text: string, field: string) => {
    await platform.writeClipboardText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const handleCopyPassword = () => {
    if (onCopyPassword) {
      onCopyPassword(item)
    } else {
      copyToClipboard(item.password, "password")
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">{item.title}</h3>
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {item.url}
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">用户名</span>
          <div className="flex items-center gap-1">
            <span className="text-sm">{item.username}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => copyToClipboard(item.username, "username")}
              aria-label="复制用户名"
            >
              {copiedField === "username" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">密码</span>
          <div className="flex items-center gap-1">
            <span className="font-mono text-sm">
              {showPassword ? item.password : "••••••••"}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "隐藏密码" : "显示密码"}
            >
              {showPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleCopyPassword}
              aria-label="复制密码"
            >
              {copiedField === "password" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>
        </div>

        {item.notes && (
          <div>
            <span className="text-xs text-muted-foreground">备注</span>
            <p className="mt-1 text-sm whitespace-pre-wrap">{item.notes}</p>
          </div>
        )}

        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.tags.map((tag) => (
              <Badge key={tag.id} variant="secondary" className="text-xs">
                {tag.name}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <Separator />

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => onEdit(item)}>
          编辑
        </Button>
      </div>
    </div>
  )
}

"use client"

import { Globe, Copy, KeyRound, Pencil, Trash2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { VaultItemPlain } from "@thunder/vault"

interface VaultItemCardProps {
  item: VaultItemPlain
  selected: boolean
  onSelect: (item: VaultItemPlain) => void
  onCopyUsername: (item: VaultItemPlain) => void
  onCopyPassword: (item: VaultItemPlain) => void
  onEdit: (item: VaultItemPlain) => void
  onDelete: (item: VaultItemPlain) => void
}

export function VaultItemCard({
  item,
  selected,
  onSelect,
  onCopyUsername,
  onCopyPassword,
  onEdit,
  onDelete,
}: VaultItemCardProps) {
  return (
    <Card
      className={cn(
        "cursor-pointer transition-shadow hover:shadow-md",
        selected && "ring-1 ring-ring"
      )}
      onClick={() => onSelect(item)}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
            {item.url ? (
              <Globe className="h-4 w-4" />
            ) : (
              <span className="text-xs font-medium">
                {item.title.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-medium truncate">{item.title}</h4>
            <p className="text-xs text-muted-foreground truncate">{item.username}</p>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation()
                onCopyUsername(item)
              }}
              aria-label="复制用户名"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation()
                onCopyPassword(item)
              }}
              aria-label="复制密码"
            >
              <KeyRound className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation()
                onEdit(item)
              }}
              aria-label="编辑"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(item)
              }}
              aria-label="删除"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {item.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {item.tags.map((tag) => (
              <Badge key={tag.id} variant="secondary" className="text-xs">
                {tag.name}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

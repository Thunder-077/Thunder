"use client"

import { useState } from "react"
import { Lock, Eye, EyeOff, Copy, Check, MoreHorizontal, ExternalLink, ShieldCheck, Trash2, X, Plus, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { VaultItemPlain, VaultExtraField } from "@thunder/vault"
import { cn } from "@/lib/utils"
import { useDialog } from "@/hooks/use-dialog"
import { getFaviconUrl, getTagColor, formatDateTime, inferVaultItemType, VAULT_ITEM_TYPE_LABELS } from "../utils/vault-utils"

interface VaultDetailPanelProps {
  item: VaultItemPlain | null
  onCopyField: (text: string, isSensitive?: boolean) => void
  onToggleFavorite: (item: VaultItemPlain) => Promise<void>
  onEdit: (item: VaultItemPlain) => void
  onDelete: (item: VaultItemPlain) => void
  onAddTag: (item: VaultItemPlain, tagName: string) => Promise<VaultItemPlain>
  onRemoveTag: (item: VaultItemPlain, tagId: string) => Promise<VaultItemPlain>
  onRemoveExtraField: (item: VaultItemPlain, fieldId: string) => Promise<VaultItemPlain>
}

function DetailField({
  label,
  value,
  isPassword = false,
  onCopy,
  href,
}: {
  label: string
  value: string
  isPassword?: boolean
  onCopy?: () => void
  href?: string
}) {
  const [showValue, setShowValue] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (onCopy) {
      onCopy()
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const displayValue = isPassword && !showValue ? "••••••••" : value

  return (
    <div className="grid grid-cols-[120px_1fr] gap-4 items-center py-2 border-b border-gray-200 last:border-b-0">
      <span className="text-sm text-gray-500">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex-1 min-w-0">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline truncate inline-flex items-center gap-3"
            >
              {displayValue}
              <ExternalLink className="h-3.5 w-3.5 text-primary" />
            </a>
          ) : (
            <span className={cn("text-sm text-gray-700 truncate block", isPassword && !showValue && "font-mono tracking-wider")}>
              {displayValue}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {isPassword && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-gray-400 hover:text-gray-600"
              onClick={() => setShowValue(!showValue)}
              aria-label={showValue ? "隐藏" : "显示"}
            >
              {showValue ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
          )}
          
          {onCopy && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-gray-400 hover:text-gray-600"
              onClick={handleCopy}
              aria-label="复制"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function ExtraFieldComponent({
  field,
  onCopy,
  onRemove,
}: {
  field: VaultExtraField
  onCopy: () => void
  onRemove: () => void
}) {
  const [showValue, setShowValue] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    onCopy()
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const displayValue = field.sensitive && !showValue ? "••••••••" : field.value

  return (
    <div className="grid grid-cols-[120px_1fr] gap-4 items-center py-4 border-b border-gray-100/50 last:border-b-0">
      <span className="text-sm text-gray-500">{field.name}</span>
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex-1 min-w-0">
          <span className={cn("text-sm text-gray-700 truncate block", field.sensitive && !showValue && "font-mono tracking-wider")}>
            {displayValue}
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {field.sensitive && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-gray-400 hover:text-gray-600"
              onClick={() => setShowValue(!showValue)}
            >
              {showValue ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-gray-400 hover:text-gray-600"
            onClick={handleCopy}
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-gray-400 hover:text-destructive"
            onClick={onRemove}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

export function VaultDetailPanel({
  item,
  onCopyField,
  onEdit,
  onDelete,
  onAddTag,
  onRemoveTag,
  onRemoveExtraField,
}: Omit<VaultDetailPanelProps, 'onToggleFavorite'>) {
  const dialog = useDialog()
  const [newTagName, setNewTagName] = useState("")
  const [showTagInput, setShowTagInput] = useState(false)
  const [imgError, setImgError] = useState(false)
  const faviconUrl = item?.url ? getFaviconUrl(item.url) : ""

  if (!item) {
    return (
      <Card className="rounded-xl border-border/50 h-full">
        <div className="flex flex-col items-center justify-center py-20 text-center h-full">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/80 text-muted-foreground">
            <Lock className="h-7 w-7" />
          </div>
          <h3 className="mt-5 text-sm font-medium">选择一个条目查看详情</h3>
          <p className="mt-1.5 max-w-[260px] text-xs text-muted-foreground leading-relaxed">
            创建或选择条目后，可在这里查看账号、密码、标签与备注
          </p>
        </div>
      </Card>
    )
  }

  const extraFields = item.extraFields || []

  const totpFields = extraFields.filter((f) => f.type === "totp")
  const recoveryFields = extraFields.filter((f) => f.type === "recovery-code")
  const otherFields = extraFields.filter(
    (f) => f.type !== "totp" && f.type !== "recovery-code"
  )

  const handleAddTag = async () => {
    if (!newTagName.trim()) return
    try {
      await onAddTag(item, newTagName)
      setNewTagName("")
      setShowTagInput(false)
    } catch (err) {
      await dialog.warning({
        title: "添加标签失败",
        description: err instanceof Error ? err.message : "标签保存失败，请稍后重试。",
      })
    }
  }

  return (
    <Card className="rounded-xl border-border/50 overflow-hidden">
      <CardContent className="p-0">
        {/* 头部区域 */}
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground overflow-hidden">
                {faviconUrl && !imgError ? (
                  <img
                    src={faviconUrl}
                    alt=""
                    className="h-9 w-9 object-contain"
                    onError={() => setImgError(true)}
                  />
                ) : (
                  <span className="text-lg font-bold">{item.title.charAt(0).toUpperCase()}</span>
                )}
              </div>

              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold truncate">{item.title}</h2>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-normal bg-purple-50 text-purple-600">
                    {VAULT_ITEM_TYPE_LABELS[inferVaultItemType(item)]}
                  </span>
                </div>

                <p className="mt-1 text-xs text-gray-500">
                  最后更新：{formatDateTime(item.updatedAt)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs px-3" onClick={() => onCopyField(item.username)}>
                <Copy className="h-3.5 w-3.5" />
                复制用户名
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs px-3" onClick={() => onCopyField(item.password, true)}>
                <Lock className="h-3.5 w-3.5" />
                复制密码
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs px-3" onClick={() => onEdit(item)}>
                <Pencil className="h-3.5 w-3.5" />
                编辑
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <Button variant="outline" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[100px]">
                  <DropdownMenuItem
                    className="flex items-center justify-center gap-1.5 text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                    onClick={() => onDelete(item)}
                  >
                    <Trash2 className="h-4 w-4" />
                    删除
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <Separator />

        {/* 基本信息 */}
        <div className="px-5 py-2">
          <h4 className="text-sm font-semibold text-gray-700 mb-1">基本信息</h4>
          
          {item.url && (
            <DetailField label="网站地址" value={item.url} href={item.url} onCopy={() => onCopyField(item.url)} />
          )}

          <DetailField label="用户名" value={item.username} onCopy={() => onCopyField(item.username)} />
          <DetailField label="密码" value={item.password} isPassword onCopy={() => onCopyField(item.password, true)} />
        </div>

        {/* 双重验证/附加字段 */}
        {(totpFields.length > 0 || recoveryFields.length > 0 || otherFields.length > 0) && (
          <>
            <Separator />
            <div className="px-5 py-2">
              <h4 className="text-sm font-semibold text-gray-700 mb-1">双重验证 / 附加字段</h4>

              {totpFields.map((field) => (
                <ExtraFieldComponent
                  key={field.id}
                  field={field}
                  onCopy={() => onCopyField(field.value, true)}
                  onRemove={() => onRemoveExtraField(item, field.id)}
                />
              ))}

              {recoveryFields.map((field) => (
                <ExtraFieldComponent
                  key={field.id}
                  field={field}
                  onCopy={() => onCopyField(field.value, true)}
                  onRemove={() => onRemoveExtraField(item, field.id)}
                />
              ))}

              {otherFields.map((field) => (
                <ExtraFieldComponent
                  key={field.id}
                  field={field}
                  onCopy={() => onCopyField(field.value, field.sensitive)}
                  onRemove={() => onRemoveExtraField(item, field.id)}
                />
              ))}
            </div>
          </>
        )}

        <Separator />

        {/* 标签 */}
        <div className="px-5 py-3">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">标签</h4>
          <div className="flex flex-wrap items-center gap-2">
            {item.tags.map((tag, index) => {
              const color = getTagColor(tag.name) || "#94a3b8"
              return (
                <span
                  key={tag.id || tag.name || `tag-${index}`}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-normal"
                  style={{
                    backgroundColor: color + "18",
                    color: color,
                  }}
                >
                  {tag.name}
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      onRemoveTag(item, tag.id)
                    }}
                    className="opacity-60 hover:opacity-100 hover:text-destructive transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )
            })}
            
            {showTagInput ? (
              <div className="flex items-center gap-1">
                <Input
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="标签名"
                  className="h-7 w-24 rounded-md px-2 text-xs"
                  onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
                  autoFocus
                  onBlur={() => {
                    if (!newTagName.trim()) setShowTagInput(false)
                  }}
                />
                <button
                  className="h-7 w-7 flex items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-colors"
                  onClick={handleAddTag}
                  disabled={!newTagName.trim()}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                className="h-7 w-7 flex items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-colors"
                onClick={() => setShowTagInput(true)}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 备注 */}
        {item.notes && (
          <>
            <Separator />
            <div className="px-5 py-3">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">备注</h4>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                {item.notes}
              </p>
            </div>
          </>
        )}

        {/* 底部安全提示 */}
        <div className="border-t border-gray-100 bg-gray-50/50 px-5 py-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <p className="text-xs text-gray-500">
              敏感信息默认加密显示，复制后请注意剪贴板安全。
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

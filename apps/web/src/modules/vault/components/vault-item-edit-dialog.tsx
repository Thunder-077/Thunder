"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Eye,
  EyeOff,
  Copy,
  Shield,
  ListPlus,
  X,
  Plus,
  Trash2,
  RefreshCw,
  ExternalLink,
  CircleAlert,
  Globe,
  KeyRound,
  Terminal,
  Database,
  FileText,
} from "lucide-react"
import type {
  VaultItemPlain,
  VaultTag,
  VaultExtraField,
  VaultItemType,
  ExtraFieldType,
} from "@thunder/vault"
import { generatePassword } from "../utils/generate-password"
import { getPasswordStrength } from "./password-strength-meter"
import { getTagColor } from "../utils/vault-utils"
import { cn } from "@/lib/utils"
import { Select, type SelectOption } from "@/components/ui/select"

interface VaultItemEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: VaultItemPlain | null
  isCreating: boolean
  onSave: (data: Omit<VaultItemPlain, "id" | "createdAt" | "updatedAt">) => Promise<void>
}

const ITEM_TYPE_OPTIONS: SelectOption[] = [
  {
    value: "website",
    label: "网站账号",
    description: "用于网站、应用或在线服务登录",
    icon: <Globe className="h-4 w-4" />,
  },
  {
    value: "secret",
    label: "密钥 / 令牌",
    description: "用于 API Key、Token、密钥等",
    icon: <KeyRound className="h-4 w-4" />,
  },
  {
    value: "totp",
    label: "双重验证",
    description: "TOTP 密钥、恢复码与二次验证信息",
    icon: <Shield className="h-4 w-4" />,
  },
  {
    value: "server",
    label: "服务器 / SSH",
    description: "服务端、SSH 连接与主机信息",
    icon: <Terminal className="h-4 w-4" />,
  },
  {
    value: "database",
    label: "数据库",
    description: "数据库连接信息、账号与密码等",
    icon: <Database className="h-4 w-4" />,
  },
  {
    value: "note",
    label: "普通条目",
    description: "其他类型的账号信息或备注",
    icon: <FileText className="h-4 w-4" />,
  },
]

const EXTRA_FIELD_TYPE_OPTIONS: SelectOption[] = [
  { value: "text", label: "普通文本" },
  { value: "secret", label: "密钥 / 令牌" },
  { value: "url", label: "URL" },
  { value: "email", label: "邮箱" },
  { value: "totp", label: "TOTP 密钥" },
  { value: "recovery-code", label: "恢复码" },
  { value: "note", label: "备注" },
]

function defaultSensitiveForType(type: ExtraFieldType): boolean {
  return type === "secret" || type === "totp" || type === "recovery-code"
}

function TypeSelect({
  value,
  onChange,
}: {
  value: VaultItemType
  onChange: (v: VaultItemType) => void
}) {
  return (
    <Select
      value={value}
      onChange={(next) => onChange(next as VaultItemType)}
      options={ITEM_TYPE_OPTIONS}
      size="default"
      showDescription
      placeholder="选择条目类型"
    />
  )
}

function ExtraFieldTypeSelect({
  value,
  onChange,
}: {
  value: ExtraFieldType
  onChange: (v: ExtraFieldType) => void
}) {
  return (
    <Select
      value={value}
      onChange={(next) => onChange(next as ExtraFieldType)}
      options={EXTRA_FIELD_TYPE_OPTIONS}
      size="compact"
      showDescription={false}
      className="h-8"
    />
  )
}

function SensitiveInput({
  value,
  onChange,
  placeholder,
  className,
  onCopy,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  onCopy?: () => void
}) {
  return (
    <PasswordInput
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
      copyable={Boolean(onCopy)}
      onCopyValue={async (nextValue) => {
        if (onCopy) {
          await onCopy()
          return
        }
        await navigator.clipboard.writeText(nextValue)
      }}
    />
  )
}

function TagInput({
  tags,
  onChange,
}: {
  tags: VaultTag[]
  onChange: (tags: VaultTag[]) => void
}) {
  const [input, setInput] = useState("")

  const addTag = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    if (tags.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) return
    const newTag: VaultTag = {
      id: `tag-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: trimmed,
      color: "",
    }
    onChange([...tags, newTag])
  }

  const removeTag = (id: string) => {
    onChange(tags.filter((t) => t.id !== id))
  }

  return (
    <div className="space-y-2">
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="输入标签，按回车或逗号分隔"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault()
            const parts = input.split(",")
            parts.forEach((p) => addTag(p))
            setInput("")
          }
        }}
        onBlur={() => {
          if (input.trim()) {
            const parts = input.split(",")
            parts.forEach((p) => addTag(p))
            setInput("")
          }
        }}
      />
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => {
            const color = getTagColor(tag.name)
            return (
              <Badge
                key={tag.id}
                variant="secondary"
                className="text-xs px-2 py-0.5 h-6 gap-1 font-normal cursor-default"
                style={{
                  backgroundColor: color + "18",
                  color,
                  borderColor: color + "30",
                }}
              >
                {tag.name}
                <button
                  type="button"
                  onClick={() => removeTag(tag.id)}
                  className="hover:opacity-100 opacity-60"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ExtraFieldRow({
  field,
  onChange,
  onRemove,
}: {
  field: VaultExtraField
  onChange: (field: VaultExtraField) => void
  onRemove: () => void
}) {
  const [showValue, setShowValue] = useState(false)

  const handleTypeChange = (type: ExtraFieldType) => {
    onChange({
      ...field,
      type,
      sensitive: defaultSensitiveForType(type),
    })
  }

  return (
    <div className="grid grid-cols-12 gap-2 items-start">
      <div className="col-span-3">
        <Input
          value={field.name}
          onChange={(e) => onChange({ ...field, name: e.target.value })}
          placeholder="字段名"
          className="h-8 text-xs"
        />
      </div>
      <div className="col-span-3">
        <ExtraFieldTypeSelect
          value={field.type}
          onChange={handleTypeChange}
        />
      </div>
      <div className="col-span-4">
        {field.sensitive ? (
          <div className="relative">
            <Input
              type={showValue ? "text" : "password"}
              value={field.value}
              onChange={(e) => onChange({ ...field, value: e.target.value })}
              placeholder="字段值"
              className="h-8 text-xs pr-16"
            />
            <div className="absolute right-0 top-0 h-full flex items-center pr-1 gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setShowValue(!showValue)}
              >
                {showValue ? (
                  <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={async () => {
                  await navigator.clipboard.writeText(field.value)
                }}
              >
                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>
          </div>
        ) : (
          <Input
            value={field.value}
            onChange={(e) => onChange({ ...field, value: e.target.value })}
            placeholder="字段值"
            className="h-8 text-xs"
          />
        )}
      </div>
      <div className="col-span-1 flex justify-center pt-1">
        <Switch
          checked={field.sensitive}
          onCheckedChange={(v) => onChange({ ...field, sensitive: v })}
          size="sm"
        />
      </div>
      <div className="col-span-1 flex justify-end pt-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
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
  const [type, setType] = useState<VaultItemType>(item?.type ?? "website")
  const [title, setTitle] = useState(item?.title ?? "")
  const [username, setUsername] = useState(item?.username ?? "")
  const [password, setPassword] = useState(item?.password ?? "")
  const [url, setUrl] = useState(item?.url ?? "")
  const [notes, setNotes] = useState(item?.notes ?? "")
  const [tags, setTags] = useState<VaultTag[]>(item?.tags ?? [])
  const [totpKey, setTotpKey] = useState(
    item?.extraFields?.find((f) => f.type === "totp")?.value ?? ""
  )
  const [recoveryCode, setRecoveryCode] = useState(
    item?.extraFields?.find((f) => f.type === "recovery-code")?.value ?? ""
  )
  const [extraFields, setExtraFields] = useState<VaultExtraField[]>(
    item?.extraFields?.filter((f) => f.type !== "totp" && f.type !== "recovery-code") ?? []
  )
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const strength = getPasswordStrength(password)

  const handleGeneratePassword = () => {
    const pwd = generatePassword({
      length: 16,
      uppercase: true,
      lowercase: true,
      numbers: true,
      symbols: true,
    })
    setPassword(pwd)
  }

  const addExtraField = () => {
    setFormError(null)
    const newField: VaultExtraField = {
      id: `field-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: "",
      value: "",
      type: "text",
      sensitive: false,
    }
    setExtraFields((prev) => [...prev, newField])
  }

  const updateExtraField = (index: number, updates: Partial<VaultExtraField>) => {
    setExtraFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...updates } : f))
    )
  }

  const removeExtraField = (index: number) => {
    setExtraFields((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!type) {
      setFormError("条目类型不能为空。")
      return
    }

    if (!title.trim()) {
      setFormError("标题不能为空。")
      return
    }

    setSaving(true)
    try {
      const normalizedTags = tags
        .map((tag) => ({
          ...tag,
          name: tag.name.trim(),
        }))
        .filter((tag) => tag.name !== "")
        .filter(
          (tag, index, arr) =>
            arr.findIndex((other) => other.name.toLowerCase() === tag.name.toLowerCase()) === index
        )

      const normalizedExtraFields = extraFields
        .map((field) => ({
          ...field,
          name: field.name.trim(),
          value: field.value.trim(),
        }))
        .filter((field) => field.name !== "" || field.value !== "")

      const invalidExtraField = normalizedExtraFields.find(
        (field) => field.name === ""
      )
      if (invalidExtraField) {
        setFormError("附加字段中存在未填写字段名的条目，请补充后再保存。")
        setSaving(false)
        return
      }

      const finalExtraFields: VaultExtraField[] = [...normalizedExtraFields]

      if (totpKey.trim()) {
        const existingTotp = item?.extraFields?.find((f) => f.type === "totp")
        finalExtraFields.push({
          id: existingTotp?.id ?? `field-${Date.now()}-totp`,
          name: "TOTP 密钥",
          value: totpKey.trim(),
          type: "totp",
          sensitive: true,
        })
      }

      if (recoveryCode.trim()) {
        const existingRec = item?.extraFields?.find((f) => f.type === "recovery-code")
        finalExtraFields.push({
          id: existingRec?.id ?? `field-${Date.now()}-rec`,
          name: "恢复码",
          value: recoveryCode.trim(),
          type: "recovery-code",
          sensitive: true,
        })
      }

      await onSave({
        title: title.trim(),
        type,
        username: username.trim(),
        password: password.trim(),
        url: url.trim(),
        notes: notes.trim(),
        tags: normalizedTags,
        favorite: item?.favorite ?? false,
        lastAccessedAt: item?.lastAccessedAt ?? null,
        iconUrl: item?.iconUrl ?? null,
        extraFields: finalExtraFields,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto px-1 py-1 space-y-5 min-h-0">

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              条目类型 <span className="text-destructive">*</span>
            </label>
            <TypeSelect value={type} onChange={setType} />
          </div>
          
          <div className="hidden md:block"></div>

          
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground" htmlFor="item-title">
              标题 <span className="text-destructive">*</span>
            </label>
            <Input
              id="item-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：GitHub 账号"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground" htmlFor="item-url">
              网站地址
            </label>
            <div className="relative">
              <Input
                id="item-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="例如：https://github.com"
                className="pr-9"
              />
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground" htmlFor="item-username">
              用户名 / 邮箱
            </label>
            <Input
              id="item-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="例如：user@example.com"
            />
          </div>

          <div className="hidden md:block"></div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground" htmlFor="item-password">
              密码
            </label>
            <PasswordInput
              id="item-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="输入密码"
              copyable
              onCopyValue={async (value) => {
                await navigator.clipboard.writeText(value)
              }}
            />
            <div className="flex items-center gap-3 pt-0.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={handleGeneratePassword}
              >
                <RefreshCw className="h-3 w-3" />
                生成强密码
              </Button>
              {password && (
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    密码强度：{strength.label || "--"}
                  </span>
                  <div className="flex flex-1 gap-1">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div
                        key={i}
                        className={cn(
                          "h-1 flex-1 rounded-full transition-colors",
                          i < strength.level ? strength.color : "bg-muted"
                        )}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">标签</label>
            <TagInput tags={tags} onChange={setTags} />
          </div>
        </div>

        <div className="rounded-xl border border-border/50 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">双重验证（可选）</h4>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            用于保存登录时需要的 TOTP 密钥或恢复码，暂不生成动态验证码。
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">TOTP 密钥</label>
              <SensitiveInput
                value={totpKey}
                onChange={setTotpKey}
                placeholder="输入 TOTP 密钥（Base32 格式）"
                onCopy={() => navigator.clipboard.writeText(totpKey)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">恢复码</label>
              <SensitiveInput
                value={recoveryCode}
                onChange={setRecoveryCode}
                placeholder="输入恢复码或备用码"
                onCopy={() => navigator.clipboard.writeText(recoveryCode)}
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border/50 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <ListPlus className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">附加字段（可选）</h4>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            添加更多自定义信息，如 API Key、密钥、备注等。
          </p>

          {extraFields.length > 0 && (
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground px-0.5">
                <div className="col-span-3">字段名</div>
                <div className="col-span-3">字段类型</div>
                <div className="col-span-4">字段值</div>
                <div className="col-span-1 text-center">敏感</div>
                <div className="col-span-1 text-right">操作</div>
              </div>
              {extraFields.map((field, index) => (
                <ExtraFieldRow
                  key={field.id}
                  field={field}
                  onChange={(f) => updateExtraField(index, f)}
                  onRemove={() => removeExtraField(index)}
                />
              ))}
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={addExtraField}
          >
            <Plus className="h-3 w-3" />
            添加附加字段
          </Button>

          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Eye className="h-3 w-3" />
            敏感类型的字段默认隐藏，仅在查看时显示。
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground" htmlFor="item-notes">
            备注
          </label>
          <textarea
            id="item-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="可选备注信息..."
            rows={3}
            className="flex w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm text-foreground shadow-none transition-[border-color,box-shadow,background-color] outline-none placeholder:text-muted-foreground/80 hover:border-muted-foreground/30 focus-visible:border-muted-foreground/50 focus-visible:ring-[3px] focus-visible:ring-black/5 resize-none dark:focus-visible:ring-white/10"
          />
        </div>

        {formError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive flex items-center gap-1.5">
            <CircleAlert className="h-3.5 w-3.5" />
            {formError}
          </div>
        )}
      </div>

      <div className="shrink-0 pt-4 mt-2 border-t border-border/30 flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" size="sm" disabled={saving} className="bg-black text-white hover:bg-black/90">
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
      <DialogContent className="w-[95vw] sm:max-w-3xl h-[92vh] max-h-[92vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle>{isCreating ? "新增条目" : "编辑条目"}</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-6 flex-1 min-h-0 overflow-hidden">
          <EditForm
            key={formKey}
            item={item}
            isCreating={isCreating}
            onSave={handleSave}
            onCancel={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

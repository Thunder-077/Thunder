"use client"

import { useState } from "react"
import { RefreshCw, Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent } from "@/components/ui/card"
import { generatePassword } from "../utils/generate-password"
import { useVaultSettings } from "../hooks/use-vault-settings"

interface PasswordGeneratorProps {
  onFill?: (password: string) => void
  compact?: boolean
}

export function PasswordGenerator({ onFill, compact }: PasswordGeneratorProps) {
  const { settings, updateSettings } = useVaultSettings()
  const [generated, setGenerated] = useState("")
  const [copied, setCopied] = useState(false)

  const handleGenerate = () => {
    const password = generatePassword({
      length: settings.generatorLength,
      uppercase: settings.generatorUppercase,
      lowercase: settings.generatorLowercase,
      numbers: settings.generatorNumbers,
      symbols: settings.generatorSymbols,
    })
    setGenerated(password)
    setCopied(false)
  }

  const handleCopy = async () => {
    if (!generated) return
    await navigator.clipboard.writeText(generated)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleFill = () => {
    if (onFill && generated) {
      onFill(generated)
    }
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Input
          value={generated}
          readOnly
          placeholder="点击生成"
          className="font-mono text-sm h-8"
        />
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleGenerate} aria-label="生成密码">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        {onFill && generated && (
          <Button type="button" variant="outline" size="sm" className="shrink-0 text-xs" onClick={handleFill}>
            填入
          </Button>
        )}
      </div>
    )
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Input
            value={generated}
            readOnly
            placeholder="点击生成按钮"
            className="font-mono text-sm"
          />
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleCopy} disabled={!generated} aria-label="复制">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleGenerate} className="gap-1">
            <RefreshCw className="h-3.5 w-3.5" />
            生成密码
          </Button>
          {onFill && generated && (
            <Button variant="outline" size="sm" onClick={handleFill}>
              填入表单
            </Button>
          )}
        </div>

        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">长度</span>
            <Input
              type="number"
              min={8}
              max={64}
              value={settings.generatorLength}
              onChange={(e) => updateSettings({ generatorLength: Number(e.target.value) || 16 })}
              className="w-16 h-7 text-xs text-center"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">大写字母</span>
            <Switch checked={settings.generatorUppercase} onCheckedChange={(v) => updateSettings({ generatorUppercase: v })} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">小写字母</span>
            <Switch checked={settings.generatorLowercase} onCheckedChange={(v) => updateSettings({ generatorLowercase: v })} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">数字</span>
            <Switch checked={settings.generatorNumbers} onCheckedChange={(v) => updateSettings({ generatorNumbers: v })} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">符号</span>
            <Switch checked={settings.generatorSymbols} onCheckedChange={(v) => updateSettings({ generatorSymbols: v })} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

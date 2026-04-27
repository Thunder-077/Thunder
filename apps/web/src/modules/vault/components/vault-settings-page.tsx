"use client"

import { useRef } from "react"
import {
  Clock,
  Eye,
  KeyRound,
  ClipboardCheck,
  Download,
  Upload,
  AlertTriangle,
} from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { SettingSection } from "@/components/setting-section"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { useDialog } from "@/hooks/use-dialog"
import { useVault } from "../state"
import { useVaultSettings } from "../hooks/use-vault-settings"
import { AUTO_LOCK_OPTIONS, CLIPBOARD_CLEAR_OPTIONS } from "@thunder/vault"

export function VaultSettingsPage({ onBack }: { onBack: () => void }) {
  const { settings, updateSettings } = useVaultSettings()
  const { exportBackup, importBackup, clearVault } = useVault()
  const dialog = useDialog()
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const handleClearVault = async () => {
    const ok = await dialog.confirm({
      type: "danger",
      title: "清空本地保险箱？",
      description:
        "清空本地保险箱将删除所有本地数据，包括所有密码条目和保险箱元信息。此操作不可撤销。",
      confirmText: "确认清空",
      cancelText: "取消",
    })
    if (!ok) {
      return
    }
    await clearVault()
  }

  return (
    <div>
      <PageHeader title="保险箱设置" description="管理保险箱的各项配置" />

      <Card>
        <CardContent className="p-5">
          <SettingSection
            title="自动锁定"
            description="无操作超过设定时间后自动锁定保险箱"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">锁定时间</span>
              </div>
              <Select
                value={String(settings.autoLockMinutes)}
                onChange={(v) => updateSettings({ autoLockMinutes: Number(v) })}
                options={AUTO_LOCK_OPTIONS.map((o) => ({
                  label: o.label,
                  value: String(o.value),
                }))}
                className="w-28"
                size="compact"
                showDescription={false}
              />
            </div>
          </SettingSection>

          <SettingSection title="显示" description="控制密码条目的显示方式">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">默认隐藏密码</span>
              </div>
              <Switch
                checked={settings.hidePasswordsByDefault}
                onCheckedChange={(v) => updateSettings({ hidePasswordsByDefault: v })}
              />
            </div>
          </SettingSection>

          <SettingSection
            title="密码生成器"
            description="设置密码生成器的默认参数"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">默认长度</span>
              </div>
              <Input
                type="number"
                min={8}
                max={64}
                value={settings.generatorLength}
                onChange={(e) =>
                  updateSettings({ generatorLength: Number(e.target.value) || 16 })
                }
                className="w-16 h-8 text-sm text-center"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm pl-6">大写字母</span>
              <Switch
                checked={settings.generatorUppercase}
                onCheckedChange={(v) => updateSettings({ generatorUppercase: v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm pl-6">小写字母</span>
              <Switch
                checked={settings.generatorLowercase}
                onCheckedChange={(v) => updateSettings({ generatorLowercase: v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm pl-6">数字</span>
              <Switch
                checked={settings.generatorNumbers}
                onCheckedChange={(v) => updateSettings({ generatorNumbers: v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm pl-6">符号</span>
              <Switch
                checked={settings.generatorSymbols}
                onCheckedChange={(v) => updateSettings({ generatorSymbols: v })}
              />
            </div>
          </SettingSection>

          <SettingSection
            title="剪贴板保护"
            description="复制密码后自动清理剪贴板，防止密码泄露"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">自动清理剪贴板</span>
              </div>
              <Switch
                checked={settings.clipboardAutoClear}
                onCheckedChange={(v) => updateSettings({ clipboardAutoClear: v })}
              />
            </div>
            {settings.clipboardAutoClear && (
              <div className="flex items-center justify-between">
                <span className="text-sm pl-6">清理时间</span>
                <Select
                  value={String(settings.clipboardClearSeconds)}
                  onChange={(v) => updateSettings({ clipboardClearSeconds: Number(v) })}
                  options={CLIPBOARD_CLEAR_OPTIONS.map((o) => ({
                    label: o.label,
                    value: String(o.value),
                  }))}
                  className="w-28"
                  size="compact"
                  showDescription={false}
                />
              </div>
            )}
          </SettingSection>

          <SettingSection
            title="导入导出"
            description="仅支持加密备份的导入和导出"
          >
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1" onClick={handleExport}>
                <Download className="h-3.5 w-3.5" />
                导出加密备份
              </Button>
              <Button variant="outline" size="sm" className="gap-1" onClick={handleImport}>
                <Upload className="h-3.5 w-3.5" />
                导入加密备份
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              导出的备份文件为密文数据，仍需主密码才能恢复。导入将覆盖当前本地保险箱。
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileChange}
            />
          </SettingSection>

          <SettingSection title="危险区域" description="以下操作不可撤销，请谨慎执行">
            <Card className="border-destructive/30">
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">
                      清空保险箱将删除所有数据，包括所有密码条目和保险箱元信息。此操作不可撤销。
                    </p>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="mt-2 gap-1"
                      onClick={handleClearVault}
                    >
                      清空保险箱
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </SettingSection>
        </CardContent>
      </Card>

      <div className="mt-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← 返回保险箱
        </Button>
      </div>
    </div>
  )
}

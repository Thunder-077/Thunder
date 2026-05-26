"use client"

import { DesktopRuntimeCard } from "@/components/desktop-runtime-card"
import { PageHeader } from "@/components/page-header"
import { SettingSection } from "@/components/setting-section"
import { ThemeToggle } from "@/components/theme-toggle"
import { Badge } from "@/components/ui/badge"

export default function SettingsPage() {
  return (
    <div className="max-w-2xl">
      <PageHeader
        title="设置"
      />

      <SettingSection title="外观" description="自定义应用的外观和主题">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm">主题</p>
            <p className="text-xs text-muted-foreground">选择浅色、深色或跟随系统</p>
          </div>
          <ThemeToggle />
        </div>
      </SettingSection>

      <SettingSection title="关于" description="应用信息">
        <div className="flex items-center justify-between">
          <p className="text-sm">版本</p>
          <Badge variant="secondary" className="text-xs">0.1.0</Badge>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm">框架</p>
          <span className="text-xs text-muted-foreground">Next.js + React</span>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm">运行环境</p>
          <span className="text-xs text-muted-foreground">Web</span>
        </div>
        <DesktopRuntimeCard />
      </SettingSection>

      <SettingSection title="模块管理" description="启用或禁用已安装的模块">
        <div className="rounded-lg border border-border p-4 text-center">
          <p className="text-sm text-muted-foreground">模块管理功能将在后续版本中实现</p>
        </div>
      </SettingSection>
    </div>
  )
}

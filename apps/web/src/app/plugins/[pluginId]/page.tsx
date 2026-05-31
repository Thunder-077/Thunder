"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { AlertTriangle, ShieldCheck } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  getDesktopPlugin,
  shouldLoadDesktopPlugins,
  startDesktopPluginRuntime,
  type InstalledDesktopPlugin,
} from "@/lib/desktop-plugins"

export default function DesktopPluginPage() {
  const params = useParams<{ pluginId: string }>()
  const pluginId = params.pluginId
  const desktopEnabled = shouldLoadDesktopPlugins()
  const [plugin, setPlugin] = useState<InstalledDesktopPlugin | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!desktopEnabled) {
      return
    }

    let cancelled = false
    getDesktopPlugin(pluginId)
      .then(async (result) => {
        if (result.trust.trusted && result.manifest.api?.runtime) {
          await startDesktopPluginRuntime(result.manifest.id)
        }
        if (!cancelled) setPlugin(result)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "插件加载失败")
      })

    return () => {
      cancelled = true
    }
  }, [desktopEnabled, pluginId])

  if (!desktopEnabled) {
    return (
      <div>
        <PageHeader title="插件不可用" />
        <Card>
          <CardContent className="flex items-start gap-3 p-5 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <span>插件系统仅在桌面端启用</span>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <PageHeader title="插件不可用" />
        <Card>
          <CardContent className="flex items-start gap-3 p-5 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <span>{error}</span>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!plugin) {
    return (
      <div>
        <PageHeader title="插件" />
        <div className="h-[calc(100vh-10rem)] rounded-md border border-border/70 bg-muted/20" />
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-0 flex-col">
      <PageHeader title={plugin.manifest.name} />
      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary">v{plugin.manifest.version}</Badge>
        <span>{plugin.manifest.author.name}</span>
        <span className="inline-flex items-center gap-1">
          <ShieldCheck className="h-3.5 w-3.5" />
          沙箱插件
        </span>
      </div>
      <iframe
        title={plugin.manifest.name}
        src={plugin.webEntryUrl}
        allow="microphone"
        sandbox="allow-forms allow-modals allow-popups allow-scripts"
        referrerPolicy="no-referrer"
        className="min-h-0 flex-1 rounded-md border border-border/70 bg-background"
      />
    </div>
  )
}

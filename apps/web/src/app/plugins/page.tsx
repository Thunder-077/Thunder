"use client"

import { useEffect, useState } from "react"
import { Database, Download, Package, Trash2 } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  installLocalDesktopPlugin,
  installBundledDesktopPlugin,
  installPackagedDesktopPlugin,
  listDesktopPluginMarketplace,
  listDesktopPlugins,
  runDesktopPluginMigrations,
  shouldLoadDesktopPlugins,
  uninstallDesktopPlugin,
  type DesktopPluginMarketplaceEntry,
  type InstalledDesktopPlugin,
} from "@/lib/desktop-plugins"

export default function DesktopPluginMarketplacePage() {
  const [installed, setInstalled] = useState<InstalledDesktopPlugin[]>([])
  const [marketplace, setMarketplace] = useState<DesktopPluginMarketplaceEntry[]>([])
  const [sourcePath, setSourcePath] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function refresh() {
    if (!shouldLoadDesktopPlugins()) return
    const [installedResult, marketplaceResult] = await Promise.all([
      listDesktopPlugins(),
      listDesktopPluginMarketplace(),
    ])
    setInstalled(installedResult.plugins)
    setMarketplace(marketplaceResult.plugins)
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        if (!shouldLoadDesktopPlugins()) return
        const [installedResult, marketplaceResult] = await Promise.all([
          listDesktopPlugins(),
          listDesktopPluginMarketplace(),
        ])
        if (cancelled) return
        setInstalled(installedResult.plugins)
        setMarketplace(marketplaceResult.plugins)
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "插件市场加载失败")
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  async function installLocal() {
    if (!sourcePath.trim()) return
    setLoading(true)
    setMessage(null)
    try {
      await installLocalDesktopPlugin(sourcePath.trim())
      setSourcePath("")
      await refresh()
      setMessage("插件已安装")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "插件安装失败")
    } finally {
      setLoading(false)
    }
  }

  async function removePlugin(pluginId: string) {
    setLoading(true)
    setMessage(null)
    try {
      await uninstallDesktopPlugin(pluginId)
      await refresh()
      setMessage("插件已卸载")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "插件卸载失败")
    } finally {
      setLoading(false)
    }
  }

  async function installFromMarketplace(entry: DesktopPluginMarketplaceEntry) {
    setLoading(true)
    setMessage(null)
    try {
      if (entry.source === "bundled") {
        await installBundledDesktopPlugin(entry.id)
      } else {
        await installPackagedDesktopPlugin(entry)
      }
      await refresh()
      setMessage("插件已安装")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "插件安装失败")
    } finally {
      setLoading(false)
    }
  }


  async function migratePlugin(pluginId: string) {
    setLoading(true)
    setMessage(null)
    try {
      const result = await runDesktopPluginMigrations(pluginId)
      await refresh()
      setMessage(`迁移完成：新增 ${result.applied.length} 个，跳过 ${result.skipped.length} 个`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "插件迁移执行失败")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <PageHeader title="插件市场" />

      <section className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-medium">本地安装</h2>
          <Badge variant="secondary">Desktop</Badge>
        </div>
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex gap-2">
              <Input
                value={sourcePath}
                onChange={(event) => setSourcePath(event.target.value)}
                placeholder="输入已解压插件目录的绝对路径"
              />
              <Button onClick={installLocal} disabled={loading || !sourcePath.trim()} className="gap-1.5">
                <Download className="h-4 w-4" />
                安装
              </Button>
            </div>
            {message && <p className="text-xs text-muted-foreground">{message}</p>}
          </CardContent>
        </Card>
      </section>

      <section className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-medium">已安装插件</h2>
          <Badge variant="secondary">{installed.length}</Badge>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {installed.map((plugin) => (
            <Card key={plugin.manifest.id}>
              <CardContent className="p-4">
                <div className="mb-3 flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30">
                    <Package className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-medium">{plugin.manifest.name}</h3>
                    <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {plugin.manifest.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">v{plugin.manifest.version}</Badge>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {plugin.manifest.migrations?.sqlite && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void migratePlugin(plugin.manifest.id)}
                      disabled={loading}
                      className="gap-1.5"
                    >
                      <Database className="h-3.5 w-3.5" />
                      迁移
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void removePlugin(plugin.manifest.id)}
                    disabled={loading}
                    className="gap-1.5"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    卸载
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-medium">市场插件</h2>
          <Badge variant="secondary">{marketplace.length}</Badge>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {marketplace.map((plugin) => (
            <Card key={plugin.id}>
              <CardContent className="p-4">
                <h3 className="mb-1 text-sm font-medium">{plugin.name}</h3>
                <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{plugin.description}</p>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">v{plugin.version}</Badge>
                    {plugin.source === "bundled" && <Badge variant="outline">官方内置</Badge>}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void installFromMarketplace(plugin)}
                    disabled={loading}
                    className="gap-1.5"
                  >
                    <Download className="h-3.5 w-3.5" />
                    安装
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}

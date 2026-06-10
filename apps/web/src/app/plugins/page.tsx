"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Box,
  ChevronLeft,
  ChevronRight,
  Code2,
  Download,
  FileText,
  Link2,
  Package,
  Paintbrush,
  Palette,
  Plus,
  ScrollText,
  Search,
  Settings2,
  ShieldCheck,
  Star,
  Tags,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  type DesktopInstalledPlugin,
  installBundledDesktopPlugin,
  installPackagedDesktopPlugin,
  listDesktopPluginMarketplace,
  listDesktopPlugins,
  shouldLoadDesktopPlugins,
  type DesktopPluginMarketplaceEntry,
} from "@/lib/desktop-plugins"
import { cn } from "@/lib/utils"

type PluginVisual = {
  id: string
  name: string
  author: string
  description: string
  downloads: string
  rating: string
  icon: React.ComponentType<{ className?: string }>
  iconClassName: string
  entry?: DesktopPluginMarketplaceEntry
}

const lucideIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Box,
  Code2,
  FileText,
  Package,
  Paintbrush,
  Palette,
  ScrollText,
  Search,
  Settings2,
  ShieldCheck,
  Star,
}

function resolveIcon(name?: string): React.ComponentType<{ className?: string }> {
  return (name && lucideIconMap[name]) || Box
}

const sidebarItems = [
  { label: "精选", icon: Star, active: true },
  { label: "全部插件", icon: Package },
  { label: "已安装", icon: ShieldCheck },
  { label: "更新", icon: Settings2 },
]
const categories = [
  { label: "主题", icon: Palette },
  { label: "编辑器", icon: Paintbrush },
  { label: "文件与链接", icon: Link2 },
  { label: "开发工具", icon: Code2 },
  { label: "搜索", icon: Search },
  { label: "笔记增强", icon: FileText },
  { label: "其他", icon: Tags },
]

function marketplaceEntryToVisual(entry: DesktopPluginMarketplaceEntry): PluginVisual {
  return {
    id: entry.id,
    name: entry.name,
    author: entry.source === "bundled" ? "Thunder" : entry.author?.name ?? "marketplace",
    description: entry.description,
    downloads: "暂无",
    rating: "暂无",
    icon: resolveIcon(entry.icon),
    iconClassName: "bg-blue-100 text-blue-600",
    entry,
  }
}

export default function DesktopPluginMarketplacePage() {
  const router = useRouter()
  const [installed, setInstalled] = useState<DesktopInstalledPlugin[]>([])
  const [marketplace, setMarketplace] = useState<DesktopPluginMarketplaceEntry[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const sidebarCounts = useMemo(() => ({
    "全部插件": marketplace.length,
    "已安装": installed.length,
  }), [marketplace.length, installed.length])

  const installedIds = useMemo(
    () => new Set(installed.map((plugin) => plugin.manifest.id)),
    [installed]
  )

  const realMarketplaceCards = useMemo(
    () => marketplace.map(marketplaceEntryToVisual),
    [marketplace]
  )

  const recommended = useMemo(
    () => realMarketplaceCards.slice(0, 4),
    [realMarketplaceCards]
  )

  const trending = useMemo(
    () => realMarketplaceCards.slice(0, 6),
    [realMarketplaceCards]
  )

  const leftTrending = useMemo(
    () => trending.slice(0, Math.ceil(trending.length / 2)),
    [trending]
  )

  const rightTrending = useMemo(
    () => trending.slice(Math.ceil(trending.length / 2)),
    [trending]
  )

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

  async function installFromMarketplace(plugin: PluginVisual) {
    if (!plugin.entry || installedIds.has(plugin.id)) return
    setLoadingId(plugin.id)
    setMessage(null)
    try {
      if (plugin.entry.source === "bundled") {
        await installBundledDesktopPlugin(plugin.entry.id)
      } else {
        await installPackagedDesktopPlugin(plugin.entry)
      }
      await refresh()
      setMessage("插件已安装")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "插件安装失败")
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <div className="grid gap-6 lg:-mt-10 lg:grid-cols-[224px_minmax(0,1fr)]">
      <aside className="hidden border-r border-border/70 pr-5 lg:block">
        <div className="sticky top-20 space-y-5">
          <h2 className="text-base font-semibold tracking-tight">插件市场</h2>
          <label className="flex h-9 items-center gap-2 rounded-md border border-border/75 bg-background/85 px-3 text-xs text-muted-foreground shadow-xs">
            <Search className="h-4 w-4" />
            <span>搜索插件、功能或作者...</span>
          </label>

          <nav className="space-y-1 border-b border-border/70 pb-4">
            {sidebarItems.map((item) => (
              <button
                key={item.label}
                className={cn(
                  "flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-left text-sm text-muted-foreground transition-colors",
                  item.active && "bg-blue-50 text-blue-600"
                )}
                onClick={() => {
                  if (item.label === "已安装") {
                    router.push("/plugins/installed")
                  }
                }}
              >
                <item.icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
                {sidebarCounts[item.label as keyof typeof sidebarCounts] !== undefined && (
                  <span className="text-xs text-muted-foreground">
                    {sidebarCounts[item.label as keyof typeof sidebarCounts]}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div className="space-y-2 border-b border-border/70 pb-4">
            <p className="px-2.5 text-xs text-muted-foreground">分类</p>
            {categories.map((item) => (
              <button
                key={item.label}
                className="flex h-8 w-full items-center gap-3 rounded-md px-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          <button className="flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground">
            <Plus className="h-4 w-4" />
            <span>创建插件</span>
          </button>
        </div>
      </aside>

      <main className="min-w-0 space-y-5">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">插件市场</h1>
          <p className="text-sm text-muted-foreground">
            发现、安装并管理插件，扩展 Thunder 的能力，提升你的工作效率。
          </p>
          {message && <p className="pt-1 text-xs text-muted-foreground">{message}</p>}
        </div>

        <section
          className="relative h-[154px] overflow-hidden rounded-lg shadow-sm"
          style={{ background: "linear-gradient(115deg, #8b5cf6 0%, #5b7cff 48%, #55b9ff 100%)" }}
        >
          <div className="absolute inset-0 opacity-35 [background-image:radial-gradient(circle_at_24%_18%,rgba(255,255,255,0.65),transparent_20%),radial-gradient(circle_at_86%_20%,rgba(255,255,255,0.45),transparent_22%)]" />
          <button className="absolute left-4 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-primary-foreground/45 text-primary-foreground shadow-sm backdrop-blur">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="relative z-10 flex h-full items-center px-16">
            <div className="max-w-md text-primary-foreground">
              <h2 className="text-2xl font-semibold">扩展你的体验</h2>
              <p className="mt-3 text-sm leading-6 text-primary-foreground/82">
                通过插件让应用更强大
                <br />
                发现社区开发的插件，提升你的工作效率。
              </p>
              <Button size="sm" variant="secondary" className="mt-3 bg-primary-foreground text-blue-600 hover:bg-primary-foreground/90">
                浏览全部插件
              </Button>
            </div>
          </div>
          <div className="absolute right-32 top-5 hidden h-28 w-32 rotate-[-14deg] rounded-[18px] bg-primary-foreground/24 shadow-2xl backdrop-blur-sm md:block">
            <div className="absolute inset-3 rounded-[14px] bg-primary-foreground/20" />
            <PuzzleMark />
          </div>
          <button className="absolute right-4 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-primary-foreground/45 text-primary-foreground shadow-sm backdrop-blur">
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
            {[0, 1, 2, 3].map((dot) => (
              <span
                key={dot}
                className={cn("h-2 w-2 rounded-full bg-primary-foreground/45", dot === 0 && "bg-primary-foreground")}
              />
            ))}
          </div>
        </section>

        {realMarketplaceCards.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
            <Package className="mb-3 h-10 w-10 text-muted-foreground/60" />
            <h3 className="text-sm font-semibold text-foreground">暂无可用插件</h3>
            <p className="mt-1 max-w-[280px] text-xs text-muted-foreground">
              插件市场当前暂无插件。请稍后再来查看。
            </p>
          </div>
        ) : (<>
        <section>
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-base font-semibold">为你推荐</h2>
            <button className="text-sm font-medium text-blue-600">查看全部</button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {recommended.map((plugin) => (
              <PluginCard
                key={plugin.id}
                plugin={plugin}
                installed={installedIds.has(plugin.id)}
                loading={loadingId === plugin.id}
                onInstall={() => void installFromMarketplace(plugin)}
              />
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2.5 text-base font-semibold">热门插件</h2>
          <div className={cn(
            "grid grid-cols-1 gap-4",
            rightTrending.length > 0 && "md:grid-cols-2"
          )}>
            {leftTrending.length > 0 && (
              <div className="flex flex-col rounded-xl border border-border/70 bg-background/86 shadow-sm overflow-hidden divide-y divide-border/40">
                {leftTrending.map((plugin, index) => (
                  <TrendingRow
                    key={plugin.id}
                    index={index + 1}
                    plugin={plugin}
                    installed={installedIds.has(plugin.id)}
                    loading={loadingId === plugin.id}
                    onInstall={() => void installFromMarketplace(plugin)}
                  />
                ))}
              </div>
            )}
            {rightTrending.length > 0 && (
              <div className="flex flex-col rounded-xl border border-border/70 bg-background/86 shadow-sm overflow-hidden divide-y divide-border/40">
                {rightTrending.map((plugin, index) => (
                  <TrendingRow
                    key={plugin.id}
                    index={leftTrending.length + index + 1}
                    plugin={plugin}
                    installed={installedIds.has(plugin.id)}
                    loading={loadingId === plugin.id}
                    onInstall={() => void installFromMarketplace(plugin)}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="mt-4 flex justify-center">
            <button className="flex items-center gap-1 text-sm font-medium text-blue-600">
              查看全部热门插件 <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </section>
        </>)}
      </main>
    </div>
  )
}

function PluginCard({
  plugin,
  installed,
  loading,
  onInstall,
}: {
  plugin: PluginVisual
  installed: boolean
  loading: boolean
  onInstall: () => void
}) {
  return (
    <article className="rounded-xl border border-border/70 bg-background/86 p-5 shadow-sm">
      <div className="flex items-start gap-3.5">
        <PluginIcon plugin={plugin} />
        <div className="min-w-0 pt-0.5">
          <h3 className="truncate text-sm font-semibold">{plugin.name}</h3>
          <p className="truncate text-xs text-muted-foreground">{plugin.author}</p>
        </div>
      </div>
      <p className="mt-4 line-clamp-2 min-h-10 text-sm leading-relaxed text-foreground/80">{plugin.description}</p>
      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Download className="h-3.5 w-3.5" />
          {plugin.downloads}
        </span>
        <span className="flex items-center gap-1">
          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
          {plugin.rating}
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={loading || installed || !plugin.entry}
        onClick={onInstall}
        className="mt-4 h-8 w-full rounded-md text-blue-600 hover:text-blue-600"
      >
        {installed ? "已安装" : loading ? "安装中" : "安装"}
      </Button>
    </article>
  )
}

function TrendingRow({
  index,
  plugin,
  installed,
  loading,
  onInstall,
}: {
  index: number
  plugin: PluginVisual
  installed: boolean
  loading: boolean
  onInstall: () => void
}) {
  return (
    <article className="grid min-h-[72px] grid-cols-[28px_40px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
      <span className="text-sm font-medium text-muted-foreground">{index}</span>
      <PluginIcon plugin={plugin} small />
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold">{plugin.name}</h3>
        <p className="truncate text-xs text-muted-foreground">{plugin.author}</p>
        <p className="truncate text-xs text-foreground/70">{plugin.description}</p>
      </div>
      <div className="flex items-center gap-4">
        <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
          <Download className="h-3.5 w-3.5" />
          {plugin.downloads}
        </span>
        <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
          {plugin.rating}
        </span>
        <Button
          size="xs"
          variant="secondary"
          disabled={loading || installed || !plugin.entry}
          onClick={onInstall}
          className="rounded-md bg-blue-50 text-blue-600 hover:bg-blue-50 hover:text-blue-600"
        >
          {installed ? "已安装" : loading ? "安装中" : "安装"}
        </Button>
      </div>
    </article>
  )
}

function PluginIcon({ plugin, small = false }: { plugin: PluginVisual; small?: boolean }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md",
        small ? "h-8 w-8" : "h-9 w-9",
        plugin.iconClassName
      )}
    >
      <plugin.icon className={small ? "h-4 w-4" : "h-5 w-5"} />
    </div>
  )
}

function PuzzleMark() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="relative h-20 w-20 rounded-[16px] bg-primary-foreground/28 shadow-inner">
        <div className="absolute left-7 top-[-8px] h-6 w-6 rounded-full bg-primary-foreground/28" />
        <div className="absolute right-[-8px] top-7 h-6 w-6 rounded-full bg-brand" />
        <div className="absolute bottom-[-8px] left-7 h-6 w-6 rounded-full bg-brand" />
      </div>
    </div>
  )
}

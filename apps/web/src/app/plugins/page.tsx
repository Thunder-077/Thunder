"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Box,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Code2,
  Download,
  FileText,
  Grid2X2,
  Layers3,
  Link2,
  ListChecks,
  Package,
  Paintbrush,
  Palette,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Table2,
  Tags,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  installBundledDesktopPlugin,
  installPackagedDesktopPlugin,
  listDesktopPluginMarketplace,
  listDesktopPlugins,
  shouldLoadDesktopPlugins,
  type DesktopPluginMarketplaceEntry,
  type InstalledDesktopPlugin,
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

const recommendedPlaceholders: PluginVisual[] = [
  {
    id: "custom-themes",
    name: "Custom Themes",
    author: "janneck",
    description: "轻松创建和管理主题，实时预览，完美定制。",
    downloads: "128.6K",
    rating: "4.8",
    icon: Paintbrush,
    iconClassName: "bg-violet-100 text-violet-600",
  },
  {
    id: "calendar",
    name: "Calendar",
    author: "liamcain",
    description: "在日历视图中查看和管理你的笔记。",
    downloads: "86.3K",
    rating: "4.6",
    icon: CalendarDays,
    iconClassName: "bg-sky-100 text-sky-600",
  },
  {
    id: "dataview",
    name: "Dataview",
    author: "blacksmithgu",
    description: "强大的数据视图和查询工具。",
    downloads: "319.7K",
    rating: "4.9",
    icon: ListChecks,
    iconClassName: "bg-slate-100 text-slate-700",
  },
  {
    id: "templater",
    name: "Templater",
    author: "SilentVoid",
    description: "使用模板快速插入内容，提升效率。",
    downloads: "241.2K",
    rating: "4.8",
    icon: Sparkles,
    iconClassName: "bg-indigo-100 text-indigo-600",
  },
]

const trendingPlaceholders: PluginVisual[] = [
  {
    id: "excalidraw",
    name: "Excalidraw",
    author: "zsviczian",
    description: "在笔记中绘制草图和图表",
    downloads: "542K",
    rating: "4.9",
    icon: Palette,
    iconClassName: "bg-violet-100 text-violet-600",
  },
  {
    id: "advanced-tables",
    name: "Advanced Tables",
    author: "Tony Grosinger",
    description: "更强大的表格功能",
    downloads: "215K",
    rating: "4.7",
    icon: Table2,
    iconClassName: "bg-blue-100 text-blue-600",
  },
  {
    id: "better-word-count",
    name: "Better Word Count",
    author: "Oli",
    description: "显示笔记和文档的详细字数统计",
    downloads: "124K",
    rating: "4.6",
    icon: Grid2X2,
    iconClassName: "bg-slate-100 text-slate-700",
  },
  {
    id: "style-settings",
    name: "Style Settings",
    author: "mgmeyers",
    description: "自定义主题和样式",
    downloads: "98K",
    rating: "4.6",
    icon: Settings2,
    iconClassName: "bg-slate-100 text-slate-600",
  },
  {
    id: "file-explorer-note-count",
    name: "File Explorer Note Count",
    author: "Yermolovich",
    description: "在文件浏览器里显示笔记数量",
    downloads: "87K",
    rating: "4.5",
    icon: FileText,
    iconClassName: "bg-slate-100 text-slate-600",
  },
  {
    id: "clipboard-image",
    name: "Clipboard Image",
    author: "johanneshorge",
    description: "将剪贴板图片直接粘贴到笔记中",
    downloads: "76K",
    rating: "4.4",
    icon: Layers3,
    iconClassName: "bg-indigo-100 text-indigo-600",
  },
]

const sidebarItems = [
  { label: "精选", icon: Star, active: true },
  { label: "全部插件", icon: Package, count: 18 },
  { label: "已安装", icon: ShieldCheck, count: 18 },
  { label: "更新", icon: Settings2, count: 3 },
]

const categories = [
  { label: "主题", icon: Palette },
  { label: "用户界面", icon: Layers3 },
  { label: "编辑器", icon: Paintbrush },
  { label: "文件与链接", icon: Link2 },
  { label: "生产力", icon: Sparkles },
  { label: "开发工具", icon: Code2 },
  { label: "搜索", icon: Search },
  { label: "笔记增强", icon: FileText },
  { label: "其他", icon: Tags },
]

function marketplaceEntryToVisual(entry: DesktopPluginMarketplaceEntry): PluginVisual {
  return {
    id: entry.id,
    name: entry.name,
    author: entry.source === "bundled" ? "Thunder" : "marketplace",
    description: entry.description,
    downloads: entry.source === "bundled" ? "52K" : "18K",
    rating: entry.source === "bundled" ? "4.9" : "4.7",
    icon: Box,
    iconClassName: "bg-blue-100 text-blue-600",
    entry,
  }
}

export default function DesktopPluginMarketplacePage() {
  const router = useRouter()
  const [installed, setInstalled] = useState<InstalledDesktopPlugin[]>([])
  const [marketplace, setMarketplace] = useState<DesktopPluginMarketplaceEntry[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const installedIds = useMemo(
    () => new Set(installed.map((plugin) => plugin.manifest.id)),
    [installed]
  )

  const realMarketplaceCards = useMemo(
    () => marketplace.map(marketplaceEntryToVisual),
    [marketplace]
  )

  const recommended = useMemo(
    () => [...realMarketplaceCards, ...recommendedPlaceholders].slice(0, 4),
    [realMarketplaceCards]
  )

  const trending = useMemo(
    () => [...realMarketplaceCards, ...trendingPlaceholders].slice(0, 6),
    [realMarketplaceCards]
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
                {item.count && <span className="text-xs text-muted-foreground">{item.count}</span>}
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
          <div className="grid overflow-hidden rounded-lg border border-border/70 bg-background/82 shadow-xs lg:grid-cols-2">
            {trending.map((plugin, index) => (
              <TrendingRow
                key={plugin.id}
                index={index + 1}
                plugin={plugin}
                installed={installedIds.has(plugin.id)}
                loading={loadingId === plugin.id}
                onInstall={() => void installFromMarketplace(plugin)}
              />
            ))}
            <div className="col-span-full flex h-10 items-center justify-center border-t border-border/70">
              <button className="flex items-center gap-1 text-sm font-medium text-blue-600">
                查看全部热门插件 <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
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
    <article className="rounded-lg border border-border/70 bg-background/86 p-3.5 shadow-xs">
      <div className="flex items-start gap-3">
        <PluginIcon plugin={plugin} />
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{plugin.name}</h3>
          <p className="truncate text-xs text-muted-foreground">{plugin.author}</p>
        </div>
      </div>
      <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-foreground/82">{plugin.description}</p>
      <div className="mt-2.5 flex items-center justify-between text-xs text-muted-foreground">
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
        className="mt-3 h-7 w-full rounded-md text-blue-600 hover:text-blue-600"
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
    <article className="grid min-h-[70px] grid-cols-[28px_40px_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/70 px-3.5 py-2.5 lg:[&:nth-child(n+5)]:border-b-0">
      <span className="text-sm text-muted-foreground">{index}</span>
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

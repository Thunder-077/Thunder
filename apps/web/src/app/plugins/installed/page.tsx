"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Box,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  ExternalLink,
  FileText,
  Grid2X2,
  LayoutList,
  Link2,
  Package,
  Paintbrush,
  Palette,
  Play,
  Plus,
  ScrollText,
  Search,
  Settings,
  Settings2,
  ShieldCheck,
  Star,
  Tags,
  Trash2,
  X,
  Ban,
  ArrowRight,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  describeDesktopPluginPermission,
  getDesktopPluginInstalledAt,
  listDesktopPlugins,
  shouldLoadDesktopPlugins,
  uninstallDesktopPlugin,
  type DesktopInstalledPlugin,
} from "@/lib/desktop-plugins"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

type InstalledPluginVisual = {
  id: string
  name: string
  author: string
  description: string
  version: string
  installedDate: string
  icon: React.ComponentType<{ className?: string }>
  iconClassName: string
  tags: string[]
  permissions: string[]
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
  return (name && lucideIconMap[name]) || ScrollText
}

// Sidebar and Category items
const sidebarItems = [
  { label: "精选", icon: Star },
  { label: "全部插件", icon: Package },
  { label: "已安装", icon: ShieldCheck, active: true },
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

export default function InstalledPluginsPage() {
  const router = useRouter()
  const [realPlugins, setRealPlugins] = useState<DesktopInstalledPlugin[]>([])
  const [disabledPluginIds, setDisabledPluginIds] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [sortOption, setSortOption] = useState<"default" | "name" | "date">("default")
  const [view, setView] = useState<"grid" | "list">("grid")
  const [selectedPluginId, setSelectedPluginId] = useState<string>("")
  const [currentPage, setCurrentPage] = useState(1)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Fetch actual plugins in desktop environment
  useEffect(() => {
    async function load() {
      try {
        if (!shouldLoadDesktopPlugins()) return
        const result = await listDesktopPlugins()
        setRealPlugins(result.plugins)
      } catch (err) {
        console.error("Failed to load actual desktop plugins", err)
      }
    }
    void load()
  }, [])

  // Show a disappearing toast notification
  const triggerToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage(null)
    }, 3000)
  }

  // Handle Mock actions
  const toggleDisablePlugin = (pluginId: string) => {
    const isDisabled = disabledPluginIds.includes(pluginId)
    if (isDisabled) {
      setDisabledPluginIds((prev) => prev.filter((id) => id !== pluginId))
      triggerToast(`插件已启用`)
    } else {
      setDisabledPluginIds((prev) => [...prev, pluginId])
      triggerToast(`插件已禁用`)
    }
  }

  const uninstallPlugin = async (pluginId: string) => {
    const realPlugin = realPlugins.find((plugin) => plugin.manifest.id === pluginId)
    if (!realPlugin) return
    try {
      await uninstallDesktopPlugin(pluginId)
      setRealPlugins((prev) => prev.filter((p) => p.manifest.id !== pluginId))
      triggerToast(`${realPlugin.manifest.name} 插件已成功卸载`)
    } catch (err) {
      triggerToast("卸载失败: " + (err instanceof Error ? err.message : "未知错误"))
    }
    if (selectedPluginId === pluginId) {
      setSelectedPluginId("")
    }
  }

  // Convert real plugins to visual format
  const allPlugins = useMemo(() => {
    return realPlugins.map((p): InstalledPluginVisual => ({
      id: p.manifest.id,
      name: p.manifest.name,
      author: p.manifest.author?.name || "Thunder",
      description: p.manifest.description ?? "",
      version: p.manifest.version,
      installedDate: getDesktopPluginInstalledAt(p)?.split("T")[0] ?? "暂无",
      icon: resolveIcon(p.manifest.icon),
      iconClassName: "bg-gradient-to-br from-emerald-500 to-emerald-700 text-primary-foreground shadow-md",
      tags: [
        p.manifest.kind === "trusted" ? "Trusted Runtime" : "Sandboxed Runtime",
        ...p.manifest.permissions.slice(0, 2).map(describeDesktopPluginPermission),
      ],
      permissions: [...p.manifest.permissions],
    }))
  }, [realPlugins])

  // Filter & Sort
  const filteredAndSortedPlugins = useMemo(() => {
    const result = allPlugins.filter((p) => {
      const q = searchQuery.toLowerCase().trim()
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        p.author.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      )
    })

    result.sort((a, b) => {
      if (sortOption === "name") {
        return a.name.localeCompare(b.name)
      } else if (sortOption === "date") {
        return b.installedDate.localeCompare(a.installedDate)
      }
      return 0
    })

    return result
  }, [allPlugins, searchQuery, sortOption])

  // Pagination calculation
  const itemsPerPage = 9
  const totalPages = Math.ceil(filteredAndSortedPlugins.length / itemsPerPage)
  const safePage = Math.min(currentPage, Math.max(1, totalPages))
  const paginatedPlugins = useMemo(() => {
    const start = (safePage - 1) * itemsPerPage
    return filteredAndSortedPlugins.slice(start, start + itemsPerPage)
  }, [filteredAndSortedPlugins, safePage])

  // Current selected plugin details
  const selectedPlugin = useMemo(() => {
    return allPlugins.find((p) => p.id === selectedPluginId) || null
  }, [allPlugins, selectedPluginId])

  const handleCardClick = (pluginId: string) => {
    setSelectedPluginId(pluginId)
  }

  return (
    <div className="grid h-full min-h-0 gap-0 grid-rows-1 lg:grid-cols-[280px_minmax(0,1fr)] overflow-hidden">
      {/* Dynamic layout width override to prevent large empty margins on the right */}
      <style dangerouslySetInnerHTML={{ __html: `
        /* 隐藏全局头部及页脚，接管页面滚动 */
        main > .sticky.top-0 { display: none !important; }
        .surface-shell > div > .relative.z-10 > .shrink-0.px-4 { display: none !important; }
        main.flex-1.overflow-y-auto { 
          overflow-y: hidden !important; 
          height: 100% !important; 
          display: flex !important; 
          flex-direction: column !important; 
        }
        main > .w-full { 
          padding: 0 !important; 
          flex: 1 1 0% !important;
          min-height: 0 !important;
          display: flex !important;
          flex-direction: column !important;
          height: auto !important;
        }
        main > .w-full > .mx-auto { 
          max-width: none !important; 
          padding: 0 !important; 
          flex: 1 1 0% !important;
          min-height: 0 !important;
          display: flex !important;
          flex-direction: column !important;
          width: 100% !important;
          height: auto !important;
        }
        main > .w-full > .mx-auto > div { 
          padding-bottom: 0 !important; 
          flex: 1 1 0% !important;
          min-height: 0 !important;
          display: flex !important;
          flex-direction: column !important;
          height: auto !important;
        }
        
        /* 针对当前组件内部的自定义滚动条，为了美观 */
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(150,150,150,0.2); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(150,150,150,0.4); }

        @media (min-width: 1280px) {
          main div.mx-auto.w-full.max-w-\\[1280px\\] {
            max-width: 1440px !important;
          }
        }
        @media (min-width: 1536px) {
          main div.mx-auto.w-full.max-w-\\[1280px\\] {
            max-width: 1536px !important;
          }
        }
      ` }} />
      {/* 1. Left Sidebar (Sub-navigation) */}
      <aside className="hidden h-full overflow-y-auto border-r border-border/70 pr-5 lg:block custom-scrollbar">
        <div className="space-y-5 py-8 pl-6 pr-1">
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground/90">插件市场</h2>
          
          {/* Dynamic Search Box */}
          <label className="flex h-9 items-center gap-2 rounded-md border border-border/75 bg-background/85 px-3 text-xs shadow-xs focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="搜索插件、功能或作者..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setCurrentPage(1)
              }}
              className="w-full bg-transparent outline-none text-foreground placeholder:text-muted-foreground/60 text-xs"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("")
                  setCurrentPage(1)
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </label>

          {/* Navigation Menu */}
          <nav className="space-y-1 border-b border-border/70 pb-4">
            {sidebarItems.map((item) => (
              <button
                key={item.label}
                onClick={() => {
                  if (item.label === "精选" || item.label === "全部插件" || item.label === "更新") {
                    router.push("/plugins")
                  }
                }}
                className={cn(
                  "flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-left text-sm transition-colors",
                  item.active
                    ? "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 font-medium"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
                {item.active && (
                  <span className={cn(
                    "text-xs px-1.5 py-0.5 rounded-full",
                    "bg-blue-100/50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400"
                  )}>
                    {allPlugins.length}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Categories List */}
          <div className="space-y-1.5 border-b border-border/70 pb-4">
            <p className="px-2.5 text-xs text-muted-foreground font-semibold uppercase tracking-wider">分类</p>
            {categories.map((item) => (
              <button
                key={item.label}
                onClick={() => router.push("/plugins")}
                className="flex h-8 w-full items-center gap-3 rounded-md px-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          {/* Create Plugin Button */}
          <button
            onClick={() => router.push("/plugins")}
            className="flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
            <span>创建插件</span>
          </button>
        </div>
      </aside>

      {/* 2. Main content area (Center & Right Panel Grid) */}
      <main className="min-w-0 flex-1">
        {/* Toast Toast Notifications */}
        {toastMessage && (
          <div className="fixed bottom-5 right-5 z-[100] flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-xs font-medium shadow-2xl animate-in fade-in slide-in-from-bottom-5 border border-border/10">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Master Details Responsive Layout */}
        <div className={cn(
          "grid h-full gap-0 grid-rows-1 overflow-hidden",
          selectedPlugin
            ? "grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px]"
            : "grid-cols-1"
        )}>
          
          {/* Main Area: Grid of cards */}
          <div className="h-full overflow-y-auto space-y-6 py-8 px-6 xl:px-8 custom-scrollbar">
            
            {/* Header controls inside page */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between border-b border-border/50 pb-5">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2.5">
                  <h1 className="text-[24px] font-semibold tracking-tight text-foreground/90">已安装</h1>
                  <span className="bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-[11px] font-semibold px-2 py-0.5 rounded-md min-w-[20px] h-5 flex items-center justify-center">
                    {allPlugins.length}
                  </span>
                </div>
                <p className="text-[13px] text-muted-foreground/80">
                  管理你已安装的插件，可进行设置、禁用或卸载操作。
                </p>
              </div>

              {/* Controls layout */}
              <div className="flex items-center gap-2 self-start sm:self-auto">
                {/* Sort Option Select */}
                <div className="relative">
                  <select
                    value={sortOption}
                    onChange={(e) => {
                      setSortOption(e.target.value as "default" | "name" | "date")
                      setCurrentPage(1)
                    }}
                    className="appearance-none bg-background hover:bg-muted/50 border border-border rounded-lg pl-3 pr-8 py-1.5 text-xs font-medium text-foreground outline-none cursor-pointer h-8"
                  >
                    <option value="default">默认排序</option>
                    <option value="name">按名称排序</option>
                    <option value="date">按安装日期排序</option>
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                </div>

                {/* View toggler Grid / List */}
                <div className="flex items-center bg-muted/30 border border-border rounded-lg p-0.5 h-8">
                  <button
                    onClick={() => setView("grid")}
                    className={cn(
                      "p-1 rounded-md transition-all",
                      view === "grid"
                        ? "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    title="网格视图"
                  >
                    <Grid2X2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setView("list")}
                    className={cn(
                      "p-1 rounded-md transition-all",
                      view === "list"
                        ? "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    title="列表视图"
                  >
                    <LayoutList className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Mobile query indicator */}
            <div className="lg:hidden">
              <label className="flex h-9 items-center gap-2 rounded-md border border-border/75 bg-background/85 px-3 text-xs shadow-xs focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="搜索插件..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="w-full bg-transparent outline-none text-foreground placeholder:text-muted-foreground/60 text-xs"
                />
              </label>
            </div>

            {/* Empty view state */}
            {filteredAndSortedPlugins.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-xl">
                <Package className="h-10 w-10 text-muted-foreground/60 mb-3" />
                <h3 className="text-sm font-semibold text-foreground">没有找到已安装的插件</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">
                  没有匹配的插件。请尝试更改搜索关键字或在插件市场中发现更多插件。
                </p>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setSearchQuery("")}>
                  清除搜索关键字
                </Button>
              </div>
            ) : (
              /* Plugins Layout dynamic (Grid/List) */
              <div className={cn(
                "transition-all duration-300",
                view === "grid"
                  ? "grid gap-6 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]"
                  : "flex flex-col gap-2"
              )}>
                {paginatedPlugins.map((plugin) => {
                  const isSelected = selectedPluginId === plugin.id
                  const isDisabled = disabledPluginIds.includes(plugin.id)

                  if (view === "list") {
                    return (
                      <div
                        key={plugin.id}
                        onClick={() => handleCardClick(plugin.id)}
                        className={cn(
                          "group flex items-center justify-between p-3.5 border rounded-xl cursor-pointer transition-all bg-card/60 hover:bg-card hover:shadow-xs",
                          isSelected
                            ? "border-blue-600 dark:border-blue-500 ring-1 ring-blue-500/20 bg-blue-50/5"
                            : "border-border/60"
                        )}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          {/* Plugin Icon box */}
                          <div className={cn("h-11 w-11 rounded-xl flex shrink-0 items-center justify-center shadow-xs", plugin.iconClassName)}>
                            <plugin.icon className="h-5.5 w-5.5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <h3 className="text-sm font-semibold text-foreground truncate">{plugin.name}</h3>
                              {isDisabled && (
                                <span className="bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 text-[10px] px-1.5 py-0.5 rounded font-medium">
                                  已禁用
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground/80 truncate">
                              {plugin.author} · {plugin.version}
                            </p>
                          </div>
                        </div>

                        {/* List view metadata & operations */}
                        <div className="flex items-center gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <span className="hidden sm:inline text-[11px] text-muted-foreground">
                            {plugin.version}
                          </span>
                          <span className="hidden sm:inline text-[11px] text-muted-foreground">
                            {plugin.installedDate}
                          </span>

                          <div className="flex items-center gap-1.5">
                            <span className="text-xs px-2.5 py-1 text-muted-foreground bg-gray-50 dark:bg-gray-900 border border-border rounded-md font-medium">
                              {isDisabled ? "已禁用" : "已安装"}
                            </span>

                            {/* Dropdown Operations */}
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={
                                  <button className="h-8 w-8 flex items-center justify-center border border-border bg-background rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground">
                                    <span className="font-bold text-xs pb-1.5">...</span>
                                  </button>
                                }
                              />
                              <DropdownMenuContent align="end" className="w-36">
                                <DropdownMenuItem onClick={() => triggerToast("正在打开插件...")}>
                                  <Play className="h-3.5 w-3.5 mr-2" />
                                  <span>打开</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => triggerToast("正在打开插件设置...")}>
                                  <Settings className="h-3.5 w-3.5 mr-2" />
                                  <span>设置</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => toggleDisablePlugin(plugin.id)}>
                                  <Ban className="h-3.5 w-3.5 mr-2" />
                                  <span>{isDisabled ? "启用" : "禁用"}</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem variant="destructive" onClick={() => void uninstallPlugin(plugin.id)}>
                                  <Trash2 className="h-3.5 w-3.5 mr-2 text-destructive" />
                                  <span>卸载插件</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    )
                  }

                  // Default Grid Card layout
                  return (
                    <article
                      key={plugin.id}
                      onClick={() => handleCardClick(plugin.id)}
                      className={cn(
                        "group min-h-[200px] rounded-xl border bg-card p-4 transition-all hover:shadow-sm cursor-pointer flex flex-col justify-between",
                        isSelected
                          ? "border-blue-500 ring-1 ring-blue-500/20"
                          : "border-border/60 hover:border-border/80"
                      )}
                    >
                      <div>
                        {/* Top: Icon, title & author */}
                        <div className="flex items-start gap-3">
                          <div className={cn("h-11 w-11 flex shrink-0 items-center justify-center rounded-[10px] shadow-sm", plugin.iconClassName)}>
                            <plugin.icon className="h-5.5 w-5.5 text-primary-foreground/95" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <h3 className="line-clamp-1 text-[15px] font-semibold text-foreground/90">{plugin.name}</h3>
                              {isDisabled && (
                                <span className="bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0">
                                  已禁用
                                </span>
                              )}
                            </div>
                            <p className="truncate text-[11px] text-muted-foreground">{plugin.author}</p>
                          </div>
                        </div>

                        {/* Middle description */}
                        <p className="mt-3 text-xs text-muted-foreground/90 line-clamp-2 leading-relaxed min-h-[32px]">
                          {plugin.description}
                        </p>

                        {/* Stats Info */}
                        <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground/80">
                          <span>{plugin.version}</span>
                          <span>{plugin.installedDate}</span>
                        </div>
                      </div>

                      {/* Bottom action row buttons */}
                      <div className="mt-5 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleCardClick(plugin.id)}
                          className={cn(
                            "h-8 text-[13px] font-medium rounded-lg flex-1 flex items-center justify-center border transition-colors",
                            isDisabled
                              ? "bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-100/50 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30"
                              : "bg-gray-50 text-muted-foreground hover:text-foreground dark:bg-gray-900 dark:hover:bg-gray-800 border-border/60"
                          )}
                        >
                          {isDisabled ? "已禁用" : "已安装"}
                        </button>

                        {/* Options button */}
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <button className="h-8 w-8 flex items-center justify-center border border-border bg-background rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-all">
                                <span className="font-bold text-xs pb-1.5">...</span>
                              </button>
                            }
                          />
                          <DropdownMenuContent align="end" className="w-36">
                            <DropdownMenuItem onClick={() => triggerToast("正在打开插件...")}>
                              <Play className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                              <span>打开</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => triggerToast("正在打开插件设置...")}>
                              <Settings className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                              <span>设置</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleDisablePlugin(plugin.id)}>
                              <Ban className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                              <span>{isDisabled ? "启用" : "禁用"}</span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onClick={() => void uninstallPlugin(plugin.id)}>
                              <Trash2 className="h-3.5 w-3.5 mr-2 text-destructive" />
                              <span>卸载插件</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1.5 mt-6 border-t border-border/30 pt-4 animate-in fade-in duration-200">
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
                  disabled={safePage === 1}
                  className="rounded-lg h-8 w-8"
                  title="上一页"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <Button
                    key={page}
                    variant={safePage === page ? "primary" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(page)}
                    className={cn(
                      "h-8 w-8 p-0 rounded-lg text-xs font-semibold transition-all",
                      safePage === page
                        ? "bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-900/40 shadow-xs"
                        : "hover:bg-muted/50"
                    )}
                  >
                    {page}
                  </Button>
                ))}

                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))}
                  disabled={safePage === totalPages}
                  className="rounded-lg h-8 w-8"
                  title="下一页"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Bottom link back to marketplace */}
            <div
              onClick={() => router.push("/plugins")}
              className="pt-8 flex justify-center text-[13px] font-semibold text-blue-600 hover:text-blue-500 cursor-pointer items-center gap-1.5 transition-all hover:gap-2 group"
            >
              <span>找不到想要的插件？ 浏览全部插件市场</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>

          {/* 3. Detail Panel (Desktop Inline View) */}
          {selectedPlugin && (
            <aside className="hidden xl:block h-full overflow-y-auto border-l border-border/70 custom-scrollbar bg-card/10">
              <div className="py-8 px-8 flex flex-col relative animate-in fade-in slide-in-from-right-4 duration-300">
                
                {/* Close Button */}
                <button 
                  onClick={() => setSelectedPluginId("")} 
                  className="absolute right-5 top-5 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>

                {/* Big Icon, Title, Author */}
                <div className="flex flex-col items-start pr-8">
                  <div className={cn("h-12 w-12 flex items-center justify-center rounded-[12px] shadow-sm", selectedPlugin.iconClassName)}>
                    <selectedPlugin.icon className="h-6 w-6 text-primary-foreground/95" />
                  </div>
                  <h2 className="text-[18px] font-semibold text-foreground mt-4 leading-tight">{selectedPlugin.name}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{selectedPlugin.author}</p>
                  
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      triggerToast("正在导航至插件主页...")
                    }}
                    className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 mt-2.5 font-medium transition-all"
                  >
                    <span>访问插件主页</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                {/* keyword tag badges */}
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {selectedPlugin.tags.map((tag) => (
                    <span
                      key={tag}
                      className="bg-gray-100 dark:bg-gray-800/80 text-gray-600 dark:text-gray-400 text-[11px] px-2 py-0.5 rounded-md font-medium"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Control Action Buttons */}
                <div className="mt-5 flex gap-2 w-full">
                  <button className="h-8 text-xs font-semibold rounded-lg bg-gray-100 text-muted-foreground border border-transparent dark:bg-gray-800 dark:text-gray-400 flex-1 flex items-center justify-center cursor-not-allowed">
                    已安装
                  </button>
                  <button
                    onClick={() => toggleDisablePlugin(selectedPlugin.id)}
                    className="h-8 text-xs font-semibold rounded-lg border border-border bg-background hover:bg-muted/50 text-foreground flex-1 flex items-center justify-center transition-colors"
                  >
                    {disabledPluginIds.includes(selectedPlugin.id) ? "启用" : "禁用"}
                  </button>
                  <button
                    onClick={() => void uninstallPlugin(selectedPlugin.id)}
                    className="h-8 text-xs font-semibold rounded-lg border border-red-200 dark:border-red-950/40 text-red-600 dark:text-red-400 bg-transparent hover:bg-red-50 dark:hover:bg-red-950/30 flex-1 flex items-center justify-center transition-colors"
                  >
                    卸载插件
                  </button>
                </div>

                {/* Detailed key-value specifications table */}
                <div className="mt-6 border-t border-border/50 pt-5 space-y-3.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground/80">版本</span>
                    <span className="font-semibold text-foreground">{selectedPlugin.version}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground/80">已安装</span>
                    <span className="font-semibold text-foreground">{selectedPlugin.installedDate}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground/80">下载量</span>
                    <span className="font-semibold text-foreground">暂无</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground/80">评分</span>
                    <span className="font-semibold text-foreground">暂无</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground/80">作者</span>
                    <span className="font-semibold text-foreground">{selectedPlugin.author}</span>
                  </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground/80">插件 ID</span>
                  <span className="font-mono text-[11px] text-foreground bg-gray-50 dark:bg-gray-900/60 px-1 rounded-sm border border-border/40">{selectedPlugin.id}</span>
                </div>
              </div>

              {selectedPlugin.permissions && selectedPlugin.permissions.length > 0 && (
                <div className="mt-5 border-t border-border/50 pt-5">
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wide">权限</h3>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {selectedPlugin.permissions.map((permission) => (
                      <span
                        key={permission}
                        className="rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] text-muted-foreground"
                      >
                        {describeDesktopPluginPermission(permission)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Description */}
              <div className="mt-5 border-t border-border/50 pt-5">
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wide">插件描述</h3>
                  <p className="mt-2 text-xs text-muted-foreground/90 leading-relaxed">
                    {selectedPlugin.description}
                  </p>
                </div>

                {/* Bottom documentation hyperlink */}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    triggerToast("正在载入文档...")
                  }}
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-semibold mt-5 self-start transition-all"
                >
                  <span>查看完整文档</span>
                  <ExternalLink className="h-3 w-3" />
                </a>

              </div>
            </aside>
          )}
        </div>
      </main>
    </div>
  )
}

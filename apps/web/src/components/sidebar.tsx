"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  House,
  LayoutGrid,
  Settings,
  CheckSquare,
  Lock,
  Brain,
  Timer,
  Command,
  ChevronDown,
  ChevronRight,
  Sun,
  Moon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useModuleRegistry } from "@/hooks/use-module-registry"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { useTheme } from "@/components/theme-provider"
import { useCommandPalette } from "@/components/command-palette"
import type { ModuleCategory } from "@thunder/core"

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  CheckSquare,
  Lock,
  Brain,
  Timer,
}

const categoryLabels: Record<ModuleCategory, string> = {
  productivity: "效率",
  security: "安全",
  ai: "AI",
  notes: "笔记",
  tools: "工具",
  dashboard: "看板",
  other: "其他",
}

const categoryOrder: ModuleCategory[] = [
  "productivity",
  "security",
  "ai",
  "tools",
  "other",
  "notes",
  "dashboard",
]

const categoryDotClassMap: Record<ModuleCategory, string> = {
  productivity: "bg-violet-400",
  security: "bg-emerald-400",
  ai: "bg-sky-400",
  tools: "bg-amber-400",
  other: "bg-pink-400",
  notes: "bg-slate-400",
  dashboard: "bg-indigo-400",
}

interface SidebarProps {
  className?: string
  onNavigate?: () => void
}

function SidebarNavItem({
  href,
  icon: Icon,
  label,
  active,
  onNavigate,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  active: boolean
  onNavigate?: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "flex h-12 items-center gap-2.5 rounded-[10px] px-3 text-sm transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      <span className={cn(
        "flex-1 truncate text-[14px]",
        active ? "font-medium" : "font-normal"
      )}>
        {label}
      </span>
    </Link>
  )
}

export function AppSidebar({
  className,
  onNavigate,
}: SidebarProps) {
  const pathname = usePathname()
  const registry = useModuleRegistry()
  const modules = registry.getEnabled()
  const { resolvedTheme, setTheme } = useTheme()
  const { setOpen: setCommandPaletteOpen } = useCommandPalette()
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    productivity: true,
    security: true,
    ai: true,
    tools: true,
    other: true,
    notes: true,
    dashboard: true,
  })

  const navItems = [
    { label: "首页", href: "/", icon: House },
    { label: "模块中心", href: "/modules", icon: LayoutGrid },
  ]

  const groupedModules = useMemo(() => {
    const grouped = new Map<ModuleCategory, typeof modules>()
    for (const mod of modules) {
      const list = grouped.get(mod.category) ?? []
      list.push(mod)
      grouped.set(mod.category, list)
    }
    return categoryOrder.filter((cat) => (grouped.get(cat)?.length ?? 0) > 0).map((cat) => ({
      category: cat,
      modules: grouped.get(cat) ?? [],
    }))
  }, [modules])

  const toggleGroup = (category: ModuleCategory) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [category]: !prev[category],
    }))
  }

  const isDark = resolvedTheme === "dark"

  return (
    <aside
      className={cn(
        "flex h-full w-[240px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        className
      )}
    >
      {/* Top Logo Area */}
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
          T
        </div>
        <span className="flex-1 text-[15px] font-semibold">Thunder</span>
      </div>

      {/* Navigation Content - Scrollable */}
      <ScrollArea className="flex-1 px-2 py-3">
        <nav className="flex flex-col gap-0">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <SidebarNavItem
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                active={isActive}
                onNavigate={onNavigate}
              />
            )
          })}
        </nav>

        {groupedModules.length > 0 && (
          <>
            <Separator className="my-3" />
            <div className="space-y-2">
              {groupedModules.map(({ category, modules: categoryModules }) => {
                const expanded = expandedGroups[category] ?? true
                return (
                  <div key={category}>
                    <button
                      type="button"
                      className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted/40"
                      onClick={() => toggleGroup(category)}
                    >
                      <div className={cn("h-1.5 w-1.5 shrink-0 rounded-full", categoryDotClassMap[category])} />
                      <span className="flex-1 text-left text-[12px] font-semibold tracking-wider text-muted-foreground/80">
                        {categoryLabels[category]}
                      </span>
                      {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                    {expanded && (
                      <nav className="flex flex-col gap-[2px]">
                        {categoryModules.map((mod) => {
                          const Icon = iconMap[mod.icon] ?? LayoutGrid
                          const isActive = pathname === mod.route || pathname.startsWith(mod.route + "/")
                          return (
                            <SidebarNavItem
                              key={mod.id}
                              href={mod.route}
                              icon={Icon}
                              label={mod.name}
                              active={isActive}
                              onNavigate={onNavigate}
                            />
                          )
                        })}
                      </nav>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </ScrollArea>

      {/* Bottom Toolbar - Fixed */}
      <div className="h-16 border-t border-sidebar-border p-2">
        <div className="flex h-full items-center justify-between gap-1">
          {/* Command Palette Button */}
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            className="flex h-12 flex-1 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            aria-label="全局命令"
          >
            <Command className="h-[18px] w-[18px]" />
          </button>

          {/* Theme Toggle Button */}
          <button
            type="button"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="flex h-12 flex-1 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            aria-label="切换主题"
          >
            {isDark ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
          </button>

          {/* Settings Button */}
          <Link
            href="/settings"
            onClick={onNavigate}
            className={cn(
              "flex h-12 flex-1 items-center justify-center rounded-[10px] transition-colors",
              pathname === "/settings"
                ? "bg-sidebar-accent text-sidebar-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
            )}
            aria-label="设置"
          >
            <Settings className="h-[18px] w-[18px]" />
          </Link>
        </div>
      </div>
    </aside>
  )
}

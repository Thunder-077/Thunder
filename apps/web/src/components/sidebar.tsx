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
  productivity: "bg-info/75",
  security: "bg-success/75",
  ai: "bg-brand/70",
  tools: "bg-warning/75",
  other: "bg-muted-foreground/45",
  notes: "bg-foreground/28",
  dashboard: "bg-primary/55",
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
        "group/sidebar-item flex h-10 items-center gap-2.5 rounded-lg border border-transparent px-3 text-sm transition-all duration-normal ease-default",
        active
          ? "border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground shadow-xs"
          : "text-sidebar-foreground/72 hover:border-sidebar-border/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
      )}
    >
      <Icon
        className={cn(
          "h-[18px] w-[18px] shrink-0 transition-colors duration-fast ease-default",
          active ? "text-sidebar-accent-foreground" : "text-sidebar-foreground/62 group-hover/sidebar-item:text-sidebar-foreground/82"
        )}
      />
      <span className={cn("flex-1 truncate", active ? "font-medium" : "font-normal")}>{label}</span>
    </Link>
  )
}

export function AppSidebar({ className, onNavigate }: SidebarProps) {
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
        "app-sidebar surface-panel flex h-full w-[var(--sidebar-width)] flex-col overflow-hidden text-sidebar-foreground",
        className
      )}
    >
      <div className="border-b border-sidebar-border/80 px-3 py-3">
        <div className="flex items-center gap-3 bg-sidebar px-3 py-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-sm font-semibold text-primary-foreground shadow-xs">
            T
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold tracking-tight">Thunder</div>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 px-2.5 py-3">
        <div className="space-y-3">
          <nav className="flex flex-col gap-1">
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
              <Separator className="bg-sidebar-border/80" />
              <div className="space-y-2">
                {groupedModules.map(({ category, modules: categoryModules }) => {
                  const expanded = expandedGroups[category] ?? true
                  return (
                    <section key={category} className="space-y-1">
                      <button
                        type="button"
                        className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-xs text-sidebar-foreground/58 transition-colors duration-fast ease-default hover:bg-sidebar-accent/55 hover:text-sidebar-foreground/80"
                        onClick={() => toggleGroup(category)}
                      >
                        <div className={cn("h-1.5 w-1.5 shrink-0 rounded-full", categoryDotClassMap[category])} />
                        <span className="flex-1 text-left text-[11px] font-semibold uppercase tracking-[0.18em]">
                          {categoryLabels[category]}
                        </span>
                        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </button>
                      {expanded && (
                        <nav className="flex flex-col gap-1">
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
                    </section>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </ScrollArea>

      <div className="border-t border-sidebar-border/80 p-2.5">
        <div className="grid grid-cols-3 gap-1.5 bg-sidebar/70">
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            className="flex h-11 items-center justify-center rounded-lg text-sidebar-foreground/64 transition-all duration-fast ease-default hover:bg-sidebar hover:text-sidebar-foreground"
            aria-label="全局命令"
          >
            <div className="flex items-center gap-1.5">
              <Command className="h-[18px] w-[18px]" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="flex h-11 items-center justify-center rounded-lg text-sidebar-foreground/64 transition-all duration-fast ease-default hover:bg-sidebar hover:text-sidebar-foreground"
            aria-label="切换主题"
          >
            {isDark ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
          </button>

          <Link
            href="/settings"
            onClick={onNavigate}
            className={cn(
              "flex h-11 items-center justify-center rounded-lg transition-all duration-fast ease-default",
              pathname === "/settings"
                ? "bg-sidebar text-sidebar-foreground shadow-xs"
                : "text-sidebar-foreground/64 hover:bg-sidebar hover:text-sidebar-foreground"
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

"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Puzzle,
  Settings,
  CheckSquare,
  Shield,
  Brain,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useModuleRegistry } from "@/hooks/use-module-registry"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { ThemeToggle } from "@/components/theme-toggle"
import { CommandButton } from "@/components/command-button"

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  CheckSquare,
  Shield,
  Brain,
}

interface SidebarProps {
  className?: string
}

export function AppSidebar({ className }: SidebarProps) {
  const pathname = usePathname()
  const registry = useModuleRegistry()
  const modules = registry.getEnabled()

  const navItems = [
    { label: "首页", href: "/", icon: LayoutDashboard },
    { label: "模块中心", href: "/modules", icon: Puzzle },
  ]

  return (
    <aside
      className={cn(
        "flex h-full w-56 flex-col border-r border-border bg-sidebar",
        className
      )}
    >
      <div className="flex h-12 items-center gap-2 px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-semibold">
          T
        </div>
        <span className="text-sm font-medium">Thunder</span>
      </div>

      <Separator />

      <ScrollArea className="flex-1 px-2 py-2">
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {modules.length > 0 && (
          <>
            <Separator className="my-2" />
            <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
              模块
            </p>
            <nav className="flex flex-col gap-1">
              {modules.map((mod) => {
                const Icon = iconMap[mod.icon]
                const isActive = pathname === mod.route
                return (
                  <Link
                    key={mod.id}
                    href={mod.route}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    {Icon ? <Icon className="h-4 w-4" /> : <Puzzle className="h-4 w-4" />}
                    {mod.name}
                  </Link>
                )
              })}
            </nav>
          </>
        )}
      </ScrollArea>

      <Separator />

      <div className="flex items-center gap-1 px-2 py-2">
        <CommandButton />
        <ThemeToggle />
        <Link
          href="/settings"
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
            pathname === "/settings"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
          aria-label="设置"
        >
          <Settings className="h-4 w-4" />
        </Link>
      </div>
    </aside>
  )
}

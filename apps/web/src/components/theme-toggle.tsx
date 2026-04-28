"use client"

import { Moon, Sun, Monitor } from "lucide-react"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function ThemeToggle() {
  const { setTheme, resolvedTheme, brandTheme, setBrandTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="h-8 w-8">
            {resolvedTheme === "dark" ? (
              <Moon className="h-4 w-4" />
            ) : (
              <Sun className="h-4 w-4" />
            )}
            <span className="sr-only">切换主题</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="mr-2 h-4 w-4" />
          浅色
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="mr-2 h-4 w-4" />
          深色
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Monitor className="mr-2 h-4 w-4" />
          跟随系统
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <div className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          品牌色
        </div>

        <DropdownMenuItem onClick={() => setBrandTheme("violet")} className={cn(brandTheme === "violet" && "bg-accent")}>
          <span className="mr-2 flex h-3.5 w-3.5 items-center justify-center rounded-full" style={{ background: "oklch(0.55 0.2 285)" }} />
          紫罗兰
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => setBrandTheme("blue")} className={cn(brandTheme === "blue" && "bg-accent")}>
          <span className="mr-2 flex h-3.5 w-3.5 items-center justify-center rounded-full" style={{ background: "oklch(0.53 0.19 250)" }} />
          海蓝
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

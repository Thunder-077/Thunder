import { Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { WeatherWidget } from "@/components/weather-widget"

interface TopbarProps {
  onToggleSidebar?: () => void
}

export function Topbar({ onToggleSidebar }: TopbarProps) {
  return (
    <header className="app-topbar sticky top-0 z-[var(--z-sticky)] flex h-[var(--topbar-height)] items-center gap-2 border-b px-4 sm:px-6">
      {onToggleSidebar && (
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onToggleSidebar}
          aria-label="打开导航"
        >
          <Menu className="h-4 w-4" />
        </Button>
      )}

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="hidden h-2 w-2 rounded-full bg-brand/80 md:block" />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium tracking-tight">Thunder Workspace</div>
        </div>
      </div>

      <WeatherWidget />
    </header>
  )
}

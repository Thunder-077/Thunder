import { Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { WeatherWidget } from "@/components/weather-widget"

interface TopbarProps {
  onToggleSidebar?: () => void
}

export function Topbar({ onToggleSidebar }: TopbarProps) {
  return (
    <header className="app-topbar sticky top-0 z-[var(--z-sticky)] flex h-[var(--topbar-height)] items-center gap-3 bg-background/80 px-4 backdrop-blur-sm sm:px-6">
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

      <div className="flex min-w-0 flex-1 items-center justify-end gap-4">
        <WeatherWidget />
      </div>
    </header>
  )
}

import { Menu } from "lucide-react"
import { Button } from "@/components/ui/button"

interface TopbarProps {
  onToggleSidebar?: () => void
}

export function Topbar({ onToggleSidebar }: TopbarProps) {
  return (
    <header className="flex h-12 items-center gap-2 border-b border-border bg-background px-4">
      {onToggleSidebar && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 md:hidden"
          onClick={onToggleSidebar}
          aria-label="切换侧边栏"
        >
          <Menu className="h-4 w-4" />
        </Button>
      )}
      <div className="flex-1" />
      <span className="text-xs text-muted-foreground">Thunder</span>
    </header>
  )
}

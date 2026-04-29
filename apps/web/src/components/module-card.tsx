import { Card, CardContent } from "@/components/ui/card"
import type { ModuleManifest } from "@thunder/core"
import {
  CheckSquare,
  Lock,
  Brain,
  Puzzle,
} from "lucide-react"

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  CheckSquare,
  Lock,
  Brain,
}

interface ModuleCardProps {
  module: ModuleManifest
}

export function ModuleCard({ module: mod }: ModuleCardProps) {
  const Icon = iconMap[mod.icon] || Puzzle

  return (
    <Card className="group cursor-pointer">
      <CardContent className="flex items-start gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-subtle text-brand shadow-xs transition-transform duration-normal ease-default group-hover:scale-[1.03]">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium tracking-tight">{mod.name}</h3>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {mod.category}
            </span>
          </div>
          <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
            {mod.description}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

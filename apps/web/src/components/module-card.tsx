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
    <Card className="group cursor-pointer transition-shadow hover:shadow-md">
      <CardContent className="flex items-start gap-3 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{mod.name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
            {mod.description}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

import { Card, CardContent } from "@/components/ui/card"
import type { ModuleManifest } from "@thunder/core"
import type { ModuleCategory } from "@thunder/core"
import {
  Lock,
  Film,
  Puzzle,
} from "lucide-react"

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Lock,
  Film,
}

const moduleColorMap: Record<string, { bg: string; icon: string }> = {
  vault: { bg: "bg-purple-50 dark:bg-purple-950/30", icon: "text-purple-500" },
  emby: { bg: "bg-orange-50 dark:bg-orange-950/30", icon: "text-orange-500" },
}

const categoryLabelMap: Record<ModuleCategory, { label: string; color: string }> = {
  productivity: { label: "PRODUCTIVITY", color: "text-blue-500 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/30" },
  security: { label: "SECURITY", color: "text-purple-500 bg-purple-50 dark:text-purple-400 dark:bg-purple-950/30" },
  ai: { label: "AI", color: "text-green-500 bg-green-50 dark:text-green-400 dark:bg-green-950/30" },
  notes: { label: "NOTES", color: "text-yellow-500 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-950/30" },
  tools: { label: "TOOLS", color: "text-orange-500 bg-orange-50 dark:text-orange-400 dark:bg-orange-950/30" },
  dashboard: { label: "DASHBOARD", color: "text-gray-500 bg-gray-50 dark:text-gray-400 dark:bg-gray-950/30" },
  other: { label: "OTHER", color: "text-gray-500 bg-gray-50 dark:text-gray-400 dark:bg-gray-950/30" },
}

interface ModuleCardProps {
  module: ModuleManifest
}

export function ModuleCard({ module: mod }: ModuleCardProps) {
  const Icon = iconMap[mod.icon] || Puzzle
  const colors = moduleColorMap[mod.id] || { bg: "bg-muted", icon: "text-muted-foreground" }
  const categoryStyle = categoryLabelMap[mod.category] || categoryLabelMap.other

  return (
    <Card className="group cursor-pointer transition-shadow duration-normal hover:shadow-md">
      <CardContent className="relative p-5">
        <div className="flex items-start gap-4">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${colors.bg} ${colors.icon} transition-transform duration-normal ease-default group-hover:scale-[1.03]`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="mb-1 text-sm font-medium tracking-tight">{mod.name}</h3>
            <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
              {mod.description}
            </p>
          </div>
        </div>
        <span className={`absolute bottom-3 right-4 shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${categoryStyle.color}`}>
          {categoryStyle.label}
        </span>
      </CardContent>
    </Card>
  )
}

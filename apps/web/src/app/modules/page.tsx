"use client"

import Link from "next/link"
import { PageHeader } from "@/components/page-header"
import { ModuleCard } from "@/components/module-card"
import { useModuleRegistry } from "@/hooks/use-module-registry"
import { useDesktopPlugins } from "@/hooks/use-desktop-plugins"
import { Badge } from "@/components/ui/badge"
import type { ModuleManifest } from "@thunder/core"

const categoryLabels: Record<string, string> = {
  productivity: "效率",
  security: "安全",
  ai: "AI",
  notes: "笔记",
  tools: "工具",
  dashboard: "看板",
  other: "其他",
}

export default function ModulesPage() {
  const registry = useModuleRegistry()
  const desktopPlugins = useDesktopPlugins()
  const modules: ModuleManifest[] = [
    ...registry.getEnabled(),
    ...desktopPlugins.plugins.map((plugin) => ({
      id: `plugin:${plugin.manifest.id}`,
      name: plugin.manifest.name,
      description: plugin.manifest.description,
      icon: plugin.manifest.icon,
      route: plugin.route,
      category: plugin.manifest.category,
      order: plugin.manifest.order ?? 1000,
      enabled: true,
      platforms: ["desktop" as const],
    })),
  ]
  const categories = [...new Set(modules.map((m) => m.category))]

  return (
    <div>
      <PageHeader
        title="模块中心"
      />

      {categories.map((cat) => {
        const catModules = modules.filter((m) => m.category === cat)
        return (
          <section key={cat} className="mb-6">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-medium">{categoryLabels[cat] || cat}</h2>
              <Badge variant="secondary" className="text-xs">
                {catModules.length}
              </Badge>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {catModules.map((mod) => (
                <Link key={mod.id} href={mod.route}>
                  <ModuleCard module={mod} />
                </Link>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

import type { ModuleManifest } from "@thunder/core"
import type { InstalledDesktopPlugin } from "@/lib/desktop-plugins"

export function desktopPluginToModuleManifest(plugin: InstalledDesktopPlugin): ModuleManifest {
  return {
    id: `plugin:${plugin.manifest.id}`,
    name: plugin.manifest.name,
    description: plugin.manifest.description,
    icon: plugin.manifest.icon,
    route: plugin.route,
    category: plugin.manifest.category,
    order: plugin.manifest.order ?? 1000,
    enabled: true,
    platforms: ["desktop" as const],
  }
}

export function buildQuickAccessModules(
  modules: ModuleManifest[],
  desktopPlugins: InstalledDesktopPlugin[]
): ModuleManifest[] {
  return [...modules, ...desktopPlugins.map(desktopPluginToModuleManifest)].sort(
    (left, right) => (left.order ?? 1000) - (right.order ?? 1000)
  )
}

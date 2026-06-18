import type { ModuleManifest } from "@thunder/core"
import {
  type DesktopInstalledPlugin,
} from "@/lib/desktop-plugins"

export function desktopPluginToModuleManifest(plugin: DesktopInstalledPlugin): ModuleManifest {
  return {
    id: `plugin:${plugin.manifest.id}`,
    name: plugin.manifest.name,
    description: plugin.manifest.description ?? "",
    icon: plugin.manifest.icon ?? "Package",
    route: plugin.route,
    category: "tools",
    order: 1000,
    enabled: true,
    platforms: ["desktop" as const],
  }
}

export function buildQuickAccessModules(
  modules: ModuleManifest[],
  desktopPlugins: DesktopInstalledPlugin[]
): ModuleManifest[] {
  return [...modules, ...desktopPlugins.map(desktopPluginToModuleManifest)].sort(
    (left, right) => (left.order ?? 1000) - (right.order ?? 1000)
  )
}

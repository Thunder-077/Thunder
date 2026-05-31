import type { ModuleManifest } from "@thunder/core"
import { enabledModules } from "@/generated/enabled-modules"
import { shouldLoadDesktopPlugins } from "@/lib/desktop-plugins"

export const mockModules = enabledModules

export function isModuleAvailableOnPlatform(module: ModuleManifest, platform: "web" | "desktop"): boolean {
  const platforms = module.platforms
  if (!platforms || platforms.length === 0) {
    return true
  }

  return platforms.includes(platform)
}

export function isModuleAvailableOnCurrentPlatform(module: ModuleManifest): boolean {
  return isModuleAvailableOnPlatform(module, shouldLoadDesktopPlugins() ? "desktop" : "web")
}

export function getCurrentPlatformModules(): ModuleManifest[] {
  return enabledModules.filter(isModuleAvailableOnCurrentPlatform)
}

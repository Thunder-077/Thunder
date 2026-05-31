"use client"

import { useMemo } from "react"
import { ModuleRegistry } from "@thunder/core"
import { getCurrentPlatformModules } from "@/lib/modules"

let registryInstance: ModuleRegistry | null = null

function getRegistry(): ModuleRegistry {
  if (!registryInstance) {
    registryInstance = new ModuleRegistry()
    getCurrentPlatformModules().forEach((m) => registryInstance!.register(m))
  }
  return registryInstance
}

export function useModuleRegistry(): ModuleRegistry {
  return useMemo(() => getRegistry(), [])
}

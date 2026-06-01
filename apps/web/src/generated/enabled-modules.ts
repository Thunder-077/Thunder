import type { ModuleManifest } from "@thunder/core"

export const enabledModules = [
  {
    "id": "vault",
    "name": "密码保险箱",
    "description": "加密密码管理模块",
    "icon": "Lock",
    "route": "/modules/vault",
    "category": "security",
    "order": 1,
    "enabled": true
  }
] as ModuleManifest[]

export const enabledModuleIds = enabledModules.map((module) => module.id)

export const publicServerPrefixes = [] as string[]

export const moduleLoaders = {
  "vault": () => import("@/modules/vault/page"),
} as const

export type EnabledModuleId = keyof typeof moduleLoaders

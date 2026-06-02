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
  },
  {
    "id": "emby",
    "name": "Emby",
    "description": "Emby 影视模块",
    "icon": "Film",
    "route": "/modules/emby",
    "category": "tools",
    "order": 2,
    "enabled": true,
    "platforms": [
      "web"
    ]
  },
  {
    "id": "teleprompter",
    "name": "提词器",
    "description": "大字提词、语音跟读与自动定位",
    "icon": "ScrollText",
    "route": "/modules/teleprompter",
    "category": "productivity",
    "order": 3,
    "enabled": true,
    "platforms": [
      "web"
    ]
  }
] as ModuleManifest[]

export const enabledModuleIds = enabledModules.map((module) => module.id)

export const publicServerPrefixes = [
  "/server/emby"
] as string[]

export const moduleLoaders = {
  "vault": () => import("@/modules/vault/page"),
  "emby": () => import("@/modules/emby/page"),
  "teleprompter": () => import("@/modules/teleprompter/page"),
} as const

export type EnabledModuleId = keyof typeof moduleLoaders

import type { ModuleManifest } from "@thunder/core"

export const mockModules: ModuleManifest[] = [
  {
    id: "vault",
    name: "密码保险箱",
    description: "加密密码管理模块",
    icon: "Lock",
    route: "/vault",
    category: "security",
    order: 1,
    enabled: true,
  },
  {
    id: "emby",
    name: "Emby",
    description: "Emby 影视模块",
    icon: "Film",
    route: "/modules/emby",
    category: "tools",
    order: 2,
    enabled: true,
  },
]

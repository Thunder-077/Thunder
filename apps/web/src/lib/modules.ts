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
  {
    id: "teleprompter",
    name: "提词器",
    description: "大字提词、语音跟读与自动定位",
    icon: "ScrollText",
    route: "/modules/teleprompter",
    category: "productivity",
    order: 3,
    enabled: true,
  },
]

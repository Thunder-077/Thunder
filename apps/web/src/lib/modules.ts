import type { ModuleManifest, PlatformType } from "@thunder/core"

const allModules: ModuleManifest[] = [
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
    platforms: ["web"], // ❌ 仅限 Web 浏览器端
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

// 1. 安全地在客户端检查是否处于 Tauri 桌面壳环境中
const isDesktopClient = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

// 2. 确定当前平台目标
// 生产构建时优先使用静态注入的 NEXT_PUBLIC_PLATFORM (用于 Tree Shaking/静态分析)，
// 开发时若没有注入则动态自适应判定
const currentPlatform = (process.env.NEXT_PUBLIC_PLATFORM || (isDesktopClient ? "desktop" : "web")) as PlatformType

// 3. 获取自定义排除的模块列表并转换为数组 (如 "teleprompter,emby")
const excludeEnv = process.env.NEXT_PUBLIC_EXCLUDE_MODULES || ""
const excludedModuleIds = excludeEnv
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean)

// 4. 过滤并导出当前平台的模块列表
export const mockModules: ModuleManifest[] = allModules.filter((m) => {
  if (!m.enabled) return false
  // 如果模块被显式声明排除，则不打包/加载
  if (excludedModuleIds.includes(m.id)) return false
  // 如果没有限制平台，或者当前平台在限制列表中，则加载
  return !m.platforms || m.platforms.includes(currentPlatform)
})


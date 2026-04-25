import type { ModuleManifest } from "@thunder/core"

export const mockModules: ModuleManifest[] = [
  {
    id: "todo",
    name: "待办事项",
    description: "管理日常任务和待办清单",
    icon: "CheckSquare",
    route: "/modules/todo",
    category: "productivity",
    order: 1,
    enabled: true,
  },
  {
    id: "password-vault",
    name: "密码保险箱",
    description: "安全管理密码和私密信息",
    icon: "Shield",
    route: "/modules/password-vault",
    category: "security",
    order: 2,
    enabled: true,
  },
  {
    id: "ai-hub",
    name: "AI 中心",
    description: "管理 AI 账号和查看额度",
    icon: "Brain",
    route: "/modules/ai-hub",
    category: "ai",
    order: 3,
    enabled: true,
  },
]

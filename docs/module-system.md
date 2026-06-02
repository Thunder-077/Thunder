# Thunder 模块系统设计

## 概述

Thunder 的模块系统采用 **Manifest 驱动 + 构建期生成入口** 的设计。每个模块在 `scripts/generate-enabled-modules.mjs` 的清单中声明元信息、平台归属、前端页面入口、后端路由入口和定时任务入口；构建时会生成 Web/API 各自的启用模块文件，主应用只 import 生成文件。

桌面端另有运行时插件系统，用于安装后动态出现的插件。构建期模块裁剪只管理内置源码模块；桌面运行时插件见 `docs/desktop-plugin-system.md`。

## Module Manifest

每个模块必须提供一个 Manifest，声明其元信息：

```typescript
interface ModuleManifest {
  id: string              // 唯一标识符，如 "vault"
  name: string            // 显示名称，如 "密钥管家"
  description: string     // 模块描述
  icon: string            // 图标名称（lucide-react 图标名）
  route: string           // 路由路径，如 "/vault"
  category: ModuleCategory // 分类
  order: number           // 排序权重
  enabled: boolean        // 是否启用
  platforms?: ("web" | "desktop")[] // 目标平台；不写表示 Web / Desktop 都启用
  component?: string      // 组件路径（预留）
  settingsSchema?: Record<string, unknown> // 设置 schema（预留）
}
```

### 分类 (ModuleCategory)

```typescript
type ModuleCategory =
  | "productivity"  // 效率工具
  | "security"      // 安全隐私
  | "ai"            // AI 相关
  | "notes"         // 笔记知识
  | "tools"         // 实用工具
  | "dashboard"     // 数据看板
  | "other"         // 其他
```

## 模块注册

### 当前实现

模块不再由主应用手写静态注册。`scripts/generate-enabled-modules.mjs` 根据目标平台和排除参数生成：

- `apps/web/src/generated/enabled-modules.ts`：前端启用模块 Manifest、动态页面 loader、公开 server 路径前缀
- `apps/api/src/generated/enabled-routes.ts`：后端启用模块路由注册函数和定时任务入口

这两个 generated 文件不作为源码提交，开发、构建、测试、类型检查和 Cloudflare 相关入口会先执行生成脚本，再消费生成结果。

### 注册流程

1. 在 `scripts/generate-enabled-modules.mjs` 的模块清单中声明模块
2. 构建脚本传入目标平台和排除列表
3. 生成器筛选启用模块并写入 Web/API generated 文件
4. `ModuleRegistry` 从 generated Manifest 读取模块列表
5. 侧边栏、模块中心和命令面板只渲染启用模块
6. `/modules/[moduleId]` 根据 generated loader 动态加载模块页面
7. API 只注册 generated routes 中的后端模块路由

## 模块代码组织

### 前后端分离架构

模块代码分布在前端和后端，共享类型定义在 modules/ 中：

```
modules/{module-id}/           # 共享类型和接口（前后端共用）
  ├── src/
  │   ├── types/               # 类型定义
  │   ├── repository/          # Repository 接口
  │   └── crypto/              # Crypto 接口（如需要）
  └── package.json

apps/web/src/modules/{module-id}/   # 前端模块
  ├── page.tsx                  # 模块页面入口，由 /modules/[moduleId] 动态加载
  ├── components/               # UI 组件
  ├── hooks/                    # React hooks
  ├── state/                    # 状态管理（Provider）
  ├── crypto/                   # 客户端加密实现
  └── utils/                    # 工具函数

apps/api/src/modules/{module-id}/   # 后端模块
  ├── {module-id}-routes.ts         # API 路由
  └── {module-id}-repository.sqlite.ts  # Repository 实现

packages/api-client/src/modules/{module-id}.ts  # API Client

packages/contracts/openapi/{module-id}.yaml      # OpenAPI 规范
```

### 前端模块与后端模块边界

| 层级 | 位置 | 职责 |
|------|------|------|
| 共享类型 | modules/{id}/ | 类型定义、接口定义 |
| 前端模块 | apps/web/src/modules/{id}/ | UI 组件、状态管理、客户端加密 |
| 后端模块 | apps/api/src/modules/{id}/ | API 路由、Repository 实现 |
| API Client | packages/api-client/src/modules/{id}.ts | 前端调用后端的客户端 |
| API 契约 | packages/contracts/openapi/{id}.yaml | OpenAPI 规范 |

### 前端模块职责

- UI 组件渲染
- 用户交互处理
- 客户端状态管理（React Context + useState）
- 客户端加密（如 Vault 的 vaultCrypto）
- 通过 API Client 调用后端

### 后端模块职责

- REST API 路由定义
- Repository 实现（数据库访问）
- 业务逻辑编排
- 数据校验

### 共享类型职责

- 前后端共用的类型定义
- Repository 接口定义
- Crypto 接口定义
- 不包含具体实现

## 平台归属与构建期排除

模块清单中的 `platforms` 字段决定默认启用平台：

- 不写 `platforms`：Web 和 Desktop 都启用
- `platforms: ["web"]`：仅 Web 启用，Desktop 构建不生成该模块入口
- `platforms: ["desktop"]`：仅 Desktop 启用

当前提词器模块属于推荐的混合模式：Web 端保留构建期内置模块，Desktop 端通过官方内置插件市场安装，因此模块清单中声明为 `platforms: ["web"]`。

构建时还可以通过参数或环境变量排除模块：

```bash
pnpm build:web -- --exclude=emby
pnpm build:desktop -- --exclude=emby

THUNDER_EXCLUDE_MODULES=emby pnpm build:web
EXCLUDE_MODULES=emby pnpm build:desktop
```

被目标平台或排除列表禁用的模块不会出现在 generated Manifest、前端动态 loader、API 路由注册和定时任务入口中。为了保证未启用模块不进入无关平台包，主应用层禁止直接静态 import 业务模块文件。

Web 开发/构建入口由 `scripts/run-web.mjs` 包装，负责先生成 enabled modules 再运行 Next.js。桌面生产构建会以 `desktop` 目标生成 Web 和 API 运行时。

## 当前模块结构

### 复杂模块：Vault 示例

Vault 是第一个复杂模块，采用前后端分离架构：

```
modules/vault/                          # 共享类型
  ├── src/types/                        # VaultMetadata, VaultItemRecord 等
  ├── src/repository/interface.ts       # IVaultRepository
  └── src/crypto/interface.ts           # IVaultCrypto

apps/web/src/modules/vault/             # 前端模块
  ├── components/                       # UI 组件（17 个）
  ├── crypto/                           # 客户端加密（VaultCryptoWeb）
  ├── hooks/                            # useAutoLock, useClipboardProtection, useVaultSettings
  ├── state/                            # VaultProvider, useVault
  └── utils/                            # generate-password

apps/api/src/modules/vault/             # 后端模块
  ├── vault-routes.ts                   # API 路由（7 个端点）
  └── vault-repository.sqlite.ts        # Repository 实现

packages/api-client/src/modules/vault.ts  # VaultClient

packages/contracts/openapi/vault.yaml     # OpenAPI 规范
```

## 模块数据隔离

### 当前方案

- 所有模块通过 Repository 访问数据库（PostgreSQL + Prisma）
- 每个模块使用独立的数据库表（如 vault_metadata、vault_items）
- 模块间不直接共享状态
- 页面组件不直接访问数据库，通过 API Client → apps/api → Repository
- 需要跨模块通信时，通过主应用提供的事件总线（未来）

### 数据访问规则

```
前端组件 → @thunder/api-client → /api/v1/* → apps/api → Repository → Prisma → PostgreSQL
```

- 新模块必须通过 Repository 接口访问数据库
- 不允许页面组件直接访问 PostgreSQL 或 Prisma
- 不允许浏览器端代码直接导入数据库连接
- Repository 实现只在 apps/api 中，不在 apps/web 中

## 模块生命周期（预留）

当前阶段模块是静态注册的，未来将支持完整的生命周期：

```
注册 → 初始化 → 激活 → 停用 → 卸载
```

- **注册**：模块声明 Manifest 并注册到 Registry
- **初始化**：模块加载资源、初始化状态
- **激活**：模块可见，可以交互
- **停用**：模块不可见，释放非必要资源
- **卸载**：模块从 Registry 移除，清理所有资源

## 模块页面约定

模块页面实现统一放在 `apps/web/src/modules/{id}/page.tsx`，路由统一由 `apps/web/src/app/modules/[moduleId]/page.tsx` 挂载：

```
apps/web/src/app/
├── modules/
│   └── [moduleId]/
│       └── page.tsx          # /modules/{id}

apps/web/src/modules/
├── emby/
│   └── page.tsx              # /modules/emby 的页面实现
└── vault/
    └── page.tsx              # /modules/vault 的页面实现
```

## 新增模块指南

1. 在 `modules/` 中创建共享类型包（如需要前后端共享类型）
2. 在 `packages/contracts/openapi/` 中创建 OpenAPI 规范
3. 在 `packages/contracts/src/` 中添加错误码
4. 在 `packages/database/prisma/schema.prisma` 中新增表
5. 在 `apps/api/src/modules/` 中实现路由和 Repository
6. 在 `packages/api-client/src/modules/` 中实现 API Client
7. 在 `apps/web/src/modules/` 中实现前端模块
8. 在 `scripts/generate-enabled-modules.mjs` 中注册模块 Manifest、平台归属、前端页面入口和后端路由入口
9. 如模块仅属于某个平台，设置 `platforms`
10. 更新文档

## 未来插件化方向

1. **独立包**：每个模块作为独立 npm 包发布
2. **动态加载**：运行时按需加载模块代码
3. **插件 API**：标准化的模块接口，支持第三方开发
4. **模块市场**：浏览和安装社区模块
5. **沙箱隔离**：模块运行在沙箱环境中，限制 API 访问
6. **配置 UI**：根据 settingsSchema 自动生成模块设置页面

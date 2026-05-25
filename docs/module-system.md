# Thunder 模块系统设计

## 概述

Thunder 的模块系统采用 **Manifest 驱动** 的设计，每个模块通过声明式配置注册到主应用中。模块代码分布在前端（apps/web）和后端（apps/api），共享类型定义在 modules/ 中。

## Module Manifest

每个模块必须提供一个 Manifest，声明其元信息：

```typescript
interface ModuleManifest {
  id: string              // 唯一标识符，如 "vault"
  name: string            // 显示名称，如 "密码保险箱"
  description: string     // 模块描述
  icon: string            // 图标名称（lucide-react 图标名）
  route: string           // 路由路径，如 "/vault"
  category: ModuleCategory // 分类
  order: number           // 排序权重
  enabled: boolean        // 是否启用
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

模块通过 `ModuleRegistry` 类进行注册：

```typescript
const registry = new ModuleRegistry()
registry.register({
  id: "vault",
  name: "密码保险箱",
  // ...
})
```

注册后，模块会自动出现在侧边栏导航和模块中心页面中。

### 注册流程

1. 模块定义 Manifest
2. 调用 `registry.register(manifest)` 注册
3. 主应用从 Registry 读取模块列表
4. 侧边栏和模块中心自动渲染已注册模块
5. 路由系统根据 `route` 字段匹配页面

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

## 当前模块结构

### 简单模块

简单模块页面放在 `apps/web/src/app/modules/{id}/page.tsx`：

```
apps/web/src/app/modules/
└── emby/
    └── page.tsx          # /modules/emby
```

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

简单模块的页面文件放置在 `apps/web/src/app/modules/{id}/page.tsx`，复杂模块可以有独立路由：

```
apps/web/src/app/
├── modules/
│   └── emby/
│       └── page.tsx          # /modules/emby
└── vault/
    └── page.tsx              # /vault
```

## 新增模块指南

1. 在 `modules/` 中创建共享类型包（如需要前后端共享类型）
2. 在 `packages/contracts/openapi/` 中创建 OpenAPI 规范
3. 在 `packages/contracts/src/` 中添加错误码
4. 在 `packages/database/prisma/schema.prisma` 中新增表
5. 在 `apps/api/src/modules/` 中实现路由和 Repository
6. 在 `packages/api-client/src/modules/` 中实现 API Client
7. 在 `apps/web/src/modules/` 中实现前端模块
8. 在 `apps/web/src/app/` 中添加页面路由
9. 注册模块 Manifest
10. 更新文档

## 未来插件化方向

1. **独立包**：每个模块作为独立 npm 包发布
2. **动态加载**：运行时按需加载模块代码
3. **插件 API**：标准化的模块接口，支持第三方开发
4. **模块市场**：浏览和安装社区模块
5. **沙箱隔离**：模块运行在沙箱环境中，限制 API 访问
6. **配置 UI**：根据 settingsSchema 自动生成模块设置页面

# Thunder 架构设计

## 整体架构

Thunder 采用 **前后端分离 + 契约优先 + TypeScript-first + 多语言服务可插拔** 的架构设计，是一个面向个人的模块化应用平台。

```
┌──────────────────────────────────────────────────────────────┐
│                        Thunder Monorepo                       │
│                                                              │
│  ┌─────────────────────┐    ┌─────────────────────────────┐ │
│  │     apps/web         │    │       apps/api              │ │
│  │  Next.js Frontend    │    │    Hono Backend API         │ │
│  │  ┌───────────────┐  │    │  ┌───────────────────────┐  │ │
│  │  │  Pages / UI   │  │    │  │  REST API (/api/v1/*) │  │ │
│  │  │  API Client   │──┼──┼──▶│  Repository Layer     │  │ │
│  │  │  Crypto (FE)  │  │    │  │  Business Logic       │  │ │
│  │  └───────────────┘  │    │  └───────┬───────────────┘  │ │
│  └─────────────────────┘    │          │                   │ │
│                              │  ┌───────▼───────────────┐  │ │
│                              │  │  Prisma + PostgreSQL  │  │ │
│                              │  └───────────────────────┘  │ │
│                              └─────────────────────────────┘ │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   packages/*                          │   │
│  │  contracts | api-client | database | core | ui        │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌────────────────────┐    ┌────────────────────────────┐   │
│  │   modules/*        │    │     services/ (预留)        │   │
│  │  vault | todo |    │    │  python-ai-worker/ (未来)   │   │
│  │  account-hub       │    │  rust-system-worker/ (未来) │   │
│  └────────────────────┘    └────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

## 核心原则

### TypeScript-first

- 所有代码默认使用 TypeScript
- 前端、后端、API Client、Service、Repository、类型定义、工具函数均使用 TypeScript
- 后端默认使用 TypeScript（apps/api 基于 Hono）
- 只有在明确需要时才引入非 TypeScript 服务

### 前后端分离

- apps/web 只负责前端页面、路由、UI 和 API Client
- apps/api 负责后端 API 服务、数据库访问、业务编排
- 前端通过 packages/api-client 调用 apps/api
- 前端不得直接访问数据库、ORM、Repository

### 契约优先

- API 契约先于实现定义
- REST API 使用 OpenAPI 描述
- API 响应统一使用 ApiResponse<T>
- 错误码和分页结构统一管理

### 多语言服务可插拔

- 非 TypeScript 服务放在 services/ 目录
- 非 TypeScript 服务只能通过 apps/api 接入
- 前端不得直接调用多语言服务
- 当前不提前引入，只在明确需要时新增

## 数据流架构

### 标准数据流

```
浏览器 → @thunder/api-client → /api/v1/* → apps/api → Repository → Prisma → PostgreSQL
```

### Vault 安全数据流

```
浏览器（客户端加密）
  → VaultCryptoWeb.encryptVaultItem(DEK, plain) → VaultItemRecord（密文）
  → @thunder/api-client (VaultClient)
  → /api/v1/vault/items/:id
  → apps/api → VaultRepository → Prisma → PostgreSQL（只存密文）
```

### API 代理机制

本地开发时，apps/web 通过 Next.js rewrites 将 `/api/v1/*` 代理到 apps/api：

```
浏览器 → /api/v1/* → Next.js rewrites → http://localhost:3001/api/v1/*
```

## 项目结构

```
thunder/
├── apps/
│   ├── web/                         # Next.js 前端应用
│   │   ├── src/
│   │   │   ├── app/                 # App Router 页面
│   │   │   ├── components/          # 应用组件 + shadcn/ui
│   │   │   ├── hooks/               # 自定义 hooks
│   │   │   ├── lib/                 # 工具函数和配置
│   │   │   └── modules/             # 前端业务模块
│   │   │       └── vault/           # Vault 前端模块
│   │   │           ├── components/  # UI 组件
│   │   │           ├── crypto/      # 客户端加密实现
│   │   │           ├── hooks/       # 模块 hooks
│   │   │           ├── state/       # 状态管理（VaultProvider）
│   │   │           └── utils/       # 工具函数
│   │   └── .env                     # API_URL
│   └── api/                         # Hono 后端 API 服务
│       ├── src/
│       │   ├── modules/             # 后端业务模块
│       │   │   └── vault/           # Vault 后端模块
│       │   │       ├── vault-routes.ts        # API 路由
│       │   │       └── vault-repository.sqlite.ts  # Repository 实现
│       │   ├── app.ts               # Hono 应用配置
│       │   └── index.ts             # 入口文件
│       └── .env.example             # DATABASE_URL
├── packages/
│   ├── contracts/                   # API 契约
│   │   ├── openapi/                 # OpenAPI 规范文件
│   │   │   └── vault.yaml
│   │   └── src/                     # 契约类型
│   │       ├── api-response.ts      # ApiResponse<T>、ApiErrorCode
│   │       └── error-codes.ts       # 模块错误码
│   ├── api-client/                  # 前端 API 客户端
│   │   └── src/
│   │       ├── client.ts            # ThunderClient 基类
│   │       └── modules/
│   │           └── vault.ts         # VaultClient
│   ├── database/                    # 数据库基础能力
│   │   ├── prisma/
│   │   │   └── schema.prisma        # 数据库 schema
│   │   └── src/
│   │       └── client.ts            # Prisma Client 单例
│   ├── core/                        # 核心类型和模块注册系统
│   ├── config/                      # 共享配置
│   ├── ui/                          # 共享 UI 组件（预留）
│   └── platform/                    # 平台能力（预留）
├── modules/
│   └── vault/                       # Vault 共享类型和接口
│       └── src/
│           ├── types/               # VaultMetadata、VaultItemRecord 等
│           ├── repository/          # IVaultRepository 接口
│           └── crypto/              # IVaultCrypto 接口
├── services/                        # 非 TypeScript 独立服务（预留）
│   └── README.md                    # 多语言服务规则说明
├── data/                            # 数据库历史文件（已迁移至 PostgreSQL）
├── docs/                            # 设计文档
├── AGENTS.md                        # 开发规则
├── package.json                     # 根 package.json
├── pnpm-workspace.yaml              # pnpm 工作区配置
└── turbo.json                       # Turborepo 配置
```

## 各目录职责

### apps/web — 前端应用

- Next.js App Router 页面和路由
- UI 组件和布局
- API Client 调用（@thunder/api-client）
- 客户端状态管理
- 客户端加密（如 Vault 的 vaultCrypto）
- 通过 Next.js rewrites 代理 API 请求

### apps/api — 后端 API 服务

- Hono REST API 路由（/api/v1/*）
- 数据库访问（Repository + Prisma）
- 业务逻辑编排
- 多语言服务接入和转发（未来）
- 认证和授权（未来）

### packages/contracts — API 契约

- OpenAPI 规范文件
- ApiResponse<T> 统一响应格式
- ApiErrorCode 统一错误码
- PaginatedData<T> 统一分页结构
- 模块级错误码常量

### packages/api-client — 前端 API 客户端

- ThunderClient 基类（get/put/post/del）
- 模块级客户端（VaultClient 等）
- ThunderApiError 错误类
- createApiClients 工厂函数

### packages/database — 数据库基础能力

- Prisma schema 定义
- Prisma Client 单例
- 数据库迁移管理

### packages/core — 核心类型和模块系统

- ModuleManifest 类型
- ModuleRegistry 注册系统
- ModuleCategory 分类

### modules/* — 业务模块共享类型

- 前后端共用的类型定义
- Repository 接口定义
- Crypto 接口定义
- 不包含具体实现

### services/ — 多语言服务（预留）

- 非 TypeScript 独立服务
- 只在明确需要时创建
- 通过 HTTP API / RPC / 消息队列接入 apps/api

## 运行环境

### 本地开发

1. 启动 apps/api：`pnpm dev:api`（默认端口 3001）
2. 启动 apps/web：`pnpm dev:web`（默认端口 3000）
3. apps/web 通过 Next.js rewrites 代理 `/api/v1/*` 到 apps/api

### 生产部署

- apps/api：Node.js 服务，监听 API_PORT（默认 3001）
- apps/web：Next.js 生产构建，通过 rewrites 代理 API 请求
- 数据库：PostgreSQL（Neon 托管），通过环境变量 `DATABASE_URL` 配置

## 未来扩展方向

1. **数据库演进**：已完成 SQLite → PostgreSQL (Neon) 迁移，后续可考虑 MySQL
2. **多语言服务**：Python AI Worker、Rust System Worker 等（按需引入）
3. **模块独立包**：将模块拆分为独立 npm 包，支持动态加载
4. **插件系统**：第三方模块通过插件 API 接入
5. **Tauri 桌面端**：利用 Tauri 提供原生系统能力
6. **PWA 离线**：Service Worker + 本地缓存实现离线可用
7. **服务间通信**：HTTP / gRPC / 消息队列

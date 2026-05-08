# Thunder 服务边界

## 概述

Thunder 采用严格的服务边界设计，确保前端、主后端、多语言服务和数据库之间的职责清晰、依赖方向正确。

## 边界总览

```
┌──────────────────────────────────────────────────────────────┐
│                        前端边界                               │
│                                                              │
│  apps/web                                                    │
│  ├── 页面、路由、UI 组件                                      │
│  ├── API Client（@thunder/api-client）                       │
│  ├── 客户端状态管理                                           │
│  └── 客户端加密（VaultCryptoWeb）                             │
│                                                              │
│  禁止：直接访问数据库、直接调用多语言服务                       │
└──────────────────────┬───────────────────────────────────────┘
                       │ HTTP /api/v1/*
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                      主后端边界                               │
│                                                              │
│  apps/api                                                    │
│  ├── REST API 路由（/api/v1/*）                              │
│  ├── Repository 层                                           │
│  ├── 业务逻辑编排                                            │
│  └── 多语言服务接入和转发（未来）                              │
│                                                              │
│  允许：访问数据库、编排多语言服务                              │
│  禁止：接触 Vault 明文密码                                    │
└──────────┬───────────────────────────────┬───────────────────┘
           │                               │
           ▼                               ▼
┌─────────────────────┐    ┌──────────────────────────────────┐
│    数据库边界        │    │      多语言服务边界（预留）        │
│                     │    │                                  │
│  packages/database  │    │  services/*                      │
│  ├── Prisma schema  │    │  ├── python-ai-worker/ (未来)    │
│  ├── Prisma Client  │    │  └── rust-system-worker/ (未来)  │
│  └── PostgreSQL    │    │                                  │
│                     │    │                                  │
│  允许：被 apps/api  │    │  允许：被 apps/api 编排           │
│  和 Repository 访问 │    │  禁止：被前端直接调用             │
└─────────────────────┘    └──────────────────────────────────┘
```

## 前端边界（apps/web）

### 允许

- 渲染页面和 UI 组件
- 通过 @thunder/api-client 调用 apps/api
- 客户端状态管理（React Context + useState）
- 客户端加密（如 VaultCryptoWeb）
- 使用 @thunder/vault 等共享类型

### 禁止

- 直接访问 PostgreSQL / Prisma / 数据库连接
- 直接导入 @thunder/database
- 直接调用 Repository 实现
- 直接调用多语言服务
- 直接拼接 SQL 语句
- 在客户端代码中导入任何服务端专用模块

### 数据访问路径

```
前端组件 → API Client → /api/v1/* → apps/api → Repository → Prisma → PostgreSQL
```

前端组件不得跳过 API Client 直接访问数据库。

## 主后端边界（apps/api）

### 允许

- 提供 REST API 路由
- 访问数据库（通过 Repository + Prisma）
- 编排业务逻辑
- 接入和转发多语言服务（未来）
- 使用 @thunder/contracts、@thunder/database、@thunder/vault

### 禁止

- 接触 Vault 明文密码（Vault API 只处理密文）
- 直接渲染 UI
- 包含前端状态管理逻辑

### Vault 安全边界

- apps/api 只接收和保存 VaultMetadata / VaultItemRecord 的密文结构
- 不得接收或处理 VaultItemPlain 明文数据
- 不得解密 encryptedPayload
- 不得保存明文 title、username、password、url、notes、tags

## 数据库边界（packages/database）

### 允许

- 被 apps/api 和 Repository 层访问
- 定义数据库 schema
- 提供 Prisma Client 单例

### 禁止

- 被前端代码直接导入
- 泄漏数据库实现细节到前端

### 数据库访问规则

| 层级 | 能否访问数据库 |
|------|--------------|
| apps/web（前端） | ❌ 不能 |
| packages/api-client | ❌ 不能 |
| packages/contracts | ❌ 不能 |
| modules/*（共享类型） | ❌ 不能 |
| apps/api（后端） | ✅ 可以（通过 Repository） |
| packages/database | ✅ 可以（提供 Client） |

## 多语言服务边界（services/）

### 当前状态

- 只保留 services/README.md
- 不实际创建任何非 TypeScript 服务

### 未来规则

- 非 TypeScript 服务必须位于 services/ 目录
- 非 TypeScript 服务必须作为独立 service 存在
- 非 TypeScript 服务只能通过 apps/api 接入主系统
- 通信方式：HTTP API / gRPC / 消息队列
- 前端不得直接调用这些服务
- modules 和 packages 不得依赖这些服务的内部实现

### 接入方式

```
前端 → @thunder/api-client → apps/api → HTTP/RPC/MQ → services/python-ai-worker
```

### 新增非 TypeScript 服务的条件

1. 用户明确指定该模块使用某种语言
2. TypeScript 明显不适合该功能
3. 该功能强依赖 Python / Java / Rust 等生态

典型场景：
- AI/机器学习 → Python（PyTorch、TensorFlow 生态）
- OCR → Python（Tesseract、PaddleOCR 生态）
- 企业系统集成 → Java（Spring、企业 SDK 生态）
- 系统级能力 → Rust（性能、内存安全）

### 决策记录要求

每次新增非 TypeScript 服务，必须在 docs/decision-records.md 中记录：
- 引入原因
- 为什么 TypeScript 不适合
- 服务边界
- 通信方式
- 替代方案
- 对部署和维护的影响

## 共享类型边界（modules/*）

### 允许

- 定义前后端共用的类型（如 VaultMetadata、VaultItemRecord）
- 定义接口（如 IVaultRepository、IVaultCrypto）
- 被前端和后端同时引用

### 禁止

- 包含具体实现（实现分别在 apps/web 和 apps/api 中）
- 依赖任何运行时库
- 依赖数据库连接

## API 契约边界（packages/contracts）

### 允许

- 定义 API 响应格式（ApiResponse<T>）
- 定义错误码（ApiErrorCode）
- 定义分页结构（PaginatedData<T>）
- 维护 OpenAPI 规范文件

### 禁止

- 包含业务逻辑
- 依赖数据库
- 依赖具体模块实现

## 依赖方向

```
apps/web → @thunder/api-client → @thunder/contracts
                                → @thunder/vault
apps/web → @thunder/core
apps/web → @thunder/vault（共享类型）

apps/api → @thunder/contracts
apps/api → @thunder/database
apps/api → @thunder/vault（共享类型）

@thunder/api-client → @thunder/contracts
@thunder/api-client → @thunder/vault

前端 ❌→ @thunder/database
前端 ❌→ services/*
前端 ❌→ apps/api 内部模块
```

依赖方向必须单向：前端 → API Client → API 契约 + 共享类型。不得反向依赖。

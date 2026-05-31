# AGENTS.md

> Thunder 项目的 AI Agent 开发指南。修改代码时必须遵守以下规则。
> 架构详情见 `docs/architecture.md`，各模块专属规则见 `modules/{module}/AGENTS.md`。

## Project Overview

Thunder 是面向个人的模块化应用平台，采用前后端分离 + 契约优先 + TypeScript-first（业务层）架构，并提供渐进式 Tauri 桌面壳。

| Layer | Technology | Path |
|-------|-----------|------|
| Frontend | Next.js (App Router) + shadcn/ui | `apps/web` |
| Backend | Hono (REST API) | `apps/api` |
| Desktop Shell | Tauri v2 + Rust | `apps/desktop` |
| Database | Prisma + PostgreSQL (Neon) | `packages/database` |
| Monorepo | pnpm workspaces + Turborepo | root |
| API Contract | OpenAPI + `ApiResponse<T>` | `packages/contracts` |

## Commands

```bash
# 开发
pnpm dev              # 启动所有 apps（turbo）
pnpm dev:api          # 仅启动 API（port 3001）
pnpm dev:web          # 仅启动前端（port 3000）
pnpm dev:desktop      # 启动 Tauri 桌面壳（会自动拉起 web + api）
pnpm build:web        # 构建 Web 端，可追加 -- --exclude=moduleA,moduleB
pnpm build:desktop    # 构建桌面端，可追加 -- --exclude=moduleA,moduleB

# 质量检查
pnpm lint             # ESLint（所有 packages）
pnpm typecheck        # TypeScript 类型检查
pnpm build            # 生产构建（turbo）

# 数据库
pnpm db:generate      # 生成 Prisma Client
pnpm db:migrate       # 生成/运行 PostgreSQL 迁移
pnpm db:migrate:sqlite <name>  # 生成 SQLite 专属迁移
pnpm db:push          # 推送 schema 变更（开发用）
pnpm db:studio        # 打开 Prisma Studio

# Cloudflare 部署
pnpm deploy:api:cf    # 部署 API 到 Cloudflare Workers
pnpm deploy:web:cf    # 部署前端到 Cloudflare Pages
```

## Architecture Boundaries

> 架构设计见 `docs/architecture.md`，服务边界见 `docs/service-boundary.md`。

### TypeScript-first

- TypeScript-first 适用于业务/应用层：`apps/web`、`apps/api`、`packages/*`、`modules/*` 默认使用 TypeScript
- 前端页面、组件、API Client、Repository、业务编排、类型定义、工具函数默认使用 TypeScript
- 平台壳 / 原生运行时层可使用非 TypeScript 技术，例如 Tauri 的 Rust `src-tauri`
- 新增非 TypeScript 代码必须满足以下之一：用户明确指定 / TypeScript 明显不适合 / 强依赖其他语言生态或原生平台能力
- 平台壳 / 原生运行时层不得承载业务模块规则；业务模块边界、API 契约、共享类型仍以 TypeScript 为主
- 新增非 TypeScript 独立服务必须在 `docs/decision-records.md` 记录理由，位于 `services/`，仅通过 `apps/api` 接入

### Frontend / Backend Separation

| 规则 | ✅ 允许 | ❌ 禁止 |
|------|--------|---------|
| 数据访问 | `apps/web` → `@thunder/api-client` → `apps/api` → Repository → Prisma | `apps/web` 直接访问 SQLite / ORM / Repository |
| 外部服务 | `apps/api` → `services/*` | `apps/web` / `modules` / `packages` 直接调用 `services/*` |
| 状态管理 | React Context + useState | Redux / MobX 等复杂状态管理库 |
| 客户端加密 | `apps/web`（如 Vault vaultCrypto） | 服务端存储明文 |

### Workspace Structure

```
apps/web          → Next.js 前端（页面、路由、UI、API Client、客户端加密）
apps/api          → Hono 后端（REST 路由 /api/v1/*、业务编排、DB 访问）
packages/
  contracts       → API 契约（OpenAPI、ApiResponse<T>、ApiErrorCode、PaginatedData<T>）
  api-client      → 前端 API 客户端（ThunderClient、VaultClient）
  database        → Prisma schema + Client 单例
  core            → 核心类型 + ModuleRegistry
  ui / config     → 共享 UI 组件 / 配置（预留）
apps/desktop      → Tauri 桌面壳（窗口、原生能力入口、桌面生命周期）
packages/platform → 平台能力抽象（Web / Tauri 文件、剪贴板、外链等）
modules/*         → 业务模块共享类型与接口（不含实现）
services/*        → 非 TypeScript 独立服务（预留，仅通过 apps/api 接入）
```

## API Contract-First

> API 设计见 `docs/api-design.md`。

- **先定义契约，再实现**：契约定义在 `packages/contracts/openapi/`
- API 路径统一 `/api/v1/*`，响应统一 `ApiResponse<T>`
- 错误码 `ApiErrorCode`、分页 `PaginatedData<T>` 统一管理
- 本地开发：`apps/web` 通过 Next.js rewrites 代理到 `apps/api`（port 3001）
- 当前以 Docker Compose 和本地开发体验优先，不引入复杂微服务治理

## Database

- 支持双数据库架构：Web 端使用云端 PostgreSQL (Neon 托管)，桌面端使用本地 SQLite 数据库文件 (AppData 中存储)
- 数据库访问只能在 `apps/api` 的 Repository 层，通过 `packages/database` 导出的全局 `prisma` Proxy 单例
- Schema 变更必须保持双端兼容：禁用数据库特有特性 (如原生 Enum、自动 UUID 函数)，日期及 JSON 统一用 String/TEXT 以保证 SQLiteparities
- Schema 修改后必须同步运行 `pnpm db:migrate` 生成 PostgreSQL 迁移、`pnpm db:migrate:sqlite <name>` 生成 SQLite 迁移，再运行 `pnpm db:generate` 编译双端 Client 并输出 `apps/api/src/sqlite-migrations.json`
- 数据库实现细节不得泄漏到 `apps/web`

## Module System

> 详细说明见 `docs/module-system.md`。

- 新增模块必须通过 Manifest 注册到 `ModuleRegistry`（包含所有必填字段）
- 模块间不直接共享状态，数据通过独立 key 隔离
- 前端模块代码：`apps/web/src/modules/{id}/`
- 后端模块代码：`apps/api/src/modules/{id}/`
- 模块平台归属和打包入口统一维护在 `scripts/generate-enabled-modules.mjs` 的模块清单中；`platforms: ["web"]` 表示仅 Web 端启用，不写 `platforms` 表示 Web / Desktop 都启用
- Web / Desktop 构建时可通过 `--exclude=moduleA,moduleB` 或环境变量 `THUNDER_EXCLUDE_MODULES` / `EXCLUDE_MODULES` 排除模块；被排除模块不得被主应用静态 import
- 桌面端运行时插件系统独立于构建期内置模块，插件规范见 `docs/desktop-plugin-system.md`；插件不得直接 import 主应用源码、Prisma 或内置模块实现
- 官方内置桌面插件放在 `plugins/desktop/{plugin-id}`，可随 Desktop 运行时进入插件市场；安装后默认启用，不做单独信任按钮
- 桌面插件发布使用 `pnpm --filter @thunder/api package:desktop-plugin` 生成签名包和 marketplace entry，使用 `pnpm build:plugin-marketplace` 合并并签名市场索引
- 前端模块路由由 `apps/web/src/app/modules/[moduleId]/page.tsx` 根据生成的 `apps/web/src/generated/enabled-modules.ts` 动态加载，不为每个模块在 `app/` 下新增静态 page
- 后端模块路由由生成的 `apps/api/src/generated/enabled-routes.ts` 注册，`apps/api/src/app.ts` / `worker.ts` 不直接 import 业务模块
- 主应用只负责外壳（AppShell）、布局、导航、全局设置，业务逻辑放在模块中
- 各模块可在 `modules/{module}/AGENTS.md` 定义专属规则

## UI & Styling

> 设计规范见 `docs/ui-design.md`，下拉框规范见 `docs/select-dropdown.md`。

### Design Tokens

- **Components**: shadcn/ui（唯一 UI 库）
- **Icons**: lucide-react（唯一图标库）
- **Style**: 极简风格 — 大量留白、低饱和配色、轻边框、柔和阴影、圆角卡片

### Component Reuse

| 场景 | 使用 | 禁止 |
|------|------|------|
| 弹窗 | `AppDialog` / `useDialog` | `window.alert` / `confirm` / `prompt` |
| 下拉框 | 通用 `Select` / `Dropdown` | 自定义下拉实现 |
| 输入框 | 通用 `Input` / `PasswordInput` | 自定义 input focus 样式 |

### Layout

- 页面遵循 `AppShell + Sidebar + Topbar + Content` 布局
- 模块页面实现放在 `src/modules/{id}/page.tsx`，由统一动态路由挂载到 `src/app/modules/[moduleId]/`
- 使用 `PageHeader` 作为页面标题，`EmptyState` 作为空状态
- **Sidebar**: 固定展开（240px），不支持收起；底部只保留全局命令、主题切换、设置按钮
- Sidebar 导航来自 `ModuleRegistry`，禁止硬编码业务模块
- 修改 UI / Sidebar 时同步更新 `docs/ui-design.md`

## Code Quality

- TypeScript 类型清晰，避免 `any`
- 组件命名语义化，文件结构清晰
- 不要写大段无用 mock 数据，不要一次性实现过多功能
- 不要生成复杂、难维护的抽象
- 不过早引入复杂依赖，新增前评估必要性，优先使用已有依赖
- 禁止硬编码密钥或敏感信息
- **破坏性修改**：除非用户特别说明需要兼容旧版本，所有破坏性修改默认不要求与旧版本兼容，但必须明确给出警告

## Workflow

### Before Coding

- 理解需求，确认受影响的模块和层级
- 检查 `modules/{module}/AGENTS.md` 是否有模块专属规则
- 新增 API 时先定义契约（OpenAPI），再实现

### After Coding

- 说明修改了哪些文件及原因
- 运行 `pnpm lint` + `pnpm typecheck`（条件允许时运行 `pnpm build`）
- 如修改了设计 / UI / Sidebar / 模块机制，同步更新 `docs/` 下对应文档

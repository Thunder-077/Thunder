# ⚡️ Thunder

> **面向个人的极简模块化应用平台**  
> An elegant, modular personal application platform.

<p align="left">
  <a href="./README.md">🇨🇳 简体中文</a> | 
  <a href="./README_EN.md">🇺🇸 English</a>
</p>

---

## 🌟 项目定位 (Overview)

**Thunder** 是一个专为个人打造的模块化应用平台。项目采用**前后端分离**、**契约优先 (Contract-First)**、**TypeScript-first (业务层)** 的现代架构，并提供**渐进式 Tauri 桌面壳**，支持跨 Web 端与桌面原生端运行。

它不仅仅是一个单一的工具，而是一个高度可扩展的“个人数字化生活中心”。通过松耦合的插件化模块系统，您可以按需启用不同的功能块。

### 📦 当前已包含的核心模块
- 🎤 **提词器 (Teleprompter)**：支持滚动模式与语音实时自动跟读模式（集成 Web Speech、FunASR 与 Sherpa-ONNX 离线语音引擎）。
- 🔐 **保险箱 (Vault)**：零知识客户端加密，确保个人私密数据物理级的安全存储。
- 🎬 **流媒体管家 (Emby)**：集成 EMOS 与 TMDB 服务，实现便捷的流媒体数据辅助管理。
- 🌦️ **天气看板 (Weather)**：集成和风天气 API，提供精准的实时天气与预报看板。

---

## 🛠️ 技术栈 (Technology Stack)

| 层级 | 选用技术 | 路径 | 核心职责 |
| :--- | :--- | :--- | :--- |
| **前端主应用** | Next.js 15 (App Router) + shadcn/ui + Tailwind CSS | `apps/web` | 提供沉浸式的现代 UI 交互，状态管理及客户端数据加密 |
| **后端 API** | Hono (Hono REST API) + Cloudflare Workers / Node.js | `apps/api` | 轻量化、极速响应的 RESTful 路由与业务逻辑编排 |
| **桌面运行时** | Tauri v2 + Rust | `apps/desktop` | 原生桌面外壳，负责多窗口管理及系统原生 API 桥接 |
| **数据库/ORM** | Prisma + PostgreSQL (Neon 托管 / 本地 PostgreSQL) | `packages/database` | 单例模式的 Prisma Client 数据持久化支持 |
| **API 契约** | OpenAPI 规范 + TypeScript 契约定义 | `packages/contracts` | 契约优先的路由参数、API 错误码及统一响应体定义 |
| **平台能力抽象** | TypeScript 原生平台适配层 | `packages/platform` | 屏蔽环境差异，统一 Web 端与 Tauri 原生文件/外链访问 |

---

## 📐 架构设计与边界 (Architecture & Boundaries)

项目遵循严苛的设计原则，保障代码的长期可维护性：
- **TypeScript-first**：业务和应用层（包括 API 客户端、Repository、业务编排、通用工具等）默认 100% 采用 TypeScript，保证类型强安全。
- **前后端分离**：前端主应用通过统一的 `@thunder/api-client` 与后端 API 交互，绝不直接跨边界访问 ORM、数据库或底层文件。
- **契约优先**：所有 API 变更均在 `packages/contracts/openapi/` 中先定义规范，再进行前端及后端的具体实现。
- **模块独立化**：新模块代码严格按照 `apps/web/src/modules/{id}/` 与 `apps/api/src/modules/{id}/` 路径完全解耦，严禁跨模块直接共享数据库键或页面状态。

---

## 🚀 快速开始 (Quick Start)

### 1. 前置准备
在运行项目前，请确保您的本地开发环境已安装：
- **Node.js** (v18+)
- **pnpm** (推荐 v8 / v9 包管理器)
- **Rust 编译链** (如果您计划运行或构建 `Tauri` 桌面端)

### 2. 环境变量配置
请按照各目录下的 `.example` 文件在对应路径下配置环境变量：
1. **数据库配置**：在 `packages/database/` 下新建 `.env` 并配置真实的 `DATABASE_URL`。
2. **后端服务配置**：在 `apps/api/` 下新建 `.env` 并配置数据库连接及相关 API 密钥。
3. **前端主配置**：在 `apps/web/` 下新建 `.env` 并填入 `API_URL` 及其验证密钥。

*更详细的变量列表说明请查看：`packages/database/.env.example`，`apps/api/.env.example`。*

### 3. 一键初始化与启动

```bash
# 1. 安装项目所有依赖
pnpm install

# 2. 生成数据库客户端并运行迁移推送
pnpm db:generate
pnpm db:push

# 3. 启动本地全栈开发服务 (通过 Turborepo 一键启动 API + Web 端口)
pnpm dev
```
启动成功后：
- 前端主页访问：`http://localhost:3000`
- 后端 API 测试：`http://localhost:3001`

### 4. 启动 Tauri 桌面版

```bash
# 启动本地 Tauri 桌面端，它会自动拉起关联的 API 服务及 Web 页面渲染
pnpm dev:desktop
```

---

## 📦 Monorepo 目录结构

```text
Thunder/
├── apps/
│   ├── web/            # Next.js 极简前端主应用
│   ├── api/            # Hono 后端 REST API
│   └── desktop/        # Tauri v2 桌面原生运行时 (Rust src-tauri)
├── packages/
│   ├── contracts/      # OpenAPI 统一契约、API 错误码与通用响应定义
│   ├── database/       # Prisma Schema 与 Client 单例定义
│   ├── core/           # 核心通用类型及业务模块注册机 (ModuleRegistry)
│   └── platform/       # Web/Tauri 原生文件读写、外链与剪贴板适配层
├── modules/            # 业务模块专有的抽象接口与共享定义定义（不含实现）
├── docs/               # 极为详尽的 API 设计、架构、模块系统及部署规范文档
└── pnpm-workspace.yaml # Monorepo 多包管理配置文件
```

---

## 📑 常用开发命令 (Common Commands)

```bash
# 启动不同目标
pnpm dev              # 启动全栈开发环境 (API + Web)
pnpm dev:api          # 仅启动 Hono API 服务 (Port 3001)
pnpm dev:web          # 仅启动 Next.js 前端服务 (Port 3000)
pnpm dev:desktop      # 启动本地 Tauri 桌面版应用

# 质量控制与质量分析
pnpm lint             # 执行 ESLint 语法规范检查 (覆盖所有子包)
pnpm typecheck        # 执行 TypeScript 类型安全性静态检查
pnpm build            # 执行生产环境构建打包

# 数据库操作 (Prisma)
pnpm db:generate      # 重新生成本地 Prisma 客户端代码
pnpm db:push          # 同步 Prisma Schema 变更推送至数据库 (开发阶段首选)
pnpm db:migrate       # 执行正式的数据库迁移
pnpm db:studio        # 开启本地 Prisma Studio 数据库图形管理器
```

---

## 📜 开发协议与贡献规范
关于如何向本项目贡献新业务模块、组件编写规范及 UI 标准等，请遵循以下约定文档：
- **AI 开发助手指南**：`AGENTS.md`
- **模块注册流程**：`docs/module-system.md`
- **UI 设计与规范**：`docs/ui-design.md`

<p align="center">
  <a href="./README.md">
    <img src="apps/web/public/logo.png" alt="Thunder Logo" width="120" height="120" style="border-radius: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.15);" />
  </a>
</p>

<h1 align="center">Thunder</h1>

<p align="center">
  <strong>面向未来的私有化、轻量插件式多运行时应用平台架构</strong><br />
  <em>Next-Generation Private, Modular, and Lightweight Multi-Runtime Application Container.</em>
</p>

<p align="center">
  <a href="./README.md">🇨🇳 简体中文</a> | 
  <a href="./README_EN.md">🇺🇸 English</a>
</p>

---

## 🌟 核心定位 (Overview)

**Thunder** 是一个面向未来的**私有化、轻量插件式多运行时应用平台架构**（Private & Modular Multi-Runtime Application Container）。它基于前后端分离、契约优先 (Contract-First)、TypeScript-First (业务编排层) 的现代软件工程范式构建，深度融合了 **Next.js 现代微前端架构**、**Hono 轻量化边缘 API 网关** 与 **Tauri 渐进式多端原生桌面容器**。

通过去中心化的松耦合微应用模块系统，Thunder 致力于打破传统巨石应用（Monolith）与散乱孤立工具之间的技术壁垒，在确保极度安全、私密、高性能的前提下，为多维数据及核心业务场景提供高度聚合、弹性扩展的运行容器。

---

## 📐 三大架构支柱 (Architectural Pillars)

- **🖥️ 多端轻量原生容器 (Cross-Platform Native Container)**  
  整合现代 Web 前端渲染与 Tauri 极速 Rust 原生桌面外壳，实现统一代码基下的多终端高效运行与低开销系统原生 API 级桥接，提供媲美原生应用的交互体验。
  
- **🔐 零知识加密隐私边界 (Zero-Knowledge Cryptography)**  
  深度集成端到端硬件级客户端加密体系，任何高密敏感字段和存储内容在传输和云存储前均在本地完成高强度密码学隔离，在物理层面绝对保障个人私密数据安全。
  
- **🧩 弹性松耦合微生态 (Plugin-Driven Micro-Ecosystem)**  
  采用高内聚、低耦合的模块化路由与数据库注册仓，提供清晰的项目边界。各场景业务微应用（如提词器、加密保险箱、流媒体管家等）完全独立，可按需动态装配与按需扩展。

---

## 📦 当前已包含的核心模块

- 🎤 **智能提词器 (Teleprompter)**：支持滚动模式与语音实时自动跟读模式（集成 Web Speech、FunASR 与 Sherpa-ONNX 离线语音引擎）。
- 🔐 **加密保险箱 (Vault)**：零知识客户端加密，确保个人私密数据物理级的安全存储。
- 🎬 **流媒体管家 (Emby Manager)**：集成 EMOS 与 TMDB 开放服务，实现便捷的流媒体数据辅助管理。
- 🌦️ **智能天气看板 (Weather Board)**：集成和风天气 API，提供精准的实时天气与预报看板。

---

## 🛠️ 技术栈 (Technology Stack)

| 层级 | 选用技术 | 路径 | 核心职责 |
| :--- | :--- | :--- | :--- |
| **前端微应用** | Next.js 15 (App Router) + shadcn/ui + Tailwind CSS | `apps/web` | 提供沉浸式的现代 UI 交互，状态管理及客户端数据加密 |
| **微网关 API** | Hono (Hono REST API) + Cloudflare Workers / Node.js | `apps/api` | 轻量化、极速响应的 RESTful 路由与业务逻辑编排 |
| **原生运行时** | Tauri v2 + Rust | `apps/desktop` | 原生桌面外壳，负责多窗口管理及系统原生 API 桥接 |
| **数据持久化** | Prisma + PostgreSQL (Web/Cloud) + SQLite (Desktop) | `packages/database` | 单例模式的 Prisma Client 与双端数据库支持 |
| **API 契约** | OpenAPI 规范 + TypeScript 契约定义 | `packages/contracts` | 契约优先的路由参数、API 错误码及统一响应体定义 |
| **平台适配器** | TypeScript 原生平台适配层 | `packages/platform` | 屏蔽环境差异，统一 Web 端与 Tauri 原生文件/外链访问 |

---

## 🚀 快速开始 (Quick Start)

### 1. 前置准备
在运行项目前，请确保您的本地开发环境已安装：
- **Node.js** (v24+)
- **pnpm** (推荐 v8 / v9 包管理器)
- **Rust 编译链** (如果您计划运行或构建 `Tauri` 桌面端)

### 2. 环境变量配置
请按照各目录下的 `.example` 文件在对应路径下配置环境变量：
1. **Web / Cloud 数据库配置**：在 `packages/database/` 下新建 `.env` 并配置 PostgreSQL `DATABASE_URL`。
2. **后端服务配置**：在 `apps/api/` 下新建 `.env` 并配置 PostgreSQL 连接及相关 API 密钥。
3. **前端主配置**：在 `apps/web/` 下新建 `.env` 并填入 `API_URL` 及其验证密钥。

桌面端数据库不需要手动配置，Tauri 壳会在启动本地 API 时自动使用应用数据目录中的 SQLite 文件。

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
├── modules/            # 业务模块专有的抽象接口与共享定义（不含实现）
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

<p align="center">
  <a href="./README_EN.md">
    <img src="apps/web/public/logo.png" alt="Thunder Logo" width="120" height="120" style="border-radius: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.15);" />
  </a>
</p>

<h1 align="center">⚡️ Thunder</h1>

<p align="center">
  <strong>Next-Generation Private, Modular, and Lightweight Multi-Runtime Application Platform Architecture</strong><br />
  <em>面向未来的私有化、轻量插件式多运行时应用平台架构。</em>
</p>

<p align="center">
  <a href="./README.md">🇨🇳 简体中文</a> | 
  <a href="./README_EN.md">🇺🇸 English</a>
</p>

---

## 🌟 Core Vision (Overview)

**Thunder** is a next-generation, **private, modular, and lightweight multi-runtime application platform architecture** (Private & Modular Multi-Runtime Application Container). Built on modern software engineering paradigms including Frontend/Backend Separation, Contract-First design, and TypeScript-First business orchestration, Thunder aggregates **Next.js modern micro-frontend architecture**, **Hono lightweight edge API gateway**, and **Tauri progressive multi-platform native container** under a unified Monorepo codebase.

By leveraging a decentralized, loosely-coupled micro-app architecture, Thunder bridges the technological divide between monolithic web apps and fragmented individual tools, providing a highly-secure, performant, and aggregated ecosystem for private data management and multi-scenario service orchestrations.

---

## 📐 Architectural Pillars

- **🖥️ Cross-Platform Native Shell**  
  Unifies a modern Next.js client with high-performance Tauri native Rust desktop runtime to orchestrate multi-platform deployment and low-overhead native API bridges, delivering interactions on par with native applications.
  
- **🔐 End-to-End Zero-Knowledge Trust**  
  Enforces hardware-level client-side cryptography, ensuring all high-value sensitive credentials and storage fields are cryptographically isolated and encrypted before server transport, ensuring absolute physical data protection.
  
- **🧩 Plugin-Driven Micro-Ecosystem**  
  Features a decentralized routing & DB registration interface where developers can seamlessly deploy standalone micro-applications (Teleprompter, Vault, Media Assistant, Forecast Board) with complete environment isolation.

---

## 📦 Core Modules Included

- 🎤 **Smart Teleprompter**: Supports auto-scroll mode and real-time speech shadowing mode (integrated with Web Speech, FunASR, and offline Sherpa-ONNX engines).
- 🔐 **Encrypted Vault**: Zero-knowledge client-side encryption, guaranteeing physical-level security for personal secret data.
- 🎬 **Emby Manager**: Integrated with EMOS and TMDB APIs, facilitating easier assistance and management of media playback data.
- 🌦️ **Weather Board**: Integrated with QWeather (HeFeng) API, rendering real-time weather forecasts and aesthetic widgets.

---

## 🛠️ Technology Stack

| Layer | Technology | Path | Core Responsibility |
| :--- | :--- | :--- | :--- |
| **Frontend UI** | Next.js 15 (App Router) + shadcn/ui + Tailwind CSS | `apps/web` | Modern responsive UI, client state management, and cryptography |
| **Backend REST API** | Hono + Cloudflare Workers / Node.js runtime | `apps/api` | Fast-performing, ultra-lightweight RESTful routes & business orchestrations |
| **Desktop Runtime** | Tauri v2 + Rust | `apps/desktop` | Native desktop wrapper, multi-window management, and system-level APIs |
| **Database & ORM** | Prisma + PostgreSQL (Neon Database / Local DB) | `packages/database` | Monotonically instantiated Prisma Client for transactional database operations |
| **API Contract** | OpenAPI Specs + TypeScript Contract Types | `packages/contracts` | Unified contracts for validation, API error codes, and standardized payloads |
| **Platform Adaptor** | TypeScript Native Adaptor | `packages/platform` | Decoupled cross-environment adaptor for filesystem, URLs, and clipboard access |

---

## 🚀 Quick Start

### 1. Prerequisites
Ensure you have the following installed in your local environment:
- **Node.js** (v18+)
- **pnpm** (Package manager, v8 or v9 recommended)
- **Rust Toolchain** (Only required if you want to run or build the `Tauri` desktop app)

### 2. Environment Variables
Configure `.env` files inside respective directories based on the provided `.example` templates:
1. **Database**: Create `.env` inside `packages/database/` and configure your `DATABASE_URL`.
2. **Backend**: Create `.env` inside `apps/api/` to supply your database connections and third-party API credentials.
3. **Frontend**: Create `.env` inside `apps/web/` to define the target `API_URL` and security authorization secrets.

*For more descriptive variable definitions, review `packages/database/.env.example` and `apps/api/.env.example`.*

### 3. Fullstack Setup and Development

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Generate local Prisma Client and push schemas
pnpm db:generate
pnpm db:push

# 3. Launch fullstack environment (launches Web + API concurrently via Turborepo)
pnpm dev
```
Once initialized:
- Frontend Client: `http://localhost:3000`
- Backend Hono API: `http://localhost:3001`

### 4. Run Tauri Desktop Runtime

```bash
# Bootstraps the Tauri native container, automatically launching the dependent backend APIs
pnpm dev:desktop
```

---

## 📦 Workspace Structure

```text
Thunder/
├── apps/
│   ├── web/            # Next.js frontend main app
│   ├── api/            # Hono backend RESTful API
│   └── desktop/        # Tauri v2 native desktop wrapper (Rust src-tauri)
├── packages/
│   ├── contracts/      # OpenAPI specs, error codes, and standardized ApiResponse<T>
│   ├── database/       # Prisma Schema and singleton Client initiator
│   ├── core/           # Shared basic types and ModuleRegistry mapping
│   └── platform/       # Cross-platform адаптер for native filesystem, clipboard, etc.
├── modules/            # Declared interfaces and types for modules (implementations excluded)
├── docs/               # In-depth architectural designs, API blueprints, and Cloudflare manuals
└── pnpm-workspace.yaml # Monorepo workspaces definition
```

---

## 📑 Common Commands

```bash
# Dev Modes
pnpm dev              # Runs full stack workspace in hot-reload (API + Web)
pnpm dev:api          # Runs Hono backend only (Port 3001)
pnpm dev:web          # Runs Next.js frontend only (Port 3000)
pnpm dev:desktop      # Boots up Tauri Desktop native window shell

# Quality & Validation Checks
pnpm lint             # Performs global ESLint syntax verification across packages
pnpm typecheck        # Compiles typescript static types without emission (tsc --noEmit)
pnpm build            # Builds production assets for all apps

# Database Utilities (Prisma)
pnpm db:generate      # Generates static Prisma client typings
pnpm db:push          # Pushes local schema changes directly to targeted database (Dev favorite)
pnpm db:migrate       # Runs formal database schema migrations
pnpm db:studio        # Launches local browser UI for Prisma Database visualization
```

---

## 📜 Development Guidelines & Code Standards
Please follow the explicit architectural conventions and UI standards before adding features:
- **AI Agent Guidelines**: `AGENTS.md`
- **Module Registration Rules**: `docs/module-system.md`
- **UI & Aesthetic Standards**: `docs/ui-design.md`

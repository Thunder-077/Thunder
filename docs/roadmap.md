# Thunder 路线图

## Phase 1：应用壳和页面骨架 ✅ 已完成

**目标**：搭建可运行的应用框架

- [x] 项目初始化（Next.js + TypeScript + Tailwind + shadcn/ui）
- [x] Monorepo 工作区结构（pnpm workspace + Turborepo）
- [x] 应用外壳（Sidebar + Topbar + Content）
- [x] 主题切换（浅色/深色/系统）
- [x] 模块注册机制（Manifest + Registry）
- [x] Mock 模块（待办事项、密码保险箱、AI 中心）
- [x] 基础页面（首页、模块中心、设置、404）
- [x] 基础组件（ModuleCard、EmptyState、PageHeader 等）
- [x] 设计文档

## Phase 2：Vault 模块骨架 ✅ 已完成

**目标**：搭建 Vault 密码保险箱模块的基础结构

- [x] Vault 类型定义
- [x] Repository 接口 + Dev Mock 实现
- [x] Crypto 接口 + Dev Mock 实现
- [x] 状态管理（VaultProvider + useVault）
- [x] 页面结构（创建 / 解锁 / 主页 三种状态）
- [x] UI 组件
- [x] 模块注册
- [x] 设计文档

## Phase 3：Vault 本地 MVP 流程 ✅ 已完成

**目标**：实现完整的本地密码管理 MVP 流程

- [x] IndexedDB 存储实现（VaultRepositoryIndexedDB）
- [x] 完整创建/解锁/锁定流程
- [x] 新增/编辑/删除密码条目
- [x] 复制用户名和密码
- [x] 刷新后回到锁定状态

## Phase 4：Vault 真实加密 ✅ 已完成

**目标**：替换 mock crypto 为真实安全实现

- [x] VaultCryptoWeb 实现（Web Crypto API + PBKDF2 + AES-256-GCM）
- [x] KEK/DEK 双层密钥架构
- [x] 随机 salt + 随机 nonce
- [x] 错误主密码无法解锁
- [x] VaultCryptoError 错误类型
- [x] Mock crypto 保留但不在生产路径

## Phase 5：Vault 导入导出、自动锁定、密码生成器、剪贴板保护、设置项 ✅ 已完成

**目标**：完善 Vault 的日常可用能力

- [x] 导出加密备份（密文 VaultItemRecord，非明文 VaultItemPlain）
- [x] 导入加密备份（校验 type/version/结构，二次确认覆盖）
- [x] 自动锁定（超时清空 DEK，可配置时间）
- [x] 密码生成器（crypto.getRandomValues，compact/完整两种模式）
- [x] 剪贴板保护（可选自动清理，不覆盖用户后续复制的新内容）
- [x] Vault 设置项（自动锁定、密码生成器默认参数、剪贴板保护、导入导出、危险区域）
- [x] 清空本地保险箱（二次确认，回到创建页面）

## Phase 6：SQLite 数据库迁移 ✅ 已完成

**目标**：从浏览器端 IndexedDB 迁移到服务端 SQLite

- [x] Prisma ORM 集成
- [x] SQLite 数据库 schema（app_modules + app_settings + vault_metadata + vault_items）
- [x] VaultRepositorySQLite 实现
- [x] 服务端 API 层（/api/vault/*）
- [x] 前端 VaultApiClient
- [x] VaultProvider 改用 API Client
- [x] 数据库演进路线文档

## Phase 7：前后端分离架构调整 ✅ 已完成

**目标**：确立 TypeScript-first + 前后端分离 + 契约优先的长期架构基调

- [x] apps/api 独立后端服务（Hono）
- [x] packages/contracts API 契约（OpenAPI + ApiResponse + 错误码）
- [x] packages/api-client 前端 API 客户端
- [x] modules/vault 共享类型包
- [x] 前端通过 API Client 调用 apps/api
- [x] Next.js rewrites 代理 /api/v1/* 到 apps/api
- [x] 前端不再直接访问数据库
- [x] API 路径统一 /api/v1 前缀
- [x] 统一响应格式 ApiResponse<T>
- [x] services/ 目录预留多语言服务规则
- [x] Vault 功能不回退
- [x] 架构文档更新

## Phase 8：数据库演进和模块系统

**目标**：数据库迁移到 PostgreSQL / MySQL，完善模块系统

- [ ] SQLite → PostgreSQL / MySQL 迁移
- [ ] 完善待办事项模块（本地持久化）
- [ ] 模块启用/禁用开关
- [ ] 模块设置页面（基于 settingsSchema 生成）
- [ ] 模块数据隔离
- [ ] 全局命令面板（CmdK）
- [ ] 搜索功能

## Phase 9：PWA 和离线能力

**目标**：让应用可以离线使用

- [ ] PWA manifest 和 service worker
- [ ] 离线缓存策略
- [ ] 安装到桌面支持
- [ ] 离线数据缓存
- [ ] 推送通知（可选）

## Phase 10：可选桌面端 Tauri

**目标**：提供原生桌面体验

- [ ] Tauri 集成
- [ ] 系统托盘
- [ ] 全局快捷键
- [ ] 原生文件系统访问
- [ ] 自动更新

## Phase 11：高级能力

**目标**：扩展生态和安全能力

- [ ] Argon2id KDF（WASM）
- [ ] 可选 Tauri 系统密钥链集成
- [ ] 浏览器自动填充（WebExtension）
- [ ] 泄露检测（Have I Been Pwned）
- [ ] 模块独立包和动态加载
- [ ] 插件 API 和第三方模块
- [ ] 模块市场
- [ ] AI 账号管理和额度查看

## Phase 12：多语言服务（按需引入）

**目标**：在明确需要时引入非 TypeScript 服务

**条件**：只有在以下情况才引入：
- 用户明确指定该模块使用某种语言
- TypeScript 明显不适合该功能
- 该功能强依赖 Python / Java / Rust 等生态

**可能的服务**：
- Python AI Worker（AI/ML、OCR、数据分析）
- Rust System Worker（系统级能力、高性能计算）

**规则**：
- 必须放在 services/ 目录
- 必须通过 apps/api 编排
- 前端不得直接调用
- 必须在 docs/decision-records.md 中记录决策

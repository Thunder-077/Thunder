# AGENTS.md

修改此项目时必须遵守以下规则。

## TypeScript-first 原则

- 所有代码默认使用 TypeScript
- 前端页面、组件、模块逻辑、API Client、Service、Repository、类型定义、工具函数均使用 TypeScript
- 后端默认使用 TypeScript（apps/api）
- 新增非 TypeScript 服务必须满足以下条件之一：
  - 用户明确指定该模块使用某种语言
  - TypeScript 明显不适合该功能
  - 该功能强依赖 Python / Java / Rust 等生态（如 AI/ML、OCR、企业 Java SDK、系统级能力）
- 新增非 TypeScript 服务时，必须在 docs/decision-records.md 中记录原因、边界和替代方案

## 前后端边界

- apps/web 只负责前端页面、路由、UI 和 API Client
- apps/api 负责后端 API 服务、数据库访问、业务编排
- 前端不得直接访问 SQLite / ORM / Repository / 数据库连接
- 前端不得直接调用 Python / Java / Rust 等多语言服务
- 所有外部 API 统一由 apps/api 暴露
- 前端通过 packages/api-client 调用 apps/api
- 数据库访问只能发生在 apps/api、Repository 层或 packages/database 侧
- 数据库实现细节不得泄漏到 apps/web

## apps/web 和 apps/api 职责

### apps/web

- Next.js 前端应用
- 页面、路由、UI 组件
- API Client（通过 @thunder/api-client）
- 客户端状态管理（React Context + useState）
- 客户端加密（如 Vault 的 vaultCrypto）
- 通过 Next.js rewrites 代理 /api/v1/* 到 apps/api

### apps/api

- Hono 后端 API 服务
- REST API 路由（/api/v1/*）
- 数据库访问（通过 Repository + Prisma）
- 业务逻辑编排
- 多语言服务接入和转发（未来）
- 认证和授权（未来）

## modules / packages / services 的职责边界

### modules/*

- 业务模块的共享类型和接口定义
- 前后端共用的类型（如 VaultMetadata、VaultItemRecord）
- Repository 接口（IVaultRepository）
- Crypto 接口（IVaultCrypto）
- 不包含具体实现（实现分别在 apps/web 和 apps/api 中）

### packages/*

- contracts：API 契约（OpenAPI、JSON Schema、ApiResponse、错误码）
- api-client：前端调用 apps/api 的客户端（ThunderClient、VaultClient）
- database：Prisma + 数据库 schema + Client 单例
- core：核心类型和模块注册系统
- ui：共享 UI 组件（预留）
- config：共享配置
- platform：平台能力（预留）

### services/*

- 非 TypeScript 独立服务（Python / Java / Rust 等）
- 当前只保留 README.md，不实际创建服务
- 非 TypeScript 服务只能通过 apps/api 接入主系统
- 前端不得直接调用这些服务
- modules 和 packages 不得依赖这些服务的内部实现
- 每次新增非 TypeScript 服务，必须在 docs/decision-records.md 中记录

## 多语言服务接入规则

- 当前不要实际创建 Python / Java / Rust 服务，除非已有明确业务需要
- 未来新增非 TypeScript 服务时，必须位于 services/ 目录
- 非 TypeScript 服务必须作为独立 service 存在
- 非 TypeScript 服务只能通过 HTTP API、RPC 或消息队列接入 apps/api
- 前端不得直接调用这些服务
- modules 和 packages 不得依赖这些服务的内部实现
- 主系统仍然保持 TypeScript 类型、接口和模块注册的一致性
- 多语言 service 不得破坏现有 apps、packages、modules 的边界
- 每次新增非 TypeScript 服务，必须在 docs/decision-records.md 中记录：
  - 引入原因
  - 为什么 TypeScript 不适合
  - 服务边界
  - 通信方式
  - 替代方案
  - 对部署和维护的影响

## API 契约优先规则

- API 契约优先：先定义契约，再实现
- REST API 必须使用 OpenAPI 描述（packages/contracts/openapi/）
- API 路径统一使用 /api/v1 前缀
- API 响应统一使用 ApiResponse<T>（packages/contracts）
- 错误码统一管理（ApiErrorCode）
- 分页结构统一管理（PaginatedData<T>）
- 前端只调用 apps/api，不直接调用数据库、不直接调用多语言服务
- 多语言服务不能直接暴露给前端
- 服务之间通信后续可以预留 HTTP / gRPC / 消息队列
- 暂时不要引入复杂微服务治理、服务发现、Kubernetes
- 当前仍以 Docker Compose 和本地开发体验优先

## 数据库访问规则

- 当前所有模块先使用 SQLite 作为过渡数据库
- 后续需要可以平滑替换为 PostgreSQL / MySQL
- packages/database 负责数据库基础能力（Prisma Client、schema）
- 所有业务模块必须通过 Service / Repository 访问数据
- 页面、组件、前端模块不得直接访问 SQLite、ORM、SQL 或数据库连接
- 数据库 schema 修改必须同步更新文档和迁移文件
- 新模块新增表时要考虑未来 PostgreSQL / MySQL 兼容
- 数据库操作通过 apps/api 的 API 层暴露给前端
- 数据库实现细节不得泄漏到 apps/web

## 模块化

- 保持模块化边界，主应用只负责外壳、布局、导航、全局设置
- 具体业务逻辑必须放在对应模块中，不要写死在主应用
- 新增模块必须通过 Manifest 注册到 ModuleRegistry
- 模块间不直接共享状态，数据通过独立 key 隔离
- modules/* 中的共享类型前后端均可引用
- 前端模块代码放在 apps/web/src/modules/ 中
- 后端模块代码放在 apps/api/src/modules/ 中

## 依赖管理

- 不要过早引入复杂依赖
- 新增依赖前评估是否必要，优先使用已有依赖
- 不要引入微前端框架
- 不要引入复杂状态管理库（如 Redux、MobX），优先使用 React Context + useState
- 不要引入真实后端框架（apps/api 使用 Hono 轻量框架）

## 页面和布局

- 新增页面必须符合现有布局（AppShell + Sidebar + Topbar + Content）
- 简单模块页面放在 `src/app/modules/{id}/` 目录下
- 复杂模块可以有独立路由（如 `src/app/vault/`）和模块代码目录（如 `src/modules/vault/`）
- 使用 PageHeader 组件作为页面标题
- 使用 EmptyState 组件作为空状态

## UI 和样式

- 使用 shadcn/ui 组件，不要引入其他 UI 库
- 使用 lucide-react 图标，不要引入其他图标库
- 遵循 docs/ui-design.md 中的设计规范
- 修改 UI 时同步更新 docs/ui-design.md
- 保持极简风格：大量留白、低饱和配色、轻边框、柔和阴影、圆角卡片

## 模块系统

- 修改模块机制时同步更新 docs/module-system.md
- 模块 Manifest 必须包含所有必填字段
- 模块图标使用 lucide-react 图标名

## Vault 模块

- Vault 明文数据不能发送给 apps/api
- Vault 加密仍然必须在客户端完成
- apps/api 只能接收和保存 VaultMetadata / VaultItemRecord 的密文结构
- SQLite 中不能保存明文 title、username、password、url、notes、tags
- dataKey / DEK 不能持久化到 localStorage、sessionStorage、IndexedDB 或 SQLite，只能存在内存中
- 主密码不能保存
- 服务端不能接触明文密码
- 页面组件禁止直接访问 localStorage、IndexedDB 或 SQLite，必须通过 API Client
- 页面组件禁止直接调用加密实现，必须通过 Crypto 接口
- 页面组件禁止直接拼装 VaultItemRecord
- 页面组件禁止直接解析 encryptedPayload
- VaultItemPlain 禁止直接持久化，必须通过 encryptVaultItem 转为 VaultItemRecord 后存储
- 禁止明文落库：不要把明文密码写入 localStorage、IndexedDB 或 SQLite
- 禁止 mock crypto 进入生产路径：VaultProvider 必须使用 VaultCryptoWeb
- 每次加密必须使用新 nonce，禁止复用 nonce
- 不要在代码里硬编码真实主密码、真实 salt、真实 nonce 或真实密钥
- 如果使用 mock 数据或 mock crypto，必须明确标注「仅用于开发，不可用于生产」
- 修改 Vault 设计时同步更新 docs/vault-design.md
- 不要实现真实密码管理、真实密钥存储、真实账号爬取等敏感功能，除非后续任务明确要求
- Vault 模块导出只能默认导出密文备份
- Vault 模块导入必须校验备份结构并二次确认覆盖
- Vault 模块剪贴板清理不得覆盖用户后续复制的新内容
- Vault 模块不得绕过 vaultCrypto
- Vault API 只处理密文记录，不处理明文密码
- Vault 功能不能回退

## 安全

- 不要在代码中硬编码任何密钥或敏感信息

## 代码质量

- TypeScript 类型要清晰，避免 any
- 组件命名要语义化
- 不要写大段无用 mock 数据
- 不要一次性实现太多业务功能
- 不要生成复杂、难维护的抽象
- 保持文件结构清晰

## 完成任务后

- 说明修改了哪些文件
- 能运行检查时运行 lint / typecheck / build
- 如果修改了设计相关内容，同步更新对应文档

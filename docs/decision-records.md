# Thunder 技术决策记录

## ADR-001：先 Web 而不是直接桌面

**背景**：应用需要同时支持 Web 和桌面端。

**决策**：先实现 Web 版本，后续通过 Tauri 包装为桌面应用。

**理由**：
- Web 是最低门槛的运行环境，无需安装即可使用
- Web 开发调试效率最高，热更新、DevTools 等工具成熟
- Tauri 可以将 Web 应用无缝包装为桌面应用，迁移成本极低
- 先做好 Web 版本可以更快验证产品方向
- 避免过早引入 Tauri 的构建复杂度

## ADR-002：暂时不上微前端

**背景**：应用采用模块化架构，模块可能需要独立开发部署。

**决策**：当前阶段不使用微前端方案（Module Federation、qiankun 等）。

**理由**：
- 当前是个人项目，模块数量有限，不需要独立部署
- 微前端引入的复杂度（样式隔离、JS 沙箱、通信机制）远大于收益
- Next.js App Router 的路由拆分已经提供了足够的代码分割
- 模块通过 Manifest 注册的机制已经实现了逻辑解耦
- 如果未来需要，可以从模块独立包逐步演进到微前端

## ADR-003：采用 TypeScript-first 原则

**背景**：项目需要确定长期技术路线，前后端语言选择影响深远。

**决策**：业务/应用层默认使用 TypeScript；平台壳和明确不适合 TypeScript 的场景允许使用其他语言。

**理由**：
- TypeScript 提供端到端类型安全，前后端共享类型定义减少不一致
- 项目已有完整的 TypeScript 前端代码，后端也使用 TypeScript 可以最大化代码复用
- TypeScript 生态成熟，Node.js 后端框架（Hono、Fastify、Express）均有良好支持
- 共享类型包（modules/*）可以同时被前端和后端引用
- 统一语言降低心智负担，个人项目不需要维护多语言构建链
- 只有在 TypeScript 明显不适合时（AI/ML、企业 Java SDK、系统级能力、原生平台能力）才引入其他语言

**影响**：
- 后端使用 Hono（TypeScript 轻量框架）而非 Spring Boot 或 Django
- 所有 API 契约、类型定义、工具函数默认 TypeScript
- 非 TypeScript 独立服务放在 services/ 目录，通过 apps/api 编排
- Tauri 的 Rust `src-tauri` 属于平台壳 / 原生运行时层，不视为对 TypeScript-first 原则的违背

## ADR-004：新增 apps/api 作为独立后端

**背景**：之前 API 路由嵌入在 Next.js 的 app/api 目录中，前后端耦合。

**决策**：新增 apps/api 作为独立后端 API 服务，使用 Hono 框架。

**理由**：
- 前后端分离：apps/web 只负责 UI，apps/api 只负责 API 和数据访问
- 独立部署：apps/api 可以独立扩展、独立部署
- 技术选型灵活：后端可以独立选择框架、中间件、部署方式
- 数据库隔离：PostgreSQL/Prisma 只在 apps/api 中使用，前端不接触数据库
- 多语言服务接入：未来 Python/Java/Rust 服务只能通过 apps/api 编排
- Hono 轻量高效：TypeScript 原生、Edge-first、中间件生态丰富
- Next.js rewrites 代理：前端通过 /api/v1/* 代理到 apps/api，开发体验一致

**影响**：
- 本地开发需要同时启动 apps/api（端口 3001）和 apps/web（端口 3000）
- API 路径统一使用 /api/v1 前缀
- 所有 API 响应统一使用 ApiResponse<T> 格式
- 前端通过 @thunder/api-client 调用后端

## ADR-005：前端不能直接访问数据库

**背景**：之前前端代码可以直接导入 @thunder/database 访问 Prisma Client。

**决策**：前端不得直接访问 PostgreSQL / Prisma / 数据库连接，必须通过 API Client 调用 apps/api。

**理由**：
- 安全性：数据库连接字符串、SQL 查询不应暴露给浏览器
- 架构清晰：前端只关心 UI 和 API 调用，后端只关心数据访问和业务逻辑
- 可维护性：数据库 schema 变更只影响 apps/api，前端无感知
- 可替换性：未来切换 PostgreSQL / MySQL 时，前端代码无需修改
- 多端适配：未来 Tauri 桌面端、移动端都可以通过 API 访问数据
- Vault 安全：确保明文密码不会通过数据库连接泄漏到前端

**影响**：
- apps/web 不再依赖 @thunder/database
- 所有数据库操作通过 apps/api 的 API 路由暴露
- 前端通过 @thunder/api-client 调用 API

## ADR-006：多语言服务暂不提前引入

**背景**：项目未来可能需要 Python（AI/ML）、Java（企业 SDK）、Rust（系统级能力）等服务。

**决策**：当前不实际创建任何非 TypeScript 服务，只在 services/ 目录保留 README.md 说明规则。

**理由**：
- YAGNI 原则：不要为"可能以后需要"而提前引入复杂度
- 当前所有功能都可以用 TypeScript 实现
- 提前引入多语言服务会增加构建、部署、维护成本
- 多语言服务需要独立的运行时、依赖管理、CI/CD 流程
- 通过 apps/api 编排的架构已经预留了多语言服务接入路径

**未来引入条件**：
- 用户明确指定该模块使用某种语言
- TypeScript 明显不适合该功能
- 该功能强依赖 Python / Java / Rust 等生态

**典型场景**：
- AI/机器学习 → Python（PyTorch、TensorFlow 生态）
- OCR → Python（Tesseract、PaddleOCR 生态）
- 企业系统集成 → Java（Spring、企业 SDK 生态）
- 系统级能力 → Rust（性能、内存安全）

**接入边界**：
- 非 TypeScript 服务必须位于 services/ 目录
- 非 TypeScript 服务只能通过 HTTP API / RPC / 消息队列接入 apps/api
- 前端不得直接调用这些服务
- modules 和 packages 不得依赖这些服务的内部实现
- 每次新增非 TypeScript 服务，必须在本文件中记录决策

**替代方案**：
- AI 功能：可以先用 TypeScript + HTTP API 调用外部 AI 服务（OpenAI API 等），不需要自建 Python 服务
- 数据分析：可以先用 TypeScript + SQL 实现，复杂分析再引入 Python
- 企业集成：可以先用 TypeScript + HTTP API 对接，Java SDK 需求明确后再引入

## ADR-007：先做模块壳而不是直接做具体功能

**背景**：应用规划了多个功能模块（待办、密码管理、AI 管理等）。

**决策**：先搭建模块化框架和页面骨架，不实现完整业务功能。

**理由**：
- 模块化框架是所有功能的基础，必须先稳定
- 过早实现具体功能会导致框架设计被业务逻辑绑架
- 框架先行可以确保各模块的接入方式一致
- Mock 模块足以验证导航和页面结构
- 具体功能可以在稳定的框架上逐步添加

## ADR-008：使用 pnpm Workspace + Turborepo

**背景**：项目需要管理多个包（主应用、核心库、UI 组件等）。

**决策**：使用 pnpm workspace 管理 monorepo 结构，Turborepo 管理构建编排和缓存。

**理由**：
- pnpm 的 workspace 协议天然支持 monorepo
- 符号链接机制比 npm/yarn 的文件复制更高效
- 严格的依赖隔离避免幽灵依赖
- 与 Next.js 的 transpilePackages 配合良好
- Turborepo 提供任务编排（依赖感知的并行执行）和本地缓存
- Turborepo 配置简单，零侵入，只需 turbo.json + 根脚本委托
- 未来可接入远程缓存（Vercel Remote Cache）进一步加速 CI

## ADR-009：使用 Tailwind CSS v4 + shadcn/ui

**背景**：需要选择 UI 样式方案。

**决策**：使用 Tailwind CSS v4 + shadcn/ui（base-nova 风格）。

**理由**：
- Tailwind CSS v4 性能更好，配置更简洁
- shadcn/ui 提供高质量、可定制的组件
- base-nova 风格更简洁，符合极简设计目标
- 组件代码完全可控，不依赖第三方运行时
- 与 lucide-react 图标库天然集成

## ADR-010：API 契约优先

**背景**：前后端分离后，需要确保 API 接口一致性。

**决策**：API 契约先于实现定义，使用 OpenAPI 描述 REST API。

**理由**：
- 契约优先确保前后端对 API 接口的理解一致
- OpenAPI 是 REST API 的行业标准，工具链成熟
- 可以从 OpenAPI 规范生成文档、类型、Mock 服务
- 统一响应格式（ApiResponse<T>）和错误码减少前后端沟通成本
- packages/contracts 作为单一事实来源，前后端都依赖它

**影响**：
- 新增 API 时先写 OpenAPI 规范，再实现
- 所有 API 响应使用 ApiResponse<T> 格式
- 错误码统一管理在 packages/contracts 中
- API 路径统一使用 /api/v1 前缀

## ADR-011：使用 Hono 作为后端框架

**背景**：apps/api 需要选择后端框架。

**决策**：使用 Hono 作为 apps/api 的后端框架。

**理由**：
- TypeScript 原生支持，类型安全
- 轻量高效，启动快，适合个人项目
- 中间件生态丰富（CORS、Logger、JWT 等）
- 支持 Node.js / Bun / Deno / Edge Runtime 多运行时
- 与 @hono/node-server 配合，可以运行在标准 Node.js 环境
- API 风格简洁，学习成本低

**替代方案**：
- Express：老牌稳定，但类型安全不如 Hono
- Fastify：性能好，但配置较重
- Nest.js：功能全面，但对个人项目过于复杂
- tRPC：端到端类型安全，但与 OpenAPI 契约优先理念冲突

## ADR-012：将 FunASR 作为桌面端托管的本地语音识别服务

**背景**：提词器的 Web Speech API 中文连续识别不稳定，需要更可控的本地中文 ASR 能力。

**决策**：新增 `services/funasr/` 作为 Thunder 管理的 FunASR 服务工作区。桌面端启动时自动尝试启动本地 FunASR WebSocket 服务，前端提词器通过 WebSocket 连接该服务。

**理由**：
- FunASR 属于 AI/语音识别能力，TypeScript 不适合直接实现模型推理。
- 桌面端可以安全启动和回收本机子进程，适合托管本地 ASR 服务。
- 纯 Web 端不能启动本机进程，只能连接用户已经启动且允许访问的 WebSocket 服务。
- FunASR 服务与业务 UI 解耦，后续可替换为 Deepgram、OpenAI 或其他 provider。

**影响**：
- `services/funasr/` 保存启动器和本地 FunASR 工作区说明，不把模型文件提交进仓库。
- 桌面端启动时如果检测到 FunASR 服务脚本，会启动 `127.0.0.1:10095`；检测不到则跳过，不阻塞主应用。
- 纯 Web 端不启动 FunASR，提词器自动使用 Web Speech。
- 当前安装包只包含启动器和工作区，不包含上游 FunASR 仓库、Python 运行时、模型和依赖；如需他人安装后开箱即用，需要单独设计 runtime/vendor 打包流程。
- 前端仍只依赖语音 provider 抽象，不依赖 FunASR 内部实现。

## ADR-013：将 sherpa-onnx 作为可选本地 ASR 引擎，并由桌面端直连运行时管理模型

**背景**：提词器除了 FunASR 之外，还需要一个更轻量、可由用户自行选择下载模型的本地识别引擎。

**决策**：新增 `services/sherpa-onnx/` 作为 Thunder 托管的 `sherpa-onnx` 模型与下载工作区。桌面端使用 Rust `sherpa-onnx` 运行时直接加载模型并接收前端音频流，不再依赖 Python WebSocket sidecar。

**理由**：
- `sherpa-onnx` 提供了适合桌面端本地运行的 ONNX 语音识别能力，适合作为 FunASR 之外的可选 provider。
- 模型体积和类型差异较大，应该由用户按需下载，而不是打进仓库或默认安装包。
- 模型选择、下载和激活放在桌面端命令层，可以保持 Web UI 简洁，不让前端直接处理文件系统和下载细节。
- 识别链路改为 `AudioWorklet -> Tauri invoke -> Rust sherpa runtime`，比 `WebSocket sidecar` 更短，故障点更少。
- Provider 继续走提词器已有抽象，跟读算法层不绑定具体引擎实现。

**影响**：
- `services/sherpa-onnx/` 保存模型目录和历史调试脚本说明，不提交模型文件。
- 桌面端新增 sherpa-onnx 模型列表、下载、激活和直连识别命令。
- 模型文件下载到用户本地应用数据目录，而不是资源目录，避免安装包只读限制。
- 前端提词器在现有 provider 选择区增加 sherpa-onnx 和模型选择入口，不大改主页面结构。

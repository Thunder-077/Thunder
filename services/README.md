# Services

此目录用于存放非 TypeScript 的独立服务。

## 规则

1. 当前不创建任何非 TypeScript 服务，除非有明确的业务需要。
2. 未来新增非 TypeScript 服务时，必须位于此目录下。
3. 非 TypeScript 服务只能通过 `apps/api` 接入主系统。
4. 前端不得直接调用这些服务。
5. `modules` 和 `packages` 不得依赖这些服务的内部实现。
6. 每次新增非 TypeScript 服务，必须在 `docs/decision-records.md` 中记录。

## 未来可能的服务

| 目录 | 语言 | 场景 | 触发条件 |
|------|------|------|----------|
| `funasr/` | Python | 本地语音识别 WebSocket 服务 | 桌面提词器需要稳定中文 ASR |
| `python-ai-worker/` | Python | AI/机器学习、复杂数据分析 | TypeScript 明显不适合时 |
| `rust-system-worker/` | Rust | 系统级能力、高性能计算 | Tauri 桌面端需要时 |

## 通信方式

- HTTP API（默认）
- gRPC（高性能场景）
- 消息队列（异步场景）

# Thunder API 设计规范

## 概述

Thunder 的 API 采用 **契约优先** 的设计原则，所有 API 必须先定义契约（OpenAPI），再实现代码。

## API 架构

### 基础路径

所有 API 统一使用 `/api/v1` 前缀：

```
http://localhost:3001/api/v1/vault/metadata
http://localhost:3001/api/v1/vault/items
```

### 前端代理

本地开发时，apps/web 通过 Next.js rewrites 代理 API 请求：

```
浏览器 → /api/v1/* → Next.js rewrites → http://localhost:3001/api/v1/*
```

前端代码使用相对路径 `/api/v1` 即可，无需硬编码后端地址。

## 统一响应格式

### ApiResponse<T>

所有 API 响应统一使用 `ApiResponse<T>` 格式：

```typescript
interface ApiResponse<T> {
  ok: boolean
  data: T
  error?: {
    code: string
    message: string
  }
}
```

### 成功响应

```json
{
  "ok": true,
  "data": {
    "metadata": { ... }
  }
}
```

### 错误响应

```json
{
  "ok": false,
  "data": undefined,
  "error": {
    "code": "VAULT_NOT_FOUND",
    "message": "保险箱不存在"
  }
}
```

### 空数据成功响应

```json
{
  "ok": true,
  "data": null
}
```

## 统一错误码

### 通用错误码

| 错误码 | HTTP 状态码 | 说明 |
|--------|------------|------|
| NOT_FOUND | 404 | 资源不存在 |
| VALIDATION_ERROR | 400 | 请求参数校验失败 |
| INTERNAL_ERROR | 500 | 服务器内部错误 |
| UNAUTHORIZED | 401 | 未认证 |
| FORBIDDEN | 403 | 无权限 |
| CONFLICT | 409 | 资源冲突 |

### Vault 模块错误码

| 错误码 | HTTP 状态码 | 说明 |
|--------|------------|------|
| VAULT_NOT_FOUND | 404 | 保险箱不存在 |
| VAULT_ITEM_NOT_FOUND | 404 | 条目不存在 |
| VAULT_MISSING_VAULT_ID | 400 | 缺少 vaultId 参数 |
| VAULT_SAVE_FAILED | 500 | 保存失败 |
| VAULT_CLEAR_FAILED | 500 | 清空失败 |

### 新增模块错误码

新增模块时，在 `packages/contracts/src/error-codes.ts` 中添加模块级错误码常量，并在 `ApiErrorCode` 类型中扩展。

## 统一分页结构

```typescript
interface PaginatedData<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
```

分页 API 响应示例：

```json
{
  "ok": true,
  "data": {
    "items": [...],
    "total": 100,
    "page": 1,
    "pageSize": 20
  }
}
```

## API 契约管理

### OpenAPI 规范

所有 REST API 必须使用 OpenAPI 3.0 描述，规范文件位于 `packages/contracts/openapi/` 目录。

### 当前 OpenAPI 文件

- `vault.yaml` — Vault 模块 API 规范

### 新增 API 流程

1. 在 `packages/contracts/openapi/` 中新增或更新 OpenAPI 规范
2. 在 `packages/contracts/src/` 中新增错误码（如需要）
3. 在 `apps/api/src/modules/` 中实现 API 路由
4. 在 `packages/api-client/src/modules/` 中实现 API Client
5. 在 `apps/web` 中通过 API Client 调用

## API Client 架构

### ThunderClient 基类

```typescript
class ThunderClient {
  protected baseUrl: string
  protected async get<T>(path: string): Promise<T>
  protected async put<T>(path: string, body?: unknown): Promise<T>
  protected async post<T>(path: string, body?: unknown): Promise<T>
  protected async del<T>(path: string): Promise<T>
}
```

### 模块级客户端

每个模块有自己的客户端类，继承 ThunderClient：

```typescript
class VaultClient extends ThunderClient {
  async getMetadata(): Promise<VaultMetadata | null>
  async saveMetadata(metadata: VaultMetadata): Promise<void>
  async listItems(vaultId: string): Promise<VaultItemRecord[]>
  // ...
}
```

### 工厂函数

```typescript
const clients = createApiClients()
clients.vault.getMetadata()
```

### 错误处理

API Client 在请求失败时抛出 `ThunderApiError`：

```typescript
class ThunderApiError extends Error {
  readonly code: string
  readonly status: number
}
```

## Vault API 规范

### 安全约束

- Vault API 只处理密文记录（VaultItemRecord），不处理明文密码
- 明文数据不能发送给 apps/api
- 加密必须在客户端完成
- 服务端不能接触明文密码

### API 端点

| 方法 | 路径 | 说明 | 请求体 | 响应 |
|------|------|------|--------|------|
| GET | /api/v1/vault/metadata | 获取保险箱元信息 | - | `{ metadata: VaultMetadata \| null }` |
| PUT | /api/v1/vault/metadata | 保存保险箱元信息 | `{ metadata: VaultMetadata }` | null |
| GET | /api/v1/vault/items?vaultId= | 获取条目列表（密文） | - | `{ items: VaultItemRecord[] }` |
| GET | /api/v1/vault/items/:id | 获取单个条目（密文） | - | `{ item: VaultItemRecord \| null }` |
| PUT | /api/v1/vault/items/:id | 保存条目（密文） | `{ record: VaultItemRecord }` | null |
| DELETE | /api/v1/vault/items/:id | 删除条目（软删除） | - | null |
| POST | /api/v1/vault/clear | 清空保险箱 | - | null |

## 新增模块 API 指南

1. 在 `packages/contracts/openapi/` 中创建模块的 OpenAPI 规范
2. 在 `packages/contracts/src/` 中添加错误码
3. 在 `modules/` 中创建共享类型包（如需要前后端共享类型）
4. 在 `apps/api/src/modules/` 中实现路由和 Repository
5. 在 `packages/api-client/src/modules/` 中实现客户端
6. 在 `apps/web` 中通过 API Client 调用
7. 更新 `packages/api-client/src/index.ts` 导出新客户端

# Thunder 数据库设计

## 概述

Thunder 当前使用 Prisma ORM 访问关系型数据库。项目已切换到 PostgreSQL 连接方式，推荐使用 Neon 这类托管 PostgreSQL；SQLite 仍可作为历史本地开发方案参考。

## 当前方案：PostgreSQL（Neon）+ Prisma

### 为什么当前推荐 PostgreSQL（Neon）

1. **更适合部署**：数据库通过网络连接访问，适合公网和云环境
2. **与 Prisma 兼容稳定**：无需改变现有 Repository / API 分层
3. **便于后续 Cloudflare / Serverless 部署**：不依赖本地磁盘数据库文件
4. **仍保留迁移弹性**：后续仍可迁移到其他 PostgreSQL / MySQL 服务

### 数据库连接方式

- **当前推荐**：通过 `DATABASE_URL` 连接托管 PostgreSQL（如 Neon）
- **本地历史数据**：`data/app.db`（项目根目录下）仍可作为旧 SQLite 数据来源
- **生产部署**：统一通过 `DATABASE_URL` 环境变量配置

### 数据库访问架构

```
前端组件 → @thunder/api-client → /api/v1/* → apps/api → Repository → Prisma → PostgreSQL
```

- 前端不得直接访问 SQLite / Prisma / 数据库连接
- 数据库访问只能发生在 apps/api 和 Repository 层
- packages/database 提供 Prisma Client 单例，供 apps/api 使用

## 数据库 Schema

### app_modules

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PRIMARY KEY | 模块 ID |
| name | TEXT NOT NULL | 模块名称 |
| enabled | BOOLEAN DEFAULT TRUE | 是否启用 |
| settings_json | TEXT | 模块设置 JSON |
| created_at | TEXT NOT NULL | 创建时间 |
| updated_at | TEXT NOT NULL | 更新时间 |

### app_settings

| 字段 | 类型 | 说明 |
|------|------|------|
| key | TEXT PRIMARY KEY | 设置键 |
| value_json | TEXT NOT NULL | 设置值 JSON |
| created_at | TEXT NOT NULL | 创建时间 |
| updated_at | TEXT NOT NULL | 更新时间 |

### vault_metadata

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PRIMARY KEY | 保险箱 ID |
| version | INTEGER NOT NULL | 版本号 |
| kdf_json | TEXT NOT NULL | KDF 参数 JSON（VaultKdfParams） |
| encrypted_data_key_json | TEXT NOT NULL | 加密的 DEK |
| created_at | TEXT NOT NULL | 创建时间 |
| updated_at | TEXT NOT NULL | 更新时间 |

### vault_items

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PRIMARY KEY | 条目 ID |
| vault_id | TEXT NOT NULL | 所属保险箱 ID |
| encrypted_payload_json | TEXT NOT NULL | 加密载荷 JSON（EncryptedPayload） |
| created_at | TEXT NOT NULL | 创建时间 |
| updated_at | TEXT NOT NULL | 更新时间 |

### emby_playlist

| 字段 | 类型 | 说明 |
|------|------|------|
| slug | TEXT PRIMARY KEY | 片单标识 |
| name | TEXT NOT NULL | 片单名称 |
| description | TEXT NOT NULL | 片单描述 |
| cover | TEXT NOT NULL | 封面地址 |
| tags_json | TEXT NOT NULL | 标签 JSON |
| point | INTEGER NOT NULL | 片单积分 |
| is_public | BOOLEAN NOT NULL | 是否公开 |
| is_show_empty | BOOLEAN NOT NULL | 是否显示空片单 |
| enabled | BOOLEAN NOT NULL | 是否启用 |
| limit | INTEGER NOT NULL | 抓取数量 |
| release_window_days | INTEGER NOT NULL | 时间窗口 |
| remote_watch_id | INTEGER | Emos 远端片单 ID |
| last_emos_sync_signature | TEXT | 上次同步到 Emos 的元数据签名 |
| created_at | TEXT NOT NULL | 创建时间 |
| updated_at | TEXT NOT NULL | 更新时间 |

### emby_watch_cache

| 字段 | 类型 | 说明 |
|------|------|------|
| slug | TEXT PRIMARY KEY | 片单标识 |
| feed_json | TEXT NOT NULL | 当前缓存的动态片单 JSON |
| count | INTEGER NOT NULL | 当前缓存的视频数量 |
| generated_at | TEXT NOT NULL | 当前缓存生成时间 |
| created_at | TEXT NOT NULL | 创建时间 |
| updated_at | TEXT NOT NULL | 更新时间 |

### emby_watch_refresh_task

| 字段 | 类型 | 说明 |
|------|------|------|
| slug | TEXT PRIMARY KEY | 片单标识 |
| status | TEXT NOT NULL | 刷新状态（refreshing/completed/failed） |
| state_json | TEXT NOT NULL | 分段刷新游标和已收集结果 |
| error_message | TEXT | 最近一次刷新错误 |
| created_at | TEXT NOT NULL | 创建时间 |
| updated_at | TEXT NOT NULL | 更新时间 |

Emby 模块的核心配置（publicBaseUrl、emosBaseUrl、emosToken、tmdbApiKey）从环境变量读取，数据库中不再存储这些敏感信息。片单配置通过环境变量配置，页面上不允许修改。Emby 热门片单缓存通过 `emby_watch_cache` 与 `emby_watch_refresh_task` 两张专用表管理，不复用 `app_settings`。刷新任务每 10 分钟推进一次，并会在现有缓存 12 小时有效期到达前提前开启新一轮刷新，确保旧缓存可继续服务，直到新缓存完整生成。每次定时推进只处理 1 个片单，优先续跑未完成任务，避免多个片单在同一次 Cloudflare Worker 调用中叠加 TMDB 子请求。

## Vault 安全约束

- vault_items 中只保存加密后的 VaultItemRecord
- 不允许保存 VaultItemPlain
- 不允许保存明文 title、username、password、url、notes、tags
- encrypted_payload_json 保存密文结构（algorithm、nonceBase64、ciphertextBase64）
- kdf_json 保存 VaultKdfParams 结构
- encrypted_data_key_json 保存加密的 DEK
- dataKey / DEK 不能持久化到任何存储
- 主密码不能保存

## 删除策略

- 删除条目使用物理删除
- clearVault 使用物理删除（DELETE ALL）

## 数据库切换路径

### SQLite → PostgreSQL / MySQL

```
历史：SQLite (file:./data/app.db)
  ↓ 修改 prisma/schema.prisma provider + DATABASE_URL
当前：PostgreSQL（Neon 等）
```

切换步骤：
1. 修改 `packages/database/prisma/schema.prisma` 中的 `provider`
2. 修改 `DATABASE_URL` 环境变量
3. 运行 `prisma db push` 或 `prisma migrate dev` 同步 schema
4. 页面和业务代码无需修改

### 兼容性注意事项

- 新增表时避免使用 SQLite 特有语法
- 时间字段使用 TEXT（ISO 8601）而非 SQLite 的 datetime 函数
- JSON 字段使用 TEXT 存储，应用层解析
- 不使用 SQLite 特有的全文搜索语法
- Prisma 的抽象层已经屏蔽了大部分数据库差异

## Prisma 配置

### Schema 位置

`packages/database/prisma/schema.prisma`

### Client 单例

`packages/database/src/client.ts` — 使用全局单例模式，避免开发环境热更新时创建多个连接。

### 环境变量

- `DATABASE_URL`：数据库连接字符串
- PostgreSQL 示例：`postgresql://user:password@host:5432/thunder?sslmode=require`
- SQLite 历史示例：`file:./data/app.db`

## 数据访问规则

| 层级 | 能否访问数据库 | 说明 |
|------|--------------|------|
| apps/web（前端页面） | ❌ 不能 | 必须通过 API Client |
| packages/api-client | ❌ 不能 | 只负责 HTTP 调用 |
| packages/contracts | ❌ 不能 | 只定义类型 |
| modules/*（共享类型） | ❌ 不能 | 只定义接口 |
| apps/api（后端路由） | ✅ 可以 | 通过 Repository |
| apps/api Repository | ✅ 可以 | 通过 Prisma Client |
| packages/database | ✅ 可以 | 提供 Prisma Client |

## 新增模块数据库指南

1. 在 `packages/database/prisma/schema.prisma` 中新增表
2. 考虑未来 PostgreSQL / MySQL 兼容
3. 在 `modules/` 中定义 Repository 接口
4. 在 `apps/api/src/modules/` 中实现 Repository
5. 在 `apps/api/src/modules/` 中实现 API 路由
6. 在 `packages/api-client/src/modules/` 中实现 API Client
7. 运行 `prisma db push` 同步 schema
8. 更新文档

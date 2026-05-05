# Thunder Cloudflare 部署指南

这份文档面向当前 Thunder 仓库，目标是把项目部署到 Cloudflare Workers，并最终拿到可公网访问的 Thunder 地址。

## 部署目标

Thunder 当前按两个 Worker 部署：

1. `apps/api` -> `thunder-api`
2. `apps/web` -> `thunder-web`

原因很简单：

- `apps/api` 是 Hono 后端，负责数据库、Emby、天气等后端逻辑
- `apps/web` 是 Next.js 前端，负责页面和交互

虽然部署成两个 Worker，但对外体验可以是一个入口：

- 前端主站：`https://thunder-web.<subdomain>.workers.dev`
- Emby 动态片单：`https://thunder-web.<subdomain>.workers.dev/server/emby/watch/anime`

`apps/web` 已经配置好把以下路径转发给 `API_URL`：

- `/api/v1/*`
- `/server/*`

这两个路径通过 Next Route Handler 在运行时代理到 `API_URL`，不依赖 `next.config.ts` 的构建期 rewrites。因此 Cloudflare 只需要配置运行时变量，不需要把 `API_URL` 配成构建变量。

`/server/emby/*` 会保持公开访问，用于 Emos 抓取动态片单；Thunder 其他页面需要登录后访问。

## 当前仓库已完成的改造

### Cloudflare 相关

- API Worker 入口：[apps/api/src/worker.ts](E:/Code/Thunder/apps/api/src/worker.ts)
- API Wrangler 配置：[apps/api/wrangler.jsonc](E:/Code/Thunder/apps/api/wrangler.jsonc)
- Web OpenNext 配置：[apps/web/open-next.config.ts](E:/Code/Thunder/apps/web/open-next.config.ts)
- Web Wrangler 配置：[apps/web/wrangler.jsonc](E:/Code/Thunder/apps/web/wrangler.jsonc)

### 数据库相关

- 数据库已切换为 PostgreSQL / Neon
- Prisma 已启用 `engineType = "client"`
- 运行时数据库适配器已切换为 `@prisma/adapter-neon`
- Prisma Client 已做懒加载，避免 Cloudflare deploy 校验阶段提前初始化失败

### Emby 相关

- Emby 不再复用 `app_settings`
- 已改为专属表：
  - `emby_playlist`

## 本地环境文件说明

本地开发时会看到两个 `DATABASE_URL` 文件，这不是重复，而是用途不同：

### Prisma CLI 使用

[packages/database/.env](E:/Code/Thunder/packages/database/.env)

用于这些命令：

- `pnpm db:generate`
- `pnpm db:push`
- `pnpm db:migrate`
- `pnpm db:studio`

### 本地 API 运行时使用

[apps/api/.env](E:/Code/Thunder/apps/api/.env)

用于这些命令：

- `pnpm --filter @thunder/api dev`

### Cloudflare Worker 本地预演

模板文件：

- [apps/api/.dev.vars.example](E:/Code/Thunder/apps/api/.dev.vars.example)
- [apps/web/.dev.vars.example](E:/Code/Thunder/apps/web/.dev.vars.example)

如果要本地跑 `wrangler dev` / OpenNext preview，需要自己复制成：

- `apps/api/.dev.vars`
- `apps/web/.dev.vars`

## Cloudflare 上的变量映射

本地 `.env` 文件不会直接上传到 Cloudflare。

部署到 Cloudflare 后，对应关系是：

- 本地 `.env` / `.dev.vars`
- Cloudflare Worker 的 `Variables` / `Secrets`

也就是说：

- 本地 `packages/database/.env`
  -> Cloudflare `thunder-api` 的 `DATABASE_URL`
- 本地 `apps/api/.env`
  -> Cloudflare `thunder-api` 的运行时变量

仓库里的 Wrangler 配置已开启 `keep_vars`，部署时会保留 Cloudflare Dashboard 中配置的运行时 Variables / Secrets。
不要把 `DATABASE_URL`、`API_URL`、`THUNDER_AUTH_SECRET` 等运行时变量写进 `wrangler.jsonc` 的 `vars` 字段。

仓库里的两个 Wrangler 配置也已开启 Workers Logs：

```json
"observability": {
  "enabled": true,
  "head_sampling_rate": 1
}
```

`head_sampling_rate: 1` 表示部署后采集 100% 请求日志，适合当前调试阶段。后续访问量变大后可以改成 `0.1` 或更低。

`thunder-web` 还启用了 `global_fetch_strictly_public` compatibility flag。原因是 `thunder-web` 会在 Cloudflare Worker 内部请求 `thunder-api` 的 `workers.dev` 地址；如果不启用这个 flag，Cloudflare 会拦截同 zone Worker 到 Worker 的 `fetch`，返回 `404 error code: 1042`。

## 创建 `thunder-api`

在 Cloudflare Dashboard 中：

1. 进入 `Workers & Pages`
2. 选择 `Create`
3. 选择通过 GitHub 仓库创建
4. 选择当前仓库

### 表单推荐填写

- 项目名称：`thunder-api`
- 构建命令：留空
- 部署命令：`pnpm --filter @thunder/api deploy:cf`
- 非生产分支部署命令：`pnpm --filter @thunder/api exec wrangler versions upload`
- 路径：`/`

### 为什么构建命令可以留空

因为 API 侧的 deploy 脚本已经内置了 Prisma generate：

[apps/api/package.json](E:/Code/Thunder/apps/api/package.json)

```json
"deploy:cf": "pnpm --filter @thunder/database db:generate && wrangler deploy"
```

也就是说，Cloudflare 真正部署 `thunder-api` 时会先生成 Prisma Client，再部署 Worker。

### `thunder-api` 需要的变量

普通变量：

- `QWEATHER_API_HOST` = `nb33jqkfhv.re.qweatherapi.com`

建议作为 Secret 配置：

- `DATABASE_URL`
- `EMBY_PUBLIC_BASE_URL`
- `EMBY_EMOS_BASE_URL`
- `EMBY_EMOS_TOKEN`
- `EMBY_TMDB_API_TOKEN`
- `QWEATHER_KEY_ID`
- `QWEATHER_PROJECT_ID`
- `QWEATHER_PRIVATE_KEY`

其中：

- `DATABASE_URL` 直接填 Neon 完整连接串
- Emby 模块使用的地址、Token、TMDB 令牌也只从 `thunder-api` 的环境变量读取，不再从页面保存
- 登录账号密码来自后端 `auth_user` 表，需要你手动插入用户记录，代码不会自动初始化账号密码

例如：

```text
postgresql://neondb_owner:你的密码@your-neon-host/neondb?sslmode=require&channel_binding=require
```

### `thunder-api` 部署成功后你会拿到什么

一个默认的 `workers.dev` 域名，例如：

`https://thunder-api.wangchenxi077.workers.dev`

这个值后面会给 `thunder-web` 当 `API_URL` 用。

### 手动预置登录用户

Thunder 登录用户来自 `auth_user` 表，代码不会自动创建默认账号。

表字段要求：

- `id`：用户 ID，建议使用 UUID
- `username`：登录账号
- `password_hash`：PBKDF2-SHA256 哈希值，Base64URL 编码
- `password_salt`：16 字节随机盐，Base64URL 编码
- `avatar_data_url`：头像，可为空
- `created_at` / `updated_at`：ISO 时间字符串

不要把明文密码写入数据库。插入用户前先生成 `password_salt` 和 `password_hash`，再执行 SQL 插入。

## 创建 `thunder-web`

同样在 Cloudflare Dashboard 中新建第二个 Worker 项目。

### 表单推荐填写

- 项目名称：`thunder-web`
- 构建命令：`pnpm --filter @thunder/web build`
- 部署命令：`pnpm --filter @thunder/web deploy:cf`
- 非生产分支部署命令：`pnpm --filter @thunder/web exec opennextjs-cloudflare build && pnpm --filter @thunder/web exec wrangler versions upload`
- 路径：`/`

### `thunder-web` 需要的变量

这些变量要配置在 `thunder-web` 的运行时 Variables / Secrets，不是构建变量。

- `API_URL`
- `THUNDER_AUTH_SECRET`

值填 `thunder-api` 部署成功后的默认域名，例如：

`API_URL=https://thunder-api.wangchenxi077.workers.dev`

`THUNDER_AUTH_SECRET` 用于签名登录 Cookie。它不是登录密码，也不是数据库密码；生产环境必须设置为一串足够长的随机字符串。

PowerShell 生成示例：

```powershell
[Convert]::ToHexString((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

登录账号密码由 `thunder-api` 的后端用户表负责，`thunder-web` 不保存账号密码。

### `thunder-web` 不需要的变量

不要给 `thunder-web` 配这些：

- `DATABASE_URL`
- `QWEATHER_KEY_ID`
- `QWEATHER_PROJECT_ID`
- `QWEATHER_PRIVATE_KEY`

这些都属于 `thunder-api`。

### `thunder-web` 部署成功后你会拿到什么

一个前端公开域名，例如：

`https://thunder-web.wangchenxi077.workers.dev`

这个地址就是：

1. 你访问 Thunder 前端的地址
2. `thunder-api` 中 `EMBY_PUBLIC_BASE_URL` 应该配置的地址

## Emby 最终配置

当 `thunder-web` 部署成功后，在 `thunder-api` 的环境变量中把：

- `EMBY_PUBLIC_BASE_URL`

设置成：

`https://thunder-web.<subdomain>.workers.dev`

这样 Emos 就能抓取：

- `https://thunder-web.<subdomain>.workers.dev/server/emby/watch/domestic-tv`
- `https://thunder-web.<subdomain>.workers.dev/server/emby/watch/anime`

## 本地预演命令

### API Worker 本地运行

```bash
pnpm dev:api:cf
```

对应脚本见：

[package.json](E:/Code/Thunder/package.json)

### Web Worker 本地预演

```bash
pnpm preview:web:cf
```

## 当前已验证的命令

以下检查已经在本地通过：

- `pnpm db:generate`
- `pnpm --filter @thunder/database typecheck`
- `pnpm --filter @thunder/api typecheck`
- `pnpm --filter @thunder/api deploy:cf --dry-run`

注意：

- `apps/web` 的 typecheck 仍然会被仓库里已有问题卡住：
  [vault-unlock-page.tsx](E:/Code/Thunder/apps/web/src/modules/vault/components/vault-unlock-page.tsx:123)

这不是 Cloudflare 改造引入的问题。

## 最终上线顺序

推荐按这个顺序做：

1. 部署 `thunder-api`
2. 记下 `thunder-api.<subdomain>.workers.dev`
3. 创建 `thunder-web`
4. 给 `thunder-web` 配 `API_URL`
5. 部署 `thunder-web`
6. 打开 `thunder-web.<subdomain>.workers.dev`
7. 手动插入 `auth_user` 用户后，使用该用户登录
8. 确认 `EMBY_PUBLIC_BASE_URL` 已配置为 `thunder-web` 域名
9. 再去 Emos 同步动态片单

## 后续建议

部署通了之后，下一步最值得做的是：

1. 绑定自定义域名
2. 修掉 `apps/web` 现有的 Vault 类型错误
3. 对 `thunder-web` 再做一次 OpenNext 线上验证

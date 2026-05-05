# Thunder Cloudflare 部署

## 目标拓扑

Thunder 当前按两个 Cloudflare Worker 部署：

1. `apps/api` → `thunder-api`
2. `apps/web` → `thunder-web`

推荐最终域名：

- Web：`https://thunder.example.com`
- API：`https://thunder-api.example.com`

`apps/web` 已配置将以下请求转发到 `API_URL`：

- `/api/v1/*`
- `/server/*`

这意味着 Emby 对外动态地址可以直接使用 Web 域名，例如：

- `https://thunder.example.com/server/emby/watch/domestic-tv`

## 当前改造内容

### apps/api

- 新增 Worker 入口：`apps/api/src/worker.ts`
- 新增 Wrangler 配置：`apps/api/wrangler.jsonc`
- 新增本地 Worker 环境变量模板：`apps/api/.dev.vars.example`
- 新增脚本：
  - `pnpm --filter @thunder/api dev:cf`
  - `pnpm --filter @thunder/api deploy:cf`

### apps/web

- 新增 OpenNext 配置：`apps/web/open-next.config.ts`
- 新增 Wrangler 配置：`apps/web/wrangler.jsonc`
- 新增本地 Worker 环境变量模板：`apps/web/.dev.vars.example`
- 新增脚本：
  - `pnpm --filter @thunder/web preview:cf`
  - `pnpm --filter @thunder/web deploy:cf`

### 数据库

- Prisma 已切换为 PostgreSQL
- Prisma Client 已启用 `engineType = "client"`
- 数据库运行时已改用 Neon 适配器 `@prisma/adapter-neon`

这套配置更适合 Cloudflare Workers，不再依赖 Rust query engine。

## 需要配置的环境变量

### apps/api

Cloudflare 中至少需要：

- `DATABASE_URL`
- `QWEATHER_API_HOST`
- `QWEATHER_KEY_ID`
- `QWEATHER_PROJECT_ID`
- `QWEATHER_PRIVATE_KEY`

其中 `DATABASE_URL` 建议使用 Neon 连接串。

### apps/web

Cloudflare 中至少需要：

- `API_URL`

生产环境应指向你的 API Worker 域名，例如：

`API_URL=https://thunder-api.example.com`

## 本地预演

1. API Worker 本地运行：

```bash
pnpm dev:api:cf
```

默认示例端口为 `8787`。

2. Web Worker 本地预演：

```bash
pnpm preview:web:cf
```

`apps/web/.dev.vars` 中的 `API_URL` 应指向本地 API Worker，例如：

`API_URL=http://127.0.0.1:8787`

## GitHub 连接 Cloudflare

建议为 `apps/api` 和 `apps/web` 各创建一个 Worker 项目，并都连接到同一个 GitHub 仓库。

### API Worker

- Root directory：`apps/api`
- Build command：可留空
- Deploy command：`pnpm deploy:cf`

### Web Worker

- Root directory：`apps/web`
- Build command：可留空
- Deploy command：`pnpm deploy:cf`

如果 Cloudflare 的构建环境未自动识别 workspace 依赖，优先在 Worker 项目的 Build 设置中确认：

- 使用 `pnpm`
- Root directory 指向对应应用目录
- 安装命令可访问 monorepo 根依赖

## 部署后的 Thunder 对外地址

部署完成后，你会拿到：

- `thunder-web.<subdomain>.workers.dev`
- `thunder-api.<subdomain>.workers.dev`

其中 `thunder-web` 就可以作为 Thunder 的对外入口。

然后在 Thunder 的 Emby 模块里，把 `publicBaseUrl` 设置为你的 Web 域名，例如：

`https://thunder-web.<subdomain>.workers.dev`

这样 Emos 就能抓取：

`https://thunder-web.<subdomain>.workers.dev/server/emby/watch/anime`

## 当前剩余事项

1. 执行 `pnpm install` 安装新增依赖
2. 运行 Prisma generate，确认无旧的 Windows 文件锁问题
3. 本地验证：
   - `apps/api` 的 `wrangler dev`
   - `apps/web` 的 OpenNext preview
4. 在 Cloudflare Dashboard 中配置 Worker secrets / vars
5. 绑定正式域名

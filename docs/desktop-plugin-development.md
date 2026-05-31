# Desktop Plugin Development Guide

本文档面向 Thunder Desktop 插件作者。平台侧运行机制、信任模型、签名校验和 API 列表见 `docs/desktop-plugin-system.md`。

## 插件与内置模块的区别

内置模块属于构建期能力，由 `scripts/generate-enabled-modules.mjs` 按 Web / Desktop 平台裁剪后打包进应用。

桌面插件属于运行时能力，只在 Desktop 端生效。插件安装在桌面应用数据目录下，不能直接 import Thunder 主应用源码、Prisma、内置模块实现或 Repository。插件与平台之间只能通过插件 Manifest、iframe 页面、受控本地 API 代理和插件自有迁移交互。

Web 端不加载运行时插件。Web 端只使用构建期可用模块。

## 最小目录结构

```text
my-plugin/
  plugin.json
  web/
    index.html
```

需要后端运行时时可增加：

```text
my-plugin/
  api/
    server.mjs
```

需要 SQLite 数据迁移时可增加：

```text
my-plugin/
  migrations/
    sqlite/
      001_init.sql
      002_add_indexes.sql
```

可以参考 `examples/desktop-plugins/hello`。

## Manifest

每个插件必须在根目录提供 `plugin.json`：

```json
{
  "manifestVersion": 1,
  "id": "hello-plugin",
  "name": "Hello Plugin",
  "version": "1.0.0",
  "description": "Desktop runtime plugin example.",
  "icon": "Package",
  "category": "tools",
  "order": 900,
  "author": {
    "name": "Thunder"
  },
  "permissions": ["webview", "local-api-proxy"],
  "web": {
    "entry": "web/index.html"
  },
  "api": {
    "healthPath": "/health",
    "runtime": {
      "kind": "node",
      "entry": "api/server.mjs"
    }
  },
  "migrations": {
    "sqlite": "migrations/sqlite"
  }
}
```

字段约束：

- `id` 只能使用小写字母、数字和连字符，发布后不要修改。
- `version` 使用 semver，例如 `1.0.0`。
- `icon` 使用主应用已支持的 lucide 图标名。
- `permissions` 必须声明插件需要的粗粒度权限。
- `web.entry` 必须指向插件目录内的静态页面。
- `api.runtime.entry` 必须指向插件目录内的 Node 入口文件。
- `migrations.sqlite` 必须指向插件目录内的 SQLite 迁移目录。

可用权限：

- `webview`: 允许插件页面在 sandbox iframe 中渲染。
- `local-api-proxy`: 允许 Thunder 代理访问插件本地后端。
- `plugin-storage`: 预留给插件持久化能力。
- `network-proxy`: 预留给受控网络代理能力。

插件安装后默认不受信任。用户在 Desktop 插件市场中信任插件后，插件才可以渲染 iframe、启动本地 API、运行迁移。

## SDK

插件可使用 `@thunder/plugin-sdk` 获取 Manifest 和运行时环境变量类型：

```ts
import { defineThunderPluginManifest } from "@thunder/plugin-sdk"

export default defineThunderPluginManifest({
  manifestVersion: 1,
  id: "hello-plugin",
  name: "Hello Plugin",
  version: "1.0.0",
  description: "Desktop runtime plugin example.",
  icon: "Package",
  category: "tools",
  author: { name: "Thunder" },
  permissions: ["webview"],
  web: { entry: "web/index.html" }
})
```

当前运行时读取的是 `plugin.json`。如果使用 TypeScript 编写 `manifest.ts`，发布前需要生成或同步为 `plugin.json`。

后端运行时可使用 SDK 校验平台注入的环境变量：

```ts
import { getThunderPluginRuntimeEnv } from "@thunder/plugin-sdk"

const env = getThunderPluginRuntimeEnv(process.env)
```

## 前端页面

插件前端通过 `web.entry` 指定的 HTML 页面渲染。Thunder 会把该页面作为 sandbox iframe 加载：

```text
/api/v1/desktop/plugins/{pluginId}/web/{path}
```

插件页面应该把自己当作隔离应用处理：

- 不依赖主应用全局变量。
- 不 import `apps/web` 或 `packages/*` 源码。
- 静态资源使用插件目录内的相对路径。
- 需要调用插件后端时，请请求插件 API 代理路径。

示例：

```js
const response = await fetch("/api/v1/desktop/plugins/hello-plugin/api/status")
const data = await response.json()
```

## 后端运行时

插件可以声明一个受平台托管的 Node 后端：

```json
{
  "api": {
    "healthPath": "/health",
    "runtime": {
      "kind": "node",
      "entry": "api/server.mjs"
    }
  }
}
```

用户信任插件后，平台可以启动该 Node 进程。平台会分配本地端口，并注入这些环境变量：

- `PORT`: 插件服务必须监听的端口。
- `THUNDER_PLUGIN_ID`: 插件 id。
- `THUNDER_PLUGIN_VERSION`: 插件版本。
- `THUNDER_PLUGIN_STATE_DIR`: 插件专属状态目录。
- `THUNDER_PLUGIN_TRUSTED`: 固定为 `1`。

插件服务应监听 `127.0.0.1`，并实现 `healthPath`：

```js
import { createServer } from "node:http"

const port = Number(process.env.PORT || "0")

const server = createServer((request, response) => {
  response.setHeader("content-type", "application/json; charset=utf-8")

  if (request.url === "/health") {
    response.end(JSON.stringify({ ok: true }))
    return
  }

  response.end(JSON.stringify({ ok: true, path: request.url }))
})

server.listen(port, "127.0.0.1")
```

Thunder 只通过平台 API 代理暴露插件后端：

```text
/api/v1/desktop/plugins/{pluginId}/api/*
```

插件不要把服务绑定到公网地址，也不要假设端口固定。

官方提词器插件使用 Node runtime 作为业务后端。它不会让 iframe 直接调用 Tauri，而是通过插件 API 代理到 runtime，再由 runtime 调用平台注入的 `THUNDER_DESKTOP_NATIVE_API_URL`。这样 FunASR / sherpa-onnx 的业务接入仍归插件负责，平台只提供受控原生能力出口。

## 数据与迁移

平台只提供迁移基础设施，不理解插件业务数据。插件必须自己维护具体 schema 和迁移 SQL。

迁移规则：

- 迁移文件放在 `migrations.sqlite` 指定目录。
- 文件名使用可排序前缀，例如 `001_init.sql`。
- 平台按文件名排序，每个 SQL 文件在事务中执行一次。
- 平台记录 `plugin_id + migration name + sha256`。
- 已执行迁移文件不能修改；修改后再次运行会失败。

推荐表命名带插件前缀，避免与平台表或其他插件冲突：

```sql
CREATE TABLE IF NOT EXISTS plugin_hello_notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

不要在插件中直接访问 Prisma Client 或主应用 Repository。

## 本地开发

1. 创建插件目录，并写好 `plugin.json`。
2. 添加 `web/index.html`，按需添加 `api/server.mjs` 和 `migrations/sqlite/*.sql`。
3. 允许开发环境安装未签名插件：

```powershell
$env:THUNDER_ALLOW_UNSIGNED_PLUGINS = "1"
pnpm dev:desktop
```

4. 打开 Desktop 插件市场。
5. 使用本地绝对路径安装插件，例如：

```text
E:\Code\Thunder\examples\desktop-plugins\hello
```

6. 在插件市场中信任插件。
7. 按需运行迁移、启动运行时、打开插件页面。

开发期间修改插件文件后，可以重新本地安装同一路径。平台会按升级流程备份旧版本。

## 打包与签名

生产安装要求签名包。使用打包脚本生成 `.tar.gz` 和 marketplace entry：

```bash
pnpm --filter @thunder/api package:desktop-plugin -- \
  --plugin examples/desktop-plugins/hello \
  --private-key ./keys/plugin-signing.key \
  --key-id thunder-official-1 \
  --out dist/desktop-plugins \
  --base-url https://plugins.example.com/
```

输出：

- `{plugin-id}-{version}.tar.gz`
- `{plugin-id}-{version}.marketplace-entry.json`

签名使用 Ed25519，对 `plugin.json` 的稳定 JSON 表示签名。包安装时还会校验 package sha256。

## 插件市场索引

从多个 marketplace entry 生成索引：

```bash
pnpm build:plugin-marketplace -- \
  --entries dist/desktop-plugins \
  --out dist/desktop-plugins/index.json \
  --private-key ./keys/plugin-marketplace.key \
  --key-id thunder-marketplace-1
```

Desktop 端会按配置的可信公钥校验插件包和市场索引。

运行时配置：

- `THUNDER_PLUGIN_TRUSTED_KEYS`: 插件包签名可信公钥列表。
- `THUNDER_PLUGIN_MARKETPLACE_TRUSTED_KEYS`: 插件市场索引签名可信公钥列表。
- `THUNDER_PLUGIN_MARKETPLACE_URL`: 插件市场索引 URL。

公钥列表格式：

```json
[
  {
    "keyId": "thunder-official-1",
    "publicKey": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
  }
]
```

## 升级与回滚

安装同 id 的新版本会走升级流程：

- 停止旧运行时。
- 备份当前插件目录。
- 安装新版本。
- 如果权限未变化，保留 trust 状态。
- 如果权限变化，重置为 untrusted，要求用户重新信任。

插件市场页面提供回滚入口，回滚到最近一次备份。

## 发布前检查

发布前至少检查：

- `plugin.json` 与实际目录一致。
- 插件 id、表名、状态文件名不会与其他插件冲突。
- 后端只监听 `127.0.0.1`。
- health endpoint 能稳定返回成功。
- 迁移文件追加不修改。
- 不直接 import Thunder 主应用源码、Prisma 或内置模块实现。
- 权限声明只包含实际需要的能力。
- 生产包使用受信任私钥签名。

可运行插件系统测试：

```bash
pnpm test:plugins
```

## 常见问题

### 安装未签名插件失败

开发环境需要设置：

```powershell
$env:THUNDER_ALLOW_UNSIGNED_PLUGINS = "1"
```

生产环境必须使用签名包安装。

### 官方内置插件如何进入市场

官方内置插件可以随 Desktop 运行时一起分发，默认放在运行时资源的 `plugins/desktop/{plugin-id}` 下。开发环境也会扫描仓库内的 `plugins/desktop/`。

内置插件市场 entry 的 `source` 为 `bundled`。用户点击安装时，平台只按插件 id 从受控内置目录复制插件，不接收任意路径。安装后仍默认未信任。

可通过 `THUNDER_BUNDLED_PLUGIN_DIRS` 配置额外内置插件目录，多个目录使用系统 path delimiter 分隔。

### 插件页面打不开

确认插件已被用户信任，并且 Manifest 包含 `webview` 权限。

### API 代理失败

确认插件已被信任，Manifest 包含 `local-api-proxy` 权限，运行时已启动，`healthPath` 返回成功。

### 迁移失败

确认插件已被信任。若错误提示 migration hash changed，说明已执行迁移文件被修改了。应新增一个新的迁移文件，不要修改历史迁移。

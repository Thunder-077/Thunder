# 桌面端插件系统

Thunder Desktop 支持运行时插件。运行时插件是对构建期内置模块的补充，不替代内置模块。

插件作者指南见 `docs/desktop-plugin-development.md`。

内置模块仍由构建期模块裁剪控制。运行时插件只面向 Desktop 端，安装在桌面应用数据目录下。

## 存储布局

```text
AppData/com.thunder.desktop/
  plugins/
    {plugin-id}/
      plugin.json
      .thunder-install.json
      web/
  plugin-staging/
  plugin-state/
  plugin-audit.jsonl
```

开发环境下，插件根目录会根据当前本地 SQLite `DATABASE_URL` 推导。也可以通过 `THUNDER_DESKTOP_DATA_DIR` 覆盖。

## Manifest

每个插件必须提供 `plugin.json`：

```json
{
  "manifestVersion": 1,
  "id": "hello-plugin",
  "name": "Hello Plugin",
  "version": "1.0.0",
  "description": "Desktop runtime plugin example.",
  "icon": "Package",
  "category": "tools",
  "author": { "name": "Thunder" },
  "permissions": ["webview"],
  "web": { "entry": "web/index.html" },
  "api": {
    "healthPath": "/health",
    "runtime": {
      "kind": "node",
      "entry": "api/server.mjs"
    }
  },
  "migrations": { "sqlite": "migrations/sqlite" }
}
```

生产环境会拒绝未签名插件。受信任的 Ed25519 公钥通过 `THUNDER_PLUGIN_TRUSTED_KEYS` 配置：

```json
[
  {
    "keyId": "thunder-official-1",
    "publicKey": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
  }
]
```

本地开发可以通过 `THUNDER_ALLOW_UNSIGNED_PLUGINS=1` 安装未签名插件。

Manifest 权限只接受平台已知权限。声明 `web.entry` 的插件必须包含 `webview`；声明 `api` 的插件必须包含 `local-api-proxy`。

插件市场索引也可以签名。如果配置了 `THUNDER_PLUGIN_MARKETPLACE_TRUSTED_KEYS`，市场 JSON 必须包含顶层 Ed25519 `signature` 字段，签名内容为移除 `signature` 字段后的索引 payload。如果没有配置该变量，Thunder 会回退使用 `THUNDER_PLUGIN_TRUSTED_KEYS`。

Thunder 还支持随桌面运行时一起分发的官方内置插件。内置插件目录默认为运行时目录下的 `plugins/desktop/`，也可以通过 `THUNDER_BUNDLED_PLUGIN_DIRS` 指定多个目录。内置插件会出现在插件市场中，安装时只允许按插件 id 从受控内置目录复制，不开放任意未签名路径；安装后默认启用。

## 打包

使用打包脚本生成签名包和插件市场 entry：

```bash
pnpm --filter @thunder/api package:desktop-plugin -- \
  --plugin examples/desktop-plugins/hello \
  --private-key ./keys/plugin-signing.key \
  --key-id thunder-official-1 \
  --out dist/desktop-plugins \
  --base-url https://plugins.example.com/
```

脚本会输出：

- `{plugin-id}-{version}.tar.gz`
- `{plugin-id}-{version}.marketplace-entry.json`

插件市场 entry 包含 package sha256，以及针对 `plugin.json` 的 Ed25519 签名。

从生成的 entry 构建签名插件市场索引：

```bash
pnpm build:plugin-marketplace -- \
  --entries dist/desktop-plugins \
  --out dist/desktop-plugins/index.json \
  --private-key ./keys/plugin-marketplace.key \
  --key-id thunder-marketplace-1
```

索引构建脚本会合并 `*.marketplace-entry.json`，按确定性顺序排序，并在提供私钥时对最终索引签名。

## SDK

插件作者可以使用 `@thunder/plugin-sdk` 复用 Manifest 类型和运行时环境变量类型：

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

插件前端使用 `@thunder/plugin-sdk/browser` 与宿主页通信：

```ts
import { thunder } from "@thunder/plugin-sdk/browser"

const manifest = await thunder.plugin.getManifest()
const status = await thunder.runtime.get("status")
```

Browser SDK 不直接暴露平台 URL。它通过 sandbox iframe 内的 `postMessage` Host Bridge 发起请求，宿主页负责绑定插件身份、校验消息来源和权限，再调用平台内部 API。

## 启用模型

Thunder Desktop 当前不做细粒度动态授权，也不提供单独的 trust / untrust 按钮。用户安装插件即表示允许该插件使用 Manifest 中声明的平台能力：

- 已安装插件会显示在插件市场和侧边栏中。
- 插件页面可以通过 sandbox iframe 渲染。
- 声明了 `local-api-proxy` 的插件可以通过 Browser SDK 请求宿主，由宿主通过受控 loopback 代理访问该插件自己的本地后端。
- 声明了 SQLite 迁移目录的插件可以执行自己的迁移文件。

停用插件通过卸载完成。后续如果需要更强隔离，应优先扩展签名、来源校验、沙箱、路径隔离和权限声明审计，而不是让平台理解插件业务数据。

## 迁移基础设施

平台不理解插件业务数据。平台只提供迁移基础设施：

- 插件声明 SQLite 迁移目录。
- 插件自己维护具体 SQL 文件。
- 平台按文件名排序 `*.sql`，每个文件在事务中执行一次，并记录 `plugin_id + migration name + sha256`。
- 如果已经执行过的迁移文件内容发生变化，后续执行会失败，避免静默改写历史。

迁移记录存储在 `plugin_migrations`。

## 升级、降级与审计

安装同 id 插件包也是升级或降级路径。替换已安装插件前，Thunder 会：

1. 停止插件运行时。
2. 从 staging 目录安装新包。
3. 原子替换已安装插件目录。

平台不维护自动备份，也不提供 rollback API。需要降级时，由用户下载或构建低版本插件后重新安装同 id 插件。审计记录以 JSONL 追加写入桌面插件根目录下的 `plugin-audit.jsonl`。审计日志记录 install、upgrade、migration、package install、bundled install 和 uninstall 事件。

## API

```text
GET    /api/v1/desktop/plugins
GET    /api/v1/desktop/plugins/marketplace
GET    /api/v1/desktop/plugins/:id
POST   /api/v1/desktop/plugins/install/local
POST   /api/v1/desktop/plugins/install/package
POST   /api/v1/desktop/plugins/install/bundled
POST   /api/v1/desktop/plugins/:id/migrations/run
DELETE /api/v1/desktop/plugins/:id
GET    /api/v1/desktop/plugins/:id/web/*
*      /api/v1/desktop/plugins/:id/api/*
GET    /api/v1/desktop/plugins/:id/runtime
POST   /api/v1/desktop/plugins/:id/runtime/start
POST   /api/v1/desktop/plugins/:id/runtime/stop
```

`install/package` 接收一个签名 `.tar.gz` 包 URL，校验 package sha256，解压到 staging 目录，校验 Manifest，验证签名，然后原子替换已安装插件目录。

`install/bundled` 接收内置插件 id，只会从 `THUNDER_BUNDLED_PLUGIN_DIRS` 或默认内置插件目录中查找并安装该插件。

插件 Web 入口由 `apps/web/src/app/plugins/[pluginId]/page.tsx` 以 sandbox iframe 渲染。

`runtime/start` 和 `runtime/stop` 是平台内部和诊断接口。正常用户入口不展示启动 / 停止按钮：插件页面会按需自动启动运行时，卸载或升级/降级安装会自动停止旧运行时。

## Host Bridge

插件 iframe 与 Thunder Web 宿主页之间使用 `postMessage` 通信。当前 bridge 版本为 `1`，插件侧通过 `@thunder/plugin-sdk/browser` 使用，不应手写消息协议。插件 iframe 不启用 `allow-same-origin`，因此插件页面运行在 opaque origin 下，不能直接作为同源页面访问 Thunder 内部 API。

宿主页处理 bridge 请求时必须同时满足：

- `event.origin` 为 sandbox opaque origin 的 `"null"`。
- `event.source` 等于当前插件 iframe 的 `contentWindow`。
- 请求 `source` 为 `thunder-plugin`，`version` 为 `1`。
- 请求绑定当前页面加载的插件 id，不信任插件自行传入的身份字段。
- 调用 runtime 代理前，当前插件 Manifest 必须包含 `local-api-proxy` 权限。
- runtime 请求路径不能为空，不能以 `/` 或 `\` 开头，路径段解码后不能是 `.`、`..` 或包含斜杠。
- runtime 代理请求不会携带 Thunder 页面 cookie，并会过滤 `authorization`、`cookie`、`host` 请求头。

当前 Host API：

| Method | 权限 | 说明 |
|--------|------|------|
| `plugin.getManifest` | 已安装插件 | 返回当前插件 Manifest |
| `runtime.request` | `local-api-proxy` | 代理请求到当前插件自己的 Node runtime |

平台内部 HTTP API 仍保留给宿主、桌面壳和诊断使用；插件 iframe 不应直接依赖这些 URL。

## 本地示例

```bash
set THUNDER_ALLOW_UNSIGNED_PLUGINS=1
pnpm dev:desktop
```

然后打开 Desktop 插件市场，并安装：

```text
E:\Code\Thunder\examples\desktop-plugins\hello
```

## 验证

插件系统有独立的聚焦测试：

```bash
pnpm test:plugins
```

该测试覆盖本地安装、静态资源、SQLite 迁移、受控 Node 运行时、API 代理、升级/降级安装、审计日志、签名包安装和签名插件市场索引。

## 官方提词器插件

提词器在 Web 端仍作为构建期内置模块启用；Desktop 端不再打包内置提词器模块，而是通过官方内置插件进入插件市场。

```bash
pnpm build:plugin:teleprompter
```

该命令会把 `apps/web/src/modules/teleprompter` 构建为独立 iframe 静态资源，输出到 `plugins/desktop/teleprompter/web/`。Desktop 打包流程会自动执行该命令，并把 `plugins/desktop/` 复制到桌面运行时资源目录。

提词器插件已经接入插件运行时：

- 插件 iframe 通过 `@thunder/plugin-sdk/browser` 请求 Host Bridge。
- Host Bridge 按 `local-api-proxy` 权限代理到插件自己的 API：`/api/v1/desktop/plugins/teleprompter/api/native/*`
- 插件 Node runtime 代理到 Tauri 暴露的本机 speech bridge：`THUNDER_DESKTOP_NATIVE_API_URL`
- Tauri speech bridge 仅监听 `127.0.0.1:43102`
- FunASR 由 speech bridge 启动本地 Python WebSocket 服务，插件继续使用 WebSocket 推流
- sherpa-onnx 的模型列表、下载、激活、启动、停止和音频推流都通过 speech bridge 进入 Tauri Rust 原生识别器

插件页面打开时会自动启动插件的 Node runtime。用户需先安装提词器插件。

## 安全规则

- 插件 ID 只能使用小写字母、数字和连字符。
- 静态资源路径不能逃逸插件目录。
- 生产安装必须通过 Ed25519 签名校验。
- 包安装前必须校验 sha256。
- 插件 iframe 使用 sandbox 限制。
- 插件 iframe 不启用 `allow-same-origin`；与宿主页通信必须走 Host Bridge，宿主页校验 opaque origin、iframe source、消息版本、当前插件身份和权限。
- 插件 API 代理只支持 Manifest 声明的 loopback `api.baseUrl`，且需要 `local-api-proxy` 权限。
- 插件后端运行时限制为插件自有 Node 入口文件。Thunder 分配 loopback 端口，注入 `THUNDER_PLUGIN_ID`、`THUNDER_PLUGIN_VERSION`、`THUNDER_PLUGIN_STATE_DIR`，并等待配置的健康检查通过后才代理流量。
- Desktop 原生语音能力只通过本机 speech bridge 暴露，默认地址为 `http://127.0.0.1:43102`，插件 runtime 通过 `THUNDER_DESKTOP_NATIVE_API_URL` 调用。
- 插件迁移由平台基础设施按插件声明执行，具体业务数据迁移逻辑由插件自己的 SQL 负责。
- 插件不能 import Thunder 源码模块，也不能直接访问 Prisma。

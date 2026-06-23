# Desktop Plugin Development Guide

本文档面向 Thunder Desktop 插件作者。平台机制与 API 列表见 `docs/desktop-plugin-system.md`。

## 开发边界

桌面插件是运行时能力，不是构建期模块。

你可以做：

- 提供独立插件 UI
- 通过 Browser SDK 访问宿主开放能力
- 默认使用 sandboxed 前端插件；只有确需本地能力时才使用 trusted worker
- 复用公开插件基础设施，如 `@thunder/plugin-sdk`、`@thunder/plugin-ui`

你不能做：

- 直接 import `apps/web`、`apps/api`、Prisma 或主应用内部实现
- 假设和主应用同源
- 直接依赖 Tauri 内部对象或 Thunder 私有状态

## 目录结构

默认创建方式：

```bash
npx thunder-plugin create my-plugin
npx thunder-plugin create my-native-plugin --template trusted-app
```

第一个命令生成没有 runtime 的 `sandboxed-ui` 插件。trusted 模板必须显式选择。

`thunder-plugin` 是外部插件开发套件的统一入口。插件项目可以放在 Thunder
仓库外部；只要安装公开 SDK 依赖，就可以独立完成创建、校验、本地调试、
打包和市场索引生成。对外发布面限定为：

- `@thunder/plugin-cli`：脚手架、校验、开发同步、打包、市场索引生成。
- `@thunder/plugin-sdk`：插件 UI 与 trusted worker 的公开 SDK。
- `@thunder/plugin-ui`：插件 UI 可复用基础组件。
- `@thunder/plugin-schema` / `@thunder/plugin-protocol`：自定义工具和契约测试使用。

宿主实现包如 `@thunder/plugin-host-runtime` 仍是 Thunder 内部依赖，外部插件不应
直接依赖。

最小 sandboxed 插件结构：

```text
my-plugin/
  plugin.json
  package.json
  tsconfig.json
  src/
    index.tsx
  dist/
```

插件 UI 使用 `dist/index.html` 和 `dist/index.js`。只有 trusted 插件包含
`src/worker.ts`、`runtime.entry` 和 `dist/worker.js`。

- `dist/index.html`
- `dist/index.js`
- `dist/worker.js`
- 可选 `dist/assets/*.css`

仓库内真实示例：

```text
plugins/desktop/teleprompter
```

官方插件也必须按普通 workspace 包维护自己的 `build` / `dev` 脚本，底层同样调用
`thunder-plugin build .` 和 `thunder-plugin dev .`。根命令只负责转调插件包脚本，
不再为单个官方插件维护另一套专用 esbuild 流程。

## Manifest

正式插件统一使用 `manifestVersion: 2`：

```json
{
  "manifestVersion": 2,
  "id": "teleprompter",
  "name": "提词器",
  "version": "0.1.0",
  "description": "桌面提词器插件",
  "kind": "trusted",
  "engines": {
    "thunder": "^2.0.0"
  },
  "author": {
    "name": "Thunder"
  },
  "icon": "ScrollText",
  "permissions": [
    "storage",
    "notifications",
    "activity",
    "microphone",
    "native-runtime",
    "filesystem:plugin-data"
  ],
  "contributes": {
    "sidebar": {
      "title": "提词器",
      "icon": "ScrollText",
      "entry": "dist/index.html"
    }
  },
  "runtime": {
    "entry": "dist/worker.js"
  }
}
```

关键约束：

- `id` 只能使用小写字母、数字和连字符。
- `version` 使用 semver。
- `entry` 必须指向插件目录内存在的相对路径。
- 权限只声明实际需要的能力。

安装/升级时，平台会把 Manifest 的权限集合和 kind 写入信任记录。trusted
插件或声明 `native-runtime`、`filesystem:plugin-data`、`microphone` 的插件
会被视为高风险安装，需要用户明确确认。进程隔离不是 OS 级沙箱，trusted
插件仍以当前用户权限运行本地代码。

## SDK

### Browser SDK

插件前端必须通过 `@thunder/plugin-sdk/browser` 与宿主通信：

```ts
import { thunder } from "@thunder/plugin-sdk/browser"

const manifest = await thunder.plugin.getManifest()
await thunder.storage.set("draft", { text: "hello" })
const draft = await thunder.storage.get<{ text: string }>("draft")
thunder.notification.add({ type: "success", title: "Saved" })
await thunder.activity.track({ action: "save", title: "Draft saved" })
const result = await thunder.worker.invoke("speech.transcribe", { text: "hello world" })
```

当前正式可依赖的方法重点是：

- `plugin.getManifest`
- `plugin.setFrameHeight`
- `theme.onChange`
- `storage.*`
- `notification.add`
- `activity.track`
- `network.request` / `network.get` / `network.post`
- `worker.invoke`

网络权限按精确 origin 声明，例如 `network:https://api.example.com`。
iframe 不直接访问外网，请求由宿主代理执行，不转发 Cookie、Authorization
或浏览器凭据。当前不提供 Secrets、命令或设置贡献点。

### Worker SDK

trusted worker 通过 `@thunder/plugin-sdk/worker` 暴露 handler：

```ts
import { defineWorker } from "@thunder/plugin-sdk/worker"

export default defineWorker({
  handlers: {
    async "speech.transcribe"(payload) {
      return {
        normalized: String(payload?.text ?? "").trim(),
      }
    },
  },
})
```

不要把 worker 当成公开 HTTP 服务。它由平台统一托管，通过受控 RPC 调用。
每个 trusted 插件会运行在独立 Node 子进程中，插件代码不应依赖宿主进程
环境变量、工作目录或内部 pipe/socket 地址。

worker 可依赖的平台环境变量只有：

- `THUNDER_PLUGIN_ID`：当前插件 id。
- `THUNDER_PLUGIN_DATA_DIR`：仅在 Manifest 声明
  `filesystem:plugin-data` 时存在，用于插件私有本地文件。

平台不会把 `DATABASE_URL`、签名密钥、`NODE_OPTIONS` 或其他宿主秘密传入
子进程。插件需要外部网络时仍应声明 `network:<origin>` 并通过 Browser SDK
的网络能力调用，不应从 runtime 绕过权限模型。

runtime handler 应满足以下约束：

- 输入和输出必须可 JSON 序列化。
- 单次请求不超过 1 MiB，响应不超过 5 MiB。
- 不依赖进程长期不退出；平台会在升级、卸载和异常恢复时重启 runtime。
- 对并发调用保持可重入，或在插件内部显式串行化共享资源。

## UI 约束

插件 UI 在独立 iframe 中运行，应按独立应用处理：

- 不依赖主应用全局变量或 React Context。
- 不直接引用主应用内部基础组件。
- 需要保持风格一致时，优先使用 `@thunder/plugin-ui`。
- 静态资源使用插件目录内相对路径。

如果要和 Thunder 的设计系统一致，组件的颜色、尺寸、hover、间距都应从共享 token 和共享基础组件收敛，而不是在插件侧复制一份近似实现。

## 本地开发

开发环境允许本地目录安装未签名插件：

```powershell
$env:THUNDER_ALLOW_UNSIGNED_PLUGINS = "1"
pnpm dev:desktop
```

外部作者推荐直接使用 CLI：

```bash
npx thunder-plugin validate .
npx thunder-plugin dev .
```

仓库内官方插件使用相同入口：

```bash
pnpm --filter @thunder/plugin-teleprompter-v2 dev
pnpm --filter @thunder/plugin-teleprompter-v2 build
```

`validate` 会检查 Manifest、入口文件、symlink 和高风险权限摘要。`dev`
会自动构建插件、连接 Thunder Desktop、安装本地目录，并在 trusted 或高风险
插件需要确认时生成开发态 `trustDecision`。因此正常开发不需要手动计算
`plugin.json` 摘要。为了兼容外部项目的 `node_modules`，CLI 实际安装的是
`.thunder-plugin-dev/{plugin-id}` 下的干净目录，只包含 Manifest 和 `dist`
运行产物。

如果插件需要复用 Tailwind / Thunder UI 样式，可以在 `package.json` 中声明
`thunderPlugin.css`。CLI 会先构建 UI/worker，再按配置处理 CSS，并把样式表
自动写入 `dist/index.html`：

```json
{
  "thunderPlugin": {
    "css": {
      "input": "../../../apps/web/src/app/globals.css",
      "output": "dist/assets/main.css",
      "sources": [
        "src",
        "../../../packages/plugin-ui/src",
        "../../../packages/teleprompter-ui/src"
      ]
    }
  }
}
```

`sources` 用于给 Tailwind v4 明确声明扫描范围。官方插件复用共享包时，应把
插件源码和被复用的共享 UI 包都列进去，这样共享组件里的响应式类、状态类才会
进入插件最终 CSS。

也可以通过插件市场安装本地目录，或直接调用：

```text
POST /api/v1/desktop/plugins/install/local
```

请求体：

```json
{
  "pluginPath": "D:/self/Thunder/plugins/desktop/teleprompter",
  "trustDecision": {
    "acceptedRisk": true,
    "kind": "trusted",
    "manifestSha256": "<plugin.json sha256>",
    "permissions": [
      "storage",
      "notifications",
      "activity",
      "microphone",
      "native-runtime",
      "filesystem:plugin-data"
    ],
    "reason": "local development install"
  }
}
```

sandboxed 插件如果没有高风险权限，可以省略 `trustDecision`。trusted 插件缺少
匹配的确认会返回 409。

开发期间重新安装同一路径即可覆盖旧版本。平台会先把新版本复制到 staging，
写入安装记录并校验信任信息，再停止旧 runtime 并切换目录。升级切换失败时，
平台会尝试恢复旧版本目录并记录失败审计。

## 打包与签名

外部插件使用 CLI 打包：

```bash
npx thunder-plugin pack . --entry --out dist/desktop-plugins --base-url https://plugins.example.com/
```

输出：

- `{plugin-id}-{version}.tar.gz`
- `{plugin-id}-{version}.marketplace-entry.json`

如果需要签名 marketplace entry：

```bash
npx thunder-plugin pack . --entry \
  --private-key ./keys/plugin-signing.key \
  --key-id thunder-official-1 \
  --out dist/desktop-plugins \
  --base-url https://plugins.example.com/
```

生成市场索引：

```bash
npx thunder-plugin publish \
  --entries dist/desktop-plugins \
  --out dist/desktop-plugins/index.json \
  --private-key ./keys/marketplace-signing.key \
  --key-id thunder-marketplace-1
```

仓库内 API 脚本仍可用于官方构建兼容路径：

```bash
pnpm --filter @thunder/api package:desktop-plugin -- \
  --plugin D:/self/Thunder/plugins/desktop/teleprompter \
  --private-key ./keys/plugin-signing.key \
  --key-id thunder-official-1 \
  --out dist/desktop-plugins \
  --base-url https://plugins.example.com/
```

当前桌面端尚未把远程包安装作为正式用户入口开放。`pack` 和 `publish`
生成的签名包、marketplace entry、市场索引用于提前验证分发元数据；正式用户
安装仍只支持本地目录安装和官方内置插件安装。

## 开发套件发布前检查

Thunder 仓库内维护公开插件开发套件时，先运行：

```bash
pnpm build:plugin-devkit
```

该命令会构建 `@thunder/plugin-cli`、`@thunder/plugin-sdk`、`@thunder/plugin-ui`、
`@thunder/plugin-schema`、`@thunder/plugin-protocol` 和 SDK worker 底层包，
确保发布产物使用 `dist` 入口而不是 workspace 内部 `src` 文件。

## 官方示例：提词器

`plugins/desktop/teleprompter` 不是最小 demo，而是第一批真实正式插件样板。它覆盖了：

- 共享 teleprompter UI / core 复用
- 与外部插件一致的 `thunder-plugin dev .` / `thunder-plugin build .` 流程
- 插件私有文稿存储
- trusted worker 能力调用
- 本地语音与 Sherpa 模型链路
- 安装、UI 资源读取、runtime 启停、`worker.invoke` 的端到端验证

## 发布前检查

- `plugin.json` 与实际构建产物一致
- 权限声明最小化
- trusted 插件仅在确实需要本地进程能力时使用
- 插件目录不包含 symlink
- 不依赖 Thunder 私有源码
- `dist/index.html` 和 `dist/worker.js` 均存在
- 生产包使用可信私钥签名

可运行聚焦测试：

```bash
pnpm test:plugins
```

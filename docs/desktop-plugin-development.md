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
thunder-plugin create my-plugin
thunder-plugin create my-native-plugin --template trusted-app
```

第一个命令生成没有 runtime 的 `sandboxed-ui` 插件。trusted 模板必须显式选择。

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

仓库内真实示例：

```text
plugins/desktop/teleprompter
```

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

然后通过插件市场安装本地目录，或直接调用：

```text
POST /api/v1/desktop/plugins/install/local
```

请求体：

```json
{
  "pluginPath": "D:/self/Thunder/plugins/desktop/teleprompter"
}
```

开发期间重新安装同一路径即可覆盖旧版本。平台会先停止旧 runtime，再原子替换已安装目录。

## 打包与签名

打包脚本仍用于正式分发准备：

```bash
pnpm --filter @thunder/api package:desktop-plugin -- \
  --plugin D:/self/Thunder/plugins/desktop/teleprompter \
  --private-key ./keys/plugin-signing.key \
  --key-id thunder-official-1 \
  --out dist/desktop-plugins \
  --base-url https://plugins.example.com/
```

输出：

- `{plugin-id}-{version}.tar.gz`
- `{plugin-id}-{version}.marketplace-entry.json`

当前桌面端尚未把远程包安装作为正式用户入口开放，但签名与 marketplace entry 结构已经保留。

## 官方示例：提词器

`plugins/desktop/teleprompter` 不是最小 demo，而是第一批真实正式插件样板。它覆盖了：

- 共享 teleprompter UI / core 复用
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

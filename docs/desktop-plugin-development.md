# Desktop Plugin Development Guide

本文档面向 Thunder Desktop 插件作者。平台机制与 API 列表见 `docs/desktop-plugin-system.md`。

## 开发边界

桌面插件是运行时能力，不是构建期模块。

你可以做：

- 提供独立插件 UI
- 通过 Browser SDK 访问宿主开放能力
- 通过 trusted worker 实现本地业务逻辑
- 复用公开插件基础设施，如 `@thunder/plugin-sdk`、`@thunder/plugin-ui`

你不能做：

- 直接 import `apps/web`、`apps/api`、Prisma 或主应用内部实现
- 假设和主应用同源
- 直接依赖 Tauri 内部对象或 Thunder 私有状态

## 目录结构

最小正式插件结构：

```text
my-plugin/
  plugin.json
  package.json
  tsconfig.json
  src/
    index.tsx
    worker.ts
  dist/
```

当前正式插件 UI 与 worker 均使用构建产物：

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
- `worker.invoke`
- `runtime.request` / `runtime.get` / `runtime.post`
- `network.request` / `network.get` / `network.post`

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
- 插件目录不包含 symlink
- 不依赖 Thunder 私有源码
- `dist/index.html` 和 `dist/worker.js` 均存在
- 生产包使用可信私钥签名

可运行聚焦测试：

```bash
pnpm test:plugins
```

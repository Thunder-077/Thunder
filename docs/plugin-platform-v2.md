# Plugin Platform v2

本文档说明 Thunder Desktop 新插件系统的 v2 设计与当前落地状态。它补充 `docs/desktop-plugin-system.md` 和 `docs/desktop-plugin-development.md`，聚焦 manifest v2、公开 SDK、trusted worker/runtime 与 Host Bridge。

## 范围

v2 只面向 Desktop 运行时插件，不改变 Web 端模块系统。

目标：

- 让外部开发者只依赖公开面开发插件。
- 让插件 UI、权限声明、trusted runtime 和宿主桥接保持一致。
- 让官方提词器插件成为新系统下的第一批真实插件之一。

当前仍不包含：

- 通用远程 marketplace 分发后端
- Web-only 插件运行时
- 细粒度动态授权弹窗

## Manifest v2

v2 插件必须提供 `plugin.json`：

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

关键字段：

- `manifestVersion: 2`
- `kind`: 当前支持 `trusted` 与预留的 `sandboxed`
- `contributes.sidebar.entry`: 插件侧边栏入口页面
- `runtime.entry`: trusted worker/runtime 入口
- `permissions`: v2 权限声明

## 权限模型

当前 v2 权限：

- `storage`: 插件私有键值存储
- `notifications`: 显示桌面内通知
- `activity`: 记录活动日志
- `microphone`: 麦克风能力声明
- `filesystem:plugin-data`: 插件数据目录读写
- `native-runtime`: 允许 trusted worker/runtime 执行本地高权限代码

`native-runtime` 是高风险权限。manifest v2 的 trusted 插件如果声明它，宿主会允许 `worker.invoke` 进入 trusted runtime。未声明时请求会被宿主拒绝。

## 公开 SDK

### `@thunder/plugin-sdk`

插件 UI 通过 `definePlugin()` 注册面板与命令：

```ts
import { definePlugin } from "@thunder/plugin-sdk"

export default definePlugin({
  setup(app) {
    app.panels.register("main", {
      title: "提词器",
      component: TeleprompterPanel,
    })

    app.commands.register("teleprompter.open", async () => {
      await app.navigation.openPanel("main")
    })
  },
})
```

### `@thunder/plugin-sdk/browser`

插件前端通过 Browser SDK 请求宿主：

```ts
import { thunder } from "@thunder/plugin-sdk/browser"

await thunder.storage.set("draft", { text: "hello" })
await thunder.notification.add({ title: "已保存" })
await thunder.worker.invoke("speech.transcribe", { text: "hello world" })
```

当前 Browser SDK 能力：

- `plugin.getManifest`
- `layout.setFrameHeight`
- `storage.*`
- `notification.add`
- `activity.track`
- `runtime.request`（仅 v1）
- `network.request`（v1 / 受控网络代理）
- `worker.invoke`（v2 trusted runtime）

### `@thunder/plugin-sdk/worker`

trusted runtime 通过 `defineWorker()` 导出 handler map：

```ts
import { defineWorker } from "@thunder/plugin-sdk/worker"

export default defineWorker({
  handlers: {
    async "speech.transcribe"(payload) {
      return { normalized: String(payload?.text ?? "").trim() }
    },
  },
})
```

## Trusted Worker / Runtime

v2 trusted runtime 由 `@thunder/plugin-host-runtime` 托管。

当前流程：

1. Desktop/API 侧读取已安装 v2 manifest。
2. 启动 trusted runtime supervisor。
3. supervisor 加载 `runtime.entry`，获取 `defineWorker().handlers`。
4. 宿主通过 pipe RPC 暴露一个本地 endpoint。
5. Web 宿主页收到 `worker.invoke` 后，通过 API 转发到 trusted runtime。
6. runtime 执行指定 handler 并返回结构化结果。

这条链已经被以下测试覆盖：

- `packages/plugin-host-runtime/src/runtime.test.ts`
- `packages/plugin-sdk/src/browser.test.ts`
- `apps/api/src/plugins/plugin-v2-e2e.test.ts`

## Host Bridge

v2 插件页面仍运行在 sandbox iframe 中，不能直接访问 Thunder 内部 API。所有宿主能力都要经过 Host Bridge。

当前 v2 方法与权限映射：

| Method | 权限 |
| --- | --- |
| `storage.get/set/remove/keys/clear` | `storage` |
| `notifications.show` | `notifications` |
| `activity.record` | `activity` |
| `worker.invoke` | `native-runtime` |

宿主页在处理桥接请求时会：

- 校验 iframe origin 和 `contentWindow`
- 校验当前页面加载的插件身份
- 校验 method 对应权限
- 对 `worker.invoke` 转发到 `/api/v1/desktop/plugins/:id/worker/invoke`

## API

新增 v2 相关接口：

```text
POST /api/v1/desktop/plugins/v2/install/local
POST /api/v1/desktop/plugins/:id/worker/invoke
```

说明：

- `v2/install/local`: 从本地已解压目录安装 manifest v2 插件
- `worker/invoke`: 宿主页内部使用，按 plugin id 转发 trusted runtime RPC

## Teleprompter v2

当前仓库里已经有一个 v2 teleprompter 插件包：

```text
plugins-v2/teleprompter/
  plugin.json
  src/index.tsx
  src/worker.ts
  src/plugin.test.ts
```

现阶段它完成了：

- v2 manifest
- public SDK 面板注册
- trusted worker handler
- 共享文稿编辑 / 分段预览 / follow session 逻辑复用
- Desktop speech bridge 接入后的模型列表、下载、激活、启动、停止和音频 feed
- 安装、UI 资源读取、trusted runtime 启停与 `worker.invoke` 的 e2e 验证

还没有完成的部分：

- worker crash recovery 与更强的可观测性
- 下载进度的事件驱动刷新与更完整的商用品质交互
- 主应用提词器能力向公开插件包的彻底迁移
- 远程分发打包约束

## 验证命令

当前 v2 相关验证：

```bash
pnpm --dir packages/plugin-cli exec tsc --noEmit
pnpm --dir packages/plugin-cli exec tsx src/index.test.ts
pnpm --dir packages/plugin-cli exec tsx src/index.ts build D:/self/Thunder/plugins-v2/teleprompter
pnpm --filter @thunder/plugin-sdk test:browser
pnpm --dir packages/plugin-host-runtime exec tsx src/runtime.test.ts
pnpm --dir apps/api exec tsx src/plugins/plugin-v2-e2e.test.ts
pnpm --filter @thunder/plugin-teleprompter-v2 test
pnpm --filter @thunder/plugin-teleprompter-v2 typecheck
pnpm --dir apps/web exec tsc --noEmit
pnpm --filter @thunder/web test:plugin-bridge
```

## 当前限制

- trusted runtime 目前是 Desktop only
- v2 本地安装链已经有了，但远程 marketplace 分发未完成
- `plugin-cli` 现在已经能完成 `create/build/pack`，`dev` 也会自动复用或拉起 `pnpm dev:desktop` 并同步当前插件，但它仍然缺少更细粒度的 worker 热重启反馈和自动打开页面动作
- plugin Devtools 已经内嵌到插件详情页并接了 manifest/runtime/storage/RPC 基础数据，但还没有独立窗口、下载进度等更完整的调试体验
- `plugins-v2/teleprompter` 已经不是纯骨架，但离 spec 里的 commercial-grade 完成态还有距离
- `teleprompter` 的本地语音能力仍然是插件自有 trusted 能力，尚未抽象为通用平台 speech API

# Thunder Plugin Platform

本文档描述 Thunder 当前正式桌面插件平台的总体设计。开发者使用方式见 `docs/desktop-plugin-development.md`，运行时行为与接口见 `docs/desktop-plugin-system.md`。

## 设计目标

Thunder 当前的插件平台只面向 Desktop 端，目标是提供一套可商用、可签名、可托管、可审计的正式插件能力：

- 插件 UI 作为独立静态应用运行，不直接耦合主应用源码。
- 插件本地能力通过受控 Host Bridge 暴露，不让插件直接拿到主应用内部实现。
- 插件运行时由平台托管，统一完成安装、启动、停止、升级、卸载和审计。
- 插件权限由 Manifest 显式声明，宿主按能力做校验。
- 官方插件与第三方插件使用同一套正式机制。

## 当前正式形态

当前正式插件系统采用两层形态：

- `manifestVersion: 2`
- `kind: "sandboxed"`：默认，仅包含 iframe UI 和显式 Host Bridge 能力
- `kind: "trusted"`：显式选择，可包含受托管的本地 runtime
- UI 入口：`contributes.sidebar.entry`
- Worker 入口：`runtime.entry`
- 安装目录：`plugins/desktop/{plugin-id}` 源目录，安装后复制到桌面数据目录

Thunder 已不再把旧桌面插件机制作为正式路线继续演进。当前代码中的部分 `V2` 命名仅是内部迁移遗留，不代表存在第二套对外系统。

## 架构分层

```text
plugin.json
  -> schema 校验
  -> Desktop Plugin Manager 安装 / 升级 / 卸载
  -> Host Page 以 iframe 加载 dist/index.html
  -> Browser SDK 通过 postMessage 调用 Host Bridge
  -> Host Bridge 校验权限并转发到平台能力
  -> 可选：Trusted Runtime Supervisor 启动独立子进程
  -> 私有 capability RPC 调用 dist/worker.js
```

职责分工：

- `packages/plugin-schema`: Manifest 定义与校验。
- `packages/plugin-protocol`: Host Bridge 协议、参数校验和权限映射。
- `packages/plugin-sdk`: 浏览器端与 worker 端公开 SDK。
- `packages/plugin-host-runtime`: trusted worker/runtime 的托管与 RPC。
- `apps/api/src/plugins/*`: 安装、清单读取、运行时生命周期、UI 资源读取。
- `apps/web/src/app/plugins/[pluginId]/page.tsx`: iframe 宿主页与 Host Bridge 处理。

## Manifest 要点

正式插件的核心字段：

```json
{
  "manifestVersion": 2,
  "id": "teleprompter",
  "name": "提词器",
  "version": "0.1.0",
  "kind": "trusted",
  "permissions": ["storage", "notifications", "activity", "native-runtime"],
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

平台会验证：

- `id` 格式合法且稳定。
- `contributes.sidebar.entry` 与 `runtime.entry` 必须是插件目录内相对路径。
- 入口文件必须真实存在。
- 插件目录不能包含 symlink。
- 生产环境签名必须有效。

## Host Bridge

插件页面不能直接访问 Thunder 内部源码或主应用状态。前端必须通过 `@thunder/plugin-sdk/browser` 与宿主通信。

当前正式 Host Bridge 能力：

- `plugin.getManifest`
- `plugin.setFrameHeight`
- `theme.onChange`
- `storage.get`
- `storage.set`
- `storage.remove`
- `storage.keys`
- `storage.clear`
- `notification.add`
- `activity.track`
- `network.request`
- `worker.invoke`

权限由宿主页按方法校验，不信任插件自行声称的能力。

Host Bridge 的唯一协议源是 `packages/plugin-protocol`。它统一维护协议
版本、消息 envelope、方法参数、返回值和权限映射；SDK 与宿主不得各自
维护方法清单。

`storage.*` 方法的实际存储后端是宿主页（`apps/web/src/app/plugins/[pluginId]/page.tsx`）
持有的 IndexedDB，详见 `docs/desktop-plugin-system.md#插件存储后端`。
协议层只关心方法与权限，不耦合到具体存储实现。

网络能力由 API 代理实现，并使用 `network:<origin>` 精确授权；iframe
自身的 CSP 不开放外部连接。当前稳定能力不包含 Secrets、命令贡献点或
设置贡献点。`runtime.*`、`secrets`、`contributes.commands` 和
`contributes.settings` 不提供兼容层。

## Trusted Worker / Runtime

trusted runtime 不是插件自行暴露的 HTTP 服务，而是由平台统一托管的独立
子进程能力层：

- 由 `packages/plugin-host-runtime` 启动和监管。
- 每个插件一个 Node 子进程，与 API 主进程隔离崩溃和全局状态。
- 通过带 `pluginId` 和随机 capability 的私有 pipe/socket RPC 调用 handler。
- endpoint 只存在于 API 内部，不属于公开插件协议。
- 子进程使用最小环境变量白名单和 256 MiB old space 限制。
- 支持按插件维度启动、复用、停止、崩溃退避和熔断。
- 当前正式能力重点是 `worker.invoke`。

这也是提词器插件接入本地语音能力、Sherpa 模型能力和文稿存储能力的基础。

## 安装与分发

当前正式安装入口有两类：

1. 本地目录安装：开发态使用。
2. 官方内置插件安装：从 `plugins/desktop/` 等受控目录复制。

插件打包、签名和 marketplace entry 构建链路已经存在，但桌面端当前尚未开放远程签名包安装为正式用户入口；`/install/package` 仍保留为未启用状态。

## 目录约定

仓库内官方桌面插件目录：

```text
plugins/desktop/{plugin-id}/
  plugin.json
  package.json
  tsconfig.json
  src/
  dist/
```

桌面数据目录安装后结构：

```text
AppData/com.thunder.desktop/
  plugins/
    {plugin-id}/
      plugin.json
      dist/
      .thunder-install.json
  plugin-staging/
  plugin-audit.jsonl
```

## 官方示例

当前第一批正式插件样板为：

- `plugins/desktop/teleprompter`

它用于验证真实外部开发链路，而不是一次性演示性质的最小样板。

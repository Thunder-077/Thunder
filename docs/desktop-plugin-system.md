# 桌面端插件系统

Thunder 运行时插件系统只面向 Desktop 端，采用 `sandboxed` 默认、`trusted` 例外的两层模型。插件作者指南见 `docs/desktop-plugin-development.md`，整体平台设计见 `docs/plugin-platform.md`。

## 范围

运行时插件是构建期内置模块之外的扩展能力：

- 仅 Desktop 生效。
- 通过安装进入插件市场与侧边栏。
- UI 在独立 iframe 中运行。
- 默认插件通过 Host Bridge 使用受控能力；只有 trusted 插件可以使用 worker/runtime。

## 存储布局

```text
AppData/com.thunder.desktop/
  plugins/
    {plugin-id}/
      plugin.json
      dist/
      .thunder-install.json
  plugin-data/
    {plugin-id}/
  plugin-staging/
  plugin-audit.jsonl
```

开发环境下，插件根目录会根据本地 SQLite `DATABASE_URL` 推导，也可以通过 `THUNDER_DESKTOP_DATA_DIR` 覆盖。

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
  "author": { "name": "Thunder" },
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

平台会校验：

- `id` 只能使用小写字母、数字和连字符。
- `contributes.sidebar.entry` 和 `runtime.entry` 必须是插件目录内相对路径。
- 入口文件必须存在。
- 插件目录不能包含 symlink。
- 生产环境签名必须可信。

## 权限模型

当前正式权限：

- `storage`
- `notifications`
- `activity`
- `microphone`
- `native-runtime`
- `filesystem:plugin-data`
- `network:<origin>`，例如 `network:https://api.example.com`

平台不会做每次调用级别的动态授权弹窗。权限与信任在安装/升级时确认：

- sandboxed 插件若只声明低风险能力，会记录为 `sandboxed-default` 信任来源。
- trusted 插件，或声明 `native-runtime`、`filesystem:plugin-data`、`microphone`
  等高风险能力的插件，安装时必须确认权限列表、插件 kind 和 Manifest 摘要。
- 官方内置插件通过 `install/bundled` 安装时记录为 `official-bundled`。
- 本地目录或远程包安装如果缺少匹配的信任确认，会返回 409。
- trusted runtime 启动前会再次读取 `.thunder-install.json`，未完成信任确认
  的 trusted 插件不能启动本地进程。

当前不提供单独的 trust / untrust 按钮；停用通过卸载完成。升级时如果 Manifest
摘要、kind 或权限集合变化，需要重新确认。

## Host Bridge

插件 iframe 与宿主页之间通过 `postMessage` 通信，插件侧必须使用 `@thunder/plugin-sdk/browser`，不要手写协议。

当前正式 Host Bridge 方法：

| Method | 权限 | 说明 |
|--------|------|------|
| `plugin.getManifest` | 无 | 返回当前插件 Manifest |
| `layout.setFrameHeight` | 无 | 调整 iframe 高度 |
| `storage.get` | `storage` | 读取插件私有存储 |
| `storage.set` | `storage` | 写入插件私有存储 |
| `storage.remove` | `storage` | 删除单个存储 key |
| `storage.keys` | `storage` | 列出插件存储 key |
| `storage.clear` | `storage` | 清空插件存储 |
| `notification.add` | `notifications` | 触发桌面通知 |
| `activity.track` | `activity` | 记录活动 |
| `network.request` | `network:<origin>` | 通过宿主代理访问精确授权的 origin |
| `worker.invoke` | `native-runtime` | 调用 trusted worker handler |
| `events.broadcast` | 无 | 向当前已加载的其他插件 iframe 广播轻量事件 |

宿主会同时校验：

- `event.origin`
- `event.source`
- bridge `source` / `version`
- 当前页面绑定的插件 id
- 对应方法所需权限

插件页面不会被允许直接作为同源页面访问 Thunder 内部 API。

Bridge 契约统一定义在 `packages/plugin-protocol`。Browser SDK 与 Web
宿主共享同一套方法、参数、响应和权限映射，并通过契约测试防止两端漂移。

网络请求由 API 代理执行，不向 iframe 开放外部 `connect-src`，重定向后的
origin 也必须已声明。`events.broadcast` 只做当前宿主页内的即时转发，不保证
持久化、重放或跨进程投递。当前不支持 Secrets、命令贡献点或设置贡献点。Manifest 声明
`secrets`、`contributes.commands` 或 `contributes.settings` 会被拒绝。

资源限制：插件存储总量 1 MiB、单值 256 KiB、Bridge 请求 512 KiB、
网络请求体 1 MiB、网络响应 5 MiB、网络超时 10 秒。

### 插件存储后端

`storage.*` 桥接方法在宿主页 `apps/web/src/lib/desktop-plugin-bridge.ts`
中通过桌面 API 调用 `/api/v1/desktop/plugins/:id/storage*`，后端使用插件
私有 SQLite 文件：

```text
plugin-data/{plugin-id}/storage.db
```

后端在每次 storage API 调用前都会读取已安装 Manifest 并校验 `storage`
权限。插件 iframe 不能绕过 Host Bridge 直接拿到同源内部状态。

配额校验改为 O(1)：每次写入只读取对应 pluginId 的 `totals` 记录并按
delta 增减，扫描次数与键数量无关。`storage.set` 在写入前会：

1. 序列化并计算新值字节数；超过 256 KiB 拒绝。
2. 读取同 key 旧记录，计算 `nextBytes = currentBytes - oldSize + newSize`；
   超过 1 MiB 拒绝。
3. 在单个 SQLite 事务中写入新记录与 totals。

存储接口 `DesktopPluginHostStorage` 全部为 async；调用方（宿主页
`page.tsx`）和 dispatcher 已经统一 `await`。

## Trusted Worker / Runtime

trusted runtime 由平台统一托管，不暴露为插件自行控制的公开 HTTP 服务。

核心行为：

- 每个 trusted 插件运行在独立 Node 子进程中，不与 API 主进程共享
  JavaScript isolate、全局变量或崩溃边界。
- 平台按插件 id 维度启动与复用 runtime；并发启动请求只创建一个进程。
- 插件页面按需触发启动。
- 升级、重装、卸载前会先停止旧 runtime。
- `worker.invoke` 通过带插件身份和随机 capability 的私有 pipe/socket RPC
  调用 `dist/worker.js` 导出的 handler。
- pipe/socket endpoint 仅保存在 API 进程内，不通过 REST、Web SDK 或开发者
  工具公开。
- 子进程只继承平台允许的最小环境变量；不会继承数据库连接、签名密钥或
  Node 注入参数。
- 只有声明 `filesystem:plugin-data` 时，子进程才收到
  `THUNDER_PLUGIN_DATA_DIR`，目录固定为 `plugin-data/{plugin-id}`。
- 单进程默认限制为 256 MiB old space、8 个并发调用、1 MiB 请求和
  5 MiB 响应。
- 异常退出按 1 秒、5 秒、30 秒退避；5 分钟内连续崩溃 3 次会打开
  5 分钟熔断。手动启动会清除熔断状态。

公开 runtime 状态只包含 `phase`、`running`、`pid`、启动/退出时间、
退出码、连续崩溃次数、熔断时间和脱敏错误，不包含内部 endpoint。

当前正式桌面插件的本地业务能力优先走 worker，而不是额外自建旁路协议。

## 安装与升级

当前正式入口：

```text
GET    /api/v1/desktop/plugins
GET    /api/v1/desktop/plugins/marketplace
GET    /api/v1/desktop/plugins/:id
POST   /api/v1/desktop/plugins/install/local
POST   /api/v1/desktop/plugins/install/bundled
DELETE /api/v1/desktop/plugins/:id
GET    /api/v1/desktop/plugins/:id/ui/*
POST   /api/v1/desktop/plugins/:id/worker/invoke
GET    /api/v1/desktop/plugins/:id/runtime
GET    /api/v1/desktop/plugins/:id/runtime/events
POST   /api/v1/desktop/plugins/:id/runtime/start
POST   /api/v1/desktop/plugins/:id/runtime/stop
POST   /api/v1/desktop/plugins/:id/runtime/reload
```

说明：

- `install/local`: 开发态安装本地目录；高风险插件必须携带 `trustDecision`。
- `install/bundled`: 从官方内置插件目录按 `pluginId` 安装。
- `install/package`: 当前仍未作为正式能力启用。
- `runtime/events` 与 `runtime/reload`: 宿主页和开发态工具使用的辅助入口，不作为插件作者直接调用的稳定 API。

替换同 id 插件时会走升级路径：

1. 校验插件目录、Manifest、入口文件和 symlink 风险。
2. 把新插件复制到 `plugin-staging/{plugin-id}-*/prepared`，并写入新的安装记录。
3. 对同一个 `plugin-id` 获取进程内操作锁，串行化安装、升级和卸载。
4. 读取当前安装记录并校验信任确认；升级时如果 Manifest 摘要、kind 或权限集合变化，需要新的确认。
5. 停止旧 runtime，把旧目录 rename 到 staging backup，再把 prepared 目录 rename 到正式安装目录。
6. 如果目录切换失败，平台会删除失败的新目录并把 backup 恢复到原安装目录，然后记录 `plugin.install-failed` 审计事件。
7. 替换成功后才写入安装/升级审计日志和活动记录。

`.thunder-install.json` 会记录 `trust` 字段，包括信任来源、确认时间、
Manifest 摘要、kind、权限快照和高风险权限。该记录用于后续 trusted runtime
启动前的强制校验。

## 官方内置插件

官方插件目录已经统一为：

```text
plugins/desktop/{plugin-id}
```

开发环境和正式桌面运行时都可以扫描该目录，或通过 `THUNDER_BUNDLED_PLUGIN_DIRS` 扩展受控目录。

## 验证

插件系统聚焦验证命令：

```bash
pnpm test:plugins
```

开发套件发布前还应运行：

```bash
pnpm build:plugin-devkit
```

该命令验证公开 CLI、SDK、UI、schema 和 protocol 包都能生成 `dist` 发布产物。

当前还包含独立用例：

- `apps/api/src/plugins/desktop-plugin-manager.test.ts`
- `apps/api/src/plugins/desktop-plugin-routes.test.ts`
- `apps/api/src/plugins/desktop-plugin-e2e.test.ts`

## 官方提词器插件

当前第一批正式插件样板是 `plugins/desktop/teleprompter`。

它验证了真实商用链路：

- 插件 UI 运行在独立 iframe 中
- 通过 `@thunder/plugin-sdk/browser` 调用 Host Bridge
- 通过 trusted worker 提供本地语音相关能力
- 复用共享 teleprompter core / UI，而不是复制一套页面实现

## 安全规则

- 插件目录不能越界访问。
- 安装时拒绝 symlink。
- 插件 iframe 运行在 sandbox 中。
- 宿主会校验 bridge 来源、插件身份和权限。
- trusted 插件独占子进程，进程崩溃不会直接终止 API 主进程。
- 生产环境安装要求签名可信。
- 审计日志写入 `plugin-audit.jsonl`。
- **进程隔离不是 OS 级沙箱**：trusted 插件子进程与宿主使用相同的操作系统用户权限，可以访问本地文件系统。进程隔离提供的是崩溃边界和环境变量隔离，而非完整的安全沙箱。用户应只安装来自可信来源的 trusted 插件。

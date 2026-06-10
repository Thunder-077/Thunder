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

平台不会做细粒度动态授权弹窗。用户安装插件即表示允许插件使用 Manifest 中声明的平台能力。当前也不提供单独的 trust / untrust 按钮；停用通过卸载完成。

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
origin 也必须已声明。当前不支持 Secrets、命令贡献点或设置贡献点。Manifest 声明
`secrets`、`contributes.commands` 或 `contributes.settings` 会被拒绝。

资源限制：插件存储总量 1 MiB、单值 256 KiB、Bridge 请求 512 KiB、
网络请求体 1 MiB、网络响应 5 MiB、网络超时 10 秒。

### 插件存储后端

`storage.*` 桥接方法在宿主页 `apps/web/src/app/plugins/[pluginId]/page.tsx`
中落到 IndexedDB（数据库 `thunder-desktop-plugins`），不再使用
`window.localStorage`：

- `kv` store：以 `[pluginId, key]` 为复合主键存 `{ size, value }`
- `totals` store：以 `pluginId` 为主键存当前累计字节数

宿主是 Tauri WebView 时，IndexedDB 落到 WebView 的用户数据目录
（Windows 上是 `AppData/Local/com.thunder.desktop/EBWebView/`），跨应用
重启持久化。未来 Web 端也使用同一份代码，存储直接走浏览器 IndexedDB
配额（远大于 localStorage 的 5 MiB 上限）。

配额校验改为 O(1)：每次写入只读取对应 pluginId 的 `totals` 记录并按
delta 增减，扫描次数与键数量无关。`storage.set` 在写入前会：

1. 序列化并计算新值字节数；超过 256 KiB 拒绝。
2. 读取同 key 旧记录，计算 `nextBytes = currentBytes - oldSize + newSize`；
   超过 1 MiB 拒绝。
3. 在单个 readwrite 事务中写入新记录与新 totals。

存储接口 `DesktopPluginHostStorage` 全部为 async；调用方（宿主页
`page.tsx`）和 dispatcher 已经统一 `await`。

## Trusted Worker / Runtime

trusted runtime 由平台统一托管，不暴露为插件自行控制的公开 HTTP 服务。

核心行为：

- 平台按插件 id 维度启动与复用 runtime。
- 插件页面按需触发启动。
- 升级、重装、卸载前会先停止旧 runtime。
- `worker.invoke` 通过受控 RPC 调用 `dist/worker.js` 导出的 handler。

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
POST   /api/v1/desktop/plugins/:id/runtime/start
```

说明：

- `install/local`: 开发态安装本地目录。
- `install/bundled`: 从官方内置插件目录按 `pluginId` 安装。
- `install/package`: 当前仍未作为正式能力启用。

替换同 id 插件时会走升级路径：

1. 停止旧 runtime。
2. 把新插件复制到 staging。
3. 原子替换已安装目录。
4. 写入安装记录与审计日志。

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
- 生产环境安装要求签名可信。
- 审计日志写入 `plugin-audit.jsonl`。

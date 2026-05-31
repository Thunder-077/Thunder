# Thunder Desktop

Thunder 的 Tauri 桌面壳。

## 当前阶段

当前已实现到 Phase 3 的基础桌面能力：

- `apps/desktop` 只负责 Tauri 窗口和桌面生命周期
- 桌面窗口直接加载本地开发中的 `apps/web`
- 业务功能仍然复用现有 `apps/web` + `apps/api`
- 已接入系统托盘、关闭到托盘、全局快捷键
- 已接入 GitHub Releases 自动更新链路
- 生产态会自带本地 `web + api` sidecar，不再依赖单独部署 CF Web / API
- 生产态桌面 API 会强制使用应用数据目录中的本地 SQLite 数据库，数据库不从运行时 `desktop.env` 读取
- 如果 `3000 / 3001` 已经有 Thunder 开发服务在跑，桌面壳会直接复用，不会重复启动

## 开发命令

```bash
pnpm dev:desktop
```

该命令会：

1. 启动 `apps/web`
2. 启动 `apps/api`
3. 打开 Tauri 桌面窗口

## 发布命令

```bash
pnpm version:set 0.1.1
pnpm version:check
pnpm build:desktop
```

如果某些业务模块不需要进入桌面包，可以追加排除参数：

```bash
pnpm build:desktop -- --exclude=emby
```

桌面构建默认以 `desktop` 平台生成模块入口；声明为 `platforms: ["web"]` 的模块不会进入桌面 Web/API 运行时。

发布前还需要配置：

- `THUNDER_DESKTOP_UPDATER_ENDPOINT`
- `TAURI_SIGNING_PUBLIC_KEY`
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

这些值可以放在本地 `apps/desktop/desktop.env`，不必手动放到 shell 环境变量中。该文件已被 `.gitignore` 忽略。

桌面端运行时配置文件位于应用配置目录下，同样名为 `desktop.env`。它只用于第三方服务和功能性环境变量；数据库连接由桌面壳在启动时自动注入为本地 SQLite 文件，不能通过 `desktop.env` 覆盖。

可配置的运行时变量示例：

```env
EMBY_PUBLIC_BASE_URL="https://..."
EMBY_EMOS_BASE_URL="https://..."
EMBY_EMOS_TOKEN="..."
EMBY_TMDB_API_TOKEN="..."
QWEATHER_API_HOST="..."
QWEATHER_KEY_ID="..."
QWEATHER_PROJECT_ID="..."
QWEATHER_PRIVATE_KEY="..."
```

更完整的 CI / Release 说明见 [docs/desktop-release.md](/D:/self/Thunder/docs/desktop-release.md)。

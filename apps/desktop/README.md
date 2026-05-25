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

发布前还需要配置：

- `THUNDER_DESKTOP_UPDATER_ENDPOINT`
- `TAURI_SIGNING_PUBLIC_KEY`
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

这些值可以放在本地 `apps/desktop/desktop.env`，不必手动放到 shell 环境变量中。该文件已被 `.gitignore` 忽略。

如果桌面端运行时仍然连接远程数据库，请在应用配置目录提供 `desktop.env`，至少包含 `DATABASE_URL`。

更完整的 CI / Release 说明见 [docs/desktop-release.md](/D:/self/Thunder/docs/desktop-release.md)。

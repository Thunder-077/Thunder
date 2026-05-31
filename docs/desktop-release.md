# Desktop Release

Thunder 桌面端当前采用 `本地 Web + 本地 API + 本地 SQLite` 的桌面运行时，
并使用 `GitHub Actions + GitHub Releases + Tauri updater` 发布安装包。

## 产物策略

- 桌面壳继续保持 `apps/desktop`
- 生产版 WebView 加载本机 `127.0.0.1`
- 桌面端启动后先拉起本地 Next server 和本地 Hono API server
- 安装包与 `latest.json` 由 GitHub Release 承载
- 桌面应用通过 Tauri updater 检查、下载、安装更新

这样做的目的很明确：

- 不需要把 Web / API 单独部署到 Cloudflare
- 不需要用户配置数据库，桌面端数据默认存储在系统应用数据目录
- 保持现有 `apps/web -> @thunder/api-client -> apps/api` 业务链路不变
- 桌面端只负责原生壳能力、本地 sidecar 生命周期与分发升级

## 必需的 GitHub 配置

在仓库 Settings 中配置以下项：

- Actions variable: `TAURI_SIGNING_PUBLIC_KEY`
- Actions secret: `TAURI_SIGNING_PRIVATE_KEY`
- Actions secret: `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

说明：

- `TAURI_SIGNING_PUBLIC_KEY` 必须是 `tauri signer generate` 输出的完整 `Public:` 内容
- `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 用于 CI 签名安装包和 updater 产物

## 本地发布配置

如果不想把签名配置放到 shell 环境变量中，可以在本地创建 `apps/desktop/desktop.env`。
该文件已加入 `.gitignore`，只用于本机发布构建，不应提交。

示例：

```env
THUNDER_DESKTOP_UPDATER_ENDPOINT="https://github.com/Thunder-077/Thunder/releases/latest/download/latest.json"
TAURI_SIGNING_PUBLIC_KEY="Public: ..."
TAURI_SIGNING_PRIVATE_KEY="D:\\self\\Thunder\\apps\\desktop\\keys\\thunder-updater.key"
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="..."
```

本地执行 `pnpm build:desktop` 时，`apps/desktop/scripts/build-release.mjs` 会读取这个文件，
再把变量传给 Tauri 构建进程。CI 仍然使用 GitHub Actions variables / secrets。

## 运行时配置

桌面应用生产态不会直接继承你开发机里的 shell 环境变量。
如果本地 sidecar 需要第三方服务配置，请在应用配置目录下放置运行时 `desktop.env`。
它和上面的 `apps/desktop/desktop.env` 不是同一个文件：前者给已安装应用运行时读取，后者给本地构建读取。

数据库不在这里配置。生产态桌面壳会在启动时自动使用应用数据目录中的 SQLite 文件，例如 Windows 下的 `%APPDATA%/com.thunder.desktop/app.db`。运行时 `desktop.env` 中的数据库配置会被忽略。

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

## 本地版本管理

桌面端版本号需要同时保持以下三个文件一致：

- `apps/desktop/package.json`
- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/src-tauri/Cargo.toml`

使用命令：

```bash
pnpm version:set 0.1.1
pnpm version:check
```

## 发布流程

1. 本地更新桌面端版本：`pnpm version:set <version>`
2. 校验版本同步：`pnpm version:check`
3. 提交代码并创建 tag：`desktop-v<version>`
4. Push tag 到 GitHub
5. `desktop-release.yml` 会为 Windows / macOS / Linux 构建安装包并发布 Release
6. 发布后的 `latest.json` 会成为桌面端自动更新源

## 关键文件

- GitHub workflow: `.github/workflows/desktop-release.yml`
- 本地 runtime 构建：`apps/desktop/scripts/build-local-runtime.mjs`
- Node runtime 准备：`apps/desktop/scripts/prepare-node-runtime.mjs`
- 生产配置生成：`apps/desktop/scripts/prepare-release-config.mjs`
- Tauri 基础配置：`apps/desktop/src-tauri/tauri.conf.json`
- 平台更新接口：`packages/platform/src/index.ts`
- 桌面更新 UI：`apps/web/src/components/desktop-runtime-card.tsx`

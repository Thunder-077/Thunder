# @thunder/plugin-cli

Thunder 桌面插件开发命令行工具。

常用命令：

```bash
npx thunder-plugin create my-plugin
cd my-plugin
npm install
npx thunder-plugin dev .
npx thunder-plugin pack . --entry --out dist/desktop-plugins
```

本地调试需要 Thunder Desktop Dev Host 正在运行。仓库内开发时 CLI 会尝试自动
启动 `pnpm dev:desktop`；外部项目可通过 `THUNDER_PLUGIN_DEV_API_URL` 指向
已运行的宿主 API。

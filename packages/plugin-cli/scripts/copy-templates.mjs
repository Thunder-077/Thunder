import { cp, chmod } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))

// 构建发布包时保留脚手架模板，并确保 CLI 入口在类 Unix 环境可直接执行。
await cp(join(packageRoot, "src", "templates"), join(packageRoot, "dist", "templates"), {
  recursive: true,
})
await chmod(join(packageRoot, "dist", "index.js"), 0o755)

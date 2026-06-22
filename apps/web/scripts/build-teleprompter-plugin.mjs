import { spawnSync } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = resolve(scriptDir, "..", "..", "..")
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm"

// 保留旧入口，实际构建统一交给官方插件自己的 thunder-plugin 脚本。
const result = spawnSync(
  pnpmCommand,
  ["--dir", workspaceRoot, "--filter", "@thunder/plugin-teleprompter-v2", "build"],
  {
    stdio: "inherit",
  },
)

process.exit(result.status ?? 1)

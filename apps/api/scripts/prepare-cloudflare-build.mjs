import { spawn } from "node:child_process"
import { resolve } from "node:path"

const apiRoot = resolve(import.meta.dirname, "..")
const workspaceRoot = resolve(apiRoot, "..", "..")

// Wrangler 在 Cloudflare 构建环境中可能直接执行 versions upload，
// 这里集中生成它打包源码时需要解析到的 workspace 构建产物。
await run("pnpm", ["--filter", "@thunder/database", "db:generate"])
await run("pnpm", ["--filter", "@thunder/plugin-schema", "build"])
await run("pnpm", ["--filter", "@thunder/plugin-protocol", "build"])
await run("node", [resolve(workspaceRoot, "scripts", "generate-enabled-modules.mjs")])

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = process.platform === "win32"
      ? spawn("cmd.exe", ["/d", "/s", "/c", command, ...args], {
        cwd: workspaceRoot,
        stdio: "inherit",
        shell: false,
      })
      : spawn(command, args, {
        cwd: workspaceRoot,
        stdio: "inherit",
        shell: false,
      })

    child.on("error", rejectRun)
    child.on("exit", (code) => {
      if (code === 0) {
        resolveRun()
        return
      }

      rejectRun(new Error(`${command} ${args.join(" ")} exited with code ${code ?? -1}`))
    })
  })
}

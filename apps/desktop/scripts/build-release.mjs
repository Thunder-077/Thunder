import { spawn } from "node:child_process"
import { loadDesktopEnv } from "./desktop-env.mjs"

await loadDesktopEnv()

// 解析外部命令行参数并塞入环境变量，确保能够自动遗传给由 Tauri 启动的 beforeBuildCommand (build-local-runtime.mjs)
for (let i = 0; i < process.argv.length; i++) {
  const arg = process.argv[i]
  if (arg.startsWith("--exclude=")) {
    process.env.EXCLUDE_MODULES = arg.split("=")[1]
  } else if (arg === "--exclude" && i + 1 < process.argv.length) {
    process.env.EXCLUDE_MODULES = process.argv[i + 1]
  }
}

await run("node", ["./scripts/prepare-release-config.mjs"])
await run("tauri", ["build", "--config", "src-tauri/tauri.release.conf.json"])

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      shell: process.platform === "win32",
      stdio: "inherit",
    })

    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`))
    })
  })
}

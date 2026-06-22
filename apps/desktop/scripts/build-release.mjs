import { spawn } from "node:child_process"
import { rm } from "node:fs/promises"
import { resolve } from "node:path"
import { loadDesktopEnv } from "./desktop-env.mjs"

const desktopRoot = resolve(import.meta.dirname, "..")
const releaseTargetDir = resolve(desktopRoot, "src-tauri", "target", "release")
const releaseStagingDirs = ["bundle", "_up_", "resources", "wix", "nsis"]

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

async function cleanReleaseStaging() {
  for (const dirName of releaseStagingDirs) {
    await rm(resolve(releaseTargetDir, dirName), { recursive: true, force: true })
  }
}

await run("node", ["./scripts/prepare-release-config.mjs"])
await cleanReleaseStaging()
await run("tauri", ["build", "--config", "src-tauri/tauri.release.conf.json"])

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = process.platform === "win32"
      ? spawn("cmd.exe", ["/d", "/s", "/c", command, ...args], {
        env: process.env,
        shell: false,
        stdio: "inherit",
      })
      : spawn(command, args, {
      env: process.env,
        shell: false,
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

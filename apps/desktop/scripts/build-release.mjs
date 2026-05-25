import { spawn } from "node:child_process"
import { loadDesktopEnv } from "./desktop-env.mjs"

await loadDesktopEnv()

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

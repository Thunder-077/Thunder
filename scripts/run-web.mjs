import { spawn } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = resolve(scriptDir, "..")

const mode = process.argv[2]
const forwardedArgs = process.argv.slice(3)

if (mode !== "dev" && mode !== "build") {
  throw new Error("Usage: node scripts/run-web.mjs <dev|build> [...args]")
}

const env = { ...process.env }
const webRoot = resolve(workspaceRoot, "apps", "web")
const nextBin = resolve(webRoot, "node_modules", "next", "dist", "bin", "next")

for (let i = 0; i < forwardedArgs.length; i++) {
  const arg = forwardedArgs[i]
  if (arg.startsWith("--exclude=") || arg.startsWith("--exclude-modules=")) {
    env.THUNDER_EXCLUDE_MODULES = arg.split("=")[1]
  } else if ((arg === "--exclude" || arg === "--exclude-modules") && forwardedArgs[i + 1]) {
    env.THUNDER_EXCLUDE_MODULES = forwardedArgs[i + 1]
  } else if (arg.startsWith("--platform=")) {
    env.THUNDER_TARGET_PLATFORM = arg.split("=")[1]
  } else if (arg === "--platform" && forwardedArgs[i + 1]) {
    env.THUNDER_TARGET_PLATFORM = forwardedArgs[i + 1]
  }
}

env.THUNDER_TARGET_PLATFORM ??= "web"
env.NEXT_PUBLIC_PLATFORM = env.THUNDER_TARGET_PLATFORM
env.NEXT_PUBLIC_EXCLUDE_MODULES = env.THUNDER_EXCLUDE_MODULES ?? ""

await run("node", [resolve(workspaceRoot, "scripts/generate-enabled-modules.mjs")], { env })

if (mode === "build") {
  await runPnpm([
    "--filter",
    "@thunder/plugin-schema",
    "--filter",
    "@thunder/plugin-protocol",
    "build",
  ], { env })
}

const nextArgs = [mode, "--webpack"]
await run(process.execPath, [nextBin, ...nextArgs], {
  cwd: webRoot,
  env,
})

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(resolveCommand(command), args, {
      cwd: workspaceRoot,
      stdio: "inherit",
      ...options,
    })

    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? -1}`))
    })
  })
}

function runPnpm(args, options = {}) {
  if (process.env.npm_execpath) {
    return run(process.execPath, [process.env.npm_execpath, ...args], options)
  }
  return run("pnpm", args, options)
}

function resolveCommand(command) {
  if (process.platform === "win32" && ["pnpm", "npm", "tauri"].includes(command)) {
    return `${command}.cmd`
  }
  return command
}

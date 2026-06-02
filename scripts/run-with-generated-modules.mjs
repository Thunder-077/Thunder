import { spawn } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = resolve(scriptDir, "..")

const args = process.argv.slice(2)
const separatorIndex = args.indexOf("--")

if (separatorIndex < 0 || separatorIndex === args.length - 1) {
  throw new Error("Usage: node scripts/run-with-generated-modules.mjs [--platform <web|desktop>] -- <command> [...args]")
}

const wrapperArgs = args.slice(0, separatorIndex)
const command = args[separatorIndex + 1]
const commandArgs = args.slice(separatorIndex + 2)
const env = { ...process.env }

for (let index = 0; index < wrapperArgs.length; index += 1) {
  const arg = wrapperArgs[index]
  if (arg.startsWith("--platform=") || arg.startsWith("--target=")) {
    env.THUNDER_TARGET_PLATFORM = arg.split("=")[1]
  } else if ((arg === "--platform" || arg === "--target") && wrapperArgs[index + 1]) {
    env.THUNDER_TARGET_PLATFORM = wrapperArgs[index + 1]
    index += 1
  }
}

for (let index = 0; index < commandArgs.length; index += 1) {
  const arg = commandArgs[index]
  if (arg.startsWith("--exclude=") || arg.startsWith("--exclude-modules=")) {
    const excluded = arg.split("=")[1]
    env.THUNDER_EXCLUDE_MODULES = excluded
    env.EXCLUDE_MODULES = excluded
    env.NEXT_PUBLIC_EXCLUDE_MODULES = excluded
  } else if ((arg === "--exclude" || arg === "--exclude-modules") && commandArgs[index + 1]) {
    const excluded = commandArgs[index + 1]
    env.THUNDER_EXCLUDE_MODULES = excluded
    env.EXCLUDE_MODULES = excluded
    env.NEXT_PUBLIC_EXCLUDE_MODULES = excluded
    index += 1
  } else if (arg.startsWith("--platform=") || arg.startsWith("--target=")) {
    env.THUNDER_TARGET_PLATFORM = arg.split("=")[1]
  } else if ((arg === "--platform" || arg === "--target") && commandArgs[index + 1]) {
    env.THUNDER_TARGET_PLATFORM = commandArgs[index + 1]
    index += 1
  }
}

env.THUNDER_TARGET_PLATFORM ??= "web"
env.NEXT_PUBLIC_PLATFORM = env.THUNDER_TARGET_PLATFORM
env.NEXT_PUBLIC_EXCLUDE_MODULES ??= env.THUNDER_EXCLUDE_MODULES ?? ""

await run("node", [resolve(workspaceRoot, "scripts", "generate-enabled-modules.mjs")], { env })
await run(command, commandArgs, { env })

function run(commandName, commandArgs, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child =
      process.platform === "win32"
        ? spawn("cmd.exe", ["/d", "/s", "/c", commandName, ...commandArgs], {
            cwd: workspaceRoot,
            stdio: "inherit",
            shell: false,
            ...options,
          })
        : spawn(commandName, commandArgs, {
            cwd: workspaceRoot,
            stdio: "inherit",
            shell: false,
            ...options,
          })

    child.on("error", rejectPromise)
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }

      rejectPromise(new Error(`${commandName} ${commandArgs.join(" ")} exited with code ${code ?? -1}`))
    })
  })
}

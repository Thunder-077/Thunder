import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, posix, resolve } from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const desktopRoot = resolve(scriptDir, "..")
const workspaceRoot = resolve(desktopRoot, "..", "..")
const runtimeDir = resolve(desktopRoot, "runtime")
const runtimeWebDir = resolve(runtimeDir, "web")
const runtimeServicesDir = resolve(runtimeDir, "services")
const runtimePluginsDir = resolve(runtimeDir, "plugins")
const runtimeManifestPath = resolve(runtimeDir, "manifest.json")
const webPort = Number(process.env.THUNDER_DESKTOP_WEB_PORT ?? "43100")
const apiPort = Number(process.env.THUNDER_DESKTOP_API_PORT ?? "43101")
const funasrPort = Number(process.env.THUNDER_FUNASR_PORT ?? "10095")
const sherpaPort = Number(process.env.THUNDER_SHERPA_PORT ?? "10096")

function run(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: workspaceRoot,
      stdio: "inherit",
      shell: process.platform === "win32",
      ...options,
    })

    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }

      rejectPromise(new Error(`${command} ${args.join(" ")} exited with code ${code ?? -1}`))
    })
    child.on("error", rejectPromise)
  })
}

function detectStandaloneAppDir(standaloneDir) {
  const monorepoDir = resolve(standaloneDir, "apps", "web")
  const rootDir = standaloneDir

  return readFile(resolve(monorepoDir, "server.js"), "utf8")
    .then(() => ({ appDir: monorepoDir, serverEntry: "apps/web/server.js" }))
    .catch(async () => {
      await readFile(resolve(rootDir, "server.js"), "utf8")
      return { appDir: rootDir, serverEntry: "server.js" }
    })
}

await rm(runtimeWebDir, { recursive: true, force: true })
await rm(runtimeServicesDir, { recursive: true, force: true })
await rm(runtimePluginsDir, { recursive: true, force: true })
await mkdir(runtimeDir, { recursive: true })

// 解析构建命令行参数中的排除模块列表 (如 --exclude=teleprompter,emby)
let excludeModules = process.env.EXCLUDE_MODULES || ""
for (let i = 0; i < process.argv.length; i++) {
  const arg = process.argv[i]
  if (arg.startsWith("--exclude=")) {
    excludeModules = arg.split("=")[1]
  } else if (arg === "--exclude" && i + 1 < process.argv.length) {
    excludeModules = process.argv[i + 1]
  }
}

if (excludeModules) {
  console.log(`[desktop-build] 正在排除指定模块: ${excludeModules}`)
}

await run("node", [resolve(scriptDir, "prepare-node-runtime.mjs")])
await run("pnpm", ["--filter", "@thunder/web", "build:plugin:teleprompter"], {
  env: {
    ...process.env,
    NODE_ENV: "production",
  },
})
await run("pnpm", ["--filter", "@thunder/web", "build"], {
  env: {
    ...process.env,
    THUNDER_TARGET_PLATFORM: "desktop",
    THUNDER_EXCLUDE_MODULES: excludeModules,
    NEXT_PUBLIC_PLATFORM: "desktop",
    NEXT_PUBLIC_EXCLUDE_MODULES: excludeModules,
  },
})
await run("pnpm", ["--filter", "@thunder/api", "build:desktop-bundle"], {
  env: {
    ...process.env,
    THUNDER_TARGET_PLATFORM: "desktop",
    THUNDER_EXCLUDE_MODULES: excludeModules,
    NEXT_PUBLIC_PLATFORM: "desktop",
    NEXT_PUBLIC_EXCLUDE_MODULES: excludeModules,
    EXCLUDE_MODULES: excludeModules,
  },
})

const standaloneDir = resolve(workspaceRoot, "apps", "web", ".next", "standalone")
const staticDir = resolve(workspaceRoot, "apps", "web", ".next", "static")
const publicDir = resolve(workspaceRoot, "apps", "web", "public")
const { appDir, serverEntry } = await detectStandaloneAppDir(standaloneDir)

await cp(standaloneDir, runtimeWebDir, { recursive: true, dereference: true })
await cp(staticDir, resolve(appDir.replace(standaloneDir, runtimeWebDir), ".next", "static"), {
  recursive: true,
})
await cp(publicDir, resolve(appDir.replace(standaloneDir, runtimeWebDir), "public"), {
  recursive: true,
})
await cp(resolve(workspaceRoot, "services", "funasr"), resolve(runtimeServicesDir, "funasr"), {
  recursive: true,
})
await cp(resolve(workspaceRoot, "services", "sherpa-onnx"), resolve(runtimeServicesDir, "sherpa-onnx"), {
  recursive: true,
})
await cp(resolve(workspaceRoot, "plugins", "desktop"), resolve(runtimePluginsDir, "desktop"), {
  recursive: true,
})

await writeFile(
  runtimeManifestPath,
  `${JSON.stringify(
    {
      webPort,
      apiPort,
      funasrPort,
      sherpaPort,
      webEntry: posix.join("web", serverEntry.replaceAll("\\", "/")),
      apiEntry: "api/server.cjs",
      nodeEntry: process.platform === "win32" ? "node/node.exe" : "node/node",
    },
    null,
    2
  )}\n`,
  "utf8"
)

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, posix, resolve } from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const desktopRoot = resolve(scriptDir, "..")
const workspaceRoot = resolve(desktopRoot, "..", "..")
const runtimeDir = resolve(desktopRoot, "runtime")
const runtimeWebDir = resolve(runtimeDir, "web")
const runtimeManifestPath = resolve(runtimeDir, "manifest.json")
const webPort = Number(process.env.THUNDER_DESKTOP_WEB_PORT ?? "43100")
const apiPort = Number(process.env.THUNDER_DESKTOP_API_PORT ?? "43101")

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
await mkdir(runtimeDir, { recursive: true })

await run("node", [resolve(scriptDir, "prepare-node-runtime.mjs")])
await run("pnpm", ["--filter", "@thunder/web", "build"])
await run("pnpm", ["--filter", "@thunder/api", "build:desktop-bundle"])

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

await writeFile(
  runtimeManifestPath,
  `${JSON.stringify(
    {
      webPort,
      apiPort,
      webEntry: posix.join("web", serverEntry.replaceAll("\\", "/")),
      apiEntry: "api/server.cjs",
      nodeEntry: process.platform === "win32" ? "node/node.exe" : "node/node",
    },
    null,
    2
  )}\n`,
  "utf8"
)

import { spawn, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import fs from "node:fs"
import { cp, mkdir, rm } from "node:fs/promises"

function getTauriAppDataDir() {
  const home = os.homedir();
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "com.thunder.desktop");
  } else if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "com.thunder.desktop");
  } else {
    // Linux and others
    const dataHome = process.env.XDG_DATA_HOME || path.join(home, ".local", "share");
    return path.join(dataHome, "com.thunder.desktop");
  }
}

const ROOT_DIR = fileURLToPath(new URL("../../..", import.meta.url))
const DESKTOP_DIR = path.join(ROOT_DIR, "apps", "desktop")
const WORKSPACE_RUNTIME_DIR = path.join(DESKTOP_DIR, "runtime")
const PNPM_BIN = process.platform === "win32" ? "pnpm.cmd" : "pnpm"

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket()

    socket.setTimeout(1000)
    socket.once("connect", () => {
      socket.destroy()
      resolve(true)
    })
    socket.once("timeout", () => {
      socket.destroy()
      resolve(false)
    })
    socket.once("error", () => {
      socket.destroy()
      resolve(false)
    })

    socket.connect(port, "127.0.0.1")
  })
}

function startWorkspaceScript(scriptName, label) {
  const child = process.platform === "win32"
    ? spawn("cmd.exe", ["/d", "/s", "/c", PNPM_BIN, "--dir", ROOT_DIR, scriptName], {
      stdio: "inherit",
      shell: false,
    })
    : spawn(PNPM_BIN, ["--dir", ROOT_DIR, scriptName], {
      stdio: "inherit",
      shell: false,
    })

  child.on("exit", (code, signal) => {
    if (signal) {
      console.log(`[desktop] ${label} stopped by signal ${signal}`)
      return
    }

    if (code && code !== 0) {
      console.error(`[desktop] ${label} exited with code ${code}`)
      stopChildren()
      process.exit(code)
    }
  })
  child.on("error", (error) => {
    console.warn(`[desktop] ${label} failed to start: ${error.message}`)
  })

  return child
}

function runWorkspaceCommand(args, label, options = {}) {
  const result = process.platform === "win32"
    ? spawnSync("cmd.exe", ["/d", "/s", "/c", PNPM_BIN, "--dir", ROOT_DIR, ...args], {
      stdio: "inherit",
      shell: false,
      ...options,
    })
    : spawnSync(PNPM_BIN, ["--dir", ROOT_DIR, ...args], {
      stdio: "inherit",
      shell: false,
      ...options,
    })

  if (result.status !== 0) {
    console.error(`[desktop] ${label} failed`)
    process.exit(result.status ?? 1)
  }
}

function getInstalledRuntimeCandidates() {
  if (process.env.THUNDER_DESKTOP_DEV_RUNTIME_TARGET) {
    return [process.env.THUNDER_DESKTOP_DEV_RUNTIME_TARGET]
  }

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local")
    return [
      path.join(localAppData, "Thunder", "_up_", "runtime"),
      path.join(localAppData, "Thunder", "runtime"),
    ]
  }

  return []
}

async function pathExists(filePath) {
  try {
    await fs.promises.stat(filePath)
    return true
  } catch (error) {
    if (error?.code === "ENOENT") return false
    throw error
  }
}

async function copyRuntimeEntry(sourcePath, targetPath) {
  await rm(targetPath, { recursive: true, force: true })
  await mkdir(path.dirname(targetPath), { recursive: true })
  await cp(sourcePath, targetPath, { recursive: true, force: true })
}

async function copyPluginRuntimeEntry(sourcePath, targetPath) {
  await rm(targetPath, { recursive: true, force: true })
  await mkdir(path.dirname(targetPath), { recursive: true })
  await cp(sourcePath, targetPath, {
    recursive: true,
    force: true,
    filter(source) {
      // 插件运行时只需要源码元数据和 dist 产物，跳过开发态依赖与缓存。
      const normalized = source.replaceAll("\\", "/")
      return !normalized.includes("/node_modules") && !normalized.includes("/.turbo")
    },
  })
}

async function syncDevRuntimeTarget(targetRuntimeDir) {
  await mkdir(targetRuntimeDir, { recursive: true })

  // 开发态只同步影响 trusted runtime 的最小集合，避免每次启动都复制完整 Web/Node runtime。
  await copyRuntimeEntry(
    path.join(WORKSPACE_RUNTIME_DIR, "api"),
    path.join(targetRuntimeDir, "api"),
  )
  await copyPluginRuntimeEntry(
    path.join(WORKSPACE_RUNTIME_DIR, "plugins", "desktop", "teleprompter"),
    path.join(targetRuntimeDir, "plugins", "desktop", "teleprompter"),
  )
  await cp(
    path.join(WORKSPACE_RUNTIME_DIR, "manifest.json"),
    path.join(targetRuntimeDir, "manifest.json"),
    { force: true },
  )
}

async function syncDevRuntime() {
  if (process.env.THUNDER_SKIP_DEV_RUNTIME_SYNC === "true") {
    console.log("[desktop] Skipping dev runtime sync")
    return
  }

  console.log("[desktop] Building minimal desktop runtime for trusted worker development")
  if (!(await hasSqliteClientRuntime())) {
    runWorkspaceCommand(["--filter", "@thunder/database", "db:generate:sqlite"], "SQLite client generation")
  } else {
    console.log("[desktop] Reusing existing SQLite client runtime")
  }
  if (!(await pathExists(path.join(ROOT_DIR, "apps", "api", "src", "sqlite-migrations.json")))) {
    runWorkspaceCommand(["--filter", "@thunder/database", "db:compile-sqlite-migrations"], "SQLite migration compilation")
  } else {
    console.log("[desktop] Reusing compiled SQLite migrations")
  }
  runWorkspaceCommand(["--filter", "@thunder/api", "build:desktop-bundle"], "desktop API runtime bundle", {
    env: {
      ...process.env,
      THUNDER_TARGET_PLATFORM: "desktop",
      NEXT_PUBLIC_PLATFORM: "desktop",
    },
  })

  await copyPluginRuntimeEntry(
    path.join(ROOT_DIR, "plugins", "desktop", "teleprompter"),
    path.join(WORKSPACE_RUNTIME_DIR, "plugins", "desktop", "teleprompter"),
  )
  console.log(`[desktop] Synced workspace plugin runtime: ${path.join(WORKSPACE_RUNTIME_DIR, "plugins", "desktop", "teleprompter")}`)

  const targets = [
    ...(await Promise.all(
      getInstalledRuntimeCandidates().map(async (candidate) => await pathExists(candidate) ? candidate : null),
    )),
  ].filter((candidate, index, list) => candidate && list.indexOf(candidate) === index)

  for (const target of targets) {
    await syncDevRuntimeTarget(target)
    console.log(`[desktop] Synced dev runtime: ${target}`)
  }
}

async function hasSqliteClientRuntime() {
  const sqliteClientDir = path.join(ROOT_DIR, "packages", "database", "src", "generated", "sqlite-client")
  if (!(await pathExists(path.join(sqliteClientDir, "schema.prisma")))) return false
  const entries = await fs.promises.readdir(sqliteClientDir).catch(() => [])
  return entries.some((entry) => entry.includes("query_engine") && entry.endsWith(".node"))
}

const children = []

function stopChildren() {
  for (const child of children) {
    if (child.killed) {
      continue
    }

    if (process.platform === "win32") {
      spawnSync("taskkill.exe", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      })
    } else {
      child.kill()
    }
  }
}

process.on("SIGINT", () => {
  stopChildren()
  process.exit(0)
})

process.on("SIGTERM", () => {
  stopChildren()
  process.exit(0)
})

// Reuse existing Thunder dev servers when present so Tauri can attach
// without forcing the user to free ports 3000 / 3001 first.
const webRunning = await isPortOpen(3000)
const apiRunning = await isPortOpen(3001)
process.env.THUNDER_DESKTOP_NATIVE_API_URL = process.env.THUNDER_DESKTOP_NATIVE_API_URL || "http://127.0.0.1:43102"

runWorkspaceCommand(["build:plugin:teleprompter"], "teleprompter plugin build")
await syncDevRuntime()

if (process.env.THUNDER_DESKTOP_DEPS_ONCE === "true") {
  console.log("[desktop] Dev desktop dependencies are ready")
  process.exit(0)
}

if (webRunning) {
  console.log("[desktop] Reusing existing web dev server on http://localhost:3000")
} else {
  console.log("[desktop] Starting web dev server on http://localhost:3000")
  process.env.THUNDER_TARGET_PLATFORM = "desktop"
  process.env.NEXT_PUBLIC_PLATFORM = "desktop"
  children.push(startWorkspaceScript("dev:web", "web dev server"))
}

if (apiRunning) {
  console.log("[desktop] Reusing existing api dev server on http://localhost:3001")
} else {
  console.log("[desktop] Starting api dev server on http://localhost:3001")
  // Resolve and use the exact same system AppData directory as Tauri production app
  try {
    const appDataDir = getTauriAppDataDir()
    fs.mkdirSync(appDataDir, { recursive: true })
    const dbPath = path.join(appDataDir, "app.db")
    process.env.DATABASE_URL = `file:${dbPath}`
    process.env.THUNDER_TARGET_PLATFORM = "desktop"
    process.env.NEXT_PUBLIC_PLATFORM = "desktop"
    console.log(`[desktop] Development database pointing to shared Tauri path: ${dbPath}`)
  } catch (error) {
    console.error("[desktop] Failed to create shared AppData database directory, falling back to temp file:", error)
    process.env.DATABASE_URL = "file:../../data/app-dev.db"
    process.env.THUNDER_TARGET_PLATFORM = "desktop"
    process.env.NEXT_PUBLIC_PLATFORM = "desktop"
  }
  children.push(startWorkspaceScript("dev:api", "api dev server"))
}

while (true) {
  await wait(1000)
}

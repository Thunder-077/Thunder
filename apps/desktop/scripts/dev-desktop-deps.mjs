import { spawn, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import fs from "node:fs"

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

const pluginBuild = spawnSync(PNPM_BIN, ["--dir", ROOT_DIR, "build:plugin:teleprompter"], {
  stdio: "inherit",
  shell: process.platform === "win32",
})
if (pluginBuild.status !== 0) {
  process.exit(pluginBuild.status ?? 1)
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

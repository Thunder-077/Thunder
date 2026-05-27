import { spawn, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import net from "node:net"

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

if (webRunning) {
  console.log("[desktop] Reusing existing web dev server on http://localhost:3000")
} else {
  console.log("[desktop] Starting web dev server on http://localhost:3000")
  children.push(startWorkspaceScript("dev:web", "web dev server"))
}

if (apiRunning) {
  console.log("[desktop] Reusing existing api dev server on http://localhost:3001")
} else {
  console.log("[desktop] Starting api dev server on http://localhost:3001")
  children.push(startWorkspaceScript("dev:api", "api dev server"))
}

while (true) {
  await wait(1000)
}

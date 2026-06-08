import { watch } from "node:fs"
import { spawn, type ChildProcess } from "node:child_process"
import { randomUUID } from "node:crypto"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { buildPlugin, type BuildPluginResult, type PluginProject } from "./build"

const CLI_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..")
const WORKSPACE_ROOT = resolve(CLI_ROOT, "../../../..")
const DEFAULT_API_BASE_URL = "http://127.0.0.1:3001"
const DEFAULT_WEB_BASE_URL = "http://127.0.0.1:3000"
const HOST_START_TIMEOUT_MS = 180000
const HOST_POLL_INTERVAL_MS = 1500
const REINSTALL_DEBOUNCE_MS = 500
const WORKER_STATUS_POLL_INTERVAL_MS = 3000

export interface DesktopDevHostClient {
  getRuntimeStatus(pluginId: string): Promise<{ running: boolean; endpoint?: string; lastError?: string }>
  installLocalPlugin(pluginPath: string): Promise<void>
  startRuntime(pluginId: string): Promise<void>
}

function createDesktopDevHostClient(apiBaseUrl: string): DesktopDevHostClient {
  async function readJsonOrThrow(response: Response, fallbackMessage: string): Promise<any> {
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean
      message?: string
      data?: unknown
    } | null

    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.message || fallbackMessage)
    }

    return payload
  }

  return {
    async getRuntimeStatus(pluginId) {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/desktop/plugins/${encodeURIComponent(pluginId)}/runtime`,
        {
          method: "GET",
        },
      )
      const payload = await readJsonOrThrow(response, "桌面插件 runtime 状态读取失败")
      return payload.data as { running: boolean; endpoint?: string; lastError?: string }
    },
    async installLocalPlugin(pluginPath) {
      const response = await fetch(`${apiBaseUrl}/api/v1/desktop/plugins/install/local`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ pluginPath }),
      })
      await readJsonOrThrow(response, "桌面插件安装失败")
    },
    async startRuntime(pluginId) {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/desktop/plugins/${encodeURIComponent(pluginId)}/runtime/start`,
        {
          method: "POST",
        },
      )
      await readJsonOrThrow(response, "桌面插件 runtime 启动失败")
    },
  }
}

async function waitForCondition(
  check: () => Promise<boolean>,
  timeoutMs: number,
  intervalMs: number,
): Promise<boolean> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await check()) {
      return true
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, intervalMs))
  }

  return false
}

async function isDesktopHostReady(apiBaseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/v1/desktop/plugins`, {
      method: "GET",
    })
    return response.ok
  } catch {
    return false
  }
}

function startDesktopDevHost(): ChildProcess {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
  return spawn(command, ["dev:desktop"], {
    cwd: WORKSPACE_ROOT,
    stdio: "inherit",
    env: process.env,
  })
}

async function ensureDesktopDevHost(apiBaseUrl: string): Promise<{
  childProcess: ChildProcess | null
  startedByCli: boolean
}> {
  if (await isDesktopHostReady(apiBaseUrl)) {
    return {
      childProcess: null,
      startedByCli: false,
    }
  }

  const childProcess = startDesktopDevHost()
  const ready = await waitForCondition(
    () => isDesktopHostReady(apiBaseUrl),
    HOST_START_TIMEOUT_MS,
    HOST_POLL_INTERVAL_MS,
  )

  if (!ready) {
    childProcess.kill()
    throw new Error("Desktop Dev Host 启动超时，未能在 180 秒内就绪")
  }

  return {
    childProcess,
    startedByCli: true,
  }
}

async function installAndStartPlugin(
  client: DesktopDevHostClient,
  project: PluginProject,
  log: (message: string) => void,
): Promise<void> {
  await client.installLocalPlugin(project.rootDir)
  log("Install: synced")

  if (project.manifest.runtime) {
    await client.startRuntime(project.manifest.id)
    log("Worker: connected")
  }
}

function printDevStatus(
  result: BuildPluginResult,
  hostState: "ready" | "reused",
  devtoolsUrl: string,
): void {
  const { manifest } = result.project

  console.log(`Plugin: ${manifest.id}`)
  console.log(`Kind: ${manifest.kind}`)
  console.log("Permissions:")
  for (const permission of manifest.permissions) {
    console.log(`- ${permission}`)
  }
  console.log(`UI: ${manifest.contributes?.sidebar ? "watching" : "not configured"}`)
  console.log(`Worker: ${manifest.runtime ? "watching" : "not configured"}`)
  console.log("Reload: watching")
  console.log(`Host: ${hostState}`)
  console.log(`Devtools: ready (${devtoolsUrl})`)
}

function shouldIgnoreReinstallPath(relativePath: string): boolean {
  return (
    relativePath.includes("/node_modules/") ||
    relativePath.startsWith("node_modules/") ||
    relativePath.startsWith("artifacts/") ||
    relativePath.startsWith("dist/")
  )
}

function getOpenCommand(url: string): { command: string; args: string[] } {
  if (process.platform === "win32") {
    return {
      command: "cmd",
      args: ["/c", "start", "", url],
    }
  }

  if (process.platform === "darwin") {
    return {
      command: "open",
      args: [url],
    }
  }

  return {
    command: "xdg-open",
    args: [url],
  }
}

function openDevtoolsPage(url: string): void {
  if (process.env.THUNDER_PLUGIN_DEV_OPEN === "0") {
    return
  }

  const { command, args } = getOpenCommand(url)
  const childProcess = spawn(command, args, {
    cwd: WORKSPACE_ROOT,
    detached: true,
    stdio: "ignore",
  })
  childProcess.unref()
}

function createReinstallWatcher(
  project: PluginProject,
  onChange: () => Promise<void>,
): { close(): void } {
  let timer: NodeJS.Timeout | null = null
  const watcher = watch(
    project.rootDir,
    {
      recursive: true,
    },
    (_eventType, filename) => {
      const relativePath = filename?.replace(/\\/g, "/") ?? ""
      if (!relativePath) {
        return
      }
      if (shouldIgnoreReinstallPath(relativePath)) {
        return
      }

      if (timer) {
        clearTimeout(timer)
      }
      timer = setTimeout(() => {
        void onChange()
      }, REINSTALL_DEBOUNCE_MS)
    },
  )

  return {
    close() {
      if (timer) {
        clearTimeout(timer)
      }
      watcher.close()
    },
  }
}

export async function runDevCommand(rootDir: string): Promise<void> {
  const apiBaseUrl = process.env.THUNDER_PLUGIN_DEV_API_URL ?? DEFAULT_API_BASE_URL
  const webBaseUrl = process.env.THUNDER_PLUGIN_DEV_WEB_URL ?? DEFAULT_WEB_BASE_URL
  const host = await ensureDesktopDevHost(apiBaseUrl)
  const client = createDesktopDevHostClient(apiBaseUrl)
  const installId = randomUUID()
  const result = await buildPlugin({
    rootDir,
    clean: true,
    watch: true,
  })

  const reinstall = async () => {
    try {
      await installAndStartPlugin(client, result.project, console.log)
    } catch (error) {
      console.error(
        `[plugin-cli] dev sync failed (${installId}): ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  await reinstall()

  const devtoolsUrl = `${webBaseUrl}/plugins/${encodeURIComponent(result.project.manifest.id)}?devtools=1`
  printDevStatus(result, host.startedByCli ? "ready" : "reused", devtoolsUrl)
  openDevtoolsPage(devtoolsUrl)

  const reinstallWatcher = createReinstallWatcher(result.project, reinstall)
  const runtimeStatusPoll = result.project.manifest.runtime
    ? setInterval(async () => {
        try {
          const status = await client.getRuntimeStatus(result.project.manifest.id)
          if (!status.running) {
            await client.startRuntime(result.project.manifest.id)
            console.log("Worker: restarted")
          }
        } catch (error) {
          console.error(
            `[plugin-cli] runtime poll failed: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }, WORKER_STATUS_POLL_INTERVAL_MS)
    : null

  const stop = async () => {
    reinstallWatcher.close()
    if (runtimeStatusPoll) {
      clearInterval(runtimeStatusPoll)
    }
    await result.watcher?.stop()
    if (host.childProcess && !host.childProcess.killed) {
      host.childProcess.kill()
    }
  }

  process.once("SIGINT", async () => {
    await stop()
    process.exit(0)
  })

  process.once("SIGTERM", async () => {
    await stop()
    process.exit(0)
  })

  await new Promise<void>(() => {
    // Keep the CLI alive while watch mode and the desktop dev host are active.
  })
}

export {
  createDesktopDevHostClient,
  ensureDesktopDevHost,
  getOpenCommand,
  isDesktopHostReady,
  openDevtoolsPage,
  shouldIgnoreReinstallPath,
  waitForCondition,
}

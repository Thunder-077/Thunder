import { mkdir, readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import {
  createTrustedRuntimeSupervisor,
  PluginRuntimeError,
  type PipeClientStream,
} from "@thunder/plugin-host-runtime"
import type {
  DesktopPluginRuntimeStatus,
  InstalledDesktopPlugin,
} from "./desktop-plugin-types"
import {
  DesktopPluginError,
  assertPathInside,
  assertPluginId,
  getPluginDirs,
  parseInstallRecord,
  readJsonFile,
  sha256,
} from "./desktop-plugin-internal"
import { assertPluginTrustedForRuntime } from "./desktop-plugin-trust"
import { closeAllStorageConnections } from "./desktop-plugin-storage"
import { getInstalledPlugin } from "./desktop-plugin-registry"

const trustedRuntimeSupervisor = createTrustedRuntimeSupervisor()

/**
 * 关闭所有 trusted runtime 和插件存储连接。
 * API 进程退出前调用，避免遗留子进程和 SQLite 句柄。
 */
export async function shutdownPluginSystem(): Promise<void> {
  await trustedRuntimeSupervisor.stopAll()
  closeAllStorageConnections()
}

async function getTrustedPluginDataDirectory(
  plugin: InstalledDesktopPlugin,
): Promise<string | undefined> {
  if (!plugin.manifest.permissions.includes("filesystem:plugin-data")) {
    return undefined
  }
  const { pluginDataDir } = getPluginDirs()
  const dataDirectory = resolve(pluginDataDir, plugin.manifest.id)
  await assertPathInside(pluginDataDir, dataDirectory)
  await mkdir(dataDirectory, { recursive: true })
  return dataDirectory
}

function toDesktopPluginRuntimeStatus(
  status: import("@thunder/plugin-host-runtime").PluginRuntimeStatus,
): DesktopPluginRuntimeStatus {
  return {
    pluginId: status.pluginId,
    phase: status.phase,
    running: status.running,
    pid: status.pid,
    startedAt: status.startedAt,
    lastExitAt: status.lastExitAt,
    lastExitCode: status.lastExitCode,
    lastExitSignal: status.lastExitSignal,
    consecutiveCrashCount: status.consecutiveCrashCount,
    circuitOpenUntil: status.circuitOpenUntil,
    lastError: status.lastError,
  }
}

async function startTrustedDesktopPluginRuntime(
  plugin: InstalledDesktopPlugin,
  manual = false,
): Promise<DesktopPluginRuntimeStatus> {
  if (plugin.manifest.kind !== "trusted") {
    throw new DesktopPluginError("当前仅支持 trusted runtime", 501)
  }
  const installRecord = await readJsonFile(join(plugin.pluginRoot, ".thunder-install.json"), parseInstallRecord).catch(() => null)
  const currentManifestSha256 = sha256(await readFile(join(plugin.pluginRoot, "plugin.json")))
  assertPluginTrustedForRuntime(installRecord, plugin.manifest, currentManifestSha256)

  const currentStatus = trustedRuntimeSupervisor.getStatus(plugin.manifest.id)
  if (currentStatus.running) {
    return toDesktopPluginRuntimeStatus(currentStatus)
  }

  const status = await trustedRuntimeSupervisor.start(
    {
      manifest: plugin.manifest,
      pluginRoot: plugin.pluginRoot,
      dataDirectory: await getTrustedPluginDataDirectory(plugin),
    },
    { manual },
  )

  return toDesktopPluginRuntimeStatus(status)
}

export async function startDesktopPluginRuntime(id: string): Promise<DesktopPluginRuntimeStatus> {
  const plugin = await getInstalledPlugin(id)
  return startTrustedDesktopPluginRuntime(plugin, true)
}

export async function stopDesktopPluginRuntime(id: string): Promise<DesktopPluginRuntimeStatus> {
  assertPluginId(id)
  const status = await trustedRuntimeSupervisor.stop(id)
  return toDesktopPluginRuntimeStatus(status)
}

export async function restartDesktopPluginRuntime(id: string): Promise<DesktopPluginRuntimeStatus> {
  assertPluginId(id)
  await trustedRuntimeSupervisor.stop(id)
  const plugin = await getInstalledPlugin(id)
  return startTrustedDesktopPluginRuntime(plugin, true)
}

export function getDesktopPluginRuntimeStatus(id: string): DesktopPluginRuntimeStatus {
  assertPluginId(id)
  const status = trustedRuntimeSupervisor.getStatus(id)
  return toDesktopPluginRuntimeStatus(status)
}

/**
 * 通过宿主管理的 trusted runtime 调用插件 worker handler。
 * 这里再次校验 kind 和 native-runtime 权限，避免绕过 Host Bridge。
 */
export async function invokeDesktopPluginWorker(
  id: string,
  method: string,
  payload: unknown,
): Promise<unknown> {
  const plugin = await getInstalledPlugin(id)
  if (plugin.manifest.kind !== "trusted") {
    throw new DesktopPluginError("当前仅支持 trusted worker.invoke", 501)
  }
  if (!plugin.manifest.permissions.includes("native-runtime")) {
    throw new DesktopPluginError("插件未声明 native-runtime 权限", 403)
  }

  try {
    return await trustedRuntimeSupervisor.invoke(
      {
        manifest: plugin.manifest,
        pluginRoot: plugin.pluginRoot,
        dataDirectory: await getTrustedPluginDataDirectory(plugin),
      },
      method,
      payload,
    )
  } catch (error) {
    if (error instanceof PluginRuntimeError) {
      const status =
        error.code === "RUNTIME_CIRCUIT_OPEN" ||
        error.code === "RPC_CONCURRENCY_LIMIT"
          ? 429
          : error.code === "RPC_TIMEOUT"
            ? 504
            : error.code === "RUNTIME_CRASHED" ||
                error.code === "RUNTIME_NOT_READY" ||
                error.code === "RUNTIME_START_FAILED"
              ? 503
              : 502
      throw new DesktopPluginError(error.message, status)
    }
    throw error
  }
}

/**
 * 打开 trusted runtime 的原生流式 worker 通道。
 * 该通道用于连续音频等高频数据，不占用普通 worker.invoke RPC 路径。
 */
export async function openDesktopPluginWorkerStream(
  id: string,
  method: string,
  payload: unknown,
): Promise<PipeClientStream> {
  const plugin = await getInstalledPlugin(id)
  if (plugin.manifest.kind !== "trusted") {
    throw new DesktopPluginError("当前仅支持 trusted worker stream", 501)
  }
  if (!plugin.manifest.permissions.includes("native-runtime")) {
    throw new DesktopPluginError("插件未声明 native-runtime 权限", 403)
  }

  try {
    return await trustedRuntimeSupervisor.openStream(
      {
        manifest: plugin.manifest,
        pluginRoot: plugin.pluginRoot,
        dataDirectory: await getTrustedPluginDataDirectory(plugin),
      },
      method,
      payload,
    )
  } catch (error) {
    if (error instanceof PluginRuntimeError) {
      throw new DesktopPluginError(error.message, 502)
    }
    throw error
  }
}

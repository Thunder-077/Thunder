import { randomUUID } from "node:crypto"
import { spawn, type ChildProcess } from "node:child_process"
import { existsSync } from "node:fs"
import { access } from "node:fs/promises"
import { join, resolve } from "node:path"
import { createPipeClient, type PipeClient } from "./rpc/pipe-client"
import { PluginRuntimeError } from "./runtime-errors"
import {
  calculateCrashBackoff,
  createPluginRuntimeStatus,
  createTrustedRuntimeEnvironment,
  shouldOpenRuntimeCircuit,
  TRUSTED_RUNTIME_LIMITS,
} from "./runtime-policy"
import { createRuntimeLogBuffer, type RuntimeLogBuffer } from "./runtime-logs"
import type {
  PluginRuntimeStatus,
  RegisteredPlugin,
  TrustedPluginRuntimeSupervisor,
} from "./types"

export interface TrustedRuntimeSupervisorOptions {
  bootstrapPath?: string
  executablePath?: string
  socketDirectory?: string
  now?: () => number
}

interface RuntimeRecord {
  plugin: RegisteredPlugin
  status: PluginRuntimeStatus
  child?: ChildProcess
  client?: PipeClient
  capability?: string
  startPromise?: Promise<PluginRuntimeStatus>
  activeInvocations: number
  crashTimestamps: number[]
  nextRestartAt: number
  stopping: boolean
  healthyResetTimer?: NodeJS.Timeout
  stdout: RuntimeLogBuffer
  stderr: RuntimeLogBuffer
}

type BootstrapMessage =
  | { type: "bootstrap-ready"; version: number }
  | { type: "ready"; version: number; pluginId: string; endpoint: string }
  | { type: "init-error"; version: number; error: string }
  | { type: "stopped"; version: number }

function defaultBootstrapPath(): string {
  const candidates = [
    process.env.THUNDER_TRUSTED_RUNTIME_BOOTSTRAP_PATH,
    typeof __dirname === "string"
      ? join(__dirname, "trusted-process-bootstrap.mjs")
      : undefined,
    resolve(process.cwd(), "src", "trusted-process-bootstrap.mjs"),
    resolve(
      process.cwd(),
      "packages",
      "plugin-host-runtime",
      "src",
      "trusted-process-bootstrap.mjs",
    ),
    resolve(
      process.cwd(),
      "..",
      "..",
      "packages",
      "plugin-host-runtime",
      "src",
      "trusted-process-bootstrap.mjs",
    ),
  ].filter((candidate): candidate is string => Boolean(candidate))
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]
}

function wait(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

function sanitizeError(error: unknown): string {
  if (error instanceof PluginRuntimeError) return error.message
  return "Trusted runtime failed"
}

function clearHealthyResetTimer(record: RuntimeRecord): void {
  if (!record.healthyResetTimer) return
  clearTimeout(record.healthyResetTimer)
  record.healthyResetTimer = undefined
}

export function createTrustedRuntimeSupervisor(
  options: TrustedRuntimeSupervisorOptions = {},
): TrustedPluginRuntimeSupervisor {
  const records = new Map<string, RuntimeRecord>()
  const now = options.now ?? Date.now
  const bootstrapPath = options.bootstrapPath ?? defaultBootstrapPath()
  const executablePath = options.executablePath ?? process.execPath

  function getRecord(plugin: RegisteredPlugin): RuntimeRecord {
    let record = records.get(plugin.manifest.id)
    if (!record) {
      record = {
        plugin,
        status: createPluginRuntimeStatus({
          pluginId: plugin.manifest.id,
          kind: "trusted",
          phase: "stopped",
          consecutiveCrashCount: 0,
        }),
        activeInvocations: 0,
        crashTimestamps: [],
        nextRestartAt: 0,
        stopping: false,
        stdout: createRuntimeLogBuffer(),
        stderr: createRuntimeLogBuffer(),
      }
      records.set(plugin.manifest.id, record)
    } else {
      record.plugin = plugin
    }
    return record
  }

  function validatePlugin(plugin: RegisteredPlugin): void {
    if (plugin.manifest.kind !== "trusted") {
      throw new PluginRuntimeError("RUNTIME_START_FAILED", "Only trusted plugins can start a runtime")
    }
    if (!plugin.manifest.permissions.includes("native-runtime")) {
      throw new PluginRuntimeError("RUNTIME_START_FAILED", "Trusted plugin is missing native-runtime permission")
    }
    if (!plugin.manifest.runtime?.entry) {
      throw new PluginRuntimeError("RUNTIME_START_FAILED", "Trusted plugin is missing runtime.entry")
    }
  }

  async function start(
    plugin: RegisteredPlugin,
    startOptions: { manual?: boolean } = {},
  ): Promise<PluginRuntimeStatus> {
    validatePlugin(plugin)
    const record = getRecord(plugin)
    if (record.status.phase === "running" || record.status.phase === "degraded") {
      return record.status
    }
    if (record.startPromise) return record.startPromise

    const currentTime = now()
    if (startOptions.manual) {
      record.crashTimestamps = []
      record.nextRestartAt = 0
      record.status = createPluginRuntimeStatus({
        ...record.status,
        phase: "stopped",
        consecutiveCrashCount: 0,
        circuitOpenUntil: undefined,
        lastError: undefined,
      })
    } else if (record.status.circuitOpenUntil && Date.parse(record.status.circuitOpenUntil) > currentTime) {
      throw new PluginRuntimeError("RUNTIME_CIRCUIT_OPEN", "Trusted runtime circuit is open", {
        retryable: true,
      })
    } else if (record.nextRestartAt > currentTime) {
      await wait(record.nextRestartAt - currentTime)
    }

    record.startPromise = (async () => {
      await access(bootstrapPath).catch((error) => {
        throw new PluginRuntimeError("RUNTIME_START_FAILED", "Trusted runtime bootstrap is missing", {
          cause: error,
        })
      })
      record.status = createPluginRuntimeStatus({
        ...record.status,
        phase: "starting",
        lastError: undefined,
      })

      const capability = randomUUID()
      const child = spawn(
        executablePath,
        [`--max-old-space-size=${TRUSTED_RUNTIME_LIMITS.maxOldSpaceMb}`, bootstrapPath],
        {
          cwd: plugin.pluginRoot,
          shell: false,
          detached: process.platform !== "win32",
          stdio: ["ignore", "pipe", "pipe", "ipc"],
          env: createTrustedRuntimeEnvironment(process.env, {
            pluginId: plugin.manifest.id,
            pluginDataDir: plugin.dataDirectory,
          }),
        },
      )
      record.child = child
      record.capability = capability
      record.stopping = false
      child.stdout?.on("data", (chunk) => record.stdout.append(String(chunk)))
      child.stderr?.on("data", (chunk) => record.stderr.append(String(chunk)))

      const onRuntimeExit = (
        code: number | null,
        signal: NodeJS.Signals | null,
      ) => {
        if (!record.stopping) {
          void handleCrash(record, code, signal)
        }
      }
      const ready = await new Promise<{ endpoint: string }>((resolvePromise, rejectPromise) => {
        const timeout = setTimeout(() => {
          fail(new PluginRuntimeError("RUNTIME_START_FAILED", "Trusted runtime startup timed out"))
        }, TRUSTED_RUNTIME_LIMITS.startupTimeoutMs)

        let settled = false
        const onError = (error: Error) => fail(error)
        const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
          fail(new Error(`Trusted runtime exited during startup (${code ?? signal ?? "unknown"})`))
        }
        const cleanup = () => {
          clearTimeout(timeout)
          child.off("error", onError)
          child.off("exit", onExit)
          child.off("message", onMessage)
        }
        const fail = (error: unknown) => {
          if (settled) return
          settled = true
          cleanup()
          rejectPromise(
            error instanceof PluginRuntimeError
              ? error
              : new PluginRuntimeError("RUNTIME_START_FAILED", "Trusted runtime failed during startup", {
                  cause: error,
                }),
          )
        }

        const onMessage = (raw: unknown) => {
          const message = raw as BootstrapMessage
          if (message.type === "bootstrap-ready" && message.version === 1) {
            child.send({
              type: "initialize",
              config: {
                pluginId: plugin.manifest.id,
                pluginRoot: plugin.pluginRoot,
                runtimeEntry: plugin.manifest.runtime?.entry,
                capability,
                socketDirectory: options.socketDirectory,
                maxRequestBytes: TRUSTED_RUNTIME_LIMITS.maxRequestBytes,
                maxResponseBytes: TRUSTED_RUNTIME_LIMITS.maxResponseBytes,
              },
            })
          } else if (
            message.type === "ready" &&
            message.version === 1 &&
            message.pluginId === plugin.manifest.id &&
            typeof message.endpoint === "string"
          ) {
            if (settled) return
            settled = true
            // Install lifecycle monitoring before releasing the startup wait.
            child.on("exit", onRuntimeExit)
            cleanup()
            resolvePromise({ endpoint: message.endpoint })
          } else if (message.type === "init-error") {
            fail(new Error(message.error))
          }
        }
        child.once("error", onError)
        child.once("exit", onExit)
        child.on("message", onMessage)
      })

      record.client = await createPipeClient(ready.endpoint, {
        pluginId: plugin.manifest.id,
        capability,
      })
      record.status = createPluginRuntimeStatus({
        pluginId: plugin.manifest.id,
        kind: "trusted",
        phase: "running",
        pid: child.pid,
        startedAt: new Date(now()).toISOString(),
        consecutiveCrashCount: record.status.consecutiveCrashCount,
      })

      clearHealthyResetTimer(record)
      record.healthyResetTimer = setTimeout(() => {
        if (record.child !== child || record.status.phase !== "running") return
        record.crashTimestamps = []
        record.nextRestartAt = 0
        record.status = createPluginRuntimeStatus({
          ...record.status,
          consecutiveCrashCount: 0,
          circuitOpenUntil: undefined,
        })
      }, TRUSTED_RUNTIME_LIMITS.healthyResetMs)
      record.healthyResetTimer.unref()
      return record.status
    })()

    try {
      return await record.startPromise
    } catch (error) {
      await terminateChild(record)
      record.status = createPluginRuntimeStatus({
        ...record.status,
        phase: "crashed",
        lastError: sanitizeError(error),
      })
      throw error
    } finally {
      record.startPromise = undefined
    }
  }

  async function handleCrash(
    record: RuntimeRecord,
    code: number | null,
    signal: NodeJS.Signals | null,
  ): Promise<void> {
    const timestamp = now()
    clearHealthyResetTimer(record)
    await record.client?.close().catch(() => undefined)
    record.client = undefined
    record.child = undefined
    record.capability = undefined
    record.crashTimestamps.push(timestamp)
    record.crashTimestamps = record.crashTimestamps.filter(
      (item) => item >= timestamp - TRUSTED_RUNTIME_LIMITS.crashWindowMs,
    )
    const count = record.status.consecutiveCrashCount + 1
    record.nextRestartAt = timestamp + calculateCrashBackoff(count)
    const circuitOpen = shouldOpenRuntimeCircuit(record.crashTimestamps, timestamp)
    record.status = createPluginRuntimeStatus({
      pluginId: record.plugin.manifest.id,
      kind: "trusted",
      phase: "crashed",
      lastExitAt: new Date(timestamp).toISOString(),
      lastExitCode: code,
      lastExitSignal: signal,
      consecutiveCrashCount: count,
      circuitOpenUntil: circuitOpen
        ? new Date(timestamp + TRUSTED_RUNTIME_LIMITS.circuitDurationMs).toISOString()
        : undefined,
      lastError: "Trusted runtime exited unexpectedly",
    })
  }

  async function terminateChild(record: RuntimeRecord): Promise<void> {
    const child = record.child
    if (!child?.pid) return
    if (process.platform === "win32") {
      await new Promise<void>((resolvePromise) => {
        const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        })
        killer.once("exit", () => resolvePromise())
        killer.once("error", () => resolvePromise())
      })
    } else {
      try {
        process.kill(-child.pid, "SIGKILL")
      } catch {
        child.kill("SIGKILL")
      }
    }
  }

  async function stop(pluginId: string): Promise<PluginRuntimeStatus> {
    const record = records.get(pluginId)
    if (!record) {
      return createPluginRuntimeStatus({
        pluginId,
        kind: "trusted",
        phase: "stopped",
        consecutiveCrashCount: 0,
      })
    }
    if (record.startPromise) {
      await record.startPromise.catch(() => undefined)
    }
    record.stopping = true
    clearHealthyResetTimer(record)
    record.status = createPluginRuntimeStatus({ ...record.status, phase: "stopping" })

    const invocationDeadline = now() + TRUSTED_RUNTIME_LIMITS.shutdownGraceMs
    while (record.activeInvocations > 0 && now() < invocationDeadline) await wait(25)

    await record.client?.close().catch(() => undefined)
    record.client = undefined
    const child = record.child
    if (child?.connected) child.send({ type: "shutdown" })
    if (child) {
      const exited = await Promise.race([
        new Promise<boolean>((resolvePromise) => child.once("exit", () => resolvePromise(true))),
        wait(TRUSTED_RUNTIME_LIMITS.shutdownGraceMs).then(() => false),
      ])
      if (!exited) await terminateChild(record)
    }
    record.child = undefined
    record.capability = undefined
    record.status = createPluginRuntimeStatus({
      pluginId,
      kind: "trusted",
      phase: "stopped",
      consecutiveCrashCount: record.status.consecutiveCrashCount,
    })
    return record.status
  }

  return {
    start,
    async invoke(plugin, method, payload) {
      const record = getRecord(plugin)
      if (record.activeInvocations >= TRUSTED_RUNTIME_LIMITS.maxActiveInvocations) {
        throw new PluginRuntimeError(
          "RPC_CONCURRENCY_LIMIT",
          "Trusted runtime concurrency limit reached",
          { retryable: true },
        )
      }
      await start(plugin)
      if (!record.client) {
        throw new PluginRuntimeError("RUNTIME_NOT_READY", "Trusted runtime is not ready", {
          retryable: true,
        })
      }
      record.activeInvocations += 1
      try {
        return await record.client.invoke(method, payload)
      } finally {
        record.activeInvocations -= 1
      }
    },
    stop,
    getStatus(pluginId) {
      return (
        records.get(pluginId)?.status ??
        createPluginRuntimeStatus({
          pluginId,
          kind: "trusted",
          phase: "stopped",
          consecutiveCrashCount: 0,
        })
      )
    },
  }
}

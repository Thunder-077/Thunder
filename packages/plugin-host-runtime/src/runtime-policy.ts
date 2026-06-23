import type { PluginRuntimeStatus } from "./types"

const MEBIBYTE = 1024 * 1024
const MINUTE_MS = 60_000

export const TRUSTED_RUNTIME_LIMITS = {
  startupTimeoutMs: 10_000,
  shutdownGraceMs: 3_000,
  invocationTimeoutMs: 30_000,
  maxActiveInvocations: 8,
  maxRequestBytes: MEBIBYTE,
  maxResponseBytes: 5 * MEBIBYTE,
  maxOldSpaceMb: 256,
  crashWindowMs: 5 * MINUTE_MS,
  circuitDurationMs: 5 * MINUTE_MS,
  healthyResetMs: 10 * MINUTE_MS,
} as const

const CRASH_BACKOFF_MS = [1_000, 5_000, 30_000] as const
const CIRCUIT_CRASH_THRESHOLD = 3

export interface TrustedRuntimeEnvironmentOptions {
  pluginId: string
  pluginDataDir?: string
}

export type TrustedRuntimeEnvironment = NodeJS.ProcessEnv & {
  THUNDER_PLUGIN_ID: string
  THUNDER_PLUGIN_DATA_DIR?: string
  THUNDER_DESKTOP_NATIVE_API_URL?: string
}

/**
 * Create a runtime status while enforcing the phase/running compatibility
 * invariant at the single construction boundary.
 */
export function createPluginRuntimeStatus(
  input: Omit<PluginRuntimeStatus, "running">,
): PluginRuntimeStatus {
  return {
    ...input,
    running: input.phase === "running" || input.phase === "degraded",
  }
}

/**
 * Return the bounded retry delay for a one-based consecutive crash count.
 */
export function calculateCrashBackoff(consecutiveCrashCount: number): number {
  if (!Number.isFinite(consecutiveCrashCount) || consecutiveCrashCount <= 0) {
    return CRASH_BACKOFF_MS[0]
  }

  const index = Math.max(1, Math.trunc(consecutiveCrashCount)) - 1
  return CRASH_BACKOFF_MS[Math.min(index, CRASH_BACKOFF_MS.length - 1)]
}

/**
 * Open the circuit after three crashes inside the configured rolling window.
 */
export function shouldOpenRuntimeCircuit(
  crashTimestamps: readonly number[],
  now = Date.now(),
): boolean {
  const windowStart = now - TRUSTED_RUNTIME_LIMITS.crashWindowMs
  let crashesInWindow = 0

  for (const timestamp of crashTimestamps) {
    if (timestamp >= windowStart && timestamp <= now) {
      crashesInWindow += 1
    }
  }

  return crashesInWindow >= CIRCUIT_CRASH_THRESHOLD
}

const WINDOWS_ENVIRONMENT_KEYS = [
  "PATH",
  "PATHEXT",
  "SystemRoot",
  "WINDIR",
  "COMSPEC",
  "TEMP",
  "TMP",
  "TMPDIR",
] as const

const POSIX_ENVIRONMENT_KEYS = ["PATH", "TMPDIR", "TMP", "TEMP"] as const

// 受信插件运行时需要通过本地 HTTP 桥接访问桌面原生能力，显式白名单避免继承宿主敏感环境变量。
const TRUSTED_PLUGIN_RUNTIME_CONFIG_KEYS = [
  "THUNDER_DESKTOP_NATIVE_API_URL",
] as const

function findWindowsEnvironmentValue(
  hostEnvironment: NodeJS.ProcessEnv,
  canonicalKey: string,
): string | undefined {
  const exactValue = hostEnvironment[canonicalKey]
  if (exactValue !== undefined) {
    return exactValue
  }

  const normalizedKey = canonicalKey.toLowerCase()
  const matchingEntry = Object.entries(hostEnvironment).find(
    ([key, value]) => key.toLowerCase() === normalizedKey && value !== undefined,
  )
  return matchingEntry?.[1]
}

/**
 * Build a minimal child environment without inheriting host secrets or Node
 * injection flags. Both Windows and POSIX platform variables are supported.
 */
export function createTrustedRuntimeEnvironment(
  hostEnvironment: NodeJS.ProcessEnv,
  options: TrustedRuntimeEnvironmentOptions,
  platform: NodeJS.Platform = process.platform,
): TrustedRuntimeEnvironment {
  const environment: TrustedRuntimeEnvironment = {
    THUNDER_PLUGIN_ID: options.pluginId,
  }

  if (platform === "win32") {
    for (const key of WINDOWS_ENVIRONMENT_KEYS) {
      const value = findWindowsEnvironmentValue(hostEnvironment, key)
      if (value !== undefined) {
        environment[key] = value
      }
    }
  } else {
    for (const key of POSIX_ENVIRONMENT_KEYS) {
      const value = hostEnvironment[key]
      if (value !== undefined) {
        environment[key] = value
      }
    }
  }

  if (options.pluginDataDir !== undefined) {
    environment.THUNDER_PLUGIN_DATA_DIR = options.pluginDataDir
  }

  for (const key of TRUSTED_PLUGIN_RUNTIME_CONFIG_KEYS) {
    const value = hostEnvironment[key]
    if (value !== undefined) {
      environment[key] = value
    }
  }

  return environment
}

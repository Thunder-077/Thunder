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

/**
 * Return the bounded retry delay for a one-based consecutive crash count.
 */
export function calculateCrashBackoff(consecutiveCrashCount: number): number {
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

const PLATFORM_ENVIRONMENT_KEYS = [
  "PATH",
  "Path",
  "PATHEXT",
  "SystemRoot",
  "WINDIR",
  "COMSPEC",
  "TEMP",
  "TMP",
  "TMPDIR",
] as const

/**
 * Build a minimal child environment without inheriting host secrets or Node
 * injection flags. Both Windows and POSIX platform variables are supported.
 */
export function createTrustedRuntimeEnvironment(
  hostEnvironment: NodeJS.ProcessEnv,
  options?: TrustedRuntimeEnvironmentOptions,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {}

  for (const key of PLATFORM_ENVIRONMENT_KEYS) {
    const value = hostEnvironment[key]
    if (value !== undefined) {
      environment[key] = value
    }
  }

  if (options !== undefined) {
    environment.THUNDER_PLUGIN_ID = options.pluginId
  }
  if (options?.pluginDataDir !== undefined) {
    environment.THUNDER_PLUGIN_DATA_DIR = options.pluginDataDir
  }

  return environment
}

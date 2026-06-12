import assert from "node:assert/strict"
import {
  calculateCrashBackoff,
  createPluginRuntimeStatus,
  createTrustedRuntimeEnvironment,
  shouldOpenRuntimeCircuit,
  TRUSTED_RUNTIME_LIMITS,
} from "./runtime-policy"
import { createRuntimeLogBuffer } from "./runtime-logs"
import type { PluginRuntimePhase } from "./types"

const phaseRunningCases: ReadonlyArray<
  readonly [PluginRuntimePhase, boolean]
> = [
  ["stopped", false],
  ["starting", false],
  ["running", true],
  ["degraded", true],
  ["crashed", false],
  ["stopping", false],
]

for (const [phase, expectedRunning] of phaseRunningCases) {
  const status = createPluginRuntimeStatus({
    pluginId: "status-test",
    kind: "trusted",
    phase,
    consecutiveCrashCount: 0,
  })
  assert.equal(status.running, expectedRunning)
}

assert.equal(calculateCrashBackoff(1), 1_000)
assert.equal(calculateCrashBackoff(2), 5_000)
assert.equal(calculateCrashBackoff(3), 30_000)
assert.equal(calculateCrashBackoff(4), 30_000)
assert.equal(calculateCrashBackoff(0), 1_000)
assert.equal(calculateCrashBackoff(-1), 1_000)
assert.equal(calculateCrashBackoff(Number.NaN), 1_000)
assert.equal(calculateCrashBackoff(Number.POSITIVE_INFINITY), 1_000)

const now = Date.parse("2026-06-12T00:05:00.000Z")
assert.equal(
  shouldOpenRuntimeCircuit(
    [
      now - TRUSTED_RUNTIME_LIMITS.crashWindowMs + 1,
      now - 60_000,
      now,
    ],
    now,
  ),
  true,
)
assert.equal(
  shouldOpenRuntimeCircuit(
    [
      now - TRUSTED_RUNTIME_LIMITS.crashWindowMs,
      now - 60_000,
      now,
    ],
    now,
  ),
  true,
)
assert.equal(
  shouldOpenRuntimeCircuit(
    [
      now - TRUSTED_RUNTIME_LIMITS.crashWindowMs - 1,
      now - 60_000,
      now,
    ],
    now,
  ),
  false,
)

const environment = createTrustedRuntimeEnvironment(
  {
    PATH: "C:\\Windows\\System32",
    Path: "C:\\Windows\\System32",
    TEMP: "C:\\Temp",
    TMPDIR: "/tmp",
    HOME: "/home/test",
    DATABASE_URL: "postgres://secret",
    NODE_OPTIONS: "--require ./secret-hook.cjs",
    THUNDER_API_SECRET: "secret",
  },
  {
    pluginId: "teleprompter",
    pluginDataDir: "C:\\Thunder\\plugins\\teleprompter",
  },
  "win32",
)
assert.equal(environment.THUNDER_PLUGIN_ID, "teleprompter")
assert.equal(
  environment.THUNDER_PLUGIN_DATA_DIR,
  "C:\\Thunder\\plugins\\teleprompter",
)
assert.equal(environment.DATABASE_URL, undefined)
assert.equal(environment.NODE_OPTIONS, undefined)
assert.equal(environment.THUNDER_API_SECRET, undefined)
assert.equal(environment.PATH, "C:\\Windows\\System32")
assert.equal(environment.Path, undefined)

const environmentWithoutDataDir = createTrustedRuntimeEnvironment(
  { PATH: "/usr/bin" },
  { pluginId: "minimal-plugin" },
  "linux",
)
const requiredPluginId: string = environmentWithoutDataDir.THUNDER_PLUGIN_ID
assert.equal(requiredPluginId, "minimal-plugin")
assert.equal(environmentWithoutDataDir.THUNDER_PLUGIN_DATA_DIR, undefined)

const windowsEnvironment = createTrustedRuntimeEnvironment(
  {
    PATH: "preferred-path",
    Path: "alternate-path",
    pAtHeXt: ".EXE;.CMD",
  },
  { pluginId: "windows-plugin" },
  "win32",
)
assert.equal(windowsEnvironment.PATH, "preferred-path")
assert.equal(windowsEnvironment.Path, undefined)
assert.equal(windowsEnvironment.PATHEXT, ".EXE;.CMD")

const windowsMixedCasePath = createTrustedRuntimeEnvironment(
  { pAtH: "mixed-case-path" },
  { pluginId: "windows-mixed-case-plugin" },
  "win32",
)
assert.equal(windowsMixedCasePath.PATH, "mixed-case-path")

const posixEnvironment = createTrustedRuntimeEnvironment(
  {
    PATH: "/usr/local/bin",
    Path: "ignored-path",
  },
  { pluginId: "posix-plugin" },
  "linux",
)
assert.equal(posixEnvironment.PATH, "/usr/local/bin")
assert.equal(posixEnvironment.Path, undefined)

const posixEnvironmentWithoutCanonicalPath = createTrustedRuntimeEnvironment(
  { Path: "ignored-path" },
  { pluginId: "posix-no-path-plugin" },
  "linux",
)
assert.equal(posixEnvironmentWithoutCanonicalPath.PATH, undefined)

const lineBuffer = createRuntimeLogBuffer({
  maxLines: 2,
  maxLineBytes: 6,
  now: () => "2026-06-12T00:00:00.000Z",
})
lineBuffer.append("first")
lineBuffer.append("second")
lineBuffer.append("third")
assert.deepEqual(
  lineBuffer.list().map(({ message }) => message),
  ["second", "third"],
)

const utf8Buffer = createRuntimeLogBuffer({
  maxLines: 1,
  maxLineBytes: 5,
  now: () => "2026-06-12T00:00:00.000Z",
})
utf8Buffer.append("你好吗")
const [truncatedLine] = utf8Buffer.list()
assert.equal(truncatedLine?.message, "你")
assert.equal(Buffer.byteLength(truncatedLine?.message ?? "", "utf8") <= 5, true)
assert.equal(truncatedLine?.timestamp, "2026-06-12T00:00:00.000Z")

console.log("[plugin-host-runtime] runtime policy tests passed")

# Trusted Runtime Process Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Thunder's trusted plugin worker-thread runtime with one resource-limited Node.js child process per plugin while preserving the public `worker.invoke` API.

**Architecture:** `TrustedRuntimeSupervisor` owns child creation, private capability-authenticated pipe clients, lifecycle state, limits, diagnostics, crash recovery, and circuit breaking. Each child process loads one plugin worker and owns its pipe server; API and Web surfaces receive sanitized status without endpoint disclosure.

**Tech Stack:** TypeScript, Node.js 24 `child_process`, Node IPC, named pipes/Unix sockets, Hono, React, pnpm workspaces, esbuild.

---

## File Structure

- `packages/plugin-host-runtime/src/runtime-errors.ts`: stable runtime error codes and typed errors.
- `packages/plugin-host-runtime/src/runtime-policy.ts`: limits, environment allowlist, backoff, and circuit calculations.
- `packages/plugin-host-runtime/src/runtime-logs.ts`: bounded stdout/stderr ring buffers.
- `packages/plugin-host-runtime/src/rpc/host-protocol.ts`: versioned capability-authenticated envelopes.
- `packages/plugin-host-runtime/src/rpc/pipe-client.ts`: bounded requests, invocation timeout, structured errors.
- `packages/plugin-host-runtime/src/rpc/pipe-server.ts`: bounded line reader, capability validation, structured responses.
- `packages/plugin-host-runtime/src/trusted-process-bootstrap.mjs`: child entrypoint and worker handler dispatch.
- `packages/plugin-host-runtime/src/trusted-runtime-supervisor.ts`: process lifecycle and invocation orchestration.
- `packages/plugin-host-runtime/src/types.ts`: public sanitized status and supervisor API.
- `apps/api/src/plugins/desktop-plugin-manager.ts`: installed-plugin validation and supervisor delegation.
- `apps/api/src/plugins/desktop-plugin-routes.ts`: runtime error to HTTP mapping.
- `apps/api/scripts/build-desktop-bundle.mjs`: copy bootstrap beside the desktop API bundle.
- `apps/web/src/lib/desktop-plugins.ts`: sanitized runtime status type.
- `packages/plugin-devtools/src/plugin-devtools-panel.tsx`: phase/PID diagnostics without endpoint.

### Task 1: Runtime Status, Errors, Policy, And Logs

**Files:**
- Create: `packages/plugin-host-runtime/src/runtime-errors.ts`
- Create: `packages/plugin-host-runtime/src/runtime-policy.ts`
- Create: `packages/plugin-host-runtime/src/runtime-logs.ts`
- Create: `packages/plugin-host-runtime/src/runtime-policy.test.ts`
- Modify: `packages/plugin-host-runtime/src/types.ts`
- Modify: `packages/plugin-host-runtime/src/index.ts`
- Modify: `packages/plugin-host-runtime/package.json`

- [ ] **Step 1: Write failing policy and log tests**

Test these concrete behaviors:

```ts
assert.deepEqual(calculateCrashBackoff(1), 1_000)
assert.deepEqual(calculateCrashBackoff(2), 5_000)
assert.deepEqual(calculateCrashBackoff(3), 30_000)
assert.equal(shouldOpenRuntimeCircuit([0, 60_000, 120_000], 300_000), true)

const env = createTrustedRuntimeEnvironment({
  PATH: "runtime-path",
  TEMP: "temp",
  DATABASE_URL: "secret",
  NODE_OPTIONS: "--inspect",
})
assert.equal(env.PATH, "runtime-path")
assert.equal(env.DATABASE_URL, undefined)
assert.equal(env.NODE_OPTIONS, undefined)

const logs = createRuntimeLogBuffer({ maxLines: 2, maxLineBytes: 8 })
logs.append("first")
logs.append("second")
logs.append("third")
assert.deepEqual(logs.list().map((entry) => entry.message), ["second", "third"])
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
pnpm --filter @thunder/plugin-host-runtime exec tsx src/runtime-policy.test.ts
```

Expected: failure because policy and log modules do not exist.

- [ ] **Step 3: Define stable status and errors**

Implement:

```ts
export type PluginRuntimePhase =
  | "stopped"
  | "starting"
  | "running"
  | "degraded"
  | "crashed"
  | "stopping"

export interface PluginRuntimeStatus {
  pluginId: string
  kind: "trusted" | "sandboxed"
  phase: PluginRuntimePhase
  running: boolean
  pid?: number
  startedAt?: string
  lastExitAt?: string
  lastExitCode?: number | null
  lastExitSignal?: NodeJS.Signals | null
  consecutiveCrashCount: number
  circuitOpenUntil?: string
  lastError?: string
}
```

Add `PluginRuntimeError` with the exact codes defined by the design and
`retryable`.

- [ ] **Step 4: Implement policy and log helpers**

Use constants:

```ts
export const TRUSTED_RUNTIME_LIMITS = {
  startupTimeoutMs: 10_000,
  shutdownGraceMs: 3_000,
  invocationTimeoutMs: 30_000,
  maxActiveInvocations: 8,
  maxRequestBytes: 1024 * 1024,
  maxResponseBytes: 5 * 1024 * 1024,
  maxOldSpaceMb: 256,
  crashWindowMs: 5 * 60_000,
  circuitDurationMs: 5 * 60_000,
  healthyResetMs: 10 * 60_000,
} as const
```

Allow only the platform variables required to locate Node and temporary files,
then add explicit `THUNDER_PLUGIN_ID` and optional
`THUNDER_PLUGIN_DATA_DIR`. Never copy `NODE_OPTIONS`.

- [ ] **Step 5: Run focused tests and type checking**

```bash
pnpm --filter @thunder/plugin-host-runtime exec tsx src/runtime-policy.test.ts
pnpm --filter @thunder/plugin-host-runtime typecheck
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add packages/plugin-host-runtime
git commit -m "refactor(plugins): define trusted runtime policy"
```

### Task 2: Versioned And Bounded Pipe RPC

**Files:**
- Modify: `packages/plugin-host-runtime/src/rpc/host-protocol.ts`
- Modify: `packages/plugin-host-runtime/src/rpc/pipe-client.ts`
- Modify: `packages/plugin-host-runtime/src/rpc/pipe-server.ts`
- Modify: `packages/plugin-host-runtime/src/rpc/pipe.test.ts`

- [ ] **Step 1: Extend the failing RPC tests**

Create a server with `pluginId: "test-plugin"` and `capability: "secret"`.
Assert:

```ts
await assert.rejects(
  createPipeClient(server.endpoint, {
    pluginId: "test-plugin",
    capability: "wrong",
  }).then((client) => client.invoke("echo", "hello")),
  /RPC_UNAUTHORIZED/,
)

await assert.rejects(
  client.invoke("echo", "x".repeat(1024 * 1024)),
  /RPC_PAYLOAD_TOO_LARGE/,
)
```

Also verify a 20 ms timeout rejects a handler that waits 100 ms with
`RPC_TIMEOUT`.

- [ ] **Step 2: Run the RPC test and verify failure**

```bash
pnpm --filter @thunder/plugin-host-runtime exec tsx src/rpc/pipe.test.ts
```

Expected: failure because client/server options and error codes are absent.

- [ ] **Step 3: Implement versioned envelopes**

Every envelope includes:

```ts
{
  version: 1,
  id,
  pluginId,
  capability,
  type,
}
```

Responses omit the capability but repeat `version`, `id`, and `pluginId`.
Structured errors contain `code`, `message`, and optional `retryable`.

- [ ] **Step 4: Enforce transport limits**

Before `socket.write`, compute UTF-8 bytes and reject requests over 1 MiB.
Server and client readers track buffered UTF-8 bytes; close the socket once the
configured maximum line size is exceeded. Responses over 5 MiB become
`RPC_RESPONSE_TOO_LARGE`.

- [ ] **Step 5: Add invocation timeout and cleanup**

`PipeClient.invoke` accepts an optional timeout override, clears its timer on
response, and removes the pending entry on every resolve/reject path.

- [ ] **Step 6: Run focused verification**

```bash
pnpm --filter @thunder/plugin-host-runtime exec tsx src/rpc/pipe.test.ts
pnpm --filter @thunder/plugin-host-runtime typecheck
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add packages/plugin-host-runtime/src/rpc
git commit -m "refactor(plugins): harden trusted runtime rpc"
```

### Task 3: Trusted Child Process Bootstrap

**Files:**
- Create: `packages/plugin-host-runtime/src/trusted-process-bootstrap.mjs`
- Create: `packages/plugin-host-runtime/src/trusted-process-bootstrap.test.ts`
- Delete: `packages/plugin-host-runtime/src/worker-thread-bootstrap.mjs`

- [ ] **Step 1: Write a real child-process bootstrap test**

Create a temporary trusted plugin with handlers:

```js
export default {
  handlers: {
    echo(payload) {
      return {
        payload,
        pluginId: process.env.THUNDER_PLUGIN_ID,
        dataDir: process.env.THUNDER_PLUGIN_DATA_DIR ?? null,
        databaseUrl: process.env.DATABASE_URL ?? null,
      }
    },
    exit() {
      process.exit(17)
    },
  },
}
```

Spawn the bootstrap with `stdio: ["ignore", "pipe", "pipe", "ipc"]`, wait for
`bootstrap-ready`, send `initialize`, and verify `ready` contains an endpoint.

- [ ] **Step 2: Run the test and verify failure**

```bash
pnpm --filter @thunder/plugin-host-runtime exec tsx src/trusted-process-bootstrap.test.ts
```

Expected: failure because the process bootstrap does not exist.

- [ ] **Step 3: Implement the IPC handshake**

The bootstrap sends:

```js
process.send({ type: "bootstrap-ready", version: 1 })
```

It accepts exactly one `initialize` message containing plugin identity, paths,
capability, and limits. It rejects duplicate or malformed initialization.

- [ ] **Step 4: Load and validate the worker**

Resolve both plugin root and runtime entry, ensure the resolved entry stays
inside the plugin root, import it, and require a default object with a
plain-object `handlers` map.

- [ ] **Step 5: Start and stop the child-owned pipe server**

Start the bounded pipe server with exact plugin id and capability. On
`shutdown`, parent disconnect, `SIGTERM`, or `SIGINT`, close the server and exit
without leaving a Unix socket.

- [ ] **Step 6: Verify secret hygiene and crash isolation**

Assert the `echo` response contains no `DATABASE_URL`. Invoke `exit`, assert
child code is 17, and assert the parent test process continues.

- [ ] **Step 7: Run focused tests**

```bash
pnpm --filter @thunder/plugin-host-runtime exec tsx src/trusted-process-bootstrap.test.ts
pnpm --filter @thunder/plugin-host-runtime typecheck
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add packages/plugin-host-runtime/src/trusted-process-bootstrap.mjs packages/plugin-host-runtime/src/trusted-process-bootstrap.test.ts packages/plugin-host-runtime/src/worker-thread-bootstrap.mjs
git commit -m "refactor(plugins): add trusted process bootstrap"
```

### Task 4: Process-Based Trusted Runtime Supervisor

**Files:**
- Rewrite: `packages/plugin-host-runtime/src/trusted-runtime-supervisor.ts`
- Modify: `packages/plugin-host-runtime/src/runtime.test.ts`
- Create: `packages/plugin-host-runtime/src/trusted-runtime-supervisor.test.ts`

- [ ] **Step 1: Write lifecycle tests**

Test with an injectable clock and spawn function:

```ts
const [first, second] = await Promise.all([
  supervisor.start(plugin),
  supervisor.start(plugin),
])
assert.equal(first.pid, second.pid)
assert.equal(spawnCount, 1)
assert.equal("endpoint" in first, false)
```

Also test maximum eight active invocations and a ninth rejection with
`RPC_CONCURRENCY_LIMIT`.

- [ ] **Step 2: Write crash and circuit tests**

Start and crash the child three times inside five minutes. Assert:

```ts
assert.equal(supervisor.getStatus(plugin.id).phase, "crashed")
await assert.rejects(
  supervisor.invoke(plugin, "echo"),
  /RUNTIME_CIRCUIT_OPEN/,
)
```

Then call `start(plugin, { manual: true })` and assert the circuit clears.

- [ ] **Step 3: Run tests and verify failure**

```bash
pnpm --filter @thunder/plugin-host-runtime exec tsx src/trusted-runtime-supervisor.test.ts
```

Expected: existing worker-thread supervisor lacks the required API.

- [ ] **Step 4: Implement process records and start deduplication**

Use one internal record per plugin containing child, private endpoint/client,
capability, start promise, active count, crash history, logs, and status.
`start` checks trusted kind, `native-runtime`, runtime entry, and circuit state
before spawning.

- [ ] **Step 5: Implement invocation**

`invoke` performs lazy start, enforces concurrency, calls the private client,
and releases its slot in `finally`. It never exposes endpoint or capability.

- [ ] **Step 6: Implement stop and process-tree termination**

Wait for active calls, send `shutdown`, then terminate after the grace period.
On Windows use `taskkill /pid <pid> /T /F` only after checking the exact numeric
PID belongs to the tracked child. On POSIX spawn children detached and signal
the negative process group id.

- [ ] **Step 7: Implement crash accounting**

Reject active calls, close the client, update sanitized status, calculate
backoff/circuit state, and reset crash count after ten healthy minutes.

- [ ] **Step 8: Run runtime package verification**

```bash
pnpm --filter @thunder/plugin-host-runtime test
pnpm --filter @thunder/plugin-host-runtime exec tsx src/trusted-runtime-supervisor.test.ts
pnpm --filter @thunder/plugin-host-runtime typecheck
```

Expected: pass.

- [ ] **Step 9: Commit**

```bash
git add packages/plugin-host-runtime
git commit -m "refactor(plugins): supervise trusted plugin processes"
```

### Task 5: API Runtime Integration And Error Mapping

**Files:**
- Modify: `apps/api/src/plugins/desktop-plugin-types.ts`
- Modify: `apps/api/src/plugins/desktop-plugin-manager.ts`
- Modify: `apps/api/src/plugins/desktop-plugin-routes.ts`
- Modify: `apps/api/src/plugins/desktop-plugin-manager.test.ts`
- Modify: `apps/api/src/plugins/desktop-plugin-routes.test.ts`
- Modify: `apps/api/src/plugins/desktop-plugin-e2e.test.ts`

- [ ] **Step 1: Update failing API assertions**

Replace endpoint assertions with:

```ts
assert.equal(startedRuntimeStatus.phase, "running")
assert.equal(typeof startedRuntimeStatus.pid, "number")
assert.equal("endpoint" in startedRuntimeStatus, false)
```

Add route-level assertions that `RPC_TIMEOUT` maps to 504,
`RUNTIME_CIRCUIT_OPEN` maps to 429, and `RUNTIME_CRASHED` maps to 503.

- [ ] **Step 2: Run plugin API tests and verify failure**

```bash
pnpm --filter @thunder/api test:plugins
```

Expected: failure because API still requires supervisor endpoints.

- [ ] **Step 3: Add plugin data directory resolution**

Create `{desktop-data-root}/plugin-data/{plugin-id}` only for
`filesystem:plugin-data`, validate it remains inside the data root, and pass it
to the supervisor start/invoke options.

- [ ] **Step 4: Remove endpoint-oriented integration**

Delete the `createPipeClient` import, `getEndpoint` usage, and all endpoint
fields. Delegate worker calls directly:

```ts
return trustedRuntimeSupervisor.invoke(
  {
    manifest: plugin.manifest,
    pluginRoot: plugin.pluginRoot,
    dataDirectory,
  },
  method,
  payload,
)
```

- [ ] **Step 5: Map typed runtime errors**

Map only `PluginRuntimeError` codes explicitly. Preserve unexpected errors as
500 and avoid returning stack traces, endpoint paths, capabilities, or command
lines.

- [ ] **Step 6: Run API verification**

```bash
pnpm --filter @thunder/api test:plugins
pnpm --filter @thunder/api typecheck
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/plugins
git commit -m "refactor(plugins): route trusted calls through supervisor"
```

### Task 6: Web, CLI, And DevTools Status Migration

**Files:**
- Modify: `apps/web/src/lib/desktop-plugins.ts`
- Modify: `apps/web/src/app/plugins/[pluginId]/page.tsx`
- Modify: `packages/plugin-devtools/src/plugin-devtools-panel.tsx`
- Modify: `packages/plugin-cli/src/commands/dev.ts`
- Modify: `packages/plugin-cli/src/index.test.ts`

- [ ] **Step 1: Update status types**

Use:

```ts
type PluginWorkerStatus = {
  phase: PluginRuntimePhase
  running: boolean
  pid?: number
  startedAt?: string
  consecutiveCrashCount: number
  circuitOpenUntil?: string
  lastError?: string | null
}
```

Remove `endpoint`, `port`, and `baseUrl`.

- [ ] **Step 2: Update UI diagnostics**

Show State, PID, Started At, Crash Count, Circuit Until, and Last Error.
Do not show endpoint or process command arguments.

- [ ] **Step 3: Update CLI dev polling fixtures**

The dev CLI checks `running` and optional `phase`; test responses use
`{ phase: "running", running: true, pid: 1234 }`.

- [ ] **Step 4: Run focused checks**

```bash
pnpm --filter @thunder/plugin-cli test
pnpm --filter @thunder/plugin-devtools typecheck
pnpm --filter @thunder/web typecheck
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web packages/plugin-devtools packages/plugin-cli
git commit -m "refactor(plugins): sanitize trusted runtime status"
```

### Task 7: Desktop Bundle Bootstrap Packaging

**Files:**
- Modify: `apps/api/scripts/build-desktop-bundle.mjs`
- Modify: `apps/api/scripts/validate-desktop-runtime.mjs`
- Create: `apps/api/scripts/trusted-runtime-bootstrap-copy.test.mjs`
- Modify: `apps/desktop/scripts/build-local-runtime.mjs`
- Modify: `apps/desktop/scripts/build-release.test.mjs`

- [ ] **Step 1: Write the failing copy test**

Build into a temporary runtime API directory and assert:

```js
await access(resolve(runtimeApiDir, "trusted-process-bootstrap.mjs"))
```

Also inspect `server.cjs` and assert the runtime resolves the bootstrap beside
the bundle rather than a workspace source path.

- [ ] **Step 2: Run the test and verify failure**

```bash
node apps/api/scripts/trusted-runtime-bootstrap-copy.test.mjs
```

Expected: bootstrap artifact is missing.

- [ ] **Step 3: Add explicit bootstrap resolution**

The supervisor accepts `bootstrapPath`. API initialization uses:

```ts
process.env.THUNDER_TRUSTED_RUNTIME_BOOTSTRAP_PATH ??
resolve(__dirname, "trusted-process-bootstrap.mjs")
```

Development fallback resolves the package source bootstrap only when the
compiled sibling does not exist.

- [ ] **Step 4: Copy and validate the bootstrap**

`build-desktop-bundle.mjs` copies the `.mjs` file to `runtime/api`. Runtime
validation checks it exists and can emit `bootstrap-ready` under the bundled
Node executable.

- [ ] **Step 5: Run packaging checks**

```bash
node apps/api/scripts/trusted-runtime-bootstrap-copy.test.mjs
pnpm --filter @thunder/api build:desktop-bundle
node apps/desktop/scripts/build-release.test.mjs
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/scripts apps/desktop/scripts
git commit -m "build(plugins): package trusted runtime bootstrap"
```

### Task 8: Documentation And Final Verification

**Files:**
- Modify: `docs/desktop-plugin-system.md`
- Modify: `docs/desktop-plugin-development.md`
- Modify: `docs/plugin-platform.md`
- Modify: `packages/plugin-cli/src/templates/trusted-app/README.md`

- [ ] **Step 1: Update security and lifecycle documentation**

Document one child process per trusted plugin, no public endpoint, 256 MiB
default old-space limit, 30 second invocation timeout, eight active calls,
crash circuit behavior, private data directory permission, and the explicit
warning that this is not an OS sandbox.

- [ ] **Step 2: Verify no stale worker-thread or endpoint claims**

```bash
rg -n "worker_threads|worker thread|runtime endpoint|getEndpoint|endpoint.*trusted" \
  docs packages/plugin-cli/src/templates packages/plugin-host-runtime apps/api/src/plugins apps/web/src/lib
```

Expected: no stale public endpoint or worker-thread architecture claims.

- [ ] **Step 3: Run all focused tests**

```bash
pnpm --filter @thunder/plugin-host-runtime test
pnpm --filter @thunder/plugin-host-runtime exec tsx src/runtime-policy.test.ts
pnpm --filter @thunder/plugin-host-runtime exec tsx src/rpc/pipe.test.ts
pnpm --filter @thunder/plugin-host-runtime exec tsx src/trusted-process-bootstrap.test.ts
pnpm --filter @thunder/plugin-host-runtime exec tsx src/trusted-runtime-supervisor.test.ts
pnpm --filter @thunder/plugin-sdk-worker test
pnpm --filter @thunder/plugin-cli test
pnpm test:plugins
```

Expected: all pass.

- [ ] **Step 4: Run repository verification**

```bash
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

Expected: zero errors. Existing unrelated warnings must be reported, not
silently attributed to this phase.

- [ ] **Step 5: Inspect repository state**

Restore test-mutated SQLite fixtures if they changed:

```bash
git restore -- .thunder-plugin-e2e-test/app.db .thunder-plugin-manager-test/app.db
git status --short
```

Confirm no generated runtime directory, secret, socket, PID file, or temporary
plugin directory is included.

- [ ] **Step 6: Commit**

```bash
git add docs packages/plugin-cli/src/templates/trusted-app
git commit -m "docs(plugins): document isolated trusted runtimes"
```

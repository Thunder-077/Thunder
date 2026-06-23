# Trusted Runtime Process Isolation Design

## Context

Thunder has a two-level desktop plugin model:

- `sandboxed` is the default UI-only model.
- `trusted` is an exceptional model for local runtime and native capabilities.

The current trusted implementation loads each plugin in a Node.js
`worker_threads.Worker`. This avoids importing plugin code into the API main
thread, but it does not create a process-level fault boundary. Plugin memory,
native extensions, fatal runtime failures, inherited environment, and process
resources still share the API process.

The current RPC path is also indirect:

```text
Web Host
  -> API worker.invoke route
  -> Pipe Client
  -> Pipe Server in API process
  -> Worker thread MessagePort
  -> plugin handler
```

The pipe does not provide isolation because both endpoints and the worker
supervisor remain inside the API process.

## Goals

- Run each trusted plugin runtime in its own Node.js child process.
- Make the child process own its private pipe or Unix socket RPC server.
- Keep real RPC endpoints private to the API process.
- Isolate plugin crashes and process-level memory limits from the API process.
- Add deterministic startup, invocation, shutdown, crash, restart, and circuit
  breaker behavior.
- Limit RPC payload size, execution time, and per-plugin concurrency.
- Provide a private writable data directory only when explicitly permitted.
- Keep the Browser SDK `worker.invoke` API stable.
- Remove the transitional `worker_threads` implementation.

## Non-Goals

- Claiming that trusted plugins are an operating-system security sandbox.
- Preventing a trusted plugin from using Node.js APIs available to its process.
- Container, VM, AppContainer, seccomp, or platform entitlement isolation.
- Supporting multiple trusted plugins in one broker process.
- Allowing plugins to expose arbitrary HTTP services.
- Adding new Browser SDK methods.
- Preserving the public runtime `endpoint` field.

## Architecture

The target flow is:

```text
Plugin iframe
  -> Web Host Bridge
  -> API worker.invoke route
  -> TrustedRuntimeSupervisor.invoke(plugin, method, payload)
  -> private Pipe Client
  -> plugin child process Pipe Server
  -> plugin worker handler
```

`packages/plugin-host-runtime` owns:

- child process creation and termination
- startup handshake
- private RPC transport
- per-plugin runtime state
- invocation timeout and concurrency control
- crash accounting and circuit breaking
- bounded stdout and stderr diagnostics
- plugin data directory construction

`apps/api` owns:

- loading the installed plugin and checking its manifest
- translating runtime errors into HTTP responses
- exposing sanitized runtime status
- stopping the runtime during upgrade and uninstall

The plugin child owns:

- loading `runtime.entry`
- validating the default worker export
- creating and closing its private RPC server
- dispatching declared handlers
- returning structured results and errors

## Process Creation

The supervisor launches one child process per running trusted plugin using
`child_process.spawn`.

The executable defaults to `process.execPath` and is injectable in tests and
packaged desktop environments. The child runs a plain JavaScript bootstrap
shipped with `@thunder/plugin-host-runtime`.

Spawn properties:

- working directory: installed plugin root
- stdio: ignored stdin, captured stdout/stderr, Node IPC control channel
- `shell: false`
- inspector flags are not passed
- inherited `NODE_OPTIONS` is removed
- memory limit: `--max-old-space-size=256` by default
- environment: a minimal allowlist plus explicit Thunder runtime variables
- startup timeout: 10 seconds

The command line contains only the bootstrap path. After spawn, the parent
sends an immutable initialization message through Node IPC:

- plugin id
- plugin root
- runtime entry
- optional private data directory
- RPC limits and protocol version
- a random per-process RPC capability token

The capability token and plugin paths are not exposed through command-line
arguments. No database URL, authentication secret, marketplace signing key,
API token, or unrelated Thunder environment variable is inherited.

The child first reports `bootstrap-ready`; the parent then sends `initialize`.
The child reports `ready`, `init-error`, and `stopped` through Node IPC. The
`ready` message contains the private endpoint. The supervisor validates the
message shape and plugin id before accepting the runtime.

## Private Data Directory

Installed plugin files remain read-only application assets by convention.
Writable runtime data uses:

```text
{desktop-data-root}/plugin-data/{plugin-id}/
```

The API passes this directory to the supervisor only when the manifest declares
`filesystem:plugin-data`. The child exposes it as
`THUNDER_PLUGIN_DATA_DIR`.

Without that permission:

- the data directory is not created
- the environment variable is absent
- Thunder does not provide a writable storage capability to the worker

This is a platform contract, not an OS filesystem sandbox. Trusted code may
still attempt to access other user files through Node.js and the operating
system account.

## Runtime State Model

Public runtime phases are:

- `stopped`
- `starting`
- `running`
- `degraded`
- `crashed`
- `stopping`

The internal runtime record additionally stores:

- child process handle
- private endpoint
- reusable Pipe Client
- startup promise
- start timestamp
- last exit timestamp
- exit code and signal
- consecutive crash count
- circuit-open-until timestamp
- active invocation count
- bounded stdout/stderr logs

The public status contains:

- plugin id
- phase and `running` compatibility boolean
- PID while running
- start timestamp
- consecutive crash count
- circuit-open-until timestamp when applicable
- sanitized last error

It never contains the pipe or socket endpoint.

## Start And Stop Semantics

`start(plugin)` is idempotent:

- a running plugin returns its current public status
- concurrent starts share one startup promise
- a stopped plugin starts one child
- an open circuit rejects automatic or lazy starts
- an explicit manual start clears the circuit and crash counter

`invoke(plugin, method, payload)` performs lazy start, acquires a concurrency
slot, invokes through the private client, applies a timeout, and releases the
slot in `finally`.

`stop(pluginId)`:

1. changes phase to `stopping`
2. rejects new invocations
3. waits up to 3 seconds for active invocations
4. sends a shutdown control message
5. waits up to 3 seconds for child exit
6. terminates the process tree if still alive
7. closes the Pipe Client and removes Unix socket files
8. changes phase to `stopped`

Upgrade, reinstall, and uninstall continue to await `stop` before replacing or
removing plugin files.

## Crash Recovery And Circuit Breaker

An unexpected child exit:

- rejects all active RPC calls
- closes the private client
- records exit code, signal, time, and sanitized error
- changes phase to `crashed`
- increments the consecutive crash count

Thunder does not restart a plugin merely because it is idle after a crash.
The next invocation may perform one lazy restart using exponential backoff:

- first crash: 1 second
- second crash: 5 seconds
- third crash: 30 seconds

Three unexpected exits within five minutes open the circuit for five minutes.
Calls during that period fail immediately. A plugin upgrade or explicit manual
start clears the circuit.

A successful runtime period of ten minutes resets the consecutive crash count.

## RPC Protocol

The pipe protocol gains a versioned envelope:

```ts
interface TrustedRuntimeRpcRequest {
  version: 1
  type: "request"
  id: string
  pluginId: string
  capability: string
  method: string
  payload?: unknown
}
```

Responses repeat `version`, `id`, and `pluginId`. Errors contain:

- stable error code
- safe message
- optional retryable flag

Stable runtime error codes include:

- `RUNTIME_START_FAILED`
- `RUNTIME_NOT_READY`
- `RUNTIME_CRASHED`
- `RUNTIME_CIRCUIT_OPEN`
- `RPC_INVALID_REQUEST`
- `RPC_METHOD_NOT_FOUND`
- `RPC_PAYLOAD_TOO_LARGE`
- `RPC_RESPONSE_TOO_LARGE`
- `RPC_TIMEOUT`
- `RPC_CONCURRENCY_LIMIT`
- `RPC_HANDLER_FAILED`
- `RPC_UNAUTHORIZED`

Limits:

- request envelope: 1 MiB
- response envelope: 5 MiB
- invocation timeout: 30 seconds
- maximum active invocations: 8 per plugin
- maximum buffered transport line: response limit plus envelope overhead

Oversized requests are rejected before writing to the socket. The server stops
buffering and closes a connection that exceeds the maximum line size.

## Logs And Diagnostics

The supervisor captures child stdout and stderr into separate in-memory ring
buffers:

- maximum 200 lines per stream
- maximum 64 KiB per line
- older entries are discarded
- plugin id and timestamp are added by the host

Runtime status returns only the most recent sanitized error. A host-internal
diagnostic function may return bounded logs for future DevTools integration,
but this phase does not add a public REST log endpoint.

## API Integration

`TrustedPluginRuntimeSupervisor` changes from endpoint-oriented methods to:

```ts
interface TrustedPluginRuntimeSupervisor {
  start(plugin: RegisteredPlugin, options?: { manual?: boolean }): Promise<PluginRuntimeStatus>
  invoke(plugin: RegisteredPlugin, method: string, payload?: unknown): Promise<unknown>
  stop(pluginId: string): Promise<PluginRuntimeStatus>
  getStatus(pluginId: string): PluginRuntimeStatus
}
```

`getEndpoint` is removed.

`apps/api/src/plugins/desktop-plugin-manager.ts` no longer imports or creates a
Pipe Client. `invokeDesktopPluginWorker` validates `kind` and `native-runtime`,
then delegates directly to `trustedRuntimeSupervisor.invoke`.

Runtime route errors map as follows:

- invalid manifest or method: 400
- permission failure: 403
- circuit open or concurrency limit: 429
- runtime unavailable or crashed: 503
- invocation timeout: 504
- unexpected host failure: 500

## Child Bootstrap

`worker-thread-bootstrap.mjs` is deleted and replaced with a process bootstrap.
The bootstrap:

1. validates startup configuration
2. waits for and validates the IPC initialization message
3. resolves `runtime.entry` inside the plugin root
4. imports the worker module
5. validates the handler map
6. creates its private Pipe Server
7. sends `ready` over IPC
8. handles RPC requests with capability, size, and method validation
9. closes the server on shutdown, disconnect, SIGTERM, or SIGINT

The bootstrap does not import API application modules and does not receive
database or repository objects.

## Packaging

The process bootstrap must be included in:

- package source execution
- API production build output
- Desktop bundled Node runtime

Bootstrap resolution is explicit and tested in both ESM package tests and the
compiled API layout. Runtime startup must fail with a clear error if the
bootstrap artifact is missing.

## Migration And Breaking Changes

The Browser SDK and plugin worker definition remain unchanged:

```ts
await thunder.worker.invoke("speech.transcribe", payload)
```

Breaking host changes:

- runtime `endpoint` is removed from public status
- `getEndpoint` is removed from the supervisor API
- `worker_threads` bootstrap and forwarding server are deleted
- tests and DevTools types must use phase, PID, and sanitized diagnostics

Existing trusted plugin worker source remains compatible if it exports a
`defineWorker`-compatible default handler map.

## Testing

Unit tests cover:

- environment allowlisting and secret removal
- startup config validation
- endpoint privacy
- request and response size limits
- invalid RPC capability rejection
- invocation timeout
- concurrency rejection
- log ring buffer limits
- status transitions
- crash accounting and backoff calculations

Integration tests launch real child processes and verify:

- concurrent starts create one PID
- a normal handler round trip succeeds
- `process.exit()` in a plugin does not terminate the API test process
- pending calls reject when the child exits
- graceful shutdown and forced termination
- lazy restart and circuit opening
- explicit manual start clears the circuit
- missing bootstrap and invalid worker exports fail cleanly
- plugin data directory is present only with permission
- parent secrets are absent in the child

API plugin tests verify:

- worker invocation no longer depends on public endpoints
- runtime status is sanitized
- upgrade and uninstall stop the child before file replacement
- runtime error codes map to the intended HTTP statuses

The final verification set is:

```bash
pnpm --filter @thunder/plugin-host-runtime test
pnpm --filter @thunder/plugin-sdk-worker test
pnpm test:plugins
pnpm lint
pnpm typecheck
pnpm build
```

## Security Statement

Trusted plugins execute arbitrary local JavaScript with the user's operating
system account. Process isolation improves availability, lifecycle control,
resource limits, and secret hygiene. It does not make trusted code safe.
Installation UI and documentation must continue to present trusted plugins as
high-risk extensions that should be rare and explicitly selected.

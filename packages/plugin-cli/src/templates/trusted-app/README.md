# __PLUGIN_NAME__

A Thunder desktop plugin (trusted runtime).

## Layout

- `plugin.json` — Manifest declaring id, kind, permissions and contributions.
- `src/index.tsx` — UI entry; rendered inside the host's iframe.
- `src/worker.ts` — Trusted worker entry; runs in its own Node child process.
- `dist/` — Build output (generated).

## Runtime

Each trusted plugin runs in a **dedicated Node.js child process**, isolated
from the API host and from other plugins. The platform manages process
lifecycle automatically — your worker code just exports handlers.

Key constraints:

| Limit | Default |
|-------|---------|
| Old-space memory | 256 MiB |
| Invocation timeout | 30 seconds |
| Max concurrent calls | 8 |
| Max request payload | 1 MiB |
| Max response payload | 5 MiB |

Environment variables available to your worker:

- `THUNDER_PLUGIN_ID` — current plugin id.
- `THUNDER_PLUGIN_DATA_DIR` — only present when `filesystem:plugin-data` is
  declared; points to a private directory for local files.

The platform **does not** pass `DATABASE_URL`, signing keys, `NODE_OPTIONS`,
or any other host secrets to the child process.

If your worker crashes, the platform will restart it with exponential backoff
(1 s → 5 s → 30 s). Three crashes within five minutes triggers a five-minute
circuit breaker. A manual start clears the circuit.

> **⚠️ Security notice:** Process isolation provides crash boundaries and
> environment separation, but it is **not an OS-level sandbox**. Trusted code
> runs with the same OS user privileges as the host process and can access the
> local filesystem. Only install trusted plugins from sources you trust.

## Setup

### Inside the Thunder monorepo

From the monorepo root:

```bash
pnpm install
```

Dependencies use `workspace:*` and resolve to the local `packages/*` sources.

### Outside the monorepo

Install the SDK from npm:

```bash
npm install
```

Make sure the Thunder Desktop host is running before starting dev mode:

```bash
# Start dev mode (auto-installs plugin into running host)
npx thunder-plugin dev

# Or point at a remote host
THUNDER_PLUGIN_DEV_API_URL=http://your-host:3001 npx thunder-plugin dev
```

## Build & develop

```bash
# One-shot build into dist/
thunder-plugin build .

# Watch mode (also installs the plugin into a running desktop host)
thunder-plugin dev .

# Package a signed tarball into artifacts/
thunder-plugin pack .
```

`thunder-plugin dev` will:

1. Detect a Thunder monorepo to auto-start the desktop dev host if one isn't
   already running. Set `THUNDER_DEV_HOST_AUTO_START=0` to disable this.
2. Build with esbuild on every change and reinstall the plugin into the host.
3. Open the devtools page in your default browser.

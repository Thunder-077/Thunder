# __PLUGIN_NAME__

A Thunder desktop plugin (trusted runtime).

## Layout

- `plugin.json` — Manifest declaring id, kind, permissions and contributions.
- `src/index.tsx` — UI entry; rendered inside the host's iframe.
- `src/worker.ts` — Trusted worker entry; runs alongside the host process.
- `dist/` — Build output (generated).

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

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

The `workspace:*` protocol only resolves inside a pnpm workspace. For an
external project you have two options:

**A) Link the SDK packages from a local checkout**

```bash
# from a Thunder monorepo root
pnpm --filter @thunder/plugin-sdk build
pnpm --filter @thunder/plugin-schema build
pnpm --filter @thunder/plugin-sdk-worker build
```

Then in your plugin:

```bash
pnpm link /path/to/thunder-monorepo/packages/plugin-sdk
pnpm link /path/to/thunder-monorepo/packages/plugin-schema
pnpm link /path/to/thunder-monorepo/packages/plugin-sdk-worker
```

**B) Wait for the SDK packages to be published to npm**

Update `package.json` to use a real version (e.g. `"@thunder/plugin-sdk": "^0.1.0"`)
and run `pnpm install`.

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

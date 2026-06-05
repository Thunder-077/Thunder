# Thunder Plugin Platform v2 and Teleprompter Design

## Context

Thunder already has a desktop-only runtime plugin system built around `plugin.json`, sandboxed plugin iframes, a browser-side host bridge, a loopback HTTP proxy, and optional Node plugin runtimes. The official teleprompter plugin is the most advanced user of that system and already exercises iframe rendering, plugin storage, a local Node runtime, and a Tauri-backed native speech bridge.

That existing system proves the product need, but it is not developer-friendly enough to serve as a durable third-party plugin platform. Its core issues are:

- plugin authors are exposed to transport and host implementation details such as iframe messaging, runtime HTTP paths, local proxying, and health checks
- the SDK and UI packages are not yet public plugin products
- the install and development loop is still oriented around internal local path installs rather than a first-class plugin developer workflow
- high-trust plugin behavior is expressed as a coarse combination of `local-api-proxy`, runtime HTTP, and host-injected environment, rather than a clear `trusted` execution model
- the first real plugin, teleprompter, still carries internal assumptions that would not hold for an external developer

This design defines a full plugin platform rewrite and uses teleprompter as the first real plugin customer under the new system.

## Goals

- Build a desktop-only plugin platform that is developer-friendly enough for external authors.
- Support both low-trust UI plugins and high-trust local-worker plugins with explicit boundaries.
- Make teleprompter the first commercial-grade plugin on the new platform.
- Force teleprompter to consume only public plugin APIs, even when its internals are incubated inside the Thunder monorepo.
- Replace loopback runtime HTTP with a proper trusted worker model over named pipes or domain sockets.
- Deliver a real external developer workflow with `create/dev/build/pack/publish`.

## Non-Goals

- Web runtime plugins in v1 of the new platform.
- A public plugin marketplace backend in the first phase.
- Full automatic migration of every legacy plugin.
- A generic reusable platform-level speech API in the first phase.
- Mobile or browser-hosted plugin execution.

## Product Decision Summary

The decisions confirmed for this design are:

- platform mode: `Desktop only`
- plugin migration mode: `platform incubation`
- execution model: both `sandboxed` and `trusted` must be implemented together
- trusted runtime transport: `named pipe` on Windows and `domain socket` where supported
- first real plugin: teleprompter
- teleprompter speech capability: remains a plugin-owned trusted capability in phase one, not a general platform speech API
- development strategy: platform and plugin evolve together, but every new capability must land as a public API rather than an internal teleprompter special case

## High-Level Architecture

The new platform is split into six stable boundaries:

1. `plugin-schema`
   Owns manifest types, parsing, validation, compatibility rules, and package metadata constraints.

2. `plugin-sdk`
   Owns the public frontend plugin API for `sandboxed` plugins and trusted plugin UIs.

3. `plugin-sdk-worker`
   Owns the public worker API for `trusted` plugin backends.

4. `plugin-host-runtime`
   Owns plugin discovery, lifecycle, permissions, UI container loading, trusted worker supervision, RPC transport, logging, diagnostics, and installation state.

5. `plugin-cli`
   Owns the external developer workflow: create, dev, build, test, pack, publish.

6. `plugin-devtools`
   Owns manifest inspection, permission display, RPC tracing, worker status, logs, storage inspection, and diagnostics.

Teleprompter itself is not allowed to consume host internals directly. It must depend on:

- `plugin-sdk`
- `plugin-sdk-worker`
- shared extracted packages that are intentionally public inside the monorepo, such as teleprompter core logic

It must not depend on:

- old desktop plugin bridge internals
- runtime HTTP proxy details
- `apps/web` private UI implementation
- host page state or internal router state
- Tauri bridge transport details

## Runtime Model

### Sandboxed Plugins

`sandboxed` plugins run inside an isolated page container controlled by the host. They are allowed to render UI and call explicitly exposed host capabilities through `plugin-sdk`. They cannot:

- access the filesystem directly
- access the main application database
- access Tauri APIs directly
- inspect host environment variables
- open their own local runtimes

The host decides whether the container is implemented with an iframe, webview, or another isolated page surface. That detail is hidden from plugin authors.

### Trusted Plugins

`trusted` plugins have two pieces:

- a `sandboxed` UI surface
- a separate local worker process managed by the host

The worker is launched by the host with a minimal environment whitelist:

- `THUNDER_PLUGIN_ID`
- `THUNDER_PLUGIN_VERSION`
- `THUNDER_PLUGIN_DATA_DIR`
- `THUNDER_PLUGIN_CACHE_DIR`

The worker does not expose an HTTP server. It communicates only through host-managed RPC over named pipes on Windows and domain sockets where supported. The host owns:

- process startup and shutdown
- liveness checks
- timeout enforcement
- request cancellation
- request and error logging
- crash capture and restart policy
- permission enforcement

This removes the legacy need for:

- plugin-owned loopback HTTP ports
- `healthPath`
- runtime path validation for HTTP requests
- runtime header sanitization across host-to-plugin proxy hops

### RPC Model

All trusted runtime traffic is RPC, not REST-like path dispatch.

Frontend to worker:

```ts
await thunder.worker.invoke("speech.transcribe", payload)
```

Worker registration:

```ts
defineWorker({
  handlers: {
    "speech.transcribe": async (payload) => { ... }
  }
})
```

The host is responsible for validating method availability, payload schema, timeout policy, permissions, and structured error propagation.

## Manifest v2

Plugin manifests remain file-based and keep the `plugin.json` name, but move to a new schema focused on product semantics instead of host mechanics.

Example `trusted` teleprompter manifest:

```json
{
  "manifestVersion": 2,
  "id": "teleprompter",
  "name": "提词器",
  "version": "2.0.0",
  "description": "大字提词、自动滚动、语音跟读与本地模型管理。",
  "kind": "trusted",
  "engines": {
    "thunder": "^2.0.0"
  },
  "author": {
    "name": "Thunder"
  },
  "icon": "ScrollText",
  "permissions": [
    "storage",
    "notifications",
    "activity",
    "microphone",
    "native-runtime",
    "filesystem:plugin-data"
  ],
  "contributes": {
    "sidebar": {
      "title": "提词器",
      "icon": "ScrollText",
      "entry": "dist/index.html"
    },
    "commands": [
      {
        "id": "teleprompter.open",
        "title": "打开提词器"
      }
    ],
    "settings": [
      {
        "key": "speechProvider",
        "type": "select",
        "title": "语音提供方",
        "default": "local",
        "options": ["local", "web-speech"]
      }
    ]
  },
  "runtime": {
    "entry": "dist/worker.js"
  }
}
```

Key differences from the legacy system:

- no `webview` permission
- no `local-api-proxy`
- no `healthPath`
- no runtime kind selection in phase one
- no main-database migration declaration
- mandatory `engines.thunder`

## Permission Model

Permissions are intentionally small in number and phrased in user-facing product terms.

Initial permission set:

- `storage`
- `secrets`
- `notifications`
- `activity`
- `microphone`
- `filesystem:plugin-data`
- `network:<origin>`
- `native-runtime`

Rules:

- `sandboxed` plugins cannot request `native-runtime`
- `sandboxed` plugins cannot request `filesystem:plugin-data`
- `trusted` plugins may request those two permissions
- `network` permissions must always be scoped to an origin; no broad unrestricted network permission is allowed
- `microphone` must remain explicit and is not implied by `native-runtime`

For teleprompter phase one, the recommended required permissions are:

- `storage`
- `notifications`
- `activity`
- `microphone`
- `native-runtime`
- `filesystem:plugin-data`

`network:<origin>` is optional in phase one and should be omitted unless the teleprompter delivery path still requires plugin-owned remote network access.

## Public SDK Surface

### Frontend SDK

The platform must expose capability-level APIs rather than transport-level primitives. The first public SDK modules should be:

- `thunder.plugin`
- `thunder.navigation`
- `thunder.storage`
- `thunder.secrets`
- `thunder.settings`
- `thunder.notifications`
- `thunder.fetch`
- `thunder.commands`
- `thunder.theme`
- `thunder.logger`
- `thunder.worker`

Plugin UI setup example:

```ts
import { definePlugin } from "@thunder/plugin-sdk";

export default definePlugin({
  setup(app) {
    app.panels.register("main", {
      title: "Notes",
      component: MainPanel
    });

    app.commands.register("notes.open", async () => {
      await app.navigation.openPanel("main");
    });
  }
});
```

### Worker SDK

The worker SDK must hide RPC wiring and expose a simple handler model:

```ts
import { defineWorker } from "@thunder/plugin-sdk/worker";

export default defineWorker({
  handlers: {
    "speech.transcribe": async ({ filePath }) => {
      return { text: "..." };
    }
  }
});
```

No worker author should have to implement:

- a custom local server
- an RPC framing layer
- readiness endpoints
- pipe bootstrapping

## Developer Workflow

The new platform must replace manual plugin path installs as the primary development loop.

Required commands:

```bash
pnpm create thunder-plugin
pnpm thunder dev
pnpm thunder build
pnpm thunder test
pnpm thunder pack
pnpm thunder publish
```

### `create thunder-plugin`

The generator should support:

- `sandboxed-basic`
- `sandboxed-ui`
- `trusted-app`

Teleprompter uses `trusted-app`, but that template must still be fit for genuine third-party use.

### `thunder dev`

This is the critical external developer loop. It must:

- validate `plugin.json v2`
- start frontend watch
- start worker watch if present
- start a Thunder Desktop Dev Host
- install and load the current plugin automatically
- reload the UI on build changes
- restart the worker on worker changes
- open plugin Devtools

It must print developer-facing state, for example:

```text
Plugin: teleprompter
Kind: trusted
Permissions:
- storage
- notifications
- activity
- microphone
- native-runtime

UI: connected
Worker: connected
Reload: watching
Devtools: ready
```

### Devtools

The first release of plugin Devtools must include:

- Manifest
- Permissions
- RPC Calls
- Worker Status
- Logs
- Storage
- Diagnostics

Teleprompter depends heavily on this because it is the first high-trust plugin and must expose enough state to debug:

- model availability
- model download state
- speech failures
- worker crashes
- permission denials

## Installation, Packaging, and Publishing

The package format and install flow must become first-class before marketplace backend work begins.

Required phase-one outputs:

- `thunder pack` creates a standard plugin package
- `thunder publish` can initially target local or private channels
- package metadata must include manifest compatibility and signature metadata

Teleprompter must use the same packaging and installation route as external plugins. It cannot remain a platform-only special case copied into place from a bundled directory for its official workflow. Bundled distribution may still exist for product delivery, but the plugin itself must prove that the public package flow works.

## Teleprompter Under the New Platform

Teleprompter phase one is a `trusted` plugin with the following shape:

1. `teleprompter-plugin-ui`
   The plugin frontend UI, running in the sandboxed page container.

2. `teleprompter-plugin-worker`
   The trusted worker, responsible for:
   - model download and activation orchestration
   - speech recognition coordination
   - host speech bridge calls
   - plugin-private file and data access

3. `teleprompter-core`
   Shared pure logic extracted from current teleprompter implementation, including:
   - text normalization
   - script segmentation
   - follow engine
   - alignment logic
   - related testable state machines

4. `teleprompter-adapters`
   Glue between `teleprompter-core` and the public plugin SDK surfaces.

This supports the incubation strategy: the monorepo may still host shared code, but teleprompter must only depend on code that is intentionally extracted and stable at the package boundary.

## Teleprompter Commercial Requirements for Phase One

The teleprompter plugin is not a demo. It must ship with enough quality and completeness to be considered commercially usable inside Thunder Desktop.

Required product capabilities:

- large-font teleprompter display
- scrolling mode
- follow-read mode
- draft and settings persistence
- fullscreen, mirror, and active line highlighting
- Sherpa ONNX local speech flow
- model download, activation, and switching
- visible speech status and actionable error states
- worker crash recovery that does not strand the UI in a broken state
- command entry and sidebar entry
- installable, upgradeable desktop plugin flow
- package, install, and upgrade verification

Required product quality:

- installation permissions are understandable before enablement
- first launch surfaces model state clearly
- model and worker failures are translated into user-facing states
- plugin upgrades do not lose drafts or settings
- worker restarts are recoverable
- diagnostics are sufficient for troubleshooting real failures
- the development workflow is runnable by a non-platform engineer

## Platform Phase-One Deliverables

The platform itself must deliver:

- `plugin.json v2` parsing and validation
- version compatibility checks
- sandboxed UI plugin loading
- trusted worker supervision
- named pipe or domain socket RPC transport
- frontend and worker public SDKs
- permission model and install confirmation UI
- `thunder dev`, `thunder build`, `thunder pack`
- plugin Devtools basics
- plugin-private storage
- plugin-private data directory access
- logging and diagnostics foundations
- install, uninstall, and upgrade lifecycle handling

## Explicitly Deferred from Phase One

To keep scope controlled, phase one does not include:

- web-hosted runtime plugins
- public marketplace backend
- generic cross-plugin speech platform APIs
- cloud sync
- mobile host support
- broad dynamic per-action permission prompts
- full legacy plugin auto-migration
- third-party payments or marketplace commerce

## Data Model and Storage Rules

The main application database must remain off-limits to plugins.

Plugin data options:

- `sandboxed` plugins use host-provided plugin storage, secrets, and local cache primitives
- `trusted` plugins additionally receive a private data directory and may later receive a private SQLite file under that directory

Teleprompter phase one should rely on plugin-private persisted settings and data storage. It must not execute migrations against the host's main SQLite database.

## Migration Strategy

Migration from the current plugin system should be intentionally partial:

- simple page plugins may be automatically migrated where possible
- plugins using storage or network permissions can be partially migrated
- plugins using local runtimes must be manually upgraded to the new trusted worker model

Teleprompter is intentionally a manual migration customer. That is acceptable because it serves as the proving ground for the new trusted architecture.

## Risks and Tradeoffs

### Why not build the entire platform first?

That would likely produce an overdesigned system without a real plugin customer. Teleprompter is the anchor that keeps the platform honest.

### Why not migrate teleprompter first and abstract later?

That would likely hard-code teleprompter assumptions into the platform and recreate the old internal-special-case problem.

### Why choose trusted worker RPC instead of loopback HTTP?

Because commercial desktop plugin execution needs a smaller attack surface, clearer lifecycle control, and fewer developer-visible infrastructure details.

### Why stay desktop-only in phase one?

Because trusted plugin execution, local model management, microphone use, and pipe-based worker IPC are all desktop-first concerns. Adding web-hosted plugins now would significantly expand the problem without helping the core teleprompter migration.

## Success Criteria

The redesign is successful when all of the following are true:

- a non-platform engineer can create and run a new Thunder plugin through the public CLI
- teleprompter can be developed through the same public plugin workflow
- teleprompter no longer depends on old runtime HTTP plugin mechanics
- teleprompter is installable, upgradable, and recoverable as a trusted plugin
- the host exposes only public SDK surfaces to plugin authors
- at least one additional future plugin could realistically be built using the same public surfaces without needing teleprompter-specific exceptions

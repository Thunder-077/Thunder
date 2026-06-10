# Sandboxed Default Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make sandboxed UI plugins Thunder's complete default development path, including a constrained exact-origin network proxy.

**Architecture:** The schema and protocol packages define the capability contract, the Web host validates iframe calls and applies frame-local quotas, and the API independently enforces network policy before fetching. CLI templates and examples exercise the same public SDK and installation path used by external developers.

**Tech Stack:** TypeScript, pnpm workspaces, Node.js fetch, Hono, Next.js, React, node:test.

---

### Task 1: Manifest Rules And Dynamic Network Permission

**Files:**
- Modify: `packages/plugin-schema/src/permissions.ts`
- Modify: `packages/plugin-schema/src/manifest.ts`
- Modify: `packages/plugin-schema/src/manifest.test.ts`

- [ ] Add failing tests for canonical HTTPS origins, loopback HTTP, invalid paths, wildcards, credentials, duplicate permissions, and sandboxed runtime rejection.
- [ ] Implement dynamic `network:<origin>` parsing and normalization without weakening static permission typing.
- [ ] Reject sandboxed `runtime` and keep trusted runtime mandatory.
- [ ] Run `pnpm --filter @thunder/plugin-schema test`.

### Task 2: Default Sandboxed CLI Template

**Files:**
- Modify: `packages/plugin-cli/src/commands/create.ts`
- Modify: `packages/plugin-cli/src/index.ts`
- Modify: `packages/plugin-cli/src/index.test.ts`
- Create: `packages/plugin-cli/src/templates/sandboxed-ui/plugin.json`
- Create: `packages/plugin-cli/src/templates/sandboxed-ui/package.json`
- Create: `packages/plugin-cli/src/templates/sandboxed-ui/tsconfig.json`
- Create: `packages/plugin-cli/src/templates/sandboxed-ui/.gitignore`
- Create: `packages/plugin-cli/src/templates/sandboxed-ui/README.md`
- Create: `packages/plugin-cli/src/templates/sandboxed-ui/src/index.tsx`

- [ ] Add failing tests that default create output is sandboxed and contains no worker.
- [ ] Add `--template sandboxed-ui|trusted-app` parsing with `sandboxed-ui` as the default.
- [ ] Generate both templates from their own directories and remove `sandboxed-basic`.
- [ ] Run the plugin CLI test suite.

### Task 3: Network Protocol And Browser SDK

**Files:**
- Modify: `packages/plugin-protocol/src/bridge.ts`
- Modify: `packages/plugin-protocol/src/bridge.test.ts`
- Modify: `packages/plugin-sdk/src/browser.ts`
- Modify: `packages/plugin-sdk/src/browser.test.ts`
- Modify: `apps/web/src/lib/desktop-plugin-sdk-contract.test.ts`

- [ ] Add failing protocol tests for method, URL, method, headers, and body validation.
- [ ] Add typed `network.request` protocol parameters and response.
- [ ] Add SDK `request`, `get`, and `post` methods.
- [ ] Extend the real SDK/host contract enumeration.
- [ ] Run focused protocol, SDK, and contract tests.

### Task 4: Web Host Limits And Dispatch

**Files:**
- Create: `apps/web/src/lib/desktop-plugin-limits.ts`
- Create: `apps/web/src/lib/desktop-plugin-storage.ts`
- Create: `apps/web/src/lib/desktop-plugin-storage.test.ts`
- Create: `apps/web/src/lib/desktop-plugin-rate-limit.ts`
- Create: `apps/web/src/lib/desktop-plugin-rate-limit.test.ts`
- Modify: `apps/web/src/lib/desktop-plugin-host-dispatcher.ts`
- Modify: `apps/web/src/lib/desktop-plugin-host-dispatcher.test.ts`
- Modify: `apps/web/src/app/plugins/[pluginId]/page.tsx`
- Modify: `apps/web/src/lib/desktop-plugins.ts`

- [ ] Add failing quota, rate-limit, and network authorization tests.
- [ ] Implement byte-counted namespaced storage with atomic quota checks.
- [ ] Implement per-frame bridge and network fixed-window rate limits.
- [ ] Dispatch `network.request` only for an exact declared origin.
- [ ] Call the API proxy through the existing Web API client module.
- [ ] Apply manifest-derived iframe sandbox and microphone policy.
- [ ] Run focused Web tests and type checking.

### Task 5: API Network Proxy

**Files:**
- Create: `apps/api/src/plugins/desktop-plugin-network.ts`
- Create: `apps/api/src/plugins/desktop-plugin-network.test.ts`
- Modify: `apps/api/src/plugins/desktop-plugin-manager.ts`
- Modify: `apps/api/src/plugins/desktop-plugin-routes.ts`
- Modify: `apps/api/src/plugins/desktop-plugin-routes.test.ts`

- [ ] Add failing tests for exact-origin permission, stripped headers, redirect checks, body limits, timeout, and oversized responses.
- [ ] Implement an injected-fetch proxy service with manual redirects and bounded response reads.
- [ ] Expose installed manifest lookup without exposing filesystem details.
- [ ] Add `POST /:id/network/request` and enforce JSON request size before proxying.
- [ ] Run focused API plugin tests.

### Task 6: CSP, Example, And Documentation

**Files:**
- Modify: `apps/api/src/plugins/desktop-plugin-manager.ts`
- Modify: `examples/desktop-plugins/hello/plugin.json`
- Delete: `examples/desktop-plugins/hello/src/worker.ts`
- Modify: `examples/desktop-plugins/hello/src/index.tsx`
- Modify: `examples/desktop-plugins/hello/package.json`
- Modify: `docs/desktop-plugin-development.md`
- Modify: `docs/desktop-plugin-system.md`
- Modify: `docs/plugin-platform.md`

- [ ] Add CSP assertions to API asset tests.
- [ ] Strengthen plugin UI CSP.
- [ ] Convert Hello to a runtime-free sandboxed example using storage and notifications.
- [ ] Document default creation, explicit trusted selection, network origins, and quotas.
- [ ] Build the Hello example.

### Task 7: End-To-End Verification

**Files:**
- Modify as required by failing verification only.

- [ ] Run all focused plugin tests.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm test:plugins`.
- [ ] Run `pnpm build`.
- [ ] Review `git diff` for accidental changes and ensure existing user changes remain intact.

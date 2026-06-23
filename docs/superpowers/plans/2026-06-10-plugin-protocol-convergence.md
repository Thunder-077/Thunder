# Plugin Protocol Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a single typed plugin bridge protocol, remove unsupported public capabilities, and prove the browser SDK matches the real Web host dispatcher.

**Architecture:** Add `@thunder/plugin-protocol` as the only owner of bridge method names, envelopes, payload types, permission mapping, and runtime request validation. Refactor the SDK and Web host to consume it, move host capability dispatch out of the React page, and make the manifest reject capabilities without end-to-end implementations.

**Tech Stack:** TypeScript, React, Next.js, pnpm workspaces, `tsx` tests.

---

### Task 1: Add the protocol package

**Files:**
- Create: `packages/plugin-protocol/package.json`
- Create: `packages/plugin-protocol/tsconfig.json`
- Create: `packages/plugin-protocol/src/index.ts`
- Create: `packages/plugin-protocol/src/bridge.ts`
- Create: `packages/plugin-protocol/src/errors.ts`
- Create: `packages/plugin-protocol/src/bridge.test.ts`
- Modify: `pnpm-lock.yaml`

- [ ] Write failing tests for stable methods, permission mapping, and invalid envelopes.
- [ ] Run `pnpm --dir packages/plugin-protocol test` and confirm the package is absent or tests fail.
- [ ] Implement typed envelopes, method map, permission mapping, validators, and protocol errors.
- [ ] Run `pnpm --dir packages/plugin-protocol test` and confirm it passes.

### Task 2: Remove unsupported manifest capabilities

**Files:**
- Modify: `packages/plugin-schema/src/manifest.ts`
- Modify: `packages/plugin-schema/src/permissions.ts`
- Modify: `packages/plugin-schema/src/manifest.test.ts`
- Modify: `packages/plugin-sdk/src/index.ts`

- [ ] Add tests that reject `secrets`, `contributes.commands`, and `contributes.settings`.
- [ ] Run `pnpm --filter @thunder/plugin-schema test` and confirm the new assertions fail.
- [ ] Remove the public types and add explicit unsupported-field validation.
- [ ] Run schema tests and type checking.

### Task 3: Refactor the browser SDK onto the protocol package

**Files:**
- Modify: `packages/plugin-sdk/package.json`
- Modify: `packages/plugin-sdk/src/browser.ts`
- Modify: `packages/plugin-sdk/src/browser.test.ts`
- Modify: `packages/plugin-sdk/tsconfig.json` if project references require it
- Modify: `pnpm-lock.yaml`

- [ ] Update tests to assert the stable client surface and remove runtime/network expectations.
- [ ] Run SDK tests and confirm they fail before implementation.
- [ ] Replace local envelope and method definitions with protocol imports.
- [ ] Remove `runtime` and `network` from `ThunderBrowserPluginClient`.
- [ ] Run SDK tests and type checking.

### Task 4: Extract and test the Web host dispatcher

**Files:**
- Create: `apps/web/src/lib/desktop-plugin-host-dispatcher.ts`
- Create: `apps/web/src/lib/desktop-plugin-host-dispatcher.test.ts`
- Modify: `apps/web/package.json`
- Modify: `apps/web/src/lib/desktop-plugin-bridge.ts`
- Delete: `apps/web/src/lib/plugin-rpc-permissions.ts`
- Delete: `apps/web/src/lib/plugin-rpc-permissions.test.ts`

- [ ] Write dispatcher tests covering every stable method and permission denial.
- [ ] Run the dispatcher test and confirm it fails before implementation.
- [ ] Implement dependency-injected capability dispatch using protocol validation.
- [ ] Replace local permission mapping with the protocol mapping.
- [ ] Run dispatcher and existing bridge tests.

### Task 5: Wire the plugin page to the dispatcher

**Files:**
- Modify: `apps/web/src/app/plugins/[pluginId]/page.tsx`

- [ ] Replace the page-level capability switch with one dispatcher call.
- [ ] Keep origin/source checks, RPC diagnostics, bridge responses, and worker-status refresh in the page.
- [ ] Run Web type checking and plugin bridge tests.

### Task 6: Add the SDK/Host contract test

**Files:**
- Create: `apps/web/src/lib/desktop-plugin-sdk-contract.test.ts`
- Modify: `apps/web/package.json`

- [ ] Build a fake window/parent transport that passes real SDK requests into the real dispatcher.
- [ ] Enumerate every stable request method in the contract suite.
- [ ] Verify successful round trips and permission errors.
- [ ] Run the contract test and confirm it passes.

### Task 7: Update plugin documentation

**Files:**
- Modify: `docs/desktop-plugin-development.md`
- Modify: `docs/desktop-plugin-system.md`
- Modify: `docs/plugin-platform.md`

- [ ] Remove runtime/network API claims.
- [ ] Remove commands/settings/secrets claims.
- [ ] Document the stable methods and breaking change.
- [ ] Verify repository search finds no public claim that removed APIs are available, excluding historical design documents.

### Task 8: Full verification

**Files:**
- Modify only files required by failures discovered during verification.

- [ ] Run `pnpm --filter @thunder/plugin-protocol test`.
- [ ] Run `pnpm --filter @thunder/plugin-schema test`.
- [ ] Run `pnpm --filter @thunder/plugin-sdk test`.
- [ ] Run Web plugin bridge, dispatcher, and contract tests.
- [ ] Run `pnpm test:plugins`.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm typecheck`.
- [ ] Inspect `git diff --check` and `git status --short`.


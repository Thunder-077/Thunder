# External Plugin Toolkit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working version of Thunder's standalone external plugin development toolkit.

**Architecture:** Keep `@thunder/plugin-cli` as the user-facing command while splitting reusable toolkit concerns into focused command modules. The CLI must only depend on public plugin packages and Desktop HTTP APIs, not Thunder app internals.

**Tech Stack:** TypeScript, Node.js, esbuild, tar, Ed25519 signing via Node crypto, `@thunder/plugin-schema`.

---

## File Structure

- Modify `packages/plugin-cli/src/index.ts`: add `validate` command and parse publish/pack flags.
- Create `packages/plugin-cli/src/commands/validate.ts`: validate manifest, entry files, package boundaries, and risk summary.
- Create `packages/plugin-cli/src/commands/trust.ts`: create dev trust decisions for local install.
- Create `packages/plugin-cli/src/commands/marketplace.ts`: stable JSON, signing, marketplace entry and index generation.
- Modify `packages/plugin-cli/src/commands/dev.ts`: install with dev trust decision when required.
- Modify `packages/plugin-cli/src/commands/pack.ts`: build package and optionally write marketplace entry.
- Modify `packages/plugin-cli/src/commands/publish.ts`: generate marketplace index from entry files.
- Modify `packages/plugin-cli/src/index.test.ts`: cover create, validate, pack entry, publish index, and dev install payload.
- Modify `docs/desktop-plugin-development.md`, `docs/plugin-platform.md`: document external toolkit workflow in Chinese.

## Tasks

### Task 1: Validation Module

**Files:**
- Create: `packages/plugin-cli/src/commands/validate.ts`
- Modify: `packages/plugin-cli/src/index.ts`
- Test: `packages/plugin-cli/src/index.test.ts`

- [ ] Add `validatePluginProject(rootDir)` that loads `plugin.json`, parses it through `parseThunderPluginManifest`, checks declared UI/runtime entries exist, rejects symlinks, and returns `{ project, warnings, highRiskPermissions, requiresTrustConfirmation }`.
- [ ] Add CLI command `thunder-plugin validate [root-dir]` that prints a concise summary and exits by throwing on invalid projects.
- [ ] Extend CLI test to call `validatePluginProject(pluginRoot)` and assert trusted template reports `requiresTrustConfirmation: true`.

### Task 2: Dev Trust Decision

**Files:**
- Create: `packages/plugin-cli/src/commands/trust.ts`
- Modify: `packages/plugin-cli/src/commands/dev.ts`
- Test: `packages/plugin-cli/src/index.test.ts`

- [ ] Add `createDevTrustDecision(project)` using plugin kind, permissions, and SHA-256 of `plugin.json`.
- [ ] Change `DesktopDevHostClient.installLocalPlugin` to send `{ pluginPath, trustDecision }` when the plugin needs confirmation.
- [ ] Extend the dev host test server to capture the JSON body and assert trusted installs include `acceptedRisk`, `kind`, `permissions`, and `manifestSha256`.

### Task 3: Packager Entry Generation

**Files:**
- Create: `packages/plugin-cli/src/commands/marketplace.ts`
- Modify: `packages/plugin-cli/src/commands/pack.ts`
- Modify: `packages/plugin-cli/src/index.ts`
- Test: `packages/plugin-cli/src/index.test.ts`

- [ ] Add stable JSON and optional Ed25519 signing helpers.
- [ ] Change `packPlugin` to return manifest SHA, package SHA, and optional marketplace entry path when `entry` options are provided.
- [ ] Add CLI flags for `pack`: `--entry`, `--out`, `--base-url`, `--private-key`, `--key-id`.
- [ ] Extend CLI tests to generate an unsigned marketplace entry and assert it contains `kind`, `permissions`, `packageSha256`, and `manifestSha256`.

### Task 4: Publisher Index Generation

**Files:**
- Modify: `packages/plugin-cli/src/commands/publish.ts`
- Modify: `packages/plugin-cli/src/index.ts`
- Test: `packages/plugin-cli/src/index.test.ts`

- [ ] Implement `publishMarketplaceIndex({ entriesDir, outPath, privateKeyPath, keyId })`.
- [ ] Add CLI flags for `publish`: `--entries`, `--out`, `--private-key`, `--key-id`.
- [ ] Extend CLI tests to publish an index from generated entries and assert plugin count, sort order, and optional signature shape.

### Task 5: Documentation And Verification

**Files:**
- Modify: `docs/desktop-plugin-development.md`
- Modify: `docs/plugin-platform.md`
- Test commands at repository root.

- [ ] Document the external toolkit workflow: `create`, `validate`, `dev`, `pack --entry`, `publish`.
- [ ] Run `pnpm --dir packages/plugin-cli test`.
- [ ] Run `pnpm --dir packages/plugin-cli typecheck`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm lint`.

## Self-Review

- Spec coverage: the plan covers standalone CLI workflow, validation, dev install trust, packaging, publishing, tests, and docs.
- Placeholder scan: no placeholder tasks remain; each task names files and expected behavior.
- Type consistency: command names and function names are consistent across tasks.

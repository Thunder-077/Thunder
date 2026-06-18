# Plugin Permission And Trust Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add install-time permission review and trust records for desktop plugins, especially trusted runtimes.

**Architecture:** API owns the trust policy and persists trust snapshots in `.thunder-install.json`. Web shows an install confirmation dialog for high-risk plugins. Runtime and storage APIs enforce the installed Manifest and trust record server-side.

**Tech Stack:** TypeScript, Hono, Next.js App Router, existing AppDialog/useDialog, Node SQLite.

---

## Status

- [x] Add trust policy helpers and regression tests.
- [x] Persist `trust` records in install metadata.
- [x] Require user confirmation for non-official high-risk local installs.
- [x] Mark bundled official plugins as `official-bundled`.
- [x] Block trusted runtime startup when the installed record is not trusted.
- [x] Enforce `storage` permission on storage API endpoints.
- [x] Add marketplace install confirmation UI for high-risk plugins.
- [x] Update desktop plugin documentation.
- [x] Run focused API plugin tests and API/Web type checks.

## Verification

```bash
pnpm --filter @thunder/api test:plugins
pnpm --filter @thunder/api typecheck
pnpm --filter @thunder/web typecheck
```

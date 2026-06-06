# Thunder Plugin Platform v2 and Teleprompter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Thunder Plugin Platform v2 for Desktop with `sandboxed` and `trusted` plugin execution, and migrate teleprompter onto the new public plugin APIs as the first commercial-grade plugin. **v2 plugin mechanism will ultimately become the sole plugin mechanism for this project, fully replacing the v1 plugin mechanism.** Once all v2 plugin work is complete, delete all v1 plugin mechanism code (the plugin marketplace UI pages should be retained and reused).

**Architecture:** Introduce a new plugin platform stack in parallel with the legacy runtime, centered on `plugin-schema`, public SDKs, host-managed worker RPC over named pipes or domain sockets, CLI-driven developer workflow, and a teleprompter migration that consumes only the new platform surfaces. Keep the first production path desktop-only, forbid plugin access to the main app database, and use teleprompter to validate the public package, install, devtools, and upgrade flow end to end.

**Tech Stack:** TypeScript, React, pnpm workspaces, Turborepo, Next.js, Hono, Tauri v2, Node.js 24, Vitest or `tsx` test entrypoints, named pipes on Windows, domain sockets where supported, Ed25519 signing, existing Thunder desktop build pipeline.

---

## Planned File Structure

### New packages

- Create: `packages/plugin-schema/package.json`
- Create: `packages/plugin-schema/tsconfig.json`
- Create: `packages/plugin-schema/src/index.ts`
- Create: `packages/plugin-schema/src/manifest.ts`
- Create: `packages/plugin-schema/src/permissions.ts`
- Create: `packages/plugin-schema/src/errors.ts`
- Create: `packages/plugin-schema/src/manifest.test.ts`
- Create: `packages/plugin-sdk-worker/package.json`
- Create: `packages/plugin-sdk-worker/tsconfig.json`
- Create: `packages/plugin-sdk-worker/src/index.ts`
- Create: `packages/plugin-sdk-worker/src/protocol.ts`
- Create: `packages/plugin-sdk-worker/src/index.test.ts`
- Create: `packages/plugin-host-runtime/package.json`
- Create: `packages/plugin-host-runtime/tsconfig.json`
- Create: `packages/plugin-host-runtime/src/index.ts`
- Create: `packages/plugin-host-runtime/src/types.ts`
- Create: `packages/plugin-host-runtime/src/manifest-loader.ts`
- Create: `packages/plugin-host-runtime/src/plugin-registry.ts`
- Create: `packages/plugin-host-runtime/src/plugin-installer.ts`
- Create: `packages/plugin-host-runtime/src/plugin-storage.ts`
- Create: `packages/plugin-host-runtime/src/sandboxed-runtime.ts`
- Create: `packages/plugin-host-runtime/src/trusted-runtime-supervisor.ts`
- Create: `packages/plugin-host-runtime/src/rpc/host-protocol.ts`
- Create: `packages/plugin-host-runtime/src/rpc/pipe-server.ts`
- Create: `packages/plugin-host-runtime/src/rpc/pipe-client.ts`
- Create: `packages/plugin-host-runtime/src/runtime.test.ts`
- Create: `packages/plugin-devtools/package.json` (**plugin-devtools is not first priority — deferred; existing partial work may be kept; resume only when explicitly requested**)
- Create: `packages/plugin-devtools/tsconfig.json`
- Create: `packages/plugin-devtools/src/index.ts`
- Create: `packages/plugin-devtools/src/plugin-devtools-panel.tsx`
- Create: `packages/plugin-devtools/src/plugin-rpc-log.tsx`
- Create: `packages/plugin-cli/package.json`
- Create: `packages/plugin-cli/tsconfig.json`
- Create: `packages/plugin-cli/src/index.ts`
- Create: `packages/plugin-cli/src/commands/create.ts`
- Create: `packages/plugin-cli/src/commands/dev.ts`
- Create: `packages/plugin-cli/src/commands/build.ts`
- Create: `packages/plugin-cli/src/commands/pack.ts`
- Create: `packages/plugin-cli/src/commands/publish.ts`
- Create: `packages/plugin-cli/src/templates/trusted-app/*`

### Existing packages to modify

- Modify: `packages/plugin-sdk/package.json`
- Modify: `packages/plugin-sdk/src/index.ts`
- Modify: `packages/plugin-sdk/src/browser.ts`
- Modify: `packages/plugin-sdk/src/browser.test.ts`
- Modify: `packages/plugin-ui/package.json`

### Host app integration

- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/web/package.json`
- Modify: `apps/web/src/lib/desktop-plugins.ts`
- Modify: `apps/web/src/app/plugins/page.tsx`
- Modify: `apps/web/src/app/plugins/installed/page.tsx`
- Modify: `apps/web/src/app/plugins/[pluginId]/page.tsx`
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/plugins/desktop-plugin-types.ts`
- Modify: `apps/api/src/plugins/desktop-plugin-routes.ts`
- Modify: `apps/api/src/plugins/desktop-plugin-manager.ts`

### Teleprompter extraction and migration

- Create: `packages/teleprompter-core/package.json`
- Create: `packages/teleprompter-core/tsconfig.json`
- Create: `packages/teleprompter-core/src/index.ts`
- Create: `packages/teleprompter-core/src/follow-engine.ts`
- Create: `packages/teleprompter-core/src/alignment-engine.ts`
- Create: `packages/teleprompter-core/src/script-segmenter.ts`
- Create: `packages/teleprompter-core/src/text-normalizer.ts`
- Create: `packages/teleprompter-core/src/*.test.ts`
- Create: `plugins-v2/teleprompter/package.json`
- Create: `plugins-v2/teleprompter/plugin.json`
- Create: `plugins-v2/teleprompter/src/index.tsx`
- Create: `plugins-v2/teleprompter/src/worker.ts`
- Create: `plugins-v2/teleprompter/src/features/*`
- Create: `plugins-v2/teleprompter/src/adapters/*`
- Modify: `apps/web/src/modules/teleprompter/*`
- Modify: `plugins/desktop/teleprompter/*`

### Docs and scripts

- Modify: `package.json`
- Modify: `pnpm-workspace.yaml` if needed for new packages only if auto-discovery needs help
- Create: `scripts/thunder-plugin-dev.mjs` or equivalent if CLI bootstrapping needs a root entry
- Modify: `docs/desktop-plugin-system.md`
- Modify: `docs/desktop-plugin-development.md`
- Create: `docs/plugin-platform-v2.md`

---

### Task 1: Add `plugin-schema` and Manifest v2 Validation

**Files:**
- Create: `packages/plugin-schema/package.json`
- Create: `packages/plugin-schema/tsconfig.json`
- Create: `packages/plugin-schema/src/index.ts`
- Create: `packages/plugin-schema/src/manifest.ts`
- Create: `packages/plugin-schema/src/permissions.ts`
- Create: `packages/plugin-schema/src/errors.ts`
- Create: `packages/plugin-schema/src/manifest.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing manifest validation test**

```ts
import assert from "node:assert/strict";
import {
  parseThunderPluginManifest,
  type ThunderPluginManifestV2,
} from "./index";

const trustedManifest: ThunderPluginManifestV2 = {
  manifestVersion: 2,
  id: "teleprompter",
  name: "提词器",
  version: "2.0.0",
  description: "大字提词、自动滚动、语音跟读与本地模型管理。",
  kind: "trusted",
  engines: { thunder: "^2.0.0" },
  author: { name: "Thunder" },
  icon: "ScrollText",
  permissions: [
    "storage",
    "notifications",
    "activity",
    "microphone",
    "native-runtime",
    "filesystem:plugin-data",
  ],
  contributes: {
    sidebar: {
      title: "提词器",
      icon: "ScrollText",
      entry: "dist/index.html",
    },
    commands: [{ id: "teleprompter.open", title: "打开提词器" }],
  },
  runtime: { entry: "dist/worker.js" },
};

assert.equal(parseThunderPluginManifest(trustedManifest).kind, "trusted");
assert.throws(
  () =>
    parseThunderPluginManifest({
      ...trustedManifest,
      kind: "sandboxed",
      permissions: [...trustedManifest.permissions, "native-runtime"],
    }),
  /sandboxed plugins cannot request native-runtime/i,
);

console.log("[plugin-schema] manifest tests passed");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --dir packages/plugin-schema exec tsx src/manifest.test.ts`

Expected: FAIL because `packages/plugin-schema` and `parseThunderPluginManifest` do not exist yet.

- [ ] **Step 3: Add the new package and minimal manifest implementation**

```ts
// packages/plugin-schema/src/permissions.ts
export type ThunderPluginPermission =
  | "storage"
  | "secrets"
  | "notifications"
  | "activity"
  | "microphone"
  | "filesystem:plugin-data"
  | `network:${string}`
  | "native-runtime";

export function isNetworkPermission(permission: ThunderPluginPermission): boolean {
  return permission.startsWith("network:");
}
```

```ts
// packages/plugin-schema/src/manifest.ts
import { isNetworkPermission, type ThunderPluginPermission } from "./permissions";

export type ThunderPluginKind = "sandboxed" | "trusted";

export interface ThunderPluginManifestV2 {
  manifestVersion: 2;
  id: string;
  name: string;
  version: string;
  description: string;
  kind: ThunderPluginKind;
  engines: { thunder: string };
  author: { name: string; url?: string };
  homepage?: string;
  license?: string;
  icon: string;
  permissions: ThunderPluginPermission[];
  contributes: {
    sidebar?: {
      title: string;
      icon: string;
      entry: string;
    };
    commands?: Array<{ id: string; title: string }>;
    settings?: Array<{
      key: string;
      type: "string" | "boolean" | "select" | "secret";
      title: string;
      default?: string | boolean;
      options?: string[];
    }>;
  };
  runtime?: { entry: string };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function parseThunderPluginManifest(input: unknown): ThunderPluginManifestV2 {
  const manifest = input as ThunderPluginManifestV2;
  assert(manifest?.manifestVersion === 2, "manifestVersion must be 2");
  assert(manifest.id, "plugin id is required");
  assert(manifest.kind === "sandboxed" || manifest.kind === "trusted", "plugin kind is invalid");
  assert(manifest.engines?.thunder, "engines.thunder is required");
  for (const permission of manifest.permissions ?? []) {
    assert(
      permission === "storage" ||
        permission === "secrets" ||
        permission === "notifications" ||
        permission === "activity" ||
        permission === "microphone" ||
        permission === "filesystem:plugin-data" ||
        permission === "native-runtime" ||
        isNetworkPermission(permission),
      `unknown plugin permission: ${String(permission)}`,
    );
  }
  if (manifest.kind === "sandboxed") {
    assert(!manifest.permissions.includes("native-runtime"), "sandboxed plugins cannot request native-runtime");
    assert(
      !manifest.permissions.includes("filesystem:plugin-data"),
      "sandboxed plugins cannot request filesystem:plugin-data",
    );
    assert(!manifest.runtime, "sandboxed plugins cannot declare runtime");
  }
  if (manifest.kind === "trusted") {
    assert(manifest.runtime?.entry, "trusted plugins must declare runtime.entry");
  }
  return manifest;
}
```

```ts
// packages/plugin-schema/src/index.ts
export * from "./manifest";
export * from "./permissions";
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --dir packages/plugin-schema exec tsx src/manifest.test.ts`

Expected: PASS with `[plugin-schema] manifest tests passed`.

- [ ] **Step 5: Commit**

```bash
git add package.json packages/plugin-schema
git commit -m "feat: add plugin schema and manifest v2 validation"
```

### Task 2: Upgrade `plugin-sdk` and Add `plugin-sdk-worker`

**Files:**
- Modify: `packages/plugin-sdk/package.json`
- Modify: `packages/plugin-sdk/src/index.ts`
- Modify: `packages/plugin-sdk/src/browser.ts`
- Modify: `packages/plugin-sdk/src/browser.test.ts`
- Create: `packages/plugin-sdk-worker/package.json`
- Create: `packages/plugin-sdk-worker/tsconfig.json`
- Create: `packages/plugin-sdk-worker/src/index.ts`
- Create: `packages/plugin-sdk-worker/src/protocol.ts`
- Create: `packages/plugin-sdk-worker/src/index.test.ts`

- [ ] **Step 1: Write the failing SDK tests**

```ts
import assert from "node:assert/strict";
import { definePlugin, createPluginApi } from "./index";

const plugin = definePlugin({
  setup(app) {
    app.commands.register("teleprompter.open", async () => {
      await app.navigation.openPanel("main");
    });
  },
});

const api = createPluginApi();
let opened = "";
plugin.setup(api);
await api.commands.execute("teleprompter.open");
assert.equal(api.navigation.lastOpenedPanel, "main");

console.log("[plugin-sdk] tests passed");
```

```ts
import assert from "node:assert/strict";
import { defineWorker } from "./index";

const worker = defineWorker({
  handlers: {
    "speech.transcribe": async ({ text }: { text: string }) => ({ normalized: text.trim() }),
  },
});

const result = await worker.handlers["speech.transcribe"]({ text: "  hello  " });
assert.deepEqual(result, { normalized: "hello" });
console.log("[plugin-sdk-worker] tests passed");
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

- `pnpm --dir packages/plugin-sdk exec tsx src/browser.test.ts`
- `pnpm --dir packages/plugin-sdk-worker exec tsx src/index.test.ts`

Expected: FAIL because the new API surface does not exist yet.

- [ ] **Step 3: Implement the minimal new SDK surfaces**

```ts
// packages/plugin-sdk/src/index.ts
export interface ThunderPluginApp {
  panels: {
    register(id: string, panel: { title: string; component: unknown }): void;
  };
  commands: {
    register(id: string, handler: () => Promise<void> | void): void;
    execute(id: string): Promise<void>;
  };
  navigation: {
    openPanel(id: string): Promise<void>;
    lastOpenedPanel?: string;
  };
}

export function createPluginApi(): ThunderPluginApp {
  const commands = new Map<string, () => Promise<void> | void>();
  return {
    panels: { register() {} },
    commands: {
      register(id, handler) {
        commands.set(id, handler);
      },
      async execute(id) {
        const handler = commands.get(id);
        if (!handler) throw new Error(`Unknown command: ${id}`);
        await handler();
      },
    },
    navigation: {
      async openPanel(id) {
        this.lastOpenedPanel = id;
      },
      lastOpenedPanel: undefined,
    },
  };
}

export function definePlugin(definition: { setup(app: ThunderPluginApp): void }): typeof definition {
  return definition;
}
```

```ts
// packages/plugin-sdk-worker/src/index.ts
export type ThunderWorkerHandler = (payload: unknown) => Promise<unknown> | unknown;

export function defineWorker<T extends Record<string, ThunderWorkerHandler>>(definition: {
  handlers: T;
}) {
  return definition;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

- `pnpm --dir packages/plugin-sdk exec tsx src/browser.test.ts`
- `pnpm --dir packages/plugin-sdk-worker exec tsx src/index.test.ts`

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/plugin-sdk packages/plugin-sdk-worker
git commit -m "feat: add public plugin sdk and worker sdk skeletons"
```

### Task 3: Build `plugin-host-runtime` with Registry, Installer, Storage, and Runtime Supervision

**Files:**
- Create: `packages/plugin-host-runtime/package.json`
- Create: `packages/plugin-host-runtime/tsconfig.json`
- Create: `packages/plugin-host-runtime/src/index.ts`
- Create: `packages/plugin-host-runtime/src/types.ts`
- Create: `packages/plugin-host-runtime/src/manifest-loader.ts`
- Create: `packages/plugin-host-runtime/src/plugin-registry.ts`
- Create: `packages/plugin-host-runtime/src/plugin-installer.ts`
- Create: `packages/plugin-host-runtime/src/plugin-storage.ts`
- Create: `packages/plugin-host-runtime/src/sandboxed-runtime.ts`
- Create: `packages/plugin-host-runtime/src/trusted-runtime-supervisor.ts`
- Create: `packages/plugin-host-runtime/src/runtime.test.ts`
- Modify: `apps/api/src/plugins/desktop-plugin-manager.ts`
- Modify: `apps/api/src/plugins/desktop-plugin-types.ts`

- [ ] **Step 1: Write the failing host runtime tests**

```ts
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createPluginRegistry,
  createPluginStorage,
  loadInstalledPluginManifest,
} from "./index";

const root = mkdtempSync(join(tmpdir(), "thunder-plugin-host-"));
const pluginDir = join(root, "teleprompter");
mkdirSync(join(pluginDir, "dist"), { recursive: true });
writeFileSync(
  join(pluginDir, "plugin.json"),
  JSON.stringify({
    manifestVersion: 2,
    id: "teleprompter",
    name: "提词器",
    version: "2.0.0",
    description: "plugin",
    kind: "trusted",
    engines: { thunder: "^2.0.0" },
    author: { name: "Thunder" },
    icon: "ScrollText",
    permissions: ["storage", "native-runtime", "filesystem:plugin-data", "microphone"],
    contributes: { sidebar: { title: "提词器", icon: "ScrollText", entry: "dist/index.html" } },
    runtime: { entry: "dist/worker.js" },
  }),
);

const manifest = loadInstalledPluginManifest(pluginDir);
assert.equal(manifest.id, "teleprompter");

const registry = createPluginRegistry(root);
registry.register(pluginDir, manifest);
assert.equal(registry.list().length, 1);

const storage = createPluginStorage(root);
storage.set("teleprompter", "draft", { text: "hello" });
assert.deepEqual(storage.get("teleprompter", "draft"), { text: "hello" });

console.log("[plugin-host-runtime] tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir packages/plugin-host-runtime exec tsx src/runtime.test.ts`

Expected: FAIL because the package and runtime helpers do not exist.

- [ ] **Step 3: Implement the minimal host runtime building blocks**

```ts
// packages/plugin-host-runtime/src/plugin-registry.ts
import type { ThunderPluginManifestV2 } from "@thunder/plugin-schema";

export function createPluginRegistry(root: string) {
  const plugins = new Map<string, { root: string; manifest: ThunderPluginManifestV2 }>();
  return {
    register(pluginRoot: string, manifest: ThunderPluginManifestV2) {
      plugins.set(manifest.id, { root: pluginRoot, manifest });
    },
    get(id: string) {
      return plugins.get(id) ?? null;
    },
    list() {
      return [...plugins.values()];
    },
    root,
  };
}
```

```ts
// packages/plugin-host-runtime/src/plugin-storage.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function createPluginStorage(root: string) {
  const storageRoot = join(root, ".storage");
  mkdirSync(storageRoot, { recursive: true });
  return {
    get(pluginId: string, key: string) {
      const path = join(storageRoot, `${pluginId}.json`);
      try {
        const data = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
        return data[key] ?? null;
      } catch {
        return null;
      }
    },
    set(pluginId: string, key: string, value: unknown) {
      const path = join(storageRoot, `${pluginId}.json`);
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      } catch {}
      data[key] = value;
      writeFileSync(path, JSON.stringify(data, null, 2));
    },
  };
}
```

```ts
// packages/plugin-host-runtime/src/manifest-loader.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseThunderPluginManifest } from "@thunder/plugin-schema";

export function loadInstalledPluginManifest(pluginRoot: string) {
  return parseThunderPluginManifest(
    JSON.parse(readFileSync(join(pluginRoot, "plugin.json"), "utf8")),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir packages/plugin-host-runtime exec tsx src/runtime.test.ts`

Expected: PASS with `[plugin-host-runtime] tests passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/plugin-host-runtime apps/api/src/plugins/desktop-plugin-types.ts apps/api/src/plugins/desktop-plugin-manager.ts
git commit -m "feat: add plugin host runtime foundations"
```

### Task 4: Add Trusted Worker RPC over Named Pipes or Domain Sockets

**Files:**
- Create: `packages/plugin-host-runtime/src/rpc/host-protocol.ts`
- Create: `packages/plugin-host-runtime/src/rpc/pipe-server.ts`
- Create: `packages/plugin-host-runtime/src/rpc/pipe-client.ts`
- Modify: `packages/plugin-host-runtime/src/trusted-runtime-supervisor.ts`
- Create: `packages/plugin-host-runtime/src/rpc/pipe.test.ts`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: Write the failing pipe RPC test**

```ts
import assert from "node:assert/strict";
import { createPipeServer, createPipeClient } from "./index";

const server = await createPipeServer({
  handle(method, payload) {
    if (method === "speech.transcribe") {
      return { ok: true, text: String((payload as { text: string }).text).trim() };
    }
    throw new Error(`unknown method: ${method}`);
  },
});

const client = await createPipeClient(server.endpoint);
const result = await client.invoke("speech.transcribe", { text: "  hello  " });
assert.deepEqual(result, { ok: true, text: "hello" });
await client.close();
await server.close();

console.log("[plugin-host-runtime] pipe tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir packages/plugin-host-runtime exec tsx src/rpc/pipe.test.ts`

Expected: FAIL because the pipe transport is not implemented.

- [ ] **Step 3: Implement minimal framed RPC transport**

```ts
// packages/plugin-host-runtime/src/rpc/host-protocol.ts
export interface RpcEnvelope {
  id: string;
  method: string;
  payload?: unknown;
}

export function encodeEnvelope(envelope: RpcEnvelope): string {
  return `${JSON.stringify(envelope)}\n`;
}

export function decodeEnvelope(line: string): RpcEnvelope {
  return JSON.parse(line) as RpcEnvelope;
}
```

```ts
// packages/plugin-host-runtime/src/rpc/pipe-server.ts
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { decodeEnvelope, encodeEnvelope } from "./host-protocol";

export async function createPipeServer(options: {
  handle(method: string, payload: unknown): Promise<unknown> | unknown;
}) {
  const endpoint =
    process.platform === "win32"
      ? `\\\\.\\pipe\\thunder-plugin-${randomUUID()}`
      : join(tmpdir(), `thunder-plugin-${randomUUID()}.sock`);
  const server = createServer((socket) => {
    let buffer = "";
    socket.on("data", async (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const request = decodeEnvelope(line);
        try {
          const data = await options.handle(request.method, request.payload);
          socket.write(encodeEnvelope({ id: request.id, method: "__response__", payload: data }));
        } catch (error) {
          socket.write(
            encodeEnvelope({
              id: request.id,
              method: "__error__",
              payload: { message: error instanceof Error ? error.message : String(error) },
            }),
          );
        }
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(endpoint, () => resolve());
  });
  return {
    endpoint,
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir packages/plugin-host-runtime exec tsx src/rpc/pipe.test.ts`

Expected: PASS with `[plugin-host-runtime] pipe tests passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/plugin-host-runtime apps/desktop/src-tauri/src/lib.rs
git commit -m "feat: add trusted worker rpc transport"
```

### Task 5: Integrate v2 Host Runtime into Desktop and Web Plugin Surfaces

**Files:**
- Modify: `apps/web/src/lib/desktop-plugins.ts`
- Modify: `apps/web/src/app/plugins/[pluginId]/page.tsx`
- Modify: `apps/web/src/app/plugins/page.tsx`
- Modify: `apps/web/src/app/plugins/installed/page.tsx`
- Modify: `apps/api/src/plugins/desktop-plugin-routes.ts`
- Modify: `apps/api/src/plugins/desktop-plugin-manager.ts`
- Create: `apps/web/src/lib/plugin-v2-bridge.ts`
- Create: `apps/web/src/lib/plugin-v2-bridge.test.ts`

- [ ] **Step 1: Write the failing bridge compatibility test**

```ts
import assert from "node:assert/strict";
import { getRequiredPermissionForRpcMethod } from "./plugin-v2-bridge";

assert.equal(getRequiredPermissionForRpcMethod("storage.get"), "storage");
assert.equal(getRequiredPermissionForRpcMethod("worker.invoke"), "native-runtime");
assert.equal(getRequiredPermissionForRpcMethod("notifications.show"), "notifications");

console.log("[plugin-v2-bridge] tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir apps/web exec tsx src/lib/plugin-v2-bridge.test.ts`

Expected: FAIL because the new bridge permission mapping does not exist.

- [ ] **Step 3: Add the new bridge permission map and wire the new host APIs**

```ts
// apps/web/src/lib/plugin-v2-bridge.ts
export function getRequiredPermissionForRpcMethod(method: string): string | null {
  switch (method) {
    case "storage.get":
    case "storage.set":
      return "storage";
    case "notifications.show":
      return "notifications";
    case "activity.record":
      return "activity";
    case "worker.invoke":
      return "native-runtime";
    default:
      return null;
  }
}
```

```ts
// apps/web/src/lib/desktop-plugins.ts
export interface InstalledPluginV2 {
  manifestVersion: 2;
  manifest: import("@thunder/plugin-schema").ThunderPluginManifestV2;
  route: string;
  uiEntryUrl: string;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

- `pnpm --dir apps/web exec tsx src/lib/plugin-v2-bridge.test.ts`
- `pnpm --filter @thunder/web test:plugin-bridge`

Expected: both PASS, with the second command preserving legacy bridge coverage while the new bridge test passes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib apps/web/src/app/plugins apps/api/src/plugins
git commit -m "feat: integrate plugin platform v2 host surfaces"
```

### Task 6: Add CLI and Desktop Dev Host Workflow

**Files:**
- Create: `packages/plugin-cli/package.json`
- Create: `packages/plugin-cli/tsconfig.json`
- Create: `packages/plugin-cli/src/index.ts`
- Create: `packages/plugin-cli/src/commands/create.ts`
- Create: `packages/plugin-cli/src/commands/dev.ts`
- Create: `packages/plugin-cli/src/commands/build.ts`
- Create: `packages/plugin-cli/src/commands/pack.ts`
- Create: `packages/plugin-cli/src/commands/publish.ts`
- Create: `packages/plugin-cli/src/templates/trusted-app/plugin.json`
- Create: `packages/plugin-cli/src/templates/trusted-app/package.json`
- Create: `packages/plugin-cli/src/templates/trusted-app/src/index.tsx`
- Create: `packages/plugin-cli/src/templates/trusted-app/src/worker.ts`
- Modify: `package.json`
- Create: `scripts/thunder-plugin-dev.mjs` if the CLI needs a root launcher

- [ ] **Step 1: Write the failing CLI smoke test**

```ts
import assert from "node:assert/strict";
import { createPluginProject } from "./commands/create";

const files = createPluginProject({ name: "teleprompter", template: "trusted-app" });
assert.equal(files["plugin.json"].includes('"kind": "trusted"'), true);
assert.equal(files["src/worker.ts"].includes("defineWorker"), true);

console.log("[plugin-cli] tests passed");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --dir packages/plugin-cli exec tsx src/index.test.ts`

Expected: FAIL because the CLI package and template generator do not exist.

- [ ] **Step 3: Implement the minimal CLI package and trusted template generator**

```ts
// packages/plugin-cli/src/commands/create.ts
export function createPluginProject(options: { name: string; template: "trusted-app" | "sandboxed-basic" | "sandboxed-ui" }) {
  if (options.template === "trusted-app") {
    return {
      "plugin.json": JSON.stringify(
        {
          manifestVersion: 2,
          id: options.name,
          name: options.name,
          version: "0.1.0",
          description: "",
          kind: "trusted",
          engines: { thunder: "^2.0.0" },
          author: { name: "Your Name" },
          icon: "Puzzle",
          permissions: ["storage", "notifications", "native-runtime"],
          contributes: {
            sidebar: { title: options.name, icon: "Puzzle", entry: "dist/index.html" },
          },
          runtime: { entry: "dist/worker.js" },
        },
        null,
        2,
      ),
      "src/index.tsx": `export default function App() { return null; }\n`,
      "src/worker.ts": `import { defineWorker } from "@thunder/plugin-sdk/worker";\nexport default defineWorker({ handlers: {} });\n`,
    };
  }
  throw new Error(`Unsupported template: ${options.template}`);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --dir packages/plugin-cli exec tsx src/index.test.ts`

Expected: PASS with `[plugin-cli] tests passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/plugin-cli package.json scripts
git commit -m "feat: add plugin cli and trusted template"
```

### Task 7: Extract `teleprompter-core` from Existing Module Logic

**Files:**
- Create: `packages/teleprompter-core/package.json`
- Create: `packages/teleprompter-core/tsconfig.json`
- Create: `packages/teleprompter-core/src/index.ts`
- Create: `packages/teleprompter-core/src/follow-engine.ts`
- Create: `packages/teleprompter-core/src/alignment-engine.ts`
- Create: `packages/teleprompter-core/src/script-segmenter.ts`
- Create: `packages/teleprompter-core/src/text-normalizer.ts`
- Create: `packages/teleprompter-core/src/*.test.ts`
- Modify: `apps/web/src/modules/teleprompter/utils/follow-engine.ts`
- Modify: `apps/web/src/modules/teleprompter/utils/alignment-engine.ts`
- Modify: `apps/web/src/modules/teleprompter/utils/script-segmenter.ts`
- Modify: `apps/web/src/modules/teleprompter/utils/text-normalizer.ts`

- [ ] **Step 1: Write a failing extraction test against a real follow-engine fixture**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createFollowEngine, segmentScript } from "./index";

const script = "大家好，欢迎来到 Thunder。";
const segments = segmentScript(script);
const engine = createFollowEngine(script, segments, { enablePrediction: false });
const update = engine.push("大家好", true);
assert.equal(update.segmentIndex >= 0, true);

console.log("[teleprompter-core] tests passed");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --dir packages/teleprompter-core exec tsx src/follow-engine.test.ts`

Expected: FAIL because `packages/teleprompter-core` does not exist yet.

- [ ] **Step 3: Move pure logic into the new package and leave compatibility re-exports**

```ts
// packages/teleprompter-core/src/index.ts
export * from "./follow-engine";
export * from "./alignment-engine";
export * from "./script-segmenter";
export * from "./text-normalizer";
```

```ts
// apps/web/src/modules/teleprompter/utils/follow-engine.ts
export * from "@thunder/teleprompter-core";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

- `pnpm --dir packages/teleprompter-core exec tsx src/follow-engine.test.ts`
- `pnpm --dir apps/web exec tsx src/modules/teleprompter/utils/follow-engine.test.ts`

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/teleprompter-core apps/web/src/modules/teleprompter/utils
git commit -m "refactor: extract teleprompter core logic package"
```

### Task 8: Build the New Teleprompter v2 Plugin UI and Trusted Worker

**The v2 teleprompter plugin UI must match the Web teleprompter module (`apps/web/src/modules/teleprompter`) in every detail — page layout, interactions, and overall user experience must be fully consistent.** The plugin UI is not a validation skeleton; it must reach the same commercial quality as the Web module. `TeleprompterPanel` and its child components should reference the Web module implementation, maintaining consistency in visuals, layout, animations, keyboard shortcuts, and interaction flows.

**Files:**
- Create: `plugins-v2/teleprompter/package.json`
- Create: `plugins-v2/teleprompter/plugin.json`
- Create: `plugins-v2/teleprompter/src/index.tsx`
- Create: `plugins-v2/teleprompter/src/worker.ts`
- Create: `plugins-v2/teleprompter/src/features/*`
- Create: `plugins-v2/teleprompter/src/adapters/*`
- Modify: `plugins/desktop/teleprompter/*`
- Modify: `apps/web/src/modules/teleprompter/components/teleprompter-page.tsx`

- [ ] **Step 1: Write the failing teleprompter plugin contract tests**

```ts
import assert from "node:assert/strict";
import plugin from "./index";
import worker from "./worker";

assert.equal(typeof plugin.setup, "function");
assert.equal(typeof worker.handlers["speech.transcribe"], "function");

console.log("[teleprompter-v2] tests passed");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --dir plugins-v2/teleprompter exec tsx src/plugin.test.ts`

Expected: FAIL because the v2 teleprompter plugin package does not exist.

- [ ] **Step 3: Implement the new plugin package against public SDKs only**

```ts
// plugins-v2/teleprompter/src/index.tsx
import { definePlugin } from "@thunder/plugin-sdk";
import { TeleprompterPanel } from "./features/teleprompter-panel";

export default definePlugin({
  setup(app) {
    app.panels.register("main", {
      title: "提词器",
      component: TeleprompterPanel,
    });
    app.commands.register("teleprompter.open", async () => {
      await app.navigation.openPanel("main");
    });
  },
});
```

```ts
// plugins-v2/teleprompter/src/worker.ts
import { defineWorker } from "@thunder/plugin-sdk/worker";

export default defineWorker({
  handlers: {
    async "speech.transcribe"(payload) {
      return { ok: true, payload };
    },
    async "speech.models.list"() {
      return [];
    },
  },
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --dir plugins-v2/teleprompter exec tsx src/plugin.test.ts`

Expected: PASS with `[teleprompter-v2] tests passed`.

- [ ] **Step 5: Commit**

```bash
git add plugins-v2/teleprompter plugins/desktop/teleprompter apps/web/src/modules/teleprompter/components/teleprompter-page.tsx
git commit -m "feat: add teleprompter plugin v2 on public sdk surfaces"
```

### Task 9: Finish Packaging, Permission Confirmation, Docs, and End-to-End Verification

**Files:**
- Modify: `apps/web/src/app/plugins/page.tsx`
- Modify: `apps/web/src/app/plugins/installed/page.tsx`
- Modify: `apps/api/src/plugins/desktop-plugin-routes.ts`
- Modify: `apps/api/src/plugins/desktop-plugin-manager.ts`
- Modify: `docs/desktop-plugin-system.md`
- Modify: `docs/desktop-plugin-development.md`
- Create: `docs/plugin-platform-v2.md`
- Create: `apps/api/src/plugins/plugin-v2-e2e.test.ts`

- [ ] **Step 1: Write the failing end-to-end verification test**

```ts
import assert from "node:assert/strict";
import { installPackagedPluginV2, getInstalledPluginV2 } from "./desktop-plugin-manager";

const plugin = await installPackagedPluginV2({
  pluginPath: "plugins-v2/teleprompter",
});

assert.equal(plugin.manifest.id, "teleprompter");
assert.equal(plugin.manifest.kind, "trusted");
assert.equal(plugin.manifest.permissions.includes("native-runtime"), true);

console.log("[plugin-v2-e2e] tests passed");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --dir apps/api exec tsx src/plugins/plugin-v2-e2e.test.ts`

Expected: FAIL because the v2 install path is not implemented yet.

- [ ] **Step 3: Implement package install, permission confirmation payloads, and docs updates**

```ts
// apps/api/src/plugins/desktop-plugin-routes.ts
desktopPlugins.post("/v2/install/local", async (c) => {
  const plugin = await installPackagedPluginV2(await c.req.json());
  return c.json({ ok: true, data: plugin }, 201);
});
```

```ts
// apps/web/src/app/plugins/page.tsx
const permissionLabels: Record<string, string> = {
  storage: "保存插件自己的数据",
  notifications: "显示通知",
  activity: "记录活动",
  microphone: "使用麦克风",
  "filesystem:plugin-data": "写入插件自己的数据目录",
  "native-runtime": "运行本地高权限代码",
};
```

- [ ] **Step 4: Run the full verification suite**

Run:

- `pnpm --dir apps/api exec tsx src/plugins/plugin-v2-e2e.test.ts`
- `pnpm --filter @thunder/plugin-sdk test:browser`
- `pnpm --filter @thunder/web test:plugin-bridge`
- `pnpm test:plugins`

Expected:

- the new v2 e2e test passes
- SDK and web bridge tests pass
- legacy plugin tests remain green or are deliberately updated to cover both runtimes without regression

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/plugins apps/web/src/app/plugins docs
git commit -m "feat: finish plugin platform v2 packaging and verification"
```

## Self-Review

- Spec coverage: the plan covers manifest v2, public SDKs, trusted worker RPC, developer CLI, host runtime, teleprompter extraction, teleprompter v2 migration, packaging, permissions, docs, and verification. The intentionally deferred marketplace backend and web-hosted plugins remain out of scope.
- Placeholder scan: no task uses TBD or “implement later”; every task names concrete files, tests, commands, and minimal code shapes.
- Type consistency: the plan consistently uses `ThunderPluginManifestV2`, `definePlugin`, `defineWorker`, `native-runtime`, and the teleprompter v2 package naming across later tasks.
- V1 replacement: v2 plugin mechanism will ultimately become the sole plugin mechanism, fully replacing v1. All v1 code will be deleted once v2 is complete (plugin marketplace UI pages retained and reused).
- Teleprompter UI parity: the v2 teleprompter plugin UI must match the Web module experience in every detail — it is not a validation skeleton.
- Plugin devtools: plugin-devtools is not first priority — do not implement new devtools functionality; existing partial work may be kept; resume only when explicitly requested.

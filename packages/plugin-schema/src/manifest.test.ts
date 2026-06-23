import assert from "node:assert/strict";

import {
  parseThunderPluginManifest,
  type ThunderPluginManifest,
} from "./manifest.js";

const trustedManifest: ThunderPluginManifest = {
  manifestVersion: 2,
  id: "teleprompter",
  name: "Teleprompter",
  version: "2.0.0",
  description: "Commercial-grade teleprompter plugin.",
  kind: "trusted",
  engines: {
    thunder: "^2.0.0",
  },
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
      title: "Teleprompter",
      icon: "ScrollText",
      entry: "dist/index.html",
    },
  },
  author: {
    name: "Thunder",
    email: "team@thunder.local",
  },
  runtime: {
    entry: "dist/worker.js",
  },
};

const parsedTrustedManifest = parseThunderPluginManifest(trustedManifest);

assert.equal(parsedTrustedManifest.kind, "trusted");
assert.deepEqual(parsedTrustedManifest.author, trustedManifest.author);

for (const invalidId of ["", "UPPERCASE", "0starts-with-digit", "has spaces", "../../etc/passwd", "a".repeat(64)]) {
  assert.throws(
    () => parseThunderPluginManifest({ ...trustedManifest, id: invalidId }),
    /id must match/,
    `expected rejection for id: ${JSON.stringify(invalidId)}`,
  );
}

assert.throws(() =>
  parseThunderPluginManifest({
    ...trustedManifest,
    runtime: undefined,
  }),
  /trusted plugins must declare runtime\.entry/,
);

assert.throws(() =>
  parseThunderPluginManifest({
    ...trustedManifest,
    kind: "sandboxed",
    permissions: trustedManifest.permissions,
    runtime: undefined,
  }),
  /sandboxed plugins cannot request native-runtime/,
);

assert.throws(() =>
  parseThunderPluginManifest({
    ...trustedManifest,
    permissions: ["secrets"],
  }),
  /invalid permission: secrets/,
);

assert.deepEqual(
  parseThunderPluginManifest({
    ...trustedManifest,
    permissions: ["network:https://example.com"],
  }).permissions,
  ["network:https://example.com"],
);

assert.deepEqual(
  parseThunderPluginManifest({
    ...trustedManifest,
    permissions: ["network:http://127.0.0.1:8787"],
  }).permissions,
  ["network:http://127.0.0.1:8787"],
);

for (const permission of [
  "network:http://example.com",
  "network:https://example.com/path",
  "network:https://user@example.com",
  "network:https://*.example.com",
]) {
  assert.throws(
    () => parseThunderPluginManifest({ ...trustedManifest, permissions: [permission] }),
    /invalid permission/,
  );
}

assert.throws(
  () =>
    parseThunderPluginManifest({
      ...trustedManifest,
      kind: "sandboxed",
      permissions: ["storage"],
    }),
  /sandboxed plugins cannot declare runtime/,
);

assert.throws(() =>
  parseThunderPluginManifest({
    ...trustedManifest,
    author: {
      email: "team@thunder.local",
    },
  }),
  /author\.name is required/,
);

assert.throws(() =>
  parseThunderPluginManifest({
    ...trustedManifest,
    contributes: {
      ...trustedManifest.contributes,
      commands: [
        {
          title: "Missing id",
        },
      ],
    },
  }),
  /contributes\.commands is not supported/,
);

assert.throws(() =>
  parseThunderPluginManifest({
    ...trustedManifest,
    contributes: {
      ...trustedManifest.contributes,
      settings: [
        {
          key: "speechProvider",
          type: "select",
          title: "Speech Provider",
          options: ["local", ""],
        },
      ],
    },
  }),
  /contributes\.settings is not supported/,
);

assert.throws(() =>
  parseThunderPluginManifest({
    ...trustedManifest,
    engines: {},
  }),
  /engines\.thunder is required/,
);

// ---- Semver version format validation ----
for (const invalidVersion of ["🎉", "1.0", "v1.0.0", "not-a-version", "1.0.0.0"]) {
  assert.throws(
    () => parseThunderPluginManifest({ ...trustedManifest, version: invalidVersion }),
    /version must be a valid semver/,
    `expected semver rejection for version: ${JSON.stringify(invalidVersion)}`,
  );
}
// Valid semver versions should pass
for (const validVersion of ["1.0.0", "0.0.1", "2.10.300", "1.0.0-alpha", "1.0.0-beta.1"]) {
  assert.doesNotThrow(
    () => parseThunderPluginManifest({ ...trustedManifest, version: validVersion }),
    `expected semver acceptance for version: ${JSON.stringify(validVersion)}`,
  );
}

// ---- String length limit tests ----
assert.throws(
  () => parseThunderPluginManifest({ ...trustedManifest, name: "x".repeat(129) }),
  /name.*must not exceed 128/,
);

assert.throws(
  () => parseThunderPluginManifest({ ...trustedManifest, version: "v".repeat(65) }),
  /version.*must not exceed 64/,
);

assert.throws(
  () => parseThunderPluginManifest({ ...trustedManifest, engines: { thunder: "t".repeat(65) } }),
  /engines\.thunder.*must not exceed 64/,
);

assert.throws(
  () => parseThunderPluginManifest({ ...trustedManifest, author: { name: "n".repeat(129) } }),
  /author\.name.*must not exceed 128/,
);

assert.throws(
  () => parseThunderPluginManifest({ ...trustedManifest, author: { name: "ok", email: "e".repeat(257) } }),
  /author\.email.*at most 256/,
);

assert.throws(
  () => parseThunderPluginManifest({ ...trustedManifest, author: { name: "ok", url: "u".repeat(1025) } }),
  /author\.url.*at most 1024/,
);

assert.throws(
  () => parseThunderPluginManifest({
    ...trustedManifest,
    runtime: { entry: "e".repeat(257) },
  }),
  /runtime\.entry.*must not exceed 256/,
);

assert.throws(
  () => parseThunderPluginManifest({
    ...trustedManifest,
    contributes: { sidebar: { title: "t".repeat(129), entry: "dist/index.html" } },
  }),
  /contributes\.sidebar\.title.*must not exceed 128/,
);

assert.throws(
  () => parseThunderPluginManifest({
    ...trustedManifest,
    contributes: { sidebar: { title: "ok", entry: "e".repeat(257) } },
  }),
  /contributes\.sidebar\.entry.*must not exceed 256/,
);

// description and icon exceeding limits are silently dropped (optional fields)
{
  const parsed = parseThunderPluginManifest({ ...trustedManifest, description: "d".repeat(2049) });
  assert.equal(parsed.description, undefined);
}
{
  const parsed = parseThunderPluginManifest({ ...trustedManifest, icon: "i".repeat(129) });
  assert.equal(parsed.icon, undefined);
}

// sidebar.icon exceeding limit is silently dropped
{
  const parsed = parseThunderPluginManifest({
    ...trustedManifest,
    contributes: { sidebar: { title: "ok", entry: "dist/index.html", icon: "i".repeat(129) } },
  });
  assert.equal(parsed.contributes?.sidebar?.icon, undefined);
}

console.log("[plugin-schema] manifest tests passed");

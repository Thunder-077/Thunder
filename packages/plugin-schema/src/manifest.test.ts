import assert from "node:assert/strict";

import {
  parseThunderPluginManifest,
  type ThunderPluginManifest,
} from "./manifest";

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

assert.throws(() =>
  parseThunderPluginManifest({
    ...trustedManifest,
    permissions: ["network:https://example.com"],
  }),
  /invalid permission: network:https:\/\/example\.com/,
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

console.log("[plugin-schema] manifest tests passed");

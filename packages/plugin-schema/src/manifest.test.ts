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
    commands: [
      {
        id: "teleprompter.open",
        title: "Open Teleprompter",
      },
    ],
    settings: [
      {
        key: "speechProvider",
        type: "select",
        title: "Speech Provider",
        default: "local",
        options: ["local", "web-speech"],
      },
    ],
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
assert.deepEqual(parsedTrustedManifest.contributes?.commands, trustedManifest.contributes?.commands);
assert.deepEqual(parsedTrustedManifest.contributes?.settings, trustedManifest.contributes?.settings);
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
    permissions: ["network:foo"],
  }),
  /invalid permission: network:foo/,
);

assert.throws(() =>
  parseThunderPluginManifest({
    ...trustedManifest,
    permissions: ["network:*"],
  }),
  /invalid permission: network:\*/,
);

assert.throws(() =>
  parseThunderPluginManifest({
    ...trustedManifest,
    permissions: ["network:https://example.com/path"],
  }),
  /invalid permission: network:https:\/\/example\.com\/path/,
);

assert.throws(() =>
  parseThunderPluginManifest({
    ...trustedManifest,
    permissions: ["network"],
  }),
  /invalid permission: network/,
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
  /contributes\.commands\[0\]\.id is required/,
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
  /contributes\.settings\[0\]\.options must be a string array/,
);

assert.doesNotThrow(() =>
  parseThunderPluginManifest({
    ...trustedManifest,
    permissions: ["network:https://example.com"],
  }),
);

assert.throws(() =>
  parseThunderPluginManifest({
    ...trustedManifest,
    engines: {},
  }),
  /engines\.thunder is required/,
);

console.log("[plugin-schema] manifest tests passed");

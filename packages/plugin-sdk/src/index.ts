/**
 * Public surface of `@thunder/plugin-sdk`.
 *
 * The runtime entry point for plugin UIs is `@thunder/plugin-sdk/browser`,
 * which talks to the host via postMessage. The runtime entry point for
 * trusted workers is `@thunder/plugin-sdk/worker`, which re-exports
 * `defineWorker` from `@thunder/plugin-sdk-worker`.
 *
 * The Manifest type lives in `@thunder/plugin-schema`; we re-export it here
 * for convenience so plugins only need to import from one place.
 *
 * ---
 *
 * History / migration note:
 *
 * Earlier versions of this file exposed a v1 "PluginApp" abstraction
 * (`definePlugin`, `createPluginApi`, `ThunderPluginApp`,
 * `ThunderPluginDefinition`, …) that constructed in-memory panel and
 * command registries but was never wired into the host's iframe bridge.
 * Plugins written against it appeared to register panels/commands that
 * the host had no way to discover, which made the API actively misleading.
 *
 * That surface has been removed. Plugins should now use the real
 * `thunder` client from `@thunder/plugin-sdk/browser` to talk to the
 * host (storage, network, worker.invoke, layout.frame, …) and declare
 * their contribution points in `plugin.json`.
 *
 * The trusted-app template (`packages/plugin-cli/src/templates/trusted-app/`)
 * has been updated to match.
 */

export type {
  ThunderPluginAuthor,
  ThunderPluginCommandContribution,
  ThunderPluginContributes,
  ThunderPluginKind,
  ThunderPluginManifest,
  ThunderPluginPermission,
  ThunderPluginRuntime,
  ThunderPluginSettingContribution,
  ThunderPluginSidebarContribution,
} from "@thunder/plugin-schema"

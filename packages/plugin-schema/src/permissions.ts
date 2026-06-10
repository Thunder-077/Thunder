const STATIC_PLUGIN_PERMISSIONS = [
  "storage",
  "notifications",
  "activity",
  "microphone",
  "filesystem:plugin-data",
  "native-runtime",
] as const;

export type StaticThunderPluginPermission =
  (typeof STATIC_PLUGIN_PERMISSIONS)[number];

export type ThunderPluginPermission = StaticThunderPluginPermission;

export const thunderPluginPermissions = [...STATIC_PLUGIN_PERMISSIONS];

export function isThunderPluginPermission(
  permission: string,
): permission is ThunderPluginPermission {
  return thunderPluginPermissions.includes(
    permission as StaticThunderPluginPermission,
  );
}

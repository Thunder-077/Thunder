const STATIC_PLUGIN_PERMISSIONS = [
  "storage",
  "secrets",
  "notifications",
  "activity",
  "microphone",
  "filesystem:plugin-data",
  "native-runtime",
] as const;

export type StaticThunderPluginPermission =
  (typeof STATIC_PLUGIN_PERMISSIONS)[number];

export type NetworkThunderPluginPermission = `network:${string}`;

export type ThunderPluginPermission =
  | StaticThunderPluginPermission
  | NetworkThunderPluginPermission;

export const thunderPluginPermissions = [...STATIC_PLUGIN_PERMISSIONS];

export function isNetworkPermission(
  permission: string,
): permission is NetworkThunderPluginPermission {
  if (!permission.startsWith("network:")) {
    return false;
  }

  const origin = permission.slice("network:".length);
  if (origin.length === 0 || origin === "*") {
    return false;
  }

  try {
    const parsed = new URL(origin);
    return parsed.origin === origin;
  } catch {
    return false;
  }
}

export function isThunderPluginPermission(
  permission: string,
): permission is ThunderPluginPermission {
  return (
    thunderPluginPermissions.includes(
      permission as StaticThunderPluginPermission,
    ) || isNetworkPermission(permission)
  );
}

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

export type ThunderPluginNetworkPermission = `network:${string}`;
export type ThunderPluginPermission =
  | StaticThunderPluginPermission
  | ThunderPluginNetworkPermission;

export const thunderPluginPermissions = [...STATIC_PLUGIN_PERMISSIONS];

export function isThunderPluginPermission(
  permission: string,
): permission is ThunderPluginPermission {
  return (
    thunderPluginPermissions.includes(permission as StaticThunderPluginPermission) ||
    normalizeThunderPluginNetworkPermission(permission) !== null
  );
}

export function normalizeThunderPluginNetworkPermission(
  permission: string,
): ThunderPluginNetworkPermission | null {
  if (!permission.startsWith("network:")) return null;

  const rawOrigin = permission.slice("network:".length);
  let url: URL;
  try {
    url = new URL(rawOrigin);
  } catch {
    return null;
  }

  const loopback =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
    url.username ||
    url.password ||
    url.hostname.includes("*") ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    rawOrigin !== url.origin
  ) {
    return null;
  }

  return `network:${url.origin}`;
}

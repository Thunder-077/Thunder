import { ThunderPluginManifestError } from "./errors.js";
import { isRecord } from "./guards.js";
import {
  isThunderPluginPermission,
  normalizeThunderPluginNetworkPermission,
  type ThunderPluginPermission,
} from "./permissions.js";

// ---- Manifest field length limits ----
const MAX_NAME_LENGTH = 128;
const MAX_DESCRIPTION_LENGTH = 2048;
const MAX_VERSION_LENGTH = 64;
const MAX_ICON_LENGTH = 128;
const MAX_AUTHOR_NAME_LENGTH = 128;
const MAX_AUTHOR_EMAIL_LENGTH = 256;
const MAX_AUTHOR_URL_LENGTH = 1024;
const MAX_SIDEBAR_TITLE_LENGTH = 128;
const MAX_SIDEBAR_ENTRY_LENGTH = 256;
const MAX_SIDEBAR_ICON_LENGTH = 128;
const MAX_RUNTIME_ENTRY_LENGTH = 256;
const MAX_ENGINES_THUNDER_LENGTH = 64;

export type ThunderPluginKind = "sandboxed" | "trusted";

export interface ThunderPluginAuthor {
  name: string;
  email?: string;
  url?: string;
}

export interface ThunderPluginSidebarContribution {
  title: string;
  icon?: string;
  entry: string;
}

export interface ThunderPluginContributes {
  sidebar?: ThunderPluginSidebarContribution;
}

export interface ThunderPluginRuntime {
  entry: string;
}

export interface ThunderPluginManifest {
  manifestVersion: 2;
  id: string;
  name: string;
  version: string;
  description?: string;
  kind: ThunderPluginKind;
  engines: {
    thunder: string;
  };
  author?: ThunderPluginAuthor;
  icon?: string;
  permissions: ThunderPluginPermission[];
  contributes?: ThunderPluginContributes;
  runtime?: ThunderPluginRuntime;
}


function assertManifest(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new ThunderPluginManifestError(message);
  }
}

function parsePermissions(input: unknown): ThunderPluginPermission[] {
  assertManifest(Array.isArray(input), "permissions must be an array");

  const permissions = input.map((permission) => {
    assertManifest(
      typeof permission === "string" && isThunderPluginPermission(permission),
      `invalid permission: ${String(permission)}`,
    );
    return normalizeThunderPluginNetworkPermission(permission) ?? permission;
  });
  assertManifest(new Set(permissions).size === permissions.length, "permissions must not contain duplicates");
  return permissions;
}

function parseRuntime(
  kind: ThunderPluginKind,
  input: unknown,
): ThunderPluginRuntime | undefined {
  if (input == null) {
    assertManifest(
      kind !== "trusted",
      "trusted plugins must declare runtime.entry",
    );
    return undefined;
  }

  assertManifest(kind === "trusted", "sandboxed plugins cannot declare runtime");
  assertManifest(isRecord(input), "runtime must be an object");
  assertManifest(
    typeof input.entry === "string" && input.entry.length > 0 && input.entry.length <= MAX_RUNTIME_ENTRY_LENGTH,
    `runtime.entry is required and must not exceed ${MAX_RUNTIME_ENTRY_LENGTH} characters`,
  );

  return {
    entry: input.entry,
  };
}

function parseEngines(input: unknown): { thunder: string } {
  assertManifest(isRecord(input), "engines must be an object");
  assertManifest(
    typeof input.thunder === "string" && input.thunder.length > 0 && input.thunder.length <= MAX_ENGINES_THUNDER_LENGTH,
    `engines.thunder is required and must not exceed ${MAX_ENGINES_THUNDER_LENGTH} characters`,
  );

  return {
    thunder: input.thunder,
  };
}

function parseAuthor(input: unknown): ThunderPluginAuthor | undefined {
  if (input == null) {
    return undefined;
  }

  assertManifest(isRecord(input), "author must be an object");
  assertManifest(
    typeof input.name === "string" && input.name.length > 0 && input.name.length <= MAX_AUTHOR_NAME_LENGTH,
    `author.name is required and must not exceed ${MAX_AUTHOR_NAME_LENGTH} characters`,
  );

  if (input.email != null) {
    assertManifest(typeof input.email === "string" && input.email.length <= MAX_AUTHOR_EMAIL_LENGTH, `author.email must be a string of at most ${MAX_AUTHOR_EMAIL_LENGTH} characters`);
  }

  if (input.url != null) {
    assertManifest(typeof input.url === "string" && input.url.length <= MAX_AUTHOR_URL_LENGTH, `author.url must be a string of at most ${MAX_AUTHOR_URL_LENGTH} characters`);
  }

  const author: ThunderPluginAuthor = {
    name: input.name,
  };

  if (typeof input.email === "string") {
    author.email = input.email;
  }

  if (typeof input.url === "string") {
    author.url = input.url;
  }

  return author;
}

function parseContributes(input: unknown): ThunderPluginContributes | undefined {
  if (input == null) {
    return undefined;
  }

  assertManifest(isRecord(input), "contributes must be an object");
  assertManifest(
    input.commands == null,
    "contributes.commands is not supported",
  );
  assertManifest(
    input.settings == null,
    "contributes.settings is not supported",
  );

  const contributes: ThunderPluginContributes = {};

  if (input.sidebar != null) {
    assertManifest(isRecord(input.sidebar), "contributes.sidebar must be an object");
    assertManifest(
      typeof input.sidebar.title === "string" && input.sidebar.title.length > 0 && input.sidebar.title.length <= MAX_SIDEBAR_TITLE_LENGTH,
      `contributes.sidebar.title is required and must not exceed ${MAX_SIDEBAR_TITLE_LENGTH} characters`,
    );
    assertManifest(
      typeof input.sidebar.entry === "string" && input.sidebar.entry.length > 0 && input.sidebar.entry.length <= MAX_SIDEBAR_ENTRY_LENGTH,
      `contributes.sidebar.entry is required and must not exceed ${MAX_SIDEBAR_ENTRY_LENGTH} characters`,
    );

    contributes.sidebar = {
      title: input.sidebar.title,
      entry: input.sidebar.entry,
      icon:
        typeof input.sidebar.icon === "string" && input.sidebar.icon.length > 0 && input.sidebar.icon.length <= MAX_SIDEBAR_ICON_LENGTH
          ? input.sidebar.icon
          : undefined,
    };
  }

  return contributes;
}

function validateKindPermissions(
  kind: ThunderPluginKind,
  permissions: ThunderPluginPermission[],
): void {
  if (kind === "sandboxed") {
    assertManifest(
      !permissions.includes("native-runtime"),
      "sandboxed plugins cannot request native-runtime",
    );
    assertManifest(
      !permissions.includes("filesystem:plugin-data"),
      "sandboxed plugins cannot request filesystem:plugin-data",
    );
  }
}

export const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9-]{1,62}$/;

export function parseThunderPluginManifest(
  input: unknown,
): ThunderPluginManifest {
  assertManifest(isRecord(input), "manifest must be an object");
  assertManifest(input.manifestVersion === 2, "manifestVersion must be 2");
  assertManifest(
    typeof input.id === "string" && PLUGIN_ID_PATTERN.test(input.id),
    "id must match /^[a-z][a-z0-9-]{1,62}$/",
  );
  assertManifest(
    typeof input.name === "string" && input.name.length > 0 && input.name.length <= MAX_NAME_LENGTH,
    `name is required and must not exceed ${MAX_NAME_LENGTH} characters`,
  );
  assertManifest(
    typeof input.version === "string" && input.version.length > 0 && input.version.length <= MAX_VERSION_LENGTH,
    `version is required and must not exceed ${MAX_VERSION_LENGTH} characters`,
  );
  assertManifest(
    input.kind === "sandboxed" || input.kind === "trusted",
    "kind must be sandboxed or trusted",
  );

  const permissions = parsePermissions(input.permissions);
  validateKindPermissions(input.kind, permissions);

  return {
    manifestVersion: 2,
    id: input.id,
    name: input.name,
    version: input.version,
    description: typeof input.description === "string" && input.description.length <= MAX_DESCRIPTION_LENGTH ? input.description : undefined,
    kind: input.kind,
    engines: parseEngines(input.engines),
    author: parseAuthor(input.author),
    icon: typeof input.icon === "string" && input.icon.length <= MAX_ICON_LENGTH ? input.icon : undefined,
    permissions,
    contributes: parseContributes(input.contributes),
    runtime: parseRuntime(input.kind, input.runtime),
  };
}

import { ThunderPluginManifestError } from "./errors";
import {
  isThunderPluginPermission,
  type ThunderPluginPermission,
} from "./permissions";

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

export interface ThunderPluginCommandContribution {
  id: string;
  title: string;
}

export interface ThunderPluginSettingContribution {
  key: string;
  type: string;
  title: string;
  default?: unknown;
  options?: string[];
}

export interface ThunderPluginContributes {
  sidebar?: ThunderPluginSidebarContribution;
  commands?: ThunderPluginCommandContribution[];
  settings?: ThunderPluginSettingContribution[];
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePermissions(input: unknown): ThunderPluginPermission[] {
  assertManifest(Array.isArray(input), "permissions must be an array");

  return input.map((permission) => {
    assertManifest(
      typeof permission === "string" && isThunderPluginPermission(permission),
      `invalid permission: ${String(permission)}`,
    );
    return permission;
  });
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

  assertManifest(isRecord(input), "runtime must be an object");
  assertManifest(
    typeof input.entry === "string" && input.entry.length > 0,
    "runtime.entry is required",
  );

  return {
    entry: input.entry,
  };
}

function parseEngines(input: unknown): { thunder: string } {
  assertManifest(isRecord(input), "engines must be an object");
  assertManifest(
    typeof input.thunder === "string" && input.thunder.length > 0,
    "engines.thunder is required",
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
    typeof input.name === "string" && input.name.length > 0,
    "author.name is required",
  );

  if (input.email != null) {
    assertManifest(typeof input.email === "string", "author.email must be a string");
  }

  if (input.url != null) {
    assertManifest(typeof input.url === "string", "author.url must be a string");
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

function parseCommands(input: unknown): ThunderPluginCommandContribution[] | undefined {
  if (input == null) {
    return undefined;
  }

  assertManifest(Array.isArray(input), "contributes.commands must be an array");

  return input.map((command, index) => {
    assertManifest(
      isRecord(command),
      `contributes.commands[${index}] must be an object`,
    );
    assertManifest(
      typeof command.id === "string" && command.id.length > 0,
      `contributes.commands[${index}].id is required`,
    );
    assertManifest(
      typeof command.title === "string" && command.title.length > 0,
      `contributes.commands[${index}].title is required`,
    );

    return {
      id: command.id,
      title: command.title,
    };
  });
}

function parseSettings(input: unknown): ThunderPluginSettingContribution[] | undefined {
  if (input == null) {
    return undefined;
  }

  assertManifest(Array.isArray(input), "contributes.settings must be an array");

  return input.map((setting, index) => {
    assertManifest(
      isRecord(setting),
      `contributes.settings[${index}] must be an object`,
    );
    assertManifest(
      typeof setting.key === "string" && setting.key.length > 0,
      `contributes.settings[${index}].key is required`,
    );
    assertManifest(
      typeof setting.type === "string" && setting.type.length > 0,
      `contributes.settings[${index}].type is required`,
    );
    assertManifest(
      typeof setting.title === "string" && setting.title.length > 0,
      `contributes.settings[${index}].title is required`,
    );

    if (setting.options != null) {
      assertManifest(
        Array.isArray(setting.options) &&
          setting.options.every(
            (option) => typeof option === "string" && option.length > 0,
          ),
        `contributes.settings[${index}].options must be a string array`,
      );
    }

    return {
      key: setting.key,
      type: setting.type,
      title: setting.title,
      default: setting.default,
      options: Array.isArray(setting.options) ? [...setting.options] : undefined,
    };
  });
}

function parseContributes(input: unknown): ThunderPluginContributes | undefined {
  if (input == null) {
    return undefined;
  }

  assertManifest(isRecord(input), "contributes must be an object");

  const contributes: ThunderPluginContributes = {};

  if (input.sidebar != null) {
    assertManifest(isRecord(input.sidebar), "contributes.sidebar must be an object");
    assertManifest(
      typeof input.sidebar.title === "string" && input.sidebar.title.length > 0,
      "contributes.sidebar.title is required",
    );
    assertManifest(
      typeof input.sidebar.entry === "string" && input.sidebar.entry.length > 0,
      "contributes.sidebar.entry is required",
    );

    contributes.sidebar = {
      title: input.sidebar.title,
      entry: input.sidebar.entry,
      icon:
        typeof input.sidebar.icon === "string" && input.sidebar.icon.length > 0
          ? input.sidebar.icon
          : undefined,
    };
  }

  contributes.commands = parseCommands(input.commands);
  contributes.settings = parseSettings(input.settings);

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

export function parseThunderPluginManifest(
  input: unknown,
): ThunderPluginManifest {
  assertManifest(isRecord(input), "manifest must be an object");
  assertManifest(input.manifestVersion === 2, "manifestVersion must be 2");
  assertManifest(typeof input.id === "string" && input.id.length > 0, "id is required");
  assertManifest(
    typeof input.name === "string" && input.name.length > 0,
    "name is required",
  );
  assertManifest(
    typeof input.version === "string" && input.version.length > 0,
    "version is required",
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
    description: typeof input.description === "string" ? input.description : undefined,
    kind: input.kind,
    engines: parseEngines(input.engines),
    author: parseAuthor(input.author),
    icon: typeof input.icon === "string" ? input.icon : undefined,
    permissions,
    contributes: parseContributes(input.contributes),
    runtime: parseRuntime(input.kind, input.runtime),
  };
}

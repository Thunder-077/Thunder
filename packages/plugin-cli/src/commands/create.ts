import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

export type PluginTemplate = "trusted-app" | "sandboxed-basic" | "sandboxed-ui"

export interface CreatePluginProjectOptions {
  name: string
  template: PluginTemplate
}

export type GeneratedPluginFiles = Record<string, string>

const TEMPLATE_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "templates",
)

function assertPluginName(name: string): string {
  const pluginName = name.trim()

  if (!/^[a-z][a-z0-9-]{1,62}$/.test(pluginName)) {
    throw new Error("Plugin name must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens")
  }

  return pluginName
}

function readTemplateFile(template: PluginTemplate, ...pathParts: string[]): string {
  return readFileSync(join(TEMPLATE_ROOT, template, ...pathParts), "utf8")
}

function replaceTemplateTokens(source: string, pluginName: string): string {
  return source
    .replace(/__PLUGIN_ID__/g, pluginName)
    .replace(/__PLUGIN_NAME__/g, pluginName)
    .replace(/__PACKAGE_NAME__/g, pluginName)
}

function createTrustedAppTemplate(pluginName: string): GeneratedPluginFiles {
  return {
    "plugin.json": replaceTemplateTokens(readTemplateFile("trusted-app", "plugin.json"), pluginName),
    "package.json": replaceTemplateTokens(readTemplateFile("trusted-app", "package.json"), pluginName),
    "src/index.tsx": replaceTemplateTokens(
      readTemplateFile("trusted-app", "src", "index.tsx"),
      pluginName,
    ),
    "src/worker.ts": readTemplateFile("trusted-app", "src", "worker.ts"),
  }
}

export function createPluginProject(
  options: CreatePluginProjectOptions,
): GeneratedPluginFiles {
  const pluginName = assertPluginName(options.name)

  if (options.template === "trusted-app") {
    return createTrustedAppTemplate(pluginName)
  }

  throw new Error(`Unsupported template: ${options.template}`)
}

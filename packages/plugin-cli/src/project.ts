import { access, readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { parseThunderPluginManifest, type ThunderPluginManifest } from "@thunder/plugin-schema"

export type PluginCssBuildConfig = {
  input: string
  output?: string
  sources?: string[]
}

export type PluginBuildConfig = {
  css?: PluginCssBuildConfig
  define?: Record<string, string>
}

export interface PluginProject {
  rootDir: string
  manifestPath: string
  manifest: ThunderPluginManifest
  build: PluginBuildConfig
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function loadPluginProject(rootDir: string): Promise<PluginProject> {
  const resolvedRoot = resolve(rootDir)
  const manifestPath = join(resolvedRoot, "plugin.json")
  const manifest = parseThunderPluginManifest(
    JSON.parse(await readFile(manifestPath, "utf8")),
  )
  const build = await readPluginBuildConfig(resolvedRoot)

  return {
    rootDir: resolvedRoot,
    manifestPath,
    manifest,
    build,
  }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input)
}

function parseStringRecord(input: unknown): Record<string, string> | undefined {
  if (input === undefined) return undefined
  if (!isRecord(input)) {
    throw new Error("package.json thunderPlugin.define must be an object")
  }

  const parsed: Record<string, string> = {}
  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== "string") {
      throw new Error(`package.json thunderPlugin.define.${key} must be a string`)
    }
    parsed[key] = value
  }
  return parsed
}

function parseCssBuildConfig(input: unknown): PluginCssBuildConfig | undefined {
  if (input === undefined) return undefined
  if (!isRecord(input)) {
    throw new Error("package.json thunderPlugin.css must be an object")
  }
  if (typeof input.input !== "string" || !input.input.trim()) {
    throw new Error("package.json thunderPlugin.css.input must be a non-empty string")
  }
  if (input.output !== undefined && typeof input.output !== "string") {
    throw new Error("package.json thunderPlugin.css.output must be a string")
  }
  if (input.sources !== undefined && (!Array.isArray(input.sources) || input.sources.some((source) => typeof source !== "string"))) {
    throw new Error("package.json thunderPlugin.css.sources must be a string array")
  }

  return {
    input: input.input,
    output: input.output,
    sources: input.sources as string[] | undefined,
  }
}

async function readPluginBuildConfig(rootDir: string): Promise<PluginBuildConfig> {
  const packageJsonPath = join(rootDir, "package.json")
  if (!(await fileExists(packageJsonPath))) {
    return {}
  }

  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as unknown
  if (!isRecord(packageJson) || packageJson.thunderPlugin === undefined) {
    return {}
  }
  if (!isRecord(packageJson.thunderPlugin)) {
    throw new Error("package.json thunderPlugin must be an object")
  }

  return {
    css: parseCssBuildConfig(packageJson.thunderPlugin.css),
    define: parseStringRecord(packageJson.thunderPlugin.define),
  }
}

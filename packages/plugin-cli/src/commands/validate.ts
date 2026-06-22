import { lstat, readdir } from "node:fs/promises"
import { join, relative, resolve, sep } from "node:path"
import {
  type ThunderPluginManifest,
  type ThunderPluginPermission,
} from "@thunder/plugin-schema"
import { fileExists, loadPluginProject, type PluginProject } from "../project"

export { loadPluginProject }

export const HIGH_RISK_PLUGIN_PERMISSIONS = [
  "native-runtime",
  "filesystem:plugin-data",
  "microphone",
] as const satisfies readonly ThunderPluginPermission[]

export interface PluginValidationResult {
  project: PluginProject
  warnings: string[]
  highRiskPermissions: ThunderPluginPermission[]
  requiresTrustConfirmation: boolean
}

function assertRelativePluginPath(path: string, label: string): void {
  if (!path || path.startsWith("/") || path.startsWith("\\") || path.includes("..")) {
    throw new Error(`${label} must be a plugin-relative path`)
  }
}

function assertPathInside(root: string, target: string): void {
  const normalizedRoot = resolve(root)
  const normalizedTarget = resolve(target)
  if (normalizedTarget !== normalizedRoot && !normalizedTarget.startsWith(`${normalizedRoot}${sep}`)) {
    throw new Error(`Plugin path escapes project root: ${relative(normalizedRoot, normalizedTarget)}`)
  }
}

async function assertNoSymlinks(current: string): Promise<void> {
  const entries = await readdir(current, { withFileTypes: true })
  for (const entry of entries) {
    if (
      entry.isDirectory() &&
      (entry.name === "node_modules" ||
        entry.name === "artifacts" ||
        entry.name === ".git" ||
        entry.name === ".thunder-plugin-dev")
    ) {
      continue
    }
    const entryPath = join(current, entry.name)
    const entryStat = await lstat(entryPath)
    if (entryStat.isSymbolicLink()) {
      throw new Error(`Plugin project must not contain symlinks: ${entryPath}`)
    }
    if (entry.isDirectory()) {
      await assertNoSymlinks(entryPath)
    }
  }
}

async function assertEntryFile(rootDir: string, entry: string, label: string): Promise<void> {
  assertRelativePluginPath(entry, label)
  const entryPath = resolve(rootDir, entry)
  assertPathInside(rootDir, entryPath)
  if (!(await fileExists(entryPath))) {
    throw new Error(`${label} does not exist: ${entry}`)
  }
}

export function getHighRiskPluginPermissions(
  manifest: ThunderPluginManifest,
): ThunderPluginPermission[] {
  return manifest.permissions.filter((permission) =>
    HIGH_RISK_PLUGIN_PERMISSIONS.includes(permission as (typeof HIGH_RISK_PLUGIN_PERMISSIONS)[number]),
  )
}

export function pluginRequiresTrustConfirmation(manifest: ThunderPluginManifest): boolean {
  return manifest.kind === "trusted" || getHighRiskPluginPermissions(manifest).length > 0
}

export async function validatePluginProject(rootDir: string): Promise<PluginValidationResult> {
  const project = await loadPluginProject(rootDir)
  const warnings: string[] = []

  // Entry files are validated against the resolved project root before package
  // creation so external authors catch broken manifests locally.
  const sidebarEntry = project.manifest.contributes?.sidebar?.entry
  if (sidebarEntry) {
    await assertEntryFile(project.rootDir, sidebarEntry, "contributes.sidebar.entry")
  } else {
    warnings.push("No sidebar contribution declared; the plugin will not appear in navigation.")
  }

  if (project.manifest.runtime?.entry) {
    await assertEntryFile(project.rootDir, project.manifest.runtime.entry, "runtime.entry")
  }

  await assertNoSymlinks(project.rootDir)
  const highRiskPermissions = getHighRiskPluginPermissions(project.manifest)

  return {
    project,
    warnings,
    highRiskPermissions,
    requiresTrustConfirmation: pluginRequiresTrustConfirmation(project.manifest),
  }
}

export async function runValidateCommand(rootDir: string): Promise<PluginValidationResult> {
  const result = await validatePluginProject(rootDir)
  console.log(`Plugin: ${result.project.manifest.id}`)
  console.log(`Kind: ${result.project.manifest.kind}`)
  console.log(`Version: ${result.project.manifest.version}`)
  console.log(`Trust confirmation: ${result.requiresTrustConfirmation ? "required" : "not required"}`)
  if (result.highRiskPermissions.length > 0) {
    console.log(`High-risk permissions: ${result.highRiskPermissions.join(", ")}`)
  }
  for (const warning of result.warnings) {
    console.warn(`[plugin-cli] warning: ${warning}`)
  }
  console.log("[plugin-cli] validation passed")
  return result
}

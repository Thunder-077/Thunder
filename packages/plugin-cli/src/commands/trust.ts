import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import type { ThunderPluginKind, ThunderPluginPermission } from "@thunder/plugin-schema"
import type { PluginProject } from "./build"
import { getHighRiskPluginPermissions, pluginRequiresTrustConfirmation } from "./validate"

export interface PluginDevTrustDecision {
  acceptedRisk: true
  kind: ThunderPluginKind
  permissions: ThunderPluginPermission[]
  manifestSha256: string
  reason: string
}

export interface PluginInstallTrustPayload {
  pluginPath: string
  trustDecision?: PluginDevTrustDecision
}

export async function pluginManifestSha256(project: PluginProject): Promise<string> {
  return createHash("sha256")
    .update(await readFile(join(project.rootDir, "plugin.json")))
    .digest("hex")
}

export async function createDevTrustDecision(
  project: PluginProject,
): Promise<PluginDevTrustDecision | undefined> {
  if (!pluginRequiresTrustConfirmation(project.manifest)) {
    return undefined
  }

  // Local dev installs are still explicit trust decisions. The reason makes
  // audit logs distinguish CLI-driven development from marketplace installs.
  return {
    acceptedRisk: true,
    kind: project.manifest.kind,
    permissions: [...project.manifest.permissions],
    manifestSha256: await pluginManifestSha256(project),
    reason: `thunder-plugin dev install (${getHighRiskPluginPermissions(project.manifest).join(", ") || "trusted"})`,
  }
}

export async function createLocalInstallPayload(
  project: PluginProject,
  pluginPath = project.rootDir,
): Promise<PluginInstallTrustPayload> {
  const trustDecision = await createDevTrustDecision(project)
  return {
    pluginPath,
    ...(trustDecision ? { trustDecision } : {}),
  }
}

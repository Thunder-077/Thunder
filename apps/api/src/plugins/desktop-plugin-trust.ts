import type {
  ThunderPluginKind,
  ThunderPluginManifest,
} from "@thunder/plugin-schema"
import type {
  DesktopPluginInstallRecord,
  DesktopPluginTrustRecord,
  DesktopPluginTrustSource,
} from "./desktop-plugin-types"

export class DesktopPluginTrustError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message)
  }
}

export interface DesktopPluginTrustDecision {
  acceptedRisk?: boolean
  permissions?: string[]
  kind?: ThunderPluginKind
  manifestSha256?: string
  reason?: string
}

export interface CreateTrustRecordOptions {
  manifest: ThunderPluginManifest
  manifestSha256: string
  previousRecord?: DesktopPluginInstallRecord | null
  source: DesktopPluginTrustSource
  decision?: DesktopPluginTrustDecision
}

export const HIGH_RISK_PLUGIN_PERMISSIONS = [
  "native-runtime",
  "filesystem:plugin-data",
  "microphone",
] as const

function stablePermissions(permissions: readonly string[]): string[] {
  return [...new Set(permissions)].sort((a, b) => a.localeCompare(b))
}

export function getHighRiskPluginPermissions(
  manifest: Pick<ThunderPluginManifest, "kind" | "permissions">,
): string[] {
  const permissions = new Set(manifest.permissions)
  const risky = HIGH_RISK_PLUGIN_PERMISSIONS.filter((permission) =>
    permissions.has(permission),
  )
  return stablePermissions(manifest.kind === "trusted" ? ["trusted-runtime", ...risky] : risky)
}

export function pluginRequiresTrustConfirmation(
  manifest: Pick<ThunderPluginManifest, "kind" | "permissions">,
): boolean {
  return getHighRiskPluginPermissions(manifest).length > 0
}

function hasSameTrustedScope(
  record: DesktopPluginTrustRecord | undefined,
  manifest: ThunderPluginManifest,
  manifestSha256: string,
): boolean {
  if (!record?.acceptedRisk) return false
  return (
    record.manifestSha256 === manifestSha256 &&
    record.kind === manifest.kind &&
    JSON.stringify(stablePermissions(record.permissions)) ===
      JSON.stringify(stablePermissions(manifest.permissions))
  )
}

function assertUserDecisionMatchesManifest(
  manifest: ThunderPluginManifest,
  manifestSha256: string,
  decision: DesktopPluginTrustDecision | undefined,
): void {
  if (!decision?.acceptedRisk) {
    throw new DesktopPluginTrustError("安装该插件需要确认权限和信任风险", 409)
  }
  if (decision.kind !== manifest.kind) {
    throw new DesktopPluginTrustError("插件信任确认的 kind 与 Manifest 不一致", 409)
  }
  if (decision.manifestSha256 !== manifestSha256) {
    throw new DesktopPluginTrustError("插件信任确认已过期，请重新确认", 409)
  }
  if (
    JSON.stringify(stablePermissions(decision.permissions ?? [])) !==
    JSON.stringify(stablePermissions(manifest.permissions))
  ) {
    throw new DesktopPluginTrustError("插件信任确认的权限列表与 Manifest 不一致", 409)
  }
}

export function createDesktopPluginTrustRecord({
  manifest,
  manifestSha256,
  previousRecord,
  source,
  decision,
}: CreateTrustRecordOptions): DesktopPluginTrustRecord {
  const previousTrust = previousRecord?.trust
  const highRiskPermissions = getHighRiskPluginPermissions(manifest)
  const needsConfirmation = pluginRequiresTrustConfirmation(manifest)

  if (source === "official-bundled") {
    return {
      source,
      trustedAt: new Date().toISOString(),
      manifestSha256,
      kind: manifest.kind,
      permissions: stablePermissions(manifest.permissions),
      highRiskPermissions,
      acceptedRisk: true,
      reason: "official bundled plugin",
    }
  }

  if (!needsConfirmation) {
    return {
      source: "sandboxed-default",
      trustedAt: new Date().toISOString(),
      manifestSha256,
      kind: manifest.kind,
      permissions: stablePermissions(manifest.permissions),
      highRiskPermissions,
      acceptedRisk: true,
      reason: "no high risk permissions",
    }
  }

  if (hasSameTrustedScope(previousTrust, manifest, manifestSha256)) {
    return previousTrust as DesktopPluginTrustRecord
  }

  assertUserDecisionMatchesManifest(manifest, manifestSha256, decision)
  return {
    source: "user-confirmed",
    trustedAt: new Date().toISOString(),
    manifestSha256,
    kind: manifest.kind,
    permissions: stablePermissions(manifest.permissions),
    highRiskPermissions,
    acceptedRisk: true,
    reason: decision?.reason,
  }
}

export function assertPluginTrustedForRuntime(
  record: DesktopPluginInstallRecord | null,
  manifest: ThunderPluginManifest,
  currentManifestSha256?: string,
): void {
  if (manifest.kind !== "trusted") return
  if (!record?.trust?.acceptedRisk) {
    throw new DesktopPluginTrustError("Trusted 插件未完成信任确认，无法启动本地 runtime", 403)
  }
  // Verify the manifest hasn't been modified since the trust decision was made.
  // This prevents post-install tampering (e.g. permission escalation) from
  // bypassing the trust gate.
  if (
    currentManifestSha256 &&
    record.trust.manifestSha256 &&
    currentManifestSha256 !== record.trust.manifestSha256
  ) {
    throw new DesktopPluginTrustError(
      "插件清单已变更（SHA256 不匹配），需要重新确认信任后才能启动 runtime",
      409,
    )
  }
}

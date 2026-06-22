import { createHash } from "node:crypto"
import { mkdir, readFile } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import { c as createTar } from "tar"
import { buildPlugin } from "./build.js"
import {
  createMarketplaceEntry,
  writeMarketplaceEntry,
  type DesktopPluginMarketplaceEntry,
  type MarketplaceSigningOptions,
} from "./marketplace.js"
import { pluginManifestSha256 } from "./trust.js"

export interface PackPluginResult {
  packagePath: string
  packageSha256: string
  manifestSha256: string
  marketplaceEntry?: DesktopPluginMarketplaceEntry
  marketplaceEntryPath?: string
}

export interface PackPluginOptions {
  rootDir: string
  outDir?: string
  writeEntry?: boolean
  baseUrl?: string
  signing?: MarketplaceSigningOptions
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex")
}

function shouldIncludePackagePath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/")
  return (
    !normalized.includes("/node_modules/") &&
    !normalized.includes("/artifacts/") &&
    !normalized.includes("/.git/") &&
    !normalized.endsWith("/node_modules") &&
    !normalized.endsWith("/artifacts") &&
    !normalized.endsWith("/.git")
  )
}

export async function packPlugin(optionsOrRootDir: PackPluginOptions | string): Promise<PackPluginResult> {
  const options = typeof optionsOrRootDir === "string" ? { rootDir: optionsOrRootDir } : optionsOrRootDir
  const buildResult = await buildPlugin({
    rootDir: options.rootDir,
    clean: true,
  })
  const { manifest } = buildResult.project
  const packageDir = resolve(options.outDir ?? join(buildResult.project.rootDir, "artifacts"))
  const packagePath = join(packageDir, `${manifest.id}-${manifest.version}.tar.gz`)
  await mkdir(packageDir, { recursive: true })

  // Archive only the plugin project payload. Local dependencies, generated
  // packages, and VCS metadata stay outside distributable artifacts.
  await createTar(
    {
      gzip: true,
      file: packagePath,
      cwd: resolve(buildResult.project.rootDir, ".."),
      filter: shouldIncludePackagePath,
    },
    [basename(buildResult.project.rootDir)],
  )

  const archive = await readFile(packagePath)
  const packageSha256 = sha256(archive)
  const manifestSha256 = await pluginManifestSha256(buildResult.project)
  const result: PackPluginResult = {
    packagePath,
    packageSha256,
    manifestSha256,
  }

  if (options.writeEntry) {
    const marketplaceEntry = await createMarketplaceEntry({
      manifest,
      manifestSha256,
      packageName: `${manifest.id}-${manifest.version}.tar.gz`,
      packageSha256,
      baseUrl: options.baseUrl,
      signing: options.signing,
    })
    const marketplaceEntryPath = await writeMarketplaceEntry(
      marketplaceEntry,
      join(packageDir, `${manifest.id}-${manifest.version}.marketplace-entry.json`),
    )
    return {
      ...result,
      marketplaceEntry,
      marketplaceEntryPath,
    }
  }

  return result
}

export async function runPackCommand(options: PackPluginOptions | string): Promise<PackPluginResult> {
  return packPlugin(options)
}

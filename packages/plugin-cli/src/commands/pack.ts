import { createHash } from "node:crypto"
import { mkdir, readFile } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import { c as createTar } from "tar"
import { buildPlugin } from "./build"

export interface PackPluginResult {
  packagePath: string
  packageSha256: string
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex")
}

export async function packPlugin(rootDir: string): Promise<PackPluginResult> {
  const buildResult = await buildPlugin({
    rootDir,
    clean: true,
  })
  const { manifest } = buildResult.project
  const packageDir = join(buildResult.project.rootDir, "artifacts")
  const packagePath = join(packageDir, `${manifest.id}-${manifest.version}.tar.gz`)
  await mkdir(packageDir, { recursive: true })

  await createTar(
    {
      gzip: true,
      file: packagePath,
      cwd: resolve(buildResult.project.rootDir, ".."),
    },
    [basename(buildResult.project.rootDir)],
  )

  const archive = await readFile(packagePath)
  return {
    packagePath,
    packageSha256: sha256(archive),
  }
}

export async function runPackCommand(rootDir: string): Promise<PackPluginResult> {
  return packPlugin(rootDir)
}

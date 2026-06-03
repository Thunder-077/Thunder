import { copyFile, lstat, mkdir, readlink, readdir, rm } from "node:fs/promises"
import { dirname, isAbsolute, relative, resolve } from "node:path"

function isInside(childPath, parentPath) {
  const relativePath = relative(parentPath, childPath)
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath))
}

async function assertPathExists(path) {
  try {
    await lstat(path)
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`Required traced standalone target does not exist: ${path}`)
    }
    throw error
  }
}

export function resolveStandaloneSymlinkTarget({
  linkPath,
  linkTarget,
  standaloneDir,
  workspaceRoot,
}) {
  const absoluteTarget = resolve(dirname(linkPath), linkTarget)
  if (isInside(absoluteTarget, standaloneDir)) {
    return absoluteTarget
  }

  const rootPnpmDir = resolve(workspaceRoot, "node_modules", ".pnpm")
  if (isInside(absoluteTarget, rootPnpmDir)) {
    return resolve(standaloneDir, "node_modules", ".pnpm", relative(rootPnpmDir, absoluteTarget))
  }

  return absoluteTarget
}

export function shouldPruneRuntimeFile(filePath) {
  return filePath.endsWith(".map") || filePath.endsWith(".d.ts") || filePath.endsWith(".tsbuildinfo")
}

async function copyStandaloneEntry(sourcePath, targetPath, options) {
  const sourceStats = await lstat(sourcePath)

  if (sourceStats.isSymbolicLink()) {
    const linkTarget = await readlink(sourcePath)
    const resolvedTarget = resolveStandaloneSymlinkTarget({
      linkPath: sourcePath,
      linkTarget,
      standaloneDir: options.standaloneDir,
      workspaceRoot: options.workspaceRoot,
    })

    await assertPathExists(resolvedTarget)
    await copyStandaloneEntry(resolvedTarget, targetPath, options)
    return
  }

  if (sourceStats.isDirectory()) {
    await mkdir(targetPath, { recursive: true })
    const entries = await readdir(sourcePath)
    for (const entry of entries) {
      await copyStandaloneEntry(resolve(sourcePath, entry), resolve(targetPath, entry), options)
    }
    return
  }

  if (sourceStats.isFile()) {
    await mkdir(dirname(targetPath), { recursive: true })
    await copyFile(sourcePath, targetPath)
  }
}

export async function copyStandaloneRuntime(sourceDir, targetDir, options) {
  await rm(targetDir, { recursive: true, force: true })
  await mkdir(targetDir, { recursive: true })
  const entries = await readdir(sourceDir)
  for (const entry of entries) {
    await copyStandaloneEntry(resolve(sourceDir, entry), resolve(targetDir, entry), options)
  }
}

export async function pruneRuntimeFiles(rootDir) {
  const result = {
    removedFiles: 0,
    removedBytes: 0,
  }

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = resolve(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(entryPath)
        continue
      }

      if (!entry.isFile() || !shouldPruneRuntimeFile(entryPath)) continue

      const stats = await lstat(entryPath)
      await rm(entryPath, { force: true })
      result.removedFiles += 1
      result.removedBytes += stats.size
    }
  }

  await walk(rootDir)
  return result
}

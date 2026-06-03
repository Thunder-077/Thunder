import { lstat, readdir } from "node:fs/promises"
import { resolve } from "node:path"

const desktopRoot = resolve(import.meta.dirname, "..")
const workspaceRoot = resolve(desktopRoot, "..", "..")
const runtimeDir = resolve(desktopRoot, "runtime")
const bundleDir = resolve(desktopRoot, "src-tauri", "target", "release", "bundle")

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

async function measurePath(path) {
  const stats = await lstat(path)
  if (stats.isFile()) {
    return {
      path,
      bytes: stats.size,
      files: 1,
    }
  }

  if (!stats.isDirectory()) {
    return {
      path,
      bytes: 0,
      files: 0,
    }
  }

  let bytes = 0
  let files = 0
  const entries = await readdir(path)
  for (const entry of entries) {
    const result = await measurePath(resolve(path, entry))
    bytes += result.bytes
    files += result.files
  }

  return { path, bytes, files }
}

async function measureChildren(path) {
  try {
    const entries = await readdir(path)
    const results = []
    for (const entry of entries) {
      results.push(await measurePath(resolve(path, entry)))
    }
    return results.sort((left, right) => right.bytes - left.bytes)
  } catch (error) {
    if (error?.code === "ENOENT") return []
    throw error
  }
}

function printTable(title, rows) {
  console.log(`\n${title}`)
  for (const row of rows) {
    const relativePath = row.path.replace(`${workspaceRoot}\\`, "").replaceAll("\\", "/")
    console.log(`${formatBytes(row.bytes).padStart(10)}  ${String(row.files).padStart(6)} files  ${relativePath}`)
  }
}

const runtimeRows = await measureChildren(runtimeDir)
const installerRows = await measureChildren(bundleDir)

printTable("Desktop runtime", runtimeRows)
printTable("Installer artifacts", installerRows)

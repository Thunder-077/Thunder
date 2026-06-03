import { access, readFile, readdir } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { dirname } from "node:path"
import { readRuntimeDependencyManifest } from "./runtime-dependency-utils.mjs"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const apiRoot = resolve(scriptDir, "..")
const workspaceRoot = resolve(apiRoot, "..", "..")
const runtimeRoot = resolve(workspaceRoot, "apps", "desktop", "runtime")
const runtimeApiDir = resolve(runtimeRoot, "api")
const runtimeSqliteClientDir = resolve(runtimeRoot, "generated", "sqlite-client")

async function pathExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function packagePathForDependency(dependencyName) {
  if (dependencyName.startsWith("@")) {
    const [scope, name] = dependencyName.split("/")
    return resolve(runtimeApiDir, "node_modules", scope, name)
  }
  return resolve(runtimeApiDir, "node_modules", dependencyName)
}

const manifest = await readRuntimeDependencyManifest(workspaceRoot)
const runtimePackageJson = JSON.parse(await readFile(resolve(runtimeApiDir, "package.json"), "utf8"))
const runtimeDependencies = Object.keys(runtimePackageJson.dependencies ?? {})

for (const dependencyName of manifest.api.dependencies) {
  if (!runtimeDependencies.includes(dependencyName)) {
    throw new Error(`Missing desktop runtime dependency in package.json: ${dependencyName}`)
  }
}

for (const dependencyName of manifest.api.excludedDependencies) {
  if (runtimeDependencies.includes(dependencyName)) {
    throw new Error(`Excluded dependency leaked into desktop API package.json: ${dependencyName}`)
  }

  if (await pathExists(packagePathForDependency(dependencyName))) {
    throw new Error(`Excluded dependency leaked into desktop API node_modules: ${dependencyName}`)
  }
}

const sqliteFiles = await readdir(runtimeSqliteClientDir)
const engineFiles = sqliteFiles.filter((fileName) => fileName.includes("query_engine") && fileName.endsWith(".node"))
if (!sqliteFiles.includes("schema.prisma") || engineFiles.length === 0) {
  throw new Error("Desktop runtime is missing SQLite Prisma schema.prisma or query engine")
}

const serverBundle = await readFile(resolve(runtimeApiDir, "server.cjs"), "utf8")
if (serverBundle.includes("@prisma/adapter-neon")) {
  throw new Error("Desktop API bundle contains @prisma/adapter-neon")
}

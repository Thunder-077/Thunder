import { readFile, readdir } from "node:fs/promises"
import { resolve } from "node:path"

export function createRuntimePackageJson({ dependencyVersions, packageName }) {
  return {
    name: packageName,
    private: true,
    type: "commonjs",
    dependencies: dependencyVersions,
  }
}

export function resolveDependencyVersions(dependencyNames, packageJsons) {
  const dependencyVersions = {}

  for (const dependencyName of dependencyNames) {
    const owner = packageJsons.find((packageJson) => {
      return (
        packageJson.dependencies?.[dependencyName] ||
        packageJson.optionalDependencies?.[dependencyName]
      )
    })

    const version =
      owner?.dependencies?.[dependencyName] ||
      owner?.optionalDependencies?.[dependencyName]

    if (!version) {
      throw new Error(`Runtime dependency ${dependencyName} is not declared in any workspace package.json`)
    }

    dependencyVersions[dependencyName] = version
  }

  return dependencyVersions
}

export async function readRuntimeDependencyManifest(workspaceRoot) {
  const manifestPath = resolve(workspaceRoot, "apps/api/src/generated/runtime-dependencies.json")
  return JSON.parse(await readFile(manifestPath, "utf8"))
}

export async function readWorkspacePackageJsons(workspaceRoot) {
  const packageJsonPaths = [
    resolve(workspaceRoot, "apps/api/package.json"),
    resolve(workspaceRoot, "apps/web/package.json"),
    resolve(workspaceRoot, "packages/database/package.json"),
  ]

  for (const workspaceDir of ["modules", "packages"]) {
    const entries = await readdir(resolve(workspaceRoot, workspaceDir), { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        packageJsonPaths.push(resolve(workspaceRoot, workspaceDir, entry.name, "package.json"))
      }
    }
  }

  const packageJsons = []
  const seen = new Set()
  for (const packageJsonPath of packageJsonPaths) {
    if (seen.has(packageJsonPath)) continue
    seen.add(packageJsonPath)

    try {
      packageJsons.push(JSON.parse(await readFile(packageJsonPath, "utf8")))
    } catch (error) {
      if (error?.code !== "ENOENT") throw error
    }
  }

  return packageJsons
}

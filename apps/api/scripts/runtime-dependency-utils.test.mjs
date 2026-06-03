import assert from "node:assert/strict"
import {
  createRuntimePackageJson,
  resolveDependencyVersions,
} from "./runtime-dependency-utils.mjs"

const workspacePackages = [
  {
    name: "@thunder/api",
    dependencies: {
      hono: "^4.7.9",
      sharp: "^0.34.5",
    },
  },
  {
    name: "@thunder/database",
    dependencies: {
      "@prisma/adapter-neon": "^6.19.0",
      "@prisma/client": "^6.7.0",
    },
  },
]

const versions = resolveDependencyVersions(["sharp"], workspacePackages)
assert.deepEqual(versions, { sharp: "^0.34.5" })

const packageJson = createRuntimePackageJson({
  dependencyVersions: versions,
  packageName: "thunder-desktop-api-runtime",
})

assert.equal(packageJson.name, "thunder-desktop-api-runtime")
assert.deepEqual(packageJson.dependencies, { sharp: "^0.34.5" })

const emptyPackageJson = createRuntimePackageJson({
  dependencyVersions: {},
  packageName: "thunder-desktop-api-runtime",
})

assert.equal(emptyPackageJson.name, "thunder-desktop-api-runtime")
assert.deepEqual(emptyPackageJson.dependencies, {})

import { copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import {
  createRuntimePackageJson,
  readRuntimeDependencyManifest,
  readWorkspacePackageJsons,
  resolveDependencyVersions,
} from "./runtime-dependency-utils.mjs"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const apiRoot = resolve(scriptDir, "..")
const workspaceRoot = resolve(apiRoot, "..", "..")
const runtimeApiDir = resolve(workspaceRoot, "apps", "desktop", "runtime", "api")
const runtimeSqliteClientDir = resolve(workspaceRoot, "apps", "desktop", "runtime", "generated", "sqlite-client")
const outfile = resolve(runtimeApiDir, "server.cjs")
const trustedRuntimeBootstrapSource = resolve(
  workspaceRoot,
  "packages",
  "plugin-host-runtime",
  "src",
  "trusted-process-bootstrap.mjs",
)
const trustedRuntimeBootstrapTarget = resolve(
  runtimeApiDir,
  "trusted-process-bootstrap.mjs",
)

function run(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: workspaceRoot,
      stdio: "inherit",
      shell: process.platform === "win32",
      env: {
        ...process.env,
        CI: "true",
      },
      ...options,
    })

    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }

      rejectPromise(new Error(`${command} ${args.join(" ")} exited with code ${code ?? -1}`))
    })
    child.on("error", rejectPromise)
  })
}

function desktopDatabaseAliasPlugin() {
  const sqliteEntry = resolve(workspaceRoot, "packages", "database", "src", "index.sqlite.ts")

  return {
    name: "desktop-database-alias",
    setup(buildContext) {
      buildContext.onResolve({ filter: /^@thunder\/database$/ }, () => ({
        path: sqliteEntry,
      }))
    },
  }
}

async function copySQLitePrismaRuntimeAssets() {
  const sourceDir = resolve(workspaceRoot, "packages", "database", "src", "generated", "sqlite-client")
  const sourceFiles = await readdir(sourceDir)
  const engineFiles = sourceFiles.filter((fileName) => fileName.includes("query_engine") && fileName.endsWith(".node"))

  if (engineFiles.length === 0) {
    throw new Error(
      "SQLite Prisma query engine is missing. Run pnpm --filter @thunder/database db:generate:sqlite before building desktop."
    )
  }

  await rm(runtimeSqliteClientDir, { recursive: true, force: true })
  await mkdir(runtimeSqliteClientDir, { recursive: true })
  await copyFile(resolve(sourceDir, "schema.prisma"), resolve(runtimeSqliteClientDir, "schema.prisma"))

  for (const engineFile of engineFiles) {
    await copyFile(resolve(sourceDir, engineFile), resolve(runtimeSqliteClientDir, engineFile))
  }
}

await rm(runtimeApiDir, { recursive: true, force: true })
await mkdir(runtimeApiDir, { recursive: true })
await run("node", [resolve(workspaceRoot, "scripts", "generate-enabled-modules.mjs")], {
  env: {
    ...process.env,
    THUNDER_TARGET_PLATFORM: "desktop",
    NEXT_PUBLIC_PLATFORM: "desktop",
  },
})

const runtimeDependencyManifest = await readRuntimeDependencyManifest(workspaceRoot)
if (runtimeDependencyManifest.targetPlatform !== "desktop") {
  throw new Error(`Expected desktop runtime dependency manifest, got ${runtimeDependencyManifest.targetPlatform}`)
}

const runtimeDependencyNames = runtimeDependencyManifest.api.dependencies
const workspacePackageJsons = await readWorkspacePackageJsons(workspaceRoot)
const dependencyVersions = resolveDependencyVersions(runtimeDependencyNames, workspacePackageJsons)

await build({
  entryPoints: [resolve(apiRoot, "src", "index.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  outfile,
  sourcemap: false,
  external: runtimeDependencyNames,
  plugins: [desktopDatabaseAliasPlugin()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
})

await copyFile(trustedRuntimeBootstrapSource, trustedRuntimeBootstrapTarget)

await writeFile(
  resolve(runtimeApiDir, "package.json"),
  `${JSON.stringify(
    createRuntimePackageJson({
      packageName: "thunder-desktop-api-runtime",
      dependencyVersions,
    }),
    null,
    2
  )}\n`,
  "utf8"
)

await copySQLitePrismaRuntimeAssets()

if (runtimeDependencyNames.length > 0) {
  // runtime/api 必须脱离 workspace 单独安装，否则会污染根目录 node_modules。
  await run("npm", ["install", "--omit=dev"], {
    cwd: runtimeApiDir,
  })
}

await run("node", [resolve(scriptDir, "validate-desktop-runtime.mjs")])

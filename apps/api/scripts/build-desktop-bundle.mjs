import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const apiRoot = resolve(scriptDir, "..")
const workspaceRoot = resolve(apiRoot, "..", "..")
const runtimeApiDir = resolve(workspaceRoot, "apps", "desktop", "runtime", "api")
const outfile = resolve(runtimeApiDir, "server.cjs")

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

const apiPackageJson = JSON.parse(await readFile(resolve(apiRoot, "package.json"), "utf8"))
const databasePackageJson = JSON.parse(
  await readFile(resolve(workspaceRoot, "packages", "database", "package.json"), "utf8")
)

await rm(runtimeApiDir, { recursive: true, force: true })
await mkdir(runtimeApiDir, { recursive: true })

await build({
  entryPoints: [resolve(apiRoot, "src", "index.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  outfile,
  sourcemap: false,
  external: ["@prisma/client", "@prisma/adapter-neon", "sharp"],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
})

await writeFile(
  resolve(runtimeApiDir, "package.json"),
  `${JSON.stringify(
    {
      name: "thunder-desktop-api-runtime",
      private: true,
      type: "commonjs",
      dependencies: {
        "@prisma/adapter-neon": databasePackageJson.dependencies["@prisma/adapter-neon"],
        "@prisma/client": databasePackageJson.dependencies["@prisma/client"],
        sharp: apiPackageJson.dependencies.sharp,
      },
    },
    null,
    2
  )}\n`,
  "utf8"
)

// runtime/api 必须脱离 workspace 单独安装，否则会污染根目录 node_modules。
await run("npm", ["install", "--omit=dev"], {
  cwd: runtimeApiDir,
})

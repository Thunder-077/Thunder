import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, join, relative, resolve } from "node:path"
import { build, context, type BuildContext, type BuildOptions } from "esbuild"
import {
  parseThunderPluginManifest,
  type ThunderPluginManifest,
} from "../../../plugin-schema/src/index"

export interface PluginProject {
  rootDir: string
  manifestPath: string
  manifest: ThunderPluginManifest
}

export interface BuildPluginOptions {
  rootDir: string
  watch?: boolean
  clean?: boolean
  log?: (message: string) => void
}

export interface BuildPluginResult {
  project: PluginProject
  outDir: string
  outputs: string[]
  watcher?: {
    stop(): Promise<void>
  }
}

const DEFAULT_DIST_DIR = "dist"
const UI_SOURCE_ENTRY = "src/index.tsx"
const WORKER_SOURCE_ENTRY = "src/worker.ts"
const CLI_ROOT = dirname(fileURLToPath(import.meta.url))
const WORKSPACE_ROOT = resolve(CLI_ROOT, "../../../..")
const WORKSPACE_NODE_MODULES = join(WORKSPACE_ROOT, "node_modules")

const WORKSPACE_IMPORT_ALIASES = new Map<string, string>([
  ["@thunder/plugin-sdk", resolve(WORKSPACE_ROOT, "packages/plugin-sdk/src/index.ts")],
  ["@thunder/plugin-sdk/browser", resolve(WORKSPACE_ROOT, "packages/plugin-sdk/src/browser.ts")],
  ["@thunder/plugin-sdk/worker", resolve(WORKSPACE_ROOT, "packages/plugin-sdk/src/worker.ts")],
  ["@thunder/plugin-sdk-worker", resolve(WORKSPACE_ROOT, "packages/plugin-sdk-worker/src/index.ts")],
  ["@thunder/plugin-schema", resolve(WORKSPACE_ROOT, "packages/plugin-schema/src/index.ts")],
])

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function createUiHtml(pluginName: string, scriptName: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${pluginName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./${scriptName}"></script>
  </body>
</html>
`
}

function normalizeOutputPath(path: string): string {
  return path.replace(/\\/g, "/")
}

function createUiBuildOptions(entryPoint: string, outfile: string): BuildOptions {
  return {
    entryPoints: [entryPoint],
    outfile,
    bundle: true,
    format: "esm",
    platform: "browser",
    jsx: "automatic",
    loader: {
      ".ts": "ts",
      ".tsx": "tsx",
    },
    nodePaths: [WORKSPACE_NODE_MODULES],
    plugins: [createWorkspaceAliasPlugin()],
    sourcemap: true,
    target: "es2020",
  }
}

function createWorkerBuildOptions(entryPoint: string, outfile: string): BuildOptions {
  return {
    entryPoints: [entryPoint],
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    loader: {
      ".ts": "ts",
      ".tsx": "tsx",
    },
    nodePaths: [WORKSPACE_NODE_MODULES],
    plugins: [createWorkspaceAliasPlugin()],
    sourcemap: true,
    target: "node20",
  }
}

function createWorkspaceAliasPlugin() {
  return {
    name: "thunder-workspace-alias",
    setup(pluginBuild: {
      onResolve(
        options: { filter: RegExp },
        callback: (args: { path: string }) => { path: string } | null | undefined,
      ): void
    }) {
      pluginBuild.onResolve({ filter: /^@thunder\/plugin-/ }, (args) => {
        const replacement = WORKSPACE_IMPORT_ALIASES.get(args.path)
        if (!replacement) {
          return null
        }

        return {
          path: replacement,
        }
      })
    },
  }
}

async function loadPluginProject(rootDir: string): Promise<PluginProject> {
  const resolvedRoot = resolve(rootDir)
  const manifestPath = join(resolvedRoot, "plugin.json")
  const manifest = parseThunderPluginManifest(
    JSON.parse(await readFile(manifestPath, "utf8")),
  )

  return {
    rootDir: resolvedRoot,
    manifestPath,
    manifest,
  }
}

async function ensureSourceEntry(
  project: PluginProject,
  relativePath: string,
  reason: string,
): Promise<string> {
  const entryPath = join(project.rootDir, relativePath)
  if (!(await fileExists(entryPath))) {
    throw new Error(`${reason}: missing ${relative(project.rootDir, entryPath)}`)
  }
  return entryPath
}

async function createWatchContext(
  options: BuildOptions,
  label: string,
  log: (message: string) => void,
): Promise<BuildContext> {
  const watcher = await context({
    ...options,
    plugins: [
      {
        name: "thunder-plugin-watch-logger",
        setup(pluginBuild) {
          pluginBuild.onEnd((result) => {
            if (result.errors.length > 0) {
              log(`${label}: build failed`)
              return
            }

            log(`${label}: rebuilt`)
          })
        },
      },
    ],
  })

  await watcher.watch()
  log(`${label}: watching`)
  return watcher
}

export async function buildPlugin(
  options: BuildPluginOptions,
): Promise<BuildPluginResult> {
  const project = await loadPluginProject(options.rootDir)
  const log = options.log ?? console.log
  const outDir = join(project.rootDir, DEFAULT_DIST_DIR)
  const outputs = new Set<string>()
  const watchers: BuildContext[] = []

  if (options.clean !== false) {
    await rm(outDir, { recursive: true, force: true })
  }
  await mkdir(outDir, { recursive: true })

  const sidebarEntry = project.manifest.contributes?.sidebar?.entry
  if (sidebarEntry) {
    const uiSourceEntry = await ensureSourceEntry(
      project,
      UI_SOURCE_ENTRY,
      "sidebar contribution requires a UI entry file",
    )
    const htmlOutfile = join(project.rootDir, sidebarEntry)
    const jsOutfile = join(dirname(htmlOutfile), "index.js")
    await mkdir(dirname(htmlOutfile), { recursive: true })

    const buildOptions = createUiBuildOptions(uiSourceEntry, jsOutfile)
    if (options.watch) {
      watchers.push(await createWatchContext(buildOptions, "UI", log))
    } else {
      await build(buildOptions)
      log("UI: built")
    }

    // Generate the plugin shell page the host will load into the iframe.
    await writeFile(
      htmlOutfile,
      createUiHtml(project.manifest.name, "index.js"),
      "utf8",
    )
    outputs.add(normalizeOutputPath(relative(project.rootDir, htmlOutfile)))
    outputs.add(normalizeOutputPath(relative(project.rootDir, jsOutfile)))
  }

  if (project.manifest.runtime?.entry) {
    const workerSourceEntry = await ensureSourceEntry(
      project,
      WORKER_SOURCE_ENTRY,
      "trusted runtime requires a worker entry file",
    )
    const workerOutfile = join(project.rootDir, project.manifest.runtime.entry)
    await mkdir(dirname(workerOutfile), { recursive: true })

    const buildOptions = createWorkerBuildOptions(workerSourceEntry, workerOutfile)
    if (options.watch) {
      watchers.push(await createWatchContext(buildOptions, "Worker", log))
    } else {
      await build(buildOptions)
      log("Worker: built")
    }

    outputs.add(normalizeOutputPath(relative(project.rootDir, workerOutfile)))
  }

  return {
    project,
    outDir,
    outputs: [...outputs].sort(),
    watcher:
      watchers.length > 0
        ? {
            async stop() {
              await Promise.all(watchers.map((watcher) => watcher.dispose()))
            },
          }
        : undefined,
  }
}

export async function runBuildCommand(rootDir: string): Promise<BuildPluginResult> {
  return buildPlugin({
    rootDir,
    clean: true,
  })
}

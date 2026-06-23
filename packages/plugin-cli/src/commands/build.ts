import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, join, relative, resolve } from "node:path"
import { build, context, type BuildContext, type BuildOptions } from "esbuild"
import { type ThunderPluginManifest } from "@thunder/plugin-schema"
import { findMonorepoRoot, readThunderWorkspacePackages } from "../workspace.js"
import { fileExists, loadPluginProject, type PluginCssBuildConfig, type PluginProject } from "../project.js"

export type { PluginProject }

export interface BuildPluginOptions {
  rootDir: string
  watch?: boolean
  clean?: boolean
  log?: (message: string) => void
}

export type BuildRebuildScope = "ui" | "worker" | "both"

export interface BuildPluginResult {
  project: PluginProject
  outDir: string
  outputs: string[]
  watcher?: {
    stop(): Promise<void>
  }
  /**
   * Register a callback for watch-mode rebuild events. The callback receives
   * the scope of what changed: "ui", "worker", or "both" when both contexts
   * rebuild within a short debounce window.
   */
  onRebuild?: (callback: (scope: BuildRebuildScope) => void) => void
}

const DEFAULT_DIST_DIR = "dist"
const UI_SOURCE_ENTRY = "src/index.tsx"
const WORKER_SOURCE_ENTRY = "src/worker.ts"
const CLI_ROOT = dirname(fileURLToPath(import.meta.url))

function createUiHtml(pluginName: string, scriptName: string, stylesheetName?: string): string {
  const stylesheet = stylesheetName
    ? `    <link rel="stylesheet" href="./${stylesheetName}" />\n`
    : ""
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${pluginName}</title>
${stylesheet}  </head>
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

interface ResolvedBuildContext {
  nodePaths: string[]
  aliasPlugin: ReturnType<typeof createThunderAliasPlugin> | null
  monorepoRoot: string | null
}

/**
 * Resolve the build context for a plugin project. We look for a Thunder
 * monorepo by walking up from the project root, the current working directory,
 * and finally the CLI's own location. The monorepo, if any, contributes:
 *
 *  - An extra `nodePaths` entry so hoisted deps (e.g. react) resolve even when
 *    the plugin project itself has no `node_modules`.
 *  - An esbuild alias plugin that maps `@thunder/plugin-*` imports to the
 *    monorepo's TypeScript sources, so the plugin can be built before
 *    `@thunder/*` packages are installed into its own `node_modules`.
 *
 * When no monorepo is reachable (a fully external plugin project), we return
 * an empty context and rely entirely on esbuild's standard node resolution
 * against the plugin project's own `node_modules`.
 */
async function resolveBuildContext(projectRootDir: string): Promise<ResolvedBuildContext> {
  const projectNodeModules = join(projectRootDir, "node_modules")
  const searchDirs = [projectRootDir, process.cwd(), CLI_ROOT]
  let monorepoRoot: string | null = null
  for (const dir of searchDirs) {
    monorepoRoot = await findMonorepoRoot(dir)
    if (monorepoRoot) {
      break
    }
  }

  const nodePaths: string[] = [projectNodeModules]
  let aliasPlugin: ResolvedBuildContext["aliasPlugin"] = null

  if (monorepoRoot) {
    const monorepoNodeModules = join(monorepoRoot, "node_modules")
    if (monorepoNodeModules !== projectNodeModules) {
      nodePaths.push(monorepoNodeModules)
    }
    const aliases = await readThunderWorkspacePackages(monorepoRoot)
    if (aliases.size > 0) {
      aliasPlugin = createThunderAliasPlugin(aliases)
    }
  }

  return { nodePaths, aliasPlugin, monorepoRoot }
}

function createThunderAliasPlugin(aliases: Map<string, string>) {
  return {
    name: "thunder-package-resolver",
    setup(pluginBuild: {
      onResolve(
        options: { filter: RegExp },
        callback: (args: { path: string }) => { path: string } | null | undefined,
      ): void
    }) {
      pluginBuild.onResolve({ filter: /^@thunder\// }, (args) => {
        const replacement = aliases.get(args.path)
        if (!replacement) {
          return null
        }
        return { path: replacement }
      })
    },
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
  onSuccess?: () => void | Promise<void>,
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
            void Promise.resolve(onSuccess?.()).catch((error: unknown) => {
              log(`${label}: post-build hook failed`)
              if (error instanceof Error) {
                log(error.message)
              }
            })
          })
        },
      },
    ],
  })

  await watcher.watch()
  log(`${label}: watching`)
  return watcher
}

function resolvePluginPath(project: PluginProject, path: string): string {
  return resolve(project.rootDir, path)
}

function toPosixPath(input: string): string {
  return input.replace(/\\/g, "/")
}

function getProjectDefine(project: PluginProject): Record<string, string> {
  return {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "production"),
    ...Object.fromEntries(
      Object.entries(project.build.define ?? {}).map(([key, value]) => [key, JSON.stringify(value)]),
    ),
  }
}

async function buildPluginCss(
  project: PluginProject,
  cssConfig: PluginCssBuildConfig,
  log: (message: string) => void,
): Promise<string> {
  const inputPath = resolvePluginPath(project, cssConfig.input)
  const outputPath = resolvePluginPath(project, cssConfig.output ?? "dist/index.css")
  const [postcssModule, tailwindModule] = await Promise.all([
    import("postcss"),
    import("@tailwindcss/postcss"),
  ])
  const rawCss = await readFile(inputPath, "utf8")
  const inputDir = dirname(inputPath)
  // Tailwind v4 only emits classes it can discover from explicit sources when
  // the plugin builds outside the Next.js app, so official plugins can list
  // their shared UI packages here.
  const sourceDirectives = (cssConfig.sources ?? ["src"]).map((source) => {
    const sourcePath = resolvePluginPath(project, source)
    const relativePath = relative(inputDir, sourcePath)
    return `@source "${toPosixPath(relativePath)}/**/*.{ts,tsx,js,jsx}";`
  })
  const cssContent = rawCss.includes('@import "tailwindcss";')
    ? rawCss.replace('@import "tailwindcss";', `@import "tailwindcss";\n${sourceDirectives.join("\n")}`)
    : `${sourceDirectives.join("\n")}\n${rawCss}`

  await mkdir(dirname(outputPath), { recursive: true })
  const processedCss = await postcssModule.default([tailwindModule.default()]).process(cssContent, {
    from: inputPath,
    to: outputPath,
    map: false,
  })
  await writeFile(outputPath, processedCss.css, "utf8")
  log("CSS: built")
  return normalizeOutputPath(relative(project.rootDir, outputPath))
}

const SCOPE_MERGE_DELAY_MS = 200

interface RebuildEmitter {
  emit(scope: "ui" | "worker"): void
  onRebuild(callback: (scope: BuildRebuildScope) => void): void
}

function createRebuildEmitter(): RebuildEmitter {
  const callbacks: Array<(scope: BuildRebuildScope) => void> = []
  const pendingScopes = new Set<"ui" | "worker">()
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  return {
    emit(scope: "ui" | "worker") {
      pendingScopes.add(scope)
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        const merged: BuildRebuildScope = pendingScopes.size === 2 ? "both" : [...pendingScopes][0]
        pendingScopes.clear()
        debounceTimer = null
        for (const cb of callbacks) {
          try { cb(merged) } catch { /* ignore callback errors */ }
        }
      }, SCOPE_MERGE_DELAY_MS)
    },
    onRebuild(callback) {
      callbacks.push(callback)
    },
  }
}

export async function buildPlugin(
  options: BuildPluginOptions,
): Promise<BuildPluginResult> {
  const project = await loadPluginProject(options.rootDir)
  const log = options.log ?? console.log
  const outDir = join(project.rootDir, DEFAULT_DIST_DIR)
  const outputs = new Set<string>()
  const watchers: BuildContext[] = []
  const buildContext = await resolveBuildContext(project.rootDir)
  const rebuildEmitter = options.watch ? createRebuildEmitter() : null
  const define = getProjectDefine(project)

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
    const cssConfig = project.build.css
    const cssOutput = cssConfig?.output
      ? normalizeOutputPath(relative(dirname(htmlOutfile), resolvePluginPath(project, cssConfig.output)))
      : cssConfig
        ? "index.css"
        : undefined
    await mkdir(dirname(htmlOutfile), { recursive: true })

    const buildOptions = createUiBuildOptions(uiSourceEntry, jsOutfile, buildContext, define)
    const buildCss = async () => {
      if (!cssConfig) return
      const output = await buildPluginCss(project, cssConfig, log)
      outputs.add(output)
    }
    if (options.watch) {
      watchers.push(await createWatchContext(buildOptions, "UI", log, async () => {
        await buildCss()
        rebuildEmitter?.emit("ui")
      }))
    } else {
      await build(buildOptions)
      await buildCss()
      log("UI: built")
    }

    // Generate the plugin shell page the host will load into the iframe.
    await writeFile(
      htmlOutfile,
      createUiHtml(project.manifest.name, "index.js", cssOutput),
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

    const buildOptions = createWorkerBuildOptions(workerSourceEntry, workerOutfile, buildContext, define)
    if (options.watch) {
      watchers.push(await createWatchContext(buildOptions, "Worker", log, () => rebuildEmitter?.emit("worker")))
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
    onRebuild: rebuildEmitter ? (cb) => rebuildEmitter.onRebuild(cb) : undefined,
  }
}

function createUiBuildOptions(
  entryPoint: string,
  outfile: string,
  buildContext: ResolvedBuildContext,
  define: Record<string, string>,
): BuildOptions {
  const plugins = buildContext.aliasPlugin ? [buildContext.aliasPlugin] : []
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
    nodePaths: buildContext.nodePaths,
    plugins,
    define,
    sourcemap: true,
    target: "es2020",
  }
}

function createWorkerBuildOptions(
  entryPoint: string,
  outfile: string,
  buildContext: ResolvedBuildContext,
  define: Record<string, string>,
): BuildOptions {
  const plugins = buildContext.aliasPlugin ? [buildContext.aliasPlugin] : []
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
    nodePaths: buildContext.nodePaths,
    plugins,
    define,
    sourcemap: true,
    target: "node20",
  }
}

export async function runBuildCommand(rootDir: string): Promise<BuildPluginResult> {
  return buildPlugin({
    rootDir,
    clean: true,
  })
}

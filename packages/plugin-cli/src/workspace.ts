import { readdir } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileExists } from "./project"

/**
 * Walk up from `startDir` looking for a pnpm-workspace.yaml marker. Returns the
 * directory containing it (the monorepo root) or null if not found. Used to
 * detect whether the CLI is running inside a Thunder monorepo so it can fall
 * back to workspace sources for `@thunder/*` packages when the plugin project
 * hasn't `pnpm install`-ed them yet.
 */
export async function findMonorepoRoot(startDir: string): Promise<string | null> {
  let current = resolve(startDir)
  const seen = new Set<string>()
  while (!seen.has(current)) {
    seen.add(current)
    if (await fileExists(join(current, "pnpm-workspace.yaml"))) {
      return current
    }
    const parent = dirname(current)
    if (parent === current) {
      return null
    }
    current = parent
  }
  return null
}

/**
 * Discover `@thunder/plugin-*` package entry points from a Thunder monorepo's
 * `packages/` directory. Returns a map of bare specifier -> absolute src path
 * suitable for use as an esbuild resolve alias.
 *
 * Subpath entries that don't follow the `<pkg>/src/index.ts` convention (e.g.
 * `@thunder/plugin-sdk/browser`) are listed explicitly; the SDK currently has
 * two such subpaths and we keep this list flat until a third package needs the
 * same treatment.
 */
export async function readThunderWorkspacePackages(
  monorepoRoot: string,
): Promise<Map<string, string>> {
  const aliases = new Map<string, string>()
  const packagesDir = join(monorepoRoot, "packages")
  const entries = await readdir(packagesDir, { withFileTypes: true }).catch(() => [])

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (!entry.name.startsWith("plugin-")) continue
    const packageName = `@thunder/${entry.name}`
    const srcEntry = join(packagesDir, entry.name, "src", "index.ts")
    if (await fileExists(srcEntry)) {
      aliases.set(packageName, srcEntry)
    }
  }

  const subpathMap: Record<string, { pkg: string; file: string }> = {
    "@thunder/plugin-sdk/browser": { pkg: "plugin-sdk", file: "browser.ts" },
    "@thunder/plugin-sdk/worker": { pkg: "plugin-sdk", file: "worker.ts" },
  }
  for (const [name, { pkg, file }] of Object.entries(subpathMap)) {
    const srcEntry = join(packagesDir, pkg, "src", file)
    if (await fileExists(srcEntry)) {
      aliases.set(name, srcEntry)
    }
  }

  return aliases
}

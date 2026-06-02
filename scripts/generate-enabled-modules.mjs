import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = resolve(scriptDir, "..")

const modules = [
  {
    id: "vault",
    name: "密钥管家",
    description: "加密密码管理模块",
    icon: "Lock",
    route: "/modules/vault",
    category: "security",
    order: 1,
    enabled: true,
    webPageImport: "@/modules/vault/page",
    apiRoutes: [
      {
        route: "/api/v1/vault",
        importPath: "../modules/vault/vault-routes",
        exportName: "vault",
      },
    ],
  },
  {
    id: "emby",
    name: "Emby",
    description: "Emby 影视模块",
    icon: "Film",
    route: "/modules/emby",
    category: "tools",
    order: 2,
    enabled: true,
    platforms: ["web"],
    webPageImport: "@/modules/emby/page",
    apiRoutes: [
      {
        route: "/api/v1/emby",
        importPath: "../modules/emby/emby-routes",
        exportName: "emby",
      },
      {
        route: "/server/emby",
        importPath: "../modules/emby/emby-routes",
        exportName: "serverEmby",
      },
    ],
    scheduledTasks: [
      {
        importPath: "../modules/emby/emby-routes",
        exportName: "refreshEnabledPlaylistCaches",
      },
    ],
  },
  {
    id: "teleprompter",
    name: "提词器",
    description: "大字提词、语音跟读与自动定位",
    icon: "ScrollText",
    route: "/modules/teleprompter",
    category: "productivity",
    order: 3,
    enabled: true,
    platforms: ["web"],
    webPageImport: "@/modules/teleprompter/page",
  },
]

const args = process.argv.slice(2)

function readArgValue(name) {
  const prefix = `${name}=`
  const inline = args.find((arg) => arg.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)

  const index = args.indexOf(name)
  if (index >= 0 && args[index + 1]) return args[index + 1]
  return undefined
}

function resolveTargetPlatform() {
  const argTarget = readArgValue("--target") || readArgValue("--platform")
  return normalizePlatform(argTarget || process.env.THUNDER_TARGET_PLATFORM || process.env.NEXT_PUBLIC_PLATFORM || "web")
}

function normalizePlatform(value) {
  if (value === "desktop") return "desktop"
  return "web"
}

function resolveExcludedModuleIds() {
  const raw =
    readArgValue("--exclude") ||
    readArgValue("--exclude-modules") ||
    process.env.THUNDER_EXCLUDE_MODULES ||
    process.env.EXCLUDE_MODULES ||
    process.env.NEXT_PUBLIC_EXCLUDE_MODULES ||
    ""

  return new Set(
    raw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  )
}

function getEnabledModules() {
  const targetPlatform = resolveTargetPlatform()
  const excludedModuleIds = resolveExcludedModuleIds()
  return modules.filter((module) => {
    if (!module.enabled) return false
    if (excludedModuleIds.has(module.id)) return false
    return !module.platforms || module.platforms.includes(targetPlatform)
  })
}

function toManifest(module) {
  const manifest = {
    id: module.id,
    name: module.name,
    description: module.description,
    icon: module.icon,
    route: module.route,
    category: module.category,
    order: module.order,
    enabled: module.enabled,
  }

  if (module.platforms) {
    manifest.platforms = module.platforms
  }

  return manifest
}

async function writeWebGenerated(enabledModules) {
  const outputPath = resolve(workspaceRoot, "apps/web/src/generated/enabled-modules.ts")
  await mkdir(dirname(outputPath), { recursive: true })

  const loaderEntries = enabledModules
    .map((module) => `  ${JSON.stringify(module.id)}: () => import(${JSON.stringify(module.webPageImport)}),`)
    .join("\n")
  const publicServerPrefixes = enabledModules.flatMap((module) =>
    (module.apiRoutes ?? [])
      .filter((route) => route.route.startsWith("/server/"))
      .map((route) => route.route)
  )

  const content = `import type { ModuleManifest } from "@thunder/core"

export const enabledModules = ${JSON.stringify(enabledModules.map(toManifest), null, 2)} as ModuleManifest[]

export const enabledModuleIds = enabledModules.map((module) => module.id)

export const publicServerPrefixes = ${JSON.stringify(publicServerPrefixes, null, 2)} as string[]

export const moduleLoaders = {
${loaderEntries}
} as const

export type EnabledModuleId = keyof typeof moduleLoaders
`

  await writeFile(outputPath, content, "utf8")
}

async function writeApiGenerated(enabledModules) {
  const outputPath = resolve(workspaceRoot, "apps/api/src/generated/enabled-routes.ts")
  await mkdir(dirname(outputPath), { recursive: true })

  const routeImports = []
  const routeRegistrations = []
  const scheduledImports = []
  const scheduledCalls = []
  let importIndex = 0

  for (const module of enabledModules) {
    for (const route of module.apiRoutes ?? []) {
      const localName = `${route.exportName}${importIndex++}`
      routeImports.push(`import { ${route.exportName} as ${localName} } from ${JSON.stringify(route.importPath)}`)
      routeRegistrations.push(`  app.route(${JSON.stringify(route.route)}, ${localName})`)
    }

    for (const task of module.scheduledTasks ?? []) {
      const localName = `${task.exportName}${importIndex++}`
      scheduledImports.push(`import { ${task.exportName} as ${localName} } from ${JSON.stringify(task.importPath)}`)
      scheduledCalls.push(`  await ${localName}()`)
    }
  }

  const content = `import type { Hono } from "hono"
${routeImports.join("\n")}
${scheduledImports.join("\n")}

export function registerEnabledModuleRoutes(app: Hono<any>): void {
${routeRegistrations.join("\n") || "  void app"}
}

export async function runEnabledScheduledTasks(): Promise<void> {
${scheduledCalls.join("\n") || "  return"}
}
`

  await writeFile(outputPath, content, "utf8")
}

const enabledModules = getEnabledModules()
await writeWebGenerated(enabledModules)
await writeApiGenerated(enabledModules)

console.log(
  `[modules] target=${resolveTargetPlatform()} enabled=${enabledModules.map((module) => module.id).join(",") || "(none)"}`
)

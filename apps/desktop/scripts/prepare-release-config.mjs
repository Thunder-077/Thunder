import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { loadDesktopEnv } from "./desktop-env.mjs"

const desktopRoot = resolve(import.meta.dirname, "..")
const tauriConfigPath = resolve(desktopRoot, "src-tauri", "tauri.conf.json")
const releaseConfigPath = resolve(desktopRoot, "src-tauri", "tauri.release.conf.json")
const webPort = Number(process.env.THUNDER_DESKTOP_WEB_PORT ?? "43100")

function requireEnv(name) {
  const value = process.env[name]?.trim()

  if (!value) {
    throw new Error(`缺少环境变量 ${name}`)
  }

  return value
}

function assertHttpsUrl(value, fieldName) {
  const url = new URL(value)

  if (url.protocol !== "https:") {
    throw new Error(`${fieldName} 必须使用 https`)
  }

  return url.toString()
}

function splitList(value) {
  return (value ?? "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function unique(values) {
  return [...new Set(values)]
}

function resolveUpdaterEndpoints(primaryEndpoint) {
  const explicitEndpoints = splitList(process.env.THUNDER_DESKTOP_UPDATER_ENDPOINTS)
  if (explicitEndpoints.length > 0) {
    return unique(
      explicitEndpoints.map((endpoint, index) =>
        assertHttpsUrl(endpoint, `THUNDER_DESKTOP_UPDATER_ENDPOINTS[${index}]`)
      )
    )
  }

  return [primaryEndpoint]
}

function resolveBundleTargets() {
  const rawTargets = process.env.THUNDER_DESKTOP_BUNDLE_TARGETS?.trim()
  if (rawTargets) {
    return rawTargets
      .split(",")
      .map((target) => target.trim())
      .filter(Boolean)
  }

  return process.platform === "win32" ? ["nsis"] : undefined
}

function shouldCreateUpdaterArtifacts() {
  return process.env.THUNDER_DESKTOP_UPDATER_ARTIFACTS === "true"
}

await loadDesktopEnv()

const updaterEndpoint = assertHttpsUrl(
  requireEnv("THUNDER_DESKTOP_UPDATER_ENDPOINT"),
  "THUNDER_DESKTOP_UPDATER_ENDPOINT"
)
const updaterEndpoints = resolveUpdaterEndpoints(updaterEndpoint)
const updaterPubkey = requireEnv("TAURI_SIGNING_PUBLIC_KEY")

const rawConfig = await readFile(tauriConfigPath, "utf8")
const config = JSON.parse(rawConfig)

config.build.frontendDist = `http://127.0.0.1:${webPort}`
config.build.beforeBuildCommand = "node ./scripts/build-local-runtime.mjs"

config.bundle = {
  ...config.bundle,
  targets: resolveBundleTargets() ?? config.bundle?.targets,
  createUpdaterArtifacts: shouldCreateUpdaterArtifacts(),
  resources: ["../runtime/**/*"],
}

config.plugins = {
  ...(config.plugins ?? {}),
  updater: {
    pubkey: updaterPubkey,
    endpoints: updaterEndpoints,
  },
}

await writeFile(releaseConfigPath, `${JSON.stringify(config, null, 2)}\n`, "utf8")

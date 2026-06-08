import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import postcss from "postcss"
import tailwindcss from "@tailwindcss/postcss"
import { build } from "esbuild"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(scriptDir, "..")
const workspaceRoot = resolve(webRoot, "..", "..")
const pluginRoot = resolve(workspaceRoot, "plugins", "desktop", "teleprompter")
const webOutDir = resolve(pluginRoot, "dist")
const assetsOutDir = resolve(webOutDir, "assets")
const entryPoint = resolve(pluginRoot, "src", "index.tsx")
const workerEntryPoint = resolve(pluginRoot, "src", "worker.ts")
const cssOutput = resolve(assetsOutDir, "main.css")
const globalsCss = resolve(webRoot, "src", "app", "globals.css")
const pluginUiRoot = resolve(workspaceRoot, "packages", "plugin-ui", "src")
const teleprompterUiRoot = resolve(workspaceRoot, "packages", "teleprompter-ui", "src")
const teleprompterCoreRoot = resolve(workspaceRoot, "packages", "teleprompter-core", "src")
const webNodeModules = resolve(webRoot, "node_modules")
const reactRoot = resolve(webNodeModules, "react")
const reactDomRoot = resolve(webNodeModules, "react-dom")

await rm(webOutDir, { recursive: true, force: true })
await mkdir(assetsOutDir, { recursive: true })

await build({
  entryPoints: [entryPoint],
  bundle: true,
  platform: "browser",
  format: "iife",
  target: ["es2020"],
  outfile: resolve(assetsOutDir, "main.js"),
  absWorkingDir: webRoot,
  nodePaths: [resolve(webRoot, "node_modules"), resolve(workspaceRoot, "node_modules")],
  sourcemap: false,
  minify: process.env.NODE_ENV === "production",
  loader: {
    ".wasm": "file",
  },
  alias: {
    // Pin React-related imports to one canonical path so esbuild does not bundle
    // duplicate React copies through mixed pnpm junction and workspace paths.
    react: reactRoot,
    "react/jsx-runtime": resolve(reactRoot, "jsx-runtime.js"),
    "react/jsx-dev-runtime": resolve(reactRoot, "jsx-dev-runtime.js"),
    "react-dom": reactDomRoot,
    "react-dom/client": resolve(reactDomRoot, "client.js"),
    "@": resolve(webRoot, "src"),
    // Desktop plugins can keep Thunder's visual language through a stable UI package
    // without importing the web app's internal component implementations.
    "@/components/ui/badge": resolve(pluginUiRoot, "badge.tsx"),
    "@/components/ui/button": resolve(pluginUiRoot, "button.tsx"),
    "@/components/ui/card": resolve(pluginUiRoot, "card.tsx"),
    "@/components/ui/dialog": resolve(pluginUiRoot, "dialog.tsx"),
    "@/components/ui/separator": resolve(pluginUiRoot, "separator.tsx"),
    "@/components/ui/select": resolve(pluginUiRoot, "select.tsx"),
    "@/components/ui/switch": resolve(pluginUiRoot, "switch.tsx"),
    "@thunder/plugin-sdk/browser": resolve(workspaceRoot, "packages", "plugin-sdk", "src", "browser.ts"),
    "@thunder/teleprompter-ui": resolve(teleprompterUiRoot, "index.ts"),
    "@thunder/teleprompter-core": resolve(teleprompterCoreRoot, "index.ts"),
    "@thunder/teleprompter-core/speech-types": resolve(teleprompterCoreRoot, "speech-types.ts"),
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "production"),
    "process.env.NEXT_PUBLIC_PLATFORM": JSON.stringify("desktop"),
  },
})

const rawCss = await readFile(globalsCss, "utf8")
const processedCss = await postcss([tailwindcss()]).process(rawCss, {
  from: globalsCss,
  to: cssOutput,
})
await writeFile(cssOutput, processedCss.css, "utf8")

await build({
  entryPoints: [workerEntryPoint],
  outfile: resolve(webOutDir, "worker.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: ["node20"],
  absWorkingDir: webRoot,
  nodePaths: [resolve(webRoot, "node_modules"), resolve(workspaceRoot, "node_modules")],
  sourcemap: false,
  minify: process.env.NODE_ENV === "production",
  alias: {
    "@thunder/plugin-sdk/worker": resolve(workspaceRoot, "packages", "plugin-sdk", "src", "worker.ts"),
    "@thunder/plugin-sdk-worker": resolve(workspaceRoot, "packages", "plugin-sdk-worker", "src", "index.ts"),
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "production"),
    "process.env.NEXT_PUBLIC_PLATFORM": JSON.stringify("desktop"),
  },
})

await writeFile(
  resolve(webOutDir, "index.html"),
  `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>提词器</title>
    <link rel="stylesheet" href="./assets/main.css" />
  </head>
  <body>
    <div id="root"></div>
    <script defer src="./assets/main.js"></script>
  </body>
</html>
`,
  "utf8"
)

console.log(`[teleprompter-plugin] built ${webOutDir}`)

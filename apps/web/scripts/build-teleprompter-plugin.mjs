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
const webOutDir = resolve(pluginRoot, "web")
const assetsOutDir = resolve(webOutDir, "assets")
const entryPoint = resolve(pluginRoot, "src", "main.tsx")
const cssOutput = resolve(assetsOutDir, "main.css")
const globalsCss = resolve(webRoot, "src", "app", "globals.css")
const pluginCss = resolve(pluginRoot, "src", "plugin.css")

await rm(webOutDir, { recursive: true, force: true })
await mkdir(assetsOutDir, { recursive: true })

await build({
  entryPoints: [entryPoint],
  bundle: true,
  platform: "browser",
  format: "esm",
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
    "@": resolve(webRoot, "src"),
    "@/components/page-header": resolve(pluginRoot, "src", "shims", "page-header.tsx"),
    "@/components/ui/select": resolve(pluginRoot, "src", "shims", "select.tsx"),
    "@/lib/notification-store": resolve(pluginRoot, "src", "shims", "notification-store.ts"),
    "@/lib/platform": resolve(pluginRoot, "src", "shims", "platform.ts"),
    "@thunder/plugin-sdk/browser": resolve(workspaceRoot, "packages", "plugin-sdk", "src", "browser.ts"),
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "production"),
    "process.env.NEXT_PUBLIC_PLATFORM": JSON.stringify("desktop"),
  },
})

const rawCss = `${await readFile(globalsCss, "utf8")}\n${await readFile(pluginCss, "utf8")}`
const processedCss = await postcss([tailwindcss()]).process(rawCss, {
  from: globalsCss,
  to: cssOutput,
})
await writeFile(cssOutput, processedCss.css, "utf8")

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

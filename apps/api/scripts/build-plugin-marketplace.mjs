import { createPrivateKey, sign } from "node:crypto"
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

const args = process.argv.slice(2)

function readArg(name) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

const entriesDir = readArg("--entries") ?? "dist/desktop-plugins"
const outPath = readArg("--out") ?? "dist/desktop-plugins/index.json"
const privateKeyPath = readArg("--private-key") || process.env.THUNDER_PLUGIN_MARKETPLACE_SIGNING_PRIVATE_KEY
const keyId = readArg("--key-id") || process.env.THUNDER_PLUGIN_MARKETPLACE_SIGNING_KEY_ID

const entryRoot = resolve(entriesDir)
const files = await readdir(entryRoot).catch(() => [])
const plugins = []

for (const file of files) {
  if (!file.endsWith(".marketplace-entry.json")) continue
  const entry = JSON.parse(await readFile(resolve(entryRoot, file), "utf8"))
  plugins.push(entry)
}

plugins.sort((a, b) => String(a.id).localeCompare(String(b.id)) || String(a.version).localeCompare(String(b.version)))

const index = {
  version: 1,
  generatedAt: new Date().toISOString(),
  plugins,
}

if (privateKeyPath && keyId) {
  const privateKey = createPrivateKey(await readFile(resolve(privateKeyPath), "utf8"))
  index.signature = {
    keyId,
    algorithm: "ed25519",
    signature: sign(null, Buffer.from(stableJson(index)), privateKey).toString("base64"),
  }
}

await mkdir(resolve(outPath, ".."), { recursive: true })
await writeFile(resolve(outPath), `${JSON.stringify(index, null, 2)}\n`, "utf8")

console.log(JSON.stringify({ outPath: resolve(outPath), plugins: plugins.length, signed: Boolean(index.signature) }, null, 2))

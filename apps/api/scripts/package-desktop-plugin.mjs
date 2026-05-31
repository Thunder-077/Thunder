import { createHash, createPrivateKey, sign } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { basename, resolve } from "node:path"
import { c as createTar } from "tar"

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

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex")
}

const pluginDir = readArg("--plugin")
const outDir = readArg("--out") ?? "dist/desktop-plugins"
const privateKeyPath = readArg("--private-key") || process.env.THUNDER_PLUGIN_SIGNING_PRIVATE_KEY
const keyId = readArg("--key-id") || process.env.THUNDER_PLUGIN_SIGNING_KEY_ID
const baseUrl = readArg("--base-url") || process.env.THUNDER_PLUGIN_PACKAGE_BASE_URL || ""

if (!pluginDir || !privateKeyPath || !keyId) {
  throw new Error(
    "Usage: pnpm --filter @thunder/api package:desktop-plugin -- --plugin <dir> --private-key <pem> --key-id <id> [--out <dir>] [--base-url <url>]"
  )
}

const sourceDir = resolve(pluginDir)
const outputDir = resolve(outDir)
await mkdir(outputDir, { recursive: true })

const manifest = JSON.parse(await readFile(resolve(sourceDir, "plugin.json"), "utf8"))
const privateKey = createPrivateKey(await readFile(resolve(privateKeyPath), "utf8"))
const signature = sign(null, Buffer.from(stableJson(manifest)), privateKey).toString("base64")
const packageName = `${manifest.id}-${manifest.version}.tar.gz`
const packagePath = resolve(outputDir, packageName)

await createTar(
  {
    gzip: true,
    file: packagePath,
    cwd: resolve(sourceDir, ".."),
  },
  [basename(sourceDir)]
)

const packageSha256 = sha256(await readFile(packagePath))
const packageUrl = baseUrl ? new URL(packageName, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString() : packageName
const entry = {
  id: manifest.id,
  name: manifest.name,
  version: manifest.version,
  description: manifest.description,
  icon: manifest.icon,
  category: manifest.category,
  author: manifest.author,
  permissions: manifest.permissions,
  packageUrl,
  packageSha256,
  signature: {
    keyId,
    algorithm: "ed25519",
    signature,
  },
}

await writeFile(resolve(outputDir, `${manifest.id}-${manifest.version}.marketplace-entry.json`), `${JSON.stringify(entry, null, 2)}\n`, "utf8")

console.log(JSON.stringify({ packagePath, packageSha256, entry }, null, 2))

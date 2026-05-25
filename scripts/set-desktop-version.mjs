import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

const nextVersion = process.argv[2]?.trim()

if (!nextVersion) {
  console.error("用法: pnpm version:set <version>")
  process.exit(1)
}

const files = [
  {
    path: resolve("apps/desktop/package.json"),
    update: (content) => {
      const json = JSON.parse(content)
      json.version = nextVersion
      return `${JSON.stringify(json, null, 2)}\n`
    },
  },
  {
    path: resolve("apps/desktop/src-tauri/Cargo.toml"),
    update: (content) => content.replace(/^version = ".*"$/m, `version = "${nextVersion}"`),
  },
  {
    path: resolve("apps/desktop/src-tauri/tauri.conf.json"),
    update: (content) => {
      const json = JSON.parse(content)
      json.version = nextVersion
      return `${JSON.stringify(json, null, 2)}\n`
    },
  },
]

for (const file of files) {
  const original = await readFile(file.path, "utf8")
  const updated = file.update(original)
  await writeFile(file.path, updated, "utf8")
}

console.log(`Thunder desktop version set to ${nextVersion}`)

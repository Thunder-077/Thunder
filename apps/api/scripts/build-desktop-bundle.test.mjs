import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

const script = await readFile(resolve(import.meta.dirname, "build-desktop-bundle.mjs"), "utf8")

assert.ok(script.includes("readRuntimeDependencyManifest"), "desktop bundle must read target runtime dependency manifest")
assert.ok(script.includes("index.sqlite.ts"), "desktop bundle must alias @thunder/database to the SQLite entry")
assert.ok(!script.includes("apiPackageJson.dependencies.sharp"), "desktop bundle must not hard-code sharp")
assert.ok(!script.includes("\"@prisma/adapter-neon\""), "desktop bundle must not hard-code Neon adapter")

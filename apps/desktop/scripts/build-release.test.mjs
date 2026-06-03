import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

const source = await readFile(resolve(import.meta.dirname, "build-release.mjs"), "utf8")

assert.ok(source.includes("cleanReleaseStaging"), "release build should clean Tauri bundle staging before packaging")

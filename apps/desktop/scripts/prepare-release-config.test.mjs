import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

const source = await readFile(resolve(import.meta.dirname, "prepare-release-config.mjs"), "utf8")

assert.ok(source.includes("THUNDER_DESKTOP_BUNDLE_TARGETS"), "release config should allow selecting installer targets")
assert.ok(source.includes("THUNDER_DESKTOP_UPDATER_ARTIFACTS"), "release config should make updater artifacts opt-in")
assert.ok(source.includes("nsis"), "Windows desktop release should default to a single NSIS installer")

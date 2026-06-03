import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

const source = await readFile(resolve(import.meta.dirname, "db-init.ts"), "utf8")

assert.ok(
  source.includes("runtime/generated/sqlite-client") || source.includes("..', 'generated', 'sqlite-client"),
  "db-init should search the packaged runtime/generated/sqlite-client directory for Prisma's SQLite query engine"
)

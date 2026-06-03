import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

const databaseSrc = resolve(import.meta.dirname)

const sqliteClient = await readFile(resolve(databaseSrc, "client.sqlite.ts"), "utf8")
const postgresClient = await readFile(resolve(databaseSrc, "client.postgres.ts"), "utf8")
const sqliteIndex = await readFile(resolve(databaseSrc, "index.sqlite.ts"), "utf8")

assert.ok(sqliteClient.includes("./generated/sqlite-client"), "SQLite client must use the generated SQLite Prisma client")
assert.ok(!sqliteClient.includes("@prisma/adapter-neon"), "SQLite client must not import Neon adapter")
assert.ok(!sqliteClient.includes("from \"@prisma/client\""), "SQLite client must not import the PostgreSQL Prisma client")

assert.ok(postgresClient.includes("@prisma/adapter-neon"), "Postgres client should own the Neon adapter import")
assert.ok(sqliteIndex.includes("./client.sqlite"), "Desktop alias should resolve to the SQLite client")

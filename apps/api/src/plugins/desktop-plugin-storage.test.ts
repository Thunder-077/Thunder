import { mkdir, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import assert from "node:assert/strict"
import {
  clearPluginStorage,
  closeAllStorageConnections,
  getPluginStorage,
  listPluginStorageKeys,
  removePluginStorage,
  setPluginStorage,
} from "./desktop-plugin-storage"

/**
 * Standalone test for desktop-plugin-storage module.
 *
 * Exercises key normalization, CRUD operations, size limits, total quota
 * tracking, and clear behaviour. Uses an isolated temp directory that is
 * cleaned up on exit.
 */

const TEST_PLUGIN_ID = "storage-test"

async function createTestEnvironment(): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const workspaceRoot = resolve(process.cwd(), "..", "..")
  const testRoot = resolve(workspaceRoot, ".thunder-plugin-storage-test")

  await rm(testRoot, { recursive: true, force: true })
  await mkdir(testRoot, { recursive: true })

  process.env.THUNDER_ENABLE_DESKTOP_PLUGINS = "1"
  process.env.THUNDER_DESKTOP_DATA_DIR = testRoot

  // Create a minimal installed plugin so assertInstalledPluginPermission passes.
  const pluginRoot = join(testRoot, "plugins", TEST_PLUGIN_ID)
  await mkdir(pluginRoot, { recursive: true })
  await writeFile(
    join(pluginRoot, "plugin.json"),
    JSON.stringify({
      manifestVersion: 2,
      id: TEST_PLUGIN_ID,
      name: "Storage Test Plugin",
      version: "1.0.0",
      kind: "sandboxed",
      engines: { thunder: "^2.0.0" },
      permissions: ["storage"],
      contributes: {
        sidebar: {
          title: "Storage Test",
          entry: "dist/index.html",
        },
      },
    }),
  )
  // Create a dummy UI entry so manifest validation passes.
  const distDir = join(pluginRoot, "dist")
  await mkdir(distDir, { recursive: true })
  await writeFile(join(distDir, "index.html"), "<html></html>")

  // Ensure plugin-data directory exists.
  await mkdir(join(testRoot, "plugin-data"), { recursive: true })

  return {
    root: testRoot,
    cleanup: () => rm(testRoot, { recursive: true, force: true }),
  }
}

async function main() {
  const env = await createTestEnvironment()

  try {
    // ---- Test 1: basic set/get round-trip ----
    await setPluginStorage(TEST_PLUGIN_ID, "greeting", "hello")
    const value = await getPluginStorage(TEST_PLUGIN_ID, "greeting")
    assert.equal(value, "hello", "basic set/get should round-trip a string")

    // ---- Test 2: get returns null for missing keys ----
    const missing = await getPluginStorage(TEST_PLUGIN_ID, "nonexistent")
    assert.equal(missing, null, "missing key should return null")

    // ---- Test 3: key normalization consistency ----
    // set with whitespace-padded key, then get with the same raw key.
    // Both should normalize to the same key so the round-trip succeeds.
    await setPluginStorage(TEST_PLUGIN_ID, "  spaced-key  ", { x: 1 })
    const spacedGet = await getPluginStorage(TEST_PLUGIN_ID, "  spaced-key  ")
    assert.deepEqual(spacedGet, { x: 1 }, "get should normalize key the same way as set")

    // Get with the already-trimmed key should also work.
    const trimmedGet = await getPluginStorage(TEST_PLUGIN_ID, "spaced-key")
    assert.deepEqual(trimmedGet, { x: 1 }, "get with trimmed key should find the value set with padded key")

    // ---- Test 4: overwrite existing key ----
    await setPluginStorage(TEST_PLUGIN_ID, "greeting", "world")
    assert.equal(await getPluginStorage(TEST_PLUGIN_ID, "greeting"), "world", "overwrite should update the value")

    // ---- Test 5: structured data ----
    const complex = { nested: { arr: [1, 2, 3], flag: true }, empty: null }
    await setPluginStorage(TEST_PLUGIN_ID, "complex", complex)
    assert.deepEqual(await getPluginStorage(TEST_PLUGIN_ID, "complex"), complex, "structured data should round-trip")

    // ---- Test 6: remove ----
    await removePluginStorage(TEST_PLUGIN_ID, "greeting")
    assert.equal(await getPluginStorage(TEST_PLUGIN_ID, "greeting"), null, "removed key should return null")

    // Removing a non-existent key should not throw.
    await removePluginStorage(TEST_PLUGIN_ID, "nonexistent")

    // ---- Test 7: remove with key normalization ----
    await setPluginStorage(TEST_PLUGIN_ID, "to-remove", 42)
    await removePluginStorage(TEST_PLUGIN_ID, "  to-remove  ")
    assert.equal(await getPluginStorage(TEST_PLUGIN_ID, "to-remove"), null, "remove should normalize key")

    // ---- Test 8: list keys ----
    // Clear first, then insert known keys.
    await clearPluginStorage(TEST_PLUGIN_ID)
    await setPluginStorage(TEST_PLUGIN_ID, "beta", 2)
    await setPluginStorage(TEST_PLUGIN_ID, "alpha", 1)
    await setPluginStorage(TEST_PLUGIN_ID, "gamma", 3)
    const keys = await listPluginStorageKeys(TEST_PLUGIN_ID)
    assert.deepEqual(keys, ["alpha", "beta", "gamma"], "keys should be sorted alphabetically")

    // ---- Test 9: clear ----
    await clearPluginStorage(TEST_PLUGIN_ID)
    const keysAfterClear = await listPluginStorageKeys(TEST_PLUGIN_ID)
    assert.deepEqual(keysAfterClear, [], "clear should remove all keys")
    assert.equal(await getPluginStorage(TEST_PLUGIN_ID, "alpha"), null, "cleared key should return null")

    // ---- Test 10: single value size limit (256 KiB) ----
    const oversizedValue = "x".repeat(256 * 1024 + 1)
    await assert.rejects(
      () => setPluginStorage(TEST_PLUGIN_ID, "big", oversizedValue),
      (error: Error) => error.message.includes("256 KiB"),
      "should reject values exceeding 256 KiB",
    )

    // ---- Test 11: total quota limit (1 MiB) ----
    await clearPluginStorage(TEST_PLUGIN_ID)
    // Fill up with 4 × 250 KiB values (just under 256 KiB each).
    const chunk = "a".repeat(250 * 1024)
    await setPluginStorage(TEST_PLUGIN_ID, "chunk-0", chunk)
    await setPluginStorage(TEST_PLUGIN_ID, "chunk-1", chunk)
    await setPluginStorage(TEST_PLUGIN_ID, "chunk-2", chunk)
    await setPluginStorage(TEST_PLUGIN_ID, "chunk-3", chunk)
    // One more should exceed 1 MiB total.
    await assert.rejects(
      () => setPluginStorage(TEST_PLUGIN_ID, "chunk-4", chunk),
      (error: Error) => error.message.includes("1 MiB"),
      "should reject when total storage exceeds 1 MiB",
    )

    // ---- Test 12: overwrite reclaims space for quota ----
    // Replace one chunk with a tiny value, then the 5th chunk should fit.
    await setPluginStorage(TEST_PLUGIN_ID, "chunk-0", "tiny")
    await setPluginStorage(TEST_PLUGIN_ID, "chunk-4", chunk)
    assert.equal(
      (await getPluginStorage(TEST_PLUGIN_ID, "chunk-4") as string).length,
      chunk.length,
      "overwrite should reclaim space and allow new writes within quota",
    )

    // ---- Test 13: null / undefined values ----
    await setPluginStorage(TEST_PLUGIN_ID, "null-val", null)
    assert.equal(await getPluginStorage(TEST_PLUGIN_ID, "null-val"), null, "null should round-trip")

    await setPluginStorage(TEST_PLUGIN_ID, "undef-val", undefined)
    assert.equal(await getPluginStorage(TEST_PLUGIN_ID, "undef-val"), null, "undefined should be stored as null")

    console.log("[desktop-plugin-storage] all tests passed")
  } finally {
    // Close pooled connections before cleaning up the test directory,
    // otherwise the database file handle blocks deletion on Windows.
    closeAllStorageConnections()
    await env.cleanup()
  }
}

main().catch((error) => {
  console.error("[desktop-plugin-storage] tests FAILED", error)
  process.exit(1)
})

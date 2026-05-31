import assert from "node:assert/strict"
import type { ModuleManifest } from "@thunder/core"
import { isModuleAvailableOnPlatform } from "./modules"

function moduleWith(platforms?: ModuleManifest["platforms"]): ModuleManifest {
  return {
    id: platforms?.join("-") || "all",
    name: "Test Module",
    description: "Test",
    icon: "Package",
    route: "/modules/test",
    category: "tools",
    order: 1,
    enabled: true,
    platforms,
  }
}

function main() {
  assert.equal(isModuleAvailableOnPlatform(moduleWith(undefined), "web"), true)
  assert.equal(isModuleAvailableOnPlatform(moduleWith(undefined), "desktop"), true)

  assert.equal(isModuleAvailableOnPlatform(moduleWith(["web"]), "web"), true)
  assert.equal(isModuleAvailableOnPlatform(moduleWith(["web"]), "desktop"), false)

  assert.equal(isModuleAvailableOnPlatform(moduleWith(["desktop"]), "web"), false)
  assert.equal(isModuleAvailableOnPlatform(moduleWith(["desktop"]), "desktop"), true)

  assert.equal(isModuleAvailableOnPlatform(moduleWith(["web", "desktop"]), "web"), true)
  assert.equal(isModuleAvailableOnPlatform(moduleWith(["web", "desktop"]), "desktop"), true)

  console.log("[modules] platform filter tests passed")
}

main()

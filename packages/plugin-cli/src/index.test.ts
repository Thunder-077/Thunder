import assert from "node:assert/strict"
import { createPluginProject } from "./commands/create"

const files = createPluginProject({ name: "teleprompter", template: "trusted-app" })

assert.equal(files["plugin.json"].includes('"kind": "trusted"'), true)
assert.equal(files["src/worker.ts"].includes("defineWorker"), true)

console.log("[plugin-cli] tests passed")

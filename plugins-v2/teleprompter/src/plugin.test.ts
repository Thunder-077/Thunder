import assert from "node:assert/strict"
import plugin from "./index"
import worker from "./worker"

assert.equal(typeof plugin.setup, "function")
assert.equal(typeof worker.handlers["speech.transcribe"], "function")

console.log("[teleprompter-v2] tests passed")

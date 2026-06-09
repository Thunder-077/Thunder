import assert from "node:assert/strict"
import { createFollowEngine, segmentScript } from "./index"

const script = "大家好，欢迎来到 Thunder。"
const segments = segmentScript(script)
const engine = createFollowEngine(script, segments, { enablePrediction: false })
const update = engine.push("大家好", true)

assert.equal(update.segmentIndex >= 0, true)

console.log("[teleprompter-core] tests passed")

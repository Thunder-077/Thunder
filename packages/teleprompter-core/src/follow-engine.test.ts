import assert from "node:assert/strict"
import { createFollowEngine, segmentScript } from "./index"

function runBasicFollowCase() {
  const script = "大家好，欢迎来到 Thunder。"
  const segments = segmentScript(script)
  const engine = createFollowEngine(script, segments, { enablePrediction: false })
  const update = engine.push("大家好", true)

  assert.equal(update.segmentIndex >= 0, true)
}

function runInterimWeakBoundaryHoldCase() {
  const script = "事例和理论来晓喻听众，打动听众，征服群众。"
  const segments = segmentScript(script)
  const engine = createFollowEngine(script, segments, { enablePrediction: false })

  const confirmed = engine.push("事例和理论来晓喻听众", true)
  const interimCrossing = engine.push("打动", false)
  const finalCrossing = engine.push("打动", true)

  // 下一行开头的 interim 应该能自然推进，避免跨视觉段重新确认造成迟滞。
  assert.ok(interimCrossing.displayReadOffset > confirmed.displayReadOffset)
  assert.equal(interimCrossing.isOnScript, true)
  assert.equal(interimCrossing.segmentIndex >= 1, true)

  assert.ok(finalCrossing.displayReadOffset >= interimCrossing.displayReadOffset)
}

function runInterimMidSegmentJumpHoldCase() {
  const script = "非常高兴许校长给我这么崇高的荣誉，谈一谈我在北大的体会。"
  const segments = segmentScript(script)
  const engine = createFollowEngine(script, segments, { enablePrediction: false })

  const confirmed = engine.push("非常高兴许校长给我这么崇高的荣誉", true)
  const hallucinatedTail = engine.push("体会", false)
  const finalTail = engine.push("体会", true)

  // 没有从下一视觉段开头连续读过来的 interim 不能直接落到段内中后部。
  assert.equal(hallucinatedTail.displayReadOffset, confirmed.displayReadOffset)
  assert.equal(hallucinatedTail.confirmedReadOffset, confirmed.confirmedReadOffset)

  assert.ok(finalTail.displayReadOffset > confirmed.displayReadOffset)
  assert.equal(finalTail.isOnScript, true)
}

runBasicFollowCase()
runInterimWeakBoundaryHoldCase()
runInterimMidSegmentJumpHoldCase()

console.log("[teleprompter-core] tests passed")

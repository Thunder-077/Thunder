import assert from "node:assert/strict"
import { getNextAnimatedReadOffset } from "./use-animated-read-offset"

function runSmallGapCase() {
  const next = getNextAnimatedReadOffset(10, 14)
  assert.equal(next, 11)
}

function runAdaptiveCatchUpCase() {
  const next = getNextAnimatedReadOffset(10, 30)
  assert.equal(next, 15)
}

function runLagProtectionCase() {
  const next = getNextAnimatedReadOffset(10, 50)
  assert.equal(next, 44)
}

function runNoOvershootCase() {
  const next = getNextAnimatedReadOffset(28, 30)
  assert.equal(next, 29)
}

runSmallGapCase()
runAdaptiveCatchUpCase()
runLagProtectionCase()
runNoOvershootCase()

console.log("[teleprompter-ui] animated read offset tests passed")

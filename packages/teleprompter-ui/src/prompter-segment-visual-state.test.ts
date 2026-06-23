import assert from "node:assert/strict"
import { getAutoSegmentVisualState, getFollowSegmentVisualState } from "./prompter-segment-visual-state"

function runFollowStateCases() {
  assert.equal(
    getFollowSegmentVisualState({
      index: 2,
      segmentStartOffset: 40,
      segmentEndOffset: 60,
      visibleCurrentIndex: 2,
      visibleReadOffset: 45,
    }),
    "active",
  )
  assert.equal(
    getFollowSegmentVisualState({
      index: 3,
      segmentStartOffset: 61,
      segmentEndOffset: 80,
      visibleCurrentIndex: 2,
      visibleReadOffset: 45,
    }),
    "unread",
  )
  assert.equal(
    getFollowSegmentVisualState({
      index: 1,
      segmentStartOffset: 20,
      segmentEndOffset: 39,
      visibleCurrentIndex: 2,
      visibleReadOffset: 45,
    }),
    "read",
  )
}

function runAutoStateCases() {
  assert.equal(
    getAutoSegmentVisualState({ index: 4, autoScrollActiveIndex: 4, highlightLine: true }),
    "active",
  )
  assert.equal(
    getAutoSegmentVisualState({ index: 3, autoScrollActiveIndex: 4, highlightLine: true }),
    "read",
  )
  assert.equal(
    getAutoSegmentVisualState({ index: 4, autoScrollActiveIndex: 4, highlightLine: false }),
    "unread",
  )
}

runFollowStateCases()
runAutoStateCases()

console.log("[teleprompter-ui] prompter segment visual state tests passed")

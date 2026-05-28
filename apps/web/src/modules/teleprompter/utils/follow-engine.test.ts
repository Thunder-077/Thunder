import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { createSpeechChunk } from "../transcribers/speech-chunk"
import type { SpeechProvider, SpeechChunk } from "../transcribers/types"
import { createFollowEngine, getSegmentTextStartOffset, type FollowUpdate } from "./follow-engine"
import type { FollowStatus } from "./follow-state-machine"
import { segmentScript } from "./script-segmenter"

type ReplayStep = {
  action: "push" | "push-chunk" | "jump-to-segment" | "reset"
  text?: string
  isFinal?: boolean
  provider?: SpeechProvider
  mode?: SpeechChunk["mode"]
  speakerId?: string
  repeat?: number
  segmentIndex?: number
  timestamps?: [number, number][]
  expect?: ReplayExpectation
}

type ReplayExpectation = {
  isOnScript?: boolean
  status?: FollowStatus
  segmentIndex?: number
  confidenceMin?: number
  readOffset?: number
  readOffsetMin?: number
  readOffsetPositive?: boolean
  readOffsetGreaterThanPrevious?: boolean
  readOffsetNearSegmentStart?: boolean
  topCandidateSource?: FollowUpdate["candidates"][number]["source"]
  candidatesMin?: number
  ignoredChunkCount?: number
  speakerMismatchCount?: number
  revisionChunkCount?: number
}

type ReplayFixture = {
  name: string
  script: string
  steps: ReplayStep[]
}

const fixtureDir = join(fileURLToPath(new URL(".", import.meta.url)), "fixtures", "follow-engine")

for (const fixture of loadFixtures()) {
  runReplayFixture(fixture)
  console.log(`PASS ${fixture.name}`)
}

runSegmenterCases()
runSpeakerGateCase()

function loadFixtures(): ReplayFixture[] {
  return readdirSync(fixtureDir)
    .filter((fileName) => fileName.endsWith(".json"))
    .sort()
    .map((fileName) => JSON.parse(readFileSync(join(fixtureDir, fileName), "utf8")) as ReplayFixture)
}

function runReplayFixture(fixture: ReplayFixture) {
  const segments = segmentScript(fixture.script)
  const engine = createFollowEngine(fixture.script, segments)
  let previousUpdate: FollowUpdate | null = null
  let update = engine.getState()

  for (const step of fixture.steps) {
    previousUpdate = update

    switch (step.action) {
      case "push": {
        const text = step.text
        if (typeof text !== "string") {
          throw new Error(`${fixture.name}: push step requires text`)
        }
        const repeat = step.repeat ?? 1
        for (let i = 0; i < repeat; i += 1) {
          update = engine.push(text, step.isFinal ?? true, step.timestamps)
        }
        break
      }
      case "push-chunk": {
        const text = step.text
        if (typeof text !== "string") {
          throw new Error(`${fixture.name}: push-chunk step requires text`)
        }
        update = engine.pushChunk(createSpeechChunk({
          provider: step.provider ?? "web-speech",
          text,
          isFinal: step.isFinal ?? true,
          mode: step.mode,
          timestamps: step.timestamps,
          speakerId: step.speakerId,
        }))
        break
      }
      case "jump-to-segment": {
        const segmentIndex = step.segmentIndex
        if (typeof segmentIndex !== "number") {
          throw new Error(`${fixture.name}: jump step requires segmentIndex`)
        }
        const targetSegment = segments[segmentIndex]
        assert.ok(targetSegment, `${fixture.name}: segment ${step.segmentIndex} does not exist`)
        update = engine.jump(getSegmentTextStartOffset(fixture.script, targetSegment))
        break
      }
      case "reset":
        update = engine.reset()
        break
    }

    if (step.expect) {
      assertReplayExpectation(fixture, step.expect, update, previousUpdate, segments)
    }
    assertProductFields(fixture, update)
  }
}

function assertReplayExpectation(
  fixture: ReplayFixture,
  expect: ReplayExpectation,
  update: FollowUpdate,
  previousUpdate: FollowUpdate | null,
  segments: ReturnType<typeof segmentScript>
) {
  if (expect.isOnScript !== undefined) {
    assert.equal(update.isOnScript, expect.isOnScript, `${fixture.name}: unexpected isOnScript ${formatUpdate(update)}`)
  }
  if (expect.status !== undefined) {
    assert.equal(update.status, expect.status, `${fixture.name}: unexpected status`)
  }
  if (expect.segmentIndex !== undefined) {
    assert.equal(update.segmentIndex, expect.segmentIndex, `${fixture.name}: unexpected segmentIndex`)
  }
  if (expect.confidenceMin !== undefined) {
    assert.ok(update.confidence >= expect.confidenceMin, `${fixture.name}: confidence ${update.confidence} < ${expect.confidenceMin}`)
  }
  if (expect.readOffset !== undefined) {
    assert.equal(update.readOffset, expect.readOffset, `${fixture.name}: unexpected readOffset`)
  }
  if (expect.readOffsetMin !== undefined) {
    assert.ok(update.readOffset >= expect.readOffsetMin, `${fixture.name}: readOffset ${update.readOffset} < ${expect.readOffsetMin}`)
  }
  if (expect.readOffsetPositive) {
    assert.ok(update.readOffset > 0, `${fixture.name}: readOffset should be positive`)
  }
  if (expect.readOffsetGreaterThanPrevious) {
    assert.ok(previousUpdate, `${fixture.name}: previous update missing`)
    assert.ok(update.readOffset > previousUpdate.readOffset, `${fixture.name}: readOffset did not advance`)
  }
  if (expect.readOffsetNearSegmentStart) {
    const segmentIndex = expect.segmentIndex
    if (typeof segmentIndex !== "number") {
      throw new Error(`${fixture.name}: segmentIndex required for segment-start assertion`)
    }
    const targetSegment = segments[segmentIndex]
    assert.ok(targetSegment, `${fixture.name}: expected segment does not exist`)
    const targetOffset = getSegmentTextStartOffset(fixture.script, targetSegment)
    assert.ok(update.readOffset >= targetOffset - 2, `${fixture.name}: readOffset is not near target segment`)
  }
  if (expect.candidatesMin !== undefined) {
    assert.ok(update.candidates.length >= expect.candidatesMin, `${fixture.name}: expected at least ${expect.candidatesMin} candidates`)
  }
  if (expect.topCandidateSource !== undefined) {
    assert.equal(update.candidates[0]?.source, expect.topCandidateSource, `${fixture.name}: unexpected top candidate source ${formatUpdate(update)}`)
  }
  if (expect.ignoredChunkCount !== undefined) {
    assert.equal(update.statsSnapshot.ignoredChunkCount, expect.ignoredChunkCount, `${fixture.name}: unexpected ignoredChunkCount`)
  }
  if (expect.speakerMismatchCount !== undefined) {
    assert.equal(update.statsSnapshot.speakerMismatchCount, expect.speakerMismatchCount, `${fixture.name}: unexpected speakerMismatchCount`)
  }
  if (expect.revisionChunkCount !== undefined) {
    assert.equal(update.statsSnapshot.revisionChunkCount, expect.revisionChunkCount, `${fixture.name}: unexpected revisionChunkCount`)
  }
}

function assertProductFields(fixture: ReplayFixture, update: FollowUpdate) {
  assert.equal(update.readOffset, update.displayReadOffset, `${fixture.name}: readOffset should mirror displayReadOffset`)
  assert.ok(update.confirmedReadOffset >= 0, `${fixture.name}: confirmedReadOffset should be non-negative`)
  assert.ok(update.displayReadOffset >= update.confirmedReadOffset, `${fixture.name}: displayReadOffset should not lag confirmedReadOffset`)
  assert.ok(update.statsSnapshot.chunkCount >= 0, `${fixture.name}: statsSnapshot missing chunk count`)
  assert.ok(update.paramsSnapshot.candidateWindow > 0, `${fixture.name}: paramsSnapshot missing candidate window`)
  assert.equal(typeof update.reason, "string", `${fixture.name}: decision reason missing`)
}

function formatUpdate(update: FollowUpdate): string {
  return JSON.stringify({
    status: update.status,
    readOffset: update.readOffset,
    confirmedReadOffset: update.confirmedReadOffset,
    displayReadOffset: update.displayReadOffset,
    decision: update.decision,
    confidence: update.confidence,
    candidates: update.candidates,
  })
}

function runSegmenterCases() {
  const weakBreakSegments = segmentScript("第一点，第二点、第三点；最后一句。")
  assert.deepEqual(weakBreakSegments.map((segment) => segment.raw), ["第一点，", "第二点、", "第三点；", "最后一句。"])
  console.log("PASS 逗号顿号分号会作为弱断点切分")

  const longScript = "这是一个没有任何标点的长段落用来模拟演讲稿直接粘贴进来的情况系统应该把它切成多个较小的匹配片段"
  const longSegments = segmentScript(longScript)
  assert.ok(longSegments.length > 1)
  assert.ok(longSegments.every((segment) => Array.from(segment.raw.trim()).length <= 28))
  console.log("PASS 无标点长段落会按固定长度二次切分")
}

function runSpeakerGateCase() {
  const script = "目标说话人第一句。目标说话人第二句。"
  const segments = segmentScript(script)
  const engine = createFollowEngine(script, segments, {
    targetSpeakerId: "target",
    requireKnownSpeaker: true,
  })

  const ignored = engine.pushChunk(createSpeechChunk({
    provider: "funasr",
    text: "旁边的人正在说话",
    isFinal: true,
    speakerId: "guest",
  }))
  assert.equal(ignored.readOffset, 0)
  assert.equal(ignored.statsSnapshot.ignoredChunkCount, 1)
  assert.equal(ignored.statsSnapshot.speakerMismatchCount, 1)

  const accepted = engine.pushChunk(createSpeechChunk({
    provider: "funasr",
    text: "目标说话人第一句",
    isFinal: true,
    speakerId: "target",
  }))
  assert.ok(accepted.readOffset > 0)
  assert.equal(accepted.isOnScript, true)
  console.log("PASS 说话人过滤会忽略非目标说话人")
}

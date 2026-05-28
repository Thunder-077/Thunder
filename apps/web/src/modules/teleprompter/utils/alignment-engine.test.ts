import assert from "node:assert/strict"
import { createAlignmentEngine, getSegmentTextStartOffset } from "./alignment-engine"
import { segmentScript } from "./script-segmenter"

type Case = {
  name: string
  run: () => void
}

const cases: Case[] = [
  {
    name: "推进到当前句段中的已读位置",
    run: () => {
      const script = "大家好，今天我们聊一聊智能提词器。"
      const segments = segmentScript(script)
      const engine = createAlignmentEngine(script, segments)
      const update = engine.push("大家好今天我们", true)

      assert.ok(update.scriptOffset > 0)
      assert.ok(update.isOnScript)
    },
  },
  {
    name: "连续 push 推进位置持续前进",
    run: () => {
      const script = "大家好，今天我们聊一聊智能提词器。"
      const segments = segmentScript(script)
      const engine = createAlignmentEngine(script, segments)

      const first = engine.push("大家好", true)
      const second = engine.push("今天我们", true)

      assert.ok(second.scriptOffset >= first.scriptOffset)
      assert.ok(second.isOnScript)
    },
  },
  {
    name: "同音字替换不影响匹配（是→事）",
    run: () => {
      const script = "我是谁，今天要讲什么。"
      const segments = segmentScript(script)
      const engine = createAlignmentEngine(script, segments)
      const update = engine.push("我事谁", true)

      assert.ok(update.isOnScript)
      assert.ok(update.scriptOffset > 0)
    },
  },
  {
    name: "同音字替换不影响匹配（们→门）",
    run: () => {
      const script = "今天我们聊一聊智能提词器。"
      const segments = segmentScript(script)
      const engine = createAlignmentEngine(script, segments)
      const update = engine.push("今天我门聊一聊", true)

      assert.ok(update.isOnScript)
      assert.ok(update.confidence > 0.3)
    },
  },
  {
    name: "多个同音替换仍能维持匹配",
    run: () => {
      const script = "大家好，今天我们聊一聊智能提词器。"
      const segments = segmentScript(script)
      const engine = createAlignmentEngine(script, segments)
      const update = engine.push("大加好今天我门聊一聊", true)

      assert.ok(update.isOnScript)
    },
  },
  {
    name: "完全无关内容触发 off-script",
    run: () => {
      const script = "这是第一句。这里是第二句。"
      const segments = segmentScript(script)
      const engine = createAlignmentEngine(script, segments)

      for (let i = 0; i < 8; i += 1) {
        engine.push("完全无关的内容", true)
      }

      const state = engine.getState()
      assert.equal(state.isOnScript, false)
    },
  },
  {
    name: "off-script 后回到正文可恢复",
    run: () => {
      const script = "开场白。重点内容从这里开始。最后总结。"
      const segments = segmentScript(script)
      const engine = createAlignmentEngine(script, segments)

      engine.push("开场白", true)

      for (let i = 0; i < 8; i += 1) {
        engine.push("无关内容", true)
      }
      assert.equal(engine.getState().isOnScript, false)

      engine.push("重点内容从这里开始", true)
      assert.ok(engine.getState().isOnScript)
    },
  },
  {
    name: "手动 jump 重置到指定位置",
    run: () => {
      const script = "开场白。重点内容从这里开始。最后总结。"
      const segments = segmentScript(script)
      const engine = createAlignmentEngine(script, segments)

      engine.push("开场白", true)

      const jumpTarget = getSegmentTextStartOffset(script, segments[1])
      engine.jump(jumpTarget)

      const state = engine.getState()
      assert.ok(state.scriptOffset >= jumpTarget - 2)
      assert.ok(state.isOnScript)
    },
  },
  {
    name: "reset 回到开头",
    run: () => {
      const script = "大家好，今天我们聊一聊智能提词器。"
      const segments = segmentScript(script)
      const engine = createAlignmentEngine(script, segments)

      engine.push("大家好今天我们", true)
      assert.ok(engine.getState().scriptOffset > 0)

      engine.reset()
      const state = engine.getState()
      assert.equal(state.scriptOffset, 0)
    },
  },
  {
    name: "逗号顿号分号会作为弱断点切分",
    run: () => {
      const script = "第一点，第二点、第三点；最后一句。"
      const segments = segmentScript(script)

      assert.deepEqual(segments.map((segment) => segment.raw), ["第一点，", "第二点、", "第三点；", "最后一句。"])
    },
  },
  {
    name: "无标点长段落会按固定长度二次切分",
    run: () => {
      const script = "这是一个没有任何标点的长段落用来模拟演讲稿直接粘贴进来的情况系统应该把它切成多个较小的匹配片段"
      const segments = segmentScript(script)

      assert.ok(segments.length > 1)
      assert.ok(segments.every((segment) => Array.from(segment.raw.trim()).length <= 28))
    },
  },
  {
    name: "纯英文/数字不受拼音匹配干扰",
    run: () => {
      const script = "使用API接口。调用HTTP请求。"
      const segments = segmentScript(script)
      const engine = createAlignmentEngine(script, segments)
      const update = engine.push("使用API接口", true)

      assert.ok(update.isOnScript)
    },
  },
  {
    name: "FunASR 时间戳提升 readOffset 精度",
    run: () => {
      const script = "大家好，今天我们聊一聊智能提词器。"
      const segments = segmentScript(script)
      const engine = createAlignmentEngine(script, segments)
      const update = engine.push("今天我们", true, [[100, 200], [200, 300], [300, 400], [400, 500]])

      assert.ok(update.scriptOffset > 0)
      assert.ok(update.isOnScript)
    },
  },
  {
    name: "空脚本创建的引擎不崩溃",
    run: () => {
      const engine = createAlignmentEngine("", [])
      const update = engine.push("任何内容", true)

      assert.equal(update.scriptOffset, 0)
      engine.jump(0)
      engine.reset()
    },
  },
  {
    name: "增量 push 模拟实时跟读整段流程",
    run: () => {
      const script = "第一句话。第二句话。第三句话。"
      const segments = segmentScript(script)
      const engine = createAlignmentEngine(script, segments)

      engine.push("第一", false)
      engine.push("第一句话", true)
      const afterFirst = engine.getState()
      assert.ok(afterFirst.isOnScript)
      assert.equal(afterFirst.segmentIndex, 0)

      engine.push("第二句话", true)
      const afterSecond = engine.getState()
      assert.ok(afterSecond.scriptOffset > afterFirst.scriptOffset)
      assert.equal(afterSecond.segmentIndex, 1)

      engine.push("第三句话", true)
      const afterThird = engine.getState()
      assert.ok(afterThird.scriptOffset > afterSecond.scriptOffset)
      assert.equal(afterThird.segmentIndex, 2)
    },
  },
]

for (const testCase of cases) {
  testCase.run()
  console.log(`PASS ${testCase.name}`)
}

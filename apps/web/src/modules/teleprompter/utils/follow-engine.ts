import type { ScriptSegment } from "./script-segmenter"
import { buildScriptIndex, type ScriptIndex } from "./script-segmenter"
import { toPinyinTokens } from "./pinyin"
import { normalizeSpeechText } from "./text-normalizer"
import { createOnlineDtw, type DtwConfig } from "./online-dtw"
import { createFollowStateMachine, type FollowStatus, type FollowStateMachine } from "./follow-state-machine"
import type { SpeechChunk } from "../transcribers/types"

export type FollowUpdate = {
  status: FollowStatus
  confirmedReadOffset: number
  predictedReadOffset?: number
  displayReadOffset: number
  scriptOffset: number
  readOffset: number
  segmentIndex: number
  confidence: number
  isOnScript: boolean
  candidates: FollowCandidate[]
  candidateTracks: CandidateTrack[]
  statsSnapshot: FollowRuntimeStats
  paramsSnapshot: AdaptiveFollowParams
  decision: FollowDecision
  reason: string
  matchedText: string
  isFinal: boolean
  message?: string
}

export type FollowDecision = "dtw" | "local-candidate" | "recovery-candidate" | "timestamp" | "prediction" | "hold"

export type SpeakerGateResult = {
  accepted: boolean
  reason: "accepted" | "speaker-mismatch" | "unknown-speaker"
  speakerId?: string
}

export type FollowCandidate = {
  scriptOffset: number
  readOffset: number
  segmentIndex: number
  startTokenIndex: number
  endTokenIndex: number
  confidence: number
  score: number
  source: "dtw" | "local" | "recovery" | "timestamp"
  matchedTokens: number
  totalTokens: number
}

export type CandidateTrack = {
  id: string
  source: FollowCandidate["source"]
  lastOffset: number
  hitCount: number
  consecutiveHits: number
  avgConfidence: number
  firstSeenAt: number
  lastSeenAt: number
}

export type FollowRuntimeStats = {
  chunkCount: number
  finalChunkCount: number
  interimChunkCount: number
  avgChunkIntervalMs: number
  avgConfidence: number
  confidenceTrend: "up" | "down" | "stable"
  charsPerSecond: number
  tokensPerSecond: number
  offScriptCount: number
  recoveryCount: number
  manualCalibrationCount: number
  correctionJumpCount: number
  lastConfirmedAt: number
  lastSpeechChunkAt: number
  asrBlankMs: number
  ignoredChunkCount: number
  revisionChunkCount: number
  speakerMismatchCount: number
}

export type AdaptiveFollowParams = {
  candidateWindow: number
  localCandidateThreshold: number
  recoveryCandidateThreshold: number
  timestampCorrectionThreshold: number
  minRecoveryHits: number
  maxPredictionMs: number
  jumpPenalty: number
  backwardPenalty: number
  maxLocalLeadTokens: number
  minLocalMatchTokens: number
}

export type FollowEngine = {
  push(text: string, isFinal: boolean, timestamps?: [number, number][]): FollowUpdate
  pushChunk(chunk: SpeechChunk): FollowUpdate
  jump(scriptOffset: number): FollowUpdate
  reset(): FollowUpdate
  getState(): FollowUpdate
  getStats(): FollowRuntimeStats
  getParams(): AdaptiveFollowParams
  getSessionSummary(): FollowSessionSummary
  transitionStatus(event: Parameters<FollowStateMachine["transition"]>[0]): FollowStatus
}

export type FollowEngineConfig = DtwConfig & {
  candidateWindow?: number
  localCandidateThreshold?: number
  recoveryCandidateThreshold?: number
  timestampCorrectionThreshold?: number
  minRecoveryHits?: number
  maxPredictionMs?: number
  targetSpeakerId?: string
  requireKnownSpeaker?: boolean
}

export type FollowSessionSummary = {
  status: FollowStatus
  confirmedReadOffset: number
  displayReadOffset: number
  segmentIndex: number
  stats: FollowRuntimeStats
  params: AdaptiveFollowParams
  candidateTracks: CandidateTrack[]
  lastDecision: FollowDecision
  lastReason: string
}

const DEFAULT_CANDIDATE_WINDOW = 90
const DEFAULT_LOCAL_CANDIDATE_THRESHOLD = 0.72
const DEFAULT_RECOVERY_CANDIDATE_THRESHOLD = 0.62
const DEFAULT_TIMESTAMP_CORRECTION_THRESHOLD = 0.45
const DEFAULT_MIN_RECOVERY_HITS = 2
const DEFAULT_MAX_PREDICTION_MS = 1200
const DEFAULT_MAX_LOCAL_LEAD_TOKENS = 20
const DEFAULT_MIN_LOCAL_MATCH_TOKENS = 2
const MAX_CANDIDATES = 5
const TRACK_OFFSET_BUCKET = 8
const TRACK_TTL_MS = 6000

export function createFollowEngine(
  script: string,
  segments: ScriptSegment[],
  config?: FollowEngineConfig
): FollowEngine {
  const index = buildScriptIndex(script, segments)
  const dtw = createOnlineDtw(index.tokens, config)
  const stateMachine = createFollowStateMachine()
  const baseParams: AdaptiveFollowParams = {
    candidateWindow: config?.candidateWindow ?? DEFAULT_CANDIDATE_WINDOW,
    localCandidateThreshold: config?.localCandidateThreshold ?? DEFAULT_LOCAL_CANDIDATE_THRESHOLD,
    recoveryCandidateThreshold: config?.recoveryCandidateThreshold ?? DEFAULT_RECOVERY_CANDIDATE_THRESHOLD,
    timestampCorrectionThreshold: config?.timestampCorrectionThreshold ?? DEFAULT_TIMESTAMP_CORRECTION_THRESHOLD,
    minRecoveryHits: config?.minRecoveryHits ?? DEFAULT_MIN_RECOVERY_HITS,
    maxPredictionMs: config?.maxPredictionMs ?? DEFAULT_MAX_PREDICTION_MS,
    jumpPenalty: 0.16,
    backwardPenalty: 0.18,
    maxLocalLeadTokens: DEFAULT_MAX_LOCAL_LEAD_TOKENS,
    minLocalMatchTokens: DEFAULT_MIN_LOCAL_MATCH_TOKENS,
  }
  const stats = createRuntimeStats()
  let params = { ...baseParams }
  let candidateTracks: CandidateTrack[] = []

  if (index.tokens.length === 0) {
    const empty = createUpdate({
      status: "idle",
      confirmedReadOffset: 0,
      displayReadOffset: 0,
      scriptOffset: 0,
      segmentIndex: 0,
      confidence: 0,
      isOnScript: false,
      candidates: [],
      candidateTracks: [],
      statsSnapshot: stats,
      paramsSnapshot: params,
      decision: "hold",
      reason: "empty-script",
      matchedText: "",
      isFinal: false,
    })

    return {
      push() { return empty },
      pushChunk() { return empty },
      jump() { return empty },
      reset() { return empty },
      getState() { return empty },
      getStats() { return stats },
      getParams() { return params },
      getSessionSummary() {
        return {
          status: empty.status,
          confirmedReadOffset: empty.confirmedReadOffset,
          displayReadOffset: empty.displayReadOffset,
          segmentIndex: empty.segmentIndex,
          stats,
          params,
          candidateTracks: [],
          lastDecision: empty.decision,
          lastReason: empty.reason,
        }
      },
      transitionStatus(event) { return stateMachine.transition(event) },
    }
  }

  let lastUpdate = createUpdate({
    status: "idle",
    confirmedReadOffset: 0,
    displayReadOffset: 0,
    scriptOffset: 0,
    segmentIndex: 0,
    confidence: 1,
    isOnScript: true,
    candidates: [],
    candidateTracks: [],
    statsSnapshot: stats,
    paramsSnapshot: params,
    decision: "hold",
    reason: "initial",
    matchedText: "",
    isFinal: false,
  })

  function push(text: string, isFinal: boolean, timestamps?: [number, number][]): FollowUpdate {
    const normalized = normalizeSpeechText(text)
    if (!normalized) return lastUpdate

    const now = Date.now()
    const tokens = toPinyinTokens(normalized)
    updateStatsBeforeDecision(stats, {
      now,
      text,
      tokenCount: tokens.length,
      isFinal,
      previousUpdate: lastUpdate,
    })
    params = deriveAdaptiveParams(baseParams, stats)
    let state = dtw.getState()

    for (const token of tokens) {
      state = dtw.push(token)
    }

    const dtwCandidate = toDtwCandidate(state, index, tokens.length)
    const searchMode = state.isOnScript ? "local" : "recovery"
    const lexicalCandidates = findLexicalCandidates({
      speechTokens: tokens,
      index,
      anchorOffset: lastUpdate.confirmedReadOffset,
      params,
      mode: searchMode,
      isFinal,
    })
    const timestampCandidate = timestamps && timestamps.length > 0
      ? createTimestampCandidate(text, timestamps, script, segments)
      : null
    const candidates = rankCandidates([
      dtwCandidate,
      ...lexicalCandidates,
      ...(timestampCandidate ? [timestampCandidate] : []),
    ])
    candidateTracks = updateCandidateTracks(candidateTracks, candidates, now)
    const bestCandidate = chooseBestCandidate({
      candidates,
      dtwCandidate,
      dtwIsOnScript: state.isOnScript,
      dtwConfidence: state.confidence,
      params,
      tracks: candidateTracks,
    })

    if (bestCandidate.source !== "dtw") {
      dtw.jump(findTokenIndexByOffset(index, bestCandidate.readOffset))
    }

    const decision = toDecision(bestCandidate, state.isOnScript)
    const isOnScript = bestCandidate.source === "dtw"
      ? state.isOnScript
      : isCandidateAccepted(bestCandidate, params, candidateTracks, state.isOnScript)
    const nextUpdate = toUpdate({
      scriptPosition: findTokenIndexByOffset(index, bestCandidate.readOffset),
      confidence: bestCandidate.confidence,
      isOnScript,
    }, {
      index,
      matchedText: text,
      isFinal,
      stateMachine,
      candidates,
      candidateTracks,
      stats,
      params,
      decision,
      reason: buildDecisionReason(bestCandidate, state.isOnScript, candidateTracks),
    })

    updateStatsAfterDecision(stats, lastUpdate, nextUpdate, now)
    params = deriveAdaptiveParams(baseParams, stats)
    lastUpdate = refreshUpdateSnapshots(nextUpdate, stats, params)
    return lastUpdate
  }

  function pushChunk(chunk: SpeechChunk): FollowUpdate {
    const gate = evaluateSpeakerGate(chunk, config)
    if (!gate.accepted) {
      stats.ignoredChunkCount += 1
      if (gate.reason === "speaker-mismatch") {
        stats.speakerMismatchCount += 1
      }
      lastUpdate = createUpdate({
        ...lastUpdate,
        decision: "hold",
        reason: gate.reason,
        statsSnapshot: snapshotStats(stats),
        paramsSnapshot: { ...params },
      })
      return lastUpdate
    }

    if (chunk.mode === "revision") {
      stats.revisionChunkCount += 1
    }

    return push(
      chunk.text,
      chunk.isFinal,
      chunk.tokens.some((token) => token.startMs !== undefined && token.endMs !== undefined)
        ? chunk.tokens.map((token) => [token.startMs ?? 0, token.endMs ?? 0] as [number, number])
        : undefined,
    )
  }

  function jump(scriptOffset: number): FollowUpdate {
    stats.manualCalibrationCount += 1
    const tokenIndex = findTokenIndexByOffset(index, scriptOffset)
    dtw.jump(tokenIndex)
    const status = stateMachine.transition({ type: "calibrate" })
    lastUpdate = createUpdate({
      ...toUpdate(dtw.getState(), {
        index,
        matchedText: "",
        isFinal: false,
        stateMachine,
        candidates: [],
        candidateTracks,
        stats,
        params,
        decision: "local-candidate",
        reason: "manual-calibration",
      }),
      status,
      confirmedReadOffset: index.offsets[tokenIndex] ?? scriptOffset,
      displayReadOffset: index.offsets[tokenIndex] ?? scriptOffset,
      scriptOffset: index.offsets[tokenIndex] ?? scriptOffset,
      segmentIndex: index.segmentIndices[tokenIndex] ?? 0,
      confidence: 1,
      isOnScript: true,
      candidates: [],
      candidateTracks,
      statsSnapshot: snapshotStats(stats),
      paramsSnapshot: { ...params },
    })
    return lastUpdate
  }

  function reset(): FollowUpdate {
    dtw.reset()
    candidateTracks = []
    resetRuntimeStats(stats)
    params = { ...baseParams }
    const status = stateMachine.reset()
    lastUpdate = createUpdate({
      status,
      confirmedReadOffset: 0,
      displayReadOffset: 0,
      scriptOffset: 0,
      segmentIndex: 0,
      confidence: 1,
      isOnScript: true,
      candidates: [],
      candidateTracks: [],
      statsSnapshot: snapshotStats(stats),
      paramsSnapshot: { ...params },
      decision: "hold",
      reason: "reset",
      matchedText: "",
      isFinal: false,
    })
    return lastUpdate
  }

  function getState(): FollowUpdate {
    return refreshPrediction(lastUpdate, stats, params)
  }

  function transitionStatus(event: Parameters<FollowStateMachine["transition"]>[0]): FollowStatus {
    const status = stateMachine.transition(event)
    lastUpdate = createUpdate({ ...lastUpdate, status })
    return status
  }

  function getStats(): FollowRuntimeStats {
    return snapshotStats(stats)
  }

  function getParams(): AdaptiveFollowParams {
    return { ...params }
  }

  function getSessionSummary(): FollowSessionSummary {
    return {
      status: lastUpdate.status,
      confirmedReadOffset: lastUpdate.confirmedReadOffset,
      displayReadOffset: getState().displayReadOffset,
      segmentIndex: lastUpdate.segmentIndex,
      stats: snapshotStats(stats),
      params: { ...params },
      candidateTracks: candidateTracks.map((track) => ({ ...track })),
      lastDecision: lastUpdate.decision,
      lastReason: lastUpdate.reason,
    }
  }

  return { push, pushChunk, jump, reset, getState, getStats, getParams, getSessionSummary, transitionStatus }
}

function toUpdate(
  state: { scriptPosition: number; confidence: number; isOnScript: boolean },
  context: {
    index: ScriptIndex
    matchedText: string
    isFinal: boolean
    stateMachine: FollowStateMachine
    candidates: FollowCandidate[]
    candidateTracks: CandidateTrack[]
    stats: FollowRuntimeStats
    params: AdaptiveFollowParams
    decision: FollowDecision
    reason: string
  }
): FollowUpdate {
  const { index, matchedText, isFinal, stateMachine, candidates, candidateTracks, stats, params, decision, reason } = context
  const pos = Math.max(0, Math.min(state.scriptPosition, index.tokens.length - 1))
  const status = stateMachine.transition({
    type: "alignment",
    isOnScript: state.isOnScript,
    confidence: state.confidence,
  })
  const confirmedReadOffset = index.offsets[pos] ?? 0
  const predictedReadOffset = computePredictedReadOffset({
    confirmedReadOffset,
    status,
    stats,
    params,
    now: Date.now(),
  })

  return createUpdate({
    status,
    confirmedReadOffset,
    predictedReadOffset,
    displayReadOffset: predictedReadOffset ?? confirmedReadOffset,
    scriptOffset: confirmedReadOffset,
    segmentIndex: index.segmentIndices[pos] ?? 0,
    confidence: state.confidence,
    isOnScript: state.isOnScript,
    candidates,
    candidateTracks,
    statsSnapshot: snapshotStats(stats),
    paramsSnapshot: { ...params },
    decision,
    reason,
    matchedText,
    isFinal,
  })
}

function toDtwCandidate(
  state: { scriptPosition: number; confidence: number },
  index: ScriptIndex,
  totalTokens: number
): FollowCandidate {
  const pos = Math.max(0, Math.min(state.scriptPosition, index.tokens.length - 1))
  const startTokenIndex = Math.max(0, pos - Math.max(0, totalTokens - 1))
  return {
    scriptOffset: index.offsets[pos] ?? 0,
    readOffset: index.offsets[pos] ?? 0,
    segmentIndex: index.segmentIndices[pos] ?? 0,
    startTokenIndex,
    endTokenIndex: pos,
    confidence: state.confidence,
    score: state.confidence,
    source: "dtw",
    matchedTokens: Math.round(state.confidence * totalTokens),
    totalTokens,
  }
}

function findLexicalCandidates(options: {
  speechTokens: string[]
  index: ScriptIndex
  anchorOffset: number
  params: AdaptiveFollowParams
  mode: "local" | "recovery"
  isFinal: boolean
}): FollowCandidate[] {
  const { speechTokens, index, anchorOffset, params, mode, isFinal } = options
  if (speechTokens.length === 0 || index.tokens.length === 0) return []

  const anchorIndex = findTokenIndexByOffset(index, anchorOffset)
  const start = mode === "recovery" ? 0 : Math.max(0, anchorIndex - Math.floor(params.candidateWindow / 3))
  const end = mode === "recovery" ? index.tokens.length - 1 : Math.min(index.tokens.length - 1, anchorIndex + params.candidateWindow)
  const candidates: FollowCandidate[] = []

  for (let pos = start; pos <= end; pos += 1) {
    const candidate = scoreCandidateEndingAt({
      speechTokens,
      index,
      endIndex: pos,
      anchorIndex,
      mode,
      isFinal,
      params,
    })
    if (candidate) {
      candidates.push(candidate)
    }
  }

  return rankCandidates(candidates).slice(0, MAX_CANDIDATES)
}

function scoreCandidateEndingAt(options: {
  speechTokens: string[]
  index: ScriptIndex
  endIndex: number
  anchorIndex: number
  mode: "local" | "recovery"
  isFinal: boolean
  params: AdaptiveFollowParams
}): FollowCandidate | null {
  const { speechTokens, index, endIndex, anchorIndex, mode, isFinal, params } = options
  const startIndex = endIndex - speechTokens.length + 1
  if (startIndex < 0) return null
  if (mode === "local" && !isLocalCandidateInRange(startIndex, endIndex, anchorIndex, params)) {
    return null
  }

  let matchedTokens = 0
  for (let i = 0; i < speechTokens.length; i += 1) {
    if (index.tokens[startIndex + i] === speechTokens[i]) {
      matchedTokens += 1
    }
  }

  const matchRatio = matchedTokens / speechTokens.length
  const minMatchedTokens = mode === "recovery"
    ? Math.min(4, speechTokens.length)
    : speechTokens.length === 1
    ? 1
    : Math.min(params.minLocalMatchTokens, speechTokens.length)
  if (matchedTokens < minMatchedTokens) return null

  const forwardDistance = endIndex - anchorIndex
  const continuityBonus = forwardDistance >= 0 && forwardDistance <= 45 ? 0.12 : 0
  const backwardPenalty = forwardDistance < -4 ? params.backwardPenalty : 0
  const jumpPenalty = mode === "local" && forwardDistance > 120 ? params.jumpPenalty : 0
  const singleTokenAmbiguityPenalty = mode === "local" && speechTokens.length === 1 && startIndex > anchorIndex + 1 ? 0.18 : 0
  const finalBonus = isFinal ? 0.03 : 0
  const score = clamp(matchRatio + continuityBonus + finalBonus - backwardPenalty - jumpPenalty - singleTokenAmbiguityPenalty, 0, 1)

  if (score < 0.35) return null

  const scriptOffset = index.offsets[endIndex] ?? 0
  return {
    scriptOffset,
    readOffset: scriptOffset,
    segmentIndex: index.segmentIndices[endIndex] ?? 0,
    startTokenIndex: startIndex,
    endTokenIndex: endIndex,
    confidence: score,
    score,
    source: mode,
    matchedTokens,
    totalTokens: speechTokens.length,
  }
}

function createTimestampCandidate(
  resultText: string,
  timestamps: [number, number][],
  script: string,
  segments: ScriptSegment[]
): FollowCandidate | null {
  const resultChars = Array.from(resultText)
  if (timestamps.length !== resultChars.length) return null

  const resultPy = toPinyinTokens(normalizeSpeechText(resultText))
  const timestampIndex = buildScriptIndex(script, segments)
  let best: FollowCandidate | null = null

  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const segment = segments[segmentIndex]
    const originalSlice = script.slice(segment.startOffset, segment.endOffset)
    const leadingWs = originalSlice.length - originalSlice.trimStart().length
    const textStart = segment.startOffset + leadingWs
    const segChars = Array.from(segment.raw)
    const segPy = toPinyinTokens(normalizeSpeechText(segment.raw))
    let segScan = 0
    let matchedTokens = 0

    for (let ri = 0; ri < resultPy.length; ri += 1) {
      if (segScan >= segPy.length) break
      if (resultPy[ri] === segPy[segScan]) {
        matchedTokens += 1
        const charOffset = textStart + Math.min(segScan, segChars.length - 1) + 1
        const confidence = matchedTokens / Math.max(1, resultPy.length)
        const endTokenIndex = findTokenIndexByOffset(timestampIndex, charOffset)
        const candidate: FollowCandidate = {
          scriptOffset: charOffset,
          readOffset: charOffset,
          segmentIndex,
          startTokenIndex: Math.max(0, endTokenIndex - resultPy.length + 1),
          endTokenIndex,
          confidence,
          score: confidence + 0.08,
          source: "timestamp",
          matchedTokens,
          totalTokens: resultPy.length,
        }
        if (!best || candidate.score > best.score || candidate.readOffset > best.readOffset) {
          best = candidate
        }
        segScan += 1
      }
    }
  }

  return best
}

function rankCandidates(candidates: FollowCandidate[]): FollowCandidate[] {
  return [...candidates]
    .sort((a, b) => b.score - a.score || b.readOffset - a.readOffset)
    .slice(0, MAX_CANDIDATES)
}

function chooseBestCandidate(options: {
  candidates: FollowCandidate[]
  dtwCandidate: FollowCandidate
  dtwIsOnScript: boolean
  dtwConfidence: number
  params: AdaptiveFollowParams
  tracks: CandidateTrack[]
}): FollowCandidate {
  const {
    candidates,
    dtwCandidate,
    dtwIsOnScript,
    dtwConfidence,
    params,
    tracks,
  } = options
  const best = candidates[0] ?? dtwCandidate

  if (best.source === "timestamp" && best.confidence >= params.timestampCorrectionThreshold && best.readOffset >= dtwCandidate.readOffset) {
    return best
  }

  if (!dtwIsOnScript || dtwConfidence < params.recoveryCandidateThreshold) {
    return isCandidateAccepted(best, params, tracks, dtwIsOnScript) ? best : dtwCandidate
  }

  if (best.source !== "dtw" && best.confidence >= params.localCandidateThreshold && best.readOffset >= dtwCandidate.readOffset) {
    return best
  }

  return dtwCandidate
}

function isLocalCandidateInRange(
  startIndex: number,
  endIndex: number,
  anchorIndex: number,
  params: AdaptiveFollowParams
): boolean {
  const startLead = startIndex - anchorIndex
  const endLead = endIndex - anchorIndex
  if (startLead > params.maxLocalLeadTokens) {
    return false
  }
  if (endLead < -params.minLocalMatchTokens) {
    return false
  }

  return true
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function evaluateSpeakerGate(
  chunk: SpeechChunk,
  config: FollowEngineConfig | undefined
): SpeakerGateResult {
  const targetSpeakerId = config?.targetSpeakerId
  if (!targetSpeakerId) {
    return { accepted: true, reason: "accepted", speakerId: chunk.speakerId }
  }

  if (!chunk.speakerId) {
    return {
      accepted: !config?.requireKnownSpeaker,
      reason: config?.requireKnownSpeaker ? "unknown-speaker" : "accepted",
      speakerId: chunk.speakerId,
    }
  }

  return {
    accepted: chunk.speakerId === targetSpeakerId,
    reason: chunk.speakerId === targetSpeakerId ? "accepted" : "speaker-mismatch",
    speakerId: chunk.speakerId,
  }
}

function createRuntimeStats(): FollowRuntimeStats {
  return {
    chunkCount: 0,
    finalChunkCount: 0,
    interimChunkCount: 0,
    avgChunkIntervalMs: 0,
    avgConfidence: 1,
    confidenceTrend: "stable",
    charsPerSecond: 0,
    tokensPerSecond: 0,
    offScriptCount: 0,
    recoveryCount: 0,
    manualCalibrationCount: 0,
    correctionJumpCount: 0,
    lastConfirmedAt: 0,
    lastSpeechChunkAt: 0,
    asrBlankMs: 0,
    ignoredChunkCount: 0,
    revisionChunkCount: 0,
    speakerMismatchCount: 0,
  }
}

function resetRuntimeStats(stats: FollowRuntimeStats) {
  Object.assign(stats, createRuntimeStats())
}

function snapshotStats(stats: FollowRuntimeStats): FollowRuntimeStats {
  return { ...stats }
}

function updateStatsBeforeDecision(
  stats: FollowRuntimeStats,
  input: {
    now: number
    text: string
    tokenCount: number
    isFinal: boolean
    previousUpdate: FollowUpdate
  }
) {
  const previousSpeechAt = stats.lastSpeechChunkAt
  stats.chunkCount += 1
  if (input.isFinal) {
    stats.finalChunkCount += 1
  } else {
    stats.interimChunkCount += 1
  }

  if (previousSpeechAt > 0) {
    const interval = Math.max(0, input.now - previousSpeechAt)
    stats.avgChunkIntervalMs = rollingAverage(stats.avgChunkIntervalMs, interval, stats.chunkCount - 1)
  }

  stats.lastSpeechChunkAt = input.now
  stats.asrBlankMs = previousSpeechAt > 0 ? Math.max(0, input.now - previousSpeechAt) : 0

  const elapsedSinceConfirmSec = input.previousUpdate.statsSnapshot.lastConfirmedAt > 0
    ? Math.max(0.2, (input.now - input.previousUpdate.statsSnapshot.lastConfirmedAt) / 1000)
    : Math.max(0.2, (stats.avgChunkIntervalMs || 600) / 1000)
  stats.charsPerSecond = rollingAverage(stats.charsPerSecond, Array.from(input.text).length / elapsedSinceConfirmSec, stats.chunkCount)
  stats.tokensPerSecond = rollingAverage(stats.tokensPerSecond, input.tokenCount / elapsedSinceConfirmSec, stats.chunkCount)
}

function updateStatsAfterDecision(
  stats: FollowRuntimeStats,
  previousUpdate: FollowUpdate,
  update: FollowUpdate,
  now: number
) {
  const previousAvgConfidence = stats.avgConfidence
  stats.avgConfidence = rollingAverage(stats.avgConfidence, update.confidence, stats.chunkCount)
  const confidenceDelta = stats.avgConfidence - previousAvgConfidence
  stats.confidenceTrend = confidenceDelta > 0.03 ? "up" : confidenceDelta < -0.03 ? "down" : "stable"

  if (!update.isOnScript) {
    stats.offScriptCount += 1
  }
  if (!previousUpdate.isOnScript && update.isOnScript) {
    stats.recoveryCount += 1
  }
  if (Math.abs(update.confirmedReadOffset - previousUpdate.confirmedReadOffset) > 32) {
    stats.correctionJumpCount += 1
  }
  if (update.isOnScript) {
    stats.lastConfirmedAt = now
  }
}

function rollingAverage(current: number, next: number, count: number): number {
  if (count <= 1) return next
  return current + (next - current) / count
}

function deriveAdaptiveParams(base: AdaptiveFollowParams, stats: FollowRuntimeStats): AdaptiveFollowParams {
  const fastSpeech = stats.tokensPerSecond > 6 || stats.charsPerSecond > 7
  const noisyOrUnstable = stats.avgConfidence < 0.55 || stats.offScriptCount > Math.max(2, stats.recoveryCount + 2)
  const delayedAsr = stats.avgChunkIntervalMs > 900

  return {
    ...base,
    candidateWindow: clamp(base.candidateWindow + (fastSpeech ? 45 : 0) + (delayedAsr ? 30 : 0), 60, 180),
    localCandidateThreshold: clamp(base.localCandidateThreshold + (noisyOrUnstable ? 0.06 : 0), 0.62, 0.88),
    recoveryCandidateThreshold: clamp(base.recoveryCandidateThreshold + (noisyOrUnstable ? 0.08 : 0), 0.58, 0.86),
    timestampCorrectionThreshold: clamp(base.timestampCorrectionThreshold - (delayedAsr ? 0.05 : 0), 0.38, 0.7),
    minRecoveryHits: noisyOrUnstable ? Math.max(base.minRecoveryHits, 3) : base.minRecoveryHits,
    maxPredictionMs: clamp(base.maxPredictionMs + (delayedAsr ? 400 : 0), 600, 1800),
    jumpPenalty: clamp(base.jumpPenalty + (noisyOrUnstable ? 0.08 : 0), 0.08, 0.32),
    backwardPenalty: clamp(base.backwardPenalty + (noisyOrUnstable ? 0.06 : 0), 0.1, 0.32),
    maxLocalLeadTokens: clamp(base.maxLocalLeadTokens + (fastSpeech ? 8 : 0), 12, 36),
    minLocalMatchTokens: base.minLocalMatchTokens,
  }
}

function updateCandidateTracks(
  tracks: CandidateTrack[],
  candidates: FollowCandidate[],
  now: number
): CandidateTrack[] {
  const liveTracks = tracks
    .filter((track) => now - track.lastSeenAt <= TRACK_TTL_MS)
    .map((track) => ({ ...track, consecutiveHits: 0 }))

  for (const candidate of candidates) {
    if (candidate.source === "dtw") continue
    const id = createTrackId(candidate)
    const existing = liveTracks.find((track) => track.id === id)
    if (existing) {
      existing.lastOffset = candidate.readOffset
      existing.hitCount += 1
      existing.consecutiveHits += 1
      existing.avgConfidence = rollingAverage(existing.avgConfidence, candidate.confidence, existing.hitCount)
      existing.lastSeenAt = now
    } else {
      liveTracks.push({
        id,
        source: candidate.source,
        lastOffset: candidate.readOffset,
        hitCount: 1,
        consecutiveHits: 1,
        avgConfidence: candidate.confidence,
        firstSeenAt: now,
        lastSeenAt: now,
      })
    }
  }

  return liveTracks
    .sort((a, b) => b.consecutiveHits - a.consecutiveHits || b.avgConfidence - a.avgConfidence)
    .slice(0, MAX_CANDIDATES)
}

function createTrackId(candidate: FollowCandidate): string {
  const bucket = Math.floor(candidate.readOffset / TRACK_OFFSET_BUCKET)
  return `${candidate.source}:${candidate.segmentIndex}:${bucket}`
}

function isCandidateAccepted(
  candidate: FollowCandidate,
  params: AdaptiveFollowParams,
  tracks: CandidateTrack[],
  dtwIsOnScript: boolean
): boolean {
  if (candidate.source === "dtw") return dtwIsOnScript
  if (candidate.source === "timestamp") {
    return candidate.confidence >= params.timestampCorrectionThreshold
  }
  if (candidate.source === "local") {
    return candidate.confidence >= params.localCandidateThreshold
  }

  const track = tracks.find((item) => item.id === createTrackId(candidate))
  const strongSingleHit = candidate.matchedTokens >= Math.max(6, Math.ceil(candidate.totalTokens * 0.75))
  return candidate.confidence >= params.recoveryCandidateThreshold
    && (strongSingleHit || (track?.consecutiveHits ?? 0) >= params.minRecoveryHits)
}

function toDecision(candidate: FollowCandidate, dtwIsOnScript: boolean): FollowDecision {
  if (candidate.source === "dtw") return dtwIsOnScript ? "dtw" : "hold"
  if (candidate.source === "local") return "local-candidate"
  if (candidate.source === "recovery") return "recovery-candidate"
  return "timestamp"
}

function buildDecisionReason(
  candidate: FollowCandidate,
  dtwIsOnScript: boolean,
  tracks: CandidateTrack[]
): string {
  if (candidate.source === "dtw") {
    return dtwIsOnScript ? "dtw-on-script" : "dtw-off-script-hold"
  }
  const track = tracks.find((item) => item.id === createTrackId(candidate))
  return `${candidate.source}:score=${candidate.score.toFixed(2)};hits=${track?.consecutiveHits ?? 0}`
}

function computePredictedReadOffset(input: {
  confirmedReadOffset: number
  status: FollowStatus
  stats: FollowRuntimeStats
  params: AdaptiveFollowParams
  now: number
}): number | undefined {
  const { confirmedReadOffset, status, stats, params, now } = input
  if (status !== "following" || stats.lastConfirmedAt <= 0 || stats.charsPerSecond <= 0) {
    return undefined
  }

  const predictionMs = Math.min(Math.max(0, now - stats.lastConfirmedAt), params.maxPredictionMs)
  if (predictionMs < 300) return undefined

  const predictedAdvance = Math.floor(stats.charsPerSecond * (predictionMs / 1000))
  if (predictedAdvance <= 0) return undefined

  return confirmedReadOffset + predictedAdvance
}

function refreshUpdateSnapshots(
  update: FollowUpdate,
  stats: FollowRuntimeStats,
  params: AdaptiveFollowParams
): FollowUpdate {
  return createUpdate({
    ...update,
    statsSnapshot: snapshotStats(stats),
    paramsSnapshot: { ...params },
  })
}

function refreshPrediction(
  update: FollowUpdate,
  stats: FollowRuntimeStats,
  params: AdaptiveFollowParams
): FollowUpdate {
  const predictedReadOffset = computePredictedReadOffset({
    confirmedReadOffset: update.confirmedReadOffset,
    status: update.status,
    stats,
    params,
    now: Date.now(),
  })

  return createUpdate({
    ...update,
    predictedReadOffset,
    displayReadOffset: predictedReadOffset ?? update.confirmedReadOffset,
    decision: predictedReadOffset ? "prediction" : update.decision,
    reason: predictedReadOffset ? "speech-rate-prediction" : update.reason,
    statsSnapshot: snapshotStats(stats),
    paramsSnapshot: { ...params },
  })
}

function createUpdate(update: Omit<FollowUpdate, "readOffset">): FollowUpdate {
  return {
    ...update,
    readOffset: update.displayReadOffset,
  }
}

function findTokenIndexByOffset(index: ScriptIndex, targetOffset: number): number {
  let best = 0
  let bestDist = Math.abs((index.offsets[0] ?? 0) - targetOffset)

  for (let i = 1; i < index.offsets.length; i += 1) {
    const offset = index.offsets[i]
    const dist = Math.abs(offset - targetOffset)
    if (dist < bestDist || (dist === bestDist && offset >= targetOffset)) {
      bestDist = dist
      best = i
    }
  }

  return best
}

export function getSegmentTextStartOffset(script: string, segment: ScriptSegment) {
  const originalSlice = script.slice(segment.startOffset, segment.endOffset)
  const leadingWhitespaceLength = originalSlice.length - originalSlice.trimStart().length
  return segment.startOffset + leadingWhitespaceLength
}

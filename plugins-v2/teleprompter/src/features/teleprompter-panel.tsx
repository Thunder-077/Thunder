import { segmentScript } from "../../../../packages/teleprompter-core/src/index"
import type { FollowStatus } from "../../../../packages/teleprompter-core/src/index"
import type { SpeechProvider } from "../../../../packages/teleprompter-core/src/speech-types"
import {
  TeleprompterDocumentEditor,
  TeleprompterSegmentPreviewList,
  useFollowReadSession,
  usePersistedTeleprompterDocument,
  useTeleprompterDocumentSession,
} from "../../../../packages/teleprompter-ui/src/index"
import React, { useCallback, useEffect, useMemo, useState } from "react"
import {
  readPluginTeleprompterDocument,
  writePluginTeleprompterDocument,
} from "../adapters/document-storage"
import { pluginSpeechRuntime } from "../adapters/plugin-speech-runtime"
import type { SpeechRuntimeHealthResult, SpeechWorkerModelRecord } from "../adapters/speech-worker-types"
import { usePluginFollowSpeech } from "./use-plugin-follow-speech"

/**
 * 插件面板优先验证新插件系统下的真实开发链路：
 * 文稿持久化、shared UI、follow session，以及 trusted worker 语音桥接。
 */
export function TeleprompterPanel() {
  const [runtimeHealth, setRuntimeHealth] = useState<SpeechRuntimeHealthResult | null>(null)
  const [runtimeModels, setRuntimeModels] = useState<SpeechWorkerModelRecord[]>([])
  const [manualTranscript, setManualTranscript] = useState("")
  const [speechProvider, setSpeechProvider] = useState<SpeechProvider>("web-speech")
  const [runtimeBusy, setRuntimeBusy] = useState(false)
  const [runtimeMessage, setRuntimeMessage] = useState<string | null>(null)
  const [selectedSherpaModelId, setSelectedSherpaModelId] = useState<string | null>(null)
  const {
    script,
    scriptDraft,
    hydrateScript,
    beginEditing,
    commitDraft,
    isEditingScript,
    setScriptDraft,
  } = useTeleprompterDocumentSession()
  const segments = useMemo(() => segmentScript(script), [script])
  const characterCount = Array.from(scriptDraft).length
  const handleHydrate = useCallback((persisted: { script: string; scriptDraft: string }) => {
    hydrateScript(persisted.script, persisted.scriptDraft)
  }, [hydrateScript])
  const { hydrated, lastSavedAt } = usePersistedTeleprompterDocument({
    snapshot: {
      script,
      scriptDraft,
    },
    readDocument: readPluginTeleprompterDocument,
    writeDocument: writePluginTeleprompterDocument,
    onHydrate: handleHydrate,
  })
  const speech = usePluginFollowSpeech(speechProvider)
  const followEngine = useMemo(() => script ? createPluginFollowEngine(script, segments) : null, [script, segments])
  const installedSherpaModels = useMemo(
    () => runtimeModels.filter((model) => model.installed),
    [runtimeModels],
  )
  const selectedSherpaModel = useMemo(
    () => runtimeModels.find((model) => model.id === selectedSherpaModelId) ?? null,
    [runtimeModels, selectedSherpaModelId],
  )
  const hasInstalledSherpaModel = installedSherpaModels.length > 0
  const {
    followStatus,
    currentIndex,
    confidence,
    isOnScript,
    message,
    finalTranscript,
    interimTranscript,
    startFollowing,
    pauseFollowing,
    resumeFollowing,
    stopFollowing,
    returnToStart,
  } = useFollowReadSession({
    speech,
    followEngine,
    canFollow: segments.length > 0,
    speechProvider,
    hasInstalledSherpaModel,
  })

  const syncRuntimeModels = useCallback((models: SpeechWorkerModelRecord[]) => {
    setRuntimeModels(models)
    setSelectedSherpaModelId((current) => {
      if (current && models.some((model) => model.id === current)) {
        return current
      }

      return models[0]?.id ?? null
    })
  }, [])

  const loadRuntimeState = useCallback(async () => {
    const [health, models] = await Promise.all([
      pluginSpeechRuntime.checkHealth(),
      pluginSpeechRuntime.listModels(),
    ])
    setRuntimeHealth(health)
    syncRuntimeModels(models)
  }, [syncRuntimeModels])

  useEffect(() => {
    let cancelled = false

    void loadRuntimeState().catch(() => {
      if (cancelled) {
        return
      }

      setRuntimeHealth({
        available: false,
        transport: "trusted-worker",
        capabilities: {
          modelManagement: false,
          realtimeRecognition: false,
          sessionControl: false,
        },
        reason: "Trusted worker runtime request failed.",
      })
      syncRuntimeModels([])
    })

    return () => {
      cancelled = true
    }
  }, [loadRuntimeState, syncRuntimeModels])

  const savedLabel = lastSavedAt
    ? new Date(lastSavedAt).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "未保存"
  const transcriptLabel = `${finalTranscript.slice(-120)}${interimTranscript}`.trim()

  const submitManualTranscript = async () => {
    const nextTranscript = manualTranscript.trim()
    if (!nextTranscript) {
      return
    }

    await speech.submitTranscript(nextTranscript)
    setManualTranscript("")
  }

  const refreshRuntimeModels = async () => {
    setRuntimeBusy(true)
    try {
      await loadRuntimeState()
      setRuntimeMessage("Sherpa 模型列表已刷新。")
    } catch (error) {
      setRuntimeMessage(error instanceof Error ? error.message : "Sherpa 模型列表刷新失败。")
    } finally {
      setRuntimeBusy(false)
    }
  }

  const downloadSelectedSherpaModel = async () => {
    if (!selectedSherpaModelId) {
      setRuntimeMessage("请先选择一个 Sherpa 模型。")
      return
    }

    setRuntimeBusy(true)
    try {
      const models = await pluginSpeechRuntime.downloadModel({ modelId: selectedSherpaModelId })
      syncRuntimeModels(models)
      setRuntimeMessage("Sherpa 模型下载已启动。")
    } catch (error) {
      setRuntimeMessage(error instanceof Error ? error.message : "Sherpa 模型下载失败。")
    } finally {
      setRuntimeBusy(false)
    }
  }

  const activateSelectedSherpaModel = async () => {
    if (!selectedSherpaModelId) {
      setRuntimeMessage("请先选择一个 Sherpa 模型。")
      return
    }

    setRuntimeBusy(true)
    try {
      const models = await pluginSpeechRuntime.activateModel({ modelId: selectedSherpaModelId })
      syncRuntimeModels(models)
      setRuntimeMessage("Sherpa 模型已激活。")
      await loadRuntimeState()
    } catch (error) {
      setRuntimeMessage(error instanceof Error ? error.message : "Sherpa 模型激活失败。")
    } finally {
      setRuntimeBusy(false)
    }
  }

  return (
    <section
      style={{
        height: "100%",
        padding: 20,
        display: "grid",
        gridTemplateRows: "auto auto minmax(0, 1fr)",
        gap: 16,
        background: "linear-gradient(180deg, rgba(248,250,252,0.96), rgba(241,245,249,0.88))",
      }}
    >
      <header style={{ display: "grid", gap: 8 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>提词器</h1>
        <p style={{ margin: 0, color: "#475569", lineHeight: 1.6 }}>
          这是新插件系统下的独立面板。当前已经接入持久化文稿编辑、段落预览，以及插件侧麦克风 PCM 到 trusted worker 的传输链路；实时识别仍等待 worker 内 ASR 后端落地。
        </p>
      </header>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <PanelStat label="状态" value={hydrated ? "已就绪" : "加载中"} />
        <PanelStat label="字符数" value={String(characterCount)} />
        <PanelStat label="段落数" value={String(segments.length)} />
        <PanelStat label="运行时" value={runtimeHealth?.available ? "已连接" : "未就绪"} />
        <PanelStat label="模型数" value={String(runtimeModels.length)} />
        <PanelStat label="语音提供方" value={speechProvider} />
        <PanelStat label="跟读状态" value={followStatus} />
        <PanelStat label="最近保存" value={savedLabel} />
      </div>

      <div
        style={{
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: "minmax(320px, 1fr) minmax(320px, 1fr)",
          gap: 16,
        }}
      >
        <section
          style={{
            minHeight: 0,
            display: "grid",
            gap: 10,
            border: "1px solid rgba(148,163,184,0.24)",
            borderRadius: 18,
            padding: 16,
            background: "rgba(255,255,255,0.9)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <strong style={{ fontSize: 14 }}>提词稿</strong>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => beginEditing()} style={secondaryButtonStyle}>
                {isEditingScript ? "编辑中" : "编辑稿件"}
              </button>
              <button type="button" onClick={() => commitDraft()} style={secondaryButtonStyle}>
                保存稿件
              </button>
            </div>
          </div>
          <TeleprompterDocumentEditor
            value={scriptDraft}
            onChange={setScriptDraft}
            placeholder="输入或粘贴你的提词稿。"
            textareaStyle={{
              minHeight: 0,
              height: "100%",
              width: "100%",
              resize: "none",
              border: "1px solid rgba(148,163,184,0.24)",
              borderRadius: 14,
              padding: 14,
              fontSize: 16,
              lineHeight: 1.7,
              outline: "none",
              background: "#fff",
              color: "#0f172a",
            }}
          />
          <div
            style={{
              display: "grid",
              gap: 10,
              borderRadius: 14,
              border: "1px solid rgba(148,163,184,0.18)",
              background: "rgba(248,250,252,0.96)",
              padding: "12px 14px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <strong style={{ color: "#0f172a", fontSize: 13 }}>Follow Read</strong>
              <span style={{ fontSize: 12, color: "#64748b" }}>
                已接入真实麦克风音频传输，手动文本提交仅作为识别后端未完成时的调试兜底
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button
                type="button"
                onClick={() => setSpeechProvider("web-speech")}
                style={speechProvider === "web-speech" ? primaryButtonStyle : secondaryButtonStyle}
              >
                Web Speech
              </button>
              <button
                type="button"
                onClick={() => setSpeechProvider("sherpa-onnx")}
                style={speechProvider === "sherpa-onnx" ? primaryButtonStyle : secondaryButtonStyle}
              >
                Sherpa ONNX
              </button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button type="button" onClick={() => void startFollowing()} style={primaryButtonStyle}>开始</button>
              <button type="button" onClick={pauseFollowing} style={secondaryButtonStyle}>暂停</button>
              <button type="button" onClick={() => void resumeFollowing()} style={secondaryButtonStyle}>继续</button>
              <button type="button" onClick={stopFollowing} style={secondaryButtonStyle}>停止</button>
              <button type="button" onClick={returnToStart} style={secondaryButtonStyle}>回到开头</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
              <input
                value={manualTranscript}
                onChange={(event) => setManualTranscript(event.target.value)}
                placeholder="输入一段识别结果，模拟 trusted worker 回传"
                style={textInputStyle}
              />
              <button type="button" onClick={() => void submitManualTranscript()} style={primaryButtonStyle}>
                提交识别
              </button>
            </div>
            <div style={{ display: "grid", gap: 6, fontSize: 12, color: "#475569", lineHeight: 1.6 }}>
              <div>状态: <strong>{followStatus}</strong></div>
              <div>当前引擎: {speechProvider}</div>
              <div>Sherpa 可用模型: {installedSherpaModels.length}</div>
              <div>当前位置: 第 {segments.length === 0 ? 0 : currentIndex + 1} 段</div>
              <div>命中置信度: {confidence.toFixed(2)}</div>
              <div>是否在稿: {isOnScript ? "是" : "否"}</div>
              <div>音频采集: {speech.streamingActive ? "进行中" : "未采集"}</div>
              <div>已发送采样: {speech.streamedSamples}</div>
              <div>当前消息: {message ?? speech.error ?? "无"}</div>
              <div>识别文本: {transcriptLabel || "暂无"}</div>
            </div>
          </div>
          <div
            style={{
              borderRadius: 14,
              border: "1px solid rgba(148,163,184,0.18)",
              background: "rgba(248,250,252,0.96)",
              padding: "12px 14px",
              fontSize: 12,
              lineHeight: 1.6,
              color: "#475569",
            }}
          >
            <strong style={{ display: "block", marginBottom: 6, color: "#0f172a" }}>Trusted Worker Runtime</strong>
            <div>Transport: `{runtimeHealth?.transport ?? "trusted-worker"}`</div>
            <div>Model Management: {runtimeHealth?.capabilities.modelManagement ? "ready" : "disabled"}</div>
            <div>Realtime Recognition: {runtimeHealth?.capabilities.realtimeRecognition ? "ready" : "pending backend"}</div>
            <div>Session Control: {runtimeHealth?.capabilities.sessionControl ? "ready" : "disabled"}</div>
            {runtimeHealth?.reason ? <div style={{ marginTop: 6 }}>{runtimeHealth.reason}</div> : null}
          </div>
          <div
            style={{
              display: "grid",
              gap: 10,
              borderRadius: 14,
              border: "1px solid rgba(148,163,184,0.18)",
              background: "rgba(248,250,252,0.96)",
              padding: "12px 14px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <strong style={{ color: "#0f172a", fontSize: 13 }}>Sherpa 模型管理</strong>
              <button type="button" onClick={() => void refreshRuntimeModels()} style={secondaryButtonStyle}>
                {runtimeBusy ? "处理中" : "刷新模型"}
              </button>
            </div>
            <select
              value={selectedSherpaModelId ?? ""}
              onChange={(event) => setSelectedSherpaModelId(event.target.value || null)}
              style={selectStyle}
              disabled={runtimeBusy || runtimeModels.length === 0}
            >
              {runtimeModels.length === 0 ? <option value="">暂无模型</option> : null}
              {runtimeModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} · {model.language} · {model.installed ? "已安装" : "未安装"}
                </option>
              ))}
            </select>
            {selectedSherpaModel ? (
              <div style={{ display: "grid", gap: 6, fontSize: 12, color: "#475569", lineHeight: 1.6 }}>
                <div>描述: {selectedSherpaModel.description ?? "无"}</div>
                <div>大小: {selectedSherpaModel.size}</div>
                <div>运行时: {selectedSherpaModel.runtime}</div>
                <div>安装状态: {selectedSherpaModel.installed ? "已安装" : "未安装"}</div>
                <div>激活状态: {selectedSherpaModel.active ? "当前激活" : "未激活"}</div>
                {selectedSherpaModel.downloading && selectedSherpaModel.downloadProgress ? (
                  <div>
                    下载进度: {selectedSherpaModel.downloadProgress.percentage}% · {selectedSherpaModel.downloadProgress.status}
                  </div>
                ) : null}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "#64748b" }}>当前没有可用的 Sherpa 模型。</div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button
                type="button"
                onClick={() => void downloadSelectedSherpaModel()}
                style={primaryButtonStyle}
                disabled={runtimeBusy || !selectedSherpaModel || selectedSherpaModel.installed || Boolean(selectedSherpaModel?.downloading)}
              >
                下载模型
              </button>
              <button
                type="button"
                onClick={() => void activateSelectedSherpaModel()}
                style={secondaryButtonStyle}
                disabled={runtimeBusy || !selectedSherpaModel || !selectedSherpaModel.installed || selectedSherpaModel.active}
              >
                激活模型
              </button>
            </div>
            {runtimeMessage ? <div style={{ fontSize: 12, color: "#475569" }}>{runtimeMessage}</div> : null}
          </div>
        </section>

        <section
          style={{
            minHeight: 0,
            display: "grid",
            gap: 10,
            border: "1px solid rgba(148,163,184,0.24)",
            borderRadius: 18,
            padding: 16,
            background: "rgba(15,23,42,0.96)",
            color: "#e2e8f0",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <strong style={{ fontSize: 14, color: "#f8fafc" }}>提词预览</strong>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>基于核心分段器实时生成</span>
          </div>
          <div
            style={{
              minHeight: 0,
              overflow: "auto",
              display: "grid",
              alignContent: "start",
              gap: 12,
            }}
          >
            <TeleprompterSegmentPreviewList
              segments={segments}
              activeIndex={segments.length === 0 ? null : currentIndex}
              listStyle={{
                display: "grid",
                alignContent: "start",
                gap: 12,
              }}
              emptyStyle={{
                border: "1px dashed rgba(148,163,184,0.28)",
                borderRadius: 14,
                padding: 16,
                color: "#94a3b8",
              }}
              itemStyle={{
                borderLeft: "3px solid rgba(34,211,238,0.7)",
                padding: "4px 0 4px 12px",
              }}
              activeItemStyle={{
                borderLeft: "3px solid rgba(250,204,21,0.95)",
                background: "rgba(250,204,21,0.08)",
              }}
              itemLabelStyle={{
                fontSize: 11,
                color: "#94a3b8",
                marginBottom: 6,
              }}
              activeItemLabelStyle={{
                color: "#fef08a",
              }}
              itemTextStyle={{
                fontSize: 20,
                lineHeight: 1.7,
                letterSpacing: "0.01em",
              }}
              activeItemTextStyle={{
                color: "#f8fafc",
              }}
            />
          </div>
        </section>
      </div>
    </section>
  )
}

function createPluginFollowEngine(script: string, segments: ReturnType<typeof segmentScript>) {
  return {
    push(text: string, isFinal: boolean) {
      const normalized = text.trim()
      const lowerScript = script.toLowerCase()
      const lowerText = normalized.toLowerCase()
      const matchedOffset = lowerText ? lowerScript.indexOf(lowerText) : -1
      const displayReadOffset = matchedOffset >= 0 ? matchedOffset + normalized.length : 0
      const segmentIndex = matchedOffset >= 0
        ? Math.max(
            0,
            segments.findIndex((segment) => displayReadOffset <= segment.endOffset),
          )
        : 0
      const isOnScript = matchedOffset >= 0
      const status: FollowStatus = isOnScript
        ? (isFinal ? "following" : "listening")
        : "off-script"

      return {
        confidence: isOnScript ? 0.92 : 0.15,
        isOnScript,
        segmentIndex,
        displayReadOffset,
        status,
        message: isOnScript ? null : "当前识别文本未命中提词稿",
      }
    },
    transitionStatus() {
      return undefined
    },
    reset() {
      return undefined
    },
    jump(selectedOffset: number) {
      const segmentIndex = Math.max(
        0,
        segments.findIndex((segment) => selectedOffset <= segment.endOffset),
      )
      return {
        confidence: 1,
        isOnScript: true,
        segmentIndex,
      }
    },
  }
}

const primaryButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(59,130,246,0.24)",
  background: "rgba(59,130,246,0.12)",
  color: "#1d4ed8",
  borderRadius: 999,
  padding: "8px 14px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
}

const secondaryButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.24)",
  background: "rgba(255,255,255,0.88)",
  color: "#334155",
  borderRadius: 999,
  padding: "8px 14px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
}

const textInputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid rgba(148,163,184,0.24)",
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 14,
  lineHeight: 1.5,
  outline: "none",
  background: "#fff",
  color: "#0f172a",
}

const selectStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid rgba(148,163,184,0.24)",
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 14,
  lineHeight: 1.5,
  outline: "none",
  background: "#fff",
  color: "#0f172a",
}

type PanelStatProps = {
  label: string
  value: string
}

function PanelStat({ label, value }: PanelStatProps) {
  return (
    <div
      style={{
        minWidth: 110,
        border: "1px solid rgba(148,163,184,0.24)",
        borderRadius: 999,
        padding: "8px 12px",
        background: "rgba(255,255,255,0.8)",
      }}
    >
      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{value}</div>
    </div>
  )
}

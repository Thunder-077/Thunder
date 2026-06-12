import type { CSSProperties, ReactNode } from "react"
import { Badge, Card, CardContent, Separator } from "@thunder/plugin-ui"
import { PluginRpcLog, type PluginRpcLogEntry } from "./plugin-rpc-log"

export type PluginWorkerStatus = {
  phase: "stopped" | "starting" | "running" | "degraded" | "crashed" | "stopping"
  running: boolean
  pid?: number
  startedAt?: string
  consecutiveCrashCount: number
  circuitOpenUntil?: string
  lastError?: string | null
}

export type PluginDiagnosticItem = {
  label: string
  value: string
  tone?: "default" | "warning" | "danger"
}

export type PluginStorageEntry = {
  key: string
  value: unknown
}

export type PluginLogEntry = {
  id: string
  level: "info" | "warn" | "error"
  message: string
  at: string
}

export type PluginDevtoolsPanelProps = {
  manifest: unknown
  permissions: string[]
  rpcCalls: PluginRpcLogEntry[]
  workerStatus: PluginWorkerStatus
  logs: PluginLogEntry[]
  storage: PluginStorageEntry[]
  diagnostics: PluginDiagnosticItem[]
}

/**
 * 这是 phase-one 的 devtools 基础面板。
 * 它先固定覆盖 spec 里要求的关键诊断区块，再由宿主决定如何接入真实数据源。
 */
export function PluginDevtoolsPanel({
  manifest,
  permissions,
  rpcCalls,
  workerStatus,
  logs,
  storage,
  diagnostics,
}: PluginDevtoolsPanelProps) {
  return (
    <div style={panelStyle}>
      <Section title="Manifest">
        <JsonPreview value={manifest} />
      </Section>

      <Section title="Permissions">
        <div style={badgeListStyle}>
          {permissions.length === 0 ? <MutedText>当前插件没有声明额外权限。</MutedText> : null}
          {permissions.map((permission) => (
            <Badge key={permission} variant="secondary">
              {permission}
            </Badge>
          ))}
        </div>
      </Section>

      <Section title="RPC Calls">
        <PluginRpcLog entries={rpcCalls} />
      </Section>

      <Section title="Worker Status">
        <Card>
          <CardContent>
            <div style={statusRowStyle}>
              <span>State</span>
              <Badge variant={workerStatus.running ? "secondary" : "outline"}>
                {workerStatus.running ? "running" : "stopped"}
              </Badge>
            </div>
            <Separator className="my-3" />
            <InfoGrid
              rows={[
                { label: "PID", value: workerStatus.pid?.toString() ?? "N/A" },
                { label: "Started At", value: workerStatus.startedAt ?? "N/A" },
                { label: "Crash Count", value: workerStatus.consecutiveCrashCount.toString() },
                { label: "Circuit Until", value: workerStatus.circuitOpenUntil ?? "N/A" },
                { label: "Last Error", value: workerStatus.lastError ?? "none" },
              ]}
            />
          </CardContent>
        </Card>
      </Section>

      <Section title="Logs">
        <Card>
          <CardContent>
            {logs.length === 0 ? <MutedText>当前没有日志输出。</MutedText> : null}
            <div style={logListStyle}>
              {logs.map((entry) => (
                <div key={entry.id} style={logEntryStyle}>
                  <div style={logMetaStyle}>
                    <Badge variant={entry.level === "error" ? "outline" : "secondary"}>
                      {entry.level}
                    </Badge>
                    <span>{entry.at}</span>
                  </div>
                  <div>{entry.message}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section title="Storage">
        <Card>
          <CardContent>
            {storage.length === 0 ? <MutedText>当前插件没有存储数据。</MutedText> : null}
            <div style={storageListStyle}>
              {storage.map((entry) => (
                <div key={entry.key} style={storageEntryStyle}>
                  <div style={storageKeyStyle}>{entry.key}</div>
                  <JsonPreview value={entry.value} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section title="Diagnostics">
        <Card>
          <CardContent>
            {diagnostics.length === 0 ? <MutedText>当前没有额外诊断项。</MutedText> : null}
            <div style={diagnosticListStyle}>
              {diagnostics.map((item) => (
                <div key={item.label} style={diagnosticItemStyle}>
                  <div style={diagnosticLabelStyle}>{item.label}</div>
                  <div style={getDiagnosticValueStyle(item.tone)}>{item.value}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </Section>
    </div>
  )
}

type SectionProps = {
  title: string
  children: ReactNode
}

function Section({ title, children }: SectionProps) {
  return (
    <section style={sectionStyle}>
      <div style={sectionTitleStyle}>{title}</div>
      {children}
    </section>
  )
}

type InfoGridProps = {
  rows: Array<{ label: string; value: string }>
}

function InfoGrid({ rows }: InfoGridProps) {
  return (
    <div style={infoGridStyle}>
      {rows.map((row) => (
        <div key={row.label} style={infoRowStyle}>
          <div style={infoLabelStyle}>{row.label}</div>
          <div style={infoValueStyle}>{row.value}</div>
        </div>
      ))}
    </div>
  )
}

type JsonPreviewProps = {
  value: unknown
}

function JsonPreview({ value }: JsonPreviewProps) {
  return <pre style={jsonPreviewStyle}>{formatJson(value)}</pre>
}

function MutedText({ children }: { children: ReactNode }) {
  return <div style={mutedTextStyle}>{children}</div>
}

function formatJson(value: unknown): string {
  if (value === undefined) {
    return "undefined"
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function getDiagnosticValueStyle(tone: PluginDiagnosticItem["tone"]): CSSProperties {
  if (tone === "warning") {
    return { ...diagnosticValueStyle, color: "#b45309" }
  }
  if (tone === "danger") {
    return { ...diagnosticValueStyle, color: "#b91c1c" }
  }

  return diagnosticValueStyle
}

const panelStyle: CSSProperties = {
  display: "grid",
  gap: 20,
}

const sectionStyle: CSSProperties = {
  display: "grid",
  gap: 10,
}

const sectionTitleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
}

const badgeListStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
}

const statusRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
}

const infoGridStyle: CSSProperties = {
  display: "grid",
  gap: 10,
}

const infoRowStyle: CSSProperties = {
  display: "grid",
  gap: 4,
}

const infoLabelStyle: CSSProperties = {
  color: "var(--muted-foreground)",
  fontSize: 12,
  fontWeight: 600,
}

const infoValueStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.6,
}

const mutedTextStyle: CSSProperties = {
  color: "var(--muted-foreground)",
  fontSize: 13,
  lineHeight: 1.6,
}

const jsonPreviewStyle: CSSProperties = {
  margin: 0,
  padding: 14,
  borderRadius: 12,
  background: "rgba(15, 23, 42, 0.04)",
  fontSize: 12,
  lineHeight: 1.5,
  overflowX: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
}

const logListStyle: CSSProperties = {
  display: "grid",
  gap: 10,
}

const logEntryStyle: CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "rgba(15, 23, 42, 0.04)",
  fontSize: 13,
  lineHeight: 1.6,
}

const logMetaStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 6,
  color: "var(--muted-foreground)",
  fontSize: 12,
}

const storageListStyle: CSSProperties = {
  display: "grid",
  gap: 12,
}

const storageEntryStyle: CSSProperties = {
  display: "grid",
  gap: 6,
}

const storageKeyStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
}

const diagnosticListStyle: CSSProperties = {
  display: "grid",
  gap: 10,
}

const diagnosticItemStyle: CSSProperties = {
  display: "grid",
  gap: 4,
}

const diagnosticLabelStyle: CSSProperties = {
  color: "var(--muted-foreground)",
  fontSize: 12,
  fontWeight: 600,
}

const diagnosticValueStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.6,
}

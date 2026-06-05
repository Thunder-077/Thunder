import type { CSSProperties } from "react"
import { Badge, Card, CardContent } from "@thunder/plugin-ui"

export type PluginRpcLogEntry = {
  id: string
  method: string
  status: "ok" | "error"
  durationMs: number
  at: string
  payload?: unknown
  result?: unknown
  errorMessage?: string | null
}

export type PluginRpcLogProps = {
  entries: PluginRpcLogEntry[]
  emptyMessage?: string
}

/**
 * RPC 日志列表独立导出，方便宿主按需嵌入到更细粒度的调试视图中。
 */
export function PluginRpcLog({
  entries,
  emptyMessage = "当前还没有 RPC 调用记录。",
}: PluginRpcLogProps) {
  if (entries.length === 0) {
    return (
      <Card>
        <CardContent>
          <div style={emptyStateStyle}>{emptyMessage}</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div style={stackStyle}>
      {entries.map((entry) => (
        <Card key={entry.id}>
          <CardContent>
            <div style={entryHeaderStyle}>
              <div style={entryTitleStyle}>
                <strong>{entry.method}</strong>
                <Badge variant={entry.status === "ok" ? "secondary" : "outline"}>
                  {entry.status === "ok" ? "OK" : "ERROR"}
                </Badge>
              </div>
              <div style={metaStyle}>
                <span>{entry.durationMs}ms</span>
                <span>{entry.at}</span>
              </div>
            </div>
            <div style={detailsGridStyle}>
              <LogBlock label="Payload" value={entry.payload} />
              <LogBlock label="Result" value={entry.result} />
            </div>
            {entry.errorMessage ? (
              <div style={errorStyle}>
                <strong>Error:</strong> {entry.errorMessage}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

type LogBlockProps = {
  label: string
  value: unknown
}

function LogBlock({ label, value }: LogBlockProps) {
  return (
    <div style={blockStyle}>
      <div style={blockLabelStyle}>{label}</div>
      <pre style={preStyle}>{formatJson(value)}</pre>
    </div>
  )
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

const stackStyle: CSSProperties = {
  display: "grid",
  gap: 12,
}

const emptyStateStyle: CSSProperties = {
  color: "var(--muted-foreground)",
  fontSize: 13,
  lineHeight: 1.6,
}

const entryHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginBottom: 12,
}

const entryTitleStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 14,
}

const metaStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  color: "var(--muted-foreground)",
  fontSize: 12,
}

const detailsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
}

const blockStyle: CSSProperties = {
  display: "grid",
  gap: 6,
}

const blockLabelStyle: CSSProperties = {
  color: "var(--muted-foreground)",
  fontSize: 12,
  fontWeight: 600,
}

const preStyle: CSSProperties = {
  margin: 0,
  padding: 12,
  borderRadius: 12,
  background: "rgba(15, 23, 42, 0.04)",
  color: "var(--foreground)",
  fontSize: 12,
  lineHeight: 1.5,
  overflowX: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
}

const errorStyle: CSSProperties = {
  marginTop: 12,
  color: "#b91c1c",
  fontSize: 12,
  lineHeight: 1.6,
}

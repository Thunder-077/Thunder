import React from "react"

/**
 * 这是 v2 插件侧的独立面板骨架。
 * 真正的业务 UI 会继续迁移到公开包里，这里先保证插件不直接依赖主应用私有源码。
 */
export function TeleprompterPanel() {
  return (
    <section style={{ padding: 20, display: "grid", gap: 12 }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 24 }}>提词器</h1>
        <p style={{ margin: "8px 0 0", color: "#666" }}>
          v2 插件骨架已接入。下一步继续把编辑、跟读和自动滚动能力迁移到公开插件包。
        </p>
      </header>
      <div
        style={{
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 12,
          padding: 16,
          background: "rgba(0,0,0,0.02)",
        }}
      >
        当前插件已使用公开 SDK 注册 sidebar panel、命令和 trusted worker。
      </div>
    </section>
  )
}

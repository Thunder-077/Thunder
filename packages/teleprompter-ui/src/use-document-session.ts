import { useCallback, useState } from "react"

type UseTeleprompterDocumentSessionOptions = {
  initialScript?: string
}

type BeginEditingOptions = {
  onBeforeEdit?: () => void
}

type CommitDraftOptions = {
  onUnchanged?: () => void
  onCommitted?: (nextScript: string) => void
}

type ReplaceScriptOptions = {
  onReplaced?: (nextScript: string) => void
}

/**
 * 管理提词稿的提交态、草稿态和编辑态，统一主应用与插件的文稿会话行为。
 */
export function useTeleprompterDocumentSession({
  initialScript = "",
}: UseTeleprompterDocumentSessionOptions = {}) {
  const [script, setScript] = useState(initialScript)
  const [scriptDraft, setScriptDraft] = useState(initialScript)
  const [isEditingScript, setIsEditingScript] = useState(false)

  const hydrateScript = useCallback((nextScript: string, nextDraft?: string) => {
    setScript((current) => current || nextScript)
    setScriptDraft((current) => current || nextDraft || nextScript)
  }, [])

  const replaceScript = useCallback((nextScript: string, options?: ReplaceScriptOptions) => {
    setScript(nextScript)
    setScriptDraft(nextScript)
    setIsEditingScript(false)
    options?.onReplaced?.(nextScript)
  }, [])

  const beginEditing = useCallback((options?: BeginEditingOptions) => {
    options?.onBeforeEdit?.()
    setScriptDraft(script)
    setIsEditingScript(true)
  }, [script])

  const commitDraft = useCallback((options?: CommitDraftOptions) => {
    const nextScript = scriptDraft.trim()
    if (!nextScript) {
      return false
    }

    if (nextScript === script) {
      setIsEditingScript(false)
      options?.onUnchanged?.()
      return false
    }

    replaceScript(nextScript, {
      onReplaced: options?.onCommitted,
    })
    return true
  }, [replaceScript, script, scriptDraft])

  return {
    script,
    scriptDraft,
    isEditingScript,
    setScript,
    setScriptDraft,
    setIsEditingScript,
    hydrateScript,
    replaceScript,
    beginEditing,
    commitDraft,
  }
}

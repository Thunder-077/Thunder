export function isTauriDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

export type DesktopPlatform = "macos" | "windows" | "linux"
export type SherpaModel = {
  id: string
  name: string
  description: string
  language: string
  runtime: string
  installed: boolean
  active: boolean
}

export async function getTauriDesktopPlatform(): Promise<DesktopPlatform | null> {
  if (!isTauriDesktop()) {
    return null
  }

  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<DesktopPlatform>("get_desktop_platform")
}

export async function checkFunAsrRunning(): Promise<boolean> {
  if (!isTauriDesktop()) {
    return false
  }

  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<boolean>("check_funasr_running")
}

export async function startFunAsrService(): Promise<string> {
  if (!isTauriDesktop()) {
    throw new Error("仅桌面端支持启动 FunASR 服务")
  }

  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<string>("start_funasr_service")
}

export async function checkSherpaRunning(): Promise<boolean> {
  if (!isTauriDesktop()) {
    return false
  }

  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<boolean>("check_sherpa_running")
}

export async function listSherpaModels(): Promise<SherpaModel[]> {
  if (!isTauriDesktop()) {
    return []
  }

  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<SherpaModel[]>("list_sherpa_models")
}

export async function downloadSherpaModel(modelId: string): Promise<SherpaModel[]> {
  if (!isTauriDesktop()) {
    throw new Error("仅桌面端支持下载 sherpa-onnx 模型")
  }

  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<SherpaModel[]>("download_sherpa_model", { modelId })
}

export async function activateSherpaModel(modelId: string): Promise<SherpaModel[]> {
  if (!isTauriDesktop()) {
    throw new Error("仅桌面端支持激活 sherpa-onnx 模型")
  }

  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<SherpaModel[]>("activate_sherpa_model", { modelId })
}

export async function startSherpaService(): Promise<string> {
  if (!isTauriDesktop()) {
    throw new Error("仅桌面端支持启动 sherpa-onnx 服务")
  }

  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<string>("start_sherpa_service")
}

export function isTauriDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

export type DesktopPlatform = "macos" | "windows" | "linux"

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

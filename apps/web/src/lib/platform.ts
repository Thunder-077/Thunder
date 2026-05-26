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

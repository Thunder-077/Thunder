import { getName, getTauriVersion, getVersion } from "@tauri-apps/api/app"
import { isTauri as detectTauri } from "@tauri-apps/api/core"
import { relaunch } from "@tauri-apps/plugin-process"
import { check } from "@tauri-apps/plugin-updater"

export type PlatformFlavor = "web" | "tauri"

export interface PlatformFileFilter {
  name: string
  extensions: string[]
}

export interface SaveTextFileOptions {
  suggestedName: string
  contents: string
  filters?: PlatformFileFilter[]
}

export interface PickTextFileOptions {
  filters?: PlatformFileFilter[]
}

export interface PickedTextFile {
  name: string
  path: string | null
  contents: string
}

export interface PlatformRuntimeInfo {
  flavor: PlatformFlavor
  runtimeLabel: string
  appName: string
  appVersion: string | null
  framework: string
  tauriVersion: string | null
}

export interface PlatformAppUpdateInfo {
  currentVersion: string
  version: string
  body: string | null
  date: string | null
}

export interface PlatformUpdateProgress {
  downloadedBytes: number
  totalBytes: number | null
}

export interface PlatformAdapter {
  readonly flavor: PlatformFlavor
  isNativeTauri(): boolean
  saveTextFile(options: SaveTextFileOptions): Promise<boolean>
  pickTextFile(options?: PickTextFileOptions): Promise<PickedTextFile | null>
  writeClipboardText(text: string): Promise<void>
  readClipboardText(): Promise<string>
  openExternalUrl(url: string): Promise<void>
  getRuntimeInfo(): Promise<PlatformRuntimeInfo>
  checkForAppUpdate(): Promise<PlatformAppUpdateInfo | null>
  downloadAndInstallAppUpdate(
    onProgress?: (progress: PlatformUpdateProgress) => void
  ): Promise<void>
  restartApplication(): Promise<void>
}

function canUseDom() {
  return typeof window !== "undefined" && typeof document !== "undefined"
}

function isNativeTauriRuntime() {
  return canUseDom() && detectTauri()
}

function unsupportedDesktopFeature() {
  throw new Error("当前运行环境不支持桌面能力")
}

function toAccept(filters?: PlatformFileFilter[]) {
  if (!filters || filters.length === 0) {
    return undefined
  }

  const extensions = filters.reduce<string[]>((allExtensions, filter) => {
    return allExtensions.concat(filter.extensions)
  }, [])

  return extensions
    .map((extension) => `.${extension}`)
    .join(",")
}

function getFileNameFromPath(path: string) {
  const normalized = path.replace(/\\/g, "/")
  const segments = normalized.split("/")
  return segments[segments.length - 1] || "selected-file"
}

async function saveTextFileWeb(options: SaveTextFileOptions) {
  if (!canUseDom()) {
    throw new Error("当前环境不支持浏览器文件导出")
  }

  const blob = new Blob([options.contents], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")

  anchor.href = url
  anchor.download = options.suggestedName
  anchor.click()

  URL.revokeObjectURL(url)
  return true
}

async function pickTextFileWeb(options?: PickTextFileOptions) {
  if (!canUseDom()) {
    throw new Error("当前环境不支持浏览器文件选择")
  }

  return new Promise<PickedTextFile | null>((resolve, reject) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = toAccept(options?.filters) ?? ""
    input.style.display = "none"

    input.onchange = async () => {
      const file = input.files?.[0]
      input.remove()

      if (!file) {
        resolve(null)
        return
      }

      try {
        const contents = await file.text()
        resolve({
          name: file.name,
          path: null,
          contents,
        })
      } catch (error) {
        reject(error)
      }
    }

    document.body.appendChild(input)
    input.click()
  })
}

async function saveTextFileTauri(options: SaveTextFileOptions) {
  const [{ save }, { writeTextFile }] = await Promise.all([
    import("@tauri-apps/plugin-dialog"),
    import("@tauri-apps/plugin-fs"),
  ])

  const path = await save({
    defaultPath: options.suggestedName,
    filters: options.filters,
  })

  if (!path) {
    return false
  }

  await writeTextFile(path, options.contents)
  return true
}

async function pickTextFileTauri(options?: PickTextFileOptions) {
  const [{ open }, { readTextFile }] = await Promise.all([
    import("@tauri-apps/plugin-dialog"),
    import("@tauri-apps/plugin-fs"),
  ])

  const path = await open({
    multiple: false,
    directory: false,
    filters: options?.filters,
  })

  if (!path || Array.isArray(path)) {
    return null
  }

  const contents = await readTextFile(path)
  return {
    name: getFileNameFromPath(path),
    path,
    contents,
  }
}

async function writeClipboardTextWeb(text: string) {
  if (!navigator.clipboard) {
    throw new Error("当前环境不支持剪贴板写入")
  }

  await navigator.clipboard.writeText(text)
}

async function readClipboardTextWeb() {
  if (!navigator.clipboard) {
    throw new Error("当前环境不支持剪贴板读取")
  }

  return navigator.clipboard.readText()
}

async function writeClipboardTextTauri(text: string) {
  const { writeText } = await import("@tauri-apps/plugin-clipboard-manager")
  await writeText(text)
}

async function readClipboardTextTauri() {
  const { readText } = await import("@tauri-apps/plugin-clipboard-manager")
  return readText()
}

async function openExternalUrlWeb(url: string) {
  if (!canUseDom()) {
    throw new Error("当前环境不支持打开外链")
  }

  window.open(url, "_blank", "noopener,noreferrer")
}

async function openExternalUrlTauri(url: string) {
  const { openUrl } = await import("@tauri-apps/plugin-opener")
  await openUrl(url)
}

async function getRuntimeInfoWeb(): Promise<PlatformRuntimeInfo> {
  return {
    flavor: "web",
    runtimeLabel: "Web",
    appName: "Thunder",
    appVersion: null,
    framework: "Next.js + React",
    tauriVersion: null,
  }
}

async function getRuntimeInfoTauri(): Promise<PlatformRuntimeInfo> {
  const [appName, appVersion, tauriVersion] = await Promise.all([
    getName(),
    getVersion(),
    getTauriVersion(),
  ])

  return {
    flavor: "tauri",
    runtimeLabel: "Tauri Desktop",
    appName,
    appVersion,
    framework: "Next.js + React + Tauri",
    tauriVersion,
  }
}

async function checkForAppUpdateTauri(): Promise<PlatformAppUpdateInfo | null> {
  const update = await check()

  if (!update) {
    return null
  }

  return {
    currentVersion: update.currentVersion,
    version: update.version,
    body: update.body ?? null,
    date: update.date ?? null,
  }
}

async function downloadAndInstallAppUpdateTauri(
  onProgress?: (progress: PlatformUpdateProgress) => void
) {
  const update = await check()

  if (!update) {
    throw new Error("当前没有可安装的更新")
  }

  let downloadedBytes = 0
  let totalBytes: number | null = null

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        downloadedBytes = 0
        totalBytes = event.data.contentLength ?? null
        onProgress?.({ downloadedBytes, totalBytes })
        break
      case "Progress":
        downloadedBytes += event.data.chunkLength
        onProgress?.({ downloadedBytes, totalBytes })
        break
      case "Finished":
        onProgress?.({ downloadedBytes, totalBytes })
        break
      default:
        break
    }
  })
}

class ThunderPlatform implements PlatformAdapter {
  get flavor(): PlatformFlavor {
    return isNativeTauriRuntime() ? "tauri" : "web"
  }

  isNativeTauri() {
    return isNativeTauriRuntime()
  }

  async saveTextFile(options: SaveTextFileOptions) {
    if (this.isNativeTauri()) {
      return saveTextFileTauri(options)
    }

    return saveTextFileWeb(options)
  }

  async pickTextFile(options?: PickTextFileOptions) {
    if (this.isNativeTauri()) {
      return pickTextFileTauri(options)
    }

    return pickTextFileWeb(options)
  }

  async writeClipboardText(text: string) {
    if (this.isNativeTauri()) {
      return writeClipboardTextTauri(text)
    }

    return writeClipboardTextWeb(text)
  }

  async readClipboardText() {
    if (this.isNativeTauri()) {
      return readClipboardTextTauri()
    }

    return readClipboardTextWeb()
  }

  async openExternalUrl(url: string) {
    if (this.isNativeTauri()) {
      return openExternalUrlTauri(url)
    }

    return openExternalUrlWeb(url)
  }

  async getRuntimeInfo() {
    if (this.isNativeTauri()) {
      return getRuntimeInfoTauri()
    }

    return getRuntimeInfoWeb()
  }

  async checkForAppUpdate() {
    if (!this.isNativeTauri()) {
      return null
    }

    return checkForAppUpdateTauri()
  }

  async downloadAndInstallAppUpdate(onProgress?: (progress: PlatformUpdateProgress) => void) {
    if (!this.isNativeTauri()) {
      unsupportedDesktopFeature()
    }

    return downloadAndInstallAppUpdateTauri(onProgress)
  }

  async restartApplication() {
    if (!this.isNativeTauri()) {
      unsupportedDesktopFeature()
    }

    await relaunch()
  }
}

export const platform = new ThunderPlatform()

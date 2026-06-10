import type { ThunderPluginManifest } from "@thunder/plugin-schema"

export interface LoadedPluginManifest {
  manifest: ThunderPluginManifest
  pluginRoot: string
  manifestPath: string
}

export interface RegisteredPlugin {
  manifest: ThunderPluginManifest
  pluginRoot: string
}

export interface PluginRegistry {
  readonly root: string
  register(pluginRoot: string, manifest: ThunderPluginManifest): RegisteredPlugin
  get(id: string): RegisteredPlugin | null
  has(id: string): boolean
  list(): RegisteredPlugin[]
}

export interface PluginInstallResult {
  manifest: ThunderPluginManifest
  pluginRoot: string
}

export interface PluginInstaller {
  readonly root: string
  readonly pluginsDir: string
  installFromDirectory(sourcePath: string): Promise<PluginInstallResult>
}

export interface PluginRuntimeStatus {
  pluginId: string
  kind: ThunderPluginManifest["kind"]
  running: boolean
  endpoint?: string
}

export interface SandboxedPluginRuntime {
  start(plugin: RegisteredPlugin): Promise<PluginRuntimeStatus>
  stop(pluginId: string): Promise<PluginRuntimeStatus>
  getStatus(pluginId: string): PluginRuntimeStatus
}

export interface TrustedPluginRuntimeSupervisor {
  start(plugin: RegisteredPlugin): Promise<PluginRuntimeStatus>
  stop(pluginId: string): Promise<PluginRuntimeStatus>
  getStatus(pluginId: string): PluginRuntimeStatus
  getEndpoint(pluginId: string): string | null
}

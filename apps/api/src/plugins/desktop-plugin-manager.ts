export {
  DesktopPluginError,
  getDesktopPluginRoot,
} from "./desktop-plugin-internal"
export {
  _resetPluginRuntimeEnabledCache,
  getInstalledPlugin,
  isDesktopPluginRuntimeEnabled,
  listInstalledDesktopPlugins,
  toInstalledPlugin,
} from "./desktop-plugin-registry"
export {
  type InstallLocalPluginOptions,
  installBundledDesktopPlugin,
  installPackagedPlugin,
  uninstallDesktopPlugin,
} from "./desktop-plugin-install-service"
export {
  type StaticPluginAsset,
  readDesktopPluginUiAsset,
} from "./desktop-plugin-asset-service"
export {
  getDesktopPluginRuntimeStatus,
  invokeDesktopPluginWorker,
  restartDesktopPluginRuntime,
  startDesktopPluginRuntime,
  stopDesktopPluginRuntime,
} from "./desktop-plugin-runtime-service"

import { clearPluginOperationLocksForShutdown } from "./desktop-plugin-install-service"
import { shutdownPluginSystem as shutdownPluginRuntimeResources } from "./desktop-plugin-runtime-service"

/**
 * 兼容旧调用方的插件系统关闭入口。
 * 聚合 runtime、storage 和安装锁清理，避免路由层感知拆分后的服务边界。
 */
export async function shutdownPluginSystem(): Promise<void> {
  await shutdownPluginRuntimeResources()
  clearPluginOperationLocksForShutdown()
}

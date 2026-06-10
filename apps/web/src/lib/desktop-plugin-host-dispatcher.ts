import {
  getRequiredPluginPermission,
  parsePluginBridgeRequest,
  type PluginActivityParams,
  type PluginBridgeRequest,
  type PluginNotificationParams,
  type PluginNetworkRequestParams,
  type PluginNetworkResponse,
} from "@thunder/plugin-protocol"
import type { ThunderPluginManifest } from "@thunder/plugin-schema"

export interface DesktopPluginHostStorage {
  get(key: string): Promise<unknown | null>
  set(key: string, value: unknown): Promise<void>
  remove(key: string): Promise<void>
  keys(): Promise<string[]>
  clear(): Promise<void>
}

export interface DesktopPluginHostContext {
  manifest: ThunderPluginManifest
  storage: DesktopPluginHostStorage
  setFrameHeight(height: number): void
  addNotification(params: PluginNotificationParams): void
  trackActivity(params: PluginActivityParams): Promise<void>
  invokeWorker(method: string, payload: unknown): Promise<unknown>
  requestNetwork(params: PluginNetworkRequestParams): Promise<PluginNetworkResponse>
}

export interface DesktopPluginDispatchResult {
  request: PluginBridgeRequest
  result: unknown
  diagnosticMethod: string
}

/**
 * Validates and dispatches one untrusted iframe request against explicit host
 * capabilities. Browser origin/source validation remains the page's concern.
 */
export async function dispatchDesktopPluginHostRequest(
  input: unknown,
  context: DesktopPluginHostContext,
): Promise<DesktopPluginDispatchResult> {
  const request = parsePluginBridgeRequest(input)
  const requiredPermission = getRequiredPluginPermission(request.method)
  if (
    requiredPermission &&
    !context.manifest.permissions.includes(requiredPermission)
  ) {
    throw new Error(`插件未声明 ${requiredPermission} 权限`)
  }

  let result: unknown
  let diagnosticMethod: string = request.method

  switch (request.method) {
    case "plugin.getManifest":
      result = context.manifest
      break
    case "layout.setFrameHeight":
      context.setFrameHeight(request.params.height)
      break
    case "storage.get":
      result = await context.storage.get(request.params.key)
      break
    case "storage.set":
      await context.storage.set(request.params.key, request.params.value)
      break
    case "storage.remove":
      await context.storage.remove(request.params.key)
      break
    case "storage.keys":
      result = await context.storage.keys()
      break
    case "storage.clear":
      await context.storage.clear()
      break
    case "notification.add":
      context.addNotification(request.params)
      break
    case "activity.track":
      await context.trackActivity(request.params)
      break
    case "network.request": {
      const origin = new URL(request.params.url).origin
      if (!context.manifest.permissions.includes(`network:${origin}`)) {
        throw new Error(`插件未声明 network:${origin} 权限`)
      }
      result = await context.requestNetwork(request.params)
      break
    }
    case "worker.invoke": {
      const workerResult = await context.invokeWorker(
        request.params.method,
        request.params.payload,
      )
      result = { ok: true, result: workerResult }
      diagnosticMethod = `${request.method}:${request.params.method}`
      break
    }
  }

  return {
    request,
    result,
    diagnosticMethod,
  }
}

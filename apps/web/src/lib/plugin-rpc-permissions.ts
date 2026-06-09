const RPC_METHOD_PERMISSIONS: Record<string, string> = {
  "storage.get": "storage",
  "storage.set": "storage",
  "storage.remove": "storage",
  "storage.keys": "storage",
  "storage.clear": "storage",
  "notification.add": "notifications",
  "activity.track": "activity",
  "worker.invoke": "native-runtime",
}

export function getRequiredPermissionForRpcMethod(method: string): string | null {
  return RPC_METHOD_PERMISSIONS[method] ?? null
}

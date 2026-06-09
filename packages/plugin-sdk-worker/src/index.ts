import type {
  ThunderPluginWorkerHandlers,
  ThunderPluginWorkerMethodMap,
} from "./protocol"

export * from "./protocol"

export interface ThunderPluginWorkerDefinition<
  TMethods extends ThunderPluginWorkerMethodMap = ThunderPluginWorkerMethodMap,
> {
  handlers: ThunderPluginWorkerHandlers<TMethods>
}

export function defineWorker<
  TMethods extends ThunderPluginWorkerMethodMap,
>(definition: ThunderPluginWorkerDefinition<TMethods>): ThunderPluginWorkerDefinition<TMethods> {
  return definition
}

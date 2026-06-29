import type {
  ThunderPluginWorkerHandlers,
  ThunderPluginWorkerMethodMap,
  ThunderPluginWorkerStreams,
} from "./protocol"

export * from "./protocol"

export interface ThunderPluginWorkerDefinition<
  TMethods extends ThunderPluginWorkerMethodMap = ThunderPluginWorkerMethodMap,
> {
  handlers: ThunderPluginWorkerHandlers<TMethods>
  /** 长连接流式能力，例如连续音频输入。 */
  streams?: ThunderPluginWorkerStreams
}

export function defineWorker<
  TMethods extends ThunderPluginWorkerMethodMap,
>(definition: ThunderPluginWorkerDefinition<TMethods>): ThunderPluginWorkerDefinition<TMethods> {
  return definition
}

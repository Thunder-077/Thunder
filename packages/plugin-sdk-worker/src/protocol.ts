export interface ThunderPluginWorkerMethodDefinition<
  TPayload = unknown,
  TResult = unknown,
> {
  payload: TPayload
  result: TResult
}

export type ThunderPluginWorkerMethodMap = Record<
  string,
  ThunderPluginWorkerMethodDefinition
>

export interface ThunderPluginWorkerRequest<
  TMethods extends ThunderPluginWorkerMethodMap,
  TMethod extends keyof TMethods = keyof TMethods,
> {
  id: string
  method: TMethod
  payload: TMethods[TMethod]["payload"]
}

export interface ThunderPluginWorkerSuccessResponse<
  TMethods extends ThunderPluginWorkerMethodMap,
  TMethod extends keyof TMethods = keyof TMethods,
> {
  id: string
  method: TMethod
  ok: true
  result: TMethods[TMethod]["result"]
}

export interface ThunderPluginWorkerErrorResponse<
  TMethods extends ThunderPluginWorkerMethodMap,
  TMethod extends keyof TMethods = keyof TMethods,
> {
  id: string
  method: TMethod
  ok: false
  error: string
}

export type ThunderPluginWorkerResponse<
  TMethods extends ThunderPluginWorkerMethodMap,
  TMethod extends keyof TMethods = keyof TMethods,
> =
  | ThunderPluginWorkerSuccessResponse<TMethods, TMethod>
  | ThunderPluginWorkerErrorResponse<TMethods, TMethod>

export type ThunderPluginWorkerHandler<
  TPayload = unknown,
  TResult = unknown,
> = (
  payload: TPayload
) => Promise<TResult> | TResult

export interface ThunderPluginWorkerStreamController<
  TChunk = unknown,
  TResult = unknown,
> {
  /** 处理流内单个数据块，返回值会按块回传给 Host。 */
  onChunk(chunk: TChunk): Promise<TResult> | TResult
  /** 流关闭时释放会话资源，Host 主动关闭或连接断开都会触发。 */
  onClose?(): Promise<void> | void
}

export type ThunderPluginWorkerStreamHandler<
  TPayload = unknown,
  TChunk = unknown,
  TResult = unknown,
> = (
  payload: TPayload
) => Promise<ThunderPluginWorkerStreamController<TChunk, TResult>> |
  ThunderPluginWorkerStreamController<TChunk, TResult>

export type ThunderPluginWorkerStreams = Record<
  string,
  ThunderPluginWorkerStreamHandler
>

export type ThunderPluginWorkerHandlers<
  TMethods extends ThunderPluginWorkerMethodMap,
> = {
  [TMethod in keyof TMethods]: ThunderPluginWorkerHandler<
    TMethods[TMethod]["payload"],
    TMethods[TMethod]["result"]
  >
}

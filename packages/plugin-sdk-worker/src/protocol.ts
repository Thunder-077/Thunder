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

export type ThunderPluginWorkerHandlers<
  TMethods extends ThunderPluginWorkerMethodMap,
> = {
  [TMethod in keyof TMethods]: ThunderPluginWorkerHandler<
    TMethods[TMethod]["payload"],
    TMethods[TMethod]["result"]
  >
}

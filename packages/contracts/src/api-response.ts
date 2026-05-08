export interface ApiResponse<T> {
  ok: boolean
  data: T
  error?: {
    code: string
    message: string
  }
}

export interface PaginatedData<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export type ApiErrorCode =
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "VAULT_NOT_FOUND"
  | "VAULT_ITEM_NOT_FOUND"
  | "VAULT_MISSING_VAULT_ID"
  | "VAULT_SAVE_FAILED"
  | "VAULT_CLEAR_FAILED"
  | "EMBY_DYNAMIC_WATCH_NOT_FOUND"
  | "EMBY_INVALID_DYNAMIC_WATCH"
  | "EMBY_DYNAMIC_WATCH_SAVE_FAILED"
  | "WEATHER_MISSING_LOCATION"
  | "WEATHER_UPSTREAM_ERROR"
  | "TURNSTILE_FAILED"

export function apiSuccess<T>(data: T): ApiResponse<T> {
  return { ok: true, data }
}

export function apiError<T = never>(
  code: ApiErrorCode,
  message: string
): ApiResponse<T> {
  return { ok: false, data: undefined as T, error: { code, message } }
}

export class ThunderApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number
  ) {
    super(message)
    this.name = "ThunderApiError"
  }
}

export class ThunderClient {
  protected baseUrl: string

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || "/api/v1"
  }

  protected async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path)
  }

  protected async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, body)
  }

  protected async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body)
  }

  protected async del<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path)
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const options: RequestInit = {
      method,
      headers: { "Content-Type": "application/json" },
    }
    if (body !== undefined) {
      options.body = JSON.stringify(body)
    }
    const res = await fetch(url, options)
    if (!res.ok) {
      const json = await res.json().catch(() => null)
      const apiError = json && typeof json === "object" && "error" in json
        ? (json as {
            error?: {
              code?: string
              message?: string
            }
          }).error
        : null
      throw new ThunderApiError(
        apiError?.message || `请求失败（HTTP ${res.status}）`,
        apiError?.code || "INTERNAL_ERROR",
        res.status
      )
    }
    return res.json() as Promise<T>
  }
}

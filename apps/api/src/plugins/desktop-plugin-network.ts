import type { ThunderPluginManifest } from "@thunder/plugin-schema"
import { DesktopPluginError } from "./desktop-plugin-internal"

const MAX_REQUEST_BODY_BYTES = 1024 * 1024
const MAX_RESPONSE_BODY_BYTES = 5 * 1024 * 1024
const MAX_REDIRECTS = 3
const REQUEST_TIMEOUT_MS = 10_000
const BLOCKED_HEADERS = new Set([
  "authorization",
  "connection",
  "content-length",
  "cookie",
  "forwarded",
  "host",
  "origin",
  "proxy-authorization",
  "referer",
  "transfer-encoding",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
])

export interface DesktopPluginNetworkRequest {
  url: string
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  headers?: Record<string, string>
  body?: string
}

export interface DesktopPluginNetworkResponse {
  status: number
  headers: Record<string, string>
  body: string
}

function parseNetworkRequest(input: unknown): DesktopPluginNetworkRequest {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DesktopPluginError("插件网络请求格式无效", 400)
  }
  const request = input as Record<string, unknown>
  if (typeof request.url !== "string") {
    throw new DesktopPluginError("插件网络请求 URL 无效", 400)
  }
  const method = request.method ?? "GET"
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(String(method))) {
    throw new DesktopPluginError("插件网络请求方法无效", 400)
  }
  if (
    request.headers !== undefined &&
    (!request.headers ||
      typeof request.headers !== "object" ||
      Array.isArray(request.headers) ||
      Object.values(request.headers).some((value) => typeof value !== "string"))
  ) {
    throw new DesktopPluginError("插件网络请求 headers 无效", 400)
  }
  if (request.body !== undefined && typeof request.body !== "string") {
    throw new DesktopPluginError("插件网络请求 body 无效", 400)
  }
  return {
    url: request.url,
    method: method as DesktopPluginNetworkRequest["method"],
    headers: request.headers as Record<string, string> | undefined,
    body: request.body as string | undefined,
  }
}

function sanitizeHeaders(input: Record<string, string> | undefined): Headers {
  const headers = new Headers()
  for (const [name, value] of Object.entries(input ?? {})) {
    const normalized = name.trim().toLowerCase()
    if (normalized && !BLOCKED_HEADERS.has(normalized)) headers.set(normalized, value)
  }
  return headers
}

function assertAllowedOrigin(manifest: ThunderPluginManifest, url: URL): void {
  if (!manifest.permissions.includes(`network:${url.origin}`)) {
    throw new DesktopPluginError(`插件未声明 network:${url.origin} 权限`, 403)
  }
}

/**
 * Performs a bounded, credential-free request after checking every target
 * origin, including redirects, against the installed manifest.
 */
export async function proxyDesktopPluginNetworkRequest(
  manifest: ThunderPluginManifest,
  input: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<DesktopPluginNetworkResponse> {
  const request = parseNetworkRequest(input)
  const body = request.body ?? ""
  if (Buffer.byteLength(body, "utf8") > MAX_REQUEST_BODY_BYTES) {
    throw new DesktopPluginError("插件网络请求体超过 1 MiB", 400)
  }

  let currentUrl: URL
  try {
    currentUrl = new URL(request.url)
  } catch {
    throw new DesktopPluginError("插件网络请求 URL 无效", 400)
  }
  assertAllowedOrigin(manifest, currentUrl)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const response = await fetchImpl(currentUrl, {
        method: request.method ?? "GET",
        headers: sanitizeHeaders(request.headers),
        body: request.method === "GET" || body.length === 0 ? undefined : body,
        redirect: "manual",
        signal: controller.signal,
        credentials: "omit",
      })

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location")
        if (!location) throw new DesktopPluginError("上游重定向缺少 Location", 502)
        if (redirectCount === MAX_REDIRECTS) {
          throw new DesktopPluginError("插件网络请求重定向次数过多", 502)
        }
        currentUrl = new URL(location, currentUrl)
        assertAllowedOrigin(manifest, currentUrl)
        continue
      }

      const contentLength = Number(response.headers.get("content-length") ?? "0")
      if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BODY_BYTES) {
        throw new DesktopPluginError("插件网络响应超过 5 MiB", 502)
      }
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.byteLength > MAX_RESPONSE_BODY_BYTES) {
        throw new DesktopPluginError("插件网络响应超过 5 MiB", 502)
      }
      const responseHeaders: Record<string, string> = {}
      response.headers.forEach((value, name) => {
        if (!BLOCKED_HEADERS.has(name.toLowerCase()) && name.toLowerCase() !== "set-cookie") {
          responseHeaders[name] = value
        }
      })
      return {
        status: response.status,
        headers: responseHeaders,
        body: new TextDecoder().decode(bytes),
      }
    }
    throw new DesktopPluginError("插件网络请求重定向次数过多", 502)
  } catch (error) {
    if (error instanceof DesktopPluginError) throw error
    if (controller.signal.aborted) throw new DesktopPluginError("插件网络请求超时", 504)
    throw new DesktopPluginError("插件网络上游请求失败", 502)
  } finally {
    clearTimeout(timeout)
  }
}

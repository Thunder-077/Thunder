import { NextResponse } from "next/server"
import { getEnv } from "@/lib/env"

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
])

function getApiBaseUrl(): string {
  return getEnv("API_URL") || "http://localhost:3001"
}

function createUpstreamUrl(request: Request, prefix: string, segments: string[]): string {
  const sourceUrl = new URL(request.url)
  const upstreamUrl = new URL(`${prefix}/${segments.map(encodeURIComponent).join("/")}`, getApiBaseUrl())
  upstreamUrl.search = sourceUrl.search

  return upstreamUrl.toString()
}

function createForwardHeaders(request: Request): Headers {
  const headers = new Headers(request.headers)
  headers.delete("host")

  for (const key of HOP_BY_HOP_HEADERS) {
    headers.delete(key)
  }

  return headers
}

function createResponseHeaders(upstreamHeaders: Headers): Headers {
  const headers = new Headers(upstreamHeaders)

  for (const key of HOP_BY_HOP_HEADERS) {
    headers.delete(key)
  }

  return headers
}

export async function proxyToApi(
  request: Request,
  prefix: string,
  segments: string[]
): Promise<Response> {
  const method = request.method.toUpperCase()
  const upstreamUrl = createUpstreamUrl(request, prefix, segments)
  const upstream = await fetch(upstreamUrl, {
    method,
    headers: createForwardHeaders(request),
    body: method === "GET" || method === "HEAD" ? undefined : request.body,
    redirect: "manual",
  }).catch((error) => {
    console.error("[api-proxy] upstream fetch failed", {
      upstreamUrl,
      method,
      message: error instanceof Error ? error.message : String(error),
    })
    return null
  })

  if (!upstream) {
    return NextResponse.json({ ok: false, message: "后端服务不可用" }, { status: 502 })
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: createResponseHeaders(upstream.headers),
  })
}

import { NextResponse } from "next/server"
import { AUTH_COOKIE_NAME, authCookieOptions, createSessionToken } from "@/lib/auth"
import { getEnv } from "@/lib/env"

interface AuthLoginResponse {
  ok: boolean
  data?: {
    username: string
    avatarUrl: string
  }
  error?: {
    message?: string
  }
}

function parseLoginResponse(value: string): AuthLoginResponse | null {
  try {
    return value ? JSON.parse(value) as AuthLoginResponse : null
  } catch {
    return null
  }
}

function getApiBaseUrl(): string {
  return getEnv("API_URL") || "http://localhost:3001"
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { username?: string; password?: string } | null
  const username = body?.username?.trim() ?? ""
  const password = body?.password ?? ""

  const apiBaseUrl = getApiBaseUrl()
  const upstreamUrl = `${apiBaseUrl}/api/v1/auth/login`
  const upstream = await fetch(upstreamUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  }).catch((error) => {
    console.error("[auth-bff] POST /login upstream fetch failed", {
      apiBaseUrl,
      message: error instanceof Error ? error.message : String(error),
    })
    return null
  })

  if (!upstream) {
    return NextResponse.json({ ok: false, message: "登录服务不可用" }, { status: 502 })
  }

  const upstreamBody = await upstream.text().catch(() => "")
  const data = parseLoginResponse(upstreamBody)

  if (!upstream.ok || !data?.ok || !data.data?.username) {
    console.error("[auth-bff] POST /login upstream returned error", {
      upstreamUrl,
      status: upstream.status,
      message: data?.error?.message,
      body: upstreamBody.slice(0, 500),
    })
    const message = upstream.status === 404
      ? "登录服务不可用"
      : data?.error?.message || "账号或密码不正确"
    return NextResponse.json(
      { ok: false, message },
      { status: upstream.status === 404 ? 502 : upstream.status || 401 }
    )
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(AUTH_COOKIE_NAME, await createSessionToken(data.data.username), authCookieOptions)
  return response
}

import { NextResponse } from "next/server"
import { AUTH_COOKIE_NAME, authCookieOptions, createSessionToken } from "@/lib/auth"

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

function getApiBaseUrl(): string {
  return process.env.API_URL || "http://localhost:3001"
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { username?: string; password?: string } | null
  const username = body?.username?.trim() ?? ""
  const password = body?.password ?? ""

  const upstream = await fetch(`${getApiBaseUrl()}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  }).catch(() => null)

  if (!upstream) {
    return NextResponse.json({ ok: false, message: "登录服务不可用" }, { status: 502 })
  }

  const data = await upstream.json().catch(() => null) as AuthLoginResponse | null

  if (!upstream.ok || !data?.ok || !data.data?.username) {
    return NextResponse.json(
      { ok: false, message: data?.error?.message || "账号或密码不正确" },
      { status: upstream.status || 401 }
    )
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(AUTH_COOKIE_NAME, await createSessionToken(data.data.username), authCookieOptions)
  return response
}

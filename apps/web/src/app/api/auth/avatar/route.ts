import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { AUTH_COOKIE_NAME, getSessionUser } from "@/lib/auth"
import { getEnv } from "@/lib/env"

interface AuthAvatarResponse {
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
  return getEnv("API_URL") || "http://localhost:3001"
}

export async function PUT(request: Request) {
  const cookieStore = await cookies()
  const user = await getSessionUser(cookieStore.get(AUTH_COOKIE_NAME)?.value)

  if (!user) {
    return NextResponse.json({ ok: false, message: "未登录" }, { status: 401 })
  }

  const body = await request.json().catch(() => null) as { avatarUrl?: string } | null
  const upstream = await fetch(
    `${getApiBaseUrl()}/api/v1/auth/users/${encodeURIComponent(user.username)}/avatar`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: user.username,
        avatarUrl: body?.avatarUrl ?? "",
      }),
    }
  ).catch(() => null)

  if (!upstream) {
    return NextResponse.json({ ok: false, message: "用户服务不可用" }, { status: 502 })
  }

  const data = await upstream.json().catch(() => null) as AuthAvatarResponse | null
  if (!upstream.ok || !data?.ok || !data.data) {
    return NextResponse.json(
      { ok: false, message: data?.error?.message || "更新头像失败" },
      { status: upstream.status || 500 }
    )
  }

  return NextResponse.json({ ok: true, user: data.data })
}

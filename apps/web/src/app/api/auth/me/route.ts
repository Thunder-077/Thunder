import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { AUTH_COOKIE_NAME, getSessionUser } from "@/lib/auth"

interface AuthMeResponse {
  ok: boolean
  data?: {
    username: string
    avatarUrl: string
  }
}

function getApiBaseUrl(): string {
  return process.env.API_URL || "http://localhost:3001"
}

export async function GET() {
  const cookieStore = await cookies()
  const user = await getSessionUser(cookieStore.get(AUTH_COOKIE_NAME)?.value)

  if (!user) {
    return NextResponse.json({ ok: false, message: "未登录" }, { status: 401 })
  }

  const upstream = await fetch(
    `${getApiBaseUrl()}/api/v1/auth/users/${encodeURIComponent(user.username)}`,
    { cache: "no-store" }
  ).catch(() => null)

  if (!upstream) {
    return NextResponse.json({ ok: false, message: "用户服务不可用" }, { status: 502 })
  }

  const data = await upstream.json().catch(() => null) as AuthMeResponse | null
  if (!upstream.ok || !data?.ok || !data.data) {
    return NextResponse.json({ ok: false, message: "获取用户信息失败" }, { status: upstream.status || 500 })
  }

  return NextResponse.json({ ok: true, user: data.data })
}

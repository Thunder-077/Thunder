import { NextResponse } from "next/server"
import { AUTH_COOKIE_NAME } from "@/lib/auth"
import { getEnv } from "@/lib/env"

export async function POST() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: getEnv("NODE_ENV") === "production",
    path: "/",
    maxAge: 0,
  })
  return response
}

import { NextResponse, type NextRequest } from "next/server"
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/auth"
import { publicServerPrefixes } from "@/generated/enabled-modules"

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
]

function isPublicAsset(pathname: string): boolean {
  return (
    publicServerPrefixes.some((prefix) => pathname.startsWith(prefix)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/logo") ||
    pathname.startsWith("/icon") ||
    pathname.startsWith("/api/auth") ||
    pathname.includes(".")
  )
}

function isApiRequest(pathname: string): boolean {
  return pathname.startsWith("/api/v1")
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PATHS.includes(pathname) || isPublicAsset(pathname)) {
    return NextResponse.next()
  }

  const authenticated = await verifySessionToken(request.cookies.get(AUTH_COOKIE_NAME)?.value)

  if (authenticated) {
    return NextResponse.next()
  }

  if (isApiRequest(pathname)) {
    return NextResponse.json(
      { ok: false, message: "未登录" },
      { status: 401 }
    )
  }

  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = "/login"
  loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`)
  return NextResponse.redirect(loginUrl)
}

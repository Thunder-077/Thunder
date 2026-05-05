import { NextResponse, type NextRequest } from "next/server"
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/auth"

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
]

function isPublicAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/server/emby") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/logo") ||
    pathname.startsWith("/icon") ||
    pathname.startsWith("/api/auth") ||
    pathname.includes(".")
  )
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PATHS.includes(pathname) || isPublicAsset(pathname)) {
    return NextResponse.next()
  }

  const authenticated = await verifySessionToken(request.cookies.get(AUTH_COOKIE_NAME)?.value)

  if (authenticated) {
    return NextResponse.next()
  }

  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = "/login"
  loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
}

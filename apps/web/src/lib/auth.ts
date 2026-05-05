export const AUTH_COOKIE_NAME = "thunder_session"

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

function getAuthSecret(): string {
  return process.env.THUNDER_AUTH_SECRET || "thunder-development-auth-secret"
}

function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=")
  return atob(padded)
}

async function sign(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getAuthSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))
  const bytes = Array.from(new Uint8Array(signature))
  return toBase64Url(String.fromCharCode(...bytes))
}

export async function createSessionToken(username: string): Promise<string> {
  const payload = toBase64Url(JSON.stringify({
    username,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  }))
  const signature = await sign(payload)
  return `${payload}.${signature}`
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  return Boolean(await getSessionUser(token))
}

export async function getSessionUser(token: string | undefined): Promise<{ username: string } | null> {
  if (!token) return null

  const [payload, signature] = token.split(".")
  if (!payload || !signature) return null

  const expectedSignature = await sign(payload)
  if (signature !== expectedSignature) return null

  try {
    const data = JSON.parse(fromBase64Url(payload)) as { exp?: number; username?: string }
    const valid = typeof data.exp === "number" && data.exp > Math.floor(Date.now() / 1000)

    if (!valid || typeof data.username !== "string" || !data.username.trim()) {
      return null
    }

    return { username: data.username }
  } catch {
    return null
  }
}

export const authCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
}

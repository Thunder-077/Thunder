import { Hono } from "hono"
import { apiError, apiSuccess } from "@thunder/contracts"
import { prisma } from "@thunder/database"
import { verifyTurnstileToken } from "./turnstile"

interface AuthUserProfile {
  username: string
  avatarUrl: string
}

interface LoginBody {
  username?: string
  password?: string
  turnstileToken?: string
  skipTurnstile?: boolean
}

interface AvatarBody {
  username?: string
  avatarUrl?: string
}

const auth = new Hono()

function now(): string {
  return new Date().toISOString()
}

function toBase64Url(bytes: Uint8Array): string {
  let value = ""
  for (const byte of bytes) {
    value += String.fromCharCode(byte)
  }

  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=")
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: toArrayBuffer(fromBase64Url(salt)),
      iterations: 100_000,
    },
    key,
    256
  )

  return toBase64Url(new Uint8Array(bits))
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false

  let diff = 0
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }

  return diff === 0
}

function toProfile(user: { username: string; avatarDataUrl: string | null }): AuthUserProfile {
  return {
    username: user.username,
    avatarUrl: user.avatarDataUrl || "",
  }
}

auth.post("/login", async (c) => {
  try {
    const body = await c.req.json().catch(() => null) as LoginBody | null
    const username = body?.username?.trim() ?? ""
    const password = body?.password ?? ""

    if (!username || !password) {
      return c.json(apiError("VALIDATION_ERROR", "账号和密码不能为空"), 400)
    }

    const turnstileToken = body?.turnstileToken
    const skipTurnstile = body?.skipTurnstile === true

    if (!skipTurnstile) {
      const clientIp = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || undefined
      const turnstileResult = await verifyTurnstileToken(turnstileToken ?? "", clientIp)
      if (!turnstileResult.success) {
        return c.json(apiError("TURNSTILE_FAILED", "人机验证失败，请重试"), 400)
      }
    }

    const user = await prisma.authUser.findUnique({ where: { username } })
    if (!user) {
      return c.json(apiError("UNAUTHORIZED", "账号或密码不正确"), 401)
    }

    const passwordHash = await hashPassword(password, user.passwordSalt)
    if (!timingSafeEqual(passwordHash, user.passwordHash)) {
      return c.json(apiError("UNAUTHORIZED", "账号或密码不正确"), 401)
    }

    return c.json(apiSuccess(toProfile(user)))
  } catch (error) {
    console.error("[auth-api] POST /login failed", error)
    return c.json(apiError("INTERNAL_ERROR", "登录失败"), 500)
  }
})

auth.get("/users/:username", async (c) => {
  try {
    const username = c.req.param("username").trim()
    const user = await prisma.authUser.findUnique({ where: { username } })

    if (!user) {
      return c.json(apiError("NOT_FOUND", "用户不存在"), 404)
    }

    return c.json(apiSuccess(toProfile(user)))
  } catch (error) {
    console.error("[auth-api] GET /users/:username failed", error)
    return c.json(apiError("INTERNAL_ERROR", "获取用户信息失败"), 500)
  }
})

auth.put("/users/:username/avatar", async (c) => {
  try {
    const username = c.req.param("username").trim()
    const body = await c.req.json().catch(() => null) as AvatarBody | null
    const avatarUrl = body?.avatarUrl?.trim() ?? ""

    if (body?.username?.trim() !== username) {
      return c.json(apiError("FORBIDDEN", "不能修改其他用户头像"), 403)
    }

    if (avatarUrl && (!avatarUrl.startsWith("data:image/") || avatarUrl.length > 1_400_000)) {
      return c.json(apiError("VALIDATION_ERROR", "头像图片格式或大小不符合要求"), 400)
    }

    const user = await prisma.authUser.update({
      where: { username },
      data: {
        avatarDataUrl: avatarUrl || null,
        updatedAt: now(),
      },
    })

    return c.json(apiSuccess(toProfile(user)))
  } catch (error) {
    console.error("[auth-api] PUT /users/:username/avatar failed", error)
    return c.json(apiError("INTERNAL_ERROR", "更新头像失败"), 500)
  }
})

export { auth }

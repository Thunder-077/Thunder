const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

export interface TurnstileVerifyResult {
  success: boolean
  errorCodes?: string[]
}

export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string
): Promise<TurnstileVerifyResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    return { success: false, errorCodes: ["missing-secret"] }
  }

  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        response: token,
        ...(remoteIp ? { remoteip: remoteIp } : {}),
      }),
    })

    const data = await response.json() as { success: boolean; "error-codes"?: string[] }

    return {
      success: data.success === true,
      errorCodes: data["error-codes"],
    }
  } catch (error) {
    console.error("[turnstile] siteverify request failed", error)
    return { success: false, errorCodes: ["internal-error"] }
  }
}

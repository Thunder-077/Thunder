import { getCloudflareContext } from "@opennextjs/cloudflare"

export function getEnv(key: string): string | undefined {
  try {
    const cfContext = getCloudflareContext()
    if (cfContext?.env && (cfContext.env as Record<string, unknown>)[key]) {
      return (cfContext.env as Record<string, string>)[key]
    }
  } catch {
    // not in Cloudflare Workers context (e.g. next dev)
  }
  return process.env[key]
}

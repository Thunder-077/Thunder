import { proxyToApi } from "@/lib/api-proxy"

interface RouteContext {
  params: Promise<{
    path?: string[]
  }>
}

async function handle(request: Request, context: RouteContext) {
  const params = await context.params
  return proxyToApi(request, "/api/v1", params.path ?? [])
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle

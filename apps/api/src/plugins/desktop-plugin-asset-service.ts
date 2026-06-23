import { readFile, stat } from "node:fs/promises"
import { dirname, extname, resolve } from "node:path"
import {
  DesktopPluginError,
  assertPathInside,
  isPathInside,
} from "./desktop-plugin-internal"
import { getInstalledPlugin } from "./desktop-plugin-registry"

const STATIC_CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
}

export interface StaticPluginAsset {
  bytes: Buffer
  contentType: string
  contentSecurityPolicy?: string
  etag?: string
  lastModified?: string
}

/**
 * 读取插件 UI 静态资源，并限制访问范围在 sidebar entry 同级目录内。
 */
export async function readDesktopPluginUiAsset(id: string, assetPathParts: string[]): Promise<StaticPluginAsset> {
  const plugin = await getInstalledPlugin(id)
  const sidebarEntry = plugin.manifest.contributes?.sidebar?.entry
  if (!sidebarEntry) {
    throw new DesktopPluginError("插件未声明 UI 入口", 404)
  }

  const requestedAsset = assetPathParts.join("/")
  const resolvedAssetPath = resolve(plugin.pluginRoot, requestedAsset)
  await assertPathInside(plugin.pluginRoot, resolvedAssetPath)

  const sidebarRoot = dirname(resolve(plugin.pluginRoot, sidebarEntry))
  if (!isPathInside(resolvedAssetPath, sidebarRoot) && resolvedAssetPath !== resolve(plugin.pluginRoot, sidebarEntry)) {
    throw new DesktopPluginError("插件 UI 资源路径越界", 403)
  }

  const fileStat = await stat(resolvedAssetPath).catch(() => null)
  if (!fileStat || !fileStat.isFile()) {
    throw new DesktopPluginError("插件 UI 资源不存在", 404)
  }

  const bytes = await readFile(resolvedAssetPath)

  // 使用 size + mtime 生成弱 ETag，适合安装后基本不可变的插件构建产物。
  const etag = `W/"${fileStat.size.toString(16)}-${fileStat.mtimeMs.toString(16)}"`
  const lastModified = fileStat.mtime.toUTCString()

  return {
    bytes,
    contentType: STATIC_CONTENT_TYPES[extname(resolvedAssetPath).toLowerCase()] ?? "application/octet-stream",
    contentSecurityPolicy:
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'",
    etag,
    lastModified,
  }
}

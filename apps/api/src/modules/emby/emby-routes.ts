import { Hono } from "hono"
import { apiError, apiSuccess } from "@thunder/contracts"
import type {
  EmbyConfig,
  EmbyDynamicWatchFeed,
  EmbyManagedPlaylist,
  EmbyPlaylistPreview,
  EmbyPlaylistSlug,
  EmbyPreviewVideo,
  EmbySyncResult,
  EmbyTmdbType,
} from "@thunder/emby"
import { EmbyRepositorySQLite } from "./emby-repository.sqlite"

const emby = new Hono()
const serverEmby = new Hono()
const repository = new EmbyRepositorySQLite()

interface TmdbDiscoverItem {
  id: number
  title?: string
  name?: string
  poster_path?: string | null
  original_language?: string
  genre_ids?: number[]
  origin_country?: string[]
}

interface TmdbDiscoverResponse {
  results: TmdbDiscoverItem[]
}

interface EmosWatchListItem {
  id: number
  name: string
}

interface EmosWatchListResponse {
  items?: EmosWatchListItem[]
}

function formatDateTime(date = new Date()): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  const hours = `${date.getHours()}`.padStart(2, "0")
  const minutes = `${date.getMinutes()}`.padStart(2, "0")
  const seconds = `${date.getSeconds()}`.padStart(2, "0")
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

function daysAgo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString().slice(0, 10)
}

function resolveCover(config: EmbyConfig, playlist: EmbyManagedPlaylist): string {
  if (playlist.cover.trim()) {
    return playlist.cover.trim()
  }

  const baseUrl = config.publicBaseUrl.replace(/\/$/, "")
  return `${baseUrl}/icon-512.png`
}

function resolvePublicFeedUrl(config: EmbyConfig, slug: EmbyPlaylistSlug): string {
  const baseUrl = config.publicBaseUrl.replace(/\/$/, "")
  return `${baseUrl}/server/emby/watch/${slug}`
}

function getTmdbHeaders(apiKey: string): HeadersInit {
  return {
    accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
  }
}

async function fetchTmdbDiscover(
  apiKey: string,
  mediaType: EmbyTmdbType,
  searchParams: URLSearchParams
): Promise<TmdbDiscoverItem[]> {
  const endpoint = mediaType === "movie" ? "movie" : "tv"
  const url = `https://api.themoviedb.org/3/discover/${endpoint}?${searchParams.toString()}`
  const res = await fetch(url, {
    headers: getTmdbHeaders(apiKey),
  })

  if (!res.ok) {
    throw new Error(`TMDB discover failed: ${res.status}`)
  }

  const data = await res.json() as TmdbDiscoverResponse
  return data.results ?? []
}

function toPosterUrl(path: string | null | undefined): string | null {
  if (!path) {
    return null
  }

  return `https://image.tmdb.org/t/p/w342${path}`
}

function toFeed(
  config: EmbyConfig,
  playlist: EmbyManagedPlaylist,
  items: Array<{ id: number; type: EmbyTmdbType; title: string }>
): EmbyDynamicWatchFeed {
  return {
    name: playlist.name,
    cover: resolveCover(config, playlist),
    updatedAt: formatDateTime(),
    videos: items.slice(0, playlist.limit).map((item, index) => ({
      tmdbId: item.id,
      tmdbType: item.type,
      title: item.title,
      sort: index + 1,
    })),
  }
}

function dedupeItems(items: Array<{ id: number; type: EmbyTmdbType; title: string }>) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.type}-${item.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function dedupePreviewItems(items: EmbyPreviewVideo[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.tmdbType}-${item.tmdbId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function generatePlaylistFeed(
  config: EmbyConfig,
  playlist: EmbyManagedPlaylist
): Promise<EmbyDynamicWatchFeed> {
  const apiKey = config.tmdbApiKey.trim()
  if (!apiKey) {
    throw new Error("TMDB API key is missing")
  }

  const limit = Math.max(playlist.limit, 10)
  const common = new URLSearchParams({
    language: "zh-CN",
    include_adult: "false",
    sort_by: "popularity.desc",
    page: "1",
  })

  if (playlist.slug === "domestic-tv") {
    common.set("first_air_date.gte", daysAgo(playlist.releaseWindowDays))
    common.set("with_origin_country", "CN")
    common.set("without_genres", "16")
    const items = await fetchTmdbDiscover(apiKey, "tv", common)
    return toFeed(
      config,
      playlist,
      items.slice(0, limit).map((item) => ({
        id: item.id,
        type: "tv",
        title: item.name ?? "",
      }))
    )
  }

  if (playlist.slug === "domestic-movie") {
    common.set("primary_release_date.gte", daysAgo(playlist.releaseWindowDays))
    common.set("with_origin_country", "CN")
    common.set("without_genres", "16")
    const items = await fetchTmdbDiscover(apiKey, "movie", common)
    return toFeed(
      config,
      playlist,
      items.slice(0, limit).map((item) => ({
        id: item.id,
        type: "movie",
        title: item.title ?? "",
      }))
    )
  }

  if (playlist.slug === "foreign-tv") {
    common.set("first_air_date.gte", daysAgo(playlist.releaseWindowDays))
    common.set("without_genres", "16")
    const items = await fetchTmdbDiscover(apiKey, "tv", common)
    const filtered = items
      .filter((item) => !(item.origin_country ?? []).includes("CN"))
      .slice(0, limit)
      .map((item) => ({
        id: item.id,
        type: "tv" as const,
        title: item.name ?? "",
      }))
    return toFeed(config, playlist, filtered)
  }

  if (playlist.slug === "foreign-movie") {
    common.set("primary_release_date.gte", daysAgo(playlist.releaseWindowDays))
    common.set("without_genres", "16")
    const items = await fetchTmdbDiscover(apiKey, "movie", common)
    return toFeed(
      config,
      playlist,
      items
        .filter((item) => item.original_language !== "zh")
        .slice(0, limit)
        .map((item) => ({
        id: item.id,
        type: "movie",
        title: item.title ?? "",
      }))
    )
  }

  const animeTvParams = new URLSearchParams(common)
  animeTvParams.set("first_air_date.gte", daysAgo(playlist.releaseWindowDays))
  animeTvParams.set("with_genres", "16")

  const animeMovieParams = new URLSearchParams(common)
  animeMovieParams.set("primary_release_date.gte", daysAgo(playlist.releaseWindowDays))
  animeMovieParams.set("with_genres", "16")

  const [tvItems, movieItems] = await Promise.all([
    fetchTmdbDiscover(apiKey, "tv", animeTvParams),
    fetchTmdbDiscover(apiKey, "movie", animeMovieParams),
  ])

  const merged = dedupeItems([
    ...tvItems.map((item) => ({
      id: item.id,
      type: "tv" as const,
      title: item.name ?? "",
    })),
    ...movieItems.map((item) => ({
      id: item.id,
      type: "movie" as const,
      title: item.title ?? "",
    })),
  ]).slice(0, limit)

  return toFeed(config, playlist, merged)
}

async function generatePlaylistPreview(
  config: EmbyConfig,
  playlist: EmbyManagedPlaylist
): Promise<EmbyPlaylistPreview> {
  const apiKey = config.tmdbApiKey.trim()
  if (!apiKey) {
    throw new Error("TMDB API key is missing")
  }

  const limit = Math.max(playlist.limit, 10)
  const common = new URLSearchParams({
    language: "zh-CN",
    include_adult: "false",
    sort_by: "popularity.desc",
    page: "1",
  })

  let previewVideos: EmbyPreviewVideo[] = []

  if (playlist.slug === "domestic-tv") {
    common.set("first_air_date.gte", daysAgo(playlist.releaseWindowDays))
    common.set("with_origin_country", "CN")
    common.set("without_genres", "16")
    const items = await fetchTmdbDiscover(apiKey, "tv", common)
    previewVideos = items.slice(0, limit).map((item, index) => ({
      tmdbId: item.id,
      tmdbType: "tv",
      title: item.name ?? "",
      sort: index + 1,
      posterUrl: toPosterUrl(item.poster_path),
    }))
  } else if (playlist.slug === "domestic-movie") {
    common.set("primary_release_date.gte", daysAgo(playlist.releaseWindowDays))
    common.set("with_origin_country", "CN")
    common.set("without_genres", "16")
    const items = await fetchTmdbDiscover(apiKey, "movie", common)
    previewVideos = items.slice(0, limit).map((item, index) => ({
      tmdbId: item.id,
      tmdbType: "movie",
      title: item.title ?? "",
      sort: index + 1,
      posterUrl: toPosterUrl(item.poster_path),
    }))
  } else if (playlist.slug === "foreign-tv") {
    common.set("first_air_date.gte", daysAgo(playlist.releaseWindowDays))
    common.set("without_genres", "16")
    const items = await fetchTmdbDiscover(apiKey, "tv", common)
    previewVideos = items
      .filter((item) => !(item.origin_country ?? []).includes("CN"))
      .slice(0, limit)
      .map((item, index) => ({
        tmdbId: item.id,
        tmdbType: "tv",
        title: item.name ?? "",
        sort: index + 1,
        posterUrl: toPosterUrl(item.poster_path),
      }))
  } else if (playlist.slug === "foreign-movie") {
    common.set("primary_release_date.gte", daysAgo(playlist.releaseWindowDays))
    common.set("without_genres", "16")
    const items = await fetchTmdbDiscover(apiKey, "movie", common)
    previewVideos = items
      .filter((item) => item.original_language !== "zh")
      .slice(0, limit)
      .map((item, index) => ({
        tmdbId: item.id,
        tmdbType: "movie",
        title: item.title ?? "",
        sort: index + 1,
        posterUrl: toPosterUrl(item.poster_path),
      }))
  } else {
    const animeTvParams = new URLSearchParams(common)
    animeTvParams.set("first_air_date.gte", daysAgo(playlist.releaseWindowDays))
    animeTvParams.set("with_genres", "16")

    const animeMovieParams = new URLSearchParams(common)
    animeMovieParams.set("primary_release_date.gte", daysAgo(playlist.releaseWindowDays))
    animeMovieParams.set("with_genres", "16")

    const [tvItems, movieItems] = await Promise.all([
      fetchTmdbDiscover(apiKey, "tv", animeTvParams),
      fetchTmdbDiscover(apiKey, "movie", animeMovieParams),
    ])

    previewVideos = dedupePreviewItems([
      ...tvItems.map((item, index) => ({
        tmdbId: item.id,
        tmdbType: "tv" as const,
        title: item.name ?? "",
        sort: index + 1,
        posterUrl: toPosterUrl(item.poster_path),
      })),
      ...movieItems.map((item, index) => ({
        tmdbId: item.id,
        tmdbType: "movie" as const,
        title: item.title ?? "",
        sort: tvItems.length + index + 1,
        posterUrl: toPosterUrl(item.poster_path),
      })),
    ])
      .slice(0, limit)
      .map((item, index) => ({
        tmdbId: item.tmdbId,
        tmdbType: item.tmdbType,
        title: item.title,
        sort: index + 1,
        posterUrl: item.posterUrl,
      }))
  }

  return {
    feed: {
      name: playlist.name,
      cover: resolveCover(config, playlist),
      updatedAt: formatDateTime(),
      videos: previewVideos.map(({ posterUrl: _posterUrl, ...video }) => video),
    },
    videos: previewVideos,
  }
}

async function emosRequest<T>(
  config: EmbyConfig,
  path: string,
  init?: RequestInit
): Promise<T> {
  const baseUrl = config.emosBaseUrl.replace(/\/$/, "")
  const token = config.emosToken.trim()

  if (!baseUrl || !token) {
    throw new Error("Emos config is incomplete")
  }

  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Emos request failed: ${res.status} ${text}`)
  }

  return res.json() as Promise<T>
}

async function findExistingWatchId(config: EmbyConfig, playlist: EmbyManagedPlaylist): Promise<number | null> {
  const params = new URLSearchParams({
    name: playlist.name,
    is_self: "true",
  })
  const data = await emosRequest<EmosWatchListResponse>(config, `/api/watch?${params.toString()}`)
  const match = data.items?.find((item) => item.name === playlist.name)
  return match?.id ?? null
}

async function syncPlaylistToEmos(
  config: EmbyConfig,
  playlist: EmbyManagedPlaylist
): Promise<EmbySyncResult> {
  const feed = await generatePlaylistFeed(config, playlist)
  const watchId = playlist.remoteWatchId ?? await findExistingWatchId(config, playlist)

  const watchResponse = await emosRequest<{ watch_id: number }>(config, "/api/watch", {
    method: "POST",
    body: JSON.stringify({
      id: watchId,
      name: playlist.name,
      description: playlist.description,
      is_public: playlist.isPublic,
      point: playlist.point,
      tags: playlist.tags,
      is_show_empty: playlist.isShowEmpty,
      image_poster_url: resolveCover(config, playlist),
    }),
  })

  const resolvedWatchId = watchResponse.watch_id
  const dynamicUrl = resolvePublicFeedUrl(config, playlist.slug)

  await emosRequest(config, `/api/watch/${resolvedWatchId}/dynamic`, {
    method: "PUT",
    body: JSON.stringify({
      url: dynamicUrl,
    }),
  })

  return {
    slug: playlist.slug,
    name: playlist.name,
    watchId: resolvedWatchId,
    dynamicUrl,
    updatedAt: feed.updatedAt,
    count: feed.videos.length,
  }
}

function normalizePlaylist(input: unknown): EmbyManagedPlaylist | null {
  if (!input || typeof input !== "object") return null
  const record = input as Record<string, unknown>
  const slug = record.slug
  if (
    slug !== "domestic-tv" &&
    slug !== "domestic-movie" &&
    slug !== "foreign-tv" &&
    slug !== "foreign-movie" &&
    slug !== "anime"
  ) {
    return null
  }

  return {
    slug,
    name: typeof record.name === "string" ? record.name.trim() : "",
    description: typeof record.description === "string" ? record.description.trim() : "",
    cover: typeof record.cover === "string" ? record.cover.trim() : "",
    tags: Array.isArray(record.tags) ? record.tags.filter((tag): tag is string => typeof tag === "string") : [],
    point: Number(record.point ?? 0),
    isPublic: Boolean(record.isPublic),
    isShowEmpty: Boolean(record.isShowEmpty),
    enabled: Boolean(record.enabled),
    limit: Number(record.limit ?? 30),
    releaseWindowDays: Number(record.releaseWindowDays ?? 180),
    remoteWatchId: record.remoteWatchId === null || record.remoteWatchId === undefined
      ? null
      : Number(record.remoteWatchId),
  }
}

function normalizeConfig(input: unknown, existing?: EmbyConfig): EmbyConfig | null {
  if (!input || typeof input !== "object") return null
  const record = input as Record<string, unknown>
  const playlistsInput = Array.isArray(record.playlists) ? record.playlists : []
  const playlists = playlistsInput
    .map((playlist) => normalizePlaylist(playlist))
    .filter((playlist): playlist is EmbyManagedPlaylist => Boolean(playlist))

  const config: EmbyConfig = {
    publicBaseUrl: typeof record.publicBaseUrl === "string" ? record.publicBaseUrl.trim() : existing?.publicBaseUrl ?? "",
    emosBaseUrl: typeof record.emosBaseUrl === "string" ? record.emosBaseUrl.trim() : existing?.emosBaseUrl ?? "",
    emosToken: typeof record.emosToken === "string" ? record.emosToken.trim() : existing?.emosToken ?? "",
    tmdbApiKey: typeof record.tmdbApiKey === "string" ? record.tmdbApiKey.trim() : existing?.tmdbApiKey ?? "",
    playlists,
  }

  if (!config.publicBaseUrl || !config.emosBaseUrl) return null
  if (playlists.length === 0) return null
  return config
}

emby.get("/config", async (c) => {
  try {
    const config = await repository.getConfig()
    return c.json(apiSuccess({ config }))
  } catch (error) {
    console.error("[emby-api] GET /config failed", error)
    return c.json(apiError("INTERNAL_ERROR", "获取 Emby 配置失败"), 500)
  }
})

emby.put("/config", async (c) => {
  try {
    const current = await repository.getConfig()
    const body = await c.req.json()
    const config = normalizeConfig((body as { config?: unknown }).config, current ?? undefined)

    if (!config) {
      return c.json(apiError("EMBY_INVALID_DYNAMIC_WATCH", "Emby 配置格式不正确"), 400)
    }

    const saved = await repository.saveConfig(config)
    return c.json(apiSuccess({ config: saved }))
  } catch (error) {
    console.error("[emby-api] PUT /config failed", error)
    return c.json(apiError("EMBY_DYNAMIC_WATCH_SAVE_FAILED", "保存 Emby 配置失败"), 500)
  }
})

emby.get("/playlists/:slug/preview", async (c) => {
  try {
    const slug = c.req.param("slug") as EmbyPlaylistSlug
    const config = await repository.getConfig()
    const playlist = config?.playlists.find((item) => item.slug === slug)

    if (!config || !playlist) {
      return c.json(apiError("EMBY_DYNAMIC_WATCH_NOT_FOUND", "片单不存在"), 404)
    }

    const preview = await generatePlaylistPreview(config, playlist)
    return c.json(apiSuccess({ preview }))
  } catch (error) {
    console.error("[emby-api] GET /playlists/:slug/preview failed", error)
    return c.json(apiError("INTERNAL_ERROR", "生成热门片单预览失败"), 500)
  }
})

emby.post("/sync", async (c) => {
  try {
    const config = await repository.getConfig()
    if (!config) {
      return c.json(apiError("EMBY_DYNAMIC_WATCH_NOT_FOUND", "Emby 配置不存在"), 404)
    }

    const slug = c.req.query("slug") as EmbyPlaylistSlug | undefined
    const targets = slug
      ? config.playlists.filter((playlist) => playlist.slug === slug && playlist.enabled)
      : config.playlists.filter((playlist) => playlist.enabled)

    const results: EmbySyncResult[] = []
    const updatedPlaylists = [...config.playlists]

    for (const playlist of targets) {
      const result = await syncPlaylistToEmos(config, playlist)
      results.push(result)
      const index = updatedPlaylists.findIndex((item) => item.slug === playlist.slug)
      if (index >= 0) {
        updatedPlaylists[index] = {
          ...updatedPlaylists[index],
          remoteWatchId: result.watchId,
        }
      }
    }

    const saved = await repository.saveConfig({
      ...config,
      playlists: updatedPlaylists,
    })

    return c.json(apiSuccess({ results, config: saved }))
  } catch (error) {
    console.error("[emby-api] POST /sync failed", error)
    return c.json(apiError("INTERNAL_ERROR", "同步 Emos 片单失败"), 500)
  }
})

serverEmby.get("/watch/:slug", async (c) => {
  try {
    const slug = c.req.param("slug") as EmbyPlaylistSlug
    const config = await repository.getConfig()
    const playlist = config?.playlists.find((item) => item.slug === slug && item.enabled)

    if (!config || !playlist) {
      return c.json({ message: "playlist not configured" }, 404)
    }

    const feed = await generatePlaylistFeed(config, playlist)
    return c.json({
      name: feed.name,
      cover: feed.cover,
      updated_at: feed.updatedAt,
      videos: feed.videos.map((video) => ({
        tmdb_id: video.tmdbId,
        tmdb_type: video.tmdbType,
        title: video.title,
        sort: video.sort,
      })),
    })
  } catch (error) {
    console.error("[emby-server] GET /watch/:slug failed", error)
    return c.json({ message: "failed to generate playlist" }, 500)
  }
})

export { emby, serverEmby }

import { Hono } from "hono"
import { apiError, apiSuccess } from "@thunder/contracts"
import type {
  EmbyConfig,
  EmbyDynamicWatchFeed,
  EmbyManagedPlaylist,
  EmbyPlaylistPreview,
  EmbyPlaylistRefreshStatus,
  EmbyPlaylistSlug,
  EmbySyncResult,
  EmbyTmdbType,
  EmbyWatchCache,
  EmbyWatchRefreshTask,
} from "@thunder/emby"
import { EmbyRepositorySQLite } from "./emby-repository"

const emby = new Hono()
const serverEmby = new Hono()
const repository = new EmbyRepositorySQLite()

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  return fallback
}

function toPublicConfig(config: EmbyConfig): EmbyConfig {
  return {
    ...config,
    publicBaseUrl: "",
    emosBaseUrl: "",
    emosToken: "",
    tmdbApiKey: "",
  }
}

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

const TMDB_DISCOVER_PAGE_SIZE = 20
const MAX_PLAYLIST_LIMIT = 5000
const TMDB_DISCOVER_MAX_PAGE = 500
const WATCH_CACHE_TTL_MS = 12 * 60 * 60 * 1000
const WATCH_CACHE_REFRESH_LEAD_MS = 2 * 60 * 60 * 1000

interface EmbyRefreshPreviewItem {
  tmdbId: number
  tmdbType: EmbyTmdbType
  title: string
  posterUrl: string | null
}

interface EmbyRefreshSourceState {
  key: string
  mediaType: EmbyTmdbType
  nextPage: number
  maxPages: number
  targetCount: number
  done: boolean
  params: Record<string, string>
  items: EmbyRefreshPreviewItem[]
}

interface EmbyRefreshState {
  slug: EmbyPlaylistSlug
  sources: EmbyRefreshSourceState[]
}

interface EmbyRefreshStepResult {
  preview: EmbyPlaylistPreview
  feed: EmbyDynamicWatchFeed
  completed: boolean
}

interface EmbyRefreshStepOptions {
  pageBudget: number
  restart: boolean
  persistPartialCache: boolean
}

interface EmbyRefreshCandidate {
  playlist: EmbyManagedPlaylist
  cachedGeneratedAt: string | null
  refreshStatus: string | null
  shouldRestart: boolean
}

const CRON_REFRESH_PAGE_BUDGET = 5
const PREVIEW_REFRESH_PAGE_BUDGET = 12
const PUBLIC_FEED_REFRESH_PAGE_BUDGET = 5

function formatDateTime(date = new Date()): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  const hours = `${date.getHours()}`.padStart(2, "0")
  const minutes = `${date.getMinutes()}`.padStart(2, "0")
  const seconds = `${date.getSeconds()}`.padStart(2, "0")
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

function parseDateTime(value: string): number {
  const normalized = value.includes("T") ? value : value.replace(" ", "T")
  const timestamp = new Date(normalized).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function isWatchCacheFresh(generatedAt: string): boolean {
  const timestamp = parseDateTime(generatedAt)
  return timestamp > 0 && Date.now() - timestamp < WATCH_CACHE_TTL_MS
}

function shouldStartRefreshCycle(generatedAt: string): boolean {
  const timestamp = parseDateTime(generatedAt)
  if (timestamp <= 0) {
    return true
  }

  return Date.now() - timestamp >= WATCH_CACHE_TTL_MS - WATCH_CACHE_REFRESH_LEAD_MS
}

function compareRefreshCandidates(left: EmbyRefreshCandidate, right: EmbyRefreshCandidate): number {
  const leftRefreshing = left.refreshStatus === "refreshing"
  const rightRefreshing = right.refreshStatus === "refreshing"
  if (leftRefreshing !== rightRefreshing) {
    return leftRefreshing ? -1 : 1
  }

  const leftMissingCache = left.cachedGeneratedAt === null
  const rightMissingCache = right.cachedGeneratedAt === null
  if (leftMissingCache !== rightMissingCache) {
    return leftMissingCache ? -1 : 1
  }

  const leftTimestamp = left.cachedGeneratedAt ? parseDateTime(left.cachedGeneratedAt) : 0
  const rightTimestamp = right.cachedGeneratedAt ? parseDateTime(right.cachedGeneratedAt) : 0
  return leftTimestamp - rightTimestamp
}

function refreshWatchCacheInBackground(
  context: {
    executionCtx?: {
      waitUntil?: (promise: Promise<unknown>) => void
    }
  },
  config: EmbyConfig,
  playlist: EmbyManagedPlaylist
) {
  const refreshTask = advancePlaylistRefresh(
    config,
    playlist,
    {
      pageBudget: PUBLIC_FEED_REFRESH_PAGE_BUDGET,
      restart: false,
      persistPartialCache: false,
    }
  )
    .catch((error) => {
      console.error("[emby-server] background cache refresh failed", {
        slug: playlist.slug,
        message: getErrorMessage(error, "unknown error"),
      })
    })

  let waitUntil: ((promise: Promise<unknown>) => void) | undefined
  try {
    waitUntil = context.executionCtx?.waitUntil
  } catch {
    waitUntil = undefined
  }

  if (waitUntil) {
    waitUntil(refreshTask)
  } else {
    void refreshTask
  }
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

function buildEmosSyncSignature(config: EmbyConfig, playlist: EmbyManagedPlaylist): string {
  return JSON.stringify({
    name: playlist.name,
    description: playlist.description,
    isPublic: playlist.isPublic,
    point: playlist.point,
    tags: playlist.tags,
    isShowEmpty: playlist.isShowEmpty,
    cover: resolveCover(config, playlist),
    dynamicUrl: resolvePublicFeedUrl(config, playlist.slug),
  })
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

function resolvePlaylistLimit(limit: number): number {
  return Math.min(MAX_PLAYLIST_LIMIT, Math.max(limit, 10))
}

function toExternalFeed(feed: EmbyDynamicWatchFeed) {
  return {
    name: feed.name,
    cover: feed.cover,
    updated_at: feed.updatedAt,
    videos: feed.videos.map((video) => ({
      tmdb_id: video.tmdbId,
      tmdb_type: video.tmdbType,
      title: video.title,
      sort: video.sort,
    })),
  }
}

function toPosterUrl(path: string | null | undefined): string | null {
  if (!path) {
    return null
  }

  return `https://image.tmdb.org/t/p/w342${path}`
}

function dedupePreviewItems<T extends { tmdbType: EmbyTmdbType; tmdbId: number }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.tmdbType}-${item.tmdbId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function toParamsRecord(params: URLSearchParams): Record<string, string> {
  return Object.fromEntries(params.entries())
}

function toParams(record: Record<string, string>): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(record)) {
    params.set(key, value)
  }
  return params
}

function createRefreshState(playlist: EmbyManagedPlaylist): EmbyRefreshState {
  const limit = resolvePlaylistLimit(playlist.limit)
  const common = new URLSearchParams({
    language: "zh-CN",
    include_adult: "false",
    sort_by: "popularity.desc",
  })

  if (playlist.slug === "domestic-tv") {
    common.set("first_air_date.gte", daysAgo(playlist.releaseWindowDays))
    common.set("with_origin_country", "CN")
    common.set("without_genres", "16")
    return {
      slug: playlist.slug,
      sources: [
        {
          key: "domestic-tv",
          mediaType: "tv",
          nextPage: 1,
          maxPages: Math.ceil(limit / TMDB_DISCOVER_PAGE_SIZE),
          targetCount: limit,
          done: false,
          params: toParamsRecord(common),
          items: [],
        },
      ],
    }
  }

  if (playlist.slug === "domestic-movie") {
    common.set("primary_release_date.gte", daysAgo(playlist.releaseWindowDays))
    common.set("with_origin_country", "CN")
    common.set("without_genres", "16")
    return {
      slug: playlist.slug,
      sources: [
        {
          key: "domestic-movie",
          mediaType: "movie",
          nextPage: 1,
          maxPages: Math.ceil(limit / TMDB_DISCOVER_PAGE_SIZE),
          targetCount: limit,
          done: false,
          params: toParamsRecord(common),
          items: [],
        },
      ],
    }
  }

  if (playlist.slug === "foreign-tv") {
    common.set("first_air_date.gte", daysAgo(playlist.releaseWindowDays))
    common.set("without_genres", "16")
    return {
      slug: playlist.slug,
      sources: [
        {
          key: "foreign-tv",
          mediaType: "tv",
          nextPage: 1,
          maxPages: TMDB_DISCOVER_MAX_PAGE,
          targetCount: limit,
          done: false,
          params: toParamsRecord(common),
          items: [],
        },
      ],
    }
  }

  if (playlist.slug === "foreign-movie") {
    common.set("primary_release_date.gte", daysAgo(playlist.releaseWindowDays))
    common.set("without_genres", "16")
    return {
      slug: playlist.slug,
      sources: [
        {
          key: "foreign-movie",
          mediaType: "movie",
          nextPage: 1,
          maxPages: TMDB_DISCOVER_MAX_PAGE,
          targetCount: limit,
          done: false,
          params: toParamsRecord(common),
          items: [],
        },
      ],
    }
  }

  const animeTvParams = new URLSearchParams(common)
  animeTvParams.set("first_air_date.gte", daysAgo(playlist.releaseWindowDays))
  animeTvParams.set("with_genres", "16")

  const animeMovieParams = new URLSearchParams(common)
  animeMovieParams.set("primary_release_date.gte", daysAgo(playlist.releaseWindowDays))
  animeMovieParams.set("with_genres", "16")

  return {
    slug: playlist.slug,
    sources: [
      {
        key: "anime-tv",
        mediaType: "tv",
        nextPage: 1,
        maxPages: Math.ceil(Math.ceil(limit / 2) / TMDB_DISCOVER_PAGE_SIZE),
        targetCount: Math.ceil(limit / 2),
        done: false,
        params: toParamsRecord(animeTvParams),
        items: [],
      },
      {
        key: "anime-movie",
        mediaType: "movie",
        nextPage: 1,
        maxPages: Math.ceil(Math.ceil(limit / 2) / TMDB_DISCOVER_PAGE_SIZE),
        targetCount: Math.ceil(limit / 2),
        done: false,
        params: toParamsRecord(animeMovieParams),
        items: [],
      },
    ],
  }
}

async function advancePlaylistRefresh(
  config: EmbyConfig,
  playlist: EmbyManagedPlaylist,
  options: EmbyRefreshStepOptions
): Promise<EmbyRefreshStepResult> {
  const apiKey = config.tmdbApiKey.trim()
  if (!apiKey) {
    throw new Error("TMDB API key is missing")
  }

  const existingTask = await repository.getWatchRefreshTask(playlist.slug)
  const existingCache = await repository.getWatchCache(playlist.slug)
  const restarting = options.restart || !existingTask || existingTask.status !== "refreshing"
  const state = restarting
    ? createRefreshState(playlist)
    : parseRefreshState(existingTask.stateJson, playlist)

  const nowTimestamp = new Date().toISOString()

  try {
    let remainingBudget = Math.max(1, options.pageBudget)

    while (remainingBudget > 0) {
      const source = pickNextRefreshSource(state.sources)
      if (!source) {
        break
      }

      if (source.items.length >= source.targetCount || source.nextPage > source.maxPages) {
        source.done = true
        continue
      }

      const params = toParams(source.params)
      params.set("page", String(source.nextPage))
      const pageItems = await fetchTmdbDiscover(apiKey, source.mediaType, params)

      appendRefreshItems(playlist, source, pageItems)
      source.nextPage += 1
      remainingBudget -= 1

      if (
        pageItems.length < TMDB_DISCOVER_PAGE_SIZE ||
        source.items.length >= source.targetCount ||
        source.nextPage > source.maxPages
      ) {
        source.done = true
      }
    }

    const preview = buildPreviewFromRefreshState(config, playlist, state)
    const completed = state.sources.every((source) => source.done || source.items.length >= source.targetCount)

    if (completed || options.persistPartialCache || !existingCache) {
      await repository.saveWatchCache(playlist.slug, preview.feed)
    }

    await repository.saveWatchRefreshTask({
      slug: playlist.slug,
      status: completed ? "completed" : "refreshing",
      stateJson: JSON.stringify(state),
      errorMessage: null,
      createdAt: existingTask?.createdAt ?? nowTimestamp,
      updatedAt: nowTimestamp,
    })

    return {
      preview,
      feed: preview.feed,
      completed,
    }
  } catch (error) {
    await repository.saveWatchRefreshTask({
      slug: playlist.slug,
      status: "failed",
      stateJson: JSON.stringify(state),
      errorMessage: getErrorMessage(error, "unknown error"),
      createdAt: existingTask?.createdAt ?? nowTimestamp,
      updatedAt: nowTimestamp,
    })

    throw error
  }
}

function parseRefreshState(raw: string, playlist: EmbyManagedPlaylist): EmbyRefreshState {
  try {
    const parsed = JSON.parse(raw) as EmbyRefreshState
    if (parsed.slug === playlist.slug && Array.isArray(parsed.sources)) {
      return parsed
    }
  } catch {
    // fall through to reset invalid state
  }

  return createRefreshState(playlist)
}

function shouldKeepRefreshItem(playlist: EmbyManagedPlaylist, item: TmdbDiscoverItem): boolean {
  if (playlist.slug === "foreign-tv") {
    return !(item.origin_country ?? []).includes("CN")
  }

  if (playlist.slug === "foreign-movie") {
    return item.original_language !== "zh"
  }

  return true
}

function appendRefreshItems(
  playlist: EmbyManagedPlaylist,
  source: EmbyRefreshSourceState,
  items: TmdbDiscoverItem[]
) {
  const seen = new Set(source.items.map((item) => `${item.tmdbType}-${item.tmdbId}`))

  for (const item of items) {
    if (!shouldKeepRefreshItem(playlist, item)) {
      continue
    }

    const title = source.mediaType === "tv" ? (item.name ?? "") : (item.title ?? "")
    const previewItem: EmbyRefreshPreviewItem = {
      tmdbId: item.id,
      tmdbType: source.mediaType,
      title,
      posterUrl: toPosterUrl(item.poster_path),
    }
    const key = `${previewItem.tmdbType}-${previewItem.tmdbId}`

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    source.items.push(previewItem)
  }
}

function pickNextRefreshSource(sources: EmbyRefreshSourceState[]): EmbyRefreshSourceState | null {
  const candidates = sources.filter((source) => !source.done)
  if (candidates.length === 0) {
    return null
  }

  return candidates.reduce((current, candidate) => (
    candidate.nextPage < current.nextPage ? candidate : current
  ))
}

function buildPreviewFromRefreshState(
  config: EmbyConfig,
  playlist: EmbyManagedPlaylist,
  state: EmbyRefreshState
): EmbyPlaylistPreview {
  const limit = resolvePlaylistLimit(playlist.limit)

  const merged = dedupePreviewItems(
    state.sources.flatMap((source) => source.items)
  )
    .slice(0, limit)
    .map((item, index) => ({
      tmdbId: item.tmdbId,
      tmdbType: item.tmdbType,
      title: item.title,
      sort: index + 1,
      posterUrl: item.posterUrl,
    }))

  return {
    feed: {
      name: playlist.name,
      cover: resolveCover(config, playlist),
      updatedAt: formatDateTime(),
      videos: merged.map(({ posterUrl: _posterUrl, ...video }) => video),
    },
    videos: merged,
  }
}

function toRefreshStatus(
  playlist: EmbyManagedPlaylist,
  refreshTask: EmbyWatchRefreshTask | null,
  cache: EmbyWatchCache | null
): EmbyPlaylistRefreshStatus {
  if (!refreshTask) {
    return {
      slug: playlist.slug,
      status: cache ? "completed" : "idle",
      processedPages: 0,
      totalPages: 0,
      collectedCount: cache?.count ?? 0,
      targetCount: resolvePlaylistLimit(playlist.limit),
      completedSources: 0,
      totalSources: 0,
      cacheGeneratedAt: cache?.generatedAt ?? null,
      updatedAt: cache?.generatedAt ?? null,
      errorMessage: null,
    }
  }

  const state = parseRefreshState(refreshTask.stateJson, playlist)
  const mergedItems = dedupePreviewItems(state.sources.flatMap((source) => source.items))

  return {
    slug: playlist.slug,
    status: refreshTask.status as EmbyPlaylistRefreshStatus["status"],
    processedPages: state.sources.reduce((total, source) => total + Math.min(source.maxPages, source.nextPage - 1), 0),
    totalPages: state.sources.reduce((total, source) => total + source.maxPages, 0),
    collectedCount: mergedItems.length,
    targetCount: resolvePlaylistLimit(playlist.limit),
    completedSources: state.sources.filter((source) => source.done || source.items.length >= source.targetCount).length,
    totalSources: state.sources.length,
    cacheGeneratedAt: cache?.generatedAt ?? null,
    updatedAt: refreshTask.updatedAt,
    errorMessage: refreshTask.errorMessage,
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

    if (res.status === 403 && text.includes("Just a moment")) {
      throw new Error("Emos 主站被 Cloudflare 403 拦截，请将 EMBY_EMOS_BASE_URL 切换为 https://api.emos.best 后重试")
    }

    throw new Error(`Emos request failed: ${res.status} ${text.slice(0, 500)}`)
  }

  return res.json() as Promise<T>
}

async function refreshEnabledPlaylistCaches(): Promise<void> {
  const config = await repository.getConfig()
  if (!config) {
    return
  }

  const enabledPlaylists = config.playlists.filter((playlist) => playlist.enabled)
  const candidates: EmbyRefreshCandidate[] = []

  for (const playlist of enabledPlaylists) {
    const cached = await repository.getWatchCache(playlist.slug)
    const refreshTask = await repository.getWatchRefreshTask(playlist.slug)
    const shouldRestart = !cached || shouldStartRefreshCycle(cached.generatedAt) || refreshTask?.status === "failed"
    if (!shouldRestart && refreshTask?.status !== "refreshing") {
      continue
    }

    candidates.push({
      playlist,
      cachedGeneratedAt: cached?.generatedAt ?? null,
      refreshStatus: refreshTask?.status ?? null,
      shouldRestart,
    })
  }

  const nextCandidate = candidates.sort(compareRefreshCandidates)[0]
  if (!nextCandidate) {
    return
  }

  const cached = nextCandidate.cachedGeneratedAt
  await advancePlaylistRefresh(config, nextCandidate.playlist, {
    pageBudget: CRON_REFRESH_PAGE_BUDGET,
    restart: nextCandidate.shouldRestart,
    persistPartialCache: !cached,
  })
}

async function syncPlaylistToEmos(
  config: EmbyConfig,
  playlist: EmbyManagedPlaylist,
  feed: EmbyDynamicWatchFeed
): Promise<EmbySyncResult> {
  const dynamicUrl = resolvePublicFeedUrl(config, playlist.slug)
  const syncSignature = buildEmosSyncSignature(config, playlist)
  const watchId = playlist.remoteWatchId
  const lastSyncSignature = await repository.getPlaylistSyncSignature(playlist.slug)

  if (watchId && lastSyncSignature === syncSignature) {
    return {
      slug: playlist.slug,
      name: playlist.name,
      watchId,
      dynamicUrl,
      updatedAt: feed.updatedAt,
      count: feed.videos.length,
    }
  }

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

  await emosRequest(config, `/api/watch/${resolvedWatchId}/dynamic`, {
    method: "PUT",
    body: JSON.stringify({
      url: dynamicUrl,
    }),
  })

  await repository.savePlaylistSyncSignature(playlist.slug, syncSignature)

  return {
    slug: playlist.slug,
    name: playlist.name,
    watchId: resolvedWatchId,
    dynamicUrl,
    updatedAt: feed.updatedAt,
    count: feed.videos.length,
  }
}

emby.get("/config", async (c) => {
  try {
    const config = await repository.getConfig()
    return c.json(apiSuccess({ config: config ? toPublicConfig(config) : null }))
  } catch (error) {
    console.error("[emby-api] GET /config failed", error)
    return c.json(apiError("INTERNAL_ERROR", "获取 Emby 配置失败"), 500)
  }
})

emby.put("/config", async (c) => {
  try {
    const body = await c.req.json().catch(() => null) as { config?: EmbyConfig } | null
    const current = await repository.getConfig()
    const incoming = body?.config

    if (!current || !incoming) {
      return c.json(apiError("VALIDATION_ERROR", "片单配置不能为空"), 400)
    }

    const saved = await repository.saveConfig({
      ...current,
      playlists: incoming.playlists,
    })

    return c.json(apiSuccess({ config: toPublicConfig(saved) }))
  } catch (error) {
    console.error("[emby-api] PUT /config failed", error)
    return c.json(apiError("INTERNAL_ERROR", getErrorMessage(error, "保存 Emby 片单失败")), 500)
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

    const refreshTask = await repository.getWatchRefreshTask(slug)
    const result = await advancePlaylistRefresh(config, playlist, {
      pageBudget: PREVIEW_REFRESH_PAGE_BUDGET,
      restart: refreshTask?.status !== "refreshing",
      persistPartialCache: !(await repository.getWatchCache(slug)),
    })

    const preview = result.preview
    return c.json(apiSuccess({ preview }))
  } catch (error) {
    console.error("[emby-api] GET /playlists/:slug/preview failed", error)
    return c.json(apiError("INTERNAL_ERROR", getErrorMessage(error, "生成热门片单预览失败")), 500)
  }
})

emby.get("/playlists/:slug/refresh-status", async (c) => {
  try {
    const slug = c.req.param("slug") as EmbyPlaylistSlug
    const config = await repository.getConfig()
    const playlist = config?.playlists.find((item) => item.slug === slug)

    if (!config || !playlist) {
      return c.json(apiError("EMBY_DYNAMIC_WATCH_NOT_FOUND", "片单不存在"), 404)
    }

    const [cache, refreshTask] = await Promise.all([
      repository.getWatchCache(slug),
      repository.getWatchRefreshTask(slug),
    ])

    return c.json(apiSuccess({
      status: toRefreshStatus(playlist, refreshTask, cache),
    }))
  } catch (error) {
    console.error("[emby-api] GET /playlists/:slug/refresh-status failed", error)
    return c.json(apiError("INTERNAL_ERROR", getErrorMessage(error, "获取缓存刷新状态失败")), 500)
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
      const cached = await repository.getWatchCache(playlist.slug)
      const result = await syncPlaylistToEmos(
        config,
        playlist,
        cached?.feed ?? {
          name: playlist.name,
          cover: resolveCover(config, playlist),
          updatedAt: formatDateTime(),
          videos: [],
        }
      )
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

    return c.json(apiSuccess({ results, config: toPublicConfig(saved) }))
  } catch (error) {
    console.error("[emby-api] POST /sync failed", error)
    return c.json(apiError("INTERNAL_ERROR", getErrorMessage(error, "同步 Emos 片单失败")), 500)
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

    const cached = await repository.getWatchCache(slug)
    const refreshTask = await repository.getWatchRefreshTask(slug)
    if (cached) {
      if (shouldStartRefreshCycle(cached.generatedAt) || refreshTask?.status === "refreshing") {
        refreshWatchCacheInBackground(c, config, playlist)
      }

      return c.json(toExternalFeed(cached.feed))
    }

    const result = await advancePlaylistRefresh(config, playlist, {
      pageBudget: PUBLIC_FEED_REFRESH_PAGE_BUDGET,
      restart: true,
      persistPartialCache: true,
    })
    return c.json(toExternalFeed(result.feed))
  } catch (error) {
    console.error("[emby-server] GET /watch/:slug failed", error)
    return c.json({ message: "failed to generate playlist" }, 500)
  }
})

export { emby, refreshEnabledPlaylistCaches, serverEmby }

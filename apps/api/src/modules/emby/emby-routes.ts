import { Hono } from "hono"
import { apiError, apiSuccess } from "@thunder/contracts"
import { prisma } from "@thunder/database"
import type {
  EmbyConfig,
  EmbyDynamicWatchFeed,
  EmbyManagedPlaylist,
  EmbyPlaylistPreview,
  EmbyPlaylistPreviewPage,
  EmbyPlaylistRefreshStatus,
  EmbyPlaylistSlug,
  EmbySyncResult,
  EmbyTmdbType,
  EmbyWatchCache,
  EmbyWatchRefreshItem,
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

interface TmdbDetailResponse {
  poster_path?: string | null
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
  collectedCount: number
  done: boolean
  params: Record<string, string>
}

interface EmbyRefreshState {
  version: number
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

function isValidRefreshSourceState(value: unknown): value is EmbyRefreshSourceState {
  if (!value || typeof value !== "object") {
    return false
  }

  const source = value as Partial<EmbyRefreshSourceState>
  return (
    typeof source.key === "string" &&
    (source.mediaType === "movie" || source.mediaType === "tv") &&
    typeof source.nextPage === "number" &&
    Number.isFinite(source.nextPage) &&
    typeof source.maxPages === "number" &&
    Number.isFinite(source.maxPages) &&
    typeof source.targetCount === "number" &&
    Number.isFinite(source.targetCount) &&
    typeof source.collectedCount === "number" &&
    Number.isFinite(source.collectedCount) &&
    typeof source.done === "boolean" &&
    !!source.params &&
    typeof source.params === "object"
  )
}

const CRON_REFRESH_PAGE_BUDGET = 5
const PREVIEW_REFRESH_PAGE_BUDGET = 5
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
    waitUntil = context.executionCtx?.waitUntil?.bind(context.executionCtx)
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

interface EmosSyncState {
  metadataSignature: string
  dynamicSignature: string
}

function buildEmosMetadataSignature(config: EmbyConfig, playlist: EmbyManagedPlaylist): string {
  return JSON.stringify({
    name: playlist.name,
    description: playlist.description,
    isPublic: playlist.isPublic,
    point: playlist.point,
    tags: playlist.tags,
    isShowEmpty: playlist.isShowEmpty,
    cover: resolveCover(config, playlist),
  })
}

function buildEmosDynamicSignature(config: EmbyConfig, playlist: EmbyManagedPlaylist): string {
  return JSON.stringify({
    dynamicUrl: resolvePublicFeedUrl(config, playlist.slug),
  })
}

function buildEmosSyncState(config: EmbyConfig, playlist: EmbyManagedPlaylist): EmosSyncState {
  return {
    metadataSignature: buildEmosMetadataSignature(config, playlist),
    dynamicSignature: buildEmosDynamicSignature(config, playlist),
  }
}

function parseStoredEmosSyncState(raw: string | null): EmosSyncState | null {
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<EmosSyncState>
    if (
      typeof parsed.metadataSignature === "string" &&
      typeof parsed.dynamicSignature === "string"
    ) {
      return {
        metadataSignature: parsed.metadataSignature,
        dynamicSignature: parsed.dynamicSignature,
      }
    }
  } catch {
    // 兼容旧格式：之前只存了一份整体验签名，无法区分元数据和动态地址。
  }

  return null
}

function truncateLogText(value: string, maxLength = 2000): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...<truncated>` : value
}

function getRequestBodyPreview(body: RequestInit["body"]): string | null {
  if (typeof body === "string") {
    return truncateLogText(body)
  }

  return null
}

function parseJsonResponse<T>(text: string): T {
  return JSON.parse(text) as T
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

  console.info("[emby-tmdb] 请求", {
    endpoint,
    url: url.replace(/api_key=[^&]+/, "api_key=***"),
    params: Object.fromEntries(searchParams.entries()),
  })

  const res = await fetch(url, {
    headers: getTmdbHeaders(apiKey),
  })

  if (!res.ok) {
    const errorText = await res.text().catch(() => "")
    console.error("[emby-tmdb] 请求失败", {
      endpoint,
      status: res.status,
      statusText: res.statusText,
      error: errorText.slice(0, 500),
    })
    throw new Error(`TMDB discover failed: ${res.status} ${res.statusText}`)
  }

  const data = await res.json() as TmdbDiscoverResponse
  console.info("[emby-tmdb] 响应", {
    endpoint,
    totalResults: data.results?.length ?? 0,
  })

  return data.results ?? []
}

async function fetchTmdbPosterUrl(
  apiKey: string,
  mediaType: EmbyTmdbType,
  tmdbId: number
): Promise<string | null> {
  const endpoint = mediaType === "movie" ? "movie" : "tv"
  const url = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}?language=zh-CN`
  const res = await fetch(url, {
    headers: getTmdbHeaders(apiKey),
  })

  if (!res.ok) {
    return null
  }

  const data = await res.json() as TmdbDetailResponse
  return toPosterUrl(data.poster_path)
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

function createRefreshRunId(date = new Date()): string {
  return date.toISOString()
}

function toRefreshPreviewItem(item: EmbyWatchRefreshItem): EmbyRefreshPreviewItem {
  return {
    tmdbId: item.tmdbId,
    tmdbType: item.tmdbType,
    title: item.title,
    posterUrl: item.posterUrl,
  }
}

function groupRefreshItemsBySource(
  state: EmbyRefreshState,
  items: EmbyWatchRefreshItem[]
): Map<string, EmbyRefreshPreviewItem[]> {
  const grouped = new Map<string, EmbyRefreshPreviewItem[]>(
    state.sources.map((source) => [source.key, []])
  )

  for (const item of items) {
    const sourceItems = grouped.get(item.sourceKey)
    if (!sourceItems) {
      continue
    }

    sourceItems.push(toRefreshPreviewItem(item))
  }

  return grouped
}

function flattenRefreshItems(groupedItems: Map<string, EmbyRefreshPreviewItem[]>): EmbyRefreshPreviewItem[] {
  return Array.from(groupedItems.values()).flat()
}

function getStateJsonBytes(state: EmbyRefreshState): number {
  return new TextEncoder().encode(JSON.stringify(state)).length
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
      version: 1,
      sources: [
        {
          key: "domestic-tv",
          mediaType: "tv",
          nextPage: 1,
          maxPages: Math.ceil(limit / TMDB_DISCOVER_PAGE_SIZE),
          targetCount: limit,
          collectedCount: 0,
          done: false,
          params: toParamsRecord(common),
        },
      ],
    }
  }

  if (playlist.slug === "domestic-movie") {
    common.set("primary_release_date.gte", daysAgo(playlist.releaseWindowDays))
    common.set("with_origin_country", "CN")
    common.set("without_genres", "16")
    return {
      version: 1,
      sources: [
        {
          key: "domestic-movie",
          mediaType: "movie",
          nextPage: 1,
          maxPages: Math.ceil(limit / TMDB_DISCOVER_PAGE_SIZE),
          targetCount: limit,
          collectedCount: 0,
          done: false,
          params: toParamsRecord(common),
        },
      ],
    }
  }

  if (playlist.slug === "foreign-tv") {
    common.set("first_air_date.gte", daysAgo(playlist.releaseWindowDays))
    common.set("without_genres", "16")
    return {
      version: 1,
      sources: [
        {
          key: "foreign-tv",
          mediaType: "tv",
          nextPage: 1,
          maxPages: TMDB_DISCOVER_MAX_PAGE,
          targetCount: limit,
          collectedCount: 0,
          done: false,
          params: toParamsRecord(common),
        },
      ],
    }
  }

  if (playlist.slug === "foreign-movie") {
    common.set("primary_release_date.gte", daysAgo(playlist.releaseWindowDays))
    common.set("without_genres", "16")
    return {
      version: 1,
      sources: [
        {
          key: "foreign-movie",
          mediaType: "movie",
          nextPage: 1,
          maxPages: TMDB_DISCOVER_MAX_PAGE,
          targetCount: limit,
          collectedCount: 0,
          done: false,
          params: toParamsRecord(common),
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
    version: 1,
    sources: [
      {
        key: "anime-tv",
        mediaType: "tv",
        nextPage: 1,
        maxPages: Math.ceil(Math.ceil(limit / 2) / TMDB_DISCOVER_PAGE_SIZE),
        targetCount: Math.ceil(limit / 2),
        collectedCount: 0,
        done: false,
        params: toParamsRecord(animeTvParams),
      },
      {
        key: "anime-movie",
        mediaType: "movie",
        nextPage: 1,
        maxPages: Math.ceil(Math.ceil(limit / 2) / TMDB_DISCOVER_PAGE_SIZE),
        targetCount: Math.ceil(limit / 2),
        collectedCount: 0,
        done: false,
        params: toParamsRecord(animeMovieParams),
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
  const canResume = existingTask && (existingTask.status === "refreshing" || existingTask.status === "failed")
  const restarting = options.restart || !canResume
  const nowTimestamp = new Date().toISOString()
  const runId = restarting ? createRefreshRunId() : existingTask!.runId

  if (restarting) {
    const state = createRefreshState(playlist)
    await prisma.$transaction(async (tx) => {
      await repository.deleteWatchRefreshItems(playlist.slug, undefined, tx)
      await repository.saveWatchRefreshTask({
        slug: playlist.slug,
        runId,
        status: "refreshing",
        stateJson: JSON.stringify(state),
        errorMessage: null,
        createdAt: nowTimestamp,
        updatedAt: nowTimestamp,
      }, tx)
    })
  }

  const state = restarting
    ? createRefreshState(playlist)
    : parseRefreshState(existingTask!.stateJson, playlist)
  const baseStateJson = JSON.stringify(state)
  let storedItems = await repository.listWatchRefreshItems(playlist.slug, runId)
  const sourceItems = groupRefreshItemsBySource(state, storedItems)
  for (const source of state.sources) {
    source.collectedCount = sourceItems.get(source.key)?.length ?? 0
  }
  const refreshItemCount = storedItems.length
  const logPrefix = `[emby-cache] ${playlist.slug}`

  console.info(`${logPrefix} 开始刷新`, {
    mode: restarting ? "全新刷新" : "继续刷新",
    previousStatus: existingTask?.status ?? "无",
    runId,
    pageBudget: options.pageBudget,
    sourcesCount: state.sources.length,
    existingStatus: existingTask?.status ?? "无",
    existingCache: existingCache ? `有(${existingCache.count}条)` : "无",
    refreshItemCount,
    stateJsonBytes: getStateJsonBytes(state),
  })

  try {
    let remainingBudget = Math.max(1, options.pageBudget)
    let totalFetchedPages = 0
    const pendingItems: EmbyWatchRefreshItem[] = []

    while (remainingBudget > 0) {
      const source = pickNextRefreshSource(state.sources)
      if (!source) {
        console.info(`${logPrefix} 所有源已完成`, {
          totalFetchedPages,
        })
        break
      }

      const currentSourceItems = sourceItems.get(source.key) ?? []
      source.collectedCount = currentSourceItems.length
      if (source.collectedCount >= source.targetCount || source.nextPage > source.maxPages) {
        source.done = true
        continue
      }

      const params = toParams(source.params)
      params.set("page", String(source.nextPage))

      console.info(`${logPrefix} 请求TMDB`, {
        source: source.key,
        mediaType: source.mediaType,
        page: source.nextPage,
        remainingBudget,
        runId,
        collectedCountBefore: source.collectedCount,
        stateJsonBytes: getStateJsonBytes(state),
      })

      const pageItems = await fetchTmdbDiscover(apiKey, source.mediaType, params)

      const appendedItems = appendRefreshItems(playlist, source, currentSourceItems, pageItems)
      if (appendedItems.length > 0) {
        const itemTimestamp = new Date().toISOString()
        pendingItems.push(
          ...appendedItems.map((item) => ({
            slug: playlist.slug,
            runId,
            sourceKey: source.key,
            tmdbId: item.tmdbId,
            tmdbType: item.tmdbType,
            title: item.title,
            posterUrl: item.posterUrl,
            fetchedPage: source.nextPage,
            createdAt: itemTimestamp,
            updatedAt: itemTimestamp,
          }))
        )
        currentSourceItems.push(...appendedItems)
      }
      source.collectedCount = currentSourceItems.length
      const addedCount = appendedItems.length

      console.info(`${logPrefix} 获取到数据`, {
        source: source.key,
        page: source.nextPage,
        returnedCount: pageItems.length,
        addedCount,
        totalInSource: source.collectedCount,
        targetCount: source.targetCount,
        runId,
        refreshItemCount: flattenRefreshItems(sourceItems).length,
        stateJsonBytes: getStateJsonBytes(state),
      })

      source.nextPage += 1
      remainingBudget -= 1
      totalFetchedPages += 1

      if (
        pageItems.length < TMDB_DISCOVER_PAGE_SIZE ||
        source.collectedCount >= source.targetCount ||
        source.nextPage > source.maxPages
      ) {
        source.done = true
        console.info(`${logPrefix} 源已完成`, {
          source: source.key,
          reason: pageItems.length < TMDB_DISCOVER_PAGE_SIZE ? "无更多数据" :
            source.collectedCount >= source.targetCount ? "达到目标数量" : "达到最大页数",
          finalCount: source.collectedCount,
          runId,
        })
      }
    }

    const preview = buildPreviewFromRefreshState(config, playlist, flattenRefreshItems(sourceItems))
    const completed = state.sources.every((source) => source.done || source.collectedCount >= source.targetCount)
    const stateJson = JSON.stringify(state)

    console.info(`${logPrefix} 刷新进度`, {
      completed,
      totalFetchedPages,
      finalCount: preview.feed.videos.length,
      runId,
      refreshItemCount: flattenRefreshItems(sourceItems).length,
      stateJsonBytes: new TextEncoder().encode(stateJson).length,
      sourcesStatus: state.sources.map((s) => ({
        key: s.key,
        done: s.done,
        count: s.collectedCount,
      })),
    })

    if (completed || options.persistPartialCache || !existingCache) {
      await repository.saveWatchCache(playlist.slug, preview.feed)
      console.info(`${logPrefix} 缓存已保存`, {
        count: preview.feed.videos.length,
        generatedAt: preview.feed.updatedAt,
        runId,
      })
    }

    await prisma.$transaction(async (tx) => {
      if (pendingItems.length > 0) {
        await repository.saveWatchRefreshItems(pendingItems, tx)
      }
      await repository.saveWatchRefreshTask({
        slug: playlist.slug,
        runId,
        status: completed ? "completed" : "refreshing",
        stateJson,
        errorMessage: null,
        createdAt: existingTask?.createdAt ?? nowTimestamp,
        updatedAt: nowTimestamp,
      }, tx)
    })

    console.info(`${logPrefix} 刷新${completed ? "完成" : "待继续"}`, {
      status: completed ? "completed" : "refreshing",
      totalVideos: preview.feed.videos.length,
      runId,
      refreshItemCount: flattenRefreshItems(sourceItems).length,
      stateJsonBytes: new TextEncoder().encode(stateJson).length,
    })

    return {
      preview,
      feed: preview.feed,
      completed,
    }
  } catch (error) {
    const errorMessage = getErrorMessage(error, "unknown error")
    console.error(`${logPrefix} 刷新失败`, {
      error: errorMessage,
      runId,
      refreshItemCount: flattenRefreshItems(sourceItems).length,
      stateJsonBytes: getStateJsonBytes(state),
      currentState: {
        sources: state.sources.map((s) => ({
          key: s.key,
          nextPage: s.nextPage,
          itemsCount: s.collectedCount,
          done: s.done,
        })),
      },
    })

    await repository.saveWatchRefreshTask({
      slug: playlist.slug,
      runId,
      status: "failed",
      stateJson: baseStateJson,
      errorMessage,
      createdAt: existingTask?.createdAt ?? nowTimestamp,
      updatedAt: nowTimestamp,
    })

    throw error
  }
}

function parseRefreshState(raw: string, playlist: EmbyManagedPlaylist): EmbyRefreshState {
  try {
    const parsed = JSON.parse(raw) as {
      version?: number
      sources?: unknown[]
    }
    if (
      typeof parsed.version === "number" &&
      Array.isArray(parsed.sources) &&
      parsed.sources.every((source) => isValidRefreshSourceState(source))
    ) {
      return parsed as EmbyRefreshState
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
  source: Pick<EmbyRefreshSourceState, "mediaType">,
  existingItems: EmbyRefreshPreviewItem[],
  items: TmdbDiscoverItem[]
): EmbyRefreshPreviewItem[] {
  const seen = new Set(existingItems.map((item) => `${item.tmdbType}-${item.tmdbId}`))
  const appended: EmbyRefreshPreviewItem[] = []

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
    appended.push(previewItem)
  }

  return appended
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
  items: EmbyRefreshPreviewItem[]
): EmbyPlaylistPreview {
  const limit = resolvePlaylistLimit(playlist.limit)

  const merged = dedupePreviewItems(items)
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

async function buildPreviewFromCache(
  feed: EmbyDynamicWatchFeed,
  refreshItems: EmbyWatchRefreshItem[],
  apiKey: string,
  page: number,
  pageSize: number
): Promise<EmbyPlaylistPreviewPage> {
  const posterMap = new Map(
    refreshItems.map((item) => [
      `${item.tmdbType}-${item.tmdbId}`,
      item.posterUrl,
    ])
  )

  const totalCount = feed.videos.length
  const normalizedPage = Math.max(1, page)
  const normalizedPageSize = Math.max(1, pageSize)
  const pageVideos = feed.videos.slice(
    (normalizedPage - 1) * normalizedPageSize,
    normalizedPage * normalizedPageSize
  )

  const videos = await Promise.all(pageVideos.map(async (video) => {
    const key = `${video.tmdbType}-${video.tmdbId}`
    const cachedPosterUrl = posterMap.get(key)
    const posterUrl = cachedPosterUrl ?? await fetchTmdbPosterUrl(apiKey, video.tmdbType, video.tmdbId)

    return {
      ...video,
      posterUrl,
    }
  }))

  return {
    preview: {
      feed: {
        ...feed,
        videos: pageVideos,
      },
      videos,
    },
    totalCount,
    page: normalizedPage,
    pageSize: normalizedPageSize,
  }
}

function toRefreshStatus(
  playlist: EmbyManagedPlaylist,
  refreshTask: EmbyWatchRefreshTask | null,
  cache: EmbyWatchCache | null,
  refreshItems: EmbyWatchRefreshItem[]
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
  const mergedItems = dedupePreviewItems(
    refreshItems.map(toRefreshPreviewItem)
  )
  const isCompleted = refreshTask.status === "completed"

  return {
    slug: playlist.slug,
    status: refreshTask.status as EmbyPlaylistRefreshStatus["status"],
    processedPages: isCompleted
      ? state.sources.reduce((total, source) => total + source.maxPages, 0)
      : state.sources.reduce((total, source) => total + Math.min(source.maxPages, source.nextPage - 1), 0),
    totalPages: state.sources.reduce((total, source) => total + source.maxPages, 0),
    collectedCount: isCompleted ? (cache?.count ?? mergedItems.length) : mergedItems.length,
    targetCount: resolvePlaylistLimit(playlist.limit),
    completedSources: isCompleted ? state.sources.length : state.sources.filter((source) => source.done || source.collectedCount >= source.targetCount).length,
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
  const method = init?.method ?? "GET"
  const requestBody = getRequestBodyPreview(init?.body)

  if (!baseUrl || !token) {
    throw new Error("Emos config is incomplete")
  }

  // 统一输出 Emos 请求日志，便于在 Cloudflare Workers 日志中排查同步问题。
  console.info("[emby-api] Emos request", {
    method,
    url: `${baseUrl}${path}`,
    body: requestBody,
  })

  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })

  const text = await res.text()

  console.info("[emby-api] Emos response", {
    method,
    url: `${baseUrl}${path}`,
    status: res.status,
    ok: res.ok,
    body: truncateLogText(text),
  })

  if (!res.ok) {
    if (res.status === 403 && text.includes("Just a moment")) {
      throw new Error("Emos 主站被 Cloudflare 403 拦截，请将 EMBY_EMOS_BASE_URL 切换为 https://api.emos.best 后重试")
    }

    throw new Error(`Emos request failed: ${res.status} ${text.slice(0, 500)}`)
  }

  return parseJsonResponse<T>(text)
}

async function refreshEnabledPlaylistCaches(): Promise<void> {
  console.info("[emby-cron] 定时任务开始执行")

  const config = await repository.getConfig()
  if (!config) {
    console.info("[emby-cron] 无配置，跳过")
    return
  }

  const enabledPlaylists = config.playlists.filter((playlist) => playlist.enabled)
  console.info("[emby-cron] 检查片单", {
    totalPlaylists: config.playlists.length,
    enabledPlaylists: enabledPlaylists.length,
  })

  const candidates: EmbyRefreshCandidate[] = []

  for (const playlist of enabledPlaylists) {
    const cached = await repository.getWatchCache(playlist.slug)
    const refreshTask = await repository.getWatchRefreshTask(playlist.slug)
    const isRefreshing = refreshTask?.status === "refreshing"
    // 正在续跑的任务必须优先继续，避免 cron 因缓存进入新窗口而重置分页进度。
    const shouldRestart = !isRefreshing && (
      !cached ||
      shouldStartRefreshCycle(cached.generatedAt) ||
      refreshTask?.status === "failed"
    )

    console.info(`[emby-cron] ${playlist.slug} 状态`, {
      hasCache: !!cached,
      cacheAge: cached ? `${Math.round((Date.now() - parseDateTime(cached.generatedAt)) / 1000 / 60)}分钟` : "无",
      currentStatus: refreshTask?.status ?? "无",
      shouldRestart,
      shouldContinue: shouldRestart || isRefreshing,
    })

    if (!shouldRestart && !isRefreshing) {
      continue
    }

    candidates.push({
      playlist,
      cachedGeneratedAt: cached?.generatedAt ?? null,
      refreshStatus: refreshTask?.status ?? null,
      shouldRestart,
    })
  }

  if (candidates.length === 0) {
    console.info("[emby-cron] 无需要刷新的片单")
    return
  }

  const nextCandidate = candidates.sort(compareRefreshCandidates)[0]
  console.info("[emby-cron] 选择片单进行刷新", {
    slug: nextCandidate.playlist.slug,
    shouldRestart: nextCandidate.shouldRestart,
    refreshStatus: nextCandidate.refreshStatus,
    candidatesCount: candidates.length,
  })

  const cached = nextCandidate.cachedGeneratedAt
  await advancePlaylistRefresh(config, nextCandidate.playlist, {
    pageBudget: CRON_REFRESH_PAGE_BUDGET,
    restart: nextCandidate.shouldRestart,
    persistPartialCache: !cached,
  })

  console.info("[emby-cron] 定时任务执行完成")
}

async function syncPlaylistToEmos(
  config: EmbyConfig,
  playlist: EmbyManagedPlaylist,
  feed: EmbyDynamicWatchFeed
): Promise<EmbySyncResult> {
  const dynamicUrl = resolvePublicFeedUrl(config, playlist.slug)
  const syncState = buildEmosSyncState(config, playlist)
  const watchId = playlist.remoteWatchId
  const lastSyncSignature = parseStoredEmosSyncState(
    await repository.getPlaylistSyncSignature(playlist.slug)
  )

  const shouldSyncMetadata =
    !watchId || lastSyncSignature?.metadataSignature !== syncState.metadataSignature
  const shouldSyncDynamic =
    !watchId || lastSyncSignature?.dynamicSignature !== syncState.dynamicSignature

  if (watchId && !shouldSyncMetadata && !shouldSyncDynamic) {
    return {
      slug: playlist.slug,
      name: playlist.name,
      watchId,
      dynamicUrl,
      updatedAt: feed.updatedAt,
      count: feed.videos.length,
    }
  }

  let resolvedWatchId = watchId

  if (shouldSyncMetadata) {
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
    resolvedWatchId = watchResponse.watch_id
  }

  if (!resolvedWatchId) {
    throw new Error("Emos watch id is missing after metadata sync")
  }

  if (shouldSyncDynamic) {
    // 动态地址未变化时跳过 /dynamic，避免 Emos 返回 updated_at same。
    await emosRequest(config, `/api/watch/${resolvedWatchId}/dynamic`, {
      method: "PUT",
      body: JSON.stringify({
        url: dynamicUrl,
      }),
    })
  }

  await repository.savePlaylistSyncSignature(playlist.slug, JSON.stringify(syncState))

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

emby.get("/playlists/:slug/cache", async (c) => {
  try {
    const slug = c.req.param("slug") as EmbyPlaylistSlug
    const config = await repository.getConfig()
    const playlist = config?.playlists.find((item) => item.slug === slug)
    const page = Math.max(1, Number(c.req.query("page") ?? "1") || 1)
    const pageSize = Math.max(1, Math.min(50, Number(c.req.query("pageSize") ?? "20") || 20))

    if (!config || !playlist) {
      return c.json(apiError("EMBY_DYNAMIC_WATCH_NOT_FOUND", "片单不存在"), 404)
    }

    const [cache, refreshTask] = await Promise.all([
      repository.getWatchCache(slug),
      repository.getWatchRefreshTask(slug),
    ])
    const refreshItems = refreshTask
      ? await repository.listWatchRefreshItems(slug, refreshTask.runId)
      : []
    if (!cache) {
      return c.json(apiSuccess({
        preview: null,
        totalCount: 0,
        page,
        pageSize,
      }))
    }

    const previewPage = await buildPreviewFromCache(
      cache.feed,
      refreshItems,
      config.tmdbApiKey.trim(),
      page,
      pageSize
    )

    return c.json(apiSuccess(previewPage))
  } catch (error) {
    console.error("[emby-api] GET /playlists/:slug/cache failed", error)
    return c.json(apiError("INTERNAL_ERROR", getErrorMessage(error, "获取当前缓存片单失败")), 500)
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
    const refreshItems = refreshTask
      ? await repository.listWatchRefreshItems(slug, refreshTask.runId)
      : []

    return c.json(apiSuccess({
      status: toRefreshStatus(playlist, refreshTask, cache, refreshItems),
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

import type { EmbyConfig, EmbyDynamicWatchFeed, EmbyPlaylistSlug } from "../types"

export interface EmbyWatchCache {
  feed: EmbyDynamicWatchFeed
  generatedAt: string
  count: number
}

export interface EmbyWatchRefreshTask {
  slug: EmbyPlaylistSlug
  runId: string
  status: string
  stateJson: string
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

export interface EmbyWatchRefreshItem {
  slug: EmbyPlaylistSlug
  runId: string
  sourceKey: string
  tmdbId: number
  tmdbType: "movie" | "tv"
  title: string
  posterUrl: string | null
  fetchedPage: number
  createdAt: string
  updatedAt: string
}

export interface IEmbyRepository {
  getConfig(): Promise<EmbyConfig | null>
  saveConfig(config: EmbyConfig): Promise<EmbyConfig>
  getWatchCache(slug: EmbyPlaylistSlug): Promise<EmbyWatchCache | null>
  saveWatchCache(slug: EmbyPlaylistSlug, feed: EmbyDynamicWatchFeed): Promise<void>
  getWatchRefreshTask(slug: EmbyPlaylistSlug): Promise<EmbyWatchRefreshTask | null>
  saveWatchRefreshTask(task: EmbyWatchRefreshTask): Promise<void>
  listWatchRefreshItems(slug: EmbyPlaylistSlug, runId: string): Promise<EmbyWatchRefreshItem[]>
  saveWatchRefreshItems(items: EmbyWatchRefreshItem[]): Promise<void>
  deleteWatchRefreshItems(slug: EmbyPlaylistSlug, runId?: string): Promise<void>
}

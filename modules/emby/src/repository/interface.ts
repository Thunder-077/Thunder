import type { EmbyConfig, EmbyDynamicWatchFeed, EmbyPlaylistSlug } from "../types"

export interface EmbyWatchCache {
  feed: EmbyDynamicWatchFeed
  generatedAt: string
  count: number
}

export interface EmbyWatchRefreshTask {
  slug: EmbyPlaylistSlug
  status: string
  stateJson: string
  errorMessage: string | null
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
}

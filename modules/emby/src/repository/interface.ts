import type { EmbyConfig, EmbyDynamicWatchFeed, EmbyPlaylistSlug } from "../types"

export interface EmbyWatchCache {
  feed: EmbyDynamicWatchFeed
  generatedAt: string
  count: number
}

export interface IEmbyRepository {
  getConfig(): Promise<EmbyConfig | null>
  saveConfig(config: EmbyConfig): Promise<EmbyConfig>
  getWatchCache(slug: EmbyPlaylistSlug): Promise<EmbyWatchCache | null>
  saveWatchCache(slug: EmbyPlaylistSlug, feed: EmbyDynamicWatchFeed): Promise<void>
}

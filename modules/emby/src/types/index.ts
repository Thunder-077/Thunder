export type EmbyTmdbType = "movie" | "tv"

export type EmbyPlaylistSlug =
  | "domestic-tv"
  | "domestic-movie"
  | "foreign-tv"
  | "foreign-movie"
  | "anime"

export interface EmbyDynamicWatchVideo {
  tmdbId: number
  tmdbType: EmbyTmdbType
  title: string
  sort: number
}

export interface EmbyDynamicWatchFeed {
  name: string
  cover: string
  updatedAt: string
  videos: EmbyDynamicWatchVideo[]
}

export interface EmbyPreviewVideo extends EmbyDynamicWatchVideo {
  posterUrl: string | null
}

export interface EmbyPlaylistPreview {
  feed: EmbyDynamicWatchFeed
  videos: EmbyPreviewVideo[]
}

export interface EmbyPlaylistRefreshStatus {
  slug: EmbyPlaylistSlug
  status: "idle" | "refreshing" | "completed" | "failed"
  processedPages: number
  totalPages: number
  collectedCount: number
  targetCount: number
  completedSources: number
  totalSources: number
  cacheGeneratedAt: string | null
  updatedAt: string | null
  errorMessage: string | null
}

export interface EmbyManagedPlaylist {
  slug: EmbyPlaylistSlug
  name: string
  description: string
  cover: string
  tags: string[]
  point: number
  isPublic: boolean
  isShowEmpty: boolean
  enabled: boolean
  limit: number
  releaseWindowDays: number
  remoteWatchId: number | null
}

export interface EmbyConfig {
  publicBaseUrl: string
  emosBaseUrl: string
  emosToken: string
  tmdbApiKey: string
  playlists: EmbyManagedPlaylist[]
}

export interface EmbySyncResult {
  slug: EmbyPlaylistSlug
  name: string
  watchId: number
  dynamicUrl: string
  updatedAt: string
  count: number
}

export type {
  EmbyTmdbType,
  EmbyPlaylistSlug,
  EmbyDynamicWatchVideo,
  EmbyDynamicWatchFeed,
  EmbyPreviewVideo,
  EmbyPlaylistPreview,
  EmbyPlaylistPreviewPage,
  EmbyPlaylistRefreshStatus,
  EmbyManagedPlaylist,
  EmbyConfig,
  EmbySyncResult,
} from "./types"

export type { EmbyWatchCache, EmbyWatchRefreshTask, IEmbyRepository } from "./repository/interface"

export { generatePoster } from "./poster-generator"
export { generatePosterWithDefaultFonts, loadDefaultPosterFonts } from "./poster-generator.node"
export type {
  GeneratePosterInput,
  GeneratePosterVariant,
  ImageInput,
  PosterFontInput,
  PosterTextShadowInput,
} from "./poster-generator"

import type {
  EmbyConfig,
  EmbyPlaylistPreview,
  EmbyPlaylistPreviewPage,
  EmbyPlaylistRefreshStatus,
  EmbyPlaylistSlug,
  EmbySyncResult,
} from "@thunder/emby"
import { ThunderClient } from "../client"

export class EmbyClient extends ThunderClient {
  async getConfig(): Promise<EmbyConfig | null> {
    const res = await this.get<{ ok: boolean; data: { config: EmbyConfig | null } }>("/emby/config")
    return res.data.config
  }

  async saveConfig(config: EmbyConfig): Promise<EmbyConfig> {
    const res = await this.put<{ ok: boolean; data: { config: EmbyConfig } }>("/emby/config", { config })
    return res.data.config
  }

  async previewPlaylist(slug: EmbyPlaylistSlug): Promise<EmbyPlaylistPreview> {
    const res = await this.get<{ ok: boolean; data: { preview: EmbyPlaylistPreview } }>(
      `/emby/playlists/${encodeURIComponent(slug)}/preview`
    )
    return res.data.preview
  }

  async getCachedPlaylist(
    slug: EmbyPlaylistSlug,
    page = 1,
    pageSize = 20
  ): Promise<EmbyPlaylistPreviewPage> {
    const query = `?page=${encodeURIComponent(String(page))}&pageSize=${encodeURIComponent(String(pageSize))}`
    const res = await this.get<{ ok: boolean; data: EmbyPlaylistPreviewPage }>(
      `/emby/playlists/${encodeURIComponent(slug)}/cache${query}`
    )
    return res.data
  }

  async getPlaylistRefreshStatus(slug: EmbyPlaylistSlug): Promise<EmbyPlaylistRefreshStatus> {
    const res = await this.get<{ ok: boolean; data: { status: EmbyPlaylistRefreshStatus } }>(
      `/emby/playlists/${encodeURIComponent(slug)}/refresh-status`
    )
    return res.data.status
  }

  async syncPlaylists(slug?: EmbyPlaylistSlug): Promise<{ results: EmbySyncResult[]; config: EmbyConfig }> {
    const query = slug ? `?slug=${encodeURIComponent(slug)}` : ""
    const res = await this.post<{ ok: boolean; data: { results: EmbySyncResult[]; config: EmbyConfig } }>(
      `/emby/sync${query}`
    )
    return res.data
  }
}

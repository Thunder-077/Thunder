import type {
  EmbyConfig,
  EmbyDynamicWatchFeed,
  EmbyWatchCache,
  EmbyWatchRefreshItem,
  EmbyWatchRefreshTask,
  IEmbyRepository,
} from "@thunder/emby"
import { prisma } from "@thunder/database"
import { Prisma } from "@prisma/client"
import type { EmbyManagedPlaylist, EmbyPlaylistSlug } from "@thunder/emby"

function defaultPlaylists(): EmbyConfig["playlists"] {
  return [
    {
      slug: "domestic-tv",
      name: "国产电视剧",
      description: "近期热度较高的国产电视剧",
      cover: "",
      tags: ["国产", "电视剧", "热门"],
      point: 0,
      isPublic: true,
      isShowEmpty: true,
      enabled: true,
      limit: 30,
      releaseWindowDays: 120,
      remoteWatchId: null,
    },
    {
      slug: "domestic-movie",
      name: "国产电影",
      description: "近期热度较高的国产电影",
      cover: "",
      tags: ["国产", "电影", "热门"],
      point: 0,
      isPublic: true,
      isShowEmpty: true,
      enabled: true,
      limit: 30,
      releaseWindowDays: 180,
      remoteWatchId: null,
    },
    {
      slug: "foreign-tv",
      name: "国外电视剧",
      description: "近期热度较高的国外电视剧",
      cover: "",
      tags: ["海外", "电视剧", "热门"],
      point: 0,
      isPublic: true,
      isShowEmpty: true,
      enabled: true,
      limit: 30,
      releaseWindowDays: 120,
      remoteWatchId: null,
    },
    {
      slug: "foreign-movie",
      name: "国外电影",
      description: "近期热度较高的国外电影",
      cover: "",
      tags: ["海外", "电影", "热门"],
      point: 0,
      isPublic: true,
      isShowEmpty: true,
      enabled: true,
      limit: 30,
      releaseWindowDays: 180,
      remoteWatchId: null,
    },
    {
      slug: "anime",
      name: "动漫",
      description: "近期热度较高的动漫作品",
      cover: "",
      tags: ["动漫", "新番", "热门"],
      point: 0,
      isPublic: true,
      isShowEmpty: true,
      enabled: true,
      limit: 30,
      releaseWindowDays: 180,
      remoteWatchId: null,
    },
  ]
}

function getConfigFromEnv(): EmbyConfig {
  return {
    publicBaseUrl: process.env.EMBY_PUBLIC_BASE_URL?.trim() || "",
    emosBaseUrl: process.env.EMBY_EMOS_BASE_URL?.trim() || "",
    emosToken: process.env.EMBY_EMOS_TOKEN?.trim() || "",
    tmdbApiKey: process.env.EMBY_TMDB_API_TOKEN?.trim() || "",
    playlists: defaultPlaylists(),
  }
}

function now(): string {
  return new Date().toISOString()
}

const REFRESH_ITEM_BATCH_SIZE = 100

function playlistSortValue(slug: EmbyPlaylistSlug): number {
  const order: EmbyPlaylistSlug[] = [
    "domestic-tv",
    "domestic-movie",
    "foreign-tv",
    "foreign-movie",
    "anime",
  ]

  const index = order.indexOf(slug)
  return index >= 0 ? index : order.length
}

function toPlaylistRecord(playlist: EmbyManagedPlaylist) {
  return {
    slug: playlist.slug,
    name: playlist.name,
    description: playlist.description,
    cover: playlist.cover,
    tagsJson: JSON.stringify(playlist.tags),
    point: playlist.point,
    isPublic: playlist.isPublic,
    isShowEmpty: playlist.isShowEmpty,
    enabled: playlist.enabled,
    limit: playlist.limit,
    releaseWindowDays: playlist.releaseWindowDays,
    remoteWatchId: playlist.remoteWatchId,
  }
}

function fromPlaylistRecord(record: {
  slug: string
  name: string
  description: string
  cover: string
  tagsJson: string
  point: number
  isPublic: boolean
  isShowEmpty: boolean
  enabled: boolean
  limit: number
  releaseWindowDays: number
  remoteWatchId: number | null
}): EmbyManagedPlaylist {
  let tags: string[] = []

  try {
    const parsed = JSON.parse(record.tagsJson) as unknown
    tags = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []
  } catch {
    tags = []
  }

  return {
    slug: record.slug as EmbyPlaylistSlug,
    name: record.name,
    description: record.description,
    cover: record.cover,
    tags,
    point: record.point,
    isPublic: record.isPublic,
    isShowEmpty: record.isShowEmpty,
    enabled: record.enabled,
    limit: record.limit,
    releaseWindowDays: record.releaseWindowDays,
    remoteWatchId: record.remoteWatchId,
  }
}

export class EmbyRepositorySQLite implements IEmbyRepository {
  async getConfig(): Promise<EmbyConfig | null> {
    const envConfig = getConfigFromEnv()
    const records = await prisma.embyPlaylistRecord.findMany()
    const storedPlaylists = records
      .map(fromPlaylistRecord)
      .sort((left, right) => playlistSortValue(left.slug) - playlistSortValue(right.slug))

    return {
      ...envConfig,
      playlists: storedPlaylists.length > 0 ? storedPlaylists : envConfig.playlists,
    }
  }

  async saveConfig(config: EmbyConfig): Promise<EmbyConfig> {
    const updatedAt = now()

    for (const playlist of config.playlists) {
      const data = toPlaylistRecord(playlist)
      await prisma.embyPlaylistRecord.upsert({
        where: { slug: playlist.slug },
        create: {
          ...data,
          createdAt: updatedAt,
          updatedAt,
        },
        update: {
          ...data,
          updatedAt,
        },
      })
    }

    return (await this.getConfig()) ?? getConfigFromEnv()
  }

  async getWatchCache(slug: EmbyPlaylistSlug): Promise<EmbyWatchCache | null> {
    const record = await prisma.embyWatchCacheRecord.findUnique({ where: { slug } })
    if (!record) {
      return null
    }

    try {
      return {
        feed: JSON.parse(record.feedJson) as EmbyDynamicWatchFeed,
        generatedAt: record.generatedAt,
        count: record.count,
      }
    } catch {
      return null
    }
  }

  async saveWatchCache(slug: EmbyPlaylistSlug, feed: EmbyDynamicWatchFeed): Promise<void> {
    const updatedAt = now()

    await prisma.embyWatchCacheRecord.upsert({
      where: { slug },
      create: {
        slug,
        feedJson: JSON.stringify(feed),
        count: feed.videos.length,
        generatedAt: feed.updatedAt,
        createdAt: updatedAt,
        updatedAt,
      },
      update: {
        feedJson: JSON.stringify(feed),
        count: feed.videos.length,
        generatedAt: feed.updatedAt,
        updatedAt,
      },
    })
  }

  async getWatchRefreshTask(slug: EmbyPlaylistSlug): Promise<EmbyWatchRefreshTask | null> {
    const rows = await prisma.$queryRaw<Array<{
      slug: string
      run_id: string
      status: string
      state_json: string
      error_message: string | null
      created_at: string
      updated_at: string
    }>>`
      SELECT slug, run_id, status, state_json, error_message, created_at, updated_at
      FROM emby_watch_refresh_task
      WHERE slug = ${slug}
      LIMIT 1
    `
    const record = rows[0]
    if (!record) {
      return null
    }

    return {
      slug: record.slug as EmbyPlaylistSlug,
      runId: record.run_id,
      status: record.status,
      stateJson: record.state_json,
      errorMessage: record.error_message,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    }
  }

  async saveWatchRefreshTask(task: EmbyWatchRefreshTask): Promise<void> {
    const updatedAt = now()
    await prisma.$executeRaw`
      INSERT INTO emby_watch_refresh_task (
        slug,
        run_id,
        status,
        state_json,
        error_message,
        created_at,
        updated_at
      )
      VALUES (
        ${task.slug},
        ${task.runId},
        ${task.status},
        ${task.stateJson},
        ${task.errorMessage},
        ${task.createdAt},
        ${updatedAt}
      )
      ON CONFLICT (slug)
      DO UPDATE SET
        run_id = EXCLUDED.run_id,
        status = EXCLUDED.status,
        state_json = EXCLUDED.state_json,
        error_message = EXCLUDED.error_message,
        updated_at = EXCLUDED.updated_at
    `
  }

  async listWatchRefreshItems(slug: EmbyPlaylistSlug, runId: string): Promise<EmbyWatchRefreshItem[]> {
    const records = await prisma.$queryRaw<Array<{
      slug: string
      run_id: string
      source_key: string
      tmdb_id: number
      tmdb_type: string
      title: string
      poster_url: string | null
      fetched_page: number
      created_at: string
      updated_at: string
    }>>`
      SELECT slug, run_id, source_key, tmdb_id, tmdb_type, title, poster_url, fetched_page, created_at, updated_at
      FROM emby_watch_refresh_item
      WHERE slug = ${slug} AND run_id = ${runId}
      ORDER BY source_key ASC, fetched_page ASC, tmdb_id ASC
    `

    return records.map((record): EmbyWatchRefreshItem => ({
      slug: record.slug as EmbyPlaylistSlug,
      runId: record.run_id,
      sourceKey: record.source_key,
      tmdbId: record.tmdb_id,
      tmdbType: record.tmdb_type as "movie" | "tv",
      title: record.title,
      posterUrl: record.poster_url,
      fetchedPage: record.fetched_page,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    }))
  }

  async saveWatchRefreshItems(items: EmbyWatchRefreshItem[]): Promise<void> {
    if (items.length === 0) {
      return
    }

    for (let index = 0; index < items.length; index += REFRESH_ITEM_BATCH_SIZE) {
      const batch = items.slice(index, index + REFRESH_ITEM_BATCH_SIZE)
      const values = Prisma.join(
        batch.map((item) => Prisma.sql`
          (
            ${item.slug},
            ${item.runId},
            ${item.sourceKey},
            ${item.tmdbId},
            ${item.tmdbType},
            ${item.title},
            ${item.posterUrl},
            ${item.fetchedPage},
            ${item.createdAt},
            ${item.updatedAt}
          )
        `)
      )

      await prisma.$executeRaw`
        INSERT INTO emby_watch_refresh_item (
          slug,
          run_id,
          source_key,
          tmdb_id,
          tmdb_type,
          title,
          poster_url,
          fetched_page,
          created_at,
          updated_at
        )
        VALUES ${values}
        ON CONFLICT (slug, run_id, source_key, tmdb_type, tmdb_id)
        DO UPDATE SET
          title = EXCLUDED.title,
          poster_url = EXCLUDED.poster_url,
          fetched_page = EXCLUDED.fetched_page,
          updated_at = EXCLUDED.updated_at
      `
    }
  }

  async deleteWatchRefreshItems(slug: EmbyPlaylistSlug, runId?: string): Promise<void> {
    if (runId) {
      await prisma.$executeRaw`
        DELETE FROM emby_watch_refresh_item
        WHERE slug = ${slug} AND run_id = ${runId}
      `
      return
    }

    await prisma.$executeRaw`
      DELETE FROM emby_watch_refresh_item
      WHERE slug = ${slug}
    `
  }

  async getPlaylistSyncSignature(slug: EmbyPlaylistSlug): Promise<string | null> {
    const rows = await prisma.$queryRaw<Array<{ last_emos_sync_signature: string | null }>>`
      SELECT last_emos_sync_signature
      FROM emby_playlist
      WHERE slug = ${slug}
      LIMIT 1
    `

    return rows[0]?.last_emos_sync_signature ?? null
  }

  async savePlaylistSyncSignature(slug: EmbyPlaylistSlug, signature: string): Promise<void> {
    await prisma.$executeRaw`
      UPDATE emby_playlist
      SET last_emos_sync_signature = ${signature}
      WHERE slug = ${slug}
    `
  }
}

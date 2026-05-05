import type { EmbyConfig, IEmbyRepository } from "@thunder/emby"
import { prisma } from "@thunder/database"
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
}

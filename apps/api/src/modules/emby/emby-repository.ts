import { prisma } from "@thunder/database"
import type { EmbyConfig, IEmbyRepository } from "@thunder/emby"

const EMBY_CONFIG_KEY = "thunder:module:emby:config"
const EMBY_CONFIG_ID = "default"

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

function defaultConfig(): EmbyConfig {
  return {
    publicBaseUrl: "http://localhost:3000",
    emosBaseUrl: "https://test.emos.best",
    emosToken: "11_test-token",
    tmdbApiKey: "",
    playlists: defaultPlaylists(),
  }
}

function normalizeConfig(config: EmbyConfig): EmbyConfig {
  const playlistMap = new Map(config.playlists.map((playlist) => [playlist.slug, playlist]))

  return {
    ...defaultConfig(),
    ...config,
    playlists: defaultPlaylists().map((playlist) => ({
      ...playlist,
      ...(playlistMap.get(playlist.slug) ?? {}),
    })),
  }
}

function parseLegacyConfig(valueJson: string): EmbyConfig | null {
  try {
    return normalizeConfig(JSON.parse(valueJson) as EmbyConfig)
  } catch {
    return null
  }
}

function fromRecords(
  configRecord: {
    publicBaseUrl: string
    emosBaseUrl: string
    emosToken: string
    tmdbApiKey: string
    playlists: Array<{
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
    }>
  }
): EmbyConfig {
  return normalizeConfig({
    publicBaseUrl: configRecord.publicBaseUrl,
    emosBaseUrl: configRecord.emosBaseUrl,
    emosToken: configRecord.emosToken,
    tmdbApiKey: configRecord.tmdbApiKey,
    playlists: configRecord.playlists.map((playlist) => ({
      slug: playlist.slug as EmbyConfig["playlists"][number]["slug"],
      name: playlist.name,
      description: playlist.description,
      cover: playlist.cover,
      tags: JSON.parse(playlist.tagsJson) as string[],
      point: playlist.point,
      isPublic: playlist.isPublic,
      isShowEmpty: playlist.isShowEmpty,
      enabled: playlist.enabled,
      limit: playlist.limit,
      releaseWindowDays: playlist.releaseWindowDays,
      remoteWatchId: playlist.remoteWatchId,
    })),
  })
}

async function writeConfig(config: EmbyConfig): Promise<EmbyConfig> {
  const normalized = normalizeConfig(config)
  const now = new Date().toISOString()

  await prisma.$transaction(async (tx) => {
    const existing = await tx.embyConfigRecord.findUnique({
      where: { id: EMBY_CONFIG_ID },
    })

    await tx.embyConfigRecord.upsert({
      where: { id: EMBY_CONFIG_ID },
      update: {
        publicBaseUrl: normalized.publicBaseUrl,
        emosBaseUrl: normalized.emosBaseUrl,
        emosToken: normalized.emosToken,
        tmdbApiKey: normalized.tmdbApiKey,
        updatedAt: now,
      },
      create: {
        id: EMBY_CONFIG_ID,
        publicBaseUrl: normalized.publicBaseUrl,
        emosBaseUrl: normalized.emosBaseUrl,
        emosToken: normalized.emosToken,
        tmdbApiKey: normalized.tmdbApiKey,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      },
    })

    await tx.embyPlaylistRecord.deleteMany({
      where: { configId: EMBY_CONFIG_ID },
    })

    await tx.embyPlaylistRecord.createMany({
      data: normalized.playlists.map((playlist) => ({
        slug: playlist.slug,
        configId: EMBY_CONFIG_ID,
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
        createdAt: now,
        updatedAt: now,
      })),
    })
  })

  return normalized
}

export class EmbyRepositorySQLite implements IEmbyRepository {
  async getConfig(): Promise<EmbyConfig | null> {
    const configRecord = await prisma.embyConfigRecord.findUnique({
      where: { id: EMBY_CONFIG_ID },
      include: {
        playlists: {
          orderBy: { slug: "asc" },
        },
      },
    })

    if (configRecord) {
      return fromRecords(configRecord)
    }

    const legacyRow = await prisma.appSetting.findUnique({
      where: { key: EMBY_CONFIG_KEY },
    })

    if (!legacyRow) {
      return defaultConfig()
    }

    const legacyConfig = parseLegacyConfig(legacyRow.valueJson)
    if (!legacyConfig) {
      return defaultConfig()
    }

    return writeConfig(legacyConfig)
  }

  async saveConfig(config: EmbyConfig): Promise<EmbyConfig> {
    return writeConfig(config)
  }
}

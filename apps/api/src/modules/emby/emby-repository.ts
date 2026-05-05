import type { EmbyConfig, IEmbyRepository } from "@thunder/emby"

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

export class EmbyRepositorySQLite implements IEmbyRepository {
  async getConfig(): Promise<EmbyConfig | null> {
    return getConfigFromEnv()
  }

  async saveConfig(config: EmbyConfig): Promise<EmbyConfig> {
    return getConfigFromEnv()
  }
}
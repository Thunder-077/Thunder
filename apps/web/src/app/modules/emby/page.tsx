"use client"

import { useEffect, useState } from "react"
import { ChevronDown, ChevronUp, Clapperboard, LoaderCircle, RefreshCcw, Send } from "lucide-react"
import { EmbyClient, ThunderApiError } from "@thunder/api-client"
import type { EmbyConfig, EmbyManagedPlaylist, EmbyPlaylistPreview, EmbyPlaylistSlug } from "@thunder/emby"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select } from "@/components/ui/select"

const embyClient = new EmbyClient()

function toDisplayError(error: unknown, fallback: string): string {
  if (error instanceof ThunderApiError && error.message.trim()) {
    return error.message
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  return fallback
}

function createEmptyConfig(): EmbyConfig {
  return {
    publicBaseUrl: "",
    emosBaseUrl: "",
    emosToken: "",
    tmdbApiKey: "",
    playlists: [],
  }
}

export default function EmbyModulePage() {
  const [config, setConfig] = useState<EmbyConfig>(createEmptyConfig())
  const [previewMap, setPreviewMap] = useState<Record<string, EmbyPlaylistPreview | null>>({})
  const [loading, setLoading] = useState(true)
  const [syncingSlug, setSyncingSlug] = useState<string | null>(null)
  const [refreshingSlug, setRefreshingSlug] = useState<string | null>(null)
  const [collapsedPreviewMap, setCollapsedPreviewMap] = useState<Record<string, boolean>>({})
  const [selectedSlug, setSelectedSlug] = useState<EmbyPlaylistSlug>("domestic-tv")
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        setLoading(true)
        setError(null)
        const data = await embyClient.getConfig()
        if (cancelled) return
        setConfig(data ?? createEmptyConfig())
      } catch (loadError) {
        if (cancelled) return
        console.error("[emby-module] load failed", loadError)
        setError(toDisplayError(loadError, "加载 Emby 配置失败"))
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  const previewPlaylist = async (slug: EmbyPlaylistSlug) => {
    try {
      setRefreshingSlug(slug)
      setError(null)
      const feed = await embyClient.previewPlaylist(slug)
      setPreviewMap((current) => ({
        ...current,
        [slug]: feed,
      }))
    } catch (previewError) {
      console.error("[emby-module] preview playlist failed", previewError)
      setError(toDisplayError(previewError, "生成热门片单预览失败，请检查 TMDB Key"))
    } finally {
      setRefreshingSlug(null)
    }
  }

  const syncPlaylist = async (slug?: EmbyPlaylistSlug) => {
    try {
      setSyncingSlug(slug ?? "all")
      setError(null)
      setMessage(null)
      const result = await embyClient.syncPlaylists(slug)
      setConfig(result.config)
      setMessage(
        slug
          ? `片单已同步到 Emos：${result.results[0]?.name ?? slug}`
          : `已同步 ${result.results.length} 个片单到 Emos`
      )
    } catch (syncError) {
      console.error("[emby-module] sync playlist failed", syncError)
      setError(toDisplayError(syncError, "同步 Emos 片单失败，请检查 Emos 地址、Token 和 TMDB Key"))
    } finally {
      setSyncingSlug(null)
    }
  }

  const togglePreviewCollapse = (slug: EmbyPlaylistSlug) => {
    setCollapsedPreviewMap((current) => ({
      ...current,
      [slug]: !current[slug],
    }))
  }

  const selectedPlaylist = config.playlists.find((playlist) => playlist.slug === selectedSlug) ?? null
  const selectedPreview = selectedPlaylist ? (previewMap[selectedPlaylist.slug] ?? null) : null
  const isSelectedPreviewCollapsed = selectedPlaylist
    ? (collapsedPreviewMap[selectedPlaylist.slug] ?? false)
    : false
  const playlistOptions = config.playlists.map((playlist) => ({
    value: playlist.slug,
    label: playlist.name,
    description: playlist.description,
  }))

  return (
    <div>
      <PageHeader
        title="Emby 片单"
        description="基于全网热门规则生成 5 个预设片单，并通过 Emos 官方接口自动新增或更新远端片单。"
        actions={(
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => syncPlaylist()}
            disabled={loading || syncingSlug !== null}
          >
            {syncingSlug === "all" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            同步全部
          </Button>
        )}
      />

      <div className="space-y-4">
        {error && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {message && (
          <div className="rounded-xl border border-border/70 bg-background px-3 py-2 text-sm text-muted-foreground">
            {message}
          </div>
        )}

        {loading ? (
          <Card>
            <CardContent className="px-4 py-10 text-sm text-muted-foreground">
              正在加载 Emby 配置...
            </CardContent>
          </Card>
        ) : config.playlists.length === 0 ? (
          <EmptyState
            icon={<Clapperboard className="h-6 w-6" />}
            title="还没有片单配置"
            description="请检查环境变量配置。"
          />
        ) : (
          <div className="space-y-4">
            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="max-w-[320px] space-y-2">
                  <div className="text-sm font-medium text-foreground">当前片单</div>
                  <Select
                    value={selectedSlug}
                    options={playlistOptions}
                    onChange={(value) => setSelectedSlug(value as EmbyPlaylistSlug)}
                    placeholder="选择片单"
                  />
                </div>
                {selectedPlaylist && (
                  <div className="text-sm text-muted-foreground">
                    {selectedPlaylist.description}
                  </div>
                )}
              </CardContent>
            </Card>

            {selectedPlaylist && (
              <Card>
                <CardContent className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-medium text-foreground">{selectedPlaylist.name}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{selectedPlaylist.description}</div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => syncPlaylist(selectedPlaylist.slug)}
                      disabled={syncingSlug !== null}
                    >
                      {syncingSlug === selectedPlaylist.slug ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      同步
                    </Button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-foreground">封面地址</div>
                      <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                        {selectedPlaylist.cover || "-"}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-foreground">远端片单 ID</div>
                      <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                        {selectedPlaylist.remoteWatchId ?? "-"}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-foreground">抓取数量</div>
                      <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                        {selectedPlaylist.limit}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-foreground">时间窗口（天）</div>
                      <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                        {selectedPlaylist.releaseWindowDays}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-xs leading-6 text-muted-foreground">
                    外部动态路径：{`/server/emby/watch/${selectedPlaylist.slug}`}
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-muted-foreground">
                      标签：{selectedPlaylist.tags.join(" / ")}
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedPreview && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-2"
                          onClick={() => togglePreviewCollapse(selectedPlaylist.slug)}
                        >
                          {isSelectedPreviewCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                          {isSelectedPreviewCollapsed ? "展开预览" : "收起预览"}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2"
                        onClick={() => previewPlaylist(selectedPlaylist.slug)}
                        disabled={refreshingSlug !== null}
                      >
                        {refreshingSlug === selectedPlaylist.slug ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                        预览热门内容
                      </Button>
                    </div>
                  </div>

                  {selectedPreview && !isSelectedPreviewCollapsed ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                        {selectedPreview.videos.map((video) => (
                          <div key={`${video.tmdbType}-${video.tmdbId}`} className="overflow-hidden rounded-2xl border border-border/70 bg-background">
                            <div className="aspect-[2/3] bg-muted/50">
                              {video.posterUrl ? (
                                <img
                                  src={video.posterUrl}
                                  alt={video.title}
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                                  暂无海报
                                </div>
                              )}
                            </div>
                            <div className="space-y-1 p-3">
                              <div className="line-clamp-2 text-sm font-medium text-foreground">{video.title}</div>
                              <div className="text-xs text-muted-foreground">
                                {video.tmdbType === "movie" ? "电影" : "剧集"} · 排序 {video.sort}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <pre className="max-h-[240px] overflow-auto rounded-2xl border border-border/70 bg-muted/30 p-3 text-xs leading-6 text-foreground">
                        {JSON.stringify({
                          name: selectedPreview.feed.name,
                          cover: selectedPreview.feed.cover,
                          updated_at: selectedPreview.feed.updatedAt,
                          videos: selectedPreview.feed.videos.map((video) => ({
                            tmdb_id: video.tmdbId,
                            tmdb_type: video.tmdbType,
                            title: video.title,
                            sort: video.sort,
                          })),
                        }, null, 2)}
                      </pre>
                    </div>
                  ) : selectedPreview && isSelectedPreviewCollapsed ? (
                    <div className="rounded-2xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
                      当前预览已收起。点击“展开预览”可再次查看海报和 JSON。
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border/70 px-4 py-10 text-sm text-muted-foreground">
                      点击“预览热门内容”生成当前分类的实时片单结果。
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
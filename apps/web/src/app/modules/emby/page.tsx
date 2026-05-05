"use client"

import { useEffect, useState } from "react"
import { ChevronDown, ChevronUp, Clapperboard, Copy, Info, LoaderCircle, Plus, RefreshCcw, Save, Send, X } from "lucide-react"
import { EmbyClient, ThunderApiError } from "@thunder/api-client"
import type { EmbyConfig, EmbyManagedPlaylist, EmbyPlaylistPreview, EmbyPlaylistSlug } from "@thunder/emby"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"

const embyClient = new EmbyClient()
const inputClassName = "placeholder:text-muted-foreground/55"

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
  const [saving, setSaving] = useState(false)
  const [refreshingSlug, setRefreshingSlug] = useState<string | null>(null)
  const [collapsedPreviewMap, setCollapsedPreviewMap] = useState<Record<string, boolean>>({})
  const [selectedSlug, setSelectedSlug] = useState<EmbyPlaylistSlug>("domestic-tv")
  const [tagInput, setTagInput] = useState("")
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

  useEffect(() => {
    setTagInput("")
  }, [selectedSlug])

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

  const updateSelectedPlaylist = (patch: Partial<EmbyManagedPlaylist>) => {
    setConfig((current) => ({
      ...current,
      playlists: current.playlists.map((playlist) => (
        playlist.slug === selectedSlug ? { ...playlist, ...patch } : playlist
      )),
    }))
  }

  const addTag = () => {
    const tag = tagInput.trim()
    if (!selectedPlaylist || !tag || selectedPlaylist.tags.includes(tag)) {
      setTagInput("")
      return
    }

    updateSelectedPlaylist({ tags: [...selectedPlaylist.tags, tag] })
    setTagInput("")
  }

  const removeTag = (tag: string) => {
    if (!selectedPlaylist) return
    updateSelectedPlaylist({ tags: selectedPlaylist.tags.filter((item) => item !== tag) })
  }

  const saveConfig = async () => {
    try {
      setSaving(true)
      setError(null)
      setMessage(null)
      const saved = await embyClient.saveConfig(config)
      setConfig(saved)
      setMessage("片单配置已保存")
    } catch (saveError) {
      console.error("[emby-module] save config failed", saveError)
      setError(toDisplayError(saveError, "保存 Emby 片单失败"))
    } finally {
      setSaving(false)
    }
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
              <CardContent className="p-6">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-center gap-5">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-brand">
                      <Clapperboard className="h-8 w-8" />
                    </div>
                    <div className="min-w-0 space-y-2">
                      <div className="text-lg font-semibold text-foreground">当前片单</div>
                      <div className="w-full max-w-[360px]">
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
                    </div>
                  </div>
                  {selectedPlaylist && (
                    <div className="inline-flex w-fit items-center gap-2 rounded-full border border-success/20 bg-success/10 px-4 py-2 text-sm font-medium text-success-foreground">
                      <span className="h-2 w-2 rounded-full bg-success" />
                      {selectedPlaylist.enabled ? "已启用" : "已停用"}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {selectedPlaylist && (
              <>
              <Card>
                <CardContent className="space-y-5 p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-foreground">{selectedPlaylist.name}</div>
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

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label htmlFor="emby-name" className="text-sm font-medium text-foreground">片单名称</label>
                      <Input
                        id="emby-name"
                        value={selectedPlaylist.name}
                        onChange={(event) => updateSelectedPlaylist({ name: event.target.value })}
                        className={inputClassName}
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="emby-remote-id" className="text-sm font-medium text-foreground">远端片单 ID</label>
                      <Input
                        id="emby-remote-id"
                        value={selectedPlaylist.remoteWatchId ?? ""}
                        onChange={(event) => {
                          const value = event.target.value.trim()
                          updateSelectedPlaylist({ remoteWatchId: value ? Number(value) : null })
                        }}
                        placeholder="不填则同步时新建"
                        className={inputClassName}
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="emby-description" className="text-sm font-medium text-foreground">片单描述</label>
                      <Input
                        id="emby-description"
                        value={selectedPlaylist.description}
                        onChange={(event) => updateSelectedPlaylist({ description: event.target.value })}
                        className={inputClassName}
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="emby-cover" className="text-sm font-medium text-foreground">封面地址</label>
                      <Input
                        id="emby-cover"
                        value={selectedPlaylist.cover}
                        onChange={(event) => updateSelectedPlaylist({ cover: event.target.value })}
                        placeholder="不填则使用站点图标"
                        className={inputClassName}
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="emby-limit" className="text-sm font-medium text-foreground">抓取数量</label>
                      <Input
                        id="emby-limit"
                        type="number"
                        min={1}
                        max={100}
                        value={selectedPlaylist.limit}
                        onChange={(event) => updateSelectedPlaylist({ limit: Number(event.target.value) })}
                        className={inputClassName}
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="emby-release-window" className="text-sm font-medium text-foreground">时间窗口（天）</label>
                      <Input
                        id="emby-release-window"
                        type="number"
                        min={1}
                        max={3650}
                        value={selectedPlaylist.releaseWindowDays}
                        onChange={(event) => updateSelectedPlaylist({ releaseWindowDays: Number(event.target.value) })}
                        className={inputClassName}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <div className="text-sm font-medium text-foreground">标签</div>
                      <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-background px-2 py-2">
                        {selectedPlaylist.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex h-7 items-center gap-1 rounded-full bg-muted px-2.5 text-xs font-medium text-muted-foreground"
                          >
                            {tag}
                            <button
                              type="button"
                              onClick={() => removeTag(tag)}
                              className="rounded-full text-muted-foreground/70 hover:text-foreground"
                              aria-label={`删除标签 ${tag}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                        <div className="flex min-w-[160px] flex-1 items-center gap-2">
                          <Input
                            value={tagInput}
                            onChange={(event) => setTagInput(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault()
                                addTag()
                              }
                            }}
                            placeholder="添加标签"
                            className="h-7 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/55"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            className="h-7 shrink-0 gap-1 rounded-full border-dashed"
                            onClick={addTag}
                          >
                            <Plus className="h-3 w-3" />
                            添加标签
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 pt-7">
                      <input
                        id="emby-enabled"
                        type="checkbox"
                        checked={selectedPlaylist.enabled}
                        onChange={(event) => updateSelectedPlaylist({ enabled: event.target.checked })}
                        className="h-4 w-4 rounded border-border accent-primary"
                      />
                      <label htmlFor="emby-enabled" className="text-sm font-medium text-foreground">启用片单</label>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[1fr_180px] lg:items-center">
                    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-xs leading-6 text-muted-foreground">
                      <Info className="h-4 w-4 shrink-0 text-brand" />
                      <span className="truncate">外部动态路径：{`/server/emby/watch/${selectedPlaylist.slug}`}</span>
                      <Copy className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                    <Button
                      className="h-10 gap-2"
                      onClick={saveConfig}
                      disabled={saving}
                    >
                      {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      保存片单
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-4 p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-foreground">预览热门内容</div>
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
                        更新预览
                      </Button>
                    </div>
                  </div>
                  {selectedPreview && !isSelectedPreviewCollapsed ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                        {selectedPreview.videos.map((video) => (
                          <div key={`${video.tmdbType}-${video.tmdbId}`} className="flex gap-3 overflow-hidden rounded-xl border border-border/70 bg-background p-2 shadow-xs">
                            <div className="aspect-[2/3] w-20 shrink-0 overflow-hidden rounded-lg bg-muted/50">
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
                            <div className="min-w-0 flex-1 space-y-2 py-1">
                              <div className="line-clamp-2 text-sm font-medium text-foreground">{video.title}</div>
                              <div className="text-xs text-destructive">
                                热度排序 {video.sort}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {video.tmdbType === "movie" ? "电影" : "剧集"}
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
                      点击“更新预览”生成当前分类的实时片单结果。
                    </div>
                  )}
                </CardContent>
              </Card>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clapperboard, Copy, Eye, Info, LoaderCircle, RefreshCcw, Save, Send, X } from "lucide-react"
import { EmbyClient, ThunderApiError } from "@thunder/api-client"
import type {
  EmbyConfig,
  EmbyManagedPlaylist,
  EmbyPlaylistPreview,
  EmbyPlaylistRefreshStatus,
  EmbyPlaylistSlug,
  EmbySyncResult,
} from "@thunder/emby"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Callout } from "@/components/ui/callout"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"

const embyClient = new EmbyClient()
const inputClassName = "placeholder:text-muted-foreground/55"
const PREVIEW_PAGE_SIZE = 20
const REFRESH_LEAD_HOURS = 10
const CRON_INTERVAL_MINUTES = 10
const DISPLAY_TIME_ZONE = "Asia/Shanghai"
type PlaylistPreviewSource = "updated" | "cache"

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

function mergeRemoteWatchIds(config: EmbyConfig, results: EmbySyncResult[]): EmbyConfig {
  if (results.length === 0) {
    return config
  }

  const watchIdMap = new Map(results.map((result) => [result.slug, result.watchId]))

  return {
    ...config,
    playlists: config.playlists.map((playlist) => {
      const watchId = watchIdMap.get(playlist.slug)
      return watchId === undefined
        ? playlist
        : {
          ...playlist,
          remoteWatchId: watchId,
        }
    }),
  }
}

function toRefreshStatusLabel(status: EmbyPlaylistRefreshStatus["status"]): string {
  if (status === "refreshing") return "缓存更新中"
  if (status === "completed") return "缓存已完成"
  if (status === "failed") return "缓存更新失败"
  return "缓存未开始"
}

function formatDisplayDateTime(value: string | null): string | null {
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })

  const parts = formatter.formatToParts(date)
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ""

  return `${getPart("year")}-${getPart("month")}-${getPart("day")} ${getPart("hour")}:${getPart("minute")}:${getPart("second")}`
}

function formatDisplayTime(value: string | null): string | null {
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: DISPLAY_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })

  const parts = formatter.formatToParts(date)
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ""

  return `${getPart("hour")}:${getPart("minute")}:${getPart("second")}`
}

function addMinutes(value: string, minutes: number): string | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  date.setMinutes(date.getMinutes() + minutes)
  return formatDisplayDateTime(date.toISOString())
}

function addHours(value: string, hours: number): string | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  date.setHours(date.getHours() + hours)
  return formatDisplayDateTime(date.toISOString())
}

function getNextRefreshStageDescription(status: EmbyPlaylistRefreshStatus): string {
  if (status.status === "refreshing" && status.updatedAt) {
    return `下阶段预计执行 ${formatDisplayTime(addMinutes(status.updatedAt, CRON_INTERVAL_MINUTES)) ?? "等待下一次定时推进"}`
  }

  if (status.status === "completed" && status.cacheGeneratedAt) {
    return `下阶段预计开始 ${formatDisplayTime(addHours(status.cacheGeneratedAt, REFRESH_LEAD_HOURS)) ?? "等待下一轮刷新窗口"}`
  }

  if (status.status === "failed") {
    return "下阶段执行方式：等待下一次定时推进或手动更新片单"
  }

  return "下阶段执行方式：点击“更新片单”或等待定时任务启动"
}

function getRefreshStatusVariant(status: EmbyPlaylistRefreshStatus["status"]): "info" | "success" | "warning" | "danger" | "neutral" {
  if (status === "refreshing") return "info"
  if (status === "completed") return "success"
  if (status === "failed") return "danger"
  return "neutral"
}

type PlaylistNumericField = "remoteWatchId" | "limit" | "releaseWindowDays" | "point"
type TagInsertPositionValue = `at:${number}`

interface PlaylistNumericDrafts {
  remoteWatchId: string
  limit: string
  releaseWindowDays: string
  point: string
}

function toPlaylistNumericDrafts(playlist: EmbyManagedPlaylist | null): PlaylistNumericDrafts {
  return {
    remoteWatchId: playlist?.remoteWatchId === null || playlist?.remoteWatchId === undefined ? "" : String(playlist.remoteWatchId),
    limit: playlist ? String(playlist.limit) : "",
    releaseWindowDays: playlist ? String(playlist.releaseWindowDays) : "",
    point: playlist ? String(playlist.point) : "",
  }
}

function normalizeTagName(tag: string): string {
  return tag.trim().toLowerCase()
}

function hasTag(tags: string[], tag: string): boolean {
  const normalizedTag = normalizeTagName(tag)
  return tags.some((item) => normalizeTagName(item) === normalizedTag)
}

function resolveTagInsertIndex(
  tags: string[],
  insertPosition: TagInsertPositionValue
): number {
  const rawIndex = Number(insertPosition.replace("at:", ""))
  if (!Number.isInteger(rawIndex) || rawIndex < 0 || rawIndex > tags.length) {
    return tags.length
  }

  return rawIndex
}

export default function EmbyModulePage() {
  const [config, setConfig] = useState<EmbyConfig>(createEmptyConfig())
  const [previewMap, setPreviewMap] = useState<Record<string, EmbyPlaylistPreview | null>>({})
  const [previewSourceMap, setPreviewSourceMap] = useState<Record<string, PlaylistPreviewSource | null>>({})
  const [previewPageMap, setPreviewPageMap] = useState<Record<string, number>>({})
  const [previewTotalCountMap, setPreviewTotalCountMap] = useState<Record<string, number>>({})
  const [refreshStatusMap, setRefreshStatusMap] = useState<Record<string, EmbyPlaylistRefreshStatus | null>>({})
  const [loading, setLoading] = useState(true)
  const [syncingSlug, setSyncingSlug] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [refreshingSlug, setRefreshingSlug] = useState<string | null>(null)
  const [collapsedPreviewMap, setCollapsedPreviewMap] = useState<Record<string, boolean>>({})
  const [selectedSlug, setSelectedSlug] = useState<EmbyPlaylistSlug>("domestic-tv")
  const [tagInput, setTagInput] = useState("")
  const [tagInsertPosition, setTagInsertPosition] = useState<TagInsertPositionValue>("at:0")
  const [numericDrafts, setNumericDrafts] = useState<PlaylistNumericDrafts>(toPlaylistNumericDrafts(null))
  const [error, setError] = useState<string | null>(null)
  const tagInputRef = useRef<HTMLInputElement | null>(null)
  const selectedPlaylist = config.playlists.find((playlist) => playlist.slug === selectedSlug) ?? null

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

  // Sync numeric draft fields when the selected playlist changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNumericDrafts(toPlaylistNumericDrafts(selectedPlaylist))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedPlaylist?.slug,
    selectedPlaylist?.remoteWatchId,
    selectedPlaylist?.limit,
    selectedPlaylist?.releaseWindowDays,
    selectedPlaylist?.point,
  ])

  useEffect(() => {
    if (!selectedPlaylist) {
      return
    }

    const playlistSlug = selectedPlaylist.slug
    let cancelled = false

    async function loadRefreshStatus() {
      try {
        const status = await embyClient.getPlaylistRefreshStatus(playlistSlug)
        if (cancelled) return
        setRefreshStatusMap((current) => ({
          ...current,
          [playlistSlug]: status,
        }))
      } catch (statusError) {
        if (cancelled) return
        console.error("[emby-module] load refresh status failed", statusError)
      }
    }

    void loadRefreshStatus()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlaylist?.slug])

  const previewPlaylist = async (slug: EmbyPlaylistSlug) => {
    try {
      setRefreshingSlug(slug)
      setError(null)
      const feed = await embyClient.previewPlaylist(slug)
      const status = await embyClient.getPlaylistRefreshStatus(slug)
      setPreviewMap((current) => ({
        ...current,
        [slug]: feed,
      }))
      setPreviewPageMap((current) => ({
        ...current,
        [slug]: 1,
      }))
      setPreviewTotalCountMap((current) => ({
        ...current,
        [slug]: feed.videos.length,
      }))
      setPreviewSourceMap((current) => ({
        ...current,
        [slug]: "updated",
      }))
      setRefreshStatusMap((current) => ({
        ...current,
        [slug]: status,
      }))
    } catch (previewError) {
      console.error("[emby-module] preview playlist failed", previewError)
      setError(toDisplayError(previewError, "更新片单失败，请检查 TMDB Key"))
    } finally {
      setRefreshingSlug(null)
    }
  }

  const loadCachedPlaylist = async (slug: EmbyPlaylistSlug) => {
    try {
      setRefreshingSlug(slug)
      setError(null)
      const [previewPage, status] = await Promise.all([
        embyClient.getCachedPlaylist(slug, 1, PREVIEW_PAGE_SIZE),
        embyClient.getPlaylistRefreshStatus(slug),
      ])

      setPreviewMap((current) => ({
        ...current,
        [slug]: previewPage.preview,
      }))
      setPreviewPageMap((current) => ({
        ...current,
        [slug]: previewPage.page,
      }))
      setPreviewTotalCountMap((current) => ({
        ...current,
        [slug]: previewPage.totalCount,
      }))
      setPreviewSourceMap((current) => ({
        ...current,
        [slug]: previewPage.preview ? "cache" : null,
      }))
      setRefreshStatusMap((current) => ({
        ...current,
        [slug]: status,
      }))
    } catch (cacheError) {
      console.error("[emby-module] load cached playlist failed", cacheError)
      setError(toDisplayError(cacheError, "获取当前缓存片单失败"))
    } finally {
      setRefreshingSlug(null)
    }
  }

  const changePreviewPage = async (nextPage: number) => {
    if (!selectedPlaylist || !selectedPreviewSource) {
      return
    }

    if (selectedPreviewSource === "updated") {
      setPreviewPageMap((current) => ({
        ...current,
        [selectedPlaylist.slug]: nextPage,
      }))
      return
    }

    try {
      setRefreshingSlug(selectedPlaylist.slug)
      const previewPage = await embyClient.getCachedPlaylist(selectedPlaylist.slug, nextPage, PREVIEW_PAGE_SIZE)
      setPreviewMap((current) => ({
        ...current,
        [selectedPlaylist.slug]: previewPage.preview,
      }))
      setPreviewPageMap((current) => ({
        ...current,
        [selectedPlaylist.slug]: previewPage.page,
      }))
      setPreviewTotalCountMap((current) => ({
        ...current,
        [selectedPlaylist.slug]: previewPage.totalCount,
      }))
    } catch (pageError) {
      console.error("[emby-module] change cached playlist page failed", pageError)
      setError(toDisplayError(pageError, "切换缓存片单分页失败"))
    } finally {
      setRefreshingSlug(null)
    }
  }

  const syncPlaylist = async (slug?: EmbyPlaylistSlug) => {
    if (saving) {
      setError("片单配置正在保存，请稍后再同步")
      return
    }

    try {
      if (!slug) {
        setError("同步全部功能已移除，请在片单详情中单独同步")
        return
      }

      setSyncingSlug(slug)
      setError(null)

      const result = await embyClient.syncPlaylists(slug)
      setConfig((current) => mergeRemoteWatchIds(current, result.results))
      const status = await embyClient.getPlaylistRefreshStatus(slug)
      setRefreshStatusMap((current) => ({
        ...current,
        [slug]: status,
      }))
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

  const updateNumericField = (
    field: PlaylistNumericField,
    value: string,
    parser: (input: string) => number | null
  ) => {
    setNumericDrafts((current) => ({
      ...current,
      [field]: value,
    }))

    if (!selectedPlaylist || value === "") {
      return
    }

    const parsed = parser(value)
    if (parsed === null) {
      return
    }

    updateSelectedPlaylist({ [field]: parsed } as Partial<EmbyManagedPlaylist>)
  }

  const resetNumericFieldDraft = (field: PlaylistNumericField) => {
    if (!selectedPlaylist) {
      return
    }

    setNumericDrafts((current) => ({
      ...current,
      [field]: toPlaylistNumericDrafts(selectedPlaylist)[field],
    }))
  }

  const addTag = (insertPosition: TagInsertPositionValue = tagInsertPosition) => {
    const tag = tagInput.trim()
    if (!selectedPlaylist || !tag || hasTag(selectedPlaylist.tags, tag)) {
      setTagInput("")
      return
    }

    const newTags = [...selectedPlaylist.tags]
    const insertIndex = resolveTagInsertIndex(newTags, insertPosition)
    newTags.splice(insertIndex, 0, tag)

    updateSelectedPlaylist({ tags: newTags })
    setTagInput("")
    setTagInsertPosition(`at:${newTags.length}`)
  }

  const activateTagInsertPosition = (index: number) => {
    setTagInsertPosition(`at:${index}`)
    tagInputRef.current?.focus()
  }

  const removeTag = (tag: string) => {
    if (!selectedPlaylist) return
    updateSelectedPlaylist({ tags: selectedPlaylist.tags.filter((item) => item !== tag) })
  }

  const [editingTag, setEditingTag] = useState<string | null>(null)
  const [editingTagValue, setEditingTagValue] = useState("")
  const [draggedTag, setDraggedTag] = useState<string | null>(null)
  const [dragOverTag, setDragOverTag] = useState<string | null>(null)

  const startEditTag = (tag: string) => {
    setEditingTag(tag)
    setEditingTagValue(tag)
  }

  const cancelEditTag = () => {
    setEditingTag(null)
    setEditingTagValue("")
  }

  const saveEditTag = () => {
    if (!selectedPlaylist || !editingTag) return

    const newTag = editingTagValue.trim()
    if (!newTag || newTag === editingTag) {
      cancelEditTag()
      return
    }

    if (hasTag(selectedPlaylist.tags.filter((tag) => tag !== editingTag), newTag)) {
      cancelEditTag()
      return
    }

    updateSelectedPlaylist({
      tags: selectedPlaylist.tags.map((tag) => (tag === editingTag ? newTag : tag)),
    })
    setEditingTag(null)
    setEditingTagValue("")
  }

  const handleDragStart = (tag: string) => {
    setDraggedTag(tag)
  }

  const handleDragOver = (event: React.DragEvent, tag: string) => {
    event.preventDefault()
    if (draggedTag && draggedTag !== tag) {
      setDragOverTag(tag)
    }
  }

  const handleDragLeave = () => {
    setDragOverTag(null)
  }

  const handleDrop = (event: React.DragEvent, targetTag: string) => {
    event.preventDefault()
    if (!selectedPlaylist || !draggedTag || draggedTag === targetTag) {
      setDraggedTag(null)
      setDragOverTag(null)
      return
    }

    const tags = [...selectedPlaylist.tags]
    const draggedIndex = tags.indexOf(draggedTag)
    const targetIndex = tags.indexOf(targetTag)

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedTag(null)
      setDragOverTag(null)
      return
    }

    tags.splice(draggedIndex, 1)
    const nextTargetIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex
    tags.splice(nextTargetIndex, 0, draggedTag)

    updateSelectedPlaylist({ tags })
    setDraggedTag(null)
    setDragOverTag(null)
  }

  const handleDragEnd = () => {
    setDraggedTag(null)
    setDragOverTag(null)
  }

  const saveConfig = async () => {
    try {
      setSaving(true)
      setError(null)
      const saved = await embyClient.saveConfig(config)
      setConfig(saved)
    } catch (saveError) {
      console.error("[emby-module] save config failed", saveError)
      setError(toDisplayError(saveError, "保存 Emby 片单失败"))
    } finally {
      setSaving(false)
    }
  }

  const selectedPreview = selectedPlaylist ? (previewMap[selectedPlaylist.slug] ?? null) : null
  const selectedRefreshStatus = selectedPlaylist ? (refreshStatusMap[selectedPlaylist.slug] ?? null) : null
  const selectedPreviewSource = selectedPlaylist ? (previewSourceMap[selectedPlaylist.slug] ?? null) : null
  const currentPreviewPage = selectedPlaylist ? (previewPageMap[selectedPlaylist.slug] ?? 1) : 1
  const selectedPreviewTotalCount = selectedPlaylist
    ? (previewTotalCountMap[selectedPlaylist.slug] ?? selectedPreview?.videos.length ?? 0)
    : 0
  const totalPreviewPages = Math.max(1, Math.ceil(selectedPreviewTotalCount / PREVIEW_PAGE_SIZE))
  const visiblePreviewVideos = selectedPreviewSource === "updated"
    ? (selectedPreview?.videos.slice(
      (currentPreviewPage - 1) * PREVIEW_PAGE_SIZE,
      currentPreviewPage * PREVIEW_PAGE_SIZE
    ) ?? [])
    : (selectedPreview?.videos ?? [])
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
        title="Emby"
      />

      <div className="space-y-4">
        {error && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex min-h-[50vh] items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-center">
              <LoaderCircle className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">正在加载 Emby 配置...</p>
            </div>
          </div>
        ) : config.playlists.length === 0 ? (
          <EmptyState
            icon={<Clapperboard className="h-6 w-6" />}
            title="还没有片单配置"
            description="请检查环境变量配置。"
          />
        ) : (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-brand">
                      <Clapperboard className="h-6 w-6" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="text-base font-semibold text-foreground">当前片单</div>
                      <div className="w-full max-w-[280px]">
                        <Select
                          value={selectedSlug}
                          options={playlistOptions}
                          onChange={(value) => {
                            const nextSlug = value as EmbyPlaylistSlug
                            const nextPlaylist = config.playlists.find((playlist) => playlist.slug === nextSlug)
                            setSelectedSlug(value as EmbyPlaylistSlug)
                            setTagInput("")
                            setTagInsertPosition(`at:${nextPlaylist?.tags.length ?? 0}`)
                          }}
                          placeholder="选择片单"
                          showDescription={false}
                          contentClassName="bg-background"
                        />
                      </div>
                    
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
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => syncPlaylist(selectedPlaylist.slug)}
                      disabled={saving || syncingSlug !== null}
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
                        value={numericDrafts.remoteWatchId}
                        onChange={(event) => {
                          const value = event.target.value.trim()
                          updateNumericField("remoteWatchId", value, (input) => {
                            const parsed = Number(input)
                            return Number.isInteger(parsed) && parsed > 0 ? parsed : null
                          })
                        }}
                        onBlur={() => resetNumericFieldDraft("remoteWatchId")}
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
                        max={5000}
                        value={numericDrafts.limit}
                        onChange={(event) => {
                          updateNumericField("limit", event.target.value, (input) => {
                            const parsed = Number(input)
                            return Number.isFinite(parsed) ? parsed : null
                          })
                        }}
                        onBlur={() => resetNumericFieldDraft("limit")}
                        placeholder="最高 5000"
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
                        value={numericDrafts.releaseWindowDays}
                        onChange={(event) => {
                          updateNumericField("releaseWindowDays", event.target.value, (input) => {
                            const parsed = Number(input)
                            return Number.isFinite(parsed) ? parsed : null
                          })
                        }}
                        onBlur={() => resetNumericFieldDraft("releaseWindowDays")}
                        className={inputClassName}
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="emby-point" className="text-sm font-medium text-foreground">订阅所需胡萝卜</label>
                      <Input
                        id="emby-point"
                        type="number"
                        min={0}
                        max={999999}
                        value={numericDrafts.point}
                        onChange={(event) => {
                          updateNumericField("point", event.target.value, (input) => {
                            const parsed = Number(input)
                            return Number.isFinite(parsed) ? parsed : null
                          })
                        }}
                        onBlur={() => resetNumericFieldDraft("point")}
                        placeholder="0 表示免费订阅"
                        className={inputClassName}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <div className="text-sm font-medium text-foreground">标签</div>
                      <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-background px-2 py-2">
                        {selectedPlaylist.tags.map((tag, index) => (
                          <span key={`tag-group-${tag}`} className="contents">
                            <button
                              type="button"
                              onClick={() => activateTagInsertPosition(index)}
                              className={`group flex h-7 w-3 items-center justify-center rounded-full transition-all ${
                                tagInsertPosition === `at:${index}` ? "bg-primary/12" : "hover:bg-primary/10"
                              }`}
                              title={`在当前位置插入标签`}
                              aria-label={`在标签 ${tag} 前插入`}
                            >
                              <span
                                className={`w-px rounded-full transition-all ${
                                  tagInsertPosition === `at:${index}` ? "h-4 bg-primary" : "h-3 bg-border group-hover:bg-primary/55"
                                }`}
                              />
                            </button>
                            <span
                              draggable={editingTag !== tag}
                              onDragStart={() => handleDragStart(tag)}
                              onDragOver={(event) => handleDragOver(event, tag)}
                              onDragLeave={handleDragLeave}
                              onDrop={(event) => handleDrop(event, tag)}
                              onDragEnd={handleDragEnd}
                              className={`inline-flex h-7 items-center gap-1 rounded-full bg-muted px-2.5 text-xs font-medium text-muted-foreground transition-all ${
                                draggedTag === tag ? "opacity-50" : ""
                              } ${
                                dragOverTag === tag && draggedTag !== tag ? "ring-2 ring-primary ring-offset-1" : ""
                              } ${editingTag !== tag ? "cursor-move" : ""}`}
                              onDoubleClick={() => startEditTag(tag)}
                              title={editingTag !== tag ? "双击编辑，拖拽排序" : ""}
                            >
                              {editingTag === tag ? (
                                <Input
                                  value={editingTagValue}
                                  onChange={(event) => setEditingTagValue(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault()
                                      saveEditTag()
                                    }
                                    if (event.key === "Escape") {
                                      cancelEditTag()
                                    }
                                  }}
                                  onBlur={saveEditTag}
                                  autoFocus
                                  className="h-5 w-20 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
                                />
                              ) : (
                                <>
                                  <span className="cursor-pointer select-none">{tag}</span>
                                  <button
                                    type="button"
                                    onClick={() => removeTag(tag)}
                                    className="rounded-full text-muted-foreground/70 hover:text-foreground"
                                    aria-label={`删除标签 ${tag}`}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </>
                              )}
                            </span>
                          </span>
                        ))}
                        <div className="flex min-w-[160px] flex-1 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => activateTagInsertPosition(selectedPlaylist.tags.length)}
                            className={`group flex h-7 w-3 shrink-0 items-center justify-center rounded-full transition-all ${
                              tagInsertPosition === `at:${selectedPlaylist.tags.length}` ? "bg-primary/12" : "hover:bg-primary/10"
                            }`}
                            title="在末尾插入标签"
                            aria-label="在标签末尾插入"
                          >
                            <span
                              className={`w-px rounded-full transition-all ${
                                tagInsertPosition === `at:${selectedPlaylist.tags.length}`
                                  ? "h-4 bg-primary"
                                  : "h-3 bg-border group-hover:bg-primary/55"
                              }`}
                            />
                          </button>
                          <Input
                            ref={tagInputRef}
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
                      disabled={saving || syncingSlug !== null}
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
                      <div className="text-lg font-semibold text-foreground">片单内容</div>
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
                        onClick={() => loadCachedPlaylist(selectedPlaylist.slug)}
                        disabled={refreshingSlug !== null}
                      >
                        {refreshingSlug === selectedPlaylist.slug ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                        查看当前缓存片单
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2"
                        onClick={() => previewPlaylist(selectedPlaylist.slug)}
                        disabled={refreshingSlug !== null}
                      >
                        {refreshingSlug === selectedPlaylist.slug ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                        更新片单
                      </Button>
                    </div>
                  </div>
                  {selectedRefreshStatus && (
                    <Callout
                      variant={getRefreshStatusVariant(selectedRefreshStatus.status)}
                      title={toRefreshStatusLabel(selectedRefreshStatus.status)}
                      className="px-3 py-2"
                    >
                        <p>
                          进度 {selectedRefreshStatus.processedPages}/{selectedRefreshStatus.totalPages} 页，
                          已收集 {selectedRefreshStatus.collectedCount}/{selectedRefreshStatus.targetCount} 条；
                          {selectedRefreshStatus.cacheGeneratedAt
                            ? `当前缓存生成 ${formatDisplayTime(selectedRefreshStatus.cacheGeneratedAt) ?? selectedRefreshStatus.cacheGeneratedAt}`
                            : "当前缓存生成 尚未生成"}
                          ，{getNextRefreshStageDescription(selectedRefreshStatus)}
                        </p>
                        {selectedRefreshStatus.errorMessage && (
                          <p className="text-destructive">错误：{selectedRefreshStatus.errorMessage}</p>
                        )}
                    </Callout>
                  )}
                  {selectedPreview && !isSelectedPreviewCollapsed ? (
                    <div className="space-y-4">
                      <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          当前片单共生成 {selectedPreviewTotalCount} 条，当前第 {currentPreviewPage}/{totalPreviewPages} 页，每页 {PREVIEW_PAGE_SIZE} 条。
                        </div>
                        {selectedPlaylist && totalPreviewPages > 1 && (
                          <div className="flex items-center gap-2 self-end sm:self-auto">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1 px-2 text-xs"
                              disabled={refreshingSlug !== null || currentPreviewPage <= 1}
                              onClick={() => void changePreviewPage(Math.max(1, currentPreviewPage - 1))}
                            >
                              <ChevronLeft className="h-3 w-3" />
                              上一页
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1 px-2 text-xs"
                              disabled={refreshingSlug !== null || currentPreviewPage >= totalPreviewPages}
                              onClick={() => void changePreviewPage(Math.min(totalPreviewPages, currentPreviewPage + 1))}
                            >
                              下一页
                              <ChevronRight className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                        {visiblePreviewVideos.map((video) => (
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
                    </div>
                  ) : selectedPreview && isSelectedPreviewCollapsed ? (
                    <div className="rounded-2xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
                      当前片单内容已收起。点击“展开预览”可再次查看海报列表。
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border/70 px-4 py-4 text-sm text-muted-foreground">
                      点击“更新片单”生成最新片单，或点击“查看当前缓存片单”读取已有缓存。
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

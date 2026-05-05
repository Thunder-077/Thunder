"use client"

import { type ChangeEvent, type PointerEvent, type WheelEvent, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Bell, Camera, LogOut, Menu, Palette, Settings, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { WeatherWidget } from "@/components/weather-widget"

const rainbowQuotes = [
  "专注当下，效率加倍。",
  "今天的你，比昨天更强大。",
  "保持热爱，奔赴山海。",
  "每一个小进步，都是大胜利。",
  "你的努力，时光都看得见。",
  "相信自己，你比想象中更优秀。",
  "新的一天，新的可能。",
  "慢慢来，好戏都在烟火里。",
  "星光不问赶路人，时光不负有心人。",
  "愿你眼中有光，心中有爱。",
  "今天的咖啡格外香，因为你很棒。",
  "万事开头难，但你已经开始了。",
  "你的坚持，终将美好。",
  "生活明朗，万物可爱。",
  "做最好的自己，其他的交给时间。",
]

interface TopbarProps {
  onToggleSidebar?: () => void
}

function getGreeting(): string {
  const hour = new Date().getHours()

  if (hour < 6) {
    return "夜深了"
  }

  if (hour < 12) {
    return "上午好"
  }

  if (hour < 14) {
    return "中午好"
  }

  if (hour < 18) {
    return "下午好"
  }

  return "晚上好"
}

function getTodayDate(): string {
  const date = new Date()
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"]
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const weekday = weekdays[date.getDay()]

  return `${year}年${month}月${day}日 星期${weekday}`
}

function getDailyQuote(): string {
  const date = new Date()
  const seed = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate()
  const index = seed % rainbowQuotes.length

  return rainbowQuotes[index]
}

function NotificationButton() {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="
    h-8 w-8 rounded-full
    text-muted-foreground/60
    transition-all duration-150
    hover:bg-muted/70 hover:text-foreground
    active:scale-95
  "
      aria-label="通知"
    >
      <Bell className="size-5" strokeWidth={2.2} />
    </Button>
  )
}

function getInitial(username: string): string {
  return username.trim().charAt(0).toUpperCase() || "T"
}

function AvatarButton({
  username,
  avatarUrl,
  className = "",
}: {
  username: string
  avatarUrl: string
  className?: string
}) {
  return (
    <span
      className={`
        flex shrink-0 items-center justify-center rounded-full
        bg-[conic-gradient(#4285f4_0_25%,#34a853_0_50%,#fbbc05_0_75%,#ea4335_0_100%)]
        p-[3px]
        shadow-sm shadow-brand/20
        ${className}
      `}
      aria-hidden="true"
    >
      <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-brand text-sm font-semibold text-primary-foreground ring-1 ring-background">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" decoding="async" />
        ) : (
          getInitial(username)
        )}
      </span>
    </span>
  )
}

interface AvatarCropDialogProps {
  imageUrl: string
  onCancel: () => void
  onSave: (avatarUrl: string) => void
}

const CROP_VIEW_SIZE = 360
const CROP_SIZE = 296
const AVATAR_OUTPUT_SIZE = 512
const MIN_CROP_SCALE = 1
const MAX_CROP_SCALE = 3

function AvatarCropDialog({ imageUrl, onCancel, onSave }: AvatarCropDialogProps) {
  const imageRef = useRef<HTMLImageElement>(null)
  const dragStartRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 })
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 })

  const getRenderedImage = (nextScale = scale) => {
    const baseScale = Math.max(CROP_SIZE / imageSize.width, CROP_SIZE / imageSize.height)
    const totalScale = baseScale * nextScale
    const width = imageSize.width * totalScale
    const height = imageSize.height * totalScale

    return { width, height, totalScale }
  }

  const clampOffset = (nextOffset: { x: number; y: number }, nextScale = scale) => {
    const rendered = getRenderedImage(nextScale)
    const maxX = Math.max(0, (rendered.width - CROP_SIZE) / 2)
    const maxY = Math.max(0, (rendered.height - CROP_SIZE) / 2)

    return {
      x: Math.min(maxX, Math.max(-maxX, nextOffset.x)),
      y: Math.min(maxY, Math.max(-maxY, nextOffset.y)),
    }
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    }
    setDragging(true)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return

    const start = dragStartRef.current
    setOffset(clampOffset({
      x: start.offsetX + event.clientX - start.x,
      y: start.offsetY + event.clientY - start.y,
    }))
  }

  const handlePointerEnd = () => {
    setDragging(false)
  }

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const nextScale = Math.min(
      MAX_CROP_SCALE,
      Math.max(MIN_CROP_SCALE, scale + (event.deltaY > 0 ? -0.08 : 0.08))
    )
    setScale(nextScale)
    setOffset((current) => clampOffset(current, nextScale))
  }

  const handleSave = () => {
    const image = imageRef.current
    if (!image) return

    const rendered = getRenderedImage()
    const imageLeft = CROP_VIEW_SIZE / 2 - rendered.width / 2 + offset.x
    const imageTop = CROP_VIEW_SIZE / 2 - rendered.height / 2 + offset.y
    const cropLeft = (CROP_VIEW_SIZE - CROP_SIZE) / 2
    const cropTop = (CROP_VIEW_SIZE - CROP_SIZE) / 2
    const sourceX = (cropLeft - imageLeft) / rendered.totalScale
    const sourceY = (cropTop - imageTop) / rendered.totalScale
    const sourceSize = CROP_SIZE / rendered.totalScale

    const canvas = document.createElement("canvas")
    canvas.width = AVATAR_OUTPUT_SIZE
    canvas.height = AVATAR_OUTPUT_SIZE

    const context = canvas.getContext("2d")
    if (!context) return

    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = "high"
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      AVATAR_OUTPUT_SIZE,
      AVATAR_OUTPUT_SIZE
    )

    onSave(canvas.toDataURL("image/jpeg", 0.92))
  }

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/25 px-4 py-6">
      <div className="w-full max-w-[448px] overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">裁剪你的新头像</h2>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <div className="px-4 py-4">
          <div
            className="relative mx-auto overflow-hidden bg-muted"
            style={{ width: CROP_VIEW_SIZE, height: CROP_VIEW_SIZE, maxWidth: "100%" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onWheel={handleWheel}
          >
            <img
              ref={imageRef}
              src={imageUrl}
              alt=""
              draggable={false}
              onLoad={() => {
                const image = imageRef.current
                if (image) {
                  setImageSize({ width: image.naturalWidth, height: image.naturalHeight })
                }
                setScale(1)
                setOffset({ x: 0, y: 0 })
              }}
              className="absolute max-w-none select-none"
              style={{
                width: `${getRenderedImage().width}px`,
                height: `${getRenderedImage().height}px`,
                left: `${CROP_VIEW_SIZE / 2 - getRenderedImage().width / 2 + offset.x}px`,
                top: `${CROP_VIEW_SIZE / 2 - getRenderedImage().height / 2 + offset.y}px`,
                cursor: dragging ? "grabbing" : "grab",
              }}
            />
            <div
              className="pointer-events-none absolute inset-0 m-auto rounded-full border border-white/90 shadow-[0_0_0_999px_rgba(0,0,0,0.22)]"
              style={{ width: CROP_SIZE, height: CROP_SIZE }}
            />
          </div>

          <p className="mt-3 text-center text-xs text-muted-foreground">
            拖动图片调整位置，滚动鼠标滚轮缩放。
          </p>
        </div>

        <div className="border-t border-border px-4 py-3">
          <Button type="button" className="h-10 w-full" onClick={handleSave}>
            设置新头像
          </Button>
        </div>
      </div>
    </div>
  )
}

function UserAvatarMenu() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [username, setUsername] = useState("thunder")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [pendingAvatarUrl, setPendingAvatarUrl] = useState("")
  const [avatarMessage, setAvatarMessage] = useState("")

  useEffect(() => {
    let active = true

    async function loadUser() {
      const response = await fetch("/api/auth/me", { cache: "no-store" }).catch(() => null)
      if (!active || !response?.ok) return

      const data = await response.json().catch(() => null) as {
        user?: {
          username?: string
          avatarUrl?: string
        }
      } | null
      const nextUsername = data?.user?.username?.trim()
      if (nextUsername) {
        setUsername(nextUsername)
      }
      setAvatarUrl(data?.user?.avatarUrl || "")
    }

    void loadUser()

    return () => {
      active = false
    }
  }, [])

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    router.replace("/login")
    router.refresh()
  }

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    setAvatarMessage("")

    if (!file) return

    if (!file.type.startsWith("image/")) {
      setAvatarMessage("请选择图片文件")
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setAvatarMessage("图片不能超过 5MB")
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : ""
      setPendingAvatarUrl(result)
    }
    reader.readAsDataURL(file)
  }

  const saveAvatar = async (result: string) => {
    const response = await fetch("/api/auth/avatar", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatarUrl: result }),
    }).catch(() => null)

    if (!response?.ok) {
      const data = await response?.json().catch(() => null) as { message?: string } | null
      setAvatarMessage(data?.message || "头像更新失败")
      return
    }

    const data = await response.json().catch(() => null) as {
      user?: {
        avatarUrl?: string
      }
    } | null
    setAvatarUrl(data?.user?.avatarUrl || result)
    setPendingAvatarUrl("")
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="
            rounded-full outline-none
            transition-transform duration-150
            hover:scale-[1.04]
            focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
            active:scale-95
          "
          aria-label="打开用户菜单"
        >
          <AvatarButton username={username} avatarUrl={avatarUrl} className="h-10 w-10" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="w-max max-w-[calc(100vw-2rem)] p-1.5">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2.5">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                fileInputRef.current?.click()
              }}
              className="group/avatar relative rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="修改头像"
              title="修改头像"
            >
              <AvatarButton username={username} avatarUrl={avatarUrl} className="h-11 w-11 text-base" />
              <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-background bg-background text-foreground shadow-sm">
                <Camera className="h-3 w-3" />
              </span>
            </button>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">{username}</div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>

          {avatarMessage && (
            <div className="px-2 pb-2 text-xs text-destructive">{avatarMessage}</div>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <UserRound className="h-4 w-4" />
            账户信息
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Palette className="h-4 w-4" />
            外观偏好
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/settings")}>
            <Settings className="h-4 w-4" />
            系统设置
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            退出登录
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {pendingAvatarUrl && (
        <AvatarCropDialog
          imageUrl={pendingAvatarUrl}
          onCancel={() => setPendingAvatarUrl("")}
          onSave={saveAvatar}
        />
      )}
    </>
  )
}

function TopbarActions({ isHomePage }: { isHomePage: boolean }) {
  return (
    <div
      className={
        isHomePage
          ? "flex shrink-0 items-center gap-3 pt-1"
          : "flex shrink-0 items-center gap-3"
      }
    >
      <WeatherWidget />

      <div className="h-6 w-px bg-border" />

      <NotificationButton />

      <UserAvatarMenu />
    </div>
  )
}

export function Topbar({ onToggleSidebar }: TopbarProps) {
  const pathname = usePathname()
  const isHomePage = pathname === "/"

  const homeGreeting = useMemo(() => {
    if (!isHomePage) {
      return {
        greeting: "",
        todayDate: "",
        quote: "",
      }
    }

    return {
      greeting: getGreeting(),
      todayDate: getTodayDate(),
      quote: getDailyQuote(),
    }
  }, [isHomePage])

  return (
    <div
      className={
        isHomePage
          ? "flex items-start justify-between gap-6 py-4"
          : "flex items-center justify-between gap-3 py-3"
      }
    >
      {isHomePage ? (
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">
            {homeGreeting.todayDate}
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            {homeGreeting.greeting}，
            <br />
            <span className="text-brand">欢迎回来</span>
          </h1>

          <div className="mt-5 flex items-center gap-4">
            <span className="h-[3px] w-10 rounded-full bg-brand shrink-0" />
            <p className="text-sm text-muted-foreground">
              {homeGreeting.quote || "专注当下，效率加倍。"}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 items-center">
          {onToggleSidebar && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 md:hidden"
              onClick={onToggleSidebar}
              aria-label="打开导航"
            >
              <Menu className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      <TopbarActions isHomePage={isHomePage} />
    </div>
  )
}

/**
 * 窗帘报价单海报 — Canvas 渲染器
 *
 * 仅依赖 Canvas 2D 标准 API + theme 令牌，不依赖任何图片素材。
 * 分两层：
 *  1. 底层原语：drawRoundRect / drawCard / drawText / drawWrappedText / drawIconText / drawDivider / drawPrice
 *  2. 复合分区：drawRoomTable / drawSummaryCard / drawBrandHeader
 *
 * 所有复合方法返回自身占用高度，方便 builder 做游标式布局与高度预估保持一致。
 */

import { theme, type FontKey } from "./theme"
import type { PosterRoom, PosterSummary, PosterCustomer, PosterStore } from "./builder"

const T = theme

/** Canvas 2D 上下文类型（小程序环境下与 Web 一致）。 */
export type Ctx = CanvasRenderingContext2D

/* ================================================================
 *  字符串工具
 * ================================================================ */

/** 拼接 canvas font 字符串：`700 24px sans-serif`。 */
function fontStr(key: FontKey): string {
  const f = T.font[key]
  return `${f.weight} ${f.size}px ${T.fontFamily}`
}

/** 截断文本到指定最大宽度，超出补省略号。 */
function truncate(ctx: Ctx, s: string, maxWidth: number, key: FontKey): string {
  ctx.font = fontStr(key)
  if (ctx.measureText(s).width <= maxWidth) return s
  let lo = 0
  let hi = s.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    const test = s.slice(0, mid) + "…"
    if (ctx.measureText(test).width <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return s.slice(0, Math.max(0, lo)) + "…"
}

/* ================================================================
 *  1. 底层原语
 * ================================================================ */

/** 构造圆角矩形路径（不绘制，由调用方 fill/stroke/clip）。 */
export function drawRoundRect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
  ctx.lineTo(x + rr, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr)
  ctx.lineTo(x, y + rr)
  ctx.quadraticCurveTo(x, y, x + rr, y)
  ctx.closePath()
}

/** 卡片：阴影偏移矩形 + 白底 + 浅边框。 */
export function drawCard(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  radius = T.radius.card,
): void {
  // 阴影：向下偏移的半透明圆角矩形
  drawRoundRect(ctx, x, y + T.shadow.offsetY, w, h, radius)
  ctx.fillStyle = T.color.cardShadow
  ctx.fill()
  // 白底
  drawRoundRect(ctx, x, y, w, h, radius)
  ctx.fillStyle = T.color.card
  ctx.fill()
  // 浅边框
  drawRoundRect(ctx, x, y, w, h, radius)
  ctx.strokeStyle = T.color.cardBorder
  ctx.lineWidth = 1
  ctx.stroke()
}

/** 绘制单行文本，返回文本宽度。baseline 统一 top。 */
export function drawText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  key: FontKey,
  color: string,
  align: "left" | "center" | "right" = "left",
): number {
  ctx.font = fontStr(key)
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = "top"
  ctx.fillText(text, x, y)
  return ctx.measureText(text).width
}

/**
 * 绘制可换行文本（中文按字符断行，西文按空格断行）。
 * 返回绘制结束后下一行的 y 坐标。
 */
export function drawWrappedText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  key: FontKey,
  color: string,
  lineHeight: number,
): number {
  ctx.font = fontStr(key)
  ctx.fillStyle = color
  ctx.textAlign = "left"
  ctx.textBaseline = "top"

  const lines = breakLines(ctx, text, maxWidth)
  lines.forEach((line, i) => {
    ctx.fillText(line, x, y + i * lineHeight)
  })
  return y + lines.length * lineHeight
}

/** 文本断行：先按换行符拆，再按宽度逐字符/逐词拆。 */
function breakLines(ctx: Ctx, text: string, maxWidth: number): string[] {
  const paragraphs = text.split("\n")
  const result: string[] = []
  for (const p of paragraphs) {
    let cur = ""
    for (const ch of p) {
      if (ctx.measureText(cur + ch).width > maxWidth && cur.length > 0) {
        result.push(cur)
        cur = ch
      } else {
        cur += ch
      }
    }
    if (cur) result.push(cur)
    else if (p === "") result.push("")
  }
  return result
}

/**
 * 图标 + 文本组合：左侧画一个线性图标，右侧跟文字。
 * 返回整体占用宽度（图标 + gap + 文字）。
 */
export function drawIconText(
  ctx: Ctx,
  icon: IconType,
  text: string,
  x: number,
  y: number,
  key: FontKey,
  color: string,
): number {
  const iconSize = T.font[key].size
  drawIcon(ctx, icon, x, y + (iconSize - 22) / 2, color)
  const textX = x + 22 + 10
  const w = drawText(ctx, text, textX, y, key, color)
  return 22 + 10 + w
}

/** 水平分割线。 */
export function drawDivider(
  ctx: Ctx,
  x1: number,
  x2: number,
  y: number,
  color: string = T.color.divider,
  lineWidth = 1,
): void {
  ctx.beginPath()
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.moveTo(x1, y)
  ctx.lineTo(x2, y)
  ctx.stroke()
}

/**
 * 绘制价格：可选大/中/小三种字号。
 * `symbolKey` 控制币种符号字号（大字时符号略小更协调）。
 */
export function drawPrice(
  ctx: Ctx,
  value: number,
  x: number,
  y: number,
  align: "left" | "center" | "right" = "right",
  key: FontKey = "priceMedium",
  color: string = T.color.price,
  symbolKey?: FontKey,
): void {
  const n = Number(value || 0)
  const absValue = Math.abs(n)
  const fixed = absValue.toFixed(2)
  const [intPart, decPart] = fixed.split(".")
  const intWithComma = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  const body = decPart === "00" ? intWithComma : `${intWithComma}.${decPart}`

  ctx.textBaseline = "top"
  ctx.textAlign = align

  const sym = symbolKey ?? key
  ctx.font = fontStr(sym)
  ctx.fillStyle = color
  const symText = n < 0 ? "-¥" : "¥"
  const symW = ctx.measureText(symText).width

  ctx.font = fontStr(key)
  const bodyW = ctx.measureText(body).width
  const totalW = symW + bodyW

  // 分段绘制时先计算整组左起点，再统一按 left 绘制，避免小程序真机 canvas 对 right 对齐二次偏移。
  let symX = x
  let bodyX = x + symW
  if (align === "center") {
    symX = x - totalW / 2
    bodyX = symX + symW
  } else if (align === "right") {
    symX = x - totalW
    bodyX = symX + symW
  }

  ctx.textAlign = "left"
  ctx.font = fontStr(sym)
  ctx.fillText(symText, symX, y)
  ctx.font = fontStr(key)
  ctx.fillText(body, bodyX, y)
}

/* ================================================================
 *  图标系统 — 纯路径绘制，22×22 画布
 * ================================================================ */

export type IconType = "phone" | "pin" | "calendar" | "user" | "check" | "dot" | "note"

/** 在 (x, y) 绘制 22×22 的线性图标，颜色由 color 控制。 */
export function drawIcon(ctx: Ctx, type: IconType, x: number, y: number, color: string): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 1.6
  ctx.lineCap = "round"
  ctx.lineJoin = "round"

  switch (type) {
    case "phone":
      ctx.beginPath()
      ctx.moveTo(x + 5, y + 3)
      ctx.quadraticCurveTo(x + 3, y + 3, x + 3, y + 6)
      ctx.quadraticCurveTo(x + 3, y + 16, x + 11, y + 19)
      ctx.quadraticCurveTo(x + 19, y + 19, x + 19, y + 16)
      ctx.quadraticCurveTo(x + 19, y + 14, x + 16, y + 13)
      ctx.quadraticCurveTo(x + 14, y + 13, x + 13, y + 15)
      ctx.quadraticCurveTo(x + 10, y + 13, x + 9, y + 10)
      ctx.quadraticCurveTo(x + 11, y + 9, x + 11, y + 7)
      ctx.quadraticCurveTo(x + 11, y + 5, x + 9, y + 4)
      ctx.quadraticCurveTo(x + 7, y + 3, x + 5, y + 3)
      ctx.stroke()
      break
    case "pin":
      ctx.beginPath()
      ctx.arc(x + 11, y + 8, 5, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x + 7, y + 12)
      ctx.lineTo(x + 11, y + 20)
      ctx.lineTo(x + 15, y + 12)
      ctx.stroke()
      break
    case "calendar":
      ctx.beginPath()
      ctx.rect(x + 3, y + 4, 16, 15)
      ctx.moveTo(x + 3, y + 8)
      ctx.lineTo(x + 19, y + 8)
      ctx.moveTo(x + 7, y + 2)
      ctx.lineTo(x + 7, y + 6)
      ctx.moveTo(x + 15, y + 2)
      ctx.lineTo(x + 15, y + 6)
      ctx.stroke()
      break
    case "user":
      ctx.beginPath()
      ctx.arc(x + 11, y + 8, 4, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x + 4, y + 20)
      ctx.quadraticCurveTo(x + 4, y + 13, x + 11, y + 13)
      ctx.quadraticCurveTo(x + 18, y + 13, x + 18, y + 20)
      ctx.stroke()
      break
    case "check":
      ctx.beginPath()
      ctx.arc(x + 11, y + 11, 8, 0, Math.PI * 2)
      ctx.fillStyle = "rgba(0,0,0,0)"
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x + 7, y + 11)
      ctx.lineTo(x + 10, y + 14)
      ctx.lineTo(x + 15, y + 8)
      ctx.stroke()
      break
    case "note":
      ctx.beginPath()
      ctx.moveTo(x + 4, y + 3)
      ctx.lineTo(x + 18, y + 3)
      ctx.quadraticCurveTo(x + 20, y + 3, x + 20, y + 6)
      ctx.lineTo(x + 20, y + 14)
      ctx.quadraticCurveTo(x + 20, y + 18, x + 16, y + 18)
      ctx.lineTo(x + 8, y + 18)
      ctx.lineTo(x + 4, y + 14)
      ctx.lineTo(x + 4, y + 6)
      ctx.quadraticCurveTo(x + 4, y + 3, x + 4, y + 3)
      ctx.stroke()
      break
    case "dot":
    default:
      ctx.beginPath()
      ctx.arc(x + 11, y + 11, 3, 0, Math.PI * 2)
      ctx.fill()
      break
  }
  ctx.restore()
}

/* ================================================================
 *  2. 复合分区
 * ================================================================ */

/** 区块标题：左侧短竖条 + 标题文字。返回高度。 */
export function drawSectionTitle(
  ctx: Ctx,
  title: string,
  x: number,
  y: number,
): number {
  // 左侧 4px 品牌色竖条
  ctx.fillStyle = T.color.brand
  ctx.fillRect(x, y + 4, 4, T.font.section.size)
  drawText(ctx, title, x + 14, y, "section", T.color.ink)
  return T.font.section.size + 4
}

/** 品牌头部：正式报价单抬头，避免装饰图形抢占视觉。返回高度。 */
export function drawBrandHeader(
  ctx: Ctx,
  brandName: string,
  subtitle: string,
  x: number,
  y: number,
): number {
  const rightX = T.width - T.spacing.padX

  const titleGap = 20       // 主标题和副标题间距
  const dividerGap = 16     // 副标题和分割线间距

  drawText(ctx, brandName, x, y, "brand", T.color.ink)
  drawText(
    ctx,
    subtitle,
    x,
    y + T.font.brand.size + titleGap,
    "brandSub",
    T.color.muted,
  )

  const dividerY =
    y + T.font.brand.size + titleGap + T.font.brandSub.size + dividerGap

  drawDivider(ctx, x, rightX, dividerY, T.color.divider)

  return T.font.brand.size + titleGap + T.font.brandSub.size + dividerGap
}

/** 客户信息卡片：姓名、电话、地址、日期统一 label/value 展示。返回卡片高度。 */
export function drawCustomerCard(
  ctx: Ctx,
  customer: PosterCustomer,
  x: number,
  y: number,
  w: number,
): number {
  const padX = T.spacing.innerPadX
  const padY = 16
  const rowH = T.font.value.size + 10
  const innerH = rowH * 2
  const cardH = padY + innerH + padY

  drawCard(ctx, x, y, w, cardH)

  let cy = y + padY
  const leftW = w * 0.48
  drawText(ctx, "姓名", x + padX, cy, "label", T.color.light)
  drawText(ctx, truncate(ctx, customer.name, leftW - 72, "value"), x + padX + 72, cy - 2, "value", T.color.text)
  drawText(ctx, "电话", x + w * 0.55, cy, "label", T.color.light)
  drawText(ctx, customer.phone, x + w - padX, cy - 2, "value", T.color.text, "right")
  cy += rowH

  drawText(ctx, "地址", x + padX, cy, "label", T.color.light)
  drawText(ctx, truncate(ctx, customer.address, leftW - 72, "value"), x + padX + 72, cy - 2, "value", T.color.text)
  drawText(ctx, "日期", x + w * 0.55, cy, "label", T.color.light)
  drawText(ctx, customer.date || "—", x + w - padX, cy - 2, "value", T.color.text, "right")

  return cardH
}

/** 汇总价格卡：突出客户最关心的最终报价金额。返回卡片高度。 */
export function drawSummaryCard(
  ctx: Ctx,
  summary: PosterSummary,
  x: number,
  y: number,
  w: number,
): number {
  const padX = T.spacing.innerPadX
  const padY = T.spacing.innerPadY
  const cardH = padY
    + T.font.summaryMeta.size + 14
    + T.font.priceLarge.size + 18
    + T.font.summaryMeta.size
    + padY

  drawCard(ctx, x, y, w, cardH)

  const ix = x + padX
  const rx = x + w - padX

  let cy = y + padY
  drawText(ctx, "折扣价", ix, cy, "summaryMeta", T.color.summaryDim)
  drawText(ctx, summary.discountLabel, rx, cy, "summaryMeta", T.color.brandSoft, "right")
  cy += T.font.summaryMeta.size + 14

  // 大字价格独占主视觉，保留充足留白。
  drawPrice(
    ctx,
    summary.finalAmount,
    ix,
    cy,
    "left",
    "priceLarge",
    T.color.summaryAccent,
    "priceLargeSym",
  )
  cy += T.font.priceLarge.size + 18

  const saved = summary.discountAmount > 0
    ? `已优惠 ¥${summary.discountAmount.toFixed(2)}`
    : "当前无优惠"
  drawText(ctx, saved, ix, cy, "summaryMeta", T.color.summaryDim)
  drawText(ctx, `原价 ¥${summary.originalAmount.toFixed(2)}`, rx, cy, "summaryMeta", T.color.summaryDim, "right")

  return cardH
}

/** 房间报价表：三列单行表格，避免房间多时文字换行挤压。 */
export function drawRoomTable(
  ctx: Ctx,
  rooms: PosterRoom[],
  x: number,
  y: number,
  w: number,
): number {
  const padX = T.spacing.innerPadX
  const padY = T.spacing.innerPadY
  const headerH = 30
  const cardH = padY + T.font.section.size + 18 + headerH + rooms.reduce((sum, room) => sum + measureRoomRowHeight(room), 0) + padY

  drawCard(ctx, x, y, w, cardH)

  const ix = x + padX
  const rx = x + w - padX
  let cy = y + padY

  drawText(ctx, "房间报价", ix, cy, "section", T.color.ink)
  cy += T.font.section.size + 16

  // 表头明确列含义，后续每个房间只占一行。
  drawText(ctx, "房间", ix, cy, "label", T.color.light)
  drawText(ctx, "宽度", x + w * 0.58, cy, "label", T.color.light, "center")
  drawText(ctx, "金额", rx, cy, "label", T.color.light, "right")
  cy += headerH

  rooms.forEach((room, index) => {
    const rowH = measureRoomRowHeight(room)
    if (index > 0) {
      drawDivider(ctx, ix, rx, cy - 9)
    }
    const rowTextY = cy + 9
    const roomName = truncate(ctx, room.name, w * 0.38, "roomName")
    const widthLines = room.widthLabel
      .split("\n")
      .map((line) => truncate(ctx, line, w * 0.26, "roomMeta"))

    drawText(ctx, roomName, ix, rowTextY, "roomName", T.color.ink)
    // 宽度列允许多行，套餐报价可分别展示实际宽度与窗帘类型。
    widthLines.forEach((line, lineIndex) => {
      drawText(ctx, line, x + w * 0.58, rowTextY + 3 + lineIndex * 26, "roomMeta", T.color.muted, "center")
    })
    drawPrice(ctx, room.subtotal, rx, rowTextY - 2, "right", "priceMedium", T.color.ink)
    cy += rowH
  })

  return cardH
}

/** 房间表单行高度：宽度列每多一行，额外增加一行文本高度。 */
function measureRoomRowHeight(room: PosterRoom): number {
  const widthLineCount = Math.max(1, room.widthLabel.split("\n").length)
  return 52 + (widthLineCount - 1) * 26
}

/** 门店固定信息：用于客户保存图片后联系门店。 */
export function drawStoreFooter(
  ctx: Ctx,
  store: PosterStore,
  x: number,
  y: number,
  w: number,
): number {
  const footerText = `门店地址：${store.address}  联系电话：${store.phone}`
  drawText(ctx, truncate(ctx, footerText, w, "footerCaption"), x, y, "footerCaption", T.color.muted)
  return T.font.footerCaption.size
}

import { useEffect, useMemo, useState } from "react"
import Taro, { useRouter, useShareAppMessage } from "@tarojs/taro"
import { Button, Canvas, Text, View } from "@tarojs/components"
import { CurtainButton, PageShell, SectionTitle } from "@/modules/curtain-quote/components/page-shell"
import { calculateQuoteTotals } from "@/modules/curtain-quote/services/quote-calculator"
import { formatDate, formatDiscount, formatMoney, maskPhone } from "@/modules/curtain-quote/services/format"
import { getQuote } from "@/modules/curtain-quote/services/quote-storage"
import type { CurtainQuote } from "@/modules/curtain-quote/types/quote"
import posterBg from "@/assets/curtain/图片背景.png"
import posterLogo from "@/assets/curtain/图标.png"
import discountBadge80 from "@/assets/curtain/8折.png"
import discountBadge85 from "@/assets/curtain/85折.png"
import discountBadge90 from "@/assets/curtain/9折.png"
import discountBadge95 from "@/assets/curtain/95折.png"
import roomBedroom from "@/assets/curtain/主卧.png"
import roomLiving from "@/assets/curtain/客厅.png"
import roomSecondBedroom from "@/assets/curtain/次卧.png"
import roomStudy from "@/assets/curtain/书房.png"
import roomDefault from "@/assets/curtain/默认房间.png"
import "./index.css"

interface ShareLine {
  /** 明细名称。 */
  title: string
  /** 明细尺寸或说明。 */
  meta: string
  /** 主尺寸，保存图片中独立展示。 */
  width: number
  /** 明细金额。 */
  amount: number
}

const POSTER_WIDTH = 941
const POSTER_MIN_HEIGHT = 1180
const POSTER_TOP_HEIGHT = 410
const ROOM_ROW_HEIGHT = 164
const ROOM_ROW_GAP = 18
const SUMMARY_HEIGHT = 190
const FOOTER_HEIGHT = 210
const GREEN = "#435c32"
const DEEP_GREEN = "#213b20"
const SOFT_GREEN = "#6f8153"
const LINE_GREEN = "#aeb69b"
const TEXT = "#202020"
const CARD_FILL = "rgba(255, 253, 247, 0.94)"

/** 将不同报价方式归一成分享页展示明细。 */
function getShareLines(quote: CurtainQuote): ShareLine[] {
  if (quote.mode === "normal") {
    return quote.normalItems.map((item) => ({
      title: item.position,
      meta: `宽度：${item.width.toFixed(2)}m`,
      width: item.width,
      amount: item.amount,
    }))
  }

  return quote.packageItems.map((item) => ({
    title: item.packageName,
    meta: `布宽：${item.fabricWidth.toFixed(2)}m / 纱宽：${item.sheerWidth.toFixed(2)}m`,
    width: item.fabricWidth,
    amount: item.amount,
  }))
}

/** Canvas 文本绘制工具，集中控制报价图片样式。 */
function drawText(ctx: Taro.CanvasContext, text: string, x: number, y: number, size = 26, color = "#4f4f4f", align: "left" | "center" | "right" = "left") {
  ctx.setFillStyle(color)
  ctx.setFontSize(size)
  ctx.setTextAlign(align)
  ctx.setTextBaseline("alphabetic")
  ctx.fillText(text, x, y)
}

function drawRoundedRect(ctx: Taro.CanvasContext, x: number, y: number, width: number, height: number, radius: number, fillStyle: string) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
  ctx.setFillStyle(fillStyle)
  ctx.fill()
}

function drawCard(ctx: Taro.CanvasContext, x: number, y: number, width: number, height: number, radius = 18) {
  drawRoundedRect(ctx, x, y + 6, width, height, radius, "rgba(118, 96, 60, 0.08)")
  drawRoundedRect(ctx, x, y, width, height, radius, CARD_FILL)
  ctx.setStrokeStyle("rgba(143, 128, 99, 0.32)")
  ctx.setLineWidth(1)
  ctx.stroke()
}

function drawDashedLine(ctx: Taro.CanvasContext, x: number, y: number, width: number, dash = 7, gap = 5) {
  ctx.setStrokeStyle(LINE_GREEN)
  ctx.setLineWidth(1)
  ctx.beginPath()
  for (let current = x; current < x + width; current += dash + gap) {
    ctx.moveTo(current, y)
    ctx.lineTo(Math.min(current + dash, x + width), y)
  }
  ctx.stroke()
}

function getRoomImage(title: string): string {
  if (title.includes("客厅")) return roomLiving
  if (title.includes("主卧")) return roomBedroom
  if (title.includes("次卧") || title.includes("儿童房") || title.includes("客房")) return roomSecondBedroom
  if (title.includes("书房") || title.includes("办公")) return roomStudy
  if (title.includes("卧")) return roomBedroom
  return roomDefault
}

function truncateText(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}

function getPosterHeight(lineCount: number): number {
  const rows = Math.max(lineCount, 1)
  return Math.max(POSTER_MIN_HEIGHT, POSTER_TOP_HEIGHT + rows * (ROOM_ROW_HEIGHT + ROOM_ROW_GAP) + SUMMARY_HEIGHT + FOOTER_HEIGHT)
}

function drawBackground(ctx: Taro.CanvasContext, posterHeight: number) {
  ctx.setFillStyle("#fbf4e7")
  ctx.fillRect(0, 0, POSTER_WIDTH, posterHeight)
  ctx.drawImage(posterBg, 0, 0, POSTER_WIDTH, posterHeight)
}

function drawHeader(ctx: Taro.CanvasContext, quote: CurtainQuote) {
  ctx.drawImage(posterLogo, 148, 42, 146, 146)
  drawText(ctx, "窗帘报价单", 315, 126, 70, DEEP_GREEN)
  drawText(ctx, "快速测量 · 自动报价", 323, 176, 31, "#2f4b2a")

  drawCard(ctx, 86, 207, 744, 184)
  ctx.beginPath()
  ctx.arc(208, 298, 62, 0, Math.PI * 2)
  ctx.setFillStyle("#e8e8d4")
  ctx.fill()
  ctx.setFillStyle(GREEN)
  ctx.beginPath()
  ctx.arc(208, 279, 22, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(208, 331, 38, Math.PI, 0)
  ctx.lineTo(246, 344)
  ctx.lineTo(170, 344)
  ctx.closePath()
  ctx.fill()

  ctx.setStrokeStyle("#c9c0a8")
  ctx.setLineWidth(1)
  ctx.beginPath()
  ctx.moveTo(310, 229)
  ctx.lineTo(310, 369)
  ctx.stroke()

  const info = [
    { label: "客户姓名：", value: quote.customer.name },
    { label: "联系电话：", value: maskPhone(quote.customer.phone) },
    { label: "安装地址：", value: quote.customer.address },
    { label: "报价日期：", value: formatDate(quote.updatedAt) },
  ]

  info.forEach((item, index) => {
    const y = 247 + index * 38
    drawRoundedRect(ctx, 337, y - 24, 30, 30, 15, SOFT_GREEN)
    drawText(ctx, item.label, 382, y, 24, TEXT)
    drawText(ctx, truncateText(item.value, index === 2 ? 16 : 14), 506, y, 24, TEXT)
    if (index < info.length - 1) {
      drawDashedLine(ctx, 504, y + 16, 272, 5, 5)
    }
  })
}

function drawRoomRow(ctx: Taro.CanvasContext, line: ShareLine, y: number) {
  drawCard(ctx, 86, y, 744, ROOM_ROW_HEIGHT)
  ctx.drawImage(getRoomImage(line.title), 102, y + 8, 335, 148)

  const label = truncateText(line.title || "通用房间", 5)
  const labelWidth = label.length >= 4 ? 132 : 96
  drawRoundedRect(ctx, 498, y + 14, labelWidth, 36, 12, SOFT_GREEN)
  drawText(ctx, label, 498 + labelWidth / 2, y + 41, 25, "#ffffff", "center")

  ctx.setStrokeStyle(LINE_GREEN)
  ctx.setLineWidth(1)
  ctx.beginPath()
  ctx.moveTo(471, y + 18)
  ctx.lineTo(471, y + 146)
  ctx.stroke()

  drawText(ctx, "宽度", 502, y + 84, 27, TEXT)
  drawText(ctx, `${line.width.toFixed(2)}m`, 777, y + 84, 30, GREEN, "right")
  drawDashedLine(ctx, 502, y + 102, 291)
  drawText(ctx, "金额", 502, y + 142, 27, TEXT)
  drawText(ctx, `¥${formatMoney(line.amount)}`, 785, y + 142, 40, GREEN, "right")
}

function getDiscountBadge(discount: number): string | null {
  if (discount === 0.95) return discountBadge95
  if (discount === 0.9) return discountBadge90
  if (discount === 0.85) return discountBadge85
  if (discount === 0.8) return discountBadge80
  return null
}

function drawDiscountBadge(ctx: Taro.CanvasContext, discount: number, x: number, y: number) {
  if (discount === 1) {
    return
  }

  const badge = getDiscountBadge(discount)
  if (badge) {
    ctx.drawImage(badge, x, y, 142, 142)
    return
  }

  ctx.beginPath()
  ctx.arc(x + 71, y + 71, 62, 0, Math.PI * 2)
  ctx.setFillStyle("#95a67a")
  ctx.fill()
  ctx.setStrokeStyle("#ffffff")
  ctx.setLineWidth(3)
  ctx.beginPath()
  ctx.arc(x + 71, y + 71, 48, 0, Math.PI * 2)
  ctx.stroke()
  drawText(ctx, formatDiscount(discount), x + 71, y + 84, 34, "#ffffff", "center")
}

function drawSummary(ctx: Taro.CanvasContext, quote: CurtainQuote, y: number) {
  drawCard(ctx, 84, y, 752, SUMMARY_HEIGHT)
  drawDiscountBadge(ctx, quote.finalDiscount, 103, y + 22)
  drawText(ctx, "原价合计：", 284, y + 42, 28, TEXT)
  drawText(ctx, `¥${formatMoney(quote.originalTotal)}`, 772, y + 42, 26, TEXT, "right")
  drawDashedLine(ctx, 284, y + 58, 490)
  drawText(ctx, "折扣：", 284, y + 86, 28, TEXT)
  drawText(ctx, formatDiscount(quote.finalDiscount), 761, y + 86, 26, GREEN, "right")
  drawDashedLine(ctx, 284, y + 102, 490)
  drawText(ctx, "最终报价：", 284, y + 158, 34, DEEP_GREEN)
  drawText(ctx, "¥", 462, y + 158, 50, DEEP_GREEN)
  drawText(ctx, formatMoney(quote.finalAmount), 761, y + 158, 68, DEEP_GREEN, "right")
}

function drawFooter(ctx: Taro.CanvasContext, quote: CurtainQuote, y: number) {
  drawRoundedRect(ctx, 190, y, 566, 54, 16, CARD_FILL)
  drawRoundedRect(ctx, 218, y + 12, 30, 30, 15, SOFT_GREEN)
  const remark = quote.customer.remark.trim() || "报价以实际测量及最终确认为准"
  drawText(ctx, `备注：${truncateText(remark, 18)}`, 281, y + 36, 22, TEXT)
  drawText(ctx, "感谢您的咨询", 470, y + 110, 38, DEEP_GREEN, "center")
  drawText(ctx, "如需修改方案，请联系门店顾问", 470, y + 142, 18, TEXT, "center")
}

function drawPoster(ctx: Taro.CanvasContext, quote: CurtainQuote, lines: ShareLine[], posterHeight: number) {
  drawBackground(ctx, posterHeight)
  drawHeader(ctx, quote)

  const rowStartY = 425
  if (lines.length === 0) {
    drawCard(ctx, 86, rowStartY, 744, 140)
    drawText(ctx, "暂无报价明细", 470, rowStartY + 82, 30, "#6b715e", "center")
  } else {
    lines.forEach((line, index) => {
      drawRoomRow(ctx, line, rowStartY + index * (ROOM_ROW_HEIGHT + ROOM_ROW_GAP))
    })
  }

  const rows = Math.max(lines.length, 1)
  const summaryY = rowStartY + rows * (ROOM_ROW_HEIGHT + ROOM_ROW_GAP) + 16
  drawSummary(ctx, quote, summaryY)
  drawFooter(ctx, quote, summaryY + SUMMARY_HEIGHT + 26)
}

export default function QuoteSharePage() {
  const router = useRouter()
  const quoteId = String(router.params.id ?? "")
  const [quote, setQuote] = useState<CurtainQuote | null>(null)

  useEffect(() => {
    if (quoteId) {
      void getQuote(quoteId).then((result) => {
        setQuote(result ? calculateQuoteTotals(result) : null)
      })
    }
  }, [quoteId])

  const shareLines = useMemo(() => (quote ? getShareLines(quote) : []), [quote])
  const posterHeight = useMemo(() => getPosterHeight(shareLines.length), [shareLines.length])

  useShareAppMessage(() => ({
    title: quote ? `${quote.customer.name}的窗帘报价单` : "窗帘报价单",
    path: quote ? `/pages/quote-share/index?id=${quote.id}` : "/pages/home/index",
  }))

  const saveImage = async () => {
    if (!quote) {
      return
    }

    const ctx = Taro.createCanvasContext("quote-share-canvas")
    drawPoster(ctx, quote, shareLines, posterHeight)

    ctx.draw(false, () => {
      Taro.canvasToTempFilePath({
        canvasId: "quote-share-canvas",
        width: POSTER_WIDTH,
        height: posterHeight,
        destWidth: POSTER_WIDTH * 2,
        destHeight: posterHeight * 2,
        success: (result) => {
          void Taro.saveImageToPhotosAlbum({
            filePath: result.tempFilePath,
            success: () => Taro.showToast({ title: "图片已保存", icon: "success" }),
            fail: () => Taro.showToast({ title: "保存图片失败", icon: "none" }),
          })
        },
        fail: () => {
          void Taro.showToast({ title: "生成图片失败", icon: "none" })
        },
      })
    })
  }

  const sendToCustomer = async () => {
    await Taro.showToast({ title: "请点击右上角分享", icon: "none" })
  }

  return (
    <PageShell title="窗帘报价单" showBack paddedBottom>
      {quote && (
        <View className="share-page">
          <View className="share-card cq-card">
            <Text className="share-title">窗帘报价单</Text>
            <View className="share-block">
              <Text>客户：{quote.customer.name}</Text>
              <Text>电话：{maskPhone(quote.customer.phone)}</Text>
              <Text>地址：{quote.customer.address}</Text>
              <Text>日期：{formatDate(quote.updatedAt)}</Text>
            </View>
            <View className="share-divider" />
            <SectionTitle>报价明细</SectionTitle>
            <View className="share-lines">
              {shareLines.map((line, index) => (
                <View className="share-line" key={`${line.title}-${index}`}>
                  <Text className="share-line__title">{index + 1}. {line.title}</Text>
                  <Text className="share-line__meta">{line.meta}</Text>
                  <Text className="share-line__amount">金额：¥{formatMoney(line.amount)}</Text>
                </View>
              ))}
            </View>
            <View className="share-divider" />
            <View className="share-total-line">
              <Text>原价合计：</Text>
              <Text>¥{formatMoney(quote.originalTotal)}</Text>
            </View>
            <View className="share-total-line">
              <Text>折扣：</Text>
              <Text>{formatDiscount(quote.finalDiscount)}</Text>
            </View>
            <View className="share-final">
              <Text>最终报价</Text>
              <Text>¥{formatMoney(quote.finalAmount)}</Text>
            </View>
            <View className="share-remark">备注：报价以实际确认为准</View>
          </View>
          <View className="share-actions">
            <CurtainButton variant="outline" onClick={saveImage}>
              保存图片
            </CurtainButton>
            <Button className="share-send-button" openType="share" onClick={sendToCustomer}>
              发送给客户
            </Button>
          </View>
          <Canvas canvasId="quote-share-canvas" className="share-canvas" style={{ width: `${POSTER_WIDTH}px`, height: `${posterHeight}px` }} />
        </View>
      )}
    </PageShell>
  )
}

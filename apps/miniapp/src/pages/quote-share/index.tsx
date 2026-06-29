import { useEffect, useMemo, useState } from "react"
import Taro, { useRouter, useShareAppMessage } from "@tarojs/taro"
import { Button, Canvas, Text, View } from "@tarojs/components"
import { CurtainButton, PageShell, SectionTitle } from "@/modules/curtain-quote/components/page-shell"
import { calculateQuoteTotals } from "@/modules/curtain-quote/services/quote-calculator"
import { formatDate, formatDiscount, formatMoney, maskPhone } from "@/modules/curtain-quote/services/format"
import { getQuote } from "@/modules/curtain-quote/services/quote-storage"
import type { CurtainQuote } from "@/modules/curtain-quote/types/quote"
import "./index.css"

interface ShareLine {
  /** 明细名称。 */
  title: string
  /** 明细尺寸或说明。 */
  meta: string
  /** 明细金额。 */
  amount: number
}

/** 将不同报价方式归一成分享页展示明细。 */
function getShareLines(quote: CurtainQuote): ShareLine[] {
  if (quote.mode === "normal") {
    return quote.normalItems.map((item) => ({
      title: item.position,
      meta: `宽度：${item.width.toFixed(2)}m`,
      amount: item.amount,
    }))
  }

  return quote.packageItems.map((item) => ({
    title: item.packageName,
    meta: `布宽：${item.fabricWidth.toFixed(2)}m / 纱宽：${item.sheerWidth.toFixed(2)}m`,
    amount: item.amount,
  }))
}

/** Canvas 文本绘制工具，集中控制报价图片样式。 */
function drawText(ctx: Taro.CanvasContext, text: string, x: number, y: number, size = 26, color = "#4f4f4f", bold = false) {
  ctx.setFillStyle(color)
  ctx.setFontSize(size)
  ctx.fillText(text, x, y)
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

  useShareAppMessage(() => ({
    title: quote ? `${quote.customer.name}的窗帘报价单` : "窗帘报价单",
    path: quote ? `/pages/quote-share/index?id=${quote.id}` : "/pages/home/index",
  }))

  const saveImage = async () => {
    if (!quote) {
      return
    }

    const ctx = Taro.createCanvasContext("quote-share-canvas")
    ctx.setFillStyle("#fffdf8")
    ctx.fillRect(0, 0, 750, 1100)
    ctx.setFillStyle("#f2f1e7")
    ctx.fillRect(28, 28, 694, 1044)
    ctx.setFillStyle("#ffffff")
    ctx.fillRect(48, 48, 654, 1004)
    drawText(ctx, "窗帘报价单", 76, 110, 44, "#40522e", true)
    drawText(ctx, `客户：${quote.customer.name}`, 76, 178)
    drawText(ctx, `电话：${maskPhone(quote.customer.phone)}`, 76, 222)
    drawText(ctx, `地址：${quote.customer.address}`, 76, 266)
    drawText(ctx, `日期：${formatDate(quote.updatedAt)}`, 76, 310)
    drawText(ctx, "报价明细", 76, 382, 32, "#111111", true)

    let y = 438
    shareLines.forEach((line, index) => {
      drawText(ctx, `${index + 1}. ${line.title}`, 86, y, 28, "#111111", true)
      drawText(ctx, line.meta, 112, y + 42, 24, "#666666")
      drawText(ctx, `金额：¥${formatMoney(line.amount)}`, 112, y + 82, 24, "#40522e")
      y += 122
    })

    const summaryY = Math.max(y + 10, 720)
    drawText(ctx, `原价合计：¥${formatMoney(quote.originalTotal)}`, 76, summaryY, 28, "#666666")
    drawText(ctx, `折扣：${formatDiscount(quote.finalDiscount)}`, 76, summaryY + 48, 28, "#666666")
    drawText(ctx, `最终报价：¥${formatMoney(quote.finalAmount)}`, 76, summaryY + 116, 42, "#40522e", true)
    drawText(ctx, "备注：报价以实际确认为准", 76, 984, 24, "#8a8a8a")

    ctx.draw(false, () => {
      Taro.canvasToTempFilePath({
        canvasId: "quote-share-canvas",
        width: 750,
        height: 1100,
        destWidth: 1500,
        destHeight: 2200,
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
          <Canvas canvasId="quote-share-canvas" className="share-canvas" />
        </View>
      )}
    </PageShell>
  )
}


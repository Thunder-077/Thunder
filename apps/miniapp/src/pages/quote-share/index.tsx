import { useEffect, useMemo, useState } from "react"
import Taro, { useRouter, useShareAppMessage } from "@tarojs/taro"
import { Button, Canvas, Image, Text, View } from "@tarojs/components"
import { CurtainButton, PageShell } from "@/modules/curtain-quote/components/page-shell"
import { IconSymbol } from "@/modules/curtain-quote/components/icon-symbol"
import { DISCOUNT_OPTIONS } from "@/modules/curtain-quote/data/discounts"
import { calculateQuoteTotals } from "@/modules/curtain-quote/services/quote-calculator"
import { formatDate, formatMoney, maskPhone } from "@/modules/curtain-quote/services/format"
import { getRoomThumb } from "@/modules/curtain-quote/services/room-thumb"
import { getQuote } from "@/modules/curtain-quote/services/quote-storage"
import type { CurtainQuote } from "@/modules/curtain-quote/types/quote"
import { theme } from "@/modules/curtain-quote/poster/theme"
import {
  buildPosterData,
  getPosterHeight,
  drawPoster,
  createMockPosterData,
} from "@/modules/curtain-quote/poster/builder"
import thumbLiving from "@/assets/curtain/客厅.jpg"
import "./index.css"

/** 生成报价海报图片并返回临时文件路径。 */
async function generatePosterImage(
  posterHeight: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): Promise<string> {
  // 1. 通过 SelectorQuery 获取 Canvas 2D 节点
  const canvasNode = await new Promise<any>((resolve, reject) => {
    Taro.createSelectorQuery()
      .select("#poster-canvas")
      .fields({ node: true })
      .exec((res) => {
        if (!res?.[0]?.node) {
          reject(new Error("canvas node not found"))
          return
        }
        resolve(res[0].node)
      })
  })

  // 2. 初始化 2D 上下文 + DPR 缩放
  const ctx = canvasNode.getContext("2d") as CanvasRenderingContext2D
  const dpr = Taro.getSystemInfoSync().pixelRatio
  const w = theme.width
  const h = posterHeight
  canvasNode.width = w * dpr
  canvasNode.height = h * dpr
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, w, h)

  // 3. 绘制海报
  draw(ctx)

  // 4. 等待一帧确保栅格化完成
  await new Promise<void>((r) => setTimeout(r, 100))

  // 5. 导出临时文件
  const result = await Taro.canvasToTempFilePath({
    canvas: canvasNode,
    x: 0,
    y: 0,
    width: w,
    height: h,
    destWidth: w * dpr,
    destHeight: h * dpr,
    fileType: "png",
  })
  return result.tempFilePath
}

export default function QuoteSharePage() {
  const router = useRouter()
  const quoteId = String(router.params.id ?? "")
  const [quote, setQuote] = useState<CurtainQuote | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (quoteId) {
      void getQuote(quoteId).then((result) => {
        setQuote(result ? calculateQuoteTotals(result) : null)
      })
    }
  }, [quoteId])

  const posterData = useMemo(
    () => (quote ? buildPosterData(quote) : createMockPosterData()),
    [quote],
  )
  const posterHeight = useMemo(() => getPosterHeight(posterData), [posterData])

  useShareAppMessage(() => ({
    title: quote ? `${quote.customer.name}的窗帘报价单` : "窗帘报价单",
    path: quote ? `/pages/quote-share/index?id=${quote.id}` : "/pages/home/index",
  }))

  const handleSave = async () => {
    if (busy) return
    setBusy(true)
    await Taro.showLoading({ title: "保存中", mask: true })
    try {
      const tempPath = await generatePosterImage(posterHeight, (ctx) =>
        drawPoster(ctx, posterData),
      )
      await Taro.saveImageToPhotosAlbum({ filePath: tempPath })
      await Taro.showToast({ title: "图片已保存", icon: "success" })
    } catch (error: any) {
      console.error("save quote image failed", error)
      const msg = String(error?.errMsg || "")
      if (msg.includes("auth deny") || msg.includes("authorize")) {
        const res = await Taro.showModal({
          title: "需要相册权限",
          content: "请在设置中开启相册权限以保存图片到本地",
          confirmText: "去设置",
        })
        if (res.confirm) {
          await Taro.openSetting()
        }
      } else {
        await Taro.showToast({ title: "保存图片失败", icon: "none" })
      }
    } finally {
      await Taro.hideLoading()
      setBusy(false)
    }
  }

  const sendToCustomer = async () => {
    await Taro.showToast({ title: "请点击右上角分享", icon: "none" })
  }

  const finishAndReturnHome = async () => {
    await Taro.reLaunch({ url: "/pages/home/index" })
  }

  return (
    <PageShell title="窗帘报价单" showBack paddedBottom>
      {quote && (
        <View className="detail-page">
          <View className="detail-status">
            <Text className="detail-status__pill detail-status__pill--confirmed">已确认</Text>
          </View>

          <View className="summary-customer cq-card">
            <View className="summary-customer__avatar"><IconSymbol name="userWhite" /></View>
            <View className="summary-customer__info">
              <View className="summary-customer__top">
                <Text className="summary-customer__name">{quote.customer.name}</Text>
                <Text>{maskPhone(quote.customer.phone)}</Text>
              </View>
              <View className="summary-customer__addr">
                <IconSymbol className="summary-customer__pin" name="location" />
                <Text>{quote.customer.address}</Text>
              </View>
            </View>
          </View>

          <View className="summary-items">
            {quote.mode === "normal" &&
              quote.normalItems.map((item) => (
                <View className="summary-item cq-card" key={item.id}>
                  <Image className="summary-item__image" mode="aspectFill" src={getRoomThumb(item.position)} />
                  <View className="summary-item__content">
                    <Text className="summary-item__title">{item.position}</Text>
                    <Text className="summary-item__line">宽度： {item.width.toFixed(2)}米</Text>
                    <Text className="summary-item__line">预算： ¥{formatMoney(item.amount)}</Text>
                  </View>
                </View>
              ))}
            {quote.mode === "package" &&
              quote.packageItems.map((item) => (
                <View className="summary-item cq-card" key={item.id}>
                  <Image className="summary-item__image" mode="aspectFill" src={thumbLiving} />
                  <View className="summary-item__content">
                    <Text className="summary-item__title">{item.packageName}</Text>
                    <Text className="summary-item__line">布宽： {item.fabricWidth.toFixed(2)}米</Text>
                    <Text className="summary-item__line">预算： ¥{formatMoney(item.amount)}</Text>
                  </View>
                </View>
              ))}
          </View>

          <View className="summary-discount cq-card">
            <View className="summary-discount__lines">
              <View className="summary-discount__line">
                <Text>原价合计：</Text>
                <Text className="cq-price">¥{formatMoney(quote.originalTotal)}</Text>
              </View>
              <View className="summary-discount__line">
                <Text>报价方式：</Text>
                <Text>{quote.mode === "normal" ? "普通报价" : "套餐报价"}</Text>
              </View>
              <View className="summary-discount__line">
                <Text>报价日期：</Text>
                <Text>{formatDate(quote.updatedAt)}</Text>
              </View>
              {quote.finalDiscount !== 1 ? (() => {
                const selectedOption = DISCOUNT_OPTIONS.find((option) => option.value === quote.finalDiscount)
                if (!selectedOption) {
                  return null
                }

                return (
                  <View className="summary-discount__line is-active" key={selectedOption.value}>
                    <Text>{selectedOption.label}：</Text>
                    <Text className="cq-price">¥{formatMoney(quote.originalTotal * selectedOption.value)}</Text>
                  </View>
                )
              })() : null}
            </View>
          </View>

          <View className="summary-final">
            <Text>最终报价</Text>
            <Text className="cq-price">¥ {formatMoney(quote.finalAmount)}</Text>
          </View>

          <View className="detail-actions">
            <CurtainButton onClick={handleSave}>保存图片</CurtainButton>
            <Button className="share-send-button" openType="share" onClick={sendToCustomer}>
              报价分享
            </Button>
            <Button className="share-home-button" onClick={finishAndReturnHome}>
              返回首页
            </Button>
          </View>

          {/* Canvas 2D 离屏画布：仅用于生成分享图，不展示给用户 */}
          <Canvas
            type="2d"
            id="poster-canvas"
            className="share-canvas"
            style={{
              width: `${theme.width}px`,
              height: `${posterHeight}px`,
            }}
          />
        </View>
      )}
    </PageShell>
  )
}

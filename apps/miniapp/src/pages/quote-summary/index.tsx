import { useEffect, useMemo, useState } from "react"
import Taro, { useDidShow, useRouter } from "@tarojs/taro"
import { Button, Image, Text, View } from "@tarojs/components"
import { CurtainButton, PageShell } from "@/modules/curtain-quote/components/page-shell"
import { IconSymbol } from "@/modules/curtain-quote/components/icon-symbol"
import { DISCOUNT_OPTIONS } from "@/modules/curtain-quote/data/discounts"
import { calculateQuoteTotals } from "@/modules/curtain-quote/services/quote-calculator"
import { formatMoney, maskPhone } from "@/modules/curtain-quote/services/format"
import { getQuote, saveQuote, updateQuoteStatus } from "@/modules/curtain-quote/services/quote-storage"
import type { CurtainQuote } from "@/modules/curtain-quote/types/quote"
import thumbBedroom from "@/assets/curtain/thumb-bedroom.jpg"
import thumbLiving from "@/assets/curtain/thumb-living.jpg"
import thumbSecondBedroom from "@/assets/curtain/thumb-second-bedroom.jpg"
import thumbStudy from "@/assets/curtain/thumb-study.jpg"
import thumbRoom from "@/assets/curtain/thumb-room.jpg"
import "./index.css"

/** 根据房间名称选择对应素材，未知房间使用通用房间图。 */
function getRoomThumb(position: string): string {
  if (position.includes("客厅")) {
    return thumbLiving
  }

  if (position.includes("主卧")) {
    return thumbBedroom
  }

  if (position.includes("次卧") || position.includes("儿童房") || position.includes("客房")) {
    return thumbSecondBedroom
  }

  if (position.includes("卧")) {
    return thumbBedroom
  }

  if (position.includes("书房") || position.includes("办公")) {
    return thumbStudy
  }

  return thumbRoom
}

export default function QuoteSummaryPage() {
  const router = useRouter()
  const quoteId = String(router.params.id ?? "")
  const [quote, setQuote] = useState<CurtainQuote | null>(null)

  useEffect(() => {
    if (quoteId) {
      void getQuote(quoteId).then(setQuote)
    }
  }, [quoteId])

  useDidShow(() => {
    if (quoteId) {
      void getQuote(quoteId).then(setQuote)
    }
  })

  const calculatedQuote = useMemo(() => (quote ? calculateQuoteTotals(quote) : null), [quote])

  const selectDiscount = async (discount: number) => {
    if (!quote) {
      return
    }

    const updated = await saveQuote({ ...quote, finalDiscount: discount })
    setQuote(updated)
  }

  const saveConfirmed = async () => {
    if (!quote) {
      return
    }

    const updated = await updateQuoteStatus(quote.id, "confirmed")
    if (updated) {
      setQuote(updated)
      await Taro.showToast({ title: "报价已保存", icon: "success" })
    }
  }

  const shareQuote = async () => {
    if (!calculatedQuote || calculatedQuote.status !== "confirmed") {
      await Taro.showToast({ title: "请先保存报价后再分享", icon: "none" })
      return
    }

    await Taro.navigateTo({ url: `/pages/quote-share/index?id=${calculatedQuote.id}` })
  }

  return (
    <PageShell title="报价汇总" showBack paddedBottom>
      {calculatedQuote && (
        <View className="summary-page">
          <View className="summary-customer cq-card">
            <View className="summary-customer__avatar"><IconSymbol name="userWhite" /></View>
            <View className="summary-customer__info">
              <View className="summary-customer__top">
                <Text className="summary-customer__name">{calculatedQuote.customer.name}</Text>
                <Text>{maskPhone(calculatedQuote.customer.phone)}</Text>
              </View>
              <View className="summary-customer__addr">
                <IconSymbol className="summary-customer__pin" name="location" />
                <Text>{calculatedQuote.customer.address}</Text>
              </View>
            </View>
          </View>
          <View className="summary-items">
            {calculatedQuote.mode === "normal" &&
              calculatedQuote.normalItems.map((item, index) => (
                <View className="summary-item cq-card" key={item.id}>
                  <Image className="summary-item__image" mode="aspectFill" src={getRoomThumb(item.position)} />
                  <View className="summary-item__content">
                    <Text className="summary-item__title">{item.position}</Text>
                    <Text className="summary-item__line">宽度： {item.width.toFixed(2)}m</Text>
                    <Text className="summary-item__line">预算： ¥{formatMoney(item.amount)}</Text>
                  </View>
                </View>
              ))}
            {calculatedQuote.mode === "package" &&
              calculatedQuote.packageItems.map((item) => (
                <View className="summary-item cq-card" key={item.id}>
                  <Image className="summary-item__image" mode="aspectFill" src={thumbLiving} />
                  <View className="summary-item__content">
                    <Text className="summary-item__title">{item.packageName}</Text>
                    <Text className="summary-item__line">布宽： {item.fabricWidth.toFixed(2)}m</Text>
                    <Text className="summary-item__line">预算： ¥{formatMoney(item.amount)}</Text>
                  </View>
                </View>
              ))}
          </View>
          <View className="summary-discount cq-card">
            <View className="summary-discount__lines">
              <View className="summary-discount__line">
                <Text>原价合计：</Text>
                <Text className="cq-price">¥{formatMoney(calculatedQuote.originalTotal)}</Text>
              </View>
              {calculatedQuote.finalDiscount !== 1 ? (() => {
                const selectedOption = DISCOUNT_OPTIONS.find((o) => o.value === calculatedQuote.finalDiscount)
                if (!selectedOption) return null
                return (
                  <View className="summary-discount__line is-active" key={selectedOption.value}>
                    <Text>{selectedOption.label}：</Text>
                    <Text className="cq-price">¥{formatMoney(calculatedQuote.originalTotal * selectedOption.value)}</Text>
                  </View>
                )
              })() : null}
            </View>
            <View className="summary-discount__buttons">
              {DISCOUNT_OPTIONS.map((option) => (
                <Button className={`summary-discount__button ${calculatedQuote.finalDiscount === option.value ? "is-active" : ""}`} key={option.value} onClick={() => selectDiscount(option.value)}>
                  {option.label}
                  {calculatedQuote.finalDiscount === option.value ? <Text className="summary-discount__check">✓</Text> : null}
                </Button>
              ))}
            </View>
          </View>
          <View className="summary-final">
            <Text>最终报价</Text>
            <Text className="cq-price">¥ {formatMoney(calculatedQuote.finalAmount)}</Text>
          </View>
          <View className="summary-footer-buttons">
            <CurtainButton variant="outline" onClick={saveConfirmed}>
              保存报价
            </CurtainButton>
            <CurtainButton onClick={shareQuote}>分享报价</CurtainButton>
          </View>
        </View>
      )}
    </PageShell>
  )
}

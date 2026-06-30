import { useEffect, useMemo, useState } from "react"
import Taro, { useDidShow, useRouter } from "@tarojs/taro"
import { Button, Image, Text, View } from "@tarojs/components"
import { CurtainButton, PageShell } from "@/modules/curtain-quote/components/page-shell"
import { IconSymbol } from "@/modules/curtain-quote/components/icon-symbol"
import { DISCOUNT_OPTIONS } from "@/modules/curtain-quote/data/discounts"
import { calculateQuoteTotals } from "@/modules/curtain-quote/services/quote-calculator"
import { formatDate, formatDiscount, formatMoney, maskPhone } from "@/modules/curtain-quote/services/format"
import { deleteQuote, getQuote, updateQuoteStatus } from "@/modules/curtain-quote/services/quote-storage"
import type { CurtainQuote } from "@/modules/curtain-quote/types/quote"
import thumbBedroom from "@/assets/curtain/主卧.png"
import thumbLiving from "@/assets/curtain/客厅.png"
import thumbSecondBedroom from "@/assets/curtain/次卧.png"
import thumbStudy from "@/assets/curtain/书房.png"
import thumbRoom from "@/assets/curtain/默认房间.png"
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

export default function QuoteDetailPage() {
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

  const continueEdit = () => {
    if (!calculatedQuote) {
      return
    }

    const url = calculatedQuote.mode === "normal" ? `/pages/quote-normal/index?id=${calculatedQuote.id}` : `/pages/quote-package/index?id=${calculatedQuote.id}`
    void Taro.navigateTo({ url })
  }

  const shareQuote = async () => {
    if (!calculatedQuote || calculatedQuote.status !== "confirmed") {
      await Taro.showToast({ title: "请先保存报价后再分享", icon: "none" })
      return
    }

    await Taro.navigateTo({ url: `/pages/quote-share/index?id=${calculatedQuote.id}` })
  }

  const confirmQuote = async () => {
    if (!calculatedQuote) {
      return
    }

    const updated = await updateQuoteStatus(calculatedQuote.id, "confirmed")
    if (updated) {
      setQuote(updated)
      await Taro.showToast({ title: "报价已确认", icon: "success" })
    }
  }

  const removeQuote = async () => {
    if (!calculatedQuote) {
      return
    }

    const result = await Taro.showModal({ title: "删除报价", content: "确认删除该报价？删除后不可恢复。" })
    if (result.confirm) {
      await deleteQuote(calculatedQuote.id)
      await Taro.showToast({ title: "已删除", icon: "success" })
      void Taro.navigateBack()
    }
  }

  return (
    <PageShell title="报价详情" showBack paddedBottom>
      {calculatedQuote && (
        <View className="detail-page">
          <View className="detail-status">
            <Text className={`detail-status__pill detail-status__pill--${calculatedQuote.status}`}>
              {calculatedQuote.status === "confirmed" ? "已确认" : "草稿"}
            </Text>
          </View>

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
              calculatedQuote.normalItems.map((item) => (
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
              <View className="summary-discount__line">
                <Text>报价方式：</Text>
                <Text>{calculatedQuote.mode === "normal" ? "普通报价" : "套餐报价"}</Text>
              </View>
              <View className="summary-discount__line">
                <Text>报价日期：</Text>
                <Text>{formatDate(calculatedQuote.createdAt)}</Text>
              </View>
              {calculatedQuote.finalDiscount !== 1 ? (() => {
                const selectedOption = DISCOUNT_OPTIONS.find((option) => option.value === calculatedQuote.finalDiscount)
                if (!selectedOption) {
                  return null
                }

                return (
                  <View className="summary-discount__line is-active" key={selectedOption.value}>
                    <Text>{selectedOption.label}：</Text>
                    <Text className="cq-price">¥{formatMoney(calculatedQuote.originalTotal * selectedOption.value)}</Text>
                  </View>
                )
              })() : null}
            </View>
          </View>

          <View className="summary-final">
            <Text>最终报价</Text>
            <Text className="cq-price">¥ {formatMoney(calculatedQuote.finalAmount)}</Text>
          </View>

          <View className="detail-actions">
            <CurtainButton variant="outline" onClick={continueEdit}>
              继续编辑
            </CurtainButton>
            <CurtainButton onClick={shareQuote}>分享报价</CurtainButton>
            <Button className="detail-action-secondary" onClick={confirmQuote}>
              确认报价
            </Button>
            <Button className="detail-action-danger" onClick={removeQuote}>
              删除报价
            </Button>
          </View>
        </View>
      )}
    </PageShell>
  )
}

import { useEffect, useState } from "react"
import Taro, { useDidShow, useRouter } from "@tarojs/taro"
import { Image, Text, View } from "@tarojs/components"
import { CurtainButton, PageShell } from "@/modules/curtain-quote/components/page-shell"
import { IconSymbol } from "@/modules/curtain-quote/components/icon-symbol"
import { maskPhone } from "@/modules/curtain-quote/services/format"
import { getQuote, updateQuoteMode } from "@/modules/curtain-quote/services/quote-storage"
import type { CurtainQuote, CurtainQuoteMode } from "@/modules/curtain-quote/types/quote"
import modeNormal from "@/assets/curtain/mode-normal.svg"
import modePackage from "@/assets/curtain/mode-package.svg"
import "./index.css"

export default function QuoteModePage() {
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

  const chooseMode = async (mode: CurtainQuoteMode) => {
    const updated = await updateQuoteMode(quoteId, mode)
    if (!updated) {
      await Taro.showToast({ title: "报价不存在", icon: "none" })
      return
    }

    await Taro.redirectTo({ url: mode === "normal" ? `/pages/quote-normal/index?id=${quoteId}` : `/pages/quote-package/index?id=${quoteId}` })
  }

  return (
    <PageShell title="选择报价方式" showBack paddedBottom>
      <View className="mode-page">
        {quote && (
          <View className="mode-customer cq-card">
            <View className="mode-customer__avatar"><IconSymbol name="userWhite" /></View>
            <View>
              <Text className="mode-customer__line">客户：{quote.customer.name}</Text>
              <Text className="mode-customer__line mode-customer__phone">电话：{maskPhone(quote.customer.phone)}</Text>
            </View>
          </View>
        )}
        <View className="mode-card cq-card">
          <View className="mode-card__content">
            <View>
              <Text className="mode-card__title">普通报价</Text>
              <Text className="mode-card__desc">按房间尺寸、单价、辅料</Text>
              <Text className="mode-card__desc">和安装费逐项计算</Text>
            </View>
            <Image className="mode-card__image" mode="aspectFit" src={modeNormal} />
          </View>
          <CurtainButton onClick={() => chooseMode("normal")}>选择</CurtainButton>
        </View>
        <View className="mode-card cq-card">
          <View className="mode-card__content">
            <View>
              <Text className="mode-card__title">套餐报价</Text>
              <Text className="mode-card__desc">选择套餐后，根据宽度</Text>
              <Text className="mode-card__desc">和窗帘类型自动计算差额费用</Text>
            </View>
            <Image className="mode-card__image" mode="aspectFit" src={modePackage} />
          </View>
          <CurtainButton onClick={() => chooseMode("package")}>选择</CurtainButton>
        </View>
      </View>
    </PageShell>
  )
}

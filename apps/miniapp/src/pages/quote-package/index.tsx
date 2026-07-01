import { useEffect, useMemo, useState } from "react"
import Taro, { useDidShow, useRouter } from "@tarojs/taro"
import { Input, Picker, Text, View } from "@tarojs/components"
import type { BaseEventOrig, InputProps } from "@tarojs/components"
import { CurtainButton, PageShell } from "@/modules/curtain-quote/components/page-shell"
import { IconSymbol } from "@/modules/curtain-quote/components/icon-symbol"
import { PACKAGE_PRESETS } from "@/modules/curtain-quote/data/package-presets"
import { calculatePackageItem, calculateQuoteTotals } from "@/modules/curtain-quote/services/quote-calculator"
import { formatAdjustment, formatMoney, maskPhone } from "@/modules/curtain-quote/services/format"
import { getQuote, saveQuote } from "@/modules/curtain-quote/services/quote-storage"
import { parseNonNegativeNumber, sanitizeNumberInput } from "@/modules/curtain-quote/services/validation"
import type { CurtainQuote, PackageQuoteItem } from "@/modules/curtain-quote/types/quote"
import "./index.css"

export default function QuotePackagePage() {
  const router = useRouter()
  const quoteId = String(router.params.id ?? "")
  const [quote, setQuote] = useState<CurtainQuote | null>(null)
  const [rawInputs, setRawInputs] = useState<Record<string, string>>({})

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

  const item = quote?.packageItems[0] ?? null
  const previewQuote = useMemo(() => (quote ? calculateQuoteTotals({ ...quote, mode: "package" }) : null), [quote])
  const packageNames = PACKAGE_PRESETS.map((preset) => preset.name)

  const persistItem = async (nextItem: PackageQuoteItem) => {
    if (!quote) {
      return
    }

    const updated = await saveQuote({ ...quote, mode: "package", packageItems: [nextItem] })
    setQuote(updated)
  }

  const updatePackageName = (event: BaseEventOrig<{ value: string | number | string[] }>) => {
    if (!item) {
      return
    }

    const index = Number(event.detail.value)
    const packageName = packageNames[index] ?? item.packageName
    void persistItem(calculatePackageItem({ ...item, packageName }))
  }

  const updateWidth = (field: "fabricWidth" | "sheerWidth") => (event: BaseEventOrig<InputProps.inputEventDetail>) => {
    if (!item) {
      return
    }

    const raw = sanitizeNumberInput(event.detail.value)
    setRawInputs((prev) => ({ ...prev, [field]: raw }))

    void persistItem(
      calculatePackageItem({
        ...item,
        [field]: parseNonNegativeNumber(raw),
      }),
    )
  }

  /** 宽度输入展示值：与普通报价宽高一致，真实 0 交给 placeholder 展示。 */
  const getWidthInputValue = (field: "fabricWidth" | "sheerWidth") => {
    if (!item) {
      return ""
    }

    const raw = rawInputs[field]
    if (raw !== undefined) {
      return raw
    }

    return item[field] === 0 ? "" : String(item[field])
  }

  const goSummary = () => {
    if (quote) {
      void Taro.navigateTo({ url: `/pages/quote-summary/index?id=${quote.id}` })
    }
  }

  return (
    <PageShell title="套餐报价" showBack paddedBottom>
      <View className="package-page">
        {quote && (
          <View className="calc-customer">
            <IconSymbol className="calc-customer__icon" name="user" />
            <Text>客户：{quote.customer.name}</Text>
            <Text>{maskPhone(quote.customer.phone)}</Text>
          </View>
        )}
        {item && (
          <>
            <View className="package-card cq-card">
              <Picker mode="selector" range={packageNames} value={packageNames.indexOf(item.packageName)} onChange={updatePackageName}>
                <View className="package-picker">
                  <Text>{item.packageName}</Text>
                  <View className="package-picker__arrow" />
                </View>
              </Picker>
              <View className="package-base">
                <Text>套餐基础价</Text>
                <Text className="cq-price">¥ {formatMoney(item.basePrice)}</Text>
              </View>
            </View>
            <View className="package-width-card cq-card">
              <View className="package-width">
                <Text className="package-width__label">布宽</Text>
                <View className="package-width__input-row">
                  <Input className="package-width__input" type="digit" placeholder="0.00" value={getWidthInputValue("fabricWidth")} onInput={updateWidth("fabricWidth")} />
                  <Text>m</Text>
                </View>
              </View>
              <View className="package-width__divider" />
              <View className="package-width">
                <Text className="package-width__label">纱宽</Text>
                <View className="package-width__input-row">
                  <Input className="package-width__input" type="digit" placeholder="0.00" value={getWidthInputValue("sheerWidth")} onInput={updateWidth("sheerWidth")} />
                  <Text>m</Text>
                </View>
              </View>
            </View>
            <View className="package-detail cq-card">
              <View className="package-section-title">
                <Text className="package-section-title__bar" />
                <Text>用量明细</Text>
              </View>
              <View className="package-detail__line">
                <Text>布实际用量：</Text>
                <Text>{item.fabricUsage.toFixed(2)} m</Text>
              </View>
              <View className="package-detail__line">
                <Text>纱实际用量：</Text>
                <Text>{item.sheerUsage.toFixed(2)} m</Text>
              </View>
              <View className="package-detail__line">
                <Text>轨道长度：</Text>
                <Text>{item.trackLength.toFixed(2)} m</Text>
              </View>
            </View>
            <View className="package-detail cq-card">
              <View className="package-section-title">
                <Text className="package-section-title__bar" />
                <Text>费用调整</Text>
              </View>
              <View className="package-detail__line">
                <Text>布调整：</Text>
                <Text className="cq-price">{formatAdjustment(item.fabricAdjustment)}</Text>
              </View>
              <View className="package-detail__line">
                <Text>纱调整：</Text>
                <Text className="cq-price">{formatAdjustment(item.sheerAdjustment)}</Text>
              </View>
              <View className="package-detail__line">
                <Text>轨道调整：</Text>
                <Text className="cq-price">{formatAdjustment(item.trackAdjustment)}</Text>
              </View>
            </View>
          </>
        )}
        <View className="package-budget">
          <Text>预算金额：</Text>
          <Text className="cq-price">¥ {formatMoney(previewQuote?.originalTotal ?? 0)}</Text>
        </View>
        <CurtainButton onClick={goSummary}>下一步：查看汇总</CurtainButton>
      </View>
    </PageShell>
  )
}

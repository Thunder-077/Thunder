import { useEffect, useMemo, useState } from "react"
import Taro, { useDidShow, useRouter } from "@tarojs/taro"
import { Input, Picker, Text, View } from "@tarojs/components"
import type { BaseEventOrig, InputProps } from "@tarojs/components"
import { CurtainButton, PageShell } from "@/modules/curtain-quote/components/page-shell"
import { IconSymbol } from "@/modules/curtain-quote/components/icon-symbol"
import { calculatePackageItem, calculateQuoteTotals } from "@/modules/curtain-quote/services/quote-calculator"
import { formatAdjustment, formatCurtainMode, formatMoney, maskPhone } from "@/modules/curtain-quote/services/format"
import { listPackageConfigs } from "@/modules/curtain-quote/services/package-config-storage"
import { getQuote, saveQuote } from "@/modules/curtain-quote/services/quote-storage"
import { parseNonNegativeNumber, sanitizeNumberInput } from "@/modules/curtain-quote/services/validation"
import type { CurtainMode, CurtainQuote, PackageConfig, PackageQuoteItem } from "@/modules/curtain-quote/types/quote"
import "./index.css"

const CURTAIN_MODE_OPTIONS = [
  { label: "布和纱", value: "fabric_and_sheer" as const },
  { label: "只有布", value: "fabric_only" as const },
  { label: "只有纱", value: "sheer_only" as const },
]

export default function QuotePackagePage() {
  const router = useRouter()
  const quoteId = String(router.params.id ?? "")
  const [quote, setQuote] = useState<CurtainQuote | null>(null)
  const [configs, setConfigs] = useState<PackageConfig[]>([])
  const [rawInputs, setRawInputs] = useState<Record<string, string>>({})

  const loadPageData = async () => {
    if (!quoteId) {
      return
    }

    const [currentQuote, currentConfigs] = await Promise.all([getQuote(quoteId), listPackageConfigs()])
    setQuote(currentQuote)
    setConfigs(currentConfigs)
  }

  useEffect(() => {
    void loadPageData()
  }, [quoteId])

  useDidShow(() => {
    void loadPageData()
  })

  const item = quote?.packageItems[0] ?? null
  const previewQuote = useMemo(() => (quote ? calculateQuoteTotals({ ...quote, mode: "package" }) : null), [quote])
  const packageNames = configs.map((config) => config.name)
  const selectedConfig = useMemo(() => {
    if (!item) {
      return configs[0] ?? null
    }

    return configs.find((config) => config.id === item.packageConfigId) ?? configs[0] ?? null
  }, [configs, item])

  useEffect(() => {
    if (!item || !selectedConfig) {
      return
    }

    if (item.packageConfigId) {
      return
    }

    void persistItem(rebuildItem(selectedConfig, item.width, item.curtainMode))
  }, [item, selectedConfig])

  const persistItem = async (nextItem: PackageQuoteItem) => {
    if (!quote) {
      return
    }

    const updated = await saveQuote({ ...quote, mode: "package", packageItems: [nextItem] })
    setQuote(updated)
  }

  const rebuildItem = (packageConfig: PackageConfig, width: number, curtainMode: CurtainMode) => (
    calculatePackageItem({
      id: item?.id ?? "",
      packageConfig,
      width,
      curtainMode,
    })
  )

  const updatePackageName = (event: BaseEventOrig<{ value: string | number | string[] }>) => {
    if (!item || configs.length === 0) {
      return
    }

    const nextConfig = configs[Number(event.detail.value)] ?? selectedConfig
    if (!nextConfig) {
      return
    }

    void persistItem(rebuildItem(nextConfig, item.width, item.curtainMode))
  }

  const updateWidth = (event: BaseEventOrig<InputProps.inputEventDetail>) => {
    if (!item || !selectedConfig) {
      return
    }

    const raw = sanitizeNumberInput(event.detail.value)
    setRawInputs((prev) => ({ ...prev, width: raw }))
    void persistItem(rebuildItem(selectedConfig, parseNonNegativeNumber(raw), item.curtainMode))
  }

  const updateCurtainMode = (event: BaseEventOrig<{ value: string | number | string[] }>) => {
    if (!item || !selectedConfig) {
      return
    }

    const nextMode = CURTAIN_MODE_OPTIONS[Number(event.detail.value)]?.value ?? item.curtainMode
    void persistItem(rebuildItem(selectedConfig, item.width, nextMode))
  }

  /** 宽度输入展示值：与普通报价宽高一致，真实 0 交给 placeholder 展示。 */
  const getWidthInputValue = () => {
    if (!item) {
      return ""
    }

    const raw = rawInputs.width
    if (raw !== undefined) {
      return raw
    }

    return item.width === 0 ? "" : String(item.width)
  }

  const goPackageConfigs = () => {
    void Taro.navigateTo({ url: "/pages/package-configs/index" })
  }

  const goSummary = () => {
    if (quote) {
      void Taro.navigateTo({ url: `/pages/quote-summary/index?id=${quote.id}` })
    }
  }

  const currentCurtainModeIndex = item ? CURTAIN_MODE_OPTIONS.findIndex((option) => option.value === item.curtainMode) : 0

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

        {configs.length === 0 ? (
          <View className="package-empty cq-card">
            <Text className="package-empty__title">暂无套餐配置</Text>
            <Text className="package-empty__desc">请先新增套餐配置，再进行套餐报价。</Text>
            <CurtainButton onClick={goPackageConfigs}>去配置套餐</CurtainButton>
          </View>
        ) : item && selectedConfig ? (
          <>
            <View className="package-card cq-card">
              <Picker mode="selector" range={packageNames} value={packageNames.indexOf(selectedConfig.name)} onChange={updatePackageName}>
                <View className="package-picker">
                  <Text>{selectedConfig.name}</Text>
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
                <Text className="package-width__label">宽度</Text>
                <View className="package-width__input-row">
                  <Input className="package-width__input" type="digit" placeholder="0.00" value={getWidthInputValue()} onInput={updateWidth} />
                  <Text>米</Text>
                </View>
              </View>
              <View className="package-width__divider" />
              <View className="package-width">
                <Text className="package-width__label">窗帘类型</Text>
                <Picker mode="selector" range={CURTAIN_MODE_OPTIONS.map((option) => option.label)} value={currentCurtainModeIndex < 0 ? 0 : currentCurtainModeIndex} onChange={updateCurtainMode}>
                  <View className="package-picker package-picker--inline">
                    <Text>{formatCurtainMode(item.curtainMode)}</Text>
                    <View className="package-picker__arrow" />
                  </View>
                </Picker>
              </View>
            </View>
            <View className="package-detail cq-card">
              <View className="package-section-title">
                <Text className="package-section-title__bar" />
                <Text>用量明细</Text>
              </View>
              <View className="package-detail__line">
                <Text>布实际用量：</Text>
                <Text>{item.fabricUsage.toFixed(2)}米</Text>
              </View>
              <View className="package-detail__line">
                <Text>纱实际用量：</Text>
                <Text>{item.sheerUsage.toFixed(2)}米</Text>
              </View>
              <View className="package-detail__line">
                <Text>轨道长度：</Text>
                <Text>{item.trackLength.toFixed(2)}米</Text>
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
        ) : null}

        <View className="package-budget">
          <Text>预算金额：</Text>
          <Text className="cq-price">¥ {formatMoney(previewQuote?.originalTotal ?? 0)}</Text>
        </View>
        {configs.length > 0 ? <CurtainButton onClick={goSummary}>下一步：查看汇总</CurtainButton> : null}
      </View>
    </PageShell>
  )
}

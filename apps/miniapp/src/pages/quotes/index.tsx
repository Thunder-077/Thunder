import { useEffect, useMemo, useState } from "react"
import Taro, { useDidShow } from "@tarojs/taro"
import { Button, Input, Text, View } from "@tarojs/components"
import type { BaseEventOrig, InputProps } from "@tarojs/components"
import { BottomTab, CurtainButton, PageShell } from "@/modules/curtain-quote/components/page-shell"
import { IconSymbol } from "@/modules/curtain-quote/components/icon-symbol"
import { formatDate, formatMoney, maskPhone } from "@/modules/curtain-quote/services/format"
import { listQuotes } from "@/modules/curtain-quote/services/quote-storage"
import type { CurtainQuote, CurtainQuoteStatus } from "@/modules/curtain-quote/types/quote"
import "./index.css"

type FilterTab = "all" | CurtainQuoteStatus

const FILTER_TABS: { label: string; value: FilterTab }[] = [
  { label: "全部", value: "all" },
  { label: "草稿", value: "draft" },
  { label: "已确认", value: "confirmed" },
]

const STATUS_LABELS: Record<CurtainQuoteStatus, string> = {
  draft: "草稿",
  confirmed: "已确认",
}

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<CurtainQuote[]>([])
  const [keyword, setKeyword] = useState("")
  const [activeTab, setActiveTab] = useState<FilterTab>("all")

  const loadQuotes = () => {
    void listQuotes().then(setQuotes)
  }

  useEffect(loadQuotes, [])
  useDidShow(loadQuotes)

  const filteredQuotes = useMemo(() => {
    const normalized = keyword.trim()
    return quotes.filter((quote) => {
      if (activeTab !== "all" && quote.status !== activeTab) {
        return false
      }

      if (!normalized) {
        return true
      }

      return (
        quote.customer.name.includes(normalized) ||
        quote.customer.phone.includes(normalized) ||
        maskPhone(quote.customer.phone).includes(normalized)
      )
    })
  }, [keyword, activeTab, quotes])

  const handleKeywordInput = (event: BaseEventOrig<InputProps.inputEventDetail>) => {
    setKeyword(event.detail.value)
  }

  /** 跳转到新建报价页。 */
  const goCreate = () => Taro.navigateTo({ url: "/pages/quote-new/index" })

  /** 在新建报价前进入套餐配置页维护套餐。 */
  const goPackageConfigs = () => Taro.navigateTo({ url: "/pages/package-configs/index" })

  const openDetail = (quoteId: string) => {
    Taro.navigateTo({ url: `/pages/quote-detail/index?id=${quoteId}` })
  }

  return (
    <PageShell title="报价记录" paddedBottom>
      <View className="quotes-page">
        <View className="quotes-actions">
          <View className="quotes-actions__primary">
            <CurtainButton onClick={goCreate}>新建报价</CurtainButton>
          </View>
          <View className="quotes-actions__secondary">
            <CurtainButton variant="outline" onClick={goPackageConfigs}>套餐配置</CurtainButton>
          </View>
        </View>
        <View className="quotes-search">
          <IconSymbol className="quotes-search__icon" name="search" />
          <Input
            className="quotes-search__input"
            placeholder="搜索客户姓名 / 手机号"
            value={keyword}
            onInput={handleKeywordInput}
          />
        </View>
        <View className="quotes-tabs">
          {FILTER_TABS.map((tab) => (
            <Button
              className={`quotes-tabs__item ${activeTab === tab.value ? "is-active" : ""}`}
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
            >
              {tab.label}
            </Button>
          ))}
        </View>
        <View className="quotes-list">
          {filteredQuotes.map((quote) => (
            <Button className="quotes-card cq-card" key={quote.id} onClick={() => openDetail(quote.id)}>
              <View className="quotes-card__header">
                <Text className="quotes-card__name">{quote.customer.name}</Text>
                <Text className={`quotes-card__status quotes-card__status--${quote.status}`}>
                  {STATUS_LABELS[quote.status]}
                </Text>
              </View>
              <Text className="quotes-card__phone">{maskPhone(quote.customer.phone)}</Text>
              <View className="quotes-card__address">
                <IconSymbol className="quotes-card__pin" name="location" />
                <Text>{quote.customer.address}</Text>
              </View>
              <View className="quotes-card__price-row">
                <Text className="quotes-card__price-label">最终报价：</Text>
                <Text className="quotes-card__price">¥{formatMoney(quote.finalAmount)}</Text>
              </View>
              <View className="quotes-card__footer">
                <Text className="quotes-card__meta">
                  {quote.mode === "normal" ? "普通报价" : "套餐报价"}｜{STATUS_LABELS[quote.status]}
                </Text>
                <Text className="quotes-card__date">{formatDate(quote.createdAt)}</Text>
              </View>
            </Button>
          ))}
          {filteredQuotes.length === 0 ? (
            <View className="quotes-empty cq-card">
              <Text className="quotes-empty__title">暂无报价记录</Text>
              <Text className="quotes-empty__desc">点击下方按钮创建第一份报价</Text>
            </View>
          ) : null}
        </View>
      </View>
      <BottomTab active="quotes" />
    </PageShell>
  )
}

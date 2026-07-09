import { useEffect, useMemo, useState } from "react"
import Taro, { useDidShow } from "@tarojs/taro"
import { Button, Image, Input, Text, View } from "@tarojs/components"
import type { BaseEventOrig, InputProps } from "@tarojs/components"
import { BottomTab, CurtainButton, PageShell } from "@/modules/curtain-quote/components/page-shell"
import { IconSymbol } from "@/modules/curtain-quote/components/icon-symbol"
import { formatDate, formatMoney, maskPhone } from "@/modules/curtain-quote/services/format"
import { listQuotes } from "@/modules/curtain-quote/services/quote-storage"
import type { CurtainQuote } from "@/modules/curtain-quote/types/quote"
import heroHome from "@/assets/curtain/hero-home.jpg"
import "./index.css"

export default function HomePage() {
  const [quotes, setQuotes] = useState<CurtainQuote[]>([])
  const [keyword, setKeyword] = useState("")

  useEffect(() => {
    void listQuotes().then(setQuotes)
  }, [])

  useDidShow(() => {
    void listQuotes().then(setQuotes)
  })

  const filteredQuotes = useMemo(() => {
    const normalized = keyword.trim()
    if (!normalized) {
      return quotes
    }

    return quotes.filter(
      (quote) =>
        quote.customer.name.includes(normalized) ||
        quote.customer.phone.includes(normalized) ||
        maskPhone(quote.customer.phone).includes(normalized),
    )
  }, [keyword, quotes])

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
    <PageShell paddedBottom>
      <View className="home-hero">
        <Image className="home-hero__image" mode="aspectFill" src={heroHome} />
        <View className="home-hero__shade" />
        <View className="home-hero__copy">
          <Text className="home-hero__title">织梦人家纺窗帘</Text>
          <Text className="home-hero__subtitle">价格测算 · 报价分享</Text>
        </View>
      </View>
      <View className="home-body">
        <View className="home-actions">
          <View className="home-actions__primary">
            <CurtainButton onClick={goCreate}>＋ 新建报价</CurtainButton>
          </View>
          <View className="home-actions__secondary">
            <CurtainButton variant="outline" onClick={goPackageConfigs}>套餐配置</CurtainButton>
          </View>
        </View>
        <View className="home-search">
          <IconSymbol className="home-search__icon" name="search" />
          <Input className="home-search__input" placeholder="搜索客户姓名 / 手机号" value={keyword} onInput={handleKeywordInput} />
        </View>
        <View className="home-list">
          {filteredQuotes.map((quote) => (
            <Button className="quote-card cq-card" key={quote.id} onClick={() => openDetail(quote.id)}>
              <View className="quote-card__top">
                <Text className="quote-card__name">{quote.customer.name}</Text>
                <Text className="quote-card__phone">{maskPhone(quote.customer.phone)}</Text>
                <Text className={`quote-card__status quote-card__status--${quote.status}`}>
                  {quote.status === "confirmed" ? "已确认" : "草稿"}
                </Text>
              </View>
              <View className="quote-card__address">
                <IconSymbol className="quote-card__pin" name="location" />
                <Text>{quote.customer.address}</Text>
              </View>
              <View className="quote-card__bottom">
                <Text className="quote-card__price">¥{formatMoney(quote.finalAmount)}</Text>
                <Text className="quote-card__date">{formatDate(quote.updatedAt)}</Text>
              </View>
            </Button>
          ))}
          {filteredQuotes.length === 0 ? (
            <View className="home-empty cq-card">
              <Text className="home-empty__title">暂无报价</Text>
              <Text className="home-empty__desc">点击上方按钮新建第一份窗帘报价</Text>
            </View>
          ) : null}
        </View>
      </View>
      <BottomTab active="home" />
    </PageShell>
  )
}

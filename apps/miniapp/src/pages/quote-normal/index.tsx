import { useEffect, useMemo, useState } from "react"
import Taro, { useDidShow, useRouter } from "@tarojs/taro"
import { Button, Text, View } from "@tarojs/components"
import { CurtainButton, PageShell } from "@/modules/curtain-quote/components/page-shell"
import { IconSymbol } from "@/modules/curtain-quote/components/icon-symbol"
import { calculateQuoteTotals } from "@/modules/curtain-quote/services/quote-calculator"
import { formatMoney, maskPhone } from "@/modules/curtain-quote/services/format"
import { getQuote, saveQuote } from "@/modules/curtain-quote/services/quote-storage"
import type { CurtainQuote, NormalQuoteItem } from "@/modules/curtain-quote/types/quote"
import "./index.css"

export default function QuoteNormalPage() {
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

  const previewQuote = useMemo(() => (quote ? calculateQuoteTotals({ ...quote, mode: "normal" }) : null), [quote])

  const persistItems = async (items: NormalQuoteItem[]) => {
    if (!quote) {
      return
    }

    const updated = await saveQuote({ ...quote, mode: "normal", normalItems: items })
    setQuote(updated)
  }

  const addRoom = () => {
    if (quote) {
      void Taro.navigateTo({ url: `/pages/quote-normal-item/index?id=${quote.id}` })
    }
  }

  const editRoom = (item: NormalQuoteItem) => {
    if (quote) {
      void Taro.navigateTo({ url: `/pages/quote-normal-item/index?id=${quote.id}&itemId=${item.id}` })
    }
  }

  const removeRoom = (id: string) => {
    void Taro.showModal({ title: "删除房间", content: "确认删除该房间/位置？" }).then((result) => {
      if (result.confirm) {
        void persistItems((quote?.normalItems ?? []).filter((item) => item.id !== id))
      }
    })
  }

  const goSummary = () => {
    if (quote) {
      void Taro.navigateTo({ url: `/pages/quote-summary/index?id=${quote.id}` })
    }
  }

  return (
    <PageShell title="普通报价" showBack paddedBottom>
      <View className="calc-page">
        {quote && (
          <View className="calc-customer">
            <IconSymbol className="calc-customer__icon" name="user" />
            <Text>客户：{quote.customer.name}</Text>
            <Text>{maskPhone(quote.customer.phone)}</Text>
          </View>
        )}
        <View className="normal-list">
          {previewQuote?.normalItems.map((item) => (
            <View className="normal-card cq-card" key={item.id}>
              <View className="normal-card__title-row">
                <IconSymbol className="normal-card__icon" name={item.position.includes("客厅") ? "sofa" : item.position.includes("卧") ? "bed" : "room"} />
                <Text className="normal-card__title">{item.position}</Text>
              </View>
              <View className="normal-card__line">
                <Text>宽度：</Text>
                <Text>{item.width.toFixed(2)}米</Text>
              </View>
              {item.fabricUnitPrice > 0 || item.sheerUnitPrice > 0 ? (
                <>
                  <View className="normal-card__dash" />
                  {item.fabricUnitPrice > 0 ? (
                    <View className="normal-card__line">
                      <Text>布单价：</Text>
                      <Text>{item.fabricUnitPrice}元/米</Text>
                    </View>
                  ) : null}
                  {item.fabricUnitPrice > 0 && item.sheerUnitPrice > 0 ? <View className="normal-card__dash" /> : null}
                  {item.sheerUnitPrice > 0 ? (
                    <View className="normal-card__line">
                      <Text>纱单价：</Text>
                      <Text>{item.sheerUnitPrice}元/米</Text>
                    </View>
                  ) : null}
                </>
              ) : null}
              <View className="normal-card__dash" />
              <View className="normal-card__budget">
                <Text>预算：</Text>
                <Text className="cq-price">¥{formatMoney(item.amount)}</Text>
              </View>
              <View className="normal-card__actions">
                <Button className="normal-card__action normal-card__action--edit" onClick={() => editRoom(item)}>
                  <IconSymbol className="normal-card__action-icon" name="edit" /> 编辑
                </Button>
                <Button className="normal-card__action normal-card__action--delete" onClick={() => removeRoom(item.id)}>
                  <IconSymbol className="normal-card__action-icon" name="trash" /> 删除
                </Button>
              </View>
            </View>
          ))}
        </View>
        <Button className="normal-add" onClick={addRoom}>
          ＋ 添加房间/位置
        </Button>
      </View>
      <View className="calc-footer">
        <View className="calc-total">
          <Text>原价合计：</Text>
          <Text className="cq-price">¥{formatMoney(previewQuote?.originalTotal ?? 0)}</Text>
        </View>
        <CurtainButton onClick={goSummary}>下一步：查看汇总</CurtainButton>
      </View>
    </PageShell>
  )
}

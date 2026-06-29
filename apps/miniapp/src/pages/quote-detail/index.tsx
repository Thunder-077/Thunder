import { useEffect, useMemo, useState } from "react"
import Taro, { useDidShow, useRouter } from "@tarojs/taro"
import { Button, Text, View } from "@tarojs/components"
import { CurtainButton, PageShell, SectionTitle } from "@/modules/curtain-quote/components/page-shell"
import { calculateQuoteTotals } from "@/modules/curtain-quote/services/quote-calculator"
import { formatDate, formatDiscount, formatMoney, maskPhone } from "@/modules/curtain-quote/services/format"
import { deleteQuote, getQuote, updateQuoteStatus } from "@/modules/curtain-quote/services/quote-storage"
import type { CurtainQuote } from "@/modules/curtain-quote/types/quote"
import "./index.css"

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

          <View className="detail-section cq-card">
            <SectionTitle>客户信息</SectionTitle>
            <Text className="detail-name">{calculatedQuote.customer.name}</Text>
            <Text className="detail-line">{maskPhone(calculatedQuote.customer.phone)}</Text>
            <Text className="detail-line">{calculatedQuote.customer.address}</Text>
          </View>

          <View className="detail-section cq-card">
            <SectionTitle>报价信息</SectionTitle>
            <View className="detail-info-line">
              <Text>报价方式：</Text>
              <Text>{calculatedQuote.mode === "normal" ? "普通报价" : "套餐报价"}</Text>
            </View>
            <View className="detail-info-line">
              <Text>创建时间：</Text>
              <Text>{formatDate(calculatedQuote.createdAt)}</Text>
            </View>
            <View className="detail-info-line">
              <Text>最终折扣：</Text>
              <Text>{formatDiscount(calculatedQuote.finalDiscount)}</Text>
            </View>
            <View className="detail-info-line detail-info-line--amount">
              <Text>最终报价：</Text>
              <Text className="cq-price">¥{formatMoney(calculatedQuote.finalAmount)}</Text>
            </View>
          </View>

          <View className="detail-section cq-card">
            <SectionTitle>报价明细</SectionTitle>
            {calculatedQuote.mode === "normal"
              ? calculatedQuote.normalItems.map((item) => (
                  <View className="detail-item" key={item.id}>
                    <Text>{item.position}</Text>
                    <Text>¥{formatMoney(item.amount)}</Text>
                  </View>
                ))
              : calculatedQuote.packageItems.map((item) => (
                  <View className="detail-item" key={item.id}>
                    <Text>{item.packageName}</Text>
                    <Text>¥{formatMoney(item.amount)}</Text>
                  </View>
                ))}
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

import { useState } from "react"
import Taro from "@tarojs/taro"
import { Input, Text, Textarea, View } from "@tarojs/components"
import type { BaseEventOrig, InputProps, TextareaProps } from "@tarojs/components"
import { CurtainButton, PageShell, SectionTitle } from "@/modules/curtain-quote/components/page-shell"
import { IconSymbol } from "@/modules/curtain-quote/components/icon-symbol"
import { createQuoteDraft } from "@/modules/curtain-quote/services/quote-storage"
import { validateCustomer } from "@/modules/curtain-quote/services/validation"
import type { CurtainCustomer } from "@/modules/curtain-quote/types/quote"
import "./index.css"

const initialCustomer: CurtainCustomer = {
  name: "",
  phone: "",
  address: "",
  remark: "",
}

export default function QuoteNewPage() {
  const [customer, setCustomer] = useState<CurtainCustomer>(initialCustomer)

  const updateField = (field: keyof CurtainCustomer) => (event: BaseEventOrig<InputProps.inputEventDetail>) => {
    setCustomer((current) => ({ ...current, [field]: event.detail.value }))
  }

  const updateRemark = (event: BaseEventOrig<TextareaProps.onInputEventDetail>) => {
    setCustomer((current) => ({ ...current, remark: event.detail.value.slice(0, 200) }))
  }

  const saveDraft = async () => {
    const error = validateCustomer(customer)
    if (error) {
      await Taro.showToast({ title: error, icon: "none" })
      return
    }

    const quote = await createQuoteDraft(customer)
    await Taro.showToast({ title: "已保存草稿", icon: "success" })
    await Taro.redirectTo({ url: `/pages/quote-mode/index?id=${quote.id}` })
  }

  const nextStep = async () => {
    const error = validateCustomer(customer)
    if (error) {
      await Taro.showToast({ title: error, icon: "none" })
      return
    }

    const quote = await createQuoteDraft(customer)
    await Taro.redirectTo({ url: `/pages/quote-mode/index?id=${quote.id}` })
  }

  return (
    <PageShell title="新建报价" showBack paddedBottom>
      <View className="new-page">
        <SectionTitle>客户信息</SectionTitle>
        <View className="new-form-card cq-card">
          <View className="new-form-card__icon"><IconSymbol name="user" /></View>
          <View className="new-form-card__content">
            <Text className="new-form-card__label">客户姓名</Text>
            <Input className="new-form-card__input" placeholder="请输入客户姓名" value={customer.name} onInput={updateField("name")} />
          </View>
        </View>
        <View className="new-form-card cq-card">
          <View className="new-form-card__icon"><IconSymbol name="phone" /></View>
          <View className="new-form-card__content">
            <Text className="new-form-card__label">手机号</Text>
            <Input className="new-form-card__input" maxlength={11} placeholder="请输入手机号" type="number" value={customer.phone} onInput={updateField("phone")} />
          </View>
        </View>
        <View className="new-form-card cq-card">
          <View className="new-form-card__icon"><IconSymbol name="location" /></View>
          <View className="new-form-card__content">
            <Text className="new-form-card__label">安装地址</Text>
            <Input className="new-form-card__input" placeholder="请输入安装地址" value={customer.address} onInput={updateField("address")} />
          </View>
        </View>
        <View className="new-form-card new-form-card--textarea cq-card">
          <View className="new-form-card__icon"><IconSymbol name="note" /></View>
          <View className="new-form-card__content">
            <Text className="new-form-card__label">备注</Text>
            <Textarea className="new-form-card__textarea" maxlength={200} placeholder="请输入备注信息" value={customer.remark} onInput={updateRemark} />
            <Text className="new-form-card__count">{customer.remark.length}/200</Text>
          </View>
        </View>
      </View>
      <View className="new-footer">
        <CurtainButton variant="outline" onClick={saveDraft}>
          保存草稿
        </CurtainButton>
        <CurtainButton onClick={nextStep}>下一步</CurtainButton>
      </View>
    </PageShell>
  )
}

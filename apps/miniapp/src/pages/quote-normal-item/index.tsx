import { useEffect, useMemo, useState } from "react"
import Taro, { useRouter } from "@tarojs/taro"
import { Button, Input, Text, Textarea, View } from "@tarojs/components"
import type { BaseEventOrig, InputProps, TextareaProps } from "@tarojs/components"
import { CurtainButton, PageShell, SectionTitle } from "@/modules/curtain-quote/components/page-shell"
import { calculateNormalItem } from "@/modules/curtain-quote/services/quote-calculator"
import { createLocalId } from "@/modules/curtain-quote/services/quote-factory"
import { formatMoney } from "@/modules/curtain-quote/services/format"
import { getQuote, saveQuote } from "@/modules/curtain-quote/services/quote-storage"
import { parseNonNegativeNumber, sanitizeNumberInput } from "@/modules/curtain-quote/services/validation"
import type { CurtainQuote, NormalQuoteItem } from "@/modules/curtain-quote/types/quote"
import "./index.css"

type EditableNormalItem = Omit<NormalQuoteItem, "amount">
type NumericField = keyof Omit<EditableNormalItem, "id" | "position" | "modelColor" | "installRequirement">

const emptyItem = (): EditableNormalItem => ({
  id: createLocalId("normal"),
  position: "",
  width: 0,
  height: 0,
  modelColor: "",
  installRequirement: "",
  pleatRatio: 2,
  fabricUnitPrice: 0,
  sheerUnitPrice: 0,
  trackUnitPrice: 0,
  linerUnitPrice: 0,
  ringUnitPrice: 0,
  ringQuantity: 0,
  installFee: 0,
})

export default function QuoteNormalItemPage() {
  const router = useRouter()
  const quoteId = String(router.params.id ?? "")
  const itemId = router.params.itemId ? String(router.params.itemId) : ""
  const [quote, setQuote] = useState<CurtainQuote | null>(null)
  const [draft, setDraft] = useState<EditableNormalItem>(emptyItem)
  /** 保留用户原始输入字符串，避免受控输入丢失小数点。 */
  const [rawInputs, setRawInputs] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!quoteId) {
      return
    }

    void getQuote(quoteId).then((currentQuote) => {
      setQuote(currentQuote)
      const item = currentQuote?.normalItems.find((normalItem) => normalItem.id === itemId)
      if (item) {
        const { amount: _amount, ...editableItem } = item
        setDraft(editableItem)
        const initRaw: Record<string, string> = {}
        for (const key of Object.keys(editableItem) as NumericField[]) {
          if (editableItem[key] !== 0) {
            initRaw[key] = String(editableItem[key])
          }
        }
        setRawInputs(initRaw)
      }
    })
  }, [itemId, quoteId])

  const previewItem = useMemo(() => calculateNormalItem(draft), [draft])

  const updateText = (field: keyof Pick<EditableNormalItem, "position" | "modelColor">) => (event: BaseEventOrig<InputProps.inputEventDetail>) => {
    setDraft((current) => ({ ...current, [field]: event.detail.value }))
  }

  const updateRequirement = (event: BaseEventOrig<TextareaProps.onInputEventDetail>) => {
    setDraft((current) => ({ ...current, installRequirement: event.detail.value.slice(0, 120) }))
  }

  const updateNumber = (field: NumericField) => (
    event: BaseEventOrig<InputProps.inputEventDetail>,
  ) => {
    const raw = sanitizeNumberInput(event.detail.value)
    setRawInputs((prev) => ({ ...prev, [field]: raw }))
    const value = field === "ringQuantity" ? Math.round(parseNonNegativeNumber(raw)) : parseNonNegativeNumber(raw)
    setDraft((current) => ({ ...current, [field]: value }))
  }

  const validateDraft = (): string => {
    if (!draft.position.trim()) {
      return "请输入房间/位置"
    }
    if (draft.width <= 0) {
      return "请输入大于 0 的宽度"
    }
    if (draft.pleatRatio <= 0) {
      return "请输入大于 0 的褶皱倍数"
    }
    return ""
  }

  const saveItem = async () => {
    const error = validateDraft()
    if (error) {
      await Taro.showToast({ title: error, icon: "none" })
      return
    }
    if (!quote) {
      await Taro.showToast({ title: "报价单不存在", icon: "none" })
      return
    }

    const calculatedItem = calculateNormalItem({ ...draft, position: draft.position.trim() })
    const exists = quote.normalItems.some((item) => item.id === calculatedItem.id)
    const normalItems = exists
      ? quote.normalItems.map((item) => (item.id === calculatedItem.id ? calculatedItem : item))
      : [...quote.normalItems, calculatedItem]

    await saveQuote({ ...quote, mode: "normal", normalItems })
    await Taro.navigateBack()
  }

  return (
    <PageShell title={itemId ? "编辑项目" : "添加项目"} showBack paddedBottom>
      <View className="item-page">
        <SectionTitle>报价项目</SectionTitle>
        <View className="item-form cq-card">
          <View className="item-field">
            <Text className="item-field__label">房间/位置</Text>
            <Input className="item-field__input" placeholder="例如：客厅、主卧" value={draft.position} onInput={updateText("position")} />
          </View>
          <View className="item-field item-field--split">
            <View className="item-field__half">
              <Text className="item-field__label">宽度</Text>
              <View className="item-field__unit-row">
                <Input className="item-field__input" type="digit" placeholder="0.00" value={rawInputs.width ?? (draft.width ? String(draft.width) : "")} onInput={updateNumber("width")} />
                <Text className="item-field__unit">m</Text>
              </View>
            </View>
            <View className="item-field__divider" />
            <View className="item-field__half">
              <Text className="item-field__label">高度</Text>
              <View className="item-field__unit-row">
                <Input className="item-field__input" type="digit" placeholder="0.00" value={rawInputs.height ?? (draft.height ? String(draft.height) : "")} onInput={updateNumber("height")} />
                <Text className="item-field__unit">m</Text>
              </View>
            </View>
          </View>
          <View className="item-field">
            <Text className="item-field__label">布匹型号及颜色</Text>
            <Input className="item-field__input" placeholder="请输入型号或颜色" value={draft.modelColor} onInput={updateText("modelColor")} />
          </View>
          <View className="item-field item-field--textarea">
            <Text className="item-field__label">安装要求</Text>
            <Textarea className="item-field__textarea" maxlength={120} placeholder="请输入安装要求" value={draft.installRequirement} onInput={updateRequirement} />
          </View>
        </View>

        <View className="item-form cq-card">
          <View className="item-field item-field--split">
            <View className="item-field__half">
              <Text className="item-field__label">褶皱倍数</Text>
              <Input className="item-field__input" type="digit" placeholder="2" value={rawInputs.pleatRatio ?? String(draft.pleatRatio)} onInput={updateNumber("pleatRatio")} />
            </View>
            <View className="item-field__divider" />
            <View className="item-field__half">
              <Text className="item-field__label">布单价</Text>
              <Input className="item-field__input" type="digit" placeholder="0" value={rawInputs.fabricUnitPrice ?? (draft.fabricUnitPrice ? String(draft.fabricUnitPrice) : "")} onInput={updateNumber("fabricUnitPrice")} />
            </View>
          </View>
          <View className="item-field item-field--split">
            <View className="item-field__half">
              <Text className="item-field__label">纱单价</Text>
              <Input className="item-field__input" type="digit" placeholder="选填，无纱可不填" value={rawInputs.sheerUnitPrice ?? (draft.sheerUnitPrice ? String(draft.sheerUnitPrice) : "")} onInput={updateNumber("sheerUnitPrice")} />
            </View>
            <View className="item-field__divider" />
            <View className="item-field__half">
              <Text className="item-field__label">轨道单价</Text>
              <Input className="item-field__input" type="digit" placeholder="0" value={rawInputs.trackUnitPrice ?? (draft.trackUnitPrice ? String(draft.trackUnitPrice) : "")} onInput={updateNumber("trackUnitPrice")} />
            </View>
          </View>
          <View className="item-field item-field--split">
            <View className="item-field__half">
              <Text className="item-field__label">衬带单价</Text>
              <Input className="item-field__input" type="digit" placeholder="0" value={rawInputs.linerUnitPrice ?? (draft.linerUnitPrice ? String(draft.linerUnitPrice) : "")} onInput={updateNumber("linerUnitPrice")} />
            </View>
            <View className="item-field__divider" />
            <View className="item-field__half">
              <Text className="item-field__label">环/勾单价</Text>
              <Input className="item-field__input" type="digit" placeholder="0" value={rawInputs.ringUnitPrice ?? (draft.ringUnitPrice ? String(draft.ringUnitPrice) : "")} onInput={updateNumber("ringUnitPrice")} />
            </View>
          </View>
          <View className="item-field item-field--split">
            <View className="item-field__half">
              <Text className="item-field__label">环/勾数量</Text>
              <Input className="item-field__input" type="number" placeholder="0" value={rawInputs.ringQuantity ?? (draft.ringQuantity ? String(draft.ringQuantity) : "")} onInput={updateNumber("ringQuantity")} />
            </View>
            <View className="item-field__divider" />
            <View className="item-field__half">
              <Text className="item-field__label">安装费</Text>
              <Input className="item-field__input" type="digit" placeholder="0" value={rawInputs.installFee ?? (draft.installFee ? String(draft.installFee) : "")} onInput={updateNumber("installFee")} />
            </View>
          </View>
        </View>

        <View className="item-budget cq-card">
          <Text>当前预算</Text>
          <Text className="cq-price">¥{formatMoney(previewItem.amount)}</Text>
        </View>
      </View>
      <View className="item-footer">
        <Button className="item-footer__cancel" onClick={() => Taro.navigateBack()}>
          取消
        </Button>
        <CurtainButton onClick={saveItem}>保存项目</CurtainButton>
      </View>
    </PageShell>
  )
}

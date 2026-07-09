import { useEffect, useState } from "react"
import Taro, { useRouter } from "@tarojs/taro"
import { Input, Text, View } from "@tarojs/components"
import type { BaseEventOrig, InputProps } from "@tarojs/components"
import { CurtainButton, PageShell, SectionTitle } from "@/modules/curtain-quote/components/page-shell"
import { getPackageConfig, savePackageConfig } from "@/modules/curtain-quote/services/package-config-storage"
import { parseNonNegativeNumber, sanitizeNumberInput } from "@/modules/curtain-quote/services/validation"
import type { PackageConfig } from "@/modules/curtain-quote/types/quote"
import "./index.css"

type EditablePackageConfig = Omit<PackageConfig, "updatedAt"> & { updatedAt?: string }
type NumericField = Exclude<keyof EditablePackageConfig, "id" | "name" | "createdAt" | "updatedAt">

const emptyDraft = (): EditablePackageConfig => ({
  id: "",
  name: "",
  basePrice: 0,
  includedFabric: 0,
  includedSheer: 0,
  includedTrack: 0,
  fabricAddPrice: 0,
  fabricReducePrice: 0,
  sheerAddPrice: 0,
  sheerReducePrice: 0,
  trackAddPrice: 0,
  trackReducePrice: 0,
  createdAt: "",
})

export default function PackageConfigItemPage() {
  const router = useRouter()
  const configId = router.params.id ? String(router.params.id) : ""
  const [draft, setDraft] = useState<EditablePackageConfig>(emptyDraft)
  const [rawInputs, setRawInputs] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!configId) {
      return
    }

    void getPackageConfig(configId).then((config) => {
      if (!config) {
        return
      }

      setDraft(config)
      const nextRaw: Record<string, string> = {}
      ;(Object.keys(config) as Array<keyof EditablePackageConfig>).forEach((key) => {
        if (typeof config[key] === "number" && config[key] !== 0) {
          nextRaw[key] = String(config[key])
        }
      })
      setRawInputs(nextRaw)
    })
  }, [configId])

  const updateText = (event: BaseEventOrig<InputProps.inputEventDetail>) => {
    setDraft((current) => ({ ...current, name: event.detail.value }))
  }

  const updateNumber = (field: NumericField) => (event: BaseEventOrig<InputProps.inputEventDetail>) => {
    const raw = sanitizeNumberInput(event.detail.value)
    setRawInputs((prev) => ({ ...prev, [field]: raw }))
    setDraft((current) => ({ ...current, [field]: parseNonNegativeNumber(raw) }))
  }

  const validateDraft = () => {
    if (!draft.name.trim()) {
      return "请输入套餐名称"
    }

    return ""
  }

  const saveCurrentConfig = async () => {
    const error = validateDraft()
    if (error) {
      await Taro.showToast({ title: error, icon: "none" })
      return
    }

    await savePackageConfig({
      ...draft,
      name: draft.name.trim(),
    })
    await Taro.showToast({ title: "保存成功", icon: "success" })
    await Taro.navigateBack()
  }

  /** 渲染数字输入项，占位文案直接带上单位，减少理解成本。 */
  const renderNumberField = (label: string, field: NumericField, placeholder: string) => (
    <View className="package-config-item__field">
      <Text className="package-config-item__label">{label}</Text>
      <Input
        className="package-config-item__input"
        type="digit"
        placeholder={placeholder}
        value={rawInputs[field] ?? (draft[field] ? String(draft[field]) : "")}
        onInput={updateNumber(field)}
      />
    </View>
  )

  return (
    <PageShell title={configId ? "编辑套餐" : "新增套餐"} showBack paddedBottom>
      <View className="package-config-item-page">
        <SectionTitle>基本信息</SectionTitle>
        <View className="package-config-item__card cq-card">
          <View className="package-config-item__field">
            <Text className="package-config-item__label">套餐名称</Text>
            <Input className="package-config-item__input" placeholder="请输入套餐名称" value={draft.name} onInput={updateText} />
          </View>
          {renderNumberField("套餐价格", "basePrice", "0元")}
        </View>

        <SectionTitle>套餐包含</SectionTitle>
        <View className="package-config-item__card cq-card">
          {renderNumberField("布", "includedFabric", "0米")}
          {renderNumberField("纱", "includedSheer", "0米")}
          {renderNumberField("轨道", "includedTrack", "0米")}
        </View>

        <SectionTitle>超出单价</SectionTitle>
        <View className="package-config-item__card cq-card">
          {renderNumberField("布", "fabricAddPrice", "0元/米")}
          {renderNumberField("纱", "sheerAddPrice", "0元/米")}
          {renderNumberField("轨道", "trackAddPrice", "0元/米")}
        </View>

        <SectionTitle>退还单价</SectionTitle>
        <View className="package-config-item__card cq-card">
          {renderNumberField("布", "fabricReducePrice", "0元/米")}
          {renderNumberField("纱", "sheerReducePrice", "0元/米")}
          {renderNumberField("轨道", "trackReducePrice", "0元/米")}
        </View>
      </View>
      <View className="package-config-item__footer">
        <CurtainButton onClick={saveCurrentConfig}>保存套餐</CurtainButton>
      </View>
    </PageShell>
  )
}

import { PACKAGE_PRESETS, type PackagePreset } from "../data/package-presets"
import type { CurtainQuote, NormalQuoteItem, PackageQuoteItem } from "../types/quote"

/** 金额计算采用四舍五入到分，避免浮点数展示抖动。 */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** 普通报价公式：宽度相关材料费 + 环/勾费 + 安装费。 */
export function calculateNormalItem(item: Omit<NormalQuoteItem, "amount">): NormalQuoteItem {
  const pleatedWidth = item.width * item.pleatRatio
  const amount =
    pleatedWidth * item.fabricUnitPrice +
    item.width * item.trackUnitPrice +
    pleatedWidth * item.linerUnitPrice +
    item.ringUnitPrice * item.ringQuantity +
    item.installFee

  return {
    ...item,
    amount: roundMoney(amount),
  }
}

/** 根据套餐名称查找套餐规则，找不到时回落到 1280 套餐。 */
export function findPackagePreset(name: string): PackagePreset {
  return PACKAGE_PRESETS.find((preset) => preset.name === name) ?? PACKAGE_PRESETS[1]
}

/** 套餐差额费用，正差额按加价单价，负差额按减价单价抵扣。 */
function calculateAdjustment(diff: number, addPrice: number, reducePrice: number): number {
  if (diff >= 0) {
    return roundMoney(diff * addPrice)
  }

  return roundMoney(diff * reducePrice)
}

/** 套餐报价公式：基础价 + 布/纱/轨道差额调整。 */
export function calculatePackageItem(input: Pick<PackageQuoteItem, "id" | "packageName" | "fabricWidth" | "sheerWidth">): PackageQuoteItem {
  const preset = findPackagePreset(input.packageName)
  const fabricUsage = roundMoney(input.fabricWidth * 2)
  const sheerUsage = roundMoney(input.sheerWidth * 2)
  const trackLength = roundMoney(input.fabricWidth + input.sheerWidth)
  // 用户尚未录入宽度时不套用示例差额，避免新报价自动出现 UI 示例数据。
  const hasInput = input.fabricWidth > 0 || input.sheerWidth > 0
  const fabricDiff = hasInput ? roundMoney(fabricUsage - preset.includedFabric) : 0
  const sheerDiff = hasInput ? roundMoney(sheerUsage - preset.includedSheer) : 0
  const trackDiff = hasInput ? roundMoney(trackLength - preset.includedTrack) : 0
  const fabricAdjustment = hasInput ? calculateAdjustment(fabricDiff, preset.rule.fabricAdd, preset.rule.fabricReduce) : 0
  const sheerAdjustment = hasInput ? calculateAdjustment(sheerDiff, preset.rule.sheerAdd, preset.rule.sheerReduce) : 0
  const trackAdjustment = hasInput ? calculateAdjustment(trackDiff, preset.rule.trackAdd, preset.rule.trackReduce) : 0
  const amount = roundMoney(preset.basePrice + fabricAdjustment + sheerAdjustment + trackAdjustment)

  return {
    ...input,
    basePrice: preset.basePrice,
    fabricUsage,
    sheerUsage,
    trackLength,
    fabricDiff,
    sheerDiff,
    trackDiff,
    fabricAdjustment,
    sheerAdjustment,
    trackAdjustment,
    amount,
  }
}

/** 按报价方式重算合计、折扣和最终金额。 */
export function calculateQuoteTotals(quote: CurtainQuote): CurtainQuote {
  const originalTotal =
    quote.mode === "normal"
      ? quote.normalItems.reduce((sum, item) => sum + item.amount, 0)
      : quote.packageItems.reduce((sum, item) => sum + item.amount, 0)
  const finalAmount = roundMoney(originalTotal * quote.finalDiscount)

  return {
    ...quote,
    originalTotal: roundMoney(originalTotal),
    finalAmount,
    updatedAt: new Date().toISOString(),
  }
}

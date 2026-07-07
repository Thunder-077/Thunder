import type { CurtainMode, CurtainQuote, NormalQuoteItem, PackageConfig, PackageQuoteItem } from "../types/quote"

/** 金额计算采用四舍五入到分，避免浮点数展示抖动。 */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** 普通报价公式：布/纱材料费 + 轨道/辅料费 + 安装费。 */
export function calculateNormalItem(item: Omit<NormalQuoteItem, "amount">): NormalQuoteItem {
  const pleatedWidth = item.width * item.pleatRatio
  const amount =
    pleatedWidth * item.fabricUnitPrice +
    pleatedWidth * item.sheerUnitPrice +
    item.width * item.trackUnitPrice +
    pleatedWidth * item.linerUnitPrice +
    item.ringUnitPrice * item.ringQuantity +
    item.installFee

  return {
    ...item,
    amount: roundMoney(amount),
  }
}

/** 套餐差额费用，正差额按加价单价，负差额按减价单价抵扣。 */
function calculateAdjustment(diff: number, addPrice: number, reducePrice: number): number {
  if (diff >= 0) {
    return roundMoney(diff * addPrice)
  }

  return roundMoney(diff * reducePrice)
}

/** 根据窗帘类型计算布/纱实际用量，默认褶皱倍数固定为 2。 */
function calculateUsageByMode(width: number, mode: CurtainMode) {
  const trackLength = roundMoney(width)
  const fabricUsage = mode === "sheer_only" ? 0 : roundMoney(width * 2)
  const sheerUsage = mode === "fabric_only" ? 0 : roundMoney(width * 2)

  return {
    fabricUsage,
    sheerUsage,
    trackLength,
  }
}

/** 套餐报价公式：基础价 + 布/纱/轨道差额调整。 */
export function calculatePackageItem(input: {
  id: string
  packageConfig: PackageConfig
  width: number
  curtainMode: CurtainMode
}): PackageQuoteItem {
  const { packageConfig, width, curtainMode } = input
  const { fabricUsage, sheerUsage, trackLength } = calculateUsageByMode(width, curtainMode)
  const hasInput = width > 0
  const fabricDiff = hasInput ? roundMoney(fabricUsage - packageConfig.includedFabric) : 0
  const sheerDiff = hasInput ? roundMoney(sheerUsage - packageConfig.includedSheer) : 0
  const trackDiff = hasInput ? roundMoney(trackLength - packageConfig.includedTrack) : 0
  const fabricAdjustment = hasInput ? calculateAdjustment(fabricDiff, packageConfig.fabricAddPrice, packageConfig.fabricReducePrice) : 0
  const sheerAdjustment = hasInput ? calculateAdjustment(sheerDiff, packageConfig.sheerAddPrice, packageConfig.sheerReducePrice) : 0
  const trackAdjustment = hasInput ? calculateAdjustment(trackDiff, packageConfig.trackAddPrice, packageConfig.trackReducePrice) : 0
  const amount = roundMoney(packageConfig.basePrice + fabricAdjustment + sheerAdjustment + trackAdjustment)

  return {
    id: input.id,
    packageConfigId: packageConfig.id,
    packageNameSnapshot: packageConfig.name,
    basePrice: packageConfig.basePrice,
    width,
    curtainMode,
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

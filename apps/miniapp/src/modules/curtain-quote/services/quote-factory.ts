import { calculateQuoteTotals } from "./quote-calculator"
import type { CurtainCustomer, CurtainQuote, NormalQuoteItem, PackageQuoteItem } from "../types/quote"

/** 小程序本地 ID 生成器，避免依赖云端服务。 */
export function createLocalId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** 创建普通报价默认明细；新报价不预置 UI 示例房间数据。 */
export function createDefaultNormalItems(): NormalQuoteItem[] {
  return []
}

/** 创建套餐报价默认明细；只保留套餐选项，不预置 UI 示例宽度。 */
export function createDefaultPackageItems(): PackageQuoteItem[] {
  return [
    {
      id: createLocalId("package"),
      packageConfigId: "",
      packageNameSnapshot: "",
      basePrice: 0,
      width: 0,
      curtainMode: "fabric_and_sheer",
      fabricUsage: 0,
      sheerUsage: 0,
      trackLength: 0,
      fabricDiff: 0,
      sheerDiff: 0,
      trackDiff: 0,
      fabricAdjustment: 0,
      sheerAdjustment: 0,
      trackAdjustment: 0,
      amount: 0,
    },
  ]
}

/** 创建报价主单，P0 直接落本地存储。 */
export function createCurtainQuote(customer: CurtainCustomer): CurtainQuote {
  const now = new Date().toISOString()
  const quote: CurtainQuote = {
    id: createLocalId("quote"),
    customer,
    mode: "normal",
    normalItems: createDefaultNormalItems(),
    packageItems: createDefaultPackageItems(),
    originalTotal: 0,
    finalDiscount: 0.9,
    finalAmount: 0,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  }

  return calculateQuoteTotals(quote)
}

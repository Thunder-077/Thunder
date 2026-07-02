import { calculateNormalItem, calculatePackageItem, calculateQuoteTotals } from "./quote-calculator"
import type { CurtainCustomer, CurtainQuote, NormalQuoteItem } from "../types/quote"

/** 小程序本地 ID 生成器，避免依赖云端服务。 */
export function createLocalId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** 创建普通报价默认明细；新报价不预置 UI 示例房间数据。 */
export function createDefaultNormalItems(): NormalQuoteItem[] {
  return []
}

/** 创建套餐报价默认明细；只保留套餐选项，不预置 UI 示例宽度。 */
export function createDefaultPackageItems() {
  return [
    calculatePackageItem({
      id: createLocalId("package"),
      packageName: "别丽美特1280套餐",
      fabricWidth: 0,
      sheerWidth: 0,
    }),
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

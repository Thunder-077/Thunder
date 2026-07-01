import type { DiscountOption } from "../types/quote"

/** 汇总页可选折扣档位，保存图片和分享页复用最终折扣值。 */
export const DISCOUNT_OPTIONS: DiscountOption[] = [
  { label: "原价", value: 1 },
  { label: "95折", value: 0.95 },
  { label: "9折", value: 0.9 },
  { label: "85折", value: 0.85 },
  { label: "8折", value: 0.8 },
]

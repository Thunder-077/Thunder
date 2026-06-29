/** 金额统一格式化为两位小数，页面负责补充人民币符号。 */
export function formatMoney(value: number): string {
  return value.toFixed(2)
}

/**
 * 套餐费用调整展示：差额大于 0 显示 `+¥金额`，
 * 等于 0 显示 `0.00`，小于 0 显示 `-¥金额`。
 */
export function formatAdjustment(value: number): string {
  if (value === 0) {
    return "0.00"
  }

  const sign = value > 0 ? "+" : "-"
  return `${sign}¥${formatMoney(Math.abs(value))}`
}

/** 用于首页列表和汇总页展示的手机号脱敏。 */
export function maskPhone(phone: string): string {
  return phone.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2")
}

/** 日期展示为 YYYY-MM-DD，避免小程序端引入额外日期依赖。 */
export function formatDate(iso: string): string {
  return iso.slice(0, 10)
}

/** 折扣展示文案，分享页和详情页保持一致。 */
export function formatDiscount(discount: number): string {
  if (discount === 1) {
    return "原价"
  }

  if (discount === 0.95) {
    return "95折"
  }

  if (discount === 0.9) {
    return "9折"
  }

  if (discount === 0.85) {
    return "85折"
  }

  return `${Math.round(discount * 100)}折`
}

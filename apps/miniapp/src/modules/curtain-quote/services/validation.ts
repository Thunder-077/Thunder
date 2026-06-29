import type { CurtainCustomer } from "../types/quote"

/** 校验客户信息，返回第一条可展示错误。 */
export function validateCustomer(customer: CurtainCustomer): string | null {
  if (!customer.name.trim()) {
    return "请输入客户姓名"
  }

  if (!/^1\d{10}$/.test(customer.phone.trim())) {
    return "请输入正确的手机号"
  }

  if (!customer.address.trim()) {
    return "请输入安装地址"
  }

  if (customer.remark.length > 200) {
    return "备注不能超过 200 字"
  }

  return null
}

/**
 * 清洗数字输入：只允许整数和小数格式。
 * 去除非数字字符，确保最多一个小数点，过滤非法输入。
 */
export function sanitizeNumberInput(value: string): string {
  // 保留数字和小数点
  let cleaned = value.replace(/[^\d.]/g, "")
  // 只保留第一个小数点
  const dotIndex = cleaned.indexOf(".")
  if (dotIndex !== -1) {
    cleaned = cleaned.slice(0, dotIndex + 1) + cleaned.slice(dotIndex + 1).replace(/\./g, "")
  }
  // 防止以多个0开头（允许 "0." 和 "0"）
  if (cleaned.length > 1 && cleaned[0] === "0" && cleaned[1] !== ".") {
    cleaned = cleaned.slice(1)
  }

  return cleaned
}

/** 将输入框字符串转换为非负数字。 */
export function parseNonNegativeNumber(value: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0
  }

  return parsed
}


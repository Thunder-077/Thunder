export interface PackagePreset {
  /** 套餐名称，页面选择器直接展示。 */
  name: string
  /** 套餐基础价格。 */
  basePrice: number
  /** 套餐包含布用量，单位 m。 */
  includedFabric: number
  /** 套餐包含纱用量，单位 m。 */
  includedSheer: number
  /** 套餐包含轨道长度，单位 m。 */
  includedTrack: number
  /** 超出/减少套餐用量时的单价规则。 */
  rule: {
    fabricAdd: number
    fabricReduce: number
    sheerAdd: number
    sheerReduce: number
    trackAdd: number
    trackReduce: number
  }
}

/** 套餐报价规则，1280 套餐保持为默认项。 */
export const PACKAGE_PRESETS: PackagePreset[] = [
  {
    name: "980套餐",
    basePrice: 980,
    includedFabric: 10,
    includedSheer: 8,
    includedTrack: 8,
    rule: {
      fabricAdd: 88,
      fabricReduce: 45,
      sheerAdd: 58,
      sheerReduce: 30,
      trackAdd: 35,
      trackReduce: 18,
    },
  },
  {
    name: "1280套餐",
    basePrice: 1280,
    includedFabric: 12,
    includedSheer: 10,
    includedTrack: 10,
    rule: {
      fabricAdd: 108,
      fabricReduce: 55,
      sheerAdd: 68,
      sheerReduce: 35,
      trackAdd: 45,
      trackReduce: 22,
    },
  },
  {
    name: "1680套餐",
    basePrice: 1680,
    includedFabric: 16,
    includedSheer: 12,
    includedTrack: 12,
    rule: {
      fabricAdd: 128,
      fabricReduce: 65,
      sheerAdd: 78,
      sheerReduce: 40,
      trackAdd: 55,
      trackReduce: 28,
    },
  },
]

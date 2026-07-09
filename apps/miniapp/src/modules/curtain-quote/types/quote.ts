/** 报价方式：普通报价按房间逐项计算，套餐报价按套餐差额计算。 */
export type CurtainQuoteMode = "normal" | "package"

/** 报价状态：草稿用于未确认报价，已确认用于可分享报价。 */
export type CurtainQuoteStatus = "draft" | "confirmed"

/** 套餐窗帘类型：用于决定布/纱实际用量。 */
export type CurtainMode = "fabric_and_sheer" | "fabric_only" | "sheer_only"

/** 报价客户信息，P0 阶段仅保存到小程序本地存储。 */
export interface CurtainCustomer {
  /** 客户姓名，创建报价必填。 */
  name: string
  /** 手机号，展示时会做中间四位脱敏。 */
  phone: string
  /** 安装地址，首页和汇总页展示。 */
  address: string
  /** 客户备注，最多 200 字。 */
  remark: string
}

/** 普通报价的单个房间/位置明细。 */
export interface NormalQuoteItem {
  /** 本地生成的明细 ID。 */
  id: string
  /** 房间或安装位置名称。 */
  position: string
  /** 窗帘宽度，单位 m。 */
  width: number
  /** 窗帘高度，单位 m，P1 暂不参与金额计算但保留在明细中。 */
  height: number
  /** 型号/颜色，用于报价明细备注。 */
  modelColor: string
  /** 安装要求，用于记录特殊施工说明。 */
  installRequirement: string
  /** 褶皱倍数，默认 2。 */
  pleatRatio: number
  /** 布单价，单位 元/m。 */
  fabricUnitPrice: number
  /** 纱单价，单位 元/m；不需要纱帘时可为 0。 */
  sheerUnitPrice: number
  /** 轨道单价，单位 元/m。 */
  trackUnitPrice: number
  /** 衬带单价，单位 元/m。 */
  linerUnitPrice: number
  /** 环/勾单价。 */
  ringUnitPrice: number
  /** 环/勾数量，必须是整数。 */
  ringQuantity: number
  /** 安装费。 */
  installFee: number
  /** 当前明细预算金额。 */
  amount: number
}

/** 用户可维护的套餐配置，本地存储后供套餐报价页选择。 */
export interface PackageConfig {
  /** 本地生成的套餐配置 ID。 */
  id: string
  /** 套餐名称。 */
  name: string
  /** 套餐基础价格。 */
  basePrice: number
  /** 套餐包含布用量，单位 米。 */
  includedFabric: number
  /** 套餐包含纱用量，单位 米。 */
  includedSheer: number
  /** 套餐包含轨道长度，单位 米。 */
  includedTrack: number
  /** 超出套餐时的布单价，单位 元/米。 */
  fabricAddPrice: number
  /** 未使用完套餐时的布退还单价，单位 元/米。 */
  fabricReducePrice: number
  /** 超出套餐时的纱单价，单位 元/米。 */
  sheerAddPrice: number
  /** 未使用完套餐时的纱退还单价，单位 元/米。 */
  sheerReducePrice: number
  /** 超出套餐时的轨道单价，单位 元/米。 */
  trackAddPrice: number
  /** 未使用完套餐时的轨道退还单价，单位 元/米。 */
  trackReducePrice: number
  /** 创建时间 ISO 字符串。 */
  createdAt: string
  /** 更新时间 ISO 字符串。 */
  updatedAt: string
}

/** 套餐报价的单个套餐测算明细。 */
export interface PackageQuoteItem {
  /** 本地生成的套餐明细 ID。 */
  id: string
  /** 所选套餐配置 ID。 */
  packageConfigId: string
  /** 报价保存时的套餐名称快照。 */
  packageNameSnapshot: string
  /** 套餐基础价。 */
  basePrice: number
  /** 实际测量宽度，单位 米。 */
  width: number
  /** 套餐窗帘类型，决定布/纱实际用量。 */
  curtainMode: CurtainMode
  /** 布实际用量，单位 米。 */
  fabricUsage: number
  /** 纱实际用量，单位 米。 */
  sheerUsage: number
  /** 轨道长度，单位 米。 */
  trackLength: number
  /** 布差额用量，单位 米。 */
  fabricDiff: number
  /** 纱差额用量，单位 米。 */
  sheerDiff: number
  /** 轨道差额长度，单位 米。 */
  trackDiff: number
  /** 布费用调整，正数加价，负数退还。 */
  fabricAdjustment: number
  /** 纱费用调整，正数加价，负数退还。 */
  sheerAdjustment: number
  /** 轨道费用调整，正数加价，负数退还。 */
  trackAdjustment: number
  /** 当前套餐预算金额。 */
  amount: number
}

/** 完整窗帘报价单，本地存储以此结构持久化。 */
export interface CurtainQuote {
  /** 本地生成的报价 ID。 */
  id: string
  /** 客户信息。 */
  customer: CurtainCustomer
  /** 报价方式。 */
  mode: CurtainQuoteMode
  /** 普通报价明细。 */
  normalItems: NormalQuoteItem[]
  /** 套餐报价明细。 */
  packageItems: PackageQuoteItem[]
  /** 原价合计。 */
  originalTotal: number
  /** 最终折扣，例如 0.9 表示 9 折。 */
  finalDiscount: number
  /** 最终报价。 */
  finalAmount: number
  /** 报价状态。 */
  status: CurtainQuoteStatus
  /** 创建时间 ISO 字符串。 */
  createdAt: string
  /** 更新时间 ISO 字符串。 */
  updatedAt: string
}

/** P0 折扣档位。 */
export interface DiscountOption {
  /** 折扣显示名称。 */
  label: string
  /** 折扣值。 */
  value: number
}

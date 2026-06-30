/**
 * 窗帘报价单海报 — 设计令牌
 *
 * 风格定位：现代简约客户报价海报
 *  - 浅灰纸底 + 白色面板 + 细边框，保持克制和高级感
 *  - 最终报价做主视觉，但不用高饱和色块
 *  - 房间报价和客户信息只保留必要字段
 *  - 不堆砌装饰，不用图片素材，全部 canvas 路径绘制
 *
 * 所有颜色、字号、间距、圆角、阴影统一在此管理，renderer / builder 只消费这些令牌。
 */

export const theme = {
  /** 画布逻辑宽度（px），导出时按 DPR 放大 */
  width: 750,

  /* ---------- 间距 ---------- */
  spacing: {
    padX: 48,
    padTop: 44,
    padBottom: 48,
    sectionGap: 20,
    cardGap: 14,
    roomGap: 0,
    innerPadX: 30,
    innerPadY: 24,
    rowGap: 12,
    colGap: 24,
  },

  /* ---------- 圆角 ---------- */
  radius: {
    card: 16,
    small: 10,
    pill: 999,
    qr: 12,
    badge: 8,
  },

  /* ---------- 颜色 ---------- */
  color: {
    bg: "#F5F5F7",
    card: "#FFFFFF",
    cardBorder: "rgba(29, 29, 31, 0.10)",
    cardShadow: "rgba(29, 29, 31, 0.035)",
    ink: "#1D1D1F",
    text: "#2C2C2E",
    muted: "#6E6E73",
    light: "#A1A1A6",
    brand: "#1D1D1F",
    brandSoft: "#0071E3",
    brandBg: "#F5F5F7",
    price: "#1D1D1F",
    divider: "rgba(29, 29, 31, 0.10)",
    summaryBg: "#FFFFFF",
    summaryText: "#1D1D1F",
    summaryDim: "#6E6E73",
    summaryDivider: "rgba(0, 113, 227, 0.22)",
    summaryAccent: "#1D1D1F",
    tagBg: "#EFF6FF",
    tagText: "#0071E3",
    noteBg: "#F5F5F7",
    dot: "#0071E3",
  },

  /* ---------- 字体 ---------- */
  /** 字体族，canvas font 字符串用 */
  fontFamily: "sans-serif",
  font: {
    brand: { size: 34, weight: 700 },
    brandSub: { size: 18, weight: 400 },
    section: { size: 22, weight: 600 },
    roomName: { size: 22, weight: 600 },
    roomMeta: { size: 19, weight: 400 },
    product: { size: 25, weight: 500 },
    productSpec: { size: 21, weight: 400 },
    label: { size: 18, weight: 500 },
    value: { size: 22, weight: 500 },
    priceLarge: { size: 64, weight: 700 },
    priceLargeSym: { size: 28, weight: 600 },
    priceMedium: { size: 23, weight: 600 },
    priceSmall: { size: 20, weight: 500 },
    summaryMeta: { size: 19, weight: 400 },
    note: { size: 21, weight: 400 },
    footerTitle: { size: 24, weight: 600 },
    footerText: { size: 21, weight: 400 },
    footerCaption: { size: 19, weight: 400 },
    badge: { size: 20, weight: 600 },
    qrCaption: { size: 18, weight: 400 },
  },

  /* ---------- 阴影偏移（canvas 用偏移矩形模拟） ---------- */
  shadow: {
    offsetY: 2,
  },
} as const

export type FontKey = keyof typeof theme.font
export type Theme = typeof theme

/**
 * 窗帘报价单海报 — 数据组装 / 高度预估 / 绘制编排
 *
 * 职责：
 *  1. 定义海报只读数据模型（PosterData）
 *  2. 把 CurtainQuote 业务数据归一成 PosterData（客户视角房间行）
 *  3. 预估海报总高度（与 renderer 各分区返回高度保持一致）
 *  4. drawPoster：游标式顺序绘制所有分区
 *  5. createMockPosterData：本地无报价时的预览 mock
 */

import { theme } from "./theme"
import {
  drawBrandHeader,
  drawCustomerCard,
  drawStoreFooter,
  drawSummaryCard,
  drawRoomTable,
  type Ctx,
} from "./renderer"
import { formatDate, formatDiscount, maskPhone } from "../services/format"
import { roundMoney } from "../services/quote-calculator"
import type { CurtainQuote } from "../types/quote"

const T = theme

/* ================================================================
 *  数据模型
 * ================================================================ */

export interface PosterRoom {
  name: string
  widthLabel: string
  subtotal: number
}

export interface PosterSummary {
  finalAmount: number
  originalAmount: number
  discountAmount: number
  discountLabel: string
  spaceCount: number
}

export interface PosterCustomer {
  name: string
  phone: string
  address: string
  date: string
}

export interface PosterData {
  brandName: string
  brandSubtitle: string
  customer: PosterCustomer
  summary: PosterSummary
  rooms: PosterRoom[]
  store: PosterStore
}

export interface PosterStore {
  address: string
  phone: string
}

/* ================================================================
 *  业务数据 → 海报数据
 * ================================================================ */

/** 把 CurtainQuote 归一为 PosterData。 */
export function buildPosterData(quote: CurtainQuote): PosterData {
  let rooms: PosterRoom[]

  if (quote.mode === "normal") {
    rooms = quote.normalItems.map((item) => ({
      name: item.position || "未命名房间",
      widthLabel: `${item.width.toFixed(2)}m`,
      subtotal: item.amount,
    }))
  } else {
    rooms = quote.packageItems.map((item) => ({
      name: item.packageName,
      widthLabel: `布 ${item.fabricWidth.toFixed(2)}m / 纱 ${item.sheerWidth.toFixed(2)}m`,
      subtotal: item.amount,
    }))
  }

  if (rooms.length === 0) {
    rooms = [
      {
        name: "暂无明细",
        widthLabel: "—",
        subtotal: 0,
      },
    ]
  }

  const discountAmount = Math.max(0, roundMoney(quote.originalTotal - quote.finalAmount))

  return {
    brandName: "织梦人家纺窗帘",
    brandSubtitle: "为您定制的专属窗帘方案",
    customer: {
      name: quote.customer.name || "—",
      phone: maskPhone(quote.customer.phone || ""),
      address: quote.customer.address || "—",
      date: formatDate(quote.updatedAt),
    },
    summary: {
      finalAmount: quote.finalAmount,
      originalAmount: quote.originalTotal,
      discountAmount,
      discountLabel: formatDiscount(quote.finalDiscount),
      spaceCount: rooms.length,
    },
    rooms,
    store: {
      address: "成武县织梦人家纺窗帘",
      phone: "13655401508",
    },
  }
}

/* ================================================================
 *  高度预估 — 与 renderer 各分区返回值保持一致
 * ================================================================ */

/** 品牌头部高度。 */
export function measureHeaderHeight(): number {
  const titleGap = 20
  const dividerGap = 18
  return T.font.brand.size + titleGap + T.font.brandSub.size + dividerGap
}

/** 客户卡片高度。 */
export function measureCustomerHeight(): number {
  const padY = 16
  const rowH = T.font.value.size + 10
  return padY + rowH * 2 + padY
}

/** 汇总卡片高度。 */
export function measureSummaryHeight(): number {
  const padY = T.spacing.innerPadY
  return (
    padY +
    T.font.summaryMeta.size + 14 +
    T.font.priceLarge.size + 18 +
    T.font.summaryMeta.size +
    padY
  )
}

/** 房间表格高度：一个表格承载全部房间，房间多时只线性增加紧凑行高。 */
export function measureRoomTableHeight(roomCount: number): number {
  return T.spacing.innerPadY + T.font.section.size + 16 + 30 + roomCount * 52 + T.spacing.innerPadY
}

/** 海报总高度。 */
export function getPosterHeight(data: PosterData): number {
  return (
    T.spacing.padTop +
    measureHeaderHeight() +
    T.spacing.sectionGap +
    measureSummaryHeight() +
    T.spacing.cardGap +
    measureRoomTableHeight(data.rooms.length) +
    T.spacing.cardGap +
    measureCustomerHeight() +
    T.spacing.cardGap +
    measureStoreHeight() +
    T.spacing.padBottom
  )
}

/** 门店信息高度。 */
export function measureStoreHeight(): number {
  return T.font.footerCaption.size
}

/* ================================================================
 *  绘制编排 — 游标式顺序绘制
 * ================================================================ */

/** 在 ctx 上绘制完整海报。调用前需已 scale(DPR) 并 clear。 */
export function drawPoster(ctx: Ctx, data: PosterData): void {
  const w = T.width
  const ix = T.spacing.padX
  const cw = w - T.spacing.padX * 2

  // 背景
  ctx.fillStyle = T.color.bg
  ctx.fillRect(0, 0, w, getPosterHeight(data))

  let y = T.spacing.padTop

  // 1. 品牌头部
  y += drawBrandHeader(ctx, data.brandName, data.brandSubtitle, ix, y)
  y += T.spacing.sectionGap

  // 2. 最终报价主视觉
  y += drawSummaryCard(ctx, data.summary, ix, y, cw)
  y += T.spacing.cardGap

  // 3. 房间报价表
  y += drawRoomTable(ctx, data.rooms, ix, y, cw)
  y += T.spacing.cardGap

  // 4. 客户信息弱化到底部，用于客户确认归属。
  y += drawCustomerCard(ctx, data.customer, ix, y, cw)
  y += T.spacing.cardGap

  // 5. 门店信息展示固定联系方式。
  drawStoreFooter(ctx, data.store, ix, y, cw)
}

/* ================================================================
 *  Mock 数据 — 本地无报价时预览
 * ================================================================ */

export function createMockPosterData(): PosterData {
  return {
    brandName: "窗帘报价单",
    brandSubtitle: "为您定制的专属窗帘方案",
    customer: {
      name: "张先生",
      phone: "138****6688",
      address: "杭州市西湖区文三路 88 号",
      date: "2026-06-30",
    },
    summary: {
      finalAmount: 8680,
      originalAmount: 9800,
      discountAmount: 1120,
      discountLabel: "9折",
      spaceCount: 3,
    },
    rooms: [
      {
        name: "客厅",
        widthLabel: "3.00m",
        subtotal: 3280,
      },
      {
        name: "主卧",
        widthLabel: "2.80m",
        subtotal: 2600,
      },
      {
        name: "次卧",
        widthLabel: "2.40m",
        subtotal: 2800,
      },
    ],
    store: {
      address: "成武县织梦人家纺窗帘",
      phone: "13655401508",
    },
  }
}

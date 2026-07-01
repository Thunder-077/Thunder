import Taro from "@tarojs/taro"
import { calculateQuoteTotals } from "./quote-calculator"
import { createCurtainQuote } from "./quote-factory"
import type { CurtainQuote, CurtainQuoteMode, CurtainQuoteStatus, NormalQuoteItem } from "../types/quote"

const STORAGE_KEY = "thunder:miniapp:curtain-quotes:v1"

type LegacyNormalQuoteItem = Omit<Partial<NormalQuoteItem>, "sheerUnitPrice"> & {
  /** 兼容历史本地数据：旧版本没有独立纱单价字段。 */
  sheerUnitPrice?: number
}

/** 兼容旧版本普通报价明细：历史合并单价回填到布单价，纱单价默认留空。 */
function normalizeNormalItem(item: LegacyNormalQuoteItem): NormalQuoteItem {
  return {
    id: item.id ?? "",
    position: item.position ?? "",
    width: item.width ?? 0,
    height: item.height ?? 0,
    modelColor: item.modelColor ?? "",
    installRequirement: item.installRequirement ?? "",
    pleatRatio: item.pleatRatio ?? 2,
    fabricUnitPrice: item.fabricUnitPrice ?? 0,
    sheerUnitPrice: item.sheerUnitPrice ?? 0,
    trackUnitPrice: item.trackUnitPrice ?? 0,
    linerUnitPrice: item.linerUnitPrice ?? 0,
    ringUnitPrice: item.ringUnitPrice ?? 0,
    ringQuantity: item.ringQuantity ?? 0,
    installFee: item.installFee ?? 0,
    amount: item.amount ?? 0,
  }
}

/** 统一修正本地存储结构，避免页面层散落旧数据兼容分支。 */
function normalizeQuote(quote: CurtainQuote): CurtainQuote {
  return {
    ...quote,
    normalItems: Array.isArray(quote.normalItems) ? quote.normalItems.map((item) => normalizeNormalItem(item as LegacyNormalQuoteItem)) : [],
  }
}

/** 读取报价数组，兼容首次进入时没有本地数据的情况。 */
async function readQuoteList(): Promise<CurtainQuote[]> {
  const result = await Taro.getStorage<CurtainQuote[]>({ key: STORAGE_KEY }).catch(() => ({ data: [] as CurtainQuote[] }))
  return Array.isArray(result.data) ? result.data.map((quote) => normalizeQuote(quote)) : []
}

/** 写入完整报价数组，小程序多端均使用 Taro Storage 抽象。 */
async function writeQuoteList(quotes: CurtainQuote[]): Promise<void> {
  await Taro.setStorage({ key: STORAGE_KEY, data: quotes })
}

/** P0 首次进入不写入 UI 示例数据，报价列表只展示用户本机真实创建的数据。 */
export async function seedQuotesIfEmpty(): Promise<CurtainQuote[]> {
  return readQuoteList()
}

/** 获取全部报价，按更新时间倒序返回。 */
export async function listQuotes(): Promise<CurtainQuote[]> {
  const quotes = await seedQuotesIfEmpty()
  return [...quotes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** 根据 ID 获取单张报价。 */
export async function getQuote(id: string): Promise<CurtainQuote | null> {
  const quotes = await seedQuotesIfEmpty()
  return quotes.find((quote) => quote.id === id) ?? null
}

/** 新建报价草稿并写入本地存储。 */
export async function createQuoteDraft(customer: CurtainQuote["customer"]): Promise<CurtainQuote> {
  const quotes = await seedQuotesIfEmpty()
  const quote = createCurtainQuote(customer)
  await writeQuoteList([quote, ...quotes])
  return quote
}

/** 更新报价并自动重算合计。 */
export async function saveQuote(nextQuote: CurtainQuote): Promise<CurtainQuote> {
  const quotes = await seedQuotesIfEmpty()
  const calculated = calculateQuoteTotals(nextQuote)
  const nextQuotes = quotes.some((quote) => quote.id === calculated.id)
    ? quotes.map((quote) => (quote.id === calculated.id ? calculated : quote))
    : [calculated, ...quotes]
  await writeQuoteList(nextQuotes)
  return calculated
}

/** 快速切换报价方式，保留两种方式各自的明细数据。 */
export async function updateQuoteMode(id: string, mode: CurtainQuoteMode): Promise<CurtainQuote | null> {
  const quote = await getQuote(id)
  if (!quote) {
    return null
  }

  return saveQuote({ ...quote, mode })
}

/** 更新报价状态，用于保存确认、作废等动作。 */
export async function updateQuoteStatus(id: string, status: CurtainQuoteStatus): Promise<CurtainQuote | null> {
  const quote = await getQuote(id)
  if (!quote) {
    return null
  }

  return saveQuote({ ...quote, status })
}

/** 删除报价，P0 只从本地存储移除。 */
export async function deleteQuote(id: string): Promise<void> {
  const quotes = await seedQuotesIfEmpty()
  await writeQuoteList(quotes.filter((quote) => quote.id !== id))
}

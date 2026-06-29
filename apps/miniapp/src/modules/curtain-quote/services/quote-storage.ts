import Taro from "@tarojs/taro"
import { calculateQuoteTotals } from "./quote-calculator"
import { createCurtainQuote } from "./quote-factory"
import type { CurtainQuote, CurtainQuoteMode, CurtainQuoteStatus } from "../types/quote"

const STORAGE_KEY = "thunder:miniapp:curtain-quotes:v1"

/** 读取报价数组，兼容首次进入时没有本地数据的情况。 */
async function readQuoteList(): Promise<CurtainQuote[]> {
  const result = await Taro.getStorage<CurtainQuote[]>({ key: STORAGE_KEY }).catch(() => ({ data: [] as CurtainQuote[] }))
  return Array.isArray(result.data) ? result.data : []
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

import { pinyin } from "pinyin-pro"

export function toPinyinTokens(text: string): string[] {
  if (!text) return []
  return pinyin(text, { toneType: "none", type: "array" }) as string[]
}

export function pinyinEqual(a: string, b: string): boolean {
  if (a === b) return true
  if (!a || !b) return false
  const pa = pinyin(a, { toneType: "none" })
  const pb = pinyin(b, { toneType: "none" })
  return pa === pb && pa !== a
}

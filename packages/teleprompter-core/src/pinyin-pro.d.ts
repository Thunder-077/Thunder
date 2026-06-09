declare module "pinyin-pro" {
  export function pinyin(
    text: string,
    options?: {
      toneType?: "none" | "symbol" | "num"
      type?: "string" | "array"
    },
  ): string | string[]
}

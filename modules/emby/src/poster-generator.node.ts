import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { generatePoster } from "./poster-generator"
import type { GeneratePosterInput, PosterFontInput } from "./poster-generator"

const assetRoot = join(__dirname, "..", "assets", "fonts")
const defaultTitleFontPath = join(assetRoot, "ch.ttf")
const defaultSubtitleFontPath = join(assetRoot, "en.otf")

let defaultFontsPromise: Promise<{ titleFont: PosterFontInput; subtitleFont: PosterFontInput }> | null = null

async function loadDefaultPosterFonts(): Promise<{ titleFont: PosterFontInput; subtitleFont: PosterFontInput }> {
  defaultFontsPromise ??= Promise.all([
    readFile(defaultTitleFontPath),
    readFile(defaultSubtitleFontPath),
  ]).then(([titleFontData, subtitleFontData]) => ({
    titleFont: {
      family: "JellyfinPosterCH",
      data: titleFontData,
      format: "truetype",
    },
    subtitleFont: {
      family: "JellyfinPosterEN",
      data: subtitleFontData,
      format: "opentype",
    },
  }))

  return defaultFontsPromise
}

export async function generatePosterWithDefaultFonts(input: GeneratePosterInput): Promise<Uint8Array> {
  const fonts = await loadDefaultPosterFonts()

  return generatePoster({
    ...input,
    titleFont: input.titleFont ?? fonts.titleFont,
    subtitleFont: input.subtitleFont ?? fonts.subtitleFont,
  })
}

export { loadDefaultPosterFonts }

import fs from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"

// 动态导入 poster-generator
const posterModule = await import("./src/poster-generator.ts")
const { generatePoster } = posterModule

const inputDir = "D:/self/Thunder/data/python-poster-input/foreign-tv"
const repoDir = path.join(process.env.TEMP ?? "", "happyququ-jellyfin-library-poster")
const outputDir = "D:/self/Thunder/data/generated-posters"

// 确保输出目录存在
await fs.mkdir(outputDir, { recursive: true })

// 读取海报图片
const posters = await Promise.all(
  Array.from({ length: 9 }, (_, index) => fs.readFile(path.join(inputDir, `${index + 1}.jpg`)))
)

// 读取字体
const titleFontData = await fs.readFile(path.join(repoDir, "font/ch.ttf"))
const subtitleFontData = await fs.readFile(path.join(repoDir, "font/en.otf"))

const common = {
  title: "海外剧集",
  subtitle: "FOREIGN TV",
  posters,
  titleFont: { family: "JellyfinPosterCH", data: titleFontData, format: "truetype" as const },
  subtitleFont: { family: "JellyfinPosterEN", data: subtitleFontData, format: "opentype" as const },
  randomSeed: 20260507,
}

for (const variant of ["columns", "cards"] as const) {
  console.log(`Generating ${variant} variant...`)
  const bytes = await generatePoster({ ...common, variant })
  const out = path.join(outputDir, `ts-realigned-foreign-tv-${variant}-v2.png`)
  await fs.writeFile(out, bytes)
  const meta = await sharp(bytes).metadata()
  console.log(`${variant}\t${out}\t${bytes.byteLength}\t${meta.width}x${meta.height}`)
}

console.log("Done!")

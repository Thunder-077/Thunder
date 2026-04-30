const sharp = require("sharp")
const fs = require("fs")
const path = require("path")

const SRC = `C:\\Users\\wangc\\Downloads\\Gemini_Generated_Image_pe503ope503ope50.png`
const PUBLIC_DIR = path.join(__dirname, "../public")

async function main() {
  const srcBuffer = fs.readFileSync(SRC)
  const metadata = await sharp(srcBuffer).metadata()
  console.log(`Source: ${metadata.width}x${metadata.height}, ${metadata.format}, ${metadata.channels} channels`)

  const transparentPng = await sharp(srcBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { data } = transparentPng
  const { info } = transparentPng
  const channels = info.channels
  const width = info.width
  const height = info.height

  for (let i = 0; i < data.length; i += channels) {
    if (channels >= 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      if (r > 240 && g > 240 && b > 240) {
        data[i + 3] = 0
      }
    }
  }

  // Trim transparent edges to find content bounds
  const trimmed = await sharp(data, {
    raw: { width, height, channels },
  }).png().trim({ threshold: 10 }).toBuffer()

  const trimmedMeta = await sharp(trimmed).metadata()
  console.log(`After trim: ${trimmedMeta.width}x${trimmedMeta.height}`)

  const sizes = [
    { name: "logo", size: null },
    { name: "favicon-16", size: 16 },
    { name: "favicon-32", size: 32 },
    { name: "favicon-64", size: 64 },
    { name: "favicon-192", size: 192 },
    { name: "icon-256", size: 256 },
    { name: "icon-512", size: 512 },
    { name: "logo-sidebar", size: 40 },
  ]

  for (const s of sizes) {
    if (!s.size) {
      await sharp(trimmed).toFile(path.join(PUBLIC_DIR, `${s.name}.png`))
      console.log(`Created: public/${s.name}.png`)
    } else {
      await sharp(trimmed)
        .resize(s.size, s.size, { fit: "cover", position: "center" })
        .toFile(path.join(PUBLIC_DIR, `${s.name}.png`))
      console.log(`Created: public/${s.name}.png (${s.size}x${s.size})`)
    }
  }

  const favicon64Base64 = fs.readFileSync(path.join(PUBLIC_DIR, "favicon-64.png")).toString("base64")
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <image width="64" height="64" href="data:image/png;base64,${favicon64Base64}"/>
</svg>`
  fs.writeFileSync(path.join(PUBLIC_DIR, "favicon.svg"), svgContent)
  console.log("Created: public/favicon.svg")

  console.log("\nDone!")
}

main().catch(console.error)

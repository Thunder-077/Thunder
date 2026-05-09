import sharp from "sharp"

export type GeneratePosterVariant = "columns" | "cards"
export type ImageInput = Uint8Array | ArrayBuffer

export interface PosterFontInput {
  family: string
  data?: Uint8Array | ArrayBuffer
  format?: "truetype" | "opentype" | "woff" | "woff2"
}

export interface PosterTextShadowInput {
  enabled?: boolean
  color?: readonly [number, number, number] | readonly [number, number, number, number]
  offset?: readonly [number, number]
}

export interface GeneratePosterInput {
  title: string
  subtitle?: string
  posters: ImageInput[]
  variant?: GeneratePosterVariant
  width?: number
  height?: number
  output?: "png" | "jpeg" | "webp"
  titleFont?: PosterFontInput
  subtitleFont?: PosterFontInput
  titleShadow?: PosterTextShadowInput
  subtitleShadow?: PosterTextShadowInput
  randomSeed?: number
  colors?: Array<readonly [number, number, number] | readonly [number, number, number, number]>
  background?: {
    leftColor?: readonly [number, number, number]
    rightColor?: readonly [number, number, number]
  }
}

interface RgbaColor {
  r: number
  g: number
  b: number
  a: number
}

interface ColorCount {
  color: RgbaColor
  count: number
}

interface OverlayInput {
  input: Buffer
  left: number
  top: number
}

interface PreparedOverlayInput extends OverlayInput {
  input: Buffer
}

const DEFAULT_WIDTH = 1920
const DEFAULT_HEIGHT = 1080
// 对齐 Python 版 custom_order="315426987"，优先把 1、2 放到更显眼的位置。
const COLUMN_ORDER = [2, 0, 4, 3, 1, 5, 8, 7, 6]

function toUint8Array(input: ImageInput): Uint8Array {
  if (input instanceof Uint8Array) {
    return input
  }

  return new Uint8Array(input)
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function toRgbaColor(color: readonly number[]): RgbaColor {
  return {
    r: clampChannel(color[0] ?? 0),
    g: clampChannel(color[1] ?? 0),
    b: clampChannel(color[2] ?? 0),
    a: clampChannel(color[3] ?? 255),
  }
}

function rgbaToCss(color: RgbaColor): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${(color.a / 255).toFixed(4)})`
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

function createSeededRandom(seed: number): () => number {
  let current = seed >>> 0

  return () => {
    current += 0x6d2b79f5
    let value = current
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function hslToRgb(hue: number, saturation: number, lightness: number): RgbaColor {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const huePrime = hue / 60
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1))
  const [r1, g1, b1] = huePrime < 1
    ? [chroma, x, 0]
    : huePrime < 2
      ? [x, chroma, 0]
      : huePrime < 3
        ? [0, chroma, x]
        : huePrime < 4
          ? [0, x, chroma]
          : huePrime < 5
            ? [x, 0, chroma]
            : [chroma, 0, x]
  const m = lightness - chroma / 2

  return {
    r: clampChannel((r1 + m) * 255),
    g: clampChannel((g1 + m) * 255),
    b: clampChannel((b1 + m) * 255),
    a: 255,
  }
}

function resolveSeed(input: GeneratePosterInput, salt: string): number {
  return input.randomSeed ?? hashString(`${input.title}|${input.subtitle ?? ""}|${salt}`)
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function encodeFontFace(font: PosterFontInput | undefined): string {
  if (!font?.data) {
    return ""
  }

  const mimeType = font.format === "opentype"
    ? "font/opentype"
    : font.format === "woff"
      ? "font/woff"
      : font.format === "woff2"
        ? "font/woff2"
        : "font/truetype"
  const bytes = toUint8Array(font.data)
  const base64 = Buffer.from(bytes).toString("base64")

  return `
    @font-face {
      font-family: "${escapeXml(font.family)}";
      src: url("data:${mimeType};base64,${base64}");
    }
  `
}

function createSvg(width: number, height: number, body: string, fonts: PosterFontInput[] = []): Buffer {
  const fontFaces = fonts.map(encodeFontFace).join("\n")

  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <style>
        ${fontFaces}
        text { paint-order: stroke; }
      </style>
      ${body}
    </svg>
  `)
}

async function createMaskedGradient(width: number, height: number, left: RgbaColor, right: RgbaColor): Promise<Buffer> {
  const data = Buffer.alloc(width * height * 4)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const mask = (x / width) ** 0.7
      const offset = (y * width + x) * 4
      data[offset] = clampChannel(left.r * (1 - mask) + right.r * mask)
      data[offset + 1] = clampChannel(left.g * (1 - mask) + right.g * mask)
      data[offset + 2] = clampChannel(left.b * (1 - mask) + right.b * mask)
      data[offset + 3] = clampChannel(left.a * (1 - mask) + right.a * mask)
    }
  }

  return sharp(data, {
    raw: {
      width,
      height,
      channels: 4,
    },
  }).png().toBuffer()
}

function rgbToHslLightness(color: RgbaColor): number {
  const r = color.r / 255
  const g = color.g / 255
  const b = color.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)

  return (max + min) / 2
}

function chooseThemeColor(colors: ColorCount[]): RgbaColor | null {
  if (!colors?.length) {
    return null
  }

  for (const color of colors.slice(0, 10)) {
    const lightness = rgbToHslLightness(color.color)
    if (lightness >= 0.3 && lightness <= 0.7) {
      return color.color
    }
  }

  return null
}

function brighten(color: RgbaColor): RgbaColor {
  return {
    r: Math.min(230, Math.max(Math.round(color.r * 1.9), color.r + 80)),
    g: Math.min(230, Math.max(Math.round(color.g * 1.9), color.g + 80)),
    b: Math.min(230, Math.max(Math.round(color.b * 1.9), color.b + 80)),
    a: color.a,
  }
}

function darken(color: RgbaColor): RgbaColor {
  return {
    r: clampChannel(color.r * 0.65),
    g: clampChannel(color.g * 0.65),
    b: clampChannel(color.b * 0.65),
    a: color.a,
  }
}

async function getDominantPosterColors(input: Uint8Array): Promise<ColorCount[]> {
  const { data } = await sharp(input)
    .resize(100, 150, { fit: "cover" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const buckets = new Map<string, ColorCount>()

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index] ?? 0
    const g = data[index + 1] ?? 0
    const b = data[index + 2] ?? 0
    const a = data[index + 3] ?? 0
    const brightness = (r + g + b) / 3

    if (a < 200 || brightness < 30 || brightness > 220) {
      continue
    }

    const key = `${r},${g},${b},255`
    const current = buckets.get(key)
    if (current) {
      current.count += 1
    } else {
      buckets.set(key, { color: { r, g, b, a: 255 }, count: 1 })
    }
  }

  return [...buckets.values()]
    .sort((left, right) => right.count - left.count)
    .slice(0, 10)
}

async function samplePosterColor(input: Uint8Array): Promise<RgbaColor> {
  return samplePosterColorAt(input, 0.62, 0.68)
}

async function samplePosterColorAt(input: Uint8Array, xRatio: number, yRatio: number): Promise<RgbaColor> {
  const image = sharp(input).ensureAlpha()
  const metadata = await image.metadata()
  const width = metadata.width ?? 1
  const height = metadata.height ?? 1
  const left = Math.floor(width * xRatio)
  const top = Math.floor(height * yRatio)
  const { data } = await image
    .extract({ left: Math.min(left, width - 1), top: Math.min(top, height - 1), width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true })

  return {
    r: clampChannel((data[0] ?? 80) + 100),
    g: clampChannel((data[1] ?? 120) + 50),
    b: clampChannel(data[2] ?? 160),
    a: data[3] ?? 255,
  }
}

async function createBackground(input: GeneratePosterInput, width: number, height: number): Promise<Buffer> {
  if (input.background?.leftColor && input.background.rightColor) {
    return createMaskedGradient(width, height, toRgbaColor(input.background.leftColor), toRgbaColor(input.background.rightColor))
  }

  const firstPoster = input.posters[0] ? toUint8Array(input.posters[0]) : null
  const posterColors = input.colors
    ? input.colors.map((color) => ({ color: toRgbaColor(color), count: 1 }))
    : firstPoster
      ? await getDominantPosterColors(firstPoster)
      : []

  // cards 和 columns 布局都支持动态提取海报颜色
  const seedSuffix = input.variant === "cards" ? "cards-background" : "columns-background"
  const random = createSeededRandom(resolveSeed(input, seedSuffix))
  const selected = chooseThemeColor(posterColors)
    ?? hslToRgb(random() * 360, 0.5 + random() * 0.5, 0.5 + random() * 0.3)
  const left = darken(selected)

  return createMaskedGradient(width, height, left, brighten(left))
}

async function createRoundedPoster(input: Uint8Array, width: number, height: number, radius: number): Promise<Buffer> {
  const image = await sharp(input)
    .resize(width, height, { fit: "cover", position: "center" })
    .png()
    .toBuffer()
  const mask = createSvg(width, height, `
    <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="#fff" />
  `)

  return sharp(image)
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer()
}

async function addShadow(
  image: Buffer,
  offsetX: number,
  offsetY: number,
  blurRadius: number,
  shadowOpacity: number
): Promise<Buffer> {
  const metadata = await sharp(image).metadata()
  const width = metadata.width ?? 1
  const height = metadata.height ?? 1
  const canvasWidth = width + offsetX + blurRadius * 2
  const canvasHeight = height + offsetY + blurRadius * 2
  const shadowRect = createSvg(canvasWidth, canvasHeight, `
    <rect x="${blurRadius + offsetX}" y="${blurRadius + offsetY}" width="${width}" height="${height}"
      fill="rgba(0, 0, 0, ${(shadowOpacity / 255).toFixed(4)})" />
  `)
  const blurredShadow = await sharp(shadowRect).blur(blurRadius).png().toBuffer()

  return sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: blurredShadow, left: 0, top: 0 },
      { input: image, left: blurRadius, top: blurRadius },
    ])
    .png()
    .toBuffer()
}

async function createColumnPoster(input: Uint8Array, width: number, height: number, cornerRadius: number): Promise<Buffer> {
  const roundedPoster = await createRoundedPoster(input, width, height, cornerRadius)
  return addShadow(roundedPoster, 15, 15, 30, 100)
}

function toSharpRotationAngle(pillowAngle: number): number {
  // PIL 使用正角逆时针，sharp/libvips 使用正角顺时针；配置值沿用 Python 仓库。
  return -pillowAngle
}

async function prepareOverlayForCanvas(
  overlay: OverlayInput,
  canvasWidth: number,
  canvasHeight: number
): Promise<PreparedOverlayInput | null> {
  const metadata = await sharp(overlay.input).metadata()
  const overlayWidth = metadata.width ?? 0
  const overlayHeight = metadata.height ?? 0
  const cropLeft = Math.max(0, -overlay.left)
  const cropTop = Math.max(0, -overlay.top)
  const visibleLeft = Math.max(0, overlay.left)
  const visibleTop = Math.max(0, overlay.top)
  const cropWidth = Math.min(overlayWidth - cropLeft, canvasWidth - visibleLeft)
  const cropHeight = Math.min(overlayHeight - cropTop, canvasHeight - visibleTop)

  if (cropWidth <= 0 || cropHeight <= 0) {
    return null
  }

  // PIL paste 允许图层超出画布并自然裁切，sharp composite 需要先裁成可见区域。
  const input = cropLeft === 0 && cropTop === 0 && cropWidth === overlayWidth && cropHeight === overlayHeight
    ? overlay.input
    : await sharp(overlay.input)
      .extract({
        left: cropLeft,
        top: cropTop,
        width: cropWidth,
        height: cropHeight,
      })
      .png()
      .toBuffer()

  return {
    input,
    left: visibleLeft,
    top: visibleTop,
  }
}

async function prepareOverlaysForCanvas(
  overlays: OverlayInput[],
  canvasWidth: number,
  canvasHeight: number
): Promise<PreparedOverlayInput[]> {
  const prepared = await Promise.all(
    overlays.map((overlay) => prepareOverlayForCanvas(overlay, canvasWidth, canvasHeight))
  )

  return prepared.filter((overlay): overlay is PreparedOverlayInput => overlay !== null)
}

async function renderColumnsVariant(input: GeneratePosterInput, width: number, height: number): Promise<Buffer> {
  const posters = COLUMN_ORDER
    .map((index) => input.posters[index])
    .filter((poster): poster is ImageInput => Boolean(poster))
    .slice(0, 9)
    .map(toUint8Array)

  if (posters.length === 0) {
    throw new Error("generatePoster requires at least one poster image")
  }

  const result = sharp(await createBackground(input, width, height))
  const rows = 3
  const cols = 3
  const margin = 22
  const cellWidth = 410
  const cellHeight = 610
  const cornerRadius = 46.1
  const rotationAngle = -15.8
  const startX = 835
  const startY = -362
  const columnSpacing = 100
  const columnHeight = rows * cellHeight + (rows - 1) * margin
  const overlays: OverlayInput[] = []

  for (let colIndex = 0; colIndex < cols; colIndex += 1) {
    const columnPosters = posters.slice(colIndex * rows, colIndex * rows + rows)
    if (!columnPosters.length) {
      continue
    }

    const columnOverlays = await Promise.all(
      columnPosters.map(async (poster, rowIndex) => ({
        input: await createColumnPoster(poster, cellWidth, cellHeight, cornerRadius),
        left: 0,
        top: rowIndex * (cellHeight + margin),
      }))
    )
    // 阴影参数: offsetX=15, offsetY=15, blurRadius=30，需要额外空间
    const shadowExtra = 30 + 15 + 30 * 2
    const columnImageWidth = cellWidth + shadowExtra
    const columnImageHeight = columnHeight + shadowExtra
    const columnImage = await sharp({
      create: {
        width: columnImageWidth,
        height: columnImageHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(columnOverlays)
      .png()
      .toBuffer()
    const rotationCanvasSize = Math.ceil(Math.sqrt(columnImageWidth ** 2 + columnImageHeight ** 2) * 1.5)
    const rotationCanvas = await sharp({
      create: {
        width: rotationCanvasSize,
        height: rotationCanvasSize,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{
        input: columnImage,
        left: Math.round((rotationCanvasSize - cellWidth) / 2),
        top: Math.round((rotationCanvasSize - columnHeight) / 2),
      }])
      .png()
      .toBuffer()
    const rotatedColumn = await sharp(rotationCanvas)
      .rotate(toSharpRotationAngle(rotationAngle), { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
    const rotatedMetadata = await sharp(rotatedColumn).metadata()
    let columnCenterX = startX + colIndex * columnSpacing
    let columnCenterY = startY + Math.floor(columnHeight / 2)

    if (colIndex === 1) {
      columnCenterX += cellWidth - 50
    } else if (colIndex === 2) {
      columnCenterY -= 155
      columnCenterX += cellWidth * 2 - 40
    }

    overlays.push({
      input: rotatedColumn,
      left: Math.round(columnCenterX - (rotatedMetadata.width ?? 0) / 2 + cellWidth / 2),
      top: Math.round(columnCenterY - (rotatedMetadata.height ?? 0) / 2),
    })
  }

  const random = createSeededRandom(resolveSeed(input, "columns-accent"))
  const accentColor = await samplePosterColorAt(
    posters[0],
    0.5 + random() * 0.3,
    0.5 + random() * 0.3
  )
  overlays.push({
    input: createColumnsTitleOverlay(input, width, height, accentColor),
    left: 0,
    top: 0,
  })

  return result.composite(await prepareOverlaysForCanvas(overlays, width, height)).png().toBuffer()
}

function splitSubtitleLines(subtitle: string): string[] {
  return subtitle.trim().split(/\s+/).filter(Boolean)
}

function resolveSubtitleFontSize(subtitle: string): number {
  const words = splitSubtitleLines(subtitle)
  const longestWordLength = Math.max(...words.map((word) => word.length), 0)
  if (longestWordLength <= 10 && words.length <= 3) {
    return 50
  }

  return Math.max(30, Math.round(50 * (10 / Math.max(longestWordLength, words.length * 3)) ** 0.8))
}

function resolveTextShadow(
  shadow: PosterTextShadowInput | undefined,
  defaultEnabled: boolean
): Required<PosterTextShadowInput> {
  return {
    enabled: shadow?.enabled ?? defaultEnabled,
    color: shadow?.color ?? [0, 0, 0, 180],
    offset: shadow?.offset ?? [2, 2],
  }
}

function createTextSvg({
  text,
  x,
  y,
  family,
  fontSize,
  shadow,
  alreadyEscaped = false,
}: {
  text: string
  x: number
  y: number
  family: string
  fontSize: number
  shadow: Required<PosterTextShadowInput>
  alreadyEscaped?: boolean
}): string {
  const content = alreadyEscaped ? text : escapeXml(text)
  const escapedFamily = escapeXml(family)
  const shadowColor = toRgbaColor(shadow.color)
  const [offsetX, offsetY] = shadow.offset
  const shadowText = shadow.enabled
    ? `<text x="${x + offsetX}" y="${y + offsetY}" font-family="${escapedFamily}" font-size="${fontSize}" fill="${rgbaToCss(shadowColor)}">${content}</text>`
    : ""

  return `
    ${shadowText}
    <text x="${x}" y="${y}" font-family="${escapedFamily}" font-size="${fontSize}" fill="#fff">${content}</text>
  `
}

function createColumnsTitleOverlay(input: GeneratePosterInput, width: number, height: number, accentColor: RgbaColor): Buffer {
  const titleFamily = input.titleFont?.family ?? "serif"
  const subtitleFamily = input.subtitleFont?.family ?? "sans-serif"
  const title = escapeXml(input.title)
  const subtitle = input.subtitle?.trim() ?? ""
  const subtitleLines = splitSubtitleLines(subtitle)
  const subtitleFontSize = subtitle ? resolveSubtitleFontSize(subtitle) : 50
  const lineSpacing = 5
  const colorBlockHeight = subtitle ? 55 + (subtitleLines.length - 1) * (subtitleFontSize + lineSpacing) : 0
  const titleShadow = resolveTextShadow(input.titleShadow, true)
  const subtitleShadow = resolveTextShadow(input.subtitleShadow, true)
  const subtitleText = subtitleLines.map((line, index) => createTextSvg({
    text: line,
    x: 124.68,
    y: 624.55 + subtitleFontSize + index * (subtitleFontSize + lineSpacing),
    family: subtitleFamily,
    fontSize: subtitleFontSize,
    shadow: subtitleShadow,
  })).join("")

  return createSvg(width, height, `
    ${createTextSvg({
      text: title,
      x: 73.32,
      y: 427.34 + 163,
      family: titleFamily,
      fontSize: 163,
      shadow: titleShadow,
      alreadyEscaped: true,
    })}
    ${subtitle ? `<rect x="84.38" y="620.06" width="21.51" height="${colorBlockHeight}" fill="${rgbaToCss(accentColor)}" />` : ""}
    ${subtitleText}
  `, [input.titleFont, input.subtitleFont].filter((font): font is PosterFontInput => Boolean(font)))
}

async function createCardPoster(input: Uint8Array, width: number, height: number): Promise<Buffer> {
  const roundedPoster = await createRoundedPoster(input, width, height, Math.round(width * 0.07))
  // 加强阴影：更柔、更大、向下偏移更多
  return addShadow(roundedPoster, 10, 16, 24, 70)
}

async function renderCardsVariant(input: GeneratePosterInput, width: number, height: number): Promise<Buffer> {
  // 最多使用5张海报，实现扇形布局
  const posters = input.posters.slice(0, 5).map(toUint8Array)
  if (posters.length === 0) {
    throw new Error("generatePoster requires at least one poster image")
  }

  const background = await createBackground(input, width, height)

  // 卡片布局参考 Jellyfin 海报模板：整体下压、轻微外展，并通过重叠形成向中心收拢的舞台感。
  // 索引对应: 0=左2, 1=左1, 2=中间, 3=右1, 4=右2。
  const layoutConfig = [
    { scale: 0.88, rotation: 4, offsetX: -620, offsetY: -28 },
    { scale: 0.97, rotation: 3, offsetX: -330, offsetY: -8 },
    { scale: 1.02, rotation: 0, offsetX: 0, offsetY: 10 },
    { scale: 0.97, rotation: -3, offsetX: 330, offsetY: -8 },
    { scale: 0.88, rotation: -4, offsetX: 620, offsetY: -28 },
  ]

  // 以 2:3 海报比例为基准，避免中间卡片过高导致遮挡两侧内容。
  const baseWidth = 420
  const baseHeight = 600
  const centerX = Math.floor(width / 2)
  // 底部锚点留出少量安全边距，旋转后的阴影不会被画布裁切。
  const bottomY = height - 45
  const overlays: OverlayInput[] = []

  // 从外向内渲染（先渲染两侧，最后渲染中间，确保中间在最上层）
  const renderOrder = posters.length === 1 ? [2] :
    posters.length === 2 ? [1, 3] :
    posters.length === 3 ? [1, 3, 2] :
    posters.length === 4 ? [0, 3, 1, 2] :
    [0, 4, 1, 3, 2]

  for (const layoutIndex of renderOrder) {
    if (layoutIndex >= posters.length) continue

    const poster = posters[layoutIndex]
    const config = layoutConfig[layoutIndex]

    const cardWidth = Math.round(baseWidth * config.scale)
    const cardHeight = Math.round(baseHeight * config.scale)

    // 创建卡片（带圆角和阴影）
    let card = await createCardPoster(poster, cardWidth, cardHeight)

    // 应用旋转
    if (config.rotation !== 0) {
      card = await sharp(card)
        .rotate(toSharpRotationAngle(config.rotation), { background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer()
    }

    const cardMetadata = await sharp(card).metadata()
    const cardActualWidth = cardMetadata.width ?? cardWidth
    const cardActualHeight = cardMetadata.height ?? cardHeight

    // 计算位置：底部对齐 + offsetY 微调（两侧海报稍微上移）
    const left = Math.round(centerX + config.offsetX - cardActualWidth / 2)
    const top = Math.round(bottomY + config.offsetY - cardActualHeight)

    overlays.push({ input: card, left, top })
  }

  overlays.push({
    input: createCardsTitleOverlay(input, width, height),
    left: 0,
    top: 0,
  })

  return sharp(background).composite(await prepareOverlaysForCanvas(overlays, width, height)).png().toBuffer()
}

function createCardsTitleOverlay(input: GeneratePosterInput, width: number, height: number): Buffer {
  const titleFamily = input.titleFont?.family ?? "serif"
  const subtitleFamily = input.subtitleFont?.family ?? "sans-serif"

  // 标题配置：参考图风格 - 标题在画面上半部分
  const titleConfig = {
    boxWidth: 200,
    boxHeight: 195,
    gap: 20,
    fontSize: 120,
  }

  const { boxWidth, boxHeight, gap, fontSize } = titleConfig
  const titleWidth = input.title.length * boxWidth + Math.max(0, input.title.length - 1) * gap
  const titleX = Math.round(width / 2 - titleWidth / 2)
  const titleY = 95 // 标题略微上移，保持与卡片区的留白。

  // 方框：白色描边 + 很轻的白色透明填充
  const boxes = [...input.title].map((char, index) => {
    const x = titleX + index * (boxWidth + gap)
    return `
      <rect x="${x}" y="${titleY}" width="${boxWidth}" height="${boxHeight}"
        fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.75)" stroke-width="2" />
      <text x="${x + boxWidth / 2}" y="${titleY + boxHeight / 2 + fontSize * 0.36}"
        text-anchor="middle" font-family="${escapeXml(titleFamily)}" font-size="${fontSize}" fill="#fff">${escapeXml(char)}</text>
    `
  }).join("")

  // 英文副标题：带两侧装饰横线
  const subtitle = input.subtitle?.trim()
  const subtitleY = titleY + 230
  const subtitleFontSize = 44
  const letterSpacing = 8
  // SVG 中无法直接测量字体宽度，这里按标题字符数估算安全半宽，避免横线穿过英文标题。
  const subtitleHalfWidth = Math.round(((subtitle?.length ?? 0) * subtitleFontSize * 0.6 + Math.max(0, (subtitle?.length ?? 0) - 1) * letterSpacing) / 2)
  const lineInnerX = subtitleHalfWidth + 45
  const lineWidth = 150
  const lineOpacity = 0.8

  const subtitleOverlay = subtitle ? `
    <g transform="translate(${width / 2}, ${subtitleY})">
      <!-- 左侧横线 - 与文字垂直居中 -->
      <line x1="-${lineInnerX + lineWidth}" y1="${subtitleFontSize * 0.36}" x2="-${lineInnerX}" y2="${subtitleFontSize * 0.36}"
        stroke="rgba(255,255,255,${lineOpacity})" stroke-width="1.5" />
      <!-- 英文副标题 -->
      <text x="0" y="${subtitleFontSize * 0.36}" text-anchor="middle" dominant-baseline="middle"
        font-family="${escapeXml(subtitleFamily)}" font-size="${subtitleFontSize}"
        fill="#fff" letter-spacing="${letterSpacing}">${escapeXml(subtitle)}</text>
      <!-- 右侧横线 - 与文字垂直居中 -->
      <line x1="${lineInnerX}" y1="${subtitleFontSize * 0.36}" x2="${lineInnerX + lineWidth}" y2="${subtitleFontSize * 0.36}"
        stroke="rgba(255,255,255,${lineOpacity})" stroke-width="1.5" />
    </g>
  ` : ""

  return createSvg(width, height, `${boxes}${subtitleOverlay}`, [input.titleFont, input.subtitleFont].filter((font): font is PosterFontInput => Boolean(font)))
}

export async function generatePoster(input: GeneratePosterInput): Promise<Uint8Array> {
  const width = input.width ?? DEFAULT_WIDTH
  const height = input.height ?? DEFAULT_HEIGHT
  const variant = input.variant ?? "columns"
  const pngBuffer = variant === "cards"
    ? await renderCardsVariant(input, width, height)
    : await renderColumnsVariant(input, width, height)

  if (input.output === "jpeg") {
    return sharp(pngBuffer).jpeg({ quality: 92 }).toBuffer()
  }

  if (input.output === "webp") {
    return sharp(pngBuffer).webp({ quality: 92 }).toBuffer()
  }

  return pngBuffer
}

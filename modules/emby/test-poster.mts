import fs from "node:fs/promises"
import { readFileSync } from "node:fs"
import path from "node:path"
import sharp from "sharp"
import { prisma } from "@thunder/database"

// 动态导入 poster-generator
const posterModule = await import("./src/poster-generator.ts")
const { generatePoster } = posterModule

const fontDir = path.join(import.meta.dirname, "assets", "fonts")
const outputDir = "D:\\self\\emos"
const envFilePath = path.join(import.meta.dirname, "..", "..", "apps", "api", ".env")

/**
 * 从 apps/api/.env 读取 DATABASE_URL
 */
function loadDatabaseUrl(): string {
  try {
    const envContent = readFileSync(envFilePath, "utf-8")
    const match = envContent.match(/^DATABASE_URL=(.+)$/m)
    if (match?.[1]) {
      return match[1].trim().replace(/^["']|["']$/g, "")
    }
  } catch {
    // ignore
  }
  throw new Error(`DATABASE_URL not found in ${envFilePath}`)
}

// 设置环境变量
process.env.DATABASE_URL = loadDatabaseUrl()
console.log(`Loaded DATABASE_URL from ${envFilePath}\n`)

// 确保输出目录存在
await fs.mkdir(outputDir, { recursive: true })

/**
 * 片单配置：slug → 输出文件名
 */
const PLAYLIST_CONFIG: Array<{ slug: string; name: string; outputFile: string; subtitle: string }> = [
  { slug: "domestic-tv", name: "国产剧集", outputFile: "chinese_tv.png", subtitle: "DOMESTIC TV" },
  { slug: "domestic-movie", name: "国产电影", outputFile: "chinese_movie.png", subtitle: "DOMESTIC MOVIE" },
  { slug: "foreign-tv", name: "海外剧集", outputFile: "foreign_tv.png", subtitle: "FOREIGN TV" },
  { slug: "foreign-movie", name: "海外电影", outputFile: "foreign_movie.png", subtitle: "FOREIGN MOVIE" },
  { slug: "anime", name: "动漫", outputFile: "anime.png", subtitle: "ANIME" },
]

/**
 * 从数据库随机获取指定片单的海报
 */
async function getRandomPostersFromDb(slug: string, name: string, count: number): Promise<{ posters: Buffer[]; titles: string[] }> {
  const taskResult = await prisma.$queryRaw<Array<{ run_id: string }>>`
    SELECT run_id FROM emby_watch_refresh_task
    WHERE slug = ${slug}
    ORDER BY updated_at DESC
    LIMIT 1
  `

  const runId = taskResult[0]?.run_id
  if (!runId) {
    throw new Error(`No refresh task found for slug: ${slug}`)
  }

  const items = await prisma.$queryRaw<Array<{ poster_url: string | null; title: string }>>`
    SELECT poster_url, title
    FROM emby_watch_refresh_item
    WHERE slug = ${slug} AND run_id = ${runId} AND poster_url IS NOT NULL AND poster_url != ''
    ORDER BY RANDOM()
    LIMIT ${count}
  `

  if (items.length === 0) {
    throw new Error(`No posters found for slug: ${slug}`)
  }

  console.log(`  Found ${items.length} posters`)

  const posters: Buffer[] = []
  const titles: string[] = []

  for (const item of items) {
    try {
      const response = await fetch(item.poster_url!)
      if (!response.ok) {
        console.warn(`    Failed to fetch: ${item.title} (${response.status})`)
        continue
      }
      const buffer = Buffer.from(await response.arrayBuffer())
      posters.push(buffer)
      titles.push(item.title)
    } catch {
      console.warn(`    Failed to download: ${item.title}`)
    }
  }

  return { posters, titles }
}

// 读取字体
// const titleFontData = await fs.readFile(path.join(fontDir, "ch.otf"))
// const subtitleFontData = await fs.readFile(path.join(fontDir, "en.ttf"))

console.log(`Generating covers for ${PLAYLIST_CONFIG.length} playlists:\n`)

for (const config of PLAYLIST_CONFIG) {
  console.log(`Processing: ${config.name} (${config.slug})`)

  try {
    const { posters, titles } = await getRandomPostersFromDb(config.slug, config.name, 9)

    if (posters.length === 0) {
      console.log(`  Skipped: no valid posters\n`)
      continue
    }

    console.log(`  Using ${posters.length} posters: ${titles.slice(0, 3).join(", ")}${titles.length > 3 ? "..." : ""}`)

    const generateInput = {
      title: config.name,
      subtitle: config.subtitle,
      posters,
      variant: "columns" as const,
      titleFont: {
        family: "思源宋体 Heavy",
      },
      subtitleFont: {
        family: "Orbitron",
      },
      randomSeed: hashString(config.slug),
    }

    const bytes = await generatePoster(generateInput)
    const outPath = path.join(outputDir, config.outputFile)
    await fs.writeFile(outPath, bytes)
    const meta = await sharp(bytes).metadata()
    console.log(`  Saved: ${config.outputFile} (${meta.width}x${meta.height}, ${(bytes.byteLength / 1024).toFixed(1)}KB)\n`)
  } catch (error) {
    console.log(`  Error: ${error instanceof Error ? error.message : String(error)}\n`)
  }
}

await prisma.$disconnect()
console.log(`Done! All covers saved to: ${outputDir}`)

function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

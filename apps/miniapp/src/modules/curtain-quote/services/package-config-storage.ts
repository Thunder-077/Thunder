import Taro from "@tarojs/taro"
import { createLocalId } from "./quote-factory"
import type { PackageConfig } from "../types/quote"

const STORAGE_KEY = "thunder:miniapp:curtain-package-configs:v1"

/** 套餐配置输入结构：保存时补齐 ID 与时间字段。 */
export type PackageConfigDraft = Omit<PackageConfig, "id" | "createdAt" | "updatedAt"> & {
  id?: string
  createdAt?: string
}

/** 读取套餐配置列表，没有数据时回退为空数组。 */
async function readPackageConfigs(): Promise<PackageConfig[]> {
  const result = await Taro.getStorage<PackageConfig[]>({ key: STORAGE_KEY }).catch(() => ({ data: [] as PackageConfig[] }))
  return Array.isArray(result.data) ? result.data.map(normalizePackageConfig) : []
}

/** 写回完整套餐配置列表。 */
async function writePackageConfigs(configs: PackageConfig[]): Promise<void> {
  await Taro.setStorage({ key: STORAGE_KEY, data: configs })
}

/** 统一补齐套餐配置字段，避免页面层出现空值判断分叉。 */
function normalizePackageConfig(config: Partial<PackageConfig>): PackageConfig {
  return {
    id: config.id ?? "",
    name: config.name ?? "",
    basePrice: config.basePrice ?? 0,
    includedFabric: config.includedFabric ?? 0,
    includedSheer: config.includedSheer ?? 0,
    includedTrack: config.includedTrack ?? 0,
    fabricAddPrice: config.fabricAddPrice ?? 0,
    fabricReducePrice: config.fabricReducePrice ?? 0,
    sheerAddPrice: config.sheerAddPrice ?? 0,
    sheerReducePrice: config.sheerReducePrice ?? 0,
    trackAddPrice: config.trackAddPrice ?? 0,
    trackReducePrice: config.trackReducePrice ?? 0,
    createdAt: config.createdAt ?? "",
    updatedAt: config.updatedAt ?? "",
  }
}

/** 获取全部套餐配置，按更新时间倒序返回。 */
export async function listPackageConfigs(): Promise<PackageConfig[]> {
  const configs = await readPackageConfigs()
  return [...configs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** 根据 ID 获取单个套餐配置。 */
export async function getPackageConfig(id: string): Promise<PackageConfig | null> {
  const configs = await readPackageConfigs()
  return configs.find((config) => config.id === id) ?? null
}

/** 保存套餐配置，已存在则覆盖，不存在则新增。 */
export async function savePackageConfig(config: PackageConfigDraft): Promise<PackageConfig> {
  const configs = await readPackageConfigs()
  const now = new Date().toISOString()
  const nextConfig: PackageConfig = normalizePackageConfig({
    ...config,
    id: config.id ?? createLocalId("package_config"),
    createdAt: config.createdAt ?? now,
    updatedAt: now,
  })
  const nextConfigs = configs.some((item) => item.id === nextConfig.id)
    ? configs.map((item) => (item.id === nextConfig.id ? nextConfig : item))
    : [nextConfig, ...configs]
  await writePackageConfigs(nextConfigs)
  return nextConfig
}

/** 删除指定套餐配置。 */
export async function deletePackageConfig(id: string): Promise<void> {
  const configs = await readPackageConfigs()
  await writePackageConfigs(configs.filter((config) => config.id !== id))
}

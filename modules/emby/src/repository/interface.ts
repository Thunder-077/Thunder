import type { EmbyConfig } from "../types"

export interface IEmbyRepository {
  getConfig(): Promise<EmbyConfig | null>
  saveConfig(config: EmbyConfig): Promise<EmbyConfig>
}

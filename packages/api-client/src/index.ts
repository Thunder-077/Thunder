import { EmbyClient } from "./modules/emby"
import { VaultClient } from "./modules/vault"
import { WeatherClient } from "./modules/weather"

export { ThunderClient, ThunderApiError } from "./client"
export { EmbyClient } from "./modules/emby"
export { VaultClient } from "./modules/vault"
export { WeatherClient } from "./modules/weather"
export type { WeatherNow } from "./modules/weather"

export function createApiClients(baseUrl?: string) {
  return {
    emby: new EmbyClient(baseUrl),
    vault: new VaultClient(baseUrl),
    weather: new WeatherClient(baseUrl),
  }
}

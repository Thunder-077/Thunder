import { VaultClient } from "./modules/vault"

export { ThunderClient, ThunderApiError } from "./client"
export { VaultClient } from "./modules/vault"

export function createApiClients(baseUrl?: string) {
  return {
    vault: new VaultClient(baseUrl),
  }
}

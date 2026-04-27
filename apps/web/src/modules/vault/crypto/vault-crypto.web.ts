/* eslint-disable @typescript-eslint/no-unused-vars */
import { hash, ArgonType } from "argon2-browser"
import type { IVaultCrypto } from "./interface"
import type {
  VaultMetadata,
  VaultItemPlain,
  VaultItemRecord,
  VaultBackup,
  CreateVaultResult,
  UnlockVaultResult,
  EncryptedPayload,
} from "@thunder/vault"
import {
  VaultCryptoError,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  toBufferSource,
  generateSalt,
  generateNonce,
  generateDek,
  CRYPTO_CONSTANTS,
} from "./crypto-utils"

type Argon2Global = typeof globalThis & {
  loadArgon2WasmBinary?: () => Promise<Uint8Array>
}

function resolveWasmUrl(moduleValue: unknown): string {
  if (typeof moduleValue === "string") return moduleValue
  if (
    typeof moduleValue === "object" &&
    moduleValue !== null &&
    "default" in moduleValue &&
    typeof (moduleValue as { default: unknown }).default === "string"
  ) {
    return (moduleValue as { default: string }).default
  }
  throw new Error("无法解析 argon2 wasm 资源地址")
}

function ensureArgon2WasmLoader() {
  const g = globalThis as Argon2Global
  if (g.loadArgon2WasmBinary) return

  g.loadArgon2WasmBinary = async () => {
    // In Next/Webpack, requiring argon2.wasm may return an asset URL.
    // Provide the binary loader explicitly to avoid base64 decode errors.
    const wasmModule = await import("argon2-browser/dist/argon2.wasm")
    const wasmUrl = resolveWasmUrl(wasmModule)
    const response = await fetch(wasmUrl)
    if (!response.ok) {
      throw new Error(`加载 argon2 wasm 失败: ${response.status}`)
    }
    return new Uint8Array(await response.arrayBuffer())
  }
}

async function deriveKEK(
  masterPassword: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  ensureArgon2WasmLoader()
  const result = await hash({
    pass: masterPassword,
    salt,
    type: ArgonType.Argon2id,
    mem: CRYPTO_CONSTANTS.ARGON2_MEMORY,
    time: CRYPTO_CONSTANTS.ARGON2_ITERATIONS,
    parallelism: CRYPTO_CONSTANTS.ARGON2_PARALLELISM,
    hashLen: CRYPTO_CONSTANTS.ARGON2_HASH_LENGTH,
  })
  const hashBytes = new Uint8Array(result.hash)
  return crypto.subtle.importKey(
    "raw",
    toBufferSource(hashBytes),
    { name: CRYPTO_CONSTANTS.ENCRYPTION_ALGORITHM, length: CRYPTO_CONSTANTS.KEY_LENGTH },
    false,
    ["wrapKey", "unwrapKey"]
  )
}

async function encryptAesGcm(
  key: CryptoKey,
  plaintext: Uint8Array
): Promise<{ nonce: Uint8Array; ciphertext: ArrayBuffer }> {
  const nonce = generateNonce()
  const ciphertext = await crypto.subtle.encrypt(
    { name: CRYPTO_CONSTANTS.ENCRYPTION_ALGORITHM, iv: toBufferSource(nonce) },
    key,
    toBufferSource(plaintext)
  )
  return { nonce, ciphertext }
}

async function decryptAesGcm(
  key: CryptoKey,
  nonce: Uint8Array,
  ciphertext: ArrayBuffer
): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt(
    { name: CRYPTO_CONSTANTS.ENCRYPTION_ALGORITHM, iv: toBufferSource(nonce) },
    key,
    ciphertext
  )
}

export class VaultCryptoWeb implements IVaultCrypto {
  async createVault(masterPassword: string, passwordHint?: string): Promise<CreateVaultResult> {
    const salt = generateSalt()
    const dekBytes = generateDek()

    const kek = await deriveKEK(masterPassword, salt)

    const dek = await crypto.subtle.importKey(
      "raw",
      toBufferSource(dekBytes),
      { name: CRYPTO_CONSTANTS.ENCRYPTION_ALGORITHM, length: CRYPTO_CONSTANTS.KEY_LENGTH },
      true,
      ["encrypt", "decrypt"]
    )

    const wrappedDEKIv = generateNonce()
    const wrappedDEK = await crypto.subtle.wrapKey("raw", dek, kek, {
      name: CRYPTO_CONSTANTS.ENCRYPTION_ALGORITHM,
      iv: toBufferSource(wrappedDEKIv),
    })

    const combinedWrapped = new Uint8Array(wrappedDEKIv.byteLength + wrappedDEK.byteLength)
    combinedWrapped.set(wrappedDEKIv, 0)
    combinedWrapped.set(new Uint8Array(wrappedDEK), wrappedDEKIv.byteLength)

    const metadata: VaultMetadata = {
      id: crypto.randomUUID(),
      kdf: {
        algorithm: "argon2id",
        saltBase64: arrayBufferToBase64(toBufferSource(salt)),
        memoryKiB: CRYPTO_CONSTANTS.ARGON2_MEMORY,
        iterations: CRYPTO_CONSTANTS.ARGON2_ITERATIONS,
        parallelism: CRYPTO_CONSTANTS.ARGON2_PARALLELISM,
      },
      encryptedDataKey: arrayBufferToBase64(toBufferSource(combinedWrapped)),
      passwordHint: passwordHint ? passwordHint.trim() || null : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const dataKey = arrayBufferToBase64(toBufferSource(dekBytes))

    return { metadata, dataKey }
  }

  async unlockVault(
    masterPassword: string,
    metadata: VaultMetadata
  ): Promise<UnlockVaultResult> {
    try {
      const salt = new Uint8Array(base64ToArrayBuffer(metadata.kdf.saltBase64))
      const kek = await deriveKEK(masterPassword, salt)

      const combinedWrapped = new Uint8Array(base64ToArrayBuffer(metadata.encryptedDataKey))
      const nonce = combinedWrapped.slice(0, 12)
      const wrappedDEK = combinedWrapped.slice(12)

      const dekRaw = await crypto.subtle.unwrapKey(
        "raw",
        toBufferSource(wrappedDEK),
        kek,
        { name: CRYPTO_CONSTANTS.ENCRYPTION_ALGORITHM, iv: toBufferSource(nonce) },
        { name: CRYPTO_CONSTANTS.ENCRYPTION_ALGORITHM, length: CRYPTO_CONSTANTS.KEY_LENGTH },
        true,
        ["encrypt", "decrypt"]
      )

      const dekBytes = await crypto.subtle.exportKey("raw", dekRaw)
      const dataKey = arrayBufferToBase64(dekBytes)

      return { dataKey }
    } catch {
      throw new VaultCryptoError(
        "主密码错误或保险箱数据无效",
        "unlock_failed"
      )
    }
  }

  async encryptVaultItem(
    dataKey: string,
    item: VaultItemPlain,
    vaultId: string
  ): Promise<VaultItemRecord> {
    try {
      const dekBytes = new Uint8Array(base64ToArrayBuffer(dataKey))
      const dek = await crypto.subtle.importKey(
        "raw",
        toBufferSource(dekBytes),
        { name: CRYPTO_CONSTANTS.ENCRYPTION_ALGORITHM, length: CRYPTO_CONSTANTS.KEY_LENGTH },
        false,
        ["encrypt"]
      )

      const encoder = new TextEncoder()
      const plaintext = encoder.encode(JSON.stringify(item))
      const { nonce, ciphertext } = await encryptAesGcm(dek, plaintext)

      const payload: EncryptedPayload = {
        algorithm: "aes-256-gcm",
        nonceBase64: arrayBufferToBase64(toBufferSource(nonce)),
        ciphertextBase64: arrayBufferToBase64(ciphertext),
      }

      return {
        id: item.id,
        vaultId,
        encryptedPayload: payload,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }
    } catch {
      throw new VaultCryptoError("加密条目失败", "encrypt_failed")
    }
  }

  async decryptVaultItem(
    dataKey: string,
    record: VaultItemRecord
  ): Promise<VaultItemPlain> {
    try {
      const dekBytes = new Uint8Array(base64ToArrayBuffer(dataKey))
      const dek = await crypto.subtle.importKey(
        "raw",
        toBufferSource(dekBytes),
        { name: CRYPTO_CONSTANTS.ENCRYPTION_ALGORITHM, length: CRYPTO_CONSTANTS.KEY_LENGTH },
        false,
        ["decrypt"]
      )

      const nonce = new Uint8Array(base64ToArrayBuffer(record.encryptedPayload.nonceBase64))
      const ciphertext = base64ToArrayBuffer(record.encryptedPayload.ciphertextBase64)

      const decrypted = await decryptAesGcm(dek, nonce, ciphertext)

      const decoder = new TextDecoder()
      const json = decoder.decode(decrypted)
      return JSON.parse(json) as VaultItemPlain
    } catch {
      throw new VaultCryptoError("解密条目失败，数据可能已损坏", "decrypt_failed")
    }
  }

  async changeMasterPassword(
    oldPassword: string,
    newPassword: string,
    metadata: VaultMetadata
  ): Promise<VaultMetadata> {
    const salt = new Uint8Array(base64ToArrayBuffer(metadata.kdf.saltBase64))
    const oldKek = await deriveKEK(oldPassword, salt)

    const combinedWrapped = new Uint8Array(base64ToArrayBuffer(metadata.encryptedDataKey))
    const oldNonce = combinedWrapped.slice(0, 12)
    const wrappedDEK = combinedWrapped.slice(12)

    const dekRaw = await crypto.subtle.unwrapKey(
      "raw",
      toBufferSource(wrappedDEK),
      oldKek,
      { name: CRYPTO_CONSTANTS.ENCRYPTION_ALGORITHM, iv: toBufferSource(oldNonce) },
      { name: CRYPTO_CONSTANTS.ENCRYPTION_ALGORITHM, length: CRYPTO_CONSTANTS.KEY_LENGTH },
      true,
      ["encrypt", "decrypt"]
    )

    const newSalt = generateSalt()
    const newKek = await deriveKEK(newPassword, newSalt)

    const newNonce = generateNonce()
    const newWrappedDEK = await crypto.subtle.wrapKey("raw", dekRaw, newKek, {
      name: CRYPTO_CONSTANTS.ENCRYPTION_ALGORITHM,
      iv: toBufferSource(newNonce),
    })

    const newCombined = new Uint8Array(newNonce.byteLength + newWrappedDEK.byteLength)
    newCombined.set(newNonce, 0)
    newCombined.set(new Uint8Array(newWrappedDEK), newNonce.byteLength)

    return {
      ...metadata,
      kdf: {
        algorithm: "argon2id",
        saltBase64: arrayBufferToBase64(toBufferSource(newSalt)),
        memoryKiB: CRYPTO_CONSTANTS.ARGON2_MEMORY,
        iterations: CRYPTO_CONSTANTS.ARGON2_ITERATIONS,
        parallelism: CRYPTO_CONSTANTS.ARGON2_PARALLELISM,
      },
      encryptedDataKey: arrayBufferToBase64(toBufferSource(newCombined)),
      updatedAt: new Date().toISOString(),
    }
  }

  async exportEncryptedBackup(
    metadata: VaultMetadata,
    items: VaultItemRecord[]
  ): Promise<VaultBackup> {
    return {
      type: "thunder-vault-backup",
      metadata,
      items,
      exportedAt: new Date().toISOString(),
    }
  }

  async importEncryptedBackup(_backup: VaultBackup): Promise<void> {
    throw new VaultCryptoError("导入功能尚未实现", "unsupported")
  }
}

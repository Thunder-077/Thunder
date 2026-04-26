export class VaultCryptoError extends Error {
  constructor(
    message: string,
    public readonly code: "unlock_failed" | "encrypt_failed" | "decrypt_failed" | "unsupported" | "invalid_data"
  ) {
    super(message)
    this.name = "VaultCryptoError"
  }
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer as ArrayBuffer
}

export function toBufferSource(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
}

export function generateRandomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length))
}

export function generateSalt(): Uint8Array {
  return generateRandomBytes(32)
}

export function generateNonce(): Uint8Array {
  return generateRandomBytes(12)
}

export function generateDek(): Uint8Array {
  return generateRandomBytes(32)
}

// Argon2id 参数
const ARGON2_MEMORY = 65536 // 64 MiB
const ARGON2_ITERATIONS = 3
const ARGON2_PARALLELISM = 4
const ARGON2_HASH_LENGTH = 32

const SALT_LENGTH = 32
const NONCE_LENGTH = 12
const DEK_LENGTH = 32

export const CRYPTO_CONSTANTS = {
  ARGON2_MEMORY,
  ARGON2_ITERATIONS,
  ARGON2_PARALLELISM,
  ARGON2_HASH_LENGTH,

  SALT_LENGTH,
  NONCE_LENGTH,
  DEK_LENGTH,
  HASH_ALGORITHM: "SHA-256",
  ENCRYPTION_ALGORITHM: "AES-GCM",
  KEY_LENGTH: 256,
} as const

const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
const LOWERCASE = "abcdefghijklmnopqrstuvwxyz"
const NUMBERS = "0123456789"
const SYMBOLS = "!@#$%^&*()_+-=[]{}|;:,.<>?"

export interface PasswordGeneratorOptions {
  length: number
  uppercase: boolean
  lowercase: boolean
  numbers: boolean
  symbols: boolean
}

export function generatePassword(options: PasswordGeneratorOptions): string {
  let charset = ""
  const required: string[] = []

  if (options.uppercase) {
    charset += UPPERCASE
    required.push(UPPERCASE)
  }
  if (options.lowercase) {
    charset += LOWERCASE
    required.push(LOWERCASE)
  }
  if (options.numbers) {
    charset += NUMBERS
    required.push(NUMBERS)
  }
  if (options.symbols) {
    charset += SYMBOLS
    required.push(SYMBOLS)
  }

  if (!charset) {
    charset = LOWERCASE + NUMBERS
    required.push(LOWERCASE, NUMBERS)
  }

  const randomValues = crypto.getRandomValues(new Uint8Array(options.length))
  const result: string[] = []

  for (let i = 0; i < options.length; i++) {
    result.push(charset[randomValues[i] % charset.length])
  }

  for (let i = 0; i < required.length && i < result.length; i++) {
    const reqChars = required[i]
    const randomByte = crypto.getRandomValues(new Uint8Array(1))[0]
    result[i] = reqChars[randomByte % reqChars.length]
  }

  const shuffleValues = crypto.getRandomValues(new Uint8Array(result.length))
  for (let i = result.length - 1; i > 0; i--) {
    const j = shuffleValues[i] % (i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }

  return result.join("")
}

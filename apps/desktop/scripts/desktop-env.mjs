import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

const desktopRoot = resolve(import.meta.dirname, "..")
export const desktopEnvPath = resolve(desktopRoot, "desktop.env")

function parseEnvLine(line, lineNumber) {
  const trimmed = line.trim()

  if (!trimmed || trimmed.startsWith("#")) {
    return null
  }

  const separatorIndex = trimmed.indexOf("=")
  if (separatorIndex === -1) {
    throw new Error(`desktop.env 第 ${lineNumber} 行缺少 =`)
  }

  const key = trimmed.slice(0, separatorIndex).trim()
  let value = trimmed.slice(separatorIndex + 1).trim()

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    throw new Error(`desktop.env 第 ${lineNumber} 行变量名无效: ${key}`)
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }

  return [key, value]
}

export async function loadDesktopEnv() {
  let rawEnv

  try {
    rawEnv = await readFile(desktopEnvPath, "utf8")
  } catch (error) {
    if (error?.code === "ENOENT") {
      return
    }

    throw error
  }

  rawEnv
    .split(/\r?\n/)
    .map((line, index) => parseEnvLine(line, index + 1))
    .filter(Boolean)
    .forEach(([key, value]) => {
      // Explicit shell/CI variables win over local file values.
      process.env[key] ??= value
    })
}

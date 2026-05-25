import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

const packageJson = JSON.parse(await readFile(resolve("apps/desktop/package.json"), "utf8"))
const tauriConfig = JSON.parse(await readFile(resolve("apps/desktop/src-tauri/tauri.conf.json"), "utf8"))
const cargoToml = await readFile(resolve("apps/desktop/src-tauri/Cargo.toml"), "utf8")
const cargoVersionMatch = cargoToml.match(/^version = "(.*)"$/m)

if (!cargoVersionMatch) {
  console.error("未找到 Cargo.toml 版本号")
  process.exit(1)
}

const versions = {
  packageJson: packageJson.version,
  tauriConfig: tauriConfig.version,
  cargoToml: cargoVersionMatch[1],
}

const uniqueVersions = new Set(Object.values(versions))

if (uniqueVersions.size !== 1) {
  console.error("Thunder desktop 版本不一致:", versions)
  process.exit(1)
}

console.log(`Thunder desktop version is consistent: ${packageJson.version}`)

import { chmod, copyFile, mkdir, rm, stat, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const desktopRoot = resolve(scriptDir, "..")
const runtimeNodeDir = resolve(desktopRoot, "runtime", "node")
const nodeVersion = process.env.THUNDER_DESKTOP_NODE_VERSION?.replace(/^v/, "") ?? process.versions.node

function getArchiveSpec() {
  const platform = process.platform
  const arch = process.arch

  if (platform === "win32" && arch === "x64") {
    return {
      archiveName: `node-v${nodeVersion}-win-x64.zip`,
      executableRelativePath: ["node-v" + nodeVersion + "-win-x64", "node.exe"],
      outputName: "node.exe",
    }
  }

  if (platform === "darwin" && arch === "arm64") {
    return {
      archiveName: `node-v${nodeVersion}-darwin-arm64.tar.gz`,
      executableRelativePath: ["node-v" + nodeVersion + "-darwin-arm64", "bin", "node"],
      outputName: "node",
    }
  }

  if (platform === "darwin" && arch === "x64") {
    return {
      archiveName: `node-v${nodeVersion}-darwin-x64.tar.gz`,
      executableRelativePath: ["node-v" + nodeVersion + "-darwin-x64", "bin", "node"],
      outputName: "node",
    }
  }

  if (platform === "linux" && arch === "x64") {
    return {
      archiveName: `node-v${nodeVersion}-linux-x64.tar.gz`,
      executableRelativePath: ["node-v" + nodeVersion + "-linux-x64", "bin", "node"],
      outputName: "node",
    }
  }

  throw new Error(`当前还不支持为 ${platform}-${arch} 准备桌面 Node runtime`)
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = process.platform === "win32"
      ? spawn("cmd.exe", ["/d", "/s", "/c", command, ...args], {
        cwd: desktopRoot,
        stdio: "inherit",
        shell: false,
        ...options,
      })
      : spawn(command, args, {
      cwd: desktopRoot,
      stdio: "inherit",
        shell: false,
      ...options,
      })

    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }

      rejectPromise(new Error(`${command} ${args.join(" ")} exited with code ${code ?? -1}`))
    })
    child.on("error", rejectPromise)
  })
}

async function downloadFile(url, outputPath) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`下载 Node runtime 失败: ${response.status} ${response.statusText}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  await writeFile(outputPath, buffer)
}

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

const spec = getArchiveSpec()
const outputPath = resolve(runtimeNodeDir, spec.outputName)

if (await exists(outputPath)) {
  process.exit(0)
}

const downloadUrl = `https://nodejs.org/dist/v${nodeVersion}/${spec.archiveName}`
const downloadsDir = resolve(desktopRoot, ".downloads")
const archivePath = resolve(downloadsDir, spec.archiveName)
const extractedDir = resolve(downloadsDir, `node-v${nodeVersion}-${process.platform}-${process.arch}`)

await mkdir(downloadsDir, { recursive: true })
await mkdir(runtimeNodeDir, { recursive: true })
await rm(extractedDir, { recursive: true, force: true })

await downloadFile(downloadUrl, archivePath)

if (spec.archiveName.endsWith(".zip")) {
  await run("powershell", [
    "-NoProfile",
    "-Command",
    `Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${extractedDir}' -Force`,
  ])
} else {
  await mkdir(extractedDir, { recursive: true })
  await run("tar", ["-xzf", archivePath, "-C", extractedDir])
}

const sourcePath = resolve(extractedDir, ...spec.executableRelativePath)
await rm(outputPath, { force: true })
await copyFile(sourcePath, outputPath)

if (process.platform !== "win32") {
  await chmod(outputPath, 0o755)
}

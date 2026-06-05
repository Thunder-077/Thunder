import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createPluginProject } from "./commands/create"

function printUsage(): void {
  console.log("Usage: thunder-plugin create <plugin-name> [target-dir]")
}

async function writeProjectFiles(
  targetDir: string,
  files: Record<string, string>,
): Promise<void> {
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = join(targetDir, relativePath)
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, contents, "utf8")
  }
}

export async function runPluginCli(argv: string[]): Promise<void> {
  const [command, pluginName, targetDirArg] = argv

  if (command !== "create" || !pluginName) {
    printUsage()
    return
  }

  const files = createPluginProject({
    name: pluginName,
    template: "trusted-app",
  })
  const targetDir = resolve(targetDirArg ?? pluginName)

  await mkdir(targetDir, { recursive: true })
  await writeProjectFiles(targetDir, files)
  console.log(`[plugin-cli] created ${pluginName} in ${targetDir}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await runPluginCli(process.argv.slice(2))
}

export * from "./commands/create"

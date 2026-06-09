import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { runBuildCommand } from "./commands/build"
import { createPluginProject } from "./commands/create"
import { runDevCommand } from "./commands/dev"
import { runPackCommand } from "./commands/pack"
import { runPublishCommand } from "./commands/publish"
import { findMonorepoRoot } from "./workspace"

interface ParsedCliArgs {
  command?: string
  pluginName?: string
  targetDir?: string
  rootDir: string
}

function printUsage(): void {
  console.log("Usage:")
  console.log("  thunder-plugin create <plugin-name> [target-dir]")
  console.log("  thunder-plugin build [root-dir]")
  console.log("  thunder-plugin dev [root-dir]")
  console.log("  thunder-plugin pack [root-dir]")
  console.log("  thunder-plugin publish")
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

async function printCreateNextSteps(targetDir: string): Promise<void> {
  const monorepoRoot = await findMonorepoRoot(targetDir)
  console.log("")
  if (monorepoRoot) {
    console.log("Next steps (Thunder monorepo detected):")
    console.log(`  cd ${targetDir}`)
    console.log(`  pnpm install            # links @thunder/* via workspace protocol`)
    console.log(`  pnpm dev                # or: thunder-plugin dev .`)
  } else {
    console.log("Next steps (external project — no Thunder monorepo detected):")
    console.log(`  cd ${targetDir}`)
    console.log(
      `  # The template uses workspace:* for @thunder/* deps. Either link to a`,
    )
    console.log(
      `  # local checkout, or replace the version range in package.json once the`,
    )
    console.log(`  # SDK is published to npm:`)
    console.log(`  pnpm link /path/to/thunder-monorepo/packages/plugin-sdk`)
    console.log(`  pnpm link /path/to/thunder-monorepo/packages/plugin-schema`)
    console.log(`  pnpm link /path/to/thunder-monorepo/packages/plugin-sdk-worker`)
    console.log(`  pnpm install`)
    console.log(`  pnpm dev                # requires a running desktop host`)
  }
  console.log("")
  console.log("See README.md in the generated project for full instructions.")
}

function parseCliArgs(argv: string[]): ParsedCliArgs {
  const [command, firstArg, secondArg] = argv

  if (command === "create") {
    return {
      command,
      pluginName: firstArg,
      targetDir: secondArg,
      rootDir: resolve(secondArg ?? firstArg ?? "."),
    }
  }

  return {
    command,
    rootDir: resolve(firstArg ?? "."),
  }
}

export async function runPluginCli(argv: string[]): Promise<void> {
  const args = parseCliArgs(argv)

  switch (args.command) {
    case "create": {
      if (!args.pluginName) {
        printUsage()
        return
      }

      const files = createPluginProject({
        name: args.pluginName,
        template: "trusted-app",
      })

      await mkdir(args.rootDir, { recursive: true })
      await writeProjectFiles(args.rootDir, files)
      console.log(`[plugin-cli] created ${args.pluginName} in ${args.rootDir}`)
      await printCreateNextSteps(args.rootDir)
      return
    }

    case "build": {
      const result = await runBuildCommand(args.rootDir)
      console.log(`[plugin-cli] built ${result.project.manifest.id} -> ${result.outDir}`)
      return
    }

    case "dev": {
      await runDevCommand(args.rootDir)
      return
    }

    case "pack": {
      const result = await runPackCommand(args.rootDir)
      console.log(`[plugin-cli] packed ${result.packagePath} (${result.packageSha256})`)
      return
    }

    case "publish": {
      await runPublishCommand()
      return
    }

    default:
      printUsage()
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await runPluginCli(process.argv.slice(2))
}

export * from "./commands/create"
export * from "./commands/build"
export * from "./commands/pack"

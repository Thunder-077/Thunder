#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { runBuildCommand } from "./commands/build"
import { createPluginProject } from "./commands/create"
import { runDevCommand } from "./commands/dev"
import { runPackCommand } from "./commands/pack"
import { runPublishCommand } from "./commands/publish"
import { runValidateCommand } from "./commands/validate"
import { findMonorepoRoot } from "./workspace"

interface ParsedCliArgs {
  command?: string
  pluginName?: string
  targetDir?: string
  rootDir: string
  template: "sandboxed-ui" | "trusted-app"
  outDir?: string
  writeEntry?: boolean
  baseUrl?: string
  privateKeyPath?: string
  keyId?: string
  entriesDir?: string
  outPath?: string
}

function printUsage(): void {
  console.log("Usage:")
  console.log("  thunder-plugin create <plugin-name> [target-dir] [--template sandboxed-ui|trusted-app]")
  console.log("  thunder-plugin validate [root-dir]")
  console.log("  thunder-plugin build [root-dir]")
  console.log("  thunder-plugin dev [root-dir]")
  console.log("  thunder-plugin pack [root-dir] [--entry] [--out <dir>] [--base-url <url>] [--private-key <pem>] [--key-id <id>]")
  console.log("  thunder-plugin publish [--entries <dir>] [--out <path>] [--private-key <pem>] [--key-id <id>]")
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
    console.log("Next steps:")
    console.log(`  cd ${targetDir}`)
    console.log(`  npm install             # installs @thunder/plugin-sdk from npm`)
    console.log(`  npx thunder-plugin dev  # starts dev mode with hot-reload`)
    console.log("")
    console.log("Prerequisites:")
    console.log(`  - Thunder Desktop host must be running (pnpm dev:desktop in a Thunder checkout)`)
    console.log(`  - Or set THUNDER_PLUGIN_DEV_API_URL to point at a running host`)
    console.log("")
    console.log("Docs: https://github.com/user/thunder/blob/main/docs/desktop-plugin-development.md")
  }
  console.log("")
}

function readOption(argv: string[], name: string): string | undefined {
  const inline = argv.find((arg) => arg.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(name)
}

function positionalArgs(argv: string[]): string[] {
  const positional: string[] = []
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg.startsWith("--")) {
      if (arg === "--entry") {
        continue
      }
      if (!arg.includes("=") && argv[index + 1] && !argv[index + 1].startsWith("--")) {
        index += 1
      }
      continue
    }
    positional.push(arg)
  }
  return positional
}

function parseCliArgs(argv: string[]): ParsedCliArgs {
  const [command] = argv
  const commandArgs = argv.slice(1)
  const positional = positionalArgs(commandArgs)
  const firstArg = positional[0]
  const rawTemplateValue = readOption(commandArgs, "--template")
  const templateValue: "sandboxed-ui" | "trusted-app" | undefined =
    rawTemplateValue === "sandboxed-ui" || rawTemplateValue === "trusted-app"
      ? rawTemplateValue
      : undefined
  if (rawTemplateValue && !templateValue) {
    throw new Error(`Unsupported template: ${rawTemplateValue}`)
  }

  if (command === "create") {
    return {
      command,
      pluginName: firstArg,
      targetDir: positional[1],
      rootDir: resolve(positional[1] ?? firstArg ?? "."),
      template: templateValue ?? "sandboxed-ui",
    }
  }

  return {
    command,
    rootDir: resolve(firstArg ?? "."),
    template: "sandboxed-ui",
    outDir: readOption(commandArgs, "--out"),
    writeEntry: hasFlag(commandArgs, "--entry"),
    baseUrl: readOption(commandArgs, "--base-url"),
    privateKeyPath: readOption(commandArgs, "--private-key"),
    keyId: readOption(commandArgs, "--key-id"),
    entriesDir: readOption(commandArgs, "--entries"),
    outPath: readOption(commandArgs, "--out"),
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

      const files = await createPluginProject(
        {
          name: args.pluginName,
          template: args.template,
        },
        args.rootDir,
      )

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

    case "validate": {
      await runValidateCommand(args.rootDir)
      return
    }

    case "dev": {
      await runDevCommand(args.rootDir)
      return
    }

    case "pack": {
      const result = await runPackCommand({
        rootDir: args.rootDir,
        outDir: args.outDir,
        writeEntry: args.writeEntry,
        baseUrl: args.baseUrl,
        signing: {
          privateKeyPath: args.privateKeyPath,
          keyId: args.keyId,
        },
      })
      console.log(`[plugin-cli] packed ${result.packagePath} (${result.packageSha256})`)
      if (result.marketplaceEntryPath) {
        console.log(`[plugin-cli] marketplace entry ${result.marketplaceEntryPath}`)
      }
      return
    }

    case "publish": {
      const result = await runPublishCommand({
        entriesDir: args.entriesDir ?? "artifacts",
        outPath: args.outPath ?? "artifacts/index.json",
        signing: {
          privateKeyPath: args.privateKeyPath,
          keyId: args.keyId,
        },
      })
      console.log(`[plugin-cli] published ${result.index.plugins.length} plugins -> ${result.outPath}`)
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
export * from "./commands/publish"
export * from "./commands/validate"
export * from "./commands/trust"
export * from "./commands/marketplace"

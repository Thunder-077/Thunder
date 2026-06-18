import {
  publishMarketplaceIndex,
  type DesktopPluginMarketplaceIndex,
  type MarketplaceSigningOptions,
} from "./marketplace"

export interface PublishCommandOptions {
  entriesDir: string
  outPath: string
  signing?: MarketplaceSigningOptions
}

export interface PublishCommandResult {
  outPath: string
  index: DesktopPluginMarketplaceIndex
}

export async function runPublishCommand(options: PublishCommandOptions): Promise<PublishCommandResult> {
  return publishMarketplaceIndex({
    entriesDir: options.entriesDir,
    outPath: options.outPath,
    signing: options.signing,
  })
}

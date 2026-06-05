type TeleprompterEnvInput = {
  nodeEnv?: string
  experimentsFlag?: string
}

function readRuntimeEnv(): TeleprompterEnvInput {
  const runtimeProcess = typeof globalThis !== "undefined"
    ? (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    : undefined

  return {
    nodeEnv: runtimeProcess?.env?.NODE_ENV,
    experimentsFlag: runtimeProcess?.env?.NEXT_PUBLIC_TELEPROMPTER_EXPERIMENTS,
  }
}

export function shouldShowTeleprompterExperimentalInsights(
  input: TeleprompterEnvInput = readRuntimeEnv()
): boolean {
  return input.nodeEnv !== "production" || input.experimentsFlag === "1"
}

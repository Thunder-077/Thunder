import assert from "node:assert/strict"
import { shouldShowTeleprompterExperimentalInsights } from "./teleprompter-env"

function main() {
  assert.equal(
    shouldShowTeleprompterExperimentalInsights({
      nodeEnv: "development",
      experimentsFlag: undefined,
    }),
    true
  )

  assert.equal(
    shouldShowTeleprompterExperimentalInsights({
      nodeEnv: "production",
      experimentsFlag: "1",
    }),
    true
  )

  assert.equal(
    shouldShowTeleprompterExperimentalInsights({
      nodeEnv: "production",
      experimentsFlag: undefined,
    }),
    false
  )

  assert.equal(
    shouldShowTeleprompterExperimentalInsights({
      nodeEnv: undefined,
      experimentsFlag: undefined,
    }),
    true
  )

  console.log("[teleprompter-env] tests passed")
}

main()

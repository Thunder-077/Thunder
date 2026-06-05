import assert from "node:assert/strict"
import { getOverflowActivityIds, MAX_ACTIVITY_LOGS } from "./activity-service"

function createRecords(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `activity-${index + 1}`,
  }))
}

function main() {
  assert.deepEqual(getOverflowActivityIds(createRecords(MAX_ACTIVITY_LOGS)), [])
  assert.deepEqual(
    getOverflowActivityIds(createRecords(MAX_ACTIVITY_LOGS + 3)),
    ["activity-201", "activity-202", "activity-203"]
  )
  assert.deepEqual(
    getOverflowActivityIds(createRecords(5), 3),
    ["activity-4", "activity-5"]
  )

  console.log("[activity-service] tests passed")
}

main()

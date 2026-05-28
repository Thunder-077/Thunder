export type FollowStatus = "idle" | "listening" | "following" | "off-script" | "paused" | "failed"

export type FollowStateMachineEvent =
  | { type: "start-listening" }
  | { type: "alignment"; isOnScript: boolean; confidence: number }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "stop" }
  | { type: "fail" }
  | { type: "reset" }
  | { type: "calibrate" }

export type FollowStateMachine = {
  transition(event: FollowStateMachineEvent): FollowStatus
  getStatus(): FollowStatus
  reset(): FollowStatus
}

export function createFollowStateMachine(initialStatus: FollowStatus = "idle"): FollowStateMachine {
  let status = initialStatus

  function transition(event: FollowStateMachineEvent): FollowStatus {
    switch (event.type) {
      case "start-listening":
      case "resume":
        status = "listening"
        break
      case "alignment":
        status = event.isOnScript ? "following" : "off-script"
        break
      case "pause":
        status = "paused"
        break
      case "stop":
      case "reset":
        status = "idle"
        break
      case "fail":
        status = "failed"
        break
      case "calibrate":
        status = "following"
        break
    }

    return status
  }

  function getStatus(): FollowStatus {
    return status
  }

  function reset(): FollowStatus {
    status = "idle"
    return status
  }

  return { transition, getStatus, reset }
}

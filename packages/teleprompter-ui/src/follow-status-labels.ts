import type { FollowStatus } from "../../teleprompter-core/src/index"

export const statusLabels: Record<FollowStatus, string> = {
  idle: "未开始",
  listening: "正在监听",
  following: "正在跟读",
  "off-script": "脱稿中",
  paused: "已暂停",
  failed: "定位失败",
}

import thumbBalcony from "@/assets/curtain/阳台.jpg"
import thumbBedroom from "@/assets/curtain/主卧.jpg"
import thumbLiving from "@/assets/curtain/客厅.jpg"
import thumbSecondBedroom from "@/assets/curtain/次卧.jpg"
import thumbStudy from "@/assets/curtain/书房.jpg"
import thumbRoom from "@/assets/curtain/默认房间.jpg"

/** 根据房间/位置名称返回对应缩略图，未命中时回退到默认房间图。 */
export function getRoomThumb(position: string): string {
  if (position.includes("阳台")) {
    return thumbBalcony
  }

  if (position.includes("客厅")) {
    return thumbLiving
  }

  if (position.includes("主卧")) {
    return thumbBedroom
  }

  if (position.includes("次卧") || position.includes("儿童房") || position.includes("客房")) {
    return thumbSecondBedroom
  }

  if (position.includes("卧")) {
    return thumbBedroom
  }

  if (position.includes("书房") || position.includes("办公")) {
    return thumbStudy
  }

  return thumbRoom
}

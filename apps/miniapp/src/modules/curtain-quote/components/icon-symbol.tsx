import { Image } from "@tarojs/components"
import bedIcon from "lucide-static/icons/bed-double.svg"
import editIcon from "lucide-static/icons/pencil-line.svg"
import homeIcon from "lucide-static/icons/home.svg"
import locationIcon from "lucide-static/icons/map-pin.svg"
import noteIcon from "lucide-static/icons/notebook-text.svg"
import phoneIcon from "lucide-static/icons/smartphone.svg"
import profileIcon from "lucide-static/icons/circle-user-round.svg"
import quoteIcon from "lucide-static/icons/receipt-text.svg"
import roomIcon from "lucide-static/icons/door-open.svg"
import searchIcon from "lucide-static/icons/search.svg"
import sofaIcon from "lucide-static/icons/sofa.svg"
import trashIcon from "lucide-static/icons/trash-2.svg"
import userIcon from "lucide-static/icons/user-round.svg"

const iconMap = {
  bed: bedIcon,
  edit: editIcon,
  home: homeIcon,
  location: locationIcon,
  note: noteIcon,
  phone: phoneIcon,
  profile: profileIcon,
  quote: quoteIcon,
  room: roomIcon,
  search: searchIcon,
  sofa: sofaIcon,
  trash: trashIcon,
  user: userIcon,
  userWhite: userIcon,
}

export type IconSymbolName = keyof typeof iconMap

interface IconSymbolProps {
  /** 图标名称，对应本地 SVG 资源。 */
  name: IconSymbolName
  /** 自定义 class，用于控制尺寸和容器样式。 */
  className?: string
}

/** 本地 SVG 图标组件，避免使用字体符号导致跨端显示不一致。 */
export function IconSymbol({ name, className = "" }: IconSymbolProps) {
  return <Image className={`cq-icon-symbol cq-icon-symbol--${name} ${className}`} mode="aspectFit" src={iconMap[name]} />
}

import Taro from "@tarojs/taro"
import { Button, View, Text } from "@tarojs/components"
import type { PropsWithChildren } from "react"
import { IconSymbol } from "./icon-symbol"
import "./curtain-ui.css"

interface PageShellProps extends PropsWithChildren {
  /** 页面标题，展示在自定义导航栏中央。 */
  title?: string
  /** 是否展示返回按钮。 */
  showBack?: boolean
  /** 是否展示底部安全区间距。 */
  paddedBottom?: boolean
}

/** 窗帘报价模块统一页面壳，负责还原 UI 图里的自定义导航与浅暖背景。 */
export function PageShell({ title, showBack = false, paddedBottom = false, children }: PageShellProps) {
  const handleBack = () => {
    Taro.navigateBack().catch(() => Taro.reLaunch({ url: "/pages/home/index" }))
  }

  return (
    <View className={`cq-page${paddedBottom ? " cq-page--padded-bottom" : ""}`}>
      <View className="cq-nav">
        <Button className={`cq-back ${showBack ? "" : "cq-back--hidden"}`} onClick={handleBack} aria-label="返回">
          ‹
        </Button>
        <Text className="cq-nav__title">{title}</Text>
        <View className="cq-capsule" aria-label="小程序胶囊按钮">
          <Text className="cq-capsule__dots">•••</Text>
          <Text className="cq-capsule__divider" />
          <Text className="cq-capsule__circle">◎</Text>
        </View>
      </View>
      {children}
    </View>
  )
}

interface PrimaryButtonProps {
  /** 按钮文案。 */
  children: string
  /** 点击回调。 */
  onClick?: () => void
  /** 次要按钮使用描边样式。 */
  variant?: "primary" | "outline"
}

/** 模块主按钮，统一渐变绿色和描边样式。 */
export function CurtainButton({ children, onClick, variant = "primary" }: PrimaryButtonProps) {
  return (
    <Button className={`cq-button cq-button--${variant}`} onClick={onClick}>
      {children}
    </Button>
  )
}

/** 表单分区标题，左侧短竖线与设计图一致。 */
export function SectionTitle({ children }: PropsWithChildren) {
  return (
    <View className="cq-section-title">
      <Text className="cq-section-title__bar" />
      <Text>{children}</Text>
    </View>
  )
}

interface BottomTabProps {
  /** 当前激活 Tab。 */
  active: "home" | "quotes" | "mine"
}

/** 首页底部 Tab，P0 只实现首页可用，其余入口保留视觉占位。 */
export function BottomTab({ active }: BottomTabProps) {
  const goHome = () => Taro.reLaunch({ url: "/pages/home/index" })
  return (
    <View className="cq-tabbar">
      <Button className={`cq-tabbar__item ${active === "home" ? "is-active" : ""}`} onClick={goHome}>
        <IconSymbol className="cq-tabbar__icon" name="home" />
        <Text>首页</Text>
      </Button>
      <Button className={`cq-tabbar__item ${active === "quotes" ? "is-active" : ""}`}>
        <IconSymbol className="cq-tabbar__icon" name="quote" />
        <Text>报价</Text>
      </Button>
      <Button className={`cq-tabbar__item ${active === "mine" ? "is-active" : ""}`}>
        <IconSymbol className="cq-tabbar__icon" name="profile" />
        <Text>我的</Text>
      </Button>
    </View>
  )
}

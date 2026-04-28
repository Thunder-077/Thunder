# Thunder UI 设计规范

## 设计原则

- **极简**：参考 Notion、Apple、OpenAI 官网风格
- **留白**：大量使用空间来创造呼吸感
- **克制**：低饱和配色，不使用花哨渐变
- **清晰**：层级分明，信息密度适中
- **一致**：统一的组件风格和交互模式

## 布局规范

### 整体布局

```
┌──────────────────────────────────────────┐
│ Sidebar (展开 240 / 收起 64) │ Topbar (h-12) │
│                ├─────────────────────────│
│                │                         │
│   Navigation   │     Main Content        │
│   Modules      │     (p-6)              │
│   Settings     │                         │
│                │                         │
│ ─────────────  │                         │
│ Cmd │ Theme │⚙│ │                         │
└──────────────────────────────────────────┘
```

### 间距系统

- 页面内边距：`p-6`（24px）
- 区块间距：`mb-6` / `mb-8`（24px / 32px）
- 组件间距：`gap-2` / `gap-3`（8px / 12px）
- 内部间距：`p-3` / `p-4`（12px / 16px）

### Sidebar 规范

- **固定展开态**：Sidebar 不再支持收起/展开，永远固定展开
- 宽度固定：`240px`
- 侧栏背景：白底（或暗色主题对应 token），右侧 1px 弱边框
- 顶部结构：`T Logo + Thunder`，高度约 `56px`，**不显示收起按钮**
- 顶部**不显示搜索框**，搜索入口移至底部工具栏
- 导航分组：固定导航（首页、模块中心）+ 模块按 `manifest.category` 分组
- 分组规则：分组标题小号浅灰文案，支持展开/收起，分组前使用低饱和色点
- 导航项样式：高度 `40px`、圆角 `10px`、图标 `18px`、hover 背景 `#F7F7F8`、active 背景 `#F2F4F7`
- active 规范：使用低对比背景与正文色 `#111827`，不使用高饱和蓝色高亮
- 模块多时，导航内容区域内部滚动，顶部 Logo 区和底部工具栏固定不滚动
- **底部工具栏**：固定在 Sidebar 底部，只保留三个工具按钮
  - 全局命令（Search 图标，显示 `⌘K` 提示）
  - 主题切换（Sun/Moon 图标）
  - 设置（Settings 图标）
- **底部禁止显示**：用户头像、用户名、角色、用户菜单、用户下拉箭头
- 移动端规则：使用 Drawer 打开侧栏，顶部显示 Logo 与关闭按钮，点击导航项后自动关闭 Drawer

## 颜色规范

### 语义色（页面骨架）

#### 浅色主题

| Token | 用途 | 值 |
|-------|------|-----|
| background | 页面背景 | oklch(1 0 0) ≈ #ffffff |
| foreground | 主文字 | oklch(0.145 0 0) ≈ #171717 |
| card | 卡片背景 | oklch(1 0 0) ≈ #ffffff |
| popover | 弹出层背景 | oklch(1 0 0) ≈ #ffffff |
| primary | 主操作（按钮、链接） | oklch(0.205 0 0) ≈ #333333 |
| primary-foreground | 主操作文字 | oklch(0.985 0 0) ≈ #fafafa |
| secondary | 次要区域 | oklch(0.97 0 0) ≈ #f5f5f5 |
| secondary-foreground | 次要区域文字 | oklch(0.205 0 0) ≈ #333333 |
| muted | 弱化背景 | oklch(0.97 0 0) ≈ #f5f5f5 |
| muted-foreground | 弱化文字 | oklch(0.556 0 0) ≈ #737373 |
| accent | 强调/选中态背景 | oklch(0.97 0 0) ≈ #f5f5f5 |
| accent-foreground | 强调/选中态文字 | oklch(0.205 0 0) ≈ #333333 |
| border | 边框 | oklch(0.922 0 0) ≈ #e5e5e5 |
| input | 输入框边框 | oklch(0.922 0 0) ≈ #e5e5e5 |
| ring | 焦点环 | oklch(0.708 0 0) ≈ #a3a3a3 |

#### 深色主题

| Token | 用途 | 值 |
|-------|------|-----|
| background | 页面背景 | oklch(0.145 0 0) ≈ #171717 |
| foreground | 主文字 | oklch(0.985 0 0) ≈ #fafafa |
| card | 卡片背景 | oklch(0.205 0 0) ≈ #262626 |
| popover | 弹出层背景 | oklch(0.205 0 0) ≈ #262626 |
| primary | 主操作 | oklch(0.922 0 0) ≈ #ededed |
| primary-foreground | 主操作文字 | oklch(0.205 0 0) ≈ #333333 |
| secondary | 次要区域 | oklch(0.269 0 0) ≈ #404040 |
| secondary-foreground | 次要区域文字 | oklch(0.985 0 0) ≈ #fafafa |
| muted | 弱化背景 | oklch(0.269 0 0) ≈ #404040 |
| muted-foreground | 弱化文字 | oklch(0.708 0 0) ≈ #a3a3a3 |
| accent | 强调/选中态背景 | oklch(0.269 0 0) ≈ #404040 |
| accent-foreground | 强调/选中态文字 | oklch(0.985 0 0) ≈ #fafafa |
| border | 边框 | oklch(1 0 0 / 10%) ≈ rgba(255,255,255,0.1) |
| input | 输入框边框 | oklch(1 0 0 / 15%) ≈ rgba(255,255,255,0.15) |
| ring | 焦点环 | oklch(0.556 0 0) ≈ #8c8c8c |

### 功能色（状态反馈）

| Token | 用途 | 浅色值 | 深色值 |
|-------|------|--------|--------|
| destructive | 危险/删除 | oklch(0.577 0.245 27.325) 红 | oklch(0.704 0.191 22.216) 浅红 |
| destructive-foreground | 危险文字 | #fafafa | #fafafa |
| success | 成功/确认 | oklch(0.705 0.165 155) 绿 | oklch(0.65 0.17 155) 绿 |
| success-foreground | 成功文字 | #171717 | #171717 |
| warning | 警告/注意 | oklch(0.78 0.168 85) 黄橙 | oklch(0.73 0.17 75) 黄橙 |
| warning-foreground | 警告文字 | #171717 | #171717 |
| info | 信息/提示 | oklch(0.623 0.185 245) 蓝 | oklch(0.62 0.18 245) 蓝 |
| info-foreground | 信息文字 | #fafafa | #fafafa |

### 图表色

| Token | 用途 | 值 |
|-------|------|-----|
| chart-1 ~ chart-5 | 数据可视化系列色 | 灰度阶梯，浅深色一致 |

### Sidebar 专用色

| Token | 用途 | 浅色值 | 深色值 |
|-------|------|--------|--------|
| sidebar | 侧栏背景 | #fafafa | #262626 |
| sidebar-foreground | 侧栏文字 | #171717 | #fafafa |
| sidebar-primary | 侧栏主操作 | #333333 | 蓝紫色调 |
| sidebar-primary-foreground | 侧栏主操作文字 | #fafafa | #fafafa |
| sidebar-accent | 侧栏选中背景 | #f5f5f5 | #404040 |
| sidebar-accent-foreground | 侧栏选中文字 | #333333 | #fafafa |
| sidebar-border | 侧栏边框 | #e5e5e5 | rgba(255,255,255,0.1) |
| sidebar-ring | 侧栏焦点环 | #a3a3a3 | #8c8c8c |

**颜色使用规则**：在 Tailwind class 中禁止直接写 `bg/text/border/fill/stroke` 的硬编码颜色（如 `bg-white`、`text-black`、`bg-[#F2F4F7]`），统一使用语义 token，如 `bg-background`、`text-foreground`、`bg-sidebar-accent`

## 圆角规范

| Token | 值 | 用途 |
|-------|-----|------|
| radius-sm | 0.375rem (6px) | 小元素（Badge） |
| radius-md | 0.5rem (8px) | 输入框 |
| radius-lg | 0.625rem (10px) | 卡片、按钮 |
| radius-xl | 0.875rem (14px) | 大卡片 |
| radius-2xl | 1.125rem (18px) | 模态框 |

## 阴影规范

| Token | 值 | 用途 |
|-------|-----|------|
| shadow-xs | `0 1px 2px rgba(0,0,0, 0.04)` | 极轻阴影（深色 0.12） |
| shadow-sm | `0 1px 3px + 0 1px 2px` | 小阴影（tooltip、badge） |
| shadow-md | `0 4px 6px + 0 2px 4px` | 中等阴影（卡片 hover、dropdown） |
| shadow-lg | `0 10px 15px + 0 4px 6px` | 大阴影（modal、popover） |
| shadow-xl | `0 20px 25px + 0 8px 10px` | 超大阴影（全屏覆盖层） |
| shadow-2xl | `0 25px 50px -12px` | 最大阴影（深色模式更重） |
| shadow-inner | `inset 0 2px 4px` | 内阴影（pressed 状态） |
| shadow-ring | `0 0 0 3px ring 色 40% 混合` | 焦点环（focus-visible） |

使用规则：
- 默认不使用阴影，卡片/按钮以 border 为主
- 卡片 hover 时使用 `shadow-md`
- Modal / Dialog 使用 `shadow-lg`
- Focus ring 统一使用 `shadow-ring`（基于 `--ring` 色值动态生成）
- 深色模式下所有阴影不透明度略高，确保可见性

## 动效规范

### 过渡时长 (Duration)

| Token | 值 | 用途 |
|-------|-----|------|
| duration-instant | 0ms | 即时切换（如主题切换） |
| duration-fast | 100ms | 微交互（hover 颜色变化、checkbox 切换） |
| duration-normal | 200ms | 常规过渡（展开/收起、淡入淡出） |
| duration-slow | 300ms | 复杂动画（modal 进入、页面切换） |
| duration-slower | 500ms | 大型动效（首次入场引导） |

### 缓动函数 (Easing)

| Token | 值 | 用途 |
|-------|-----|------|
| ease-default | `cubic-bezier(0.4, 0, 0.2, 1)` | 默认过渡（Material Design 标准） |
| ease-in | `cubic-bezier(0.4, 0, 1, 1)` | 进入动画（modal 出现） |
| ease-out | `cubic-bezier(0, 0, 0.2, 1)` | 离开动画（modal 消失） |
| ease-bounce | `cubic-bezier(0.34, 1.56, 0.64, 1)` | 弹性效果（特殊反馈） |

使用规则：
- 不使用复杂动效
- 仅使用颜色过渡和透明度变化
- 侧边栏展开/收起使用 `transition-all duration-normal`
- 所有交互统一使用 `ease-default`
- 禁止使用旋转、缩放等变换动效（除非有明确需求）

## Z-Index 层级规范

| Token | 值 | 用途 |
|-------|-----|------|
| z-base | 0 | 默认文档流 |
| z-dropdown | 100 | DropdownMenu、Select 下拉层 |
| z-sticky | 200 | Sticky Header、固定导航 |
| z-overlay | 300 | Tooltip、Popover 提示层 |
| z-modal | 400 | Dialog / Modal 弹窗层 |
| z-toast | 500 | Toast / Notification 通知层 |
| z-max | 999 | 最高层级（调试/临时覆盖） |

**禁止**：在组件中直接写硬编码 z-index 数值（如 `z-[9999]`），统一使用语义 token。

## 尺寸规范

### 布局尺寸

| Token | 值 | 用途 |
|-------|-----|------|
| sidebar-width | 240px | Sidebar 固定宽度 |
| topbar-height | 48px | Topbar 固定高度 |
| content-max-width | 1200px | 内容区最大宽度 |

### 组件尺寸

| Token | 值 | 用途 |
|-------|-----|------|
| input-height | 44px | 输入框高度（h-11） |
| button-height-sm | 32px | 小按钮高度（h-8） |
| button-height-md | 36px | 中按钮高度（h-9） |
| button-height-lg | 40px | 大按钮高度（h-10） |

### 图标尺寸

| Token | Tailwind | 值 | 用途 |
|-------|----------|-----|------|
| icon-size-sm | h-3.5 w-3.5 | 14px | 紧凑图标 |
| icon-size | h-4 w-4 | 16px | 标准图标（默认） |
| icon-size-lg | h-5 w-5 | 20px | 大图标 |
| icon-size-xl | h-6 w-6 | 24px | 空状态图标 |

## 字体层级

| 层级 | 大小 | 字重 | 用途 |
|------|------|------|------|
| h1 | text-xl (20px) | font-semibold (600) | 页面标题 |
| h2 | text-sm (14px) | font-medium (500) | 区块标题 |
| h3 | text-sm (14px) | font-medium (500) | 卡片标题 |
| body | text-sm (14px) | font-normal (400) | 正文 |
| caption | text-xs (12px) | font-normal (400) | 辅助说明 |

字体族：Geist Sans（主字体）、Geist Mono（等宽字体）

## 组件风格

### 卡片 (Card)

- 白色/深色背景
- 1px 边框（border-border）
- 圆角 radius-lg
- 无阴影，hover 时 shadow-md
- 内边距 p-4

### 按钮 (Button)

- 圆角 radius-lg
- 紧凑尺寸 h-8
- ghost 变体用于工具栏
- outline 变体用于次要操作

### 导航项

- 圆角 radius-md
- hover 时 bg-accent
- 激活时 bg-accent + text-accent-foreground
- 左侧图标 + 文字

### 输入框

- 默认使用通用 `Input` 组件（`apps/web/src/components/ui/input.tsx`）
- 尺寸：`h-11`（约 44px）、`rounded-xl`、`px-4`
- 默认态：`bg-background` + `border-input`，不使用明显阴影
- 悬停态：边框轻微加深（`hover:border-muted-foreground/30`）
- 聚焦态：轻量 focus ring（`focus-visible:ring-[3px] focus-visible:ring-black/5`），禁止粗黑边和原生 outline
- 禁用态：`disabled:bg-muted` + `disabled:text-muted-foreground` + `disabled:cursor-not-allowed`
- 错误态：通过 `aria-invalid` 触发低饱和红色边框与浅红 ring

### 密码输入框

- 默认使用通用 `PasswordInput` 组件（`apps/web/src/components/ui/password-input.tsx`）
- 基于 `Input` 同款视觉规范，保证密码输入框与普通输入框一致
- 右侧眼睛图标垂直居中，点击切换 `password / text`
- 图标按钮使用低对比灰色，不挤压文本区域，不改变输入框高度
- 图标按钮使用统一 `focus-visible` 样式，避免出现难看的原生 outline
- 需要复制时可使用 `copyable`，显示复制按钮并复用同一交互样式

### 输入框使用规则

- 项目中普通文本输入默认复用通用 `Input`
- 项目中密码输入默认复用通用 `PasswordInput`
- 页面内禁止随意写原生 input 的 focus 样式；有特殊场景需在组件层扩展

### 通用弹窗 (AppDialog / useDialog)

- 项目级弹窗统一使用 `AppDialog` 组件和 `useDialog` Hook
- 禁止新增 `window.alert` / `window.confirm` / `window.prompt`
- 常规交互优先使用 `dialog.confirm()`、`dialog.alert()`、`dialog.info()`、`dialog.success()`、`dialog.warning()`、`dialog.error()`
- 危险操作统一使用 `type="danger"`，默认禁止点击蒙层关闭；可按场景显式配置
- loading 场景使用 `type="loading"`，显示旋转图标并默认禁用关闭
- 图标默认使用 `lucide-react` 语义图标，可通过 `icon` 覆盖；`hideIcon=true` 可隐藏
- 视觉规范：居中弹窗、弱蒙层 + 轻 blur、约 420-480px 宽、圆角 radius-2xl（18px）、低饱和色块图标容器
- 按钮规范：底部右对齐，默认确认按钮黑色，危险确认按钮使用低饱和红色

## 图标

- 使用 lucide-react 图标库
- 标准尺寸：`h-4 w-4`（16px，对应 `--icon-size`）
- 导航图标：`h-4 w-4`
- 空状态图标：`h-6 w-6`（24px，对应 `--icon-size-xl`）
- 不使用填充图标，统一使用线条风格
- 图标尺寸统一使用尺寸令牌（见「尺寸规范 - 图标尺寸」）

## 动效

- 不使用复杂动效
- 过渡时间统一使用动效令牌（见「动效规范」），默认 `duration-normal`（200ms）
- 仅使用颜色过渡和阴影变化
- 侧边栏展开/收起使用 `transition-all duration-normal ease-default`
- 禁止硬编码 transition 时间值

## Select / Dropdown

- 项目中所有下拉框，如无特别指定，默认使用通用 `Select` 组件
- 交互、状态、尺寸、视觉和 API 规范见 `docs/select-dropdown.md`
- 操作菜单（如“更多操作”）使用 `DropdownMenu`，不与表单选择组件混用

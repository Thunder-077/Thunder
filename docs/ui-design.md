# Thunder UI 设计规范

## 设计原则

- 极简：整体气质保持克制、安静、留白充足。
- 系统化：参考 AFFiNE 的设计系统思路，优先沉淀 token、语义层和共享组件。
- 产品化：参考 Plane 的运行态思路，补齐 loading、hover、selected、overlay、scrollbar 等状态。
- 一致：页面骨架、表单、弹层、导航、反馈态使用统一语言，不做页面私有风格分叉。
- 可维护：优先使用语义 token、共享组件和布局类，避免硬编码颜色与临时样式。

## 布局规范

### 整体布局

- Sidebar 固定展开，宽度 `240px`。
- Topbar 固定高度 `48px`，支持轻 blur 和弱分隔线。
- 内容区使用 `AppShell` 统一承载。
- 主内容容器默认接近全宽展示，使用统一页面边距控制留白：移动端 `16px`，桌面端 `24px`，超宽屏 `32px`。
- 页面默认内边距：
  - 移动端 `px-4 py-5`
  - 桌面端 `px-6 py-5`

### Sidebar 规范

- 固定展开，不支持桌面端折叠。
- 顶部为品牌区，使用弱玻璃面板和轻品牌色强调。
- 导航分为固定导航和模块分组导航。
- 分组标题使用小号大写语义标签样式。
- 导航项高度 `40px`，圆角 `10px`，hover 和 active 只做低对比强调。
- 底部只保留：
  - 全局命令
  - 主题切换
  - 设置
- 禁止显示用户头像、用户名、角色和用户菜单。

### Page Header 规范

- 页面标题区默认带底部分隔线。
- 标题上方可显示小型 section label。
- 标题、描述、右侧 actions 保持一个统一结构，不在页面里各自重写。

## Token 规范

### 基础语义色

- `background` / `foreground`
- `card` / `card-foreground`
- `popover` / `popover-foreground`
- `primary` / `primary-foreground`
- `secondary` / `secondary-foreground`
- `muted` / `muted-foreground`
- `accent` / `accent-foreground`
- `border`
- `input`
- `ring`

### 状态色

- `destructive`
- `success`
- `warning`
- `info`

### 品牌与表层 token

- `brand`
- `brand-subtle`
- `surface-1`
- `surface-2`
- `surface-3`
- `panel`
- `panel-border`
- `overlay`
- `selection`
- `scrollbar-thumb`
- `scrollbar-thumb-hover`
- `skeleton`

### Sidebar 专用 token

- `sidebar`
- `sidebar-foreground`
- `sidebar-primary`
- `sidebar-primary-foreground`
- `sidebar-accent`
- `sidebar-accent-foreground`
- `sidebar-border`
- `sidebar-ring`

### 使用规则

- 禁止在 Tailwind class 中直接写硬编码前景色、背景色、边框色。
- 优先使用 `bg-background`、`text-foreground`、`border-border` 这类语义 token。
- 场景化面板优先使用 `surface-panel`、`surface-card`、`surface-shell`。
- 品牌色默认使用蓝色系；紫色只作为可切换品牌主题，不作为全局默认倾向。

## 圆角与阴影

### 圆角

- `radius-sm`: 6px
- `radius-md`: 8px
- `radius-lg`: 12px
- `radius-xl`: 16px
- `radius-2xl`: 20px

### 阴影

- `shadow-xs`：输入框、轻按钮、细节面板
- `shadow-sm`：卡片默认态
- `shadow-md`：卡片 hover、浮层
- `shadow-lg`：Dropdown、Popover、Dialog
- `shadow-xl`：重点弹层
### 使用规则

- 默认以边框和表层差异塑造层级，不依赖重阴影。
- 只有可悬浮、可交互、可分离的元素才增加阴影层级。

## 动效规范

- 默认只使用透明度、背景色、边框色、阴影、轻微位移。
- 时长：
  - `duration-fast`: 100ms
  - `duration-normal`: 200ms
  - `duration-slow`: 300ms
- 缓动统一优先使用 `ease-default`。
- 可使用轻微 `translateY` 或 `scale` 做悬停反馈，但保持克制。
- Dialog、Dropdown、Select 的出现/消失统一采用淡入 + 轻位移/缩放。

## 运行态规范

这是本轮从 Plane 借鉴后补充的重点规则。

### 全局运行态

- `::selection` 使用品牌色弱高亮。
- 滚动条统一使用低对比 token，不保留浏览器默认风格。
- overlay 使用弱遮罩，不使用 blur。
- 骨架屏统一使用 `skeleton-block`。
- 启动 Splash 使用白底全屏覆盖 + 居中品牌图标，只在应用冷启动时播放一次品牌动效。
- 路由级 loading 复用品牌图标，但使用更轻的持续呼吸，不重复强闪。
- Splash 动效必须支持 `prefers-reduced-motion` 降级。

### 表单态

- 输入框默认高度 `44px`。
- hover 仅轻微加深边框和背景。
- focus 使用 3px 轻 ring，不使用粗黑边。
- error 通过 `aria-invalid` 驱动。
- disabled 保持可读，不直接半透明到失真。

### 弹层态

- Select、Dropdown、Dialog 统一使用圆角大于内容卡片一级的面板视觉。
- 弹层背景默认采用 `surface-panel` 风格。
- Dialog 默认使用居中面板、弱 blur 蒙层和底部操作条。

## 组件规范

### Card

- 使用 `surface-card`。
- 默认圆角 `2xl`。
- 默认边框可见，hover 时允许轻微上浮和阴影增强。

### Button

- 默认圆角 `xl`。
- `primary` 用于核心操作。
- `outline` 用于常规次级操作。
- `ghost` 用于工具栏、导航辅助按钮。
- `accent` 用于品牌相关但不抢主操作的场景。

### Input / PasswordInput

- 必须复用通用组件。
- 视觉与交互状态在组件层统一处理。
- 页面中不要私写原生 input focus 样式。

### Select / DropdownMenu

- Select 用于“值选择”。
- DropdownMenu 用于“动作菜单”。
- 二者都要使用统一面板、层级和交互反馈。

### EmptyState

- 使用居中面板，不再直接裸露在页面背景上。
- 图标容器允许弱品牌色强调。
- 文案保持简短，动作按钮作为次级引导。

### AppDialog

- 统一使用 `AppDialog` 与 `useDialog`。
- 危险操作默认禁止蒙层关闭。
- loading 状态默认禁止关闭。
- 图标容器、标题、描述、底部操作条使用统一结构。

## 字体层级

- `h1`: 22px / semibold
- `h2`: 16px / medium
- `h3`: 14px / medium
- `body`: 14px / regular
- `caption`: 12px / regular
- `section-label`: 11px / semibold / uppercase / tracking

字体：

- 主字体：Geist Sans
- 等宽字体：Geist Mono

## 工程规范

- 设计 token 以 `apps/web/src/app/globals.css` 为唯一事实来源。
- 新增共享组件时，优先消费现有 token，不重新定义局部变量。
- 修改 Sidebar、Topbar、Dialog、Select、Input 等基础视觉组件时，必须同步更新本文档。

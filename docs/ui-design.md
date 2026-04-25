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
│ Sidebar (w-56) │ Topbar (h-12)          │
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

## 颜色规范

### 浅色主题

| Token | 用途 | 值 |
|-------|------|-----|
| background | 页面背景 | oklch(1 0 0) ≈ #ffffff |
| foreground | 主文字 | oklch(0.145 0 0) ≈ #171717 |
| card | 卡片背景 | oklch(1 0 0) ≈ #ffffff |
| muted | 次要背景 | oklch(0.97 0 0) ≈ #f5f5f5 |
| muted-foreground | 次要文字 | oklch(0.556 0 0) ≈ #737373 |
| border | 边框 | oklch(0.922 0 0) ≈ #e5e5e5 |
| accent | 强调背景 | oklch(0.97 0 0) ≈ #f5f5f5 |

### 深色主题

| Token | 用途 | 值 |
|-------|------|-----|
| background | 页面背景 | oklch(0.145 0 0) ≈ #171717 |
| foreground | 主文字 | oklch(0.985 0 0) ≈ #fafafa |
| card | 卡片背景 | oklch(0.205 0 0) ≈ #262626 |
| muted | 次要背景 | oklch(0.269 0 0) ≈ #333333 |
| muted-foreground | 次要文字 | oklch(0.708 0 0) ≈ #a3a3a3 |
| border | 边框 | oklch(1 0 0 / 10%) ≈ rgba(255,255,255,0.1) |
| accent | 强调背景 | oklch(0.269 0 0) ≈ #333333 |

## 圆角规范

| Token | 值 | 用途 |
|-------|-----|------|
| radius-sm | 0.375rem (6px) | 小元素（Badge） |
| radius-md | 0.5rem (8px) | 输入框 |
| radius-lg | 0.625rem (10px) | 卡片、按钮 |
| radius-xl | 0.875rem (14px) | 大卡片 |
| radius-2xl | 1.125rem (18px) | 模态框 |

## 阴影规范

- 默认不使用阴影
- 悬浮状态：`shadow-md`（柔和阴影）
- 模态框：`shadow-lg`

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

- 圆角 radius-md
- 1px 边框 border-input
- focus 时 ring-1 ring-ring

## 图标

- 使用 lucide-react 图标库
- 标准尺寸：h-4 w-4（16px）
- 导航图标：h-4 w-4
- 空状态图标：h-6 w-6（24px）
- 不使用填充图标，统一使用线条风格

## 动效

- 不使用复杂动效
- 过渡时间：duration-200
- 仅使用颜色过渡和阴影变化
- 侧边栏展开/收起使用 transition-all

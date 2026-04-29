# Thunder Select / Dropdown 规范

## 组件定位

- `Select`：用于选择值、筛选条件、设置项。
- `DropdownMenu`：用于触发操作、展示命令和上下文菜单。

默认规则：

- 所有“表单选择器”默认使用通用 `Select`。
- 所有“操作菜单”默认使用通用 `DropdownMenu`。

## 设计目标

- 保持与 Input、Dialog、Card 一致的表层语言。
- 统一 Portal、层级、阴影、圆角和键盘交互。
- 解决弹层裁切、样式漂移和局部私有实现的问题。
- 借鉴 AFFiNE 的 token 分层思路和 Plane 的运行态完整性。

## Select 视觉规范

### Trigger

- 高度：
  - `compact`: 32px
  - `default`: 40px
- 背景：`bg-background/85`
- 边框：`border-border/80`
- 圆角：
  - `compact`: `rounded-lg`
  - `default`: `rounded-xl`
- 焦点：`focus-visible:ring-[3px]` + `ring/28`
- open 状态：轻微提高背景和阴影

### Popup

- 使用 `surface-panel`
- 圆角：`rounded-2xl`
- 边框：`border-panel-border`
- 阴影：`shadow-lg`
- 通过 Portal 渲染
- z-index 使用 `--z-dropdown`

### Item

- 圆角：`rounded-lg` / `rounded-xl`
- hover / highlighted：`bg-muted/85`
- selected：`bg-brand-subtle/75`
- 右侧 check 指示当前选中项
- 支持：
  - 纯文本
  - 图标 + 文本
  - 文本 + description

## DropdownMenu 视觉规范

- 使用与 Select 一致的面板风格：
  - `surface-panel`
  - `rounded-2xl`
  - `border-panel-border`
  - `shadow-lg`
- Item 保持 `rounded-xl`
- Label 使用小号大写 section label 风格
- Separator 使用弱边框色，不使用纯黑纯白分割

## Option 数据结构

```ts
export type SelectOption = {
  value: string
  label: string
  description?: string
  icon?: React.ReactNode
  disabled?: boolean
}
```

## 交互规范

- 点击 trigger 展开；点击外部关闭。
- `Esc` 关闭。
- `↑ / ↓` 切换选项。
- `Enter` 选中。
- disabled 项不可聚焦、不可点击。
- error 态通过 `error` 或 `aria-invalid` 驱动。

## API 设计

```ts
type SelectProps = {
  value?: string | null
  options: SelectOption[]
  onChange?: (value: string) => void
  onValueChange?: (value: string | null) => void
  placeholder?: string
  size?: "compact" | "default"
  disabled?: boolean
  error?: boolean
  className?: string
  contentClassName?: string
  showDescription?: boolean
  renderOption?: (
    option: SelectOption,
    ctx: { selected: boolean; active: boolean }
  ) => React.ReactNode
}
```

## 使用规则

- 优先使用字符串 `value`。
- 页面内不要重复实现私有下拉样式。
- 若通用组件无法满足场景，必须说明原因后再做特殊实现。
- 不要把 `Select` 用成“更多操作”菜单。
- 不要把 `DropdownMenu` 用成表单字段。

## 适用场景

- 表单字段选择
- 顶部筛选器
- 设置项切换
- 模块类型选择
- 标签、范围、状态筛选

## 不适用场景

- 复杂异步搜索
- 远程分页选择
- 多选树形级联
- 大量富内容插槽式选择器

这些场景需要后续单独组件，而不是继续堆在通用 `Select` 上。

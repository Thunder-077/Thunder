# Thunder Select / Dropdown 规范

## 组件定位

`Select` 是 Thunder 项目的通用下拉框组件，用于统一表单选择、筛选切换和设置项选择的交互与视觉。

默认规则：**项目中所有下拉框，如无特别指定，默认使用该通用 Select / Dropdown 组件。**

## 为什么统一

- 降低不同页面下拉样式和交互不一致的问题
- 避免弹窗中下拉层被裁切、不可见等重复问题
- 减少页面私有下拉实现，降低维护成本
- 统一可访问性与键盘交互（Esc、方向键、Enter）

## 默认视觉规范

### Trigger

- 白底、浅边框、圆角（10px ~ 12px）
- placeholder 使用浅灰色
- 右侧统一使用 `ChevronDown`
- focus 使用项目风格 ring，不使用原生蓝边
- open 状态轻微背景强调

### Content

- 白底浮层，浅边框
- 圆角 12px
- 轻阴影
- 通过 Portal 渲染，避免容器裁切

### Item

- 圆角 8px
- hover 使用浅灰背景
- selected 背景略深于 hover
- 右侧 check 显示当前选中项
- 支持单行或双行（description）

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

- `label` 必填
- `value` 必填
- `icon` 可选
- `description` 可选
- `disabled` 可选

## 三种模式

### 纯文本模式

- 仅 `label`
- 无 `icon`
- 无 `description`

### 描述模式

- `label + description`
- 适合条目类型等需要解释的场景
- 未提供 `description` 时自动保持单行

### 图标模式

- `icon + label`
- `description` 可选
- `icon` 不存在时不预留左侧空位

## 尺寸规范

- `compact`：工具栏/筛选区，约 32px，高密度单行优先
- `default`：表单场景，约 40px，支持 description 双行内容

## 交互与状态规范

- 默认态、hover、open、selected、disabled、focus-visible、placeholder、error
- 点击 trigger 展开；再次点击或点击外部关闭
- Esc 关闭
- 键盘上下移动选项
- Enter 选中

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

## 使用示例

### 1) 纯文本示例

```tsx
const options = [
  { value: "all", label: "全部" },
  { value: "favorites", label: "收藏" },
  { value: "recent", label: "最近访问" },
]

<Select
  value={scope}
  onChange={setScope}
  options={options}
  size="compact"
  showDescription={false}
/>
```

### 2) 描述示例

```tsx
const options = [
  { value: "website", label: "网站账号", description: "用于网站、应用或在线服务登录" },
  { value: "secret", label: "密钥 / 令牌", description: "用于 API Key、Token、密钥等" },
  { value: "note", label: "普通条目", description: "用于备注或其他信息" },
]

<Select value={type} onChange={setType} options={options} size="default" showDescription />
```

### 3) 图标示例

```tsx
const options = [
  { value: "website", label: "网站账号", icon: <Globe className="h-4 w-4" /> },
  { value: "secret", label: "密钥 / 令牌", icon: <KeyRound className="h-4 w-4" /> },
  { value: "database", label: "数据库", icon: <Database className="h-4 w-4" /> },
]

<Select value={kind} onChange={setKind} options={options} />
```

## 适用场景

- 表单字段下拉
- 顶部筛选器
- 设置页选项切换
- Vault 条目类型选择
- 标签/范围/类型筛选

## 不适用场景

- 操作菜单（如“更多操作”按钮）应使用 `DropdownMenu`
- 复杂异步搜索与远程分页选择（后续单独组件）
- 多选、树形级联等复杂选择（后续单独组件）

## 注意事项

- 尽量使用字符串值；业务层自行完成字符串到数值/枚举转换
- 不要在页面内重复实现私有下拉样式
- 仅当通用组件无法覆盖时才保留特殊实现，并记录原因

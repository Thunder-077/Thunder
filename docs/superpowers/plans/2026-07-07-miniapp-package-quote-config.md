# Miniapp Package Quote Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将小程序套餐报价改为本地可配置套餐来源，并把套餐报价输入重构为“宽度 + 窗帘类型”，同时保留现有用量明细、费用调整和分享海报能力。

**Architecture:** 套餐配置作为独立本地存储数据源，新增配置列表页与编辑页；套餐报价页改为读取用户保存的套餐配置并按新公式计算；套餐汇总、详情、分享页与海报统一消费新的套餐报价明细结构。整个改动只发生在 `apps/miniapp`，不引入后端依赖，也不兼容旧套餐报价数据结构。

**Tech Stack:** Taro 4 + React 18 + TypeScript + 小程序本地 `Taro Storage`

---

## File Structure

### New Files

- `apps/miniapp/src/modules/curtain-quote/services/package-config-storage.ts`
  - 套餐配置本地存储读写、增删改查、排序
- `apps/miniapp/src/pages/package-configs/index.tsx`
  - 套餐配置列表页
- `apps/miniapp/src/pages/package-configs/index.css`
  - 套餐配置列表页样式
- `apps/miniapp/src/pages/package-configs/index.config.ts`
  - 套餐配置列表页配置
- `apps/miniapp/src/pages/package-config-item/index.tsx`
  - 套餐配置新增/编辑页
- `apps/miniapp/src/pages/package-config-item/index.css`
  - 套餐配置编辑页样式
- `apps/miniapp/src/pages/package-config-item/index.config.ts`
  - 套餐配置编辑页配置

### Modified Files

- `apps/miniapp/src/modules/curtain-quote/types/quote.ts`
  - 重构 `PackageQuoteItem`，新增 `PackageConfig` / `CurtainMode`
- `apps/miniapp/src/modules/curtain-quote/services/quote-calculator.ts`
  - 切换套餐计算公式
- `apps/miniapp/src/modules/curtain-quote/services/quote-factory.ts`
  - 初始化套餐报价默认明细
- `apps/miniapp/src/modules/curtain-quote/services/quote-storage.ts`
  - 套餐报价明细兼容读取/保存
- `apps/miniapp/src/pages/quote-package/index.tsx`
  - 套餐报价页改为宽度 + 窗帘类型
- `apps/miniapp/src/pages/quote-package/index.css`
  - 套餐报价页样式调整
- `apps/miniapp/src/pages/quote-mode/index.tsx`
  - 增加套餐配置入口
- `apps/miniapp/src/pages/quote-summary/index.tsx`
  - 更新套餐摘要显示
- `apps/miniapp/src/pages/quote-detail/index.tsx`
  - 更新套餐详情显示
- `apps/miniapp/src/pages/quote-share/index.tsx`
  - 更新套餐分享显示
- `apps/miniapp/src/modules/curtain-quote/poster/builder.ts`
  - 更新海报套餐行文案
- `apps/miniapp/src/app.config.ts`
  - 注册新页面

### Validation

- `pnpm --filter @thunder/miniapp typecheck`
- `pnpm --filter @thunder/miniapp build`
- 手工回归：
  - 套餐配置新增/编辑/删除
  - 无套餐空状态
  - 布和纱 / 只有布 / 只有纱 三种计算
  - 汇总、详情、分享、海报展示

## Task 1: 重构套餐类型与计算输入模型

**Files:**
- Modify: `apps/miniapp/src/modules/curtain-quote/types/quote.ts`
- Modify: `apps/miniapp/src/modules/curtain-quote/services/quote-factory.ts`
- Modify: `apps/miniapp/src/modules/curtain-quote/services/quote-storage.ts`

- [ ] **Step 1: 更新套餐报价类型定义**

在 `quote.ts` 中新增本地套餐配置与窗帘类型定义，并把 `PackageQuoteItem` 的 `fabricWidth/sheerWidth/packageName` 替换为新字段：

```ts
export type CurtainMode = "fabric_and_sheer" | "fabric_only" | "sheer_only"

export interface PackageConfig {
  id: string
  name: string
  basePrice: number
  includedFabric: number
  includedSheer: number
  includedTrack: number
  fabricAddPrice: number
  fabricReducePrice: number
  sheerAddPrice: number
  sheerReducePrice: number
  trackAddPrice: number
  trackReducePrice: number
  createdAt: string
  updatedAt: string
}

export interface PackageQuoteItem {
  id: string
  packageConfigId: string
  packageNameSnapshot: string
  basePrice: number
  width: number
  curtainMode: CurtainMode
  fabricUsage: number
  sheerUsage: number
  trackLength: number
  fabricDiff: number
  sheerDiff: number
  trackDiff: number
  fabricAdjustment: number
  sheerAdjustment: number
  trackAdjustment: number
  amount: number
}
```

- [ ] **Step 2: 调整套餐报价默认工厂**

在 `quote-factory.ts` 中移除对预置套餐名的依赖，默认明细只保留空值结构：

```ts
export function createDefaultPackageItems() {
  return [
    {
      id: createLocalId("package"),
      packageConfigId: "",
      packageNameSnapshot: "",
      basePrice: 0,
      width: 0,
      curtainMode: "fabric_and_sheer" as const,
      fabricUsage: 0,
      sheerUsage: 0,
      trackLength: 0,
      fabricDiff: 0,
      sheerDiff: 0,
      trackDiff: 0,
      fabricAdjustment: 0,
      sheerAdjustment: 0,
      trackAdjustment: 0,
      amount: 0,
    },
  ]
}
```

- [ ] **Step 3: 调整报价存储读写兼容逻辑**

在 `quote-storage.ts` 中为 `packageItems` 增加统一 normalize，保证页面层始终拿到新结构：

```ts
function normalizePackageItem(item: Partial<PackageQuoteItem>): PackageQuoteItem {
  return {
    id: item.id ?? "",
    packageConfigId: item.packageConfigId ?? "",
    packageNameSnapshot: item.packageNameSnapshot ?? "",
    basePrice: item.basePrice ?? 0,
    width: item.width ?? 0,
    curtainMode: item.curtainMode ?? "fabric_and_sheer",
    fabricUsage: item.fabricUsage ?? 0,
    sheerUsage: item.sheerUsage ?? 0,
    trackLength: item.trackLength ?? 0,
    fabricDiff: item.fabricDiff ?? 0,
    sheerDiff: item.sheerDiff ?? 0,
    trackDiff: item.trackDiff ?? 0,
    fabricAdjustment: item.fabricAdjustment ?? 0,
    sheerAdjustment: item.sheerAdjustment ?? 0,
    trackAdjustment: item.trackAdjustment ?? 0,
    amount: item.amount ?? 0,
  }
}
```

- [ ] **Step 4: 运行类型检查**

Run: `pnpm --filter @thunder/miniapp typecheck`

Expected: `tsc --noEmit` 通过；如果失败，错误应只集中在尚未同步改名的套餐页面与计算器引用上。

## Task 2: 新增套餐配置本地存储服务

**Files:**
- Create: `apps/miniapp/src/modules/curtain-quote/services/package-config-storage.ts`
- Modify: `apps/miniapp/src/modules/curtain-quote/services/quote-calculator.ts`

- [ ] **Step 1: 新建套餐配置存储服务**

创建 `package-config-storage.ts`，提供稳定的 CRUD 接口：

```ts
const STORAGE_KEY = "thunder:miniapp:curtain-package-configs:v1"

export async function listPackageConfigs(): Promise<PackageConfig[]> { /* ... */ }
export async function getPackageConfig(id: string): Promise<PackageConfig | null> { /* ... */ }
export async function savePackageConfig(config: PackageConfig): Promise<PackageConfig> { /* ... */ }
export async function deletePackageConfig(id: string): Promise<void> { /* ... */ }
```

- [ ] **Step 2: 让计算器按配置对象计算，而不是按预设表查询**

在 `quote-calculator.ts` 去掉 `PACKAGE_PRESETS` 依赖，新增基于 `PackageConfig` 的计算入口：

```ts
export function calculatePackageItem(input: {
  id: string
  packageConfig: PackageConfig
  width: number
  curtainMode: CurtainMode
}): PackageQuoteItem {
  // ...
}
```

- [ ] **Step 3: 实现新公式**

在 `calculatePackageItem` 中明确写出三种窗帘类型分支：

```ts
const trackLength = roundMoney(input.width)
const fabricUsage = input.curtainMode === "sheer_only" ? 0 : roundMoney(input.width * 2)
const sheerUsage = input.curtainMode === "fabric_only" ? 0 : roundMoney(input.width * 2)
```

并按配置的 `included* / *AddPrice / *ReducePrice` 计算差额与金额。

- [ ] **Step 4: 运行类型检查**

Run: `pnpm --filter @thunder/miniapp typecheck`

Expected: 类型层通过，页面层仍可能报旧字段引用错误，待后续任务修复。

## Task 3: 新增套餐配置页面与入口

**Files:**
- Create: `apps/miniapp/src/pages/package-configs/index.tsx`
- Create: `apps/miniapp/src/pages/package-configs/index.css`
- Create: `apps/miniapp/src/pages/package-configs/index.config.ts`
- Create: `apps/miniapp/src/pages/package-config-item/index.tsx`
- Create: `apps/miniapp/src/pages/package-config-item/index.css`
- Create: `apps/miniapp/src/pages/package-config-item/index.config.ts`
- Modify: `apps/miniapp/src/app.config.ts`
- Modify: `apps/miniapp/src/pages/quote-mode/index.tsx`

- [ ] **Step 1: 注册新页面**

在 `app.config.ts` 的页面数组中加入：

```ts
"pages/package-configs/index",
"pages/package-config-item/index",
```

- [ ] **Step 2: 新建套餐配置列表页**

列表页需要展示套餐名、基础价、包含米数，并提供新增/编辑/删除：

```tsx
{configs.map((config) => (
  <View key={config.id}>
    <Text>{config.name}</Text>
    <Text>¥{formatMoney(config.basePrice)}</Text>
    <Text>布 {config.includedFabric}米 / 纱 {config.includedSheer}米 / 轨道 {config.includedTrack}米</Text>
  </View>
))}
```

- [ ] **Step 3: 新建套餐配置编辑页**

编辑页使用与现有小程序表单一致的输入方式，保存时构造完整 `PackageConfig`：

```ts
const nextConfig: PackageConfig = {
  id: draft.id || createLocalId("package_config"),
  name: draft.name.trim(),
  basePrice: draft.basePrice,
  includedFabric: draft.includedFabric,
  includedSheer: draft.includedSheer,
  includedTrack: draft.includedTrack,
  fabricAddPrice: draft.fabricAddPrice,
  fabricReducePrice: draft.fabricReducePrice,
  sheerAddPrice: draft.sheerAddPrice,
  sheerReducePrice: draft.sheerReducePrice,
  trackAddPrice: draft.trackAddPrice,
  trackReducePrice: draft.trackReducePrice,
  createdAt: existing?.createdAt ?? now,
  updatedAt: now,
}
```

- [ ] **Step 4: 在报价方式页增加入口**

在 `quote-mode/index.tsx` 加一个清晰入口，例如：

```tsx
<Button onClick={() => Taro.navigateTo({ url: "/pages/package-configs/index" })}>
  套餐配置
</Button>
```

- [ ] **Step 5: 手工回归**

手工验证：
- 打开套餐配置列表页
- 新增一个套餐
- 返回列表看到新套餐
- 编辑后内容更新
- 删除后列表移除

Expected: 页面流转正常，无空白页或跳转失败。

## Task 4: 重写套餐报价页

**Files:**
- Modify: `apps/miniapp/src/pages/quote-package/index.tsx`
- Modify: `apps/miniapp/src/pages/quote-package/index.css`

- [ ] **Step 1: 用套餐配置列表替换预设选择**

从 `listPackageConfigs()` 读取套餐来源，移除 `PACKAGE_PRESETS`：

```ts
const [configs, setConfigs] = useState<PackageConfig[]>([])
const packageNames = configs.map((config) => config.name)
```

- [ ] **Step 2: 把输入改成“宽度 + 窗帘类型”**

移除 `fabricWidth/sheerWidth` 双输入，改为：

```tsx
<Input value={getWidthInputValue()} onInput={updateWidth} />
<Picker mode="selector" range={["布和纱", "只有布", "只有纱"]} onChange={updateCurtainMode}>
```

- [ ] **Step 3: 在页面中保留用量明细和费用调整展示**

保留原有展示块，只把文案来源改成新结构：

```tsx
<Text>布实际用量：</Text>
<Text>{item.fabricUsage.toFixed(2)}米</Text>
```

```tsx
<Text>布调整：</Text>
<Text className="cq-price">{formatAdjustment(item.fabricAdjustment)}</Text>
```

- [ ] **Step 4: 处理无套餐空状态**

当 `configs.length === 0` 时，不显示报价表单，显示空状态与去配置按钮：

```tsx
if (configs.length === 0) {
  return <EmptyStateLikeView />
}
```

- [ ] **Step 5: 运行类型检查和构建**

Run:
- `pnpm --filter @thunder/miniapp typecheck`
- `pnpm --filter @thunder/miniapp build`

Expected: 套餐报价页编译通过，可以进入页面。

## Task 5: 更新汇总、详情、分享页与海报

**Files:**
- Modify: `apps/miniapp/src/pages/quote-summary/index.tsx`
- Modify: `apps/miniapp/src/pages/quote-detail/index.tsx`
- Modify: `apps/miniapp/src/pages/quote-share/index.tsx`
- Modify: `apps/miniapp/src/modules/curtain-quote/poster/builder.ts`

- [ ] **Step 1: 套餐摘要页改为展示宽度和类型**

把旧的 `布宽` 展示换成：

```tsx
<Text className="summary-item__line">宽度： {item.width.toFixed(2)}米</Text>
<Text className="summary-item__line">类型： {formatCurtainMode(item.curtainMode)}</Text>
```

- [ ] **Step 2: 套餐详情页与分享页同步调整**

在 `quote-detail` 和 `quote-share` 中做同样替换，避免仍显示旧字段：

```tsx
<Text className="summary-item__title">{item.packageNameSnapshot}</Text>
```

- [ ] **Step 3: 更新海报套餐行文案**

在 `poster/builder.ts` 中把套餐行宽度列改为：

```ts
widthLabel: [`宽 ${item.width.toFixed(2)}米`, `类型 ${formatCurtainMode(item.curtainMode)}`].join("\n")
```

- [ ] **Step 4: 全量验证**

Run:
- `pnpm --filter @thunder/miniapp typecheck`
- `pnpm --filter @thunder/miniapp build`

手工验证：
- 套餐报价页选择“布和纱”
- 套餐报价页选择“只有布”
- 套餐报价页选择“只有纱”
- 汇总页、详情页、分享页、海报显示正确

Expected: 三种窗帘类型都能正确计算并展示；海报无截断、无旧字段残留。

## Self-Review

### Spec coverage

- 套餐本地可配置：Task 2、Task 3
- 套餐报价输入改为宽度 + 窗帘类型：Task 4
- 新计算规则：Task 2
- 保留用量明细和费用调整：Task 4
- 汇总、详情、分享、海报展示同步：Task 5

无遗漏。

### Placeholder scan

- 无 `TODO` / `TBD` / “后续补充”
- 每个任务都给出了明确文件、代码方向和验证命令

### Type consistency

- 新字段统一使用 `packageConfigId`、`packageNameSnapshot`、`width`、`curtainMode`
- 页面和海报展示统一使用新字段，不再混用 `fabricWidth/sheerWidth`


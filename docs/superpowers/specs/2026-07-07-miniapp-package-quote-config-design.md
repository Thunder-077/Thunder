# 小程序套餐报价配置化改造设计

## 背景

当前小程序套餐报价存在三个限制：

1. 套餐种类写死在前端预设中，用户无法自行维护。
2. 套餐报价页面把输入拆成布宽、纱宽，不符合用户实际录入“实测宽度 + 有布/有纱情况”的习惯。
3. 套餐计算规则与用户希望的“套餐包含米数 + 超出/退还单价”模型不完全一致。

本次改造只覆盖 `apps/miniapp`，数据保存在小程序本地存储，不接后端，不考虑旧套餐数据兼容。

## 目标

1. 套餐种类改为用户可配置，来源于用户本地保存的套餐配置。
2. 套餐报价页面改为输入“宽度”和“窗帘类型（布和纱 / 只有布 / 只有纱）”。
3. 套餐价格按新的套餐包含量与超出/退还单价规则计算。
4. 保留套餐报价页面已有的“用量明细”和“费用调整”两块展示。
5. 汇总页、详情页、分享页、海报同步展示新的套餐报价语义。

## 范围

### 包含

- 小程序套餐配置本地存储
- 套餐配置列表页
- 套餐配置编辑页（新增 / 编辑）
- 套餐报价页输入与计算逻辑重构
- 套餐汇总、详情、分享、海报展示调整

### 不包含

- 后端 API
- Web 端 / Desktop 端同步
- 旧套餐报价数据迁移
- 多套餐配置的云端共享

## 数据模型

### 套餐配置

新增 `PackageConfig`：

- `id`
- `name`
- `basePrice`
- `includedFabric`
- `includedSheer`
- `includedTrack`
- `fabricAddPrice`
- `fabricReducePrice`
- `sheerAddPrice`
- `sheerReducePrice`
- `trackAddPrice`
- `trackReducePrice`
- `createdAt`
- `updatedAt`

说明：

- 所有金额和米数均为非负数。
- `name` 为用户可见套餐名称。
- `included*` 表示套餐包含的布 / 纱 / 轨道米数。
- `*AddPrice` 表示超出套餐时的单价。
- `*ReducePrice` 表示未使用完套餐时的退还单价。

### 套餐报价明细

现有 `PackageQuoteItem` 改为：

- `id`
- `packageConfigId`
- `packageNameSnapshot`
- `basePrice`
- `width`
- `curtainMode`
- `fabricUsage`
- `sheerUsage`
- `trackLength`
- `fabricDiff`
- `sheerDiff`
- `trackDiff`
- `fabricAdjustment`
- `sheerAdjustment`
- `trackAdjustment`
- `amount`

说明：

- `packageConfigId` 用于关联当前选中的套餐配置。
- `packageNameSnapshot` 用于保存报价时的套餐名称快照，避免用户后改名称时历史报价失去展示语义。
- `width` 表示实际测量宽度。
- `curtainMode` 枚举值：
  - `fabric_and_sheer`
  - `fabric_only`
  - `sheer_only`

## 本地存储设计

新增独立存储服务，例如 `package-config-storage.ts`。

存储职责：

- `listPackageConfigs`
- `getPackageConfig`
- `createPackageConfig`
- `updatePackageConfig`
- `deletePackageConfig`

存储原则：

- 套餐配置与报价单分开存储。
- 首次进入时默认空列表，不再预置任何套餐。
- 套餐报价页只读取当前已保存的套餐配置。

## 页面设计

### 1. 套餐配置列表页

新增入口页，展示用户已保存套餐。

展示内容：

- 套餐名称
- 套餐价格
- 包含布 / 纱 / 轨道米数

交互：

- 新增套餐
- 编辑套餐
- 删除套餐

空状态：

- 无套餐时展示空状态和“新增套餐”按钮。

### 2. 套餐配置编辑页

表单分组：

- 基本信息
  - 套餐名称
  - 套餐价格
- 套餐包含
  - 布米数
  - 纱米数
  - 轨道米数
- 超出单价
  - 布单价
  - 纱单价
  - 轨道单价
- 退还单价
  - 布单价
  - 纱单价
  - 轨道单价

校验：

- 套餐名称必填
- 数值字段必须 `>= 0`
- 不引入复杂联动

### 3. 套餐报价页

页面输入区改为：

- 套餐选择
- 宽度
- 窗帘类型

窗帘类型选项：

- 布和纱
- 只有布
- 只有纱

保留展示区：

- 用量明细
- 费用调整
- 预算金额

无套餐时：

- 不允许继续套餐报价
- 展示空状态并引导去新增套餐

## 计算规则

### 基础规则

- 默认褶皱倍数固定为 `2`
- `trackLength = width`
- 金额统一通过现有 `roundMoney` 做分级四舍五入

### 实际用量计算

#### 布和纱

- `fabricUsage = width * 2`
- `sheerUsage = width * 2`
- `trackLength = width`

#### 只有布

- `fabricUsage = width * 2`
- `sheerUsage = 0`
- `trackLength = width`

#### 只有纱

- `fabricUsage = 0`
- `sheerUsage = width * 2`
- `trackLength = width`

### 差额计算

- `fabricDiff = fabricUsage - includedFabric`
- `sheerDiff = sheerUsage - includedSheer`
- `trackDiff = trackLength - includedTrack`

### 调整金额计算

对布 / 纱 / 轨道分别执行：

- 当差额 `>= 0` 时：`diff * addPrice`
- 当差额 `< 0` 时：`diff * reducePrice`

注意：

- 退还场景中 `diff` 为负数，因此结果自然为负金额，代表从套餐价中扣减。

### 最终金额

`amount = basePrice + fabricAdjustment + sheerAdjustment + trackAdjustment`

## 展示设计

### 套餐汇总 / 详情 / 分享页

不再展示“布宽 / 纱宽”。

改为展示：

- 宽度：`x.xx米`
- 类型：`布和纱 / 只有布 / 只有纱`

### 海报

海报房间表格中的套餐行：

- 第一优先展示 `宽 x.xx米`
- 第二行展示 `类型：布和纱 / 只有布 / 只有纱`

保留现有金额列和整体海报结构。

## 代码落点

预计主要影响文件：

- `apps/miniapp/src/modules/curtain-quote/types/quote.ts`
- `apps/miniapp/src/modules/curtain-quote/services/quote-calculator.ts`
- `apps/miniapp/src/modules/curtain-quote/services/quote-factory.ts`
- `apps/miniapp/src/modules/curtain-quote/services/quote-storage.ts`
- `apps/miniapp/src/modules/curtain-quote/poster/builder.ts`
- `apps/miniapp/src/pages/quote-package/index.tsx`
- `apps/miniapp/src/pages/quote-summary/index.tsx`
- `apps/miniapp/src/pages/quote-detail/index.tsx`
- `apps/miniapp/src/pages/quote-share/index.tsx`

预计新增文件：

- `apps/miniapp/src/modules/curtain-quote/types/package-config.ts` 或并入现有类型文件
- `apps/miniapp/src/modules/curtain-quote/services/package-config-storage.ts`
- `apps/miniapp/src/pages/package-configs/index.tsx`
- `apps/miniapp/src/pages/package-config-item/index.tsx`

## 实施顺序

1. 重构类型定义，建立 `PackageConfig` 和新 `PackageQuoteItem`
2. 新增套餐配置本地存储服务
3. 新增套餐配置列表页与编辑页
4. 改写套餐报价页输入与空状态
5. 重写套餐计算器
6. 调整汇总、详情、分享、海报展示
7. 运行类型检查与小程序构建验证

## 风险与约束

1. 本次为破坏性改动，不兼容旧套餐报价结构。
2. 旧 `fabricWidth / sheerWidth` 语义将被 `width / curtainMode` 替换。
3. 若用户删除某个已被报价引用的套餐配置，历史报价只能依赖 `packageNameSnapshot` 和已保存的金额结果展示，不能再回溯完整套餐规则。

## 验证要点

- 无套餐配置时的空状态和入口跳转
- 新增套餐后可被套餐报价页选择
- 宽度为 0 时金额为套餐基础价或 0 输入态
- 布和纱场景计算正确
- 只有布场景计算正确
- 只有纱场景计算正确
- 超出场景按 addPrice 计算
- 未使用完场景按 reducePrice 计算
- 汇总、详情、分享、海报展示与新语义一致

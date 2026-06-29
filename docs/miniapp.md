# Thunder 小程序端设计

## 概述

Thunder 小程序端位于 `apps/miniapp`，采用 Taro + React + TypeScript 实现，用于后续兼容微信、支付宝、抖音等多端小程序。小程序端是独立前端应用，不接入 `apps/web` 的 `ModuleRegistry`、Sidebar、AppShell 或 `/modules/[moduleId]` 动态路由。

首个模块为“窗帘价格测算”，P0 数据只保存到小程序本地存储，不访问 `apps/api`，也不写入云端数据库。

## 目录结构

```text
apps/miniapp
├── config/                         # Taro 构建配置
├── project.config.json             # 微信开发者工具配置
├── project.tt.json                 # 抖音开发者工具配置
├── src/
│   ├── app.ts                      # 小程序应用入口
│   ├── app.config.ts               # 小程序页面与窗口配置
│   ├── pages/
│   │   ├── home/                   # 首页：新建报价、搜索、报价列表
│   │   ├── quote-new/              # 新建报价：客户信息
│   │   ├── quote-mode/             # 报价方式选择
│   │   ├── quote-normal/           # 普通报价
│   │   ├── quote-normal-item/      # 普通报价项目新增/编辑
│   │   ├── quote-package/          # 套餐报价
│   │   ├── quote-summary/          # 报价汇总
│   │   ├── quote-detail/           # 报价详情
│   │   └── quote-share/            # 报价分享
│   └── modules/
│       └── curtain-quote/          # 窗帘价格测算模块
│           ├── components/         # 页面组件
│           ├── data/               # 套餐、折扣等前端固定配置
│           ├── services/           # 本地存储、校验、计算规则
│           └── types/              # 模块类型
└── package.json
```

## 命令

```bash
# 默认微信小程序开发
pnpm dev:miniapp

# 分平台开发
pnpm dev:miniapp:weapp
pnpm dev:miniapp:alipay
pnpm dev:miniapp:tt

# 默认微信小程序构建
pnpm build:miniapp

# 分平台构建
pnpm build:miniapp:weapp
pnpm build:miniapp:alipay
pnpm build:miniapp:tt
```

构建产物输出到 `apps/miniapp/dist`，再由对应平台开发者工具打开。

## 数据边界

当前小程序端数据流：

```text
小程序页面 → modules/curtain-quote/services/quote-storage.ts → Taro Storage
```

当前本地存储 key 为 `thunder:miniapp:curtain-quotes:v1`。页面不得直接读写 storage key，必须通过 `quote-storage.ts` 统一访问。

当前首模块不访问：

- `apps/api`
- `packages/database`
- `packages/api-client`
- `apps/web/src/modules/*`
- `scripts/generate-enabled-modules.mjs`

## P0 范围

当前已实现 P0 页面和核心行为：

- 首页：首屏视觉、搜索客户姓名/手机号、本地报价列表、底部 Tab 视觉。
- 新建报价：客户姓名、手机号、安装地址、备注；支持校验、保存草稿、下一步。
- 报价方式选择：普通报价和套餐报价两个入口。
- 普通报价：按房间/位置展示明细，支持新增、编辑、删除和实时重算。
- 普通报价项目：记录房间/位置、宽度、高度、型号/颜色、安装要求、褶皱倍数、布/纱单价、轨道单价、衬带单价、环/勾单价、环/勾数量、安装费，并预览当前预算。
- 套餐报价：选择套餐，输入布宽/纱宽，展示用量明细、费用调整和预算金额。
- 报价汇总：展示客户、明细、原价、95 折、9 折、85 折，支持选择折扣、保存报价、分享前校验。
- 报价详情：从首页进入，查看本地报价信息，支持作废和删除。
- 报价分享：展示可发给客户的报价单，支持保存图片和小程序分享。

## P1 范围

当前已实现 P1 行为：

- 历史报价搜索：首页按客户姓名、手机号实时筛选本机报价。
- 报价详情页：展示状态、客户信息、报价信息、报价明细，支持继续编辑、分享报价、确认报价、作废报价。
- 报价分享页：展示“窗帘报价单”预览，包含客户、电话、地址、日期、报价明细、原价合计、折扣、最终报价和备注。
- 保存图片：分享页通过 Canvas 生成报价单图片，并调用小程序相册保存能力。
- 发送给客户：分享页提供 `openType="share"` 入口，分享内容指向当前报价分享页。

UI 设计图中的客户姓名、手机号、地址、报价金额、房间明细等只作为布局参考，不写入默认业务数据。新建报价默认不预置 UI 示例客户或房间明细。

## PRD 覆盖状态

当前实现已覆盖 PRD 中不依赖云端服务的首版核心流程：

- 本地报价单创建、草稿保存、历史列表、搜索、详情查看。
- 普通报价和套餐报价两种测算方式。
- 普通报价项目新增、编辑、删除和金额计算。
- 套餐选择、布宽/纱宽输入、用量明细、差额调整和金额计算。
- 报价汇总、折扣选择、最终报价、保存报价、分享报价和保存图片。
- 数据仅保存在小程序本地存储，符合首个模块不设计云端服务的约束。

仍需业务确认的点：

- 套餐档位除 PRD 示例外的差额单价是否有正式规则；当前按前端固定配置实现。
- 保存图片、相册权限、平台分享回调在微信、支付宝、抖音真机上的表现需要分别验收。

## UI 资产策略

P0 页面不直接裁切 UI 设计稿截图作为素材。首页场景和汇总页房间缩略图使用压缩后的本地真实家居图片，当前包含 `客厅`、`卧室`、`通用房间` 三类素材映射；报价方式插画保留本地 SVG。

图标不使用仓库自绘图标，统一通过 `lucide-static` 提供的 SVG 资源引用，以便后续接近 shadcn/lucide 的图标体系，同时避免直接引入不适配小程序的 Web DOM 组件。

首页列表只展示用户在当前设备真实创建或保存的报价。

## 计算规则

普通报价：

```text
预算金额 =
宽度 × 褶皱倍数 × 布/纱单价
+ 宽度 × 轨道单价
+ 宽度 × 褶皱倍数 × 衬带单价
+ 环/勾单价 × 环/勾数量
+ 安装费
```

套餐报价：

```text
布实际用量 = 布宽 × 2
纱实际用量 = 纱宽 × 2
轨道长度 = 布宽 + 纱宽
预算金额 = 套餐基础价 + 布调整 + 纱调整 + 轨道调整
```

金额统一在 `quote-calculator.ts` 中四舍五入到分，页面只负责展示。

## 后续接入云端服务

如果后续小程序模块需要云端同步，仍按 Thunder 契约优先规则实现：

1. 在 `packages/contracts/openapi/` 新增 OpenAPI 契约。
2. 在 `apps/api/src/modules/` 实现 Hono 路由和 Repository。
3. 在小程序端新增 Taro request transport 或小程序专用 API client。
4. 小程序端通过 `/api/v1/*` 访问 API，不直接访问数据库。

## 模块规则

- 小程序模块默认放在 `apps/miniapp/src/modules/{module-id}`。
- 小程序页面入口放在 `apps/miniapp/src/pages/{page-id}`。
- 小程序模块不自动进入 Web/Desktop 的模块注册系统。
- 如需跨端共享纯类型，可在 `modules/{module-id}` 新增共享类型包，但不得放入具体实现。
- 本地存储 key 必须集中在 `services/` 层管理，页面组件不得散落硬编码 storage key。

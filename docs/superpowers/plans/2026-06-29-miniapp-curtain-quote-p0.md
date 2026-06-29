# 小程序端窗帘报价 P0 Implementation Plan

**Goal:** 在 `apps/miniapp` 独立 Taro 小程序端实现“窗帘价格测算”P0，首阶段不接云端服务，报价数据只保存到小程序本地存储。

**Architecture:** 小程序端作为独立前端应用，不复用 Web/Desktop 现有业务模型，不接入 `apps/web` 的 `ModuleRegistry`、Sidebar 或动态模块路由。模块业务位于 `apps/miniapp/src/modules/curtain-quote`，页面入口位于 `apps/miniapp/src/pages/*`。

**Tech Stack:** Taro 4、React 18、TypeScript、Taro Storage、微信/支付宝/抖音多端构建。

---

### Task 1: 工程骨架

**Files:**
- Create: `apps/miniapp/package.json`
- Create: `apps/miniapp/project.config.json`
- Create: `apps/miniapp/project.tt.json`
- Create: `apps/miniapp/tsconfig.json`
- Create: `apps/miniapp/config/index.ts`
- Create: `apps/miniapp/config/dev.ts`
- Create: `apps/miniapp/config/prod.ts`
- Modify: `package.json`

- [x] **Step 1: 新增 Taro 多端小程序包**

创建 `@thunder/miniapp`，脚本包含微信、支付宝、抖音三类开发和构建入口。

- [x] **Step 2: 接入根脚本**

根 `package.json` 增加 `dev:miniapp`、`build:miniapp` 以及分平台脚本，方便从 workspace 根目录调用。

### Task 2: 窗帘报价 P0 模块

**Files:**
- Create: `apps/miniapp/src/app.ts`
- Create: `apps/miniapp/src/app.config.ts`
- Create: `apps/miniapp/src/app.css`
- Create: `apps/miniapp/src/modules/curtain-quote/types/quote.ts`
- Create: `apps/miniapp/src/modules/curtain-quote/services/quote-calculator.ts`
- Create: `apps/miniapp/src/modules/curtain-quote/services/quote-storage.ts`
- Create: `apps/miniapp/src/modules/curtain-quote/components/page-shell.tsx`
- Create: `apps/miniapp/src/pages/home/index.tsx`
- Create: `apps/miniapp/src/pages/quote-new/index.tsx`
- Create: `apps/miniapp/src/pages/quote-mode/index.tsx`
- Create: `apps/miniapp/src/pages/quote-normal/index.tsx`
- Create: `apps/miniapp/src/pages/quote-package/index.tsx`
- Create: `apps/miniapp/src/pages/quote-summary/index.tsx`
- Create: `apps/miniapp/src/pages/quote-detail/index.tsx`

- [x] **Step 1: 定义报价数据模型**

定义客户信息、普通报价明细、套餐报价明细、报价主单、折扣档位，字段只保存可 JSON 序列化数据。

- [x] **Step 2: 封装计算规则**

普通报价按宽度、褶皱倍数、布/纱单价、轨道、衬带、环/勾和安装费计算。套餐报价按基础价和布/纱/轨道差额计算。金额统一四舍五入到分。

- [x] **Step 3: 封装 Taro Storage**

存储服务统一管理 `thunder:miniapp:curtain-quotes:v1`，页面不直接操作 storage key。

- [x] **Step 4: 实现 P0 页面流**

实现首页、新建报价、报价方式选择、普通报价、套餐报价、报价汇总、报价详情。

- [x] **Step 5: 补充本地素材**

首页首屏和汇总页房间缩略图使用本地真实家居图片，包含客厅、卧室和通用房间。常用图标使用 `lucide-static` 第三方 SVG 资源，不使用仓库自绘图标。

### Task 3: 文档和验证

**Files:**
- Create/Modify: `docs/miniapp.md`
- Modify: `docs/architecture.md`
- Modify: `docs/service-boundary.md`

- [x] **Step 1: 编写中文小程序端文档**

说明目录、命令、P0 范围、数据边界、计算规则和后续接云端方式。

- [x] **Step 2: 更新架构与服务边界**

把 `apps/miniapp` 纳入前端边界，并明确当前首模块不访问后端。

- [x] **Step 3: 验证**

运行小程序包 typecheck、微信/支付宝/抖音三端构建、全仓 lint。全仓 typecheck 当前仍失败在既有 `apps/api` Emby/Vault 类型问题，与小程序 P0 无关。

### Task 4: P1 分享与详情

**Files:**
- Modify: `apps/miniapp/src/pages/quote-detail/index.tsx`
- Modify: `apps/miniapp/src/pages/quote-detail/index.css`
- Create: `apps/miniapp/src/pages/quote-share/index.tsx`
- Create: `apps/miniapp/src/pages/quote-share/index.css`
- Create: `apps/miniapp/src/pages/quote-share/index.config.ts`
- Modify: `apps/miniapp/src/pages/quote-summary/index.tsx`

- [x] **Step 1: 完善报价详情页**

按 UI 文档补充状态、客户信息、报价信息、报价明细，以及继续编辑、分享报价、确认报价、作废报价操作。

- [x] **Step 2: 新增报价分享页**

实现“窗帘报价单”预览页，展示客户、电话、地址、日期、报价明细、原价合计、折扣、最终报价和备注。

- [x] **Step 3: 实现保存图片和分享入口**

分享页通过 Canvas 生成图片并调用保存到相册能力；发送给客户使用小程序分享入口。

- [x] **Step 4: 移除 UI 示例数据默认值**

新建报价不预置 UI 示例客户、房间、宽度或套餐宽度，页面只复刻 UI 布局和样式。

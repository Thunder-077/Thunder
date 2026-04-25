# Thunder 路线图

## Phase 1：应用壳和页面骨架 ✅ 当前阶段

**目标**：搭建可运行的应用框架

- [x] 项目初始化（Next.js + TypeScript + Tailwind + shadcn/ui）
- [x] Monorepo 工作区结构
- [x] 应用外壳（Sidebar + Topbar + Content）
- [x] 主题切换（浅色/深色/系统）
- [x] 模块注册机制（Manifest + Registry）
- [x] Mock 模块（待办事项、密码保险箱、AI 中心）
- [x] 基础页面（首页、模块中心、设置、404）
- [x] 基础组件（ModuleCard、EmptyState、PageHeader 等）
- [x] 设计文档

## Phase 2：模块系统和本地数据

**目标**：让模块真正可用

- [ ] 完善待办事项模块（本地持久化）
- [ ] 模块启用/禁用开关
- [ ] 模块设置页面（基于 settingsSchema 生成）
- [ ] 本地数据存储方案（IndexedDB / localStorage 封装）
- [ ] 模块数据隔离
- [ ] 全局命令面板（CmdK）
- [ ] 搜索功能

## Phase 3：PWA 和离线能力

**目标**：让应用可以离线使用

- [ ] PWA manifest 和 service worker
- [ ] 离线缓存策略
- [ ] 安装到桌面支持
- [ ] 离线数据同步队列
- [ ] 推送通知（可选）

## Phase 4：可选桌面端 Tauri

**目标**：提供原生桌面体验

- [ ] Tauri 集成
- [ ] 系统托盘
- [ ] 全局快捷键
- [ ] 原生文件系统访问
- [ ] 自动更新

## Phase 5：高级能力

**目标**：扩展生态和安全能力

- [ ] 端到端加密
- [ ] 跨设备数据同步
- [ ] 模块独立包和动态加载
- [ ] 插件 API 和第三方模块
- [ ] 模块市场
- [ ] 真实密码管理（加密存储）
- [ ] AI 账号管理和额度查看

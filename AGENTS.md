# AGENTS.md

修改此项目时必须遵守以下规则。

## 模块化

- 保持模块化边界，主应用只负责外壳、布局、导航、全局设置
- 具体业务逻辑必须放在对应模块中，不要写死在主应用
- 新增模块必须通过 Manifest 注册到 ModuleRegistry
- 模块间不直接共享状态，数据通过独立 key 隔离

## 依赖管理

- 不要过早引入复杂依赖
- 新增依赖前评估是否必要，优先使用已有依赖
- 不要引入微前端框架
- 不要引入复杂状态管理库（如 Redux、MobX），优先使用 React Context + useState
- 不要引入真实后端框架

## 页面和布局

- 新增页面必须符合现有布局（AppShell + Sidebar + Topbar + Content）
- 模块页面放在 `src/app/modules/{id}/` 目录下
- 使用 PageHeader 组件作为页面标题
- 使用 EmptyState 组件作为空状态

## UI 和样式

- 使用 shadcn/ui 组件，不要引入其他 UI 库
- 使用 lucide-react 图标，不要引入其他图标库
- 遵循 docs/ui-design.md 中的设计规范
- 修改 UI 时同步更新 docs/ui-design.md
- 保持极简风格：大量留白、低饱和配色、轻边框、柔和阴影、圆角卡片

## 模块系统

- 修改模块机制时同步更新 docs/module-system.md
- 模块 Manifest 必须包含所有必填字段
- 模块图标使用 lucide-react 图标名

## 代码质量

- TypeScript 类型要清晰，避免 any
- 组件命名要语义化
- 不要写大段无用 mock 数据
- 不要一次性实现太多业务功能
- 不要生成复杂、难维护的抽象
- 保持文件结构清晰

## 完成任务后

- 说明修改了哪些文件
- 能运行检查时运行 lint / typecheck / build
- 如果修改了设计相关内容，同步更新对应文档

# Thunder 模块系统设计

## 概述

Thunder 的模块系统采用 **Manifest 驱动** 的设计，每个模块通过声明式配置注册到主应用中，主应用负责模块的发现、导航和生命周期管理。

## Module Manifest

每个模块必须提供一个 Manifest，声明其元信息：

```typescript
interface ModuleManifest {
  id: string              // 唯一标识符，如 "todo"
  name: string            // 显示名称，如 "待办事项"
  description: string     // 模块描述
  icon: string            // 图标名称（lucide-react 图标名）
  route: string           // 路由路径，如 "/modules/todo"
  category: ModuleCategory // 分类
  order: number           // 排序权重
  enabled: boolean        // 是否启用
  component?: string      // 组件路径（预留）
  settingsSchema?: Record<string, unknown> // 设置 schema（预留）
}
```

### 分类 (ModuleCategory)

```typescript
type ModuleCategory =
  | "productivity"  // 效率工具
  | "security"      // 安全隐私
  | "ai"            // AI 相关
  | "notes"         // 笔记知识
  | "tools"         // 实用工具
  | "dashboard"     // 数据看板
  | "other"         // 其他
```

## 模块注册

### 当前实现

模块通过 `ModuleRegistry` 类进行注册：

```typescript
const registry = new ModuleRegistry()
registry.register({
  id: "todo",
  name: "待办事项",
  // ...
})
```

注册后，模块会自动出现在侧边栏导航和模块中心页面中。

### 注册流程

1. 模块定义 Manifest
2. 调用 `registry.register(manifest)` 注册
3. 主应用从 Registry 读取模块列表
4. 侧边栏和模块中心自动渲染已注册模块
5. 路由系统根据 `route` 字段匹配页面

## 模块生命周期（预留）

当前阶段模块是静态注册的，未来将支持完整的生命周期：

```
注册 → 初始化 → 激活 → 停用 → 卸载
```

- **注册**：模块声明 Manifest 并注册到 Registry
- **初始化**：模块加载资源、初始化状态
- **激活**：模块可见，可以交互
- **停用**：模块不可见，释放非必要资源
- **卸载**：模块从 Registry 移除，清理所有资源

## 模块数据隔离

### 建议方案

- 每个模块使用独立的 localStorage key 前缀：`thunder:module:{id}:*`
- 每个模块使用独立的 IndexedDB 数据库或 object store
- 模块间不直接共享状态
- 需要跨模块通信时，通过主应用提供的事件总线

### 示例

```typescript
// 模块 A 存储
localStorage.setItem("thunder:module:todo:items", JSON.stringify(items))

// 模块 B 存储
localStorage.setItem("thunder:module:password-vault:entries", JSON.stringify(entries))
```

## 模块页面约定

每个模块的页面文件放置在 `src/app/modules/{id}/page.tsx`，与 Manifest 中的 `route` 字段对应：

```
src/app/modules/
├── todo/
│   └── page.tsx          # /modules/todo
├── password-vault/
│   └── page.tsx          # /modules/password-vault
└── ai-hub/
    └── page.tsx          # /modules/ai-hub
```

## 未来插件化方向

1. **独立包**：每个模块作为独立 npm 包发布
2. **动态加载**：运行时按需加载模块代码
3. **插件 API**：标准化的模块接口，支持第三方开发
4. **模块市场**：浏览和安装社区模块
5. **沙箱隔离**：模块运行在沙箱环境中，限制 API 访问
6. **配置 UI**：根据 settingsSchema 自动生成模块设置页面

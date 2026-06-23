# @thunder/plugin-schema

Thunder 桌面插件 Manifest 与权限校验工具。

插件作者通常不需要直接依赖本包，优先使用 `@thunder/plugin-sdk` 和
`@thunder/plugin-cli`。需要在自定义工具中校验 `plugin.json` 时，可以使用：

```ts
import { parseThunderPluginManifest } from "@thunder/plugin-schema"
```

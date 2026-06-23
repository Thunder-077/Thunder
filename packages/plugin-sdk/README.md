# @thunder/plugin-sdk

Thunder 桌面插件公开 SDK。

Browser UI 使用：

```ts
import { thunder } from "@thunder/plugin-sdk/browser"

const manifest = await thunder.plugin.getManifest()
await thunder.storage.set("draft", { text: "hello" })
```

Trusted worker 使用：

```ts
import { defineWorker } from "@thunder/plugin-sdk/worker"

export default defineWorker({
  handlers: {
    async "demo.echo"(payload) {
      return payload
    },
  },
})
```

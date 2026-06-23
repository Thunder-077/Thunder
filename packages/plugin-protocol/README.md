# @thunder/plugin-protocol

Thunder 桌面插件 Host Bridge 的协议契约、参数校验和权限映射。

插件作者一般通过 `@thunder/plugin-sdk/browser` 调用宿主能力，不需要手写
`postMessage` 协议。只有在开发调试工具或协议测试时才需要直接依赖本包。

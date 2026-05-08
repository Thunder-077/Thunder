# Vault 模块开发规则

修改 Vault 模块时必须遵守以下规则。

## 核心安全规则

- Vault 明文数据不能发送给 apps/api
- Vault 加密仍然必须在客户端完成
- apps/api 只能接收和保存 VaultMetadata / VaultItemRecord 的密文结构
- 数据库中不能保存明文 title、username、password、url、notes、tags
- dataKey / DEK 不能持久化到 localStorage、sessionStorage、IndexedDB 或数据库，只能存在内存中
- 主密码不能保存
- 服务端不能接触明文密码

## 组件开发规则

- 页面组件禁止直接访问 localStorage、IndexedDB 或数据库，必须通过 API Client
- 页面组件禁止直接调用加密实现，必须通过 Crypto 接口
- 页面组件禁止直接拼装 VaultItemRecord
- 页面组件禁止直接解析 encryptedPayload
- VaultItemPlain 禁止直接持久化，必须通过 encryptVaultItem 转为 VaultItemRecord 后存储

## 加密规则

- 禁止明文落库：不要把明文密码写入 localStorage、IndexedDB 或数据库
- 禁止 mock crypto 进入生产路径：VaultProvider 必须使用 VaultCryptoWeb
- 每次加密必须使用新 nonce，禁止复用 nonce
- 不要在代码里硬编码真实主密码、真实 salt、真实 nonce 或真实密钥
- 如果使用 mock 数据或 mock crypto，必须明确标注「仅用于开发，不可用于生产」

## 导入导出规则

- Vault 模块导出只能默认导出密文备份
- Vault 模块导入必须校验备份结构并二次确认覆盖
- Vault 模块剪贴板清理不得覆盖用户后续复制的新内容

## 其他规则

- 修改 Vault 设计时同步更新 DESIGN.md
- 不要实现真实密码管理、真实密钥存储、真实账号爬取等敏感功能，除非后续任务明确要求
- Vault 模块不得绕过 vaultCrypto
- Vault API 只处理密文记录，不处理明文密码
- Vault 功能不能回退

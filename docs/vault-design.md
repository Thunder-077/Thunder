# Vault 密码保险箱 — 模块设计文档

## 模块目标

实现一个本地优先的密码保险箱模块，用户可以：

- 创建本地保险箱并设置主密码
- 通过主密码解锁保险箱
- 添加、查看、编辑、删除密码条目
- 复制用户名和密码
- 手动锁定保险箱
- 刷新页面后自动回到锁定状态
- 导出加密备份
- 导入加密备份
- 自动锁定（超时锁定）
- 密码生成器
- 剪贴板保护
- Vault 设置项管理

## 已实现内容

### 第一阶段（骨架）

- ✅ 类型定义
- ✅ Repository 接口 + 实现
- ✅ Crypto 接口 + 实现
- ✅ 状态管理
- ✅ 页面结构 + UI 组件
- ✅ 模块注册

### 第二阶段（本地 MVP 流程）

- ✅ IndexedDB 存储实现
- ✅ 完整创建/解锁/锁定流程
- ✅ 新增/编辑/删除条目
- ✅ 复制用户名和密码
- ✅ 刷新后回到锁定状态

### 第三阶段（真实加密）

- ✅ 使用 Web Crypto API 实现真实加密
- ✅ PBKDF2 密钥派生（600,000 iterations + 随机 salt）
- ✅ AES-256-GCM 对称加密（每次新随机 nonce）
- ✅ KEK/DEK 双层密钥架构
- ✅ 错误主密码无法解锁
- ✅ 解锁失败不泄露内部信息
- ✅ VaultCryptoError 错误类型
- ✅ Mock crypto 保留但不在生产路径

### 第四阶段（导入导出、自动锁定、密码生成器、剪贴板保护、设置项）

- ✅ 导出加密备份
- ✅ 导入加密备份
- ✅ 自动锁定（超时锁定）
- ✅ 密码生成器
- ✅ 剪贴板保护
- ✅ Vault 设置项
- ✅ 危险操作（清空本地保险箱）

### 第五阶段（SQLite 数据库迁移）

- ✅ 从 IndexedDB 迁移到 SQLite
- ✅ Prisma ORM 集成
- ✅ 服务端 API 层（/api/vault/*）
- ✅ 前端 API Client
- ✅ VaultRepositorySQLite 实现
- ✅ 数据库表设计（vault_metadata + vault_items）

### 第六阶段（前后端分离架构调整）

- ✅ apps/api 独立后端服务（Hono）
- ✅ packages/contracts API 契约
- ✅ packages/api-client 前端 API 客户端
- ✅ modules/vault 共享类型包
- ✅ 前端通过 API Client 调用 apps/api
- ✅ Next.js rewrites 代理 /api/v1/* 到 apps/api
- ✅ Vault 功能不回退

## 数据存储架构

### 当前方案：客户端加密 + 服务端密文存储

Vault 采用客户端加密、服务端只存密文的架构：

```
浏览器（客户端加密）
  → VaultCryptoWeb.encryptVaultItem(DEK, plain) → VaultItemRecord（密文）
  → VaultClient（@thunder/api-client）
  → /api/v1/vault/items/:id
  → apps/api → VaultRepositorySQLite → Prisma → SQLite（只存密文）
```

### 安全边界

- 加密和解密仍然在客户端完成（vaultCrypto）
- apps/api 只处理密文记录，不处理明文密码
- 明文数据不能发送给 apps/api
- SQLite 中不保存明文 title、username、password、url、notes、tags
- dataKey / DEK 不能持久化到任何存储
- 主密码不能保存
- 服务端不能接触明文密码
- 页面组件不直接访问 SQLite 或 Prisma

### 数据库表设计

#### vault_metadata

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PRIMARY KEY | 保险箱 ID |
| version | INTEGER NOT NULL | 版本号 |
| kdf_json | TEXT NOT NULL | KDF 参数 JSON（VaultKdfParams） |
| encrypted_data_key_json | TEXT NOT NULL | 加密的 DEK |
| created_at | TEXT NOT NULL | 创建时间 |
| updated_at | TEXT NOT NULL | 更新时间 |

#### vault_items

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PRIMARY KEY | 条目 ID |
| vault_id | TEXT NOT NULL | 所属保险箱 ID |
| encrypted_payload_json | TEXT NOT NULL | 加密载荷 JSON（EncryptedPayload） |
| created_at | TEXT NOT NULL | 创建时间 |
| updated_at | TEXT NOT NULL | 更新时间 |

### 关键约束

- vault_items 中只保存加密后的 VaultItemRecord
- 不允许保存 VaultItemPlain
- 不允许保存明文 title、username、password、url、notes、tags
- encrypted_payload_json 保存密文结构（algorithm、nonceBase64、ciphertextBase64）
- kdf_json 保存 VaultKdfParams 结构
- encrypted_data_key_json 保存加密的 DEK

### 删除策略

- 删除条目使用物理删除
- clearVault 使用物理删除（DELETE ALL）

### API 层

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/vault/metadata | 获取保险箱元信息 |
| PUT | /api/v1/vault/metadata | 保存保险箱元信息 |
| GET | /api/v1/vault/items?vaultId= | 获取条目列表（密文） |
| GET | /api/v1/vault/items/:id | 获取单个条目（密文） |
| PUT | /api/v1/vault/items/:id | 保存条目（密文） |
| DELETE | /api/v1/vault/items/:id | 删除条目 |
| POST | /api/v1/vault/clear | 清空保险箱 |

- API 只处理密文记录，不处理明文密码
- 加密和解密在客户端 vaultCrypto 中完成
- API 层调用 Repository，Repository 使用 Prisma 访问 SQLite
- 所有 API 响应使用 ApiResponse<T> 格式

### 旧数据迁移方案

当前阶段不提供自动迁移工具。如果用户之前使用 IndexedDB 版本：

1. 在旧版本中导出加密备份（vault-backup-YYYY-MM-DD.json）
2. 升级到 SQLite 版本后，通过"导入加密备份"恢复数据
3. 迁移过程只迁移密文记录，不涉及明文

## 模块代码分布

### 共享类型（modules/vault）

```
modules/vault/src/
├── types/
│   ├── index.ts           # VaultMetadata, VaultItemRecord, EncryptedPayload 等
│   └── vault-settings.ts  # VaultSettings, 默认值
├── repository/
│   └── interface.ts       # IVaultRepository 接口
├── crypto/
│   └── interface.ts       # IVaultCrypto 接口
└── index.ts               # 统一导出
```

### 前端模块（apps/web/src/modules/vault）

```
apps/web/src/modules/vault/
├── components/            # 17 个 UI 组件
├── crypto/                # 客户端加密实现
│   ├── vault-crypto.web.ts   # VaultCryptoWeb（生产）
│   ├── vault-crypto.dev.ts   # VaultCryptoDev（开发/测试）
│   ├── crypto-utils.ts       # 加密工具函数
│   └── interface.ts          # IVaultCrypto 接口（本地引用）
├── hooks/                 # React hooks
│   ├── use-auto-lock.ts
│   ├── use-clipboard-protection.ts
│   └── use-vault-settings.ts
├── state/                 # 状态管理
│   ├── vault-provider.tsx    # VaultProvider + useVault
│   └── index.ts
├── repository/            # 前端只保留接口引用
│   ├── interface.ts
│   └── index.ts
├── types/                 # 前端本地类型（从 @thunder/vault 重新导出）
│   ├── index.ts
│   └── vault-settings.ts
└── utils/
    └── generate-password.ts
```

### 后端模块（apps/api/src/modules/vault）

```
apps/api/src/modules/vault/
├── vault-routes.ts              # Hono API 路由
└── vault-repository.sqlite.ts   # VaultRepositorySQLite 实现
```

### API Client（packages/api-client）

```
packages/api-client/src/
├── client.ts               # ThunderClient 基类
├── modules/
│   └── vault.ts            # VaultClient
└── index.ts                # 统一导出 + createApiClients
```

### API 契约（packages/contracts）

```
packages/contracts/
├── openapi/
│   └── vault.yaml          # Vault OpenAPI 规范
└── src/
    ├── api-response.ts     # ApiResponse<T>, ApiErrorCode
    ├── error-codes.ts      # VAULT_ERROR_CODES
    └── index.ts
```

## 明确不做什么

- ❌ 浏览器自动填充
- ❌ 真实账号抓取
- ❌ 泄露检测
- ❌ 多人共享
- ❌ 明文密码写入 localStorage 或 IndexedDB
- ❌ dataKey 持久化到任何存储
- ❌ 保存主密码或主密码 hash
- ❌ 明文导出（除非后续任务明确要求）
- ❌ 明文 CSV 导入
- ❌ 服务端接触明文密码
- ❌ 功能回退

## 加密模型

### 密钥架构：KEK / DEK

```
主密码 + salt → PBKDF2 → KEK（密钥加密密钥）
随机生成 → DEK（数据加密密钥，用于加密条目）
KEK + AES-256-GCM → 加密 DEK → encryptedDataKey（存入 VaultMetadata）
```

- **KEK**（Key Encryption Key）：从主密码派生，仅用于加密/解密 DEK，不直接加密条目
- **DEK**（Data Encryption Key）：随机生成，用于加密/解密所有条目
- **encryptedDataKey**：用 KEK 加密后的 DEK，持久化到 VaultMetadata
- **DEK 只存在内存中**，不持久化

### 为什么使用 KEK/DEK 双层架构

1. 修改主密码时只需重新加密 DEK，不需要重新加密所有条目
2. 未来可以实现密钥轮换
3. DEK 可以安全导出给其他设备（用不同 KEK 加密）

## 加密算法

### KDF：PBKDF2-SHA256

- **算法**：PBKDF2 with SHA-256
- **迭代次数**：600,000
- **Salt**：32 字节随机生成，每个保险箱独立
- **输出**：256-bit KEK

选择 PBKDF2 而非 Argon2id 的原因：
- Web Crypto API 原生支持 PBKDF2，无需引入 WASM 依赖
- 600,000 iterations 在现代浏览器中提供足够的暴力破解阻力
- 后续计划：引入 Argon2id（WASM）作为更强的 KDF 选项

### 对称加密：AES-256-GCM

- **算法**：AES-256-GCM
- **Nonce/IV**：12 字节随机生成，每次加密使用新 nonce
- **输出**：密文 + GCM 认证标签

### Salt 策略

- 每个保险箱生成独立 salt（32 字节）
- Salt 存储在 VaultMetadata.kdf.saltBase64 中
- 修改主密码时生成新 salt

### Nonce 策略

- 每次加密操作生成新 nonce（12 字节）
- Nonce 存储在 EncryptedPayload.nonceBase64 中
- 同一条目每次编辑后 nonce 不同，密文也不同

## 创建保险箱流程

```
用户输入主密码 → 前端校验
  → 生成随机 salt（32 bytes）
  → PBKDF2(主密码, salt, 600000) → KEK
  → 生成随机 DEK（32 bytes）
  → AES-256-GCM(KEK, DEK) → encryptedDataKey
  → 保存 VaultMetadata（含 salt、iterations、encryptedDataKey）
  → VaultClient.saveMetadata(metadata) → apps/api → SQLite
  → DEK 以 base64 形式存入内存（VaultProvider state）
  → 状态切换为 unlocked
```

## 解锁流程

```
用户输入主密码
  → VaultClient.getMetadata() → apps/api → SQLite → VaultMetadata
  → PBKDF2(主密码, salt, iterations) → KEK
  → AES-256-GCM-Decrypt(KEK, encryptedDataKey) → DEK
  → 如果解密失败 → 主密码错误
  → DEK 以 base64 形式存入内存
  → VaultClient.listItems(vaultId) → apps/api → SQLite → VaultItemRecord[]
  → AES-256-GCM-Decrypt(DEK, nonce, ciphertext) × N → VaultItemPlain[]
  → 状态切换为 unlocked
```

## 条目加解密流程

### 加密

```
VaultItemPlain → JSON 序列化 → UTF-8 编码
  → 生成新 nonce（12 bytes）
  → AES-256-GCM(DEK, nonce, plaintext) → ciphertext
  → 构建 EncryptedPayload { algorithm, nonceBase64, ciphertextBase64 }
  → 构建 VaultItemRecord { id, vaultId, encryptedPayload, ... }
  → VaultClient.saveItem(record) → apps/api → SQLite（只存密文）
```

### 解密

```
VaultClient.listItems(vaultId) → VaultItemRecord[]
VaultItemRecord.encryptedPayload
  → base64 解码 nonce 和 ciphertext
  → AES-256-GCM-Decrypt(DEK, nonce, ciphertext) → plaintext
  → UTF-8 解码 → JSON 解析 → VaultItemPlain
```

## 修改主密码流程

```
旧主密码解锁 → 得到 DEK（已在内存中）
  → 输入新主密码
  → 生成新 salt
  → PBKDF2(新主密码, 新salt, 600000) → 新 KEK
  → AES-256-GCM(新KEK, DEK) → 新 encryptedDataKey
  → VaultClient.saveMetadata(metadata) → apps/api → SQLite
  → 旧主密码不再能解锁
```

## dataKey / DEK 只在内存中的设计

- DEK 以 base64 字符串形式存储在 VaultProvider 的 `useState<string | null>(null)` 中
- **不**持久化到 localStorage
- **不**持久化到 sessionStorage
- **不**持久化到 IndexedDB
- **不**持久化到 SQLite
- 手动锁定时 `setDataKey(null)` 清空
- 自动锁定时 `setDataKey(null)` 清空
- 刷新页面后 DEK 自动丢失
- 解锁时从主密码重新派生 KEK → 解密 DEK

## 加密备份格式

### 导出格式

```json
{
  "type": "thunder-vault-backup",
  "version": 1,
  "metadata": { ... VaultMetadata ... },
  "items": [ ... VaultItemRecord[] ... ],
  "exportedAt": "2026-04-26T12:00:00.000Z"
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | string | 固定为 `"thunder-vault-backup"`，用于标识备份文件 |
| `version` | number | 备份格式版本，当前为 `1` |
| `metadata` | VaultMetadata | 保险箱元信息（含 KDF 参数、加密的 DEK） |
| `items` | VaultItemRecord[] | 加密条目记录数组（密文） |
| `exportedAt` | string | 导出时间 ISO 8601 |

### 关键约束

- `items` 必须是 `VaultItemRecord` 密文数据，不允许默认导出 `VaultItemPlain` 明文
- 导出文件为 `.json` 格式
- 文件名包含日期，例如 `vault-backup-2026-04-26.json`
- 导出前提示用户：备份文件仍需主密码才能恢复，请妥善保存
- 导出逻辑通过 VaultClient 获取密文记录，不从 UI 明文状态导出

## 导出流程

```
用户点击导出 → 确认提示
  → VaultClient.listItems(vaultId) → VaultItemRecord[]（密文）
  → vaultCrypto.exportEncryptedBackup(metadata, records) → VaultBackup
  → JSON.stringify(backup) → 下载为 .json 文件
```

- 导出过程中不解密任何条目
- 导出的 items 是直接从 apps/api 获取的密文记录

## 导入流程

```
用户选择 JSON 文件 → 确认覆盖提示（二次确认）
  → JSON.parse → 校验 type === "thunder-vault-backup"
  → 校验 metadata 和 items 基本结构
  → VaultClient.clearVault() → 清空当前保险箱
  → VaultClient.saveMetadata(backup.metadata) → 保存导入的元信息
  → VaultClient.saveItem(item) × N → 保存导入的密文条目
  → 状态切换为 locked（需要重新输入主密码解锁）
```

### 导入约束

- 导入前必须二次确认覆盖
- 导入过程不解密明文
- 导入后回到未解锁状态，要求用户输入主密码解锁
- 不支持明文 CSV 导入
- 校验 `type` 和 `version` 字段

## 自动锁定设计

### 设置项

| 选项 | 值（分钟） |
|------|-----------|
| 关闭 | 0 |
| 1 分钟 | 1 |
| 5 分钟（默认） | 5 |
| 15 分钟 | 15 |
| 30 分钟 | 30 |

### 触发逻辑

- 用户无操作超过设定时间，自动锁定
- 监听的用户活动事件：mousemove、keydown、mousedown、touchstart、scroll
- 页面重新可见时（visibilitychange）重置计时器
- 手动锁定仍然可用

### 自动锁定时执行的操作

1. 清空 dataKey / DEK（`setDataKey(null)`）
2. 清空内存中的明文条目（`setItems([])`）
3. 清空选中条目（`setSelectedItem(null)`）
4. 状态切换为 `locked`
5. 回到 VaultUnlockPage

### 配置持久化

- 自动锁定配置存储在 localStorage（key: `thunder:module:vault:settings`）
- 配置为非敏感数据，可以持久化
- 不能持久化 dataKey / DEK
- 不能通过持久化 unlocked 状态绕过主密码解锁

## 密码生成器设计

### 功能

- 长度设置（8-64），默认 16
- 是否包含大写字母（默认开）
- 是否包含小写字母（默认开）
- 是否包含数字（默认开）
- 是否包含符号（默认开）
- 生成按钮
- 复制按钮
- 在 VaultItemForm 中可以一键填充生成的密码

### 安全要求

- 使用 `crypto.getRandomValues` 生成安全随机数
- 不使用 `Math.random`
- 保证每个启用的字符集至少出现一个字符
- Fisher-Yates 洗牌确保均匀分布
- 如果当前环境不支持安全随机数，给出错误提示

### 两种模式

1. **compact 模式**：嵌入 VaultItemEditDialog 的密码字段下方，仅显示生成按钮和填入按钮
2. **完整模式**：独立卡片，显示生成结果、复制按钮、所有参数调节

### 默认配置保存

- 密码生成器默认配置保存在 Vault 设置项中
- 通过 `useVaultSettings` hook 读写

## 剪贴板保护策略

### 复制提示

- 复制用户名时给出 toast 提示
- 复制密码时给出更谨慎提示

### 自动清理剪贴板

#### 设置项

| 选项 | 值（秒） |
|------|---------|
| 关闭（默认） | 0 |
| 15 秒 | 15 |
| 30 秒 | 30 |
| 60 秒 | 60 |

#### 清理策略

1. 复制密码后记录本次复制的内容和时间
2. 到达清理时间时读取剪贴板
3. 如果剪贴板内容仍然等于本次复制的密码，则清空
4. 如果剪贴板内容已经变化（用户复制了新内容），则不清空
5. 如果浏览器权限不允许读取剪贴板，则只提示用户手动清理

#### 关键约束

- 不得覆盖用户之后复制的新内容
- 仅对密码复制启用自动清理，用户名复制不触发
- 清理操作静默失败（权限不足时不报错）

## Vault 设置项

### 设置项列表

| 设置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| autoLockMinutes | number | 5 | 自动锁定时间（分钟），0 为关闭 |
| hidePasswordsByDefault | boolean | true | 是否默认隐藏密码 |
| generatorLength | number | 16 | 密码生成器默认长度 |
| generatorUppercase | boolean | true | 密码生成器是否包含大写字母 |
| generatorLowercase | boolean | true | 密码生成器是否包含小写字母 |
| generatorNumbers | boolean | true | 密码生成器是否包含数字 |
| generatorSymbols | boolean | true | 密码生成器是否包含符号 |
| clipboardAutoClear | boolean | false | 复制密码后是否自动清理剪贴板 |
| clipboardClearSeconds | number | 30 | 剪贴板自动清理时间（秒） |

### 存储方式

- 使用 `useSyncExternalStore` + localStorage 实现
- 存储 key: `thunder:module:vault:settings`
- 设置为非敏感数据，可以持久化
- 支持 partial update 和 reset

### 设置页面入口

- 在 VaultMainPage 工具栏中点击设置图标进入
- 设置页面包含所有设置项 + 导入导出 + 危险区域

## 危险操作说明

### 清空本地保险箱

- 二次确认对话框
- 文案明确：「清空本地保险箱将删除所有本地数据，包括所有密码条目和保险箱元信息。此操作不可撤销。」
- 执行后回到 VaultSetupPage（创建保险箱页面）
- 使用红色危险样式

### 导入加密备份覆盖

- 二次确认对话框
- 文案明确：「导入加密备份将覆盖当前本地保险箱的所有数据，此操作不可撤销。」
- 导入后需要重新输入主密码解锁

## 错误处理

### VaultCryptoError

| code | 含义 | 用户提示 |
|------|------|----------|
| `unlock_failed` | 主密码错误或数据损坏 | 主密码错误，请重试 |
| `encrypt_failed` | 加密失败 | 加密条目失败 |
| `decrypt_failed` | 解密失败 | 解密条目失败，数据可能已损坏 |
| `unsupported` | 功能未实现 | 功能尚未实现 |
| `invalid_data` | 数据格式不兼容 | 数据格式不兼容 |

- 解锁失败不泄露具体原因（不区分"密码错误"和"数据损坏"）
- 加密/解密失败不暴露内部堆栈

### API 错误码

| 错误码 | HTTP 状态码 | 说明 |
|--------|------------|------|
| VAULT_NOT_FOUND | 404 | 保险箱不存在 |
| VAULT_ITEM_NOT_FOUND | 404 | 条目不存在 |
| VAULT_MISSING_VAULT_ID | 400 | 缺少 vaultId 参数 |
| VAULT_SAVE_FAILED | 500 | 保存失败 |
| VAULT_CLEAR_FAILED | 500 | 清空失败 |

## 如何确认当前使用的是哪套 crypto

- **生产路径**：`VaultCryptoWeb`（Web Crypto API + PBKDF2 + AES-256-GCM）
- **开发/测试路径**：`VaultCryptoDev`（base64 编码，不安全）
- VaultProvider 中 `new VaultCryptoWeb()` 为默认
- 如需切换到 Dev，修改 VaultProvider 中的 import 即可

## 当前安全边界

### 已实现

- ✅ 主密码不保存
- ✅ 主密码 hash 不保存
- ✅ DEK 不持久化
- ✅ 每次加密使用新 nonce
- ✅ 每个保险箱独立 salt
- ✅ 错误主密码无法解锁
- ✅ VaultItemPlain 不直接持久化
- ✅ 页面组件不接触底层加密细节
- ✅ 自动锁定（超时清空 DEK）
- ✅ 剪贴板保护（可选自动清理）
- ✅ 密码生成器使用安全随机数
- ✅ 导出备份为密文数据
- ✅ 导入备份校验结构并二次确认
- ✅ 前端不直接访问数据库
- ✅ 服务端不接触明文密码
- ✅ API 只处理密文记录

### 仍有限制

1. PBKDF2 不如 Argon2id 抗 GPU 暴力破解（后续可升级）
2. 没有防侧信道攻击措施
3. 没有浏览器自动填充
4. 没有泄露检测

## 不支持的功能

- ❌ 浏览器自动填充
- ❌ 泄露检测
- ❌ 多人共享
- ❌ 明文导出
- ❌ 明文 CSV 导入

## 后续计划

1. **Argon2id KDF**：通过 WASM 引入，作为更强的 KDF 选项
2. **可选 Tauri 系统密钥链集成**：利用操作系统密钥链存储主密码
3. **浏览器自动填充**：WebExtension 集成
4. **泄露检测**：与 Have I Been Pwned 等服务对比

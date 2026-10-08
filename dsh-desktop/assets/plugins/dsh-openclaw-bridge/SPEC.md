# DSH 三通道 IM 桥接（飞书 / QQ / 微信）技术规格 — SPEC

> 状态：SPEC v0.7.0（已评审；P0/P1/P2 全部交付，三通道单测 137 项全绿）
> 日期：2026-08-16
> 基线：本仓库 v0.6.0（微信 iLink 官方通道 + OpenClaw/OpenAI 兼容端点，52 项单测已全绿）
> 目标版本：v0.7.0（统一 IM 桥，三通道）— **已发布**
> 编码约束：按 [DSH-Desktop-插件开发指南](../DSH-Desktop-插件开发指南.md) 铁律执行；
> 保持「纯 ESM、零构建、零第三方运行时依赖」形态（用户已确认，不走 TS 脚手架，
> 因本机无 DSH_CHECKOUT；规格层面各条铁律不变，逐条落到代码评审清单）。

---

## 0. 一句话目标

把 `dsh-openclaw-bridge` 升级为**统一 IM 桥插件**：微信（iLink，现状保留）、
飞书（官方长连接）、QQ（官方开放平台网关）三通道，以同一套「通道适配器 +
DSH 会话映射 + 白名单 + 配额」机制，把 IM 消息驱动成真实的 DSH agent 会话
（有工作区文件、能跑命令、跨轮记忆、工具完整），回复自动发回原 IM。

---

## 1. 现状盘点（v0.6.0 已有资产，全部保留/迁移）

| 资产 | 内容 | 处置 |
| --- | --- | --- |
| `lib/index.js`（769 行） | Cordis 插件：OpenAI 兼容端点、微信控制路由、会话映射、设置节注册 | 重构：共享层抽取为 `lib/core/`，路由表扩展 |
| `lib/wechat.js`（316 行） | 微信 iLink 客户端（纯出站 HTTP 长轮询：扫码登录/getupdates/sendmessage，24h 会话 TTL） | 保留原样，包成通道适配器 `wechat` |
| `lib/openai-compat.js` | 通用 OpenAI 兼容 LlmAdapter（provider `openclaw-custom`，第三方 baseURL/Key/模型） | 保留，不动 |
| `lib/client.js` | 设置页 ClawBot 卡片（settings.section 槽，零构建手写 CJS） | 重构为「IM 桥接」三卡 + 通用区 |
| `scripts/install.ps1` | 四处置放 + apiproxy 白名单补丁（幂等） | 扩展：旧配置迁移逻辑 |
| `scripts/test.ps1` + `test/bridge.test.mjs` | 52 项断言（协议 20 + 微信 iLink 21 + 自定义端点 11） | 扩展：共享层 + 飞书 + QQ 三组 mock 断言 |
| `docs/wechat-clawbot-dsh-report.md` | 微信 iLink 官方协议调研报告 | 模板：飞书/QQ 各产一份同款报告再编码 |
| 设置命名空间 `openclaw-bridge` | model/token/workspace/allowlist/customBaseURL/ApiKey/Model | **保留命名空间**（设置与 apiproxy 白名单无缝延续），schema 增字段 |

**决策 D-01（包名）**：本期**不更名**（保留 `@deepseek-ai/dsh-openclaw-bridge` 与
`openclaw-bridge` 命名空间），避免破坏性迁移；文档/UI 品牌改为「IM 桥接」。
`@dsh-external/` 前缀更名列为 P4 可选后续（届时拆迁移脚本）。

> **D-01 已被推翻（2026-09，「退役自制壳、改为纯插件包」阶段 2）**：`@deepseek-ai/*`
> 这个 scope 不归我们所有，把它用在自研包上会让用户误以为是官方出品，且与我们要发布的
> `@dsh-pack/*` 全家桶重名混淆。npm 包名现为 **`@deepseek-ai/dsh-openclaw-bridge`**。
> 两点**不变**，是有意的：loader id 仍是 `openclaw-bridge`（cordis 补丁按 id 整行寻址，
> 改 id 会让用户写在 `$DSH_HOME/cordis.patch.yml` 里的 `- id: openclaw-bridge` 覆盖失配），
> 设置命名空间仍是 `openclaw-bridge`（用户既有配置无缝延续）。

---

## 2. 决策记录（用户已确认 2026-08-16）

| # | 决策点 | 确认结果 |
| --- | --- | --- |
| D-02 | QQ 渠道 | **官方 QQ 开放平台机器人**（q.qq.com，AppID/Token，WebSocket 网关，沙箱→审核）；**不用** NapCat/go-cqhttp 等非官方协议（合规红线） |
| D-03 | 架构形态 | **统一多通道插件**：channel 适配器注册表（wechat/feishu/qq）+ 共享会话映射/白名单/设置 UI/鉴权；OpenAI 兼容端点向后兼容保留 |
| D-04 | 代码形态 | **保持纯 ESM 零构建重构**，完整遵守开发规范铁律（不引入 TS/tsdown；本机无 DSH_CHECKOUT） |
| D-05 | 群聊范围 | **私聊 + 群@ 一起做**：P2P 每用户一会话；群聊每群一会话、成员@机器人触发、回复进群、群里发言带发送者署名 |
| D-06 | 凭据与验证 | **交付实现 + mock 测试 + 文档**；不使用用户真实账号（mock 飞书长连接云、mock QQ 网关 + mock agent） |

待确认（默认假设，非提问项，可纠正）：

- A-01 出站消息风格：飞书/QQ 首版**纯文本**（长回复按段落 ≤1500 字符分段）；
  markdown / 卡片 / 图片收发列 M3（飞书 resource 下载、QQ media API）。
- A-02 会话池上限：`MAX_AGENTS` 从 16 提到 32（可配）；群聊会话共享同一池，
  超限时按 LRU 提示「会话已满」而非静默丢弃。
- A-03 群聊会话内的成员署名：默认**开启**（文本前缀 `[所属 用户名] `），设置可关。

---

## 3. 总体架构

```
 微信 App (官方 ClawBot/iLink)    飞书 (官方长连接 WS)          QQ (官方开放平台 WS 网关)
        │ 出站长轮询                      │ 出站 WebSocket            │ 出站 WebSocket
        ▼                                ▼                          ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ lib/channels/ 通道适配器注册表（统一 IM 桥，运行在 DSH webServer 内）          │
│   wechat.js (现状)   feishu.js (新)   qq.js (新)                            │
│      │ 归一化入站消息 {channel,eventId,ts,conv,member,text}                 │
│      ▼                                                                     │
│ lib/core/ 共享层                                                            │
│   · session-router  : conv(会话键) → 常驻 DSH agent（每群/每人一个真实会话）   │
│   · dedupe          : channel:eventId 去重（防重放/防重入）                  │
│   · quota           : 入站限流（20 条/用户/分钟）+ 出站配额队列（平台频控感知）  │
│   · whitelist       : 每通道白名单（空=放行所有人）                           │
│   · workspace       : ~/.dsh/openclaw-bridge/workspace/<key>（隔离）         │
│   · logs            : ~/.dsh/openclaw-bridge/logs/<channel>.log（落盘铁律）  │
│      │ agents.create + agent.followup + session 事件流                       │
│      ▼                                                                     │
│ DSH Agent 会话（真实工作区；桌面端同步可见，双侧可控）                         │
└───────────────────────────────────────────────────────────────────────────┘
 向后兼容保留：POST /openclaw-bridge/v1/chat/completions（OpenAI 兼容端点，独立 keyspace）
```

- **会话键**：`<channel>:<convId>`，其中 convId = `p2p:<userId>` 或 `group:<groupId>`；
  DSH sessionId = `dsh-im-<sha1(key).slice(0,12)>`（UUID 化，防越权猜测）。
- **双向同步**：会话是 DSH 里的**真实会话**，桌面端与 IM 端同时可见、同时可发；
  事件流经 `agent.session.events`（`ctx.on('session/event')` 全局监听）驱动 IM 出站。
- **串行模型**：DSH 单 agent 串行处理回合；回合中新到的消息经 `followup` 排队
  注入同一轮（last-writer-wins），两端口径与 v0.6.0 一致。

---

## 4. 通道适配器接口与共享层

### 4.1 适配器契约（`lib/channels/adapter.js`）

```js
// 每个通道一个文件，导出 createXxxChannel(options)，返回同一接口：
{
  id: 'wechat' | 'feishu' | 'qq',
  title: '微信' | '飞书' | 'QQ',
  enabled: false,                     // 设置开关（微信迁移后按旧配置默认 true）
  status(): Promise<{ state, detail, qr?, url?, since, error? }>,
  start(): Promise<void>,             // 幂等：凭据校验 → 恢复会话/建连 → 开始收消息
  stop(): Promise<void>,              // 幂等：断连/停轮询，不销毁映射会话
  onMessage(cb): disposer,            // 归一化入站消息（见 4.2）
  send(conv, text, opts): Promise<{ ok, err? }>,   // 出站（分段/配额在共享层）
  validate(): string[],               // 凭据完整性检查 → 设置卡错误提示
}
```

- 所有 `start/stop/onMessage` 的资源登记与注销**必须挂 `ctx.effect`**（铁律 1），
  热重载不残留；重连用 fiber 追踪的 `ctx.setInterval`/`ctx.setTimeout`。
- 通道状态存 `~/.dsh/openclaw-bridge/channels-state.json`（原子写，铁律 11），
  重启后 `start()` 幂等恢复（微信已有 session 文件恢复模式同款）。

### 4.2 归一化入站消息

```js
{
  channel: 'wechat'|'feishu'|'qq',
  eventId: string,            // 去重键素材（微信消息 id / 飞书 header.event_id / QQ message id）
  ts: number,
  conv: { kind: 'p2p'|'group', id: string, title?: string,
          member?: { id: string, name: string } },   // group 必带 member
  text: string,               // 纯文本（@机器人片段已剥离）
  raw?: object,               // 原始 payload（调试/审计用，不进会话）
}
```

群聊消息注入 agent 前按 A-03 加署名前缀：`[群友 用户名] 文本内容`。

### 4.3 共享层行为

| 能力 | 规则 |
| --- | --- |
| 会话映射 | `<channel>:<convId>` → 常驻 agent；工作区 `~/.dsh/openclaw-bridge/workspace/<key>`；池上限 32（可配），LRU 置换提示 |
| 去重 | `dedupe(channel:eventId)` 内存 LRU（上限 5 万条）；重启后首轮事件带「初始化标记」不再重复注入 |
| 入站限流 | 20 条/用户/分钟，超限静默丢弃 + 日志 + 出站提示「消息过快，请稍候」 |
| 出站配额 | 每通道独立计数器：被动回复（微信 iLink 10 条/24h 主动、飞书/QQ 2 分钟窗内回复）优先走被动；窗外主动消息受平台频控，超配额记日志并在 IM 里回「主动消息已达上限」 |
| 长文本 | 回执按段落分段，每段 ≤1500 字符；代码块/文件路径不截断（优先在段界切） |
| 白名单 | 每通道独立（见设置 schema）；白名单外消息静默忽略 + 日志 |
| 日志 | `~/.dsh/openclaw-bridge/logs/<channel>.log`（1MB 轮转），网络/状态/去重/配额全留痕 |

---

## 5. 通道：微信（现状保留 + 迁移）

- `lib/wechat.js` **原样保留**为通道适配器 `wechat`：扫码登录/24h 会话/长轮询/发送
  全链路不动；仅把「会话映射 + 白名单 + 状态路由」抽到共享层。
- 设置迁移：旧 `allowlist`（逗号分隔微信 id）→ `whitelistWechat`；旧配置存在时
  `enableWechat` 默认 **true**（不破坏现有用户）。
- 控制路由 `/openclaw-bridge/wechat/{status,login,verify,logout}` 保留为别名，
  内部转发到 `/openclaw-bridge/channels/wechat/*`（兼容旧 client 卡）。

---

## 6. 通道：飞书（Feishu，新）

### 6.1 形态与前置

- **企业自建应用 + 机器人能力 + 事件订阅「长连接」模式**：
  与微信 iLink 同为「纯出站」——手机/PC 都不需要公网 IP、端口映射、内网穿透。
- 凭据：`app_id` / `app_secret`（设置页 `role('secret')` 不回显）、`encrypt_key`
  （可选，建议开启）。需用户在飞书开放平台（open.feishu.cn）创建应用并勾选权限：
  `im:message`（收发消息）、`im:message.p2p_msg` / `im:message.group_at_msg`
  （接收单聊/群聊@事件）、`im:resource`（图片/文件资源，M3）、`im:chat`（群信息）。
- **实现前先产出 `docs/feishu-bot-dsh-report.md`**（对齐
  wechat-clawbot-dsh-report.md 模式：官方文档逐条核对 + 实测记录），再编码。

### 6.2 客户端设计（`lib/channels/feishu.js`，零依赖）

- token：`POST /open-apis/auth/v3/tenant_access_token/internal` →
  `tenant_access_token`，缓存并提前 10 分钟刷新；刷新失败指数退避。
- **长连接**：官方开放平台提供 WebSocket 事件通道（`@larksuiteoapi/node-sdk`
  的 `ws.start()` 同款能力）。本项目**不引入 SDK**：用自研 vendored 最小 WS 客户端
  `lib/ws.js`（`node:net` + `node:tls` + `node:crypto` 实现 HTTP/1.1 Upgrade、
  掩码帧、fragment、ping/pong、close），规避对 Node ≥22 全局 `WebSocket` 的依赖，
  任何 Node ≥18 可跑（微信链路同款「零第三方依赖」姿态）。
  - 握手端点/心跳/重连细节**以实现时官方最新文档 + SDK 源码为基准逐项核对**
    （见 §14 核对清单），断线指数退避 1s→2s→4s→…→60s cap，会话恢复自动续连。
- 事件：`im.message.receive_v1`（`header.event_id` 去重、`header.token` 校验；
  encrypt_key 开启时先 AES 解密再解析，实现时按官方加密规则核对）。
  - `chat_type=group` 且 `mentions` 含机器人 → 归一化 group 消息（剥 @片段、member=发送者）；
  - `chat_type=p2p` → p2p 消息；`message_type` 分类：M1 只处理 `text`（富文本 `post`
    取纯文本拼装），`image/file/audio` M3（`im/v1/messages/:id/resources/:file_key`
    下载到工作区 + `view_image` 路径引用，对齐 dsh-mini 附件模式）。
- 发送：优先 **reply**（`POST /open-apis/im/v1/messages/:message_id/reply`，
  携带原 message_id，被动语义）；2 分钟窗外或场景需要走
  `POST /open-apis/im/v1/messages?receive_id_type=open_id|chat_id`（主动，走配额）。
- 频控：出站走共享配额队列；主动消息的「24h 内用户是否与机器人互动过」规则
  以官方 FAQ 为准（实现时核对数值，见 §14）。

### 6.3 路由与状态

- `POST /openclaw-bridge/channels/feishu/verify`（仅回环）：用现填凭据拉一次
  tenant token 并回显应用名，作为「连接测试」。
- 状态卡：`{ state: 'disabled|unconfigured|connecting|connected|error', detail, since }`。

---

## 7. 通道：QQ（官方开放平台，新）

### 7.1 形态与前置

- **QQ 开放平台机器人（bot.q.qq.com）**：`AppID` + `Token`，WebSocket 网关长连接，
  沙箱模式（仅测试频道/成员生效）→ 开放平台「发布审核」后全量可用。
- **实现前先产出 `docs/qq-bot-dsh-report.md`**（同款调研报告模式）。
- 用户侧前置（文档写入 README）：注册开放平台账号 → 创建机器人 → 开通
  频道/群聊/C2C 能力（以官方当前开放策略为准）→ 沙箱配置测试成员 → 审核上线。

### 7.2 客户端设计（`lib/channels/qq.js`，复用 `lib/ws.js`）

- 网关：生产/沙箱 WebSocket 地址（实现时按官方 api-v2 文档核对，见 §14）；
  协议 ops：`2 identify`（`token: "Bot <AppID>.<Token>"`、intents 掩码按需
  声明频道消息/群消息/C2C）、`1 heartbeat`、`6 resume`；断线指数退避 + session
  resume；心跳超时判活重连。
- 事件：`AT_MESSAGE_CREATE`（频道@）、`GROUP_AT_MESSAGE_CREATE`（群@）、
  `DIRECT_MESSAGE_CREATE` / `C2C_MESSAGE_CREATE`（私聊，按开通能力）→ 归一化；
  `d.message_id` 去重；群/频道事件天然「@ 才触发」，剥离 @ 片段。
- 发送：被动（2 分钟窗内）优先——`POST /channels/{channel_id}/messages`、
  `POST /v2/groups/{group_openid}/messages`、`POST /v2/users/{openid}/messages`，
  均带 `msg_id`；窗外主动消息不带 `msg_id`，走共享配额（平台主动消息频控
  数值实现时核对，超配额回提示消息）。
- markdown / 图片 / 文件入 M3（`media` 上传 API + `msg_type` 扩展）。

### 7.3 沙箱与审核

- `qqSandbox: boolean`（默认开）：沙箱网关 + 沙箱测试成员列表；README 给出
  「从沙箱到审核上线」的操作步骤与合规提示（审核期不可对公众服务）。

---

## 8. 设置与客户端 UI

### 8.1 设置 schema（命名空间 `openclaw-bridge` 不变，字段增补）

```ts
const Config = z.object({
  // ── 通用（现状字段，向后兼容）──
  model: z.string().default(''),            // provider/model 或 model；留空=D默认模型
  token: z.string().default(''),            // 桥接 Bearer token
  workspace: z.string().default(''),        // 远程办公工作目录（绝对路径）
  customBaseURL / customApiKey / customModel,        // 第三方 OpenAI 兼容端点
  // ── 通道开关 ──
  enableWechat: z.boolean().default(false), // 迁移逻辑：检测到旧 allowlist/微信会话 → 默认 true
  enableFeishu: z.boolean().default(false),
  enableQq: z.boolean().default(false),
  // ── 每通道白名单（空=放行所有）──
  whitelistWechat: z.string().default(''),  // 迁移来源：旧 allowlist
  whitelistFeishu: z.string().default(''),
  whitelistQq: z.string().default(''),
  // ── 飞书 ──
  feishuAppId: z.string().default(''),
  feishuAppSecret: z.string().role('secret').default(''),
  feishuEncryptKey: z.string().role('secret').default(''),
  // ── QQ ──
  qqBotAppId: z.string().default(''),
  qqBotToken: z.string().role('secret').default(''),
  qqSandbox: z.boolean().default(true),
})
```

保存即热生效（沿用 `installSettingsSection` + `scope.watch` 模式）；
开关变化 → 对应适配器 `start()/stop()` 幂等执行。

### 8.2 client.js 重构（零构建手写 CJS，沿用现状形态）

设置卡「**IM 桥接**」（slot `settings.section`）结构：

- 通用区：接收模型 / 桥接 Token / 工作目录 / 第三方端点（现状字段原样搬移）；
- 每通道卡片（微信 / 飞书 / QQ）：启用开关、状态点（`/channels` 轮询）、
  凭据字段（secret 框）、白名单输入、操作按钮（微信扫码/配对码、飞书「连接测试」、
  QQ「测试连接」）、`validate()` 错误提示；
- 视觉：严格 `--dsw-*` 令牌（深色/浅色双过）、零硬编码色值、作用域隔离样式、
  原语 Button/Input/Pill（铁律 6.1）；卡片注册 `ctx.slots.register` 必须带
  `name: 'settings.section'`（铁律 2）。

### 8.3 路由表（v0.7.0 全集）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/openclaw-bridge/v1/chat/completions` | OpenAI 兼容端点（**保留，不动**） |
| GET | `/openclaw-bridge/health` | 健康检查（**保留**，响应加 channels 摘要） |
| GET | `/openclaw-bridge/channels` | 全通道状态（仅回环 + token） |
| POST | `/openclaw-bridge/channels/:id/login` | 通道登录（微信=二维码/状态、飞书=校验凭据、QQ=校验凭据） |
| POST | `/openclaw-bridge/channels/:id/verify` | 飞书/QQ 凭据连通性测试（仅回环） |
| POST | `/openclaw-bridge/channels/:id/logout` | 断开通道（微信=登出、飞书=断连、QQ=断连） |
| GET/POST | `/openclaw-bridge/wechat/{status,login,verify,logout}` | **旧别名，转发到 channels/wechat/\***（兼容旧卡） |

---

## 9. 消息归一化协议与事件模型

- 入站归一化见 §4.2；出站统一 `send(conv, text, opts)`，共享层负责
  分段/配额/被动优先/失败重试（幂等重试，按 msg_id 去重，防重复投递）。
- 会话事件驱动出站：复用官方 `ctx.on('session/event')` 全局监听（dsh-mini 同款
  已验证），`assistant/chunk` 流式累积 → 回合收敛（`turn/end`）后一次性发送
  最终文本（IM 平台多为「整条回复」语义；飞书可流式拆条暂不做，M3 再议）。
- 工具调用/思考过程**不推送到 IM**（噪音）；如需「过程可见」列 M3（飞书卡片
  进度、QQ markdown 进度行）。

---

## 10. 安全模型（在 v0.6.0 基础上增补）

- 保留：回环免 token；非回环强制 Bearer（`token` 设置 > `OPENCLAW_BRIDGE_TOKEN` >
  自动生成 `token.txt`）；`MAX_BODY` 4MB；`TURN_TIMEOUT` 10 分钟。
- 新增：入站事件去重（防重放）；每用户入站限流；凭据字段 `role('secret')`
  不回显、不写日志；工作区隔离不变（`~/.dsh/openclaw-bridge/workspace/`）；
  飞书/QQ 出站内容上限（≤4000 字符截断 + 提示）。
- 新增：通道事件原始 payload 不落日志（仅存 `raw` 于内存调试端点，回环限定）。

---

## 11. 兼容性与迁移

- `install.ps1` 幂等扩展：检测旧 `allowlist`/微信会话文件 → 写入迁移后的
  `enableWechat=true` + `whitelistWechat`；旧 `wechat-session.json` 保留沿用。
- 旧 client 卡（ClawBot 布局）→ 新「IM 桥接」卡：旧字段原样读回（settings.yaml
  未变），仅 UI 重组。
- OpenAI 端点 keyspace（model 名映射）与 IM keyspace（channel:conv）**互不干扰**，
  共用 `MAX_AGENTS` 池。
- DSH Desktop 更新清副本/白名单补丁 → 重跑 `install.ps1`（现状不变）。

---

## 12. 测试策略（mock 三云 + mock agent）

`scripts/test.ps1` + `test/bridge.test.mjs` 扩展，目标断言集（约 76 项）：

| 组 | 覆盖 | 目标 |
| --- | --- | --- |
| 共享层（新增） | 去重（同 eventId 不重入）、会话映射/隔离、白名单（三通道）、限流、数据迁移（旧 allowlist→whitelistWechat）、长文本分段、池上限 | ~15 |
| 微信链路 | 现有 21 项**全绿不回归**（回归门禁） | 21 |
| 飞书链路（新增） | mock 飞书「长连接云」：鉴权握手/token 刷新、`im.message.receive_v1`（p2p/群@/去 @片段/event_id 去重）、reply 与主动 create、加密事件解密、断线重连退避 | ~20 |
| QQ 链路（新增） | mock QQ WS 网关：identify/heartbeat/resume、AT/GROUP_AT/C2C 事件归一化、被动 msg_id 回复、主动消息配额、沙箱模式 | ~20 |
| 协议/自定义端点 | 现有 11 项（OpenAI 兼容 + 适配器）**全绿不回归** | 11 |

- mock 实现：现有 mock 腾讯 iLink 云 + mock agent 模式上，新增 `node:net`
  起本地 **WS 服务**（飞书/QQ 各一），自研 `lib/ws.js` 客户端直连，无需 nginx 穿透。
- 集成测试 `scripts/integration-test.ps1` 保持：真实 dsh web 实例 + 三通道
  mock 全链路 + OpenAI 端点回归。

---

## 13. 实施里程碑

| 阶段 | 产出 | 验收 |
| --- | --- | --- |
| P0 共享层重构 ✅ | `lib/core/`（router/dedupe/quota/whitelist/logs）+ `lib/ws.js` + 设置 schema 扩展 + client 三卡 + install.ps1 迁移 + 共享层单测 | 微信真实链路**零回归**（21 项绿）；设置页三卡可渲染；旧配置自动迁移 |
| P1 飞书通道 ✅ | `docs/feishu-bot-dsh-report.md` + `lib/channels/feishu.js` + 状态/验证路由 + 飞书单测 | mock 飞书链路 20 项绿；「连接测试」可校验凭据 |
| P2 QQ 通道 ✅ | `docs/qq-bot-dsh-report.md` + `lib/channels/qq.js` + 沙箱支持 + QQ 单测 | mock 网关链路 ~24 项绿；沙箱凭据可建连 |
| P3 打磨 | 图片/文件（飞书 resource、QQ media）、白名单 UI 细化、README/合规文档、channels 状态页 | 三通道全链路单测全绿；集成测试绿；文档齐全 |
| P4（可选） | `@dsh-external/` 更名迁移、主动推送策略、过程可视化 | 独立评审 |

> 进度（2026-06）：P0 ✅（88 项绿）、P1 ✅（114 项全绿，含飞书端到端：
> 插件级适配器 → 长连接 → 事件/分片/加密 → agent 回合 → reply API 回复）、
> P2 ✅（137 项全绿，含 QQ 端到端：插件级适配器 → gateway → identify(QQBot) →
> 群@事件 → agent 回合 → 被动回复带 msg_id；并修复 `lib/ws.js` 握手后同一 TCP 段
> 尾字节帧丢失的 bug——QQ 网关 HELLO 与 101 同段到达场景暴露）。
> 每阶段交付走注入器闭环验证：`dev_build_plugin`（零构建则 `node --check` +
> `dev_inject_plugin`）→ `dev_plugin_status` 确认 fiber active → smoke 验证。

---

## 14. 实现时官方核对清单（本机无法离线验证，逐条核对后写入调研报告）

| # | 待核对项 | 影响 |
| --- | --- | --- |
| 1 | 飞书长连接握手端点、心跳/保活格式、断线恢复机制（对照 `@larksuiteoapi/node-sdk` 源码） | feishu.js 连接层 |
| 2 | 飞书事件订阅 `header` 字段（event_id/token/type）、encrypt_key 解密算法与参数 | 事件校验与去重 |
| 3 | 飞书信息发送频控数值（应用维度/用户维度主动消息规则） | quota 配置 |
| 4 | 飞书资源下载与图片上传接口路径/鉴权（M3） | M3 附件 |
| 5 | QQ 网关地址（生产/沙箱）、intents 掩码定义、resume 会话语义 | qq.js 连接层 |
| 6 | QQ APIv2 事件名全集（AT/GROUP_AT/DIRECT/C2C）与 payload 字段 | 归一化 |
| 7 | QQ 主动消息频控数值（单聊/频道/群 24h 限额） | quota 配置 |
| 8 | QQ 群聊/私聊能力对个人开发者的当前开放策略与审核要求 | 文档前置 |
| 9 | 微信 iLink 现状（已实现，无需核对；仅随 DSH Desktop 更新复验） | 回归 |

> 已核对（2026-06）：**#1/#2 完成**——对照官方 `@larksuiteoapi/node-sdk` v1.73.0 源码
> 逐行核实（握手/心跳/重连/分片/ACK/加密），写入 `docs/feishu-bot-dsh-report.md`；
> **#5/#6 完成**——对照官方 Go SDK `tencent-connect/botgo` 源码核实（token 接口与
> `QQBot ` 前缀、生产/沙箱网关与 `/gateway/bot`、opcode 0-11、intents 掩码、四种事件
> payload 与 `/v2/groups|users/{openid}/messages` 发送路径、close 码 4004/4009/4013/4014/4914/4915），
> 写入 `docs/qq-bot-dsh-report.md`；
> **#9 补充核实**——微信智能对话开放平台 Clawbot 官方文档
> （`/api/v1/wechat/qrcode`、`qrcode/status`、`channel_reset`）所示 baseurl 与
> QR 状态机与 lib/wechat.js 直连 iLink 实现一致，结论见 `docs/wechat-clawbot-doc-note.md`。
> **#7/#8 未核对**（需登录开放平台查看）：主动消息频控数值、群聊/私聊个人开放策略
> —— 归入 O-02；实现侧**只做被动回复**（不发主动消息），天然规避频控额度问题。

> 若核对发现某项能力当前不开放/需额外资质（如 QQ 群聊仅限企业），按 D-02
> 的合规立场降级处理：该子能力标记「不可用」并在 README 明示，不引入非官方通道。

---

## 15. 合规说明（README 同步更新）

- 三通道均为**官方接口**：微信官方 ClawBot/iLink、飞书开放平台（企业自建应用）、
  QQ 开放平台机器人；仓库**不含任何逆向协议/hook 代码**（延续现状红线）。
- QQ 属开放平台审核制：沙箱阶段仅测试成员可见；发布需遵循平台审核与内容规范。
- 使用者自担账号与数据义务；对外托管需满足《个人信息保护法》等要求（现状表述保留）。
- 免责声明：与腾讯、飞书（字节）、DeepSeek 无隶属关系。

---

## 16. 验收标准（Definition of Done）

1. 三通道各自「收→agent 回合→回」全链路 mock 单测全绿（≥75 项断言）；
2. 微信真实 iLink 链路（如已配置）零回归；OpenAI 兼容端点零回归；
3. 设置页「IM 桥接」三卡：开关/凭据/白名单/状态/操作按钮全部可用，
   深色浅色双主题无硬编码色值；
4. 旧配置自动迁移（allowlist→whitelistWechat、enableWechat=true）幂等；
5. 白名单、去重、限流、配额四类安全行为各有断言覆盖；
6. 两份调研报告（feishu/qq）+ README（含 QQ 审核、三通道限额、合规）齐全；
7. `install.ps1` 幂等往返（装→卸→装）通过；`dev_inject_plugin` 装配
   host ✓ client ✓。

---

## 17. 待确认/开放项

- O-01 QQ 群聊/私聊对个人开发者的开放策略若收紧（见 §14 项 8）：降级为「仅频道
  机器人 + 沙箱」，功能裁剪需用户知悉确认。
- O-02 飞书/QQ 主动消息频率数值待官方文档核对后回填 §4.3 配额默认值。
  （现状：实现侧**只做被动回复**，不需要主动消息额度；若后续加主动推送再核对回填。）
- O-03 是否把「IM 桥接」做进侧栏入口（如 dsh-mini 的手机图标式快捷入口）——
  P3 末评审时再议（默认：仅设置页内完成，不新增侧栏）。

---

## 18. 实施记录（随阶段追加）

- **P0（2026-06）**：共享层 `lib/core/`（router/dedupe/quota/whitelist/logs/session）、
  vendored `lib/ws.js`、设置 schema 扩展、client 三卡、`install.ps1`/`test.ps1` 迁移；
  88 项单测全绿（微信零回归）。
- **P1（2026-06）**：`docs/feishu-bot-dsh-report.md` + `lib/channels/feishu.js` 长连接适配器
  （token 缓存按凭据键控、分片重组、加密信封、ACK、重连）；114 项全绿。
- **P2（2026-06）**：`docs/qq-bot-dsh-report.md` + `lib/channels/qq.js` 网关适配器
  （QQBot token、identify/RESUME/heartbeat、close 码处置、指数退避、READY 后再返回）；
  client QQ 卡、注册表/路由/迁移更新；137 项全绿。附带修复 `lib/ws.js` 握手同段
  尾字节帧丢失（QQ 网关 HELLO 与 101 同段到达场景暴露）。
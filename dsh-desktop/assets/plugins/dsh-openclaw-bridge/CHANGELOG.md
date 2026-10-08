# Changelog

本项目为 DSH（DeepSeek Harness）插件：微信 / 飞书 → DSH 会话统一 IM 桥
（QQ 自 v0.8.0 起由官方 @tencent-connect/dsh-qqbot 提供）。
版本号遵循语义化版本；每次发布附测试状态（单元断言数由 `scripts/test.ps1` 输出）。

## 0.8.1

### Patch Changes

- 修「桥接对内核 `Session` / `sessionPersistence` 的两处形状失配」。

  内核 0.1.7-rc.1 的两处变更把这个包的静默路径打穿了：

  1. **`session.meta` → `session.header`。** `Session` 上的 `meta` 已移除，
     建会话元数据（含 `cwd`）改由 `header` 承载。`/list` 里 `session.meta?.cwd`
     恒为 `undefined`，用户看到的是每一行工作目录都是 `?`。
  2. **`sessionPersistence.list()` 的条目是快照不是裸 header。**
     真实返回 `[{ header: {id, cwd, …}, revision, sizeBytes? }]`。
     本包三处都按裸 header 读（`.find((h) => h.id === …)` / `.some((h) => h.id === …)`），
     于是 `/attach` 永远说找不到会话、IM 续接**每次重启都新建一段上下文**，
     而白名单/鉴权全都正常 —— 最难查的那种「功能不报错，只是不生效」。

  改法：加 `headerOf(entry)`（`entry.header` 在就用它，否则退回条目本身），
  三处调用点统一走它；`/list` 与 `/attach` 的 `cwd` 改读 `session.header?.cwd`。
  `agents.create({ meta: { cwd } })` 这个**入参**名核对过内核
  （`CreateAgentOptions.meta`，dsh-agent/lib/types/index.d.ts）仍然成立，未改。

  配套：

  - `test/bridge.test.mjs` 的 mock 原先造的是「裸 header 数组」——**假绿**。
    改成按内核真实形状返回后，`/attach 成功接管持久化会话` 立刻转红，
    证明旧 mock 一直在掩盖这个 bug；修 lib 后才重新绿（66/66）。
  - 真机探针（隔离实例、真内核、一次性 `live-probe` 插件，只活在 %TEMP% 不落仓库）
    11/11 全绿，其中两条是**反证**：同一批真实条目上，旧写法 `entry.id === sid`
    必须找不到、而 `headerOf(entry).id === sid` 必须找得到；
    另加 `session.events === undefined`、`session.header.cwd` 承载 `meta.cwd`、
    `agents.resume` 真跑通（IM 续接的最后一跳）。
    `/list`、`/attach`、IM 续接走的是微信/飞书渠道，HTTP 端点触发不到，
    所以用探针把同一处接缝单独立起来跑。

- 修「设置开关永久禁用、控制台零报错」。

  上一轮把页内半边从幽灵的 `ctx.settingsScope` 换成 `ctx.remote.settings` 之后，
  真浏览器里设置行**渲染出来了但点不动**：`disabled: true`，且控制台一行错误都没有。

  根因：`inject` 里只声明了 `"remote"`，没声明 `"remote.settings"`。
  这种时候 `ctx.remote.settings` 拿到的不是 undefined（所以不抛错），而是一个
  **永不 settle 的代理** —— `describe()` 的 promise 既不 resolve 也不 reject，
  于是快照永远停在 `loading`，控件永久禁用。
  官方 5 个用它的包（dsh-client-ui-settings / -general / -models /
  permission-presets / agent-preset）全都同时声明两个名字。

  - 6 个包的 `inject` 补上 `"remote.settings"`。
  - `tools/audit/settings-api.js` 加第 ④ 条判据：调 `ctx.remote.settings.*` 却没声明
    `"remote.settings"` 即 error；配套两条反证用例（缺声明必红、补上必绿）。
  - AGENTS.md 契约 11 记下这条，因为它的不失败症状是「什么都不发生」，最难查。

  端到端实测（隔离实例、真浏览器、真点击）：
  开关可点 → `aria-checked` 翻转 → `data-dsh-quiet-output="1"` 立即生效 →
  **整页重载后仍为 true** → 临时 profile 的 `cordis.patch.yml` 里出现
  `- id: conversation-tweaks / config: quietOutput: true`（写路径经内核 config editor、
  按 profile 条目 id 落盘）。

- 设置子系统全部改到内核真实 API（详见 AGENTS.md 契约 11）。

  - 宿主半边：不存在的 `settings.register` / `settings.get` → 声明式 `Config` + `describe()` 读、`update()` 写。
  - 页内半边：不存在的 `ctx.settingsScope.bind` → `ctx.remote.settings`，inject 相应换成 `remote`。
  - ns 一律改成 **profile 条目 id**（多处原先写的是包名，find 永不命中 ⇒ 设置静默失效）。
  - dsh-better-sidebar：界面偏好从 PrefsSchema 并进导出的 Config（不并就永远不进设置页），
    schemastery 换成 @deepseek-ai/schemastery（`.volatile()` 是这个 fork 的扩展）。
  - dsh-offpeak：定时执行改走真实存在的 `ctx.sessionController.prompt`（旧代码等的 apiProxy 不存在）。
  - dsh-easyrewrite：删掉恒假的 typeof 守卫死代码。

## [0.8.0] — 2026-08（QQ 移交官方插件）

> 按用户要求以官方 https://github.com/tencent-connect/dsh-qqbot 替换本插件的自研 QQ 实现。
> 移除 ~600 行手写 QQ 开放平台协议（lib/channels/qq.js），QQ 改由官方独立插件接管。

### 变更
- **删除自研 QQ 通道** `lib/channels/qq.js`（token/WS 网关/事件归一化/发送），
  并移除 `index.js` 中整段 QQ onMessage 管道与 `qcBinds`/`qqGate`/`qqLogger`；
- **设置 schema 移除 QQ 凭据键**：`qqBotAppId` / `qqBotToken` / `qqSandbox`，
  以及不再被消费的 `enableQq` / `whitelistQq` 白名单键；旧 settings.yaml 里的残留
  值不再读取（可留在文件中不清理）；
- **注册表与路由占位**：`CHANNEL_TABLE.qq` 改为 `implemented:false` +
  `eta:"由官方 @tencent-connect/dsh-qqbot 提供"`；`/channels/qq/status` 返回
  `{implemented:false, state:"external"}` 与官方插件安装指引（不再 404 / 不再建连）；
- **客户端 QQ 卡**：`lib/client.js` 的 CHANNELS 表 QQ 项置 `implemented:false`，
  渲染为「由官方 @tencent-connect/dsh-qqbot 提供」说明卡（不再渲染凭据/沙箱/连接按钮）；
- **IM 会话映射前缀收敛**：`IM_KEY_RE` 由 `^(wx|feishu|qq)-` 收窄为 `^(wx|feishu)-`
  （QQ 不再经本插件产生 agent 会话）；
- 已知渠道但未由本插件实现时，`handleChannels` 返回 200 external 状态
  （未知渠道仍 404）。

### 部署（官方插件）
- 安装：`npx @deepseek-ai/dsh plugin add @tencent-connect/dsh-qqbot`
  （或作为官方 bundle 加入 `dsh.profile.bundles`，其自带 `dsh.bundle.patch` 属合法 bundle）；
- 凭据：环境变量 `QQBOT_APPID` / `QQBOT_SECRET`，或首次运行终端扫码绑定；
- 依赖闭环：官方包需 `@tencent-connect/{dsh-qqbot,qqbot-connector,qqbot-nodejs}`、
  `js-yaml`、`qrcode-terminal`，peerDeps `@deepseek-ai/{cordis,dsh-agent,dsh-llm,
  dsh-session,schemastery}`（后列可 junction 到 DSH 核心 node_modules）。

### 验证
- **138 项断言全过**：微信/飞书/共享层/协议断言全部保留；自研 QQ 协议与归一化
  断言已移除，新增 4 项「外部托管占位」断言（注册表 implemented=false + eta 指引、
  /channels/qq/status 返回 external 状态、注册表仍含三渠道行）。

## [0.7.2] — 2026-08（代码审查修复轮）

> 针对代码审查发现的问题逐项修复：会话续接、agent 生命周期、鉴权与隐私加固。
> 无协议变更，向后兼容。

### 修复
- **IM 会话重启可续（原有设计死代码落地）**：新增 `lib/core/session.js` 的
  `createSessionMap`（落盘 `~/.dsh/openclaw-bridge/session-map.json`），
  微信/飞书/QQ 的会话键在 `ensureAgent` 中取持久化 id；已持久化的会话优先
  `agents.resume` 恢复，失败再新建同 id 会话——插件重启后同一用户/群的消息
  自动接回原上下文（`/list` + `/attach` 手动接管的路径保留不变）。
- **`/new` 不再泄漏 agent**：`handleChannelCommand` 的 `/new` 现在会先调用
  handle 的 disposer 真正释放 live agent 再删除池记录；`/attach` 接管的会话
  只解除绑定、不误杀用户自己的会话。
- **LRU 淘汰跳过忙碌中的 agent**：`evictIdleAgent` 不再按 `lastUsed` 盲目淘汰
  正在跑回合的记录（`runTurn` 新增 `rec.busy` 计数），池满且全部忙碌时报 429。
- **agent 释放路径修正**：`agents.create/resume` 返回的 handle 是
  `{agent, dispose}`——旧代码直调 `agent.dispose` 是无效路径；现在保存并调用
  `handle.dispose`，插件 teardown 时显式释放全部池内 agent 并清空池/绑定
  （框架层随 fiber 的清理作为双保险）。
- **QQ token 响应兼容嵌套 `data`**：`lib/channels/qq.js` 新增并导出
  `pickTokenPayload`，兼容平铺 `{code, access_token}` 与嵌套
  `{code, data:{access_token}}` 两种网关响应。
- **二维码本地生成（去外网依赖）**：新增 `lib/core/qrcode.js`（vendor
  MIT 许可的 qrcode-generator）+ `/openclaw-bridge/qr?text=...` 路由返回
  SVG；设置页微信二维码不再直连第三方 `api.qrserver.com`（隐私/可用性）。
- **Token 比较改常数时间**：`authorized` 用 sha256 摘要 + `timingSafeEqual`，
  规避长度/内容时序侧信道。
- **设置页可清空 Token / API Key**：新增「清除」按钮显式写入空值
  （原语义"留空=保持现状"不变）。
- **严格鉴权开关 `authAlways`**：默认关闭（回环免 Token 保持兼容）；
  开启后回环地址也要求 Bearer Token。
- **微信客户端加固**：`BOT_AGENT` 版本号随 package.json 读取（不再硬编码
  0.7.0）；`startLogin` 加重入锁（快速连点只启动一轮 QR 流程）；会话文件
  以 `mode 0o600` 落盘并加注释说明明文 token 风险。
- **流式响应补 usage 帧**：SSE 结束前发送 `choices: []` + usage 的
  `chat.completion.chunk`，对齐 OpenAI 流式协议。

### 验证
- 复跑 `scripts/test.ps1`：137 项既有断言全过 + 新增断言（QR 路由/本地编码、
  QQ 嵌套 token 解析、authAlways 严格鉴权、session 映射持久化、
  微信 bot_agent 版本、登录重入锁）——断言总数相应增加。

## [0.7.0] — 2026-08（三通道统一 IM 桥，SPEC P0/P1/P2 交付）

> 核心里程碑：从「微信 iLink + OpenAI 兼容端点」升级为三通道统一 IM 桥，
> 共用「通道适配器 + 会话映射 + 白名单 + 去重/限流」机制。设计见 [SPEC.md](SPEC.md)。

### 新增
- **通道适配器注册表**：`lib/channels/{wechat,feishu,qq}.js` +
  共享层 `lib/core/`（router/dedupe/quota/whitelist/session/logs）；
  契约 `{id,title,implemented,status,start,stop,verify,send,dispose}`，
  client 设置页「IM 桥接」三卡（开关/凭据/白名单/状态/操作）。
- **飞书通道**（`docs/feishu-bot-dsh-report.md`）：企业自建应用 + 事件订阅
  长连接（WebSocket，凭据 → `callback/ws/endpoint` 握手 → control/data 帧），
  手写 protobuf 帧编解码、AES-256-CBC 事件解密（sha256(encryptKey)+IV 前缀）、
  sum/seq 分片重组、每事件 ACK、断线指数退避重连；发送走
  `im/v1/messages` / `:message_id/reply`（引用回复），token 失效自动刷新。
- **QQ 通道**（`docs/qq-bot-dsh-report.md`）：开放平台机器人（AppID/Token），
  `QQBot ` 前缀 access_token、`/gateway/bot` 取接入点、WS 网关
  identify/RESUME/heartbeat、intents `(1<<25)|(1<<30)`、close 码处置
  （4009 resume / 4004 重取 token / 4013/4014 intents 降级 / 4914/4915 停止）、
  指数退避；发送 `/v2/groups|users/{openid}/messages`（被动回复带 `msg_id`）；
  缺省沙箱（`qqSandbox=1`），`qqSandbox=0` 切生产。
- **vendored WS 客户端** `lib/ws.js`：node:net/tls/crypto 手写 RFC6455
  （客户端掩码、分片重组、ping→自动 pong、close 握手、handshake 超时）。
- **设置 schema 扩展**：`enable*` 三开关、`whitelist{Wechat,Feishu,Qq}`、
  飞书凭据（AppId/AppSecret/EncryptKey）、QQ 凭据（AppId/Token/Sandbox）、
  `groupSignature`、`maxAgents`；旧 `allowlist` 自动迁移 `whitelistWechat`。
- **路由**：`/openclaw-bridge/channels` 注册表 +
  `/channels/<id>/{status,login,verify,logout}`；旧微信路由保留为别名。
- **共享安全**：入站去重（LRU 5 万）+ 限流（20 条/用户/分钟）；回复整编
  （≤1500/段、≤4000 总量、超长截断）；群聊署名 `[群友 用户名]`（可关）；
  渠道日志 `~/.dsh/openclaw-bridge/logs/<channel>.log`（1MB 轮转）。

### 修复
- `lib/ws.js`：握手响应与首帧同一 TCP 段时尾字节被丢弃（QQ 网关 HELLO 场景
  暴露）——保留 `\r\n\r\n` 之后的字节再解析。
- 飞书 token 缓存按凭据键控（`appId+\x00+appSecret`），换 Secret 不命中旧缓存；
  `start()` 等到 READY 后再返回（QQ），登录路由状态准确。

### 验证
- 单元断言 **137 项全过**（协议 11 + 微信 21 + 自定义端点 11 + 共享层 15 +
  注册表/迁移 + ws 6 + 飞书 20 + QQ 24；mock 三朵云 + mock 网关长连接，全本地端口）。

## [0.7.1] — 2026-08（桥接正确性 + 设置页字段补全）

> 对照 `DSH-Desktop-插件开发指南.md` 做合规审查 + 宿主/客户端契约一致性校验，
> 关闭若干潜伏缺陷与设置页字段缺口。无新增通道，向后兼容。

### 修复
- **飞书/QQ `stop()` 异步未 await（潜伏崩溃）**：`logout` 路由把 `adapter.stop()`
  返回的 Promise 直接 `JSON.stringify` 进响应（`stop()` 此前返回 `undefined` →
  `Buffer.from(undefined)` 抛 `ERR_INVALID_ARG_TYPE`），且客户端拿不到断开后状态。
  改为 `await adapter.stop()`；并让飞书/QQ 的 `stop()` 返回 `status()`，
  `sendJson` 加 `body ?? null` 防御。
- **缺「连接测试」(validate)**：SPEC §8.2 承诺飞书/QQ「连接测试」但路由 + 客户端均无。
  宿主 `handleChannels` 新增 `validate` action（用当前设置命名空间凭据实测连通性，
  loopback-only）；客户端飞书/QQ 补 `validatePath` + 「连接测试」按钮（成功/失败提示）。
- **设置页字段缺口（host/client 字段覆盖不一致）**：
  - `groupSignature`（群聊署名）、`maxAgents`（会话池上限）—— 0.7.0 schema 已有但
    设置页无控件，补进「高级」区开关/输入。
  - `qqSandbox`（QQ 沙箱开关）—— schema + 渠道 `sandboxKey` 已定义却从未渲染，
    在 QQ 渠道卡补「沙箱环境」开关（默认开，可切生产 `qqSandbox=0`）。
- **客户端硬编码颜色兜底违反设计令牌规范**：边框 `rgba(128,128,128,.35)` →
  `--dsw-alias-border-l2`；错误色 `#c0392b` → `--dsw-alias-state-error-primary`；
  新增成功色 `--dsw-alias-state-success-primary`（均保留 rgba 兜底，符合指南「不硬编码」）。

### 验证
- 复跑 `scripts/test.ps1`：**137 项断言仍全过**（含复跑 `logout` 路由——
  此前测试只触发不断言响应体，本次修复路径被实际执行）。
- 宿主↔客户端契约一致性校验：三通道 `statusPath/loginPath/logoutPath` +
  飞书/QQ `validatePath` 全部命中真实注册路由；`CHANNEL_TABLE` 的
  `wechat/feishu/qq` 与客户端 `CHANNELS` 表 id 对齐；设置 schema 全部 21 个键
  均可经客户端 UI 读写。

## [0.6.0] — 2026-08（渠道化 + 微信适配器）
（历史条目保留，内容见 git 历史与旧版文档。）

## [0.2.0] — 2026-08（ClawBot 设置栏）

> 用户可见的核心里程碑：DSH 设置页出现「ClawBot」栏，可自行配置接收模型。

### 新增
- **DSH 设置页「ClawBot」配置栏**（客户端 `lib/client.js`，注册 `settings.section` 槽位）：
  - 接收模型（`provider/model`，留空用 DSH 默认模型）；
  - 桥接 Token（留空保持现状）；端点地址展示。
- **宿主设置节**（`lib/index.js` + `installSettingsSection`）：`openclaw-bridge`
  命名空间经 settings 服务持久化（settings.yaml）、保存即热生效。
- **设置命名空间白名单补丁**：`install.ps1` 幂等把 `openclaw-bridge` 加进
  `dsh-host-apiproxy` 的 `WEB_SETTINGS_NAMESPACES`（否则设置页读不到配置；
  上游注释标记为 deferred work）。

### 验证
- 协议层单元测试 22 项断言（路由/去重/会话隔离/鉴权/SSE）。
- 集成测试：真实 dsh web 实例验证 `settings.describe`/mutate 与热生效闭环。

## [0.1.0] — 2026-08（初始版本）

- OpenAI 兼容端点 `POST /openclaw-bridge/v1/chat/completions`（stream + 非 stream）；
- model 名 → 常驻 DSH 会话映射（跨轮记忆、独立工作区）；
- 历史去重（只注入新用户消息）；回环免 token、非回环 Bearer 鉴权；
- 一键安装（assets/plugins + profile 补丁）；MIT 许可证、合规声明。

## [0.3.0] — 2026-08（微信 iLink 直连，不经 OpenClaw）

- `lib/wechat.js`：腾讯官方 iLink 协议客户端（`ilinkai.weixin.qq.com`，
  HTTP 长轮询）——扫码登录、`getupdates` 收消息、`sendmessage` 回复、
  token 持久化、24h 过期自动待重扫；
- 设置栏「微信连接」面板：二维码/配对码/状态/断开（回环控制路由
  `/openclaw-bridge/wechat/{status,login,verify,logout}`）；
- 微信用户 → `wx-<uid>` 独立 DSH 会话；无需公网 IP/穿透（双方出站连腾讯云）。

## [0.4.0] — 2026-08（远程办公：工作目录 + 会话接管 + 白名单）

- `workspace` 配置：微信 agent 的真实工作目录（远程办公）；
- 微信指令 `/help` `/new` `/list` `/attach <sessionId>`（接管已有 DSH 会话，
  复用 dsh-host-apiproxy 同款 resume 路径）；
- `allowlist` 白名单：非名单微信用户静默忽略。

## [0.5.0] — 2026-08（第三方模型端点 + 审计修复）

### 新增
- `lib/openai-compat.js`：通用 OpenAI 兼容 LlmAdapter（provider `openclaw-custom`，
  按官方 `dsh-llm-deepseek` 逐段通用化）——工具调用、SSE 流式、错误映射、
  默认重试；设置栏新增 baseURL / API Key / 模型名，配置即热生效。
- 集成测试新增"真实 agent 循环经 openclaw-custom 调用 mock 第三方端点"验证。

### 修复（审计驱动）
- iLink `iLink-App-ClientVersion` 改为打包 uint32 的十进制字符串（0x020406 → 132102）；
- sendmessage 补 `run_id`（每次新生成）、空 `context_token` 省略、失败记录 errmsg；
- 设置日志脱敏（token / customApiKey 不回显）；health 限回环；
- S1 并发首建竞态（`rec.ready` Promise）、S2 空会话文件误判"已连接"、
  M1 长轮询代际标记防双循环、M3 失败重试不丢消息、M5 SSE \r\n 帧兼容；
- 版本号随 package.json 读取，不再硬编码。

### 验证
- 单元断言 52 项全过（协议 20 + 微信 iLink 21 + 自定义端点/适配器 11）。

# 设计与限制

**中文** | [English](design.en.md)


这份文档回答「它为什么这么设计、边界在哪」。日常使用请看 [README](../README.md)、[安装与升级](installation.md) 与 [JSON 导入](json-import.md)。

- [项目 MCP 的共享连接模型](#项目-mcp-的共享连接模型)
- [连接状态语义](#连接状态语义)
- [入口显示偏好](#入口显示偏好为什么不能两个都关)
- [更新提示](#更新提示这次变了什么为什么要本地写一份)
- [已知限制](#已知限制)
- [兼容性与依赖细节](#兼容性与依赖细节)
- [工作区复制与导出的边界](#工作区复制与导出的边界)
- [设计约束](#设计约束)
- [包结构](#包结构)

## 项目 MCP 的共享连接模型

同一项目的多个会话**共用一份**项目 MCP 连接：

- 每个 `(项目目录, serverName)` 在整个 `dsh web` 进程内只启动**一份** `mcp-client` 实例，因此 `serverName` 只登记一次，**并发会话不会撞名**（并发建连与释放/重建均做了串行化：建连 promise 先入表、释放保留占位直到连接完全销毁）。
- 该连接注册出的工具会投射进**每个属于该项目的会话**自己的工具层，所以每个会话都能看到并调用；其他项目的会话看不到（隔离保留，默认不可见、显式投射，不依赖“事后屏蔽”）。
- 引用计数管理生命周期：该项目第一个会话建立连接，最后一个会话结束后释放；会话销毁与插件卸载都会等到连接真正关闭。
- **引用所有权完全交给 cordis**：每一份引用由一个 `agentCtx.effect()` 唯一持有。因此两个边界情形都不需要本插件另建一套存活性判定：会话在建连期间被销毁时（`dsh-agent-loop` 的 `raceAbort` 会抛弃 setup 但不取消它），`effect()` 的 `assertActive()` 当场抛出，引用当场归还；会话正常结束时由 cordis 跑 disposer，并因为它是异步 disposer 而被 `Fiber._unload` 等待。插件 HMR 卸载是另一个纤度的事实（插件代次），由它自己的令牌判定，不与会话存活性共用同一张表。
- **为什么必须共享**：`serverName` 同时是进程内唯一的注册名和模型可见工具名 `mcp__<serverName>__*` 的前缀。「每会话各起一份」既会撞名，也不能靠“每会话换个名字”绕过——换名等于换工具名，会话恢复时的历史工具调用和 prompt 缓存都会失效。

### 与 MCP 规范的关系（按版本说清楚）

- 规范 **2026-07-28** 修订版新增了 Statelessness 一节：服务器 **MUST NOT** 依赖同一连接上的先前请求建立上下文，**SHOULD** 准备好处理来自多个任务/线程/会话的请求，客户端 **SHOULD NOT** 把单个任务/会话当作 stdio 进程的生命周期边界。按这一版，共享连接 + 并发多路复用正是被鼓励的形态，而“每会话一个子进程”反倒是被劝阻的。
- 但随 DSH 分发的 `@modelcontextprotocol/sdk` 目前协商的是 **2025-11-25**，那一版**没有** Statelessness 一节，取而代之的是 Lifecycle Management（含 session control）。也就是说：**按 2025-11-25 实现的服务器完全可以合理地维护连接级会话状态**，这不算它的缺陷。
- 传输层的并发安全是有保障的：一个 `Client` 实例的请求 id 单调唯一（SDK 的 `_requestMessageId++`）、响应按 id 路由，stdio 一次 `write` 写整帧，所以多个会话在同一连接上交织调用不会串线。DSH 是单进程多会话，因此不需要生态里那些代理方案的 shim/broker/socket 和请求 id 重映射。

### 不适合共享的服务器（重要：本插件只提供 shared 一档）

把会话身份隐式绑在连接/进程上的服务器（浏览器自动化、SSH 会话、编辑器缓冲区、按连接建索引等）在多会话共享时会串状态。

生态里的代理方案通常提供 `shared / isolated / session-aware` 三档开关（如 [mcp-mux](https://github.com/thebtf/mcp-mux)、[jasonwarta/mcp-mux](https://github.com/jasonwarta/mcp-mux)、[punt-labs/mcp-proxy](https://github.com/punt-labs/mcp-proxy)）。**本插件目前只提供 `shared` 这一档**（每个 `(项目, serverName)` 一份共享连接）。

关于 `isolated`：在 DSH `0.1.0-rc.7`/`rc.8` 上它确实做不到——那时 `serverName` 全进程唯一，per-session 隔离必须 per-session 换名，而换名会连带换掉模型可见的工具名。但 **DSH 0.1.5 起底层已经支持**：`mcp-client` 按注册作用域判重，同一个 `serverName` 可以在不同会话作用域里各挂一份而互不冲突（本插件的项目级共享作用域吃的就是这个能力）。所以要补 `isolated` 档，缺的只是插件的档位开关与 UI，不再是宿主限制。在那之前，请把这类服务器当作**不支持**，改用下面的做法：

- 这类服务器**在项目作用域下不被支持**。把它挪到全局作用域也没用（那只是从“本项目所有会话共享”变成“所有项目所有会话共享”，隔离更差）；在项目里另起一个 `serverName` 同样无效（`serverName` 区分的是服务器，不是会话）。
- 可行的做法：让该服务器改用 `streamable-http` 并自己按请求参数分区状态，或者用一个外部代理（上面那几个项目）在 DSH 之外做隔离。
- 规范给出的正解是 `session-aware`：状态跨请求时用请求里显式传的标识符引用（2026-07-28 的 “State that needs to span multiple requests MUST be referenced by an explicit identifier the client passes on each request”，实践上就是 `_meta` 里带会话 id，mcp-mux 的 `_meta.muxSessionId` 就是这么做的）。当前 `dsh-mcp-client` 不注入任何 per-request `_meta`，所以共享连接对服务端是**匿名**的；等上游支持按调用注入会话标识后，这一档才能补上。

生态里的同类问题与同方向实践：Claude Code 每会话各起进程导致的内存压力（[claude-code#28860](https://github.com/anthropics/claude-code/issues/28860)，Anthropic 侧的 shared-daemon 提案，已关为 duplicate）、Serena 在多客户端打开同一项目时的重复实例与并发写问题（[serena#1235](https://github.com/oraios/serena/issues/1235)，Serena 自己给多 agent 场景的建议是改用 HTTP/SSE）。DSH 是单进程多会话，能直接在进程内共享，不需要 daemon 或代理。

## 连接状态语义

`@deepseek-ai/dsh-mcp-client` 不对外暴露连接成功/失败事件。面板因此用两条官方事实拼出状态：**已注册的工具数** 与 **cordis fiber 的状态代号**。日志只用来填失败原因的文案，不参与判定。

- **已连接（connected）**：只有该 server 的工具已注册（`mcp__<server>__*` 数量 > 0）才判定为已连接。插件 fiber 处于 ACTIVE 只说明 mcp-client 在跑，不能证明握手成功——`failOnStartupError: false`（默认）时连接失败也会让 fiber 保持 ACTIVE。
- **连接失败（failed）**：fiber 已 ACTIVE（mcp-client 的 `apply` 要等首次连接与 `tools/list` 结束才让 fiber ACTIVE）却没有任何工具，或者 fiber 本身处于失败态。具体原因取自 mcp-client 最近的日志（通过 `ctx.logger.exporter` 订阅并按 `mcp-client(<serverName>)` 过滤），例如 `connection attempt failed: ECONNREFUSED`、`giving up after 10 consecutive failed reconnect attempts`；拿不到日志时就如实写“未注册任何工具”。
- **连接中（loading）**：fiber 尚未 ACTIVE（还在跑 apply）。不猜测成功也不猜测失败。
- **已停止（stopped）**：没有 fiber。全局意为条目未加载；项目语境里意为「这条共享连接还没建立」（新会话挂载时才建），面板显示为「尚未建立连接（新会话自动挂载）」。

全局与项目行走的是**同一个判定函数**（`mcp-observability.deriveMcpPhase`）与同一个取值域，只有文案不同。**项目行刻意把两件独立的事分开说**，不合成一个状态：

- **连接在不在** —— 由上面那套判定给出：`已连接` / `连接中…` / `连接失败` / `尚未建立连接（新会话自动挂载）`。连接按空闲策略保留（见「生效时机语义表」），所以"当前没有会话在用"不会显示成"没连上"。
- **几个会话在用** —— `refs`：`已连接 · N 个会话在用 · M 工具` / `已连接 · 当前无会话使用（连接保留，下次直接用）`。

早先的文案把两者压成一句「待会话挂载」，用户读成"还没连上/排队中"，而事实常常是"连接在、只是当前没会话用"——这正是它被改掉的原因（文案推导现在是模块作用域的纯函数 `wsSub`，由 `test/client-behavior.test.mjs` 直接断言）。**三类**失败分开告知，不混为一谈：

- **挂载失败**（`mountFailed`）：本插件在**会话挂载阶段**（`agent/created` 串行监听器）就挂不上（配置里的 `${VAR}` 求值为空、`failOnStartupError: true` 下启动失败、`serverName` 被占用、工具注册被拒等）。记账口径只有一条：**官方 fiber 拒绝时的原始错误原样带上**（`recordWorkspaceMountError` 是唯一成形这段文本的地方），面板横幅给出首条原因、行与详情给出各条全文——我们自己的措辞只用于「确实拿不到原因」的兜底。
- **连接失败**（`status === 'failed'`）：mcp-client 那边的事。两者由 Host 分开标记，客户端不再用「lastError 存在」反推挂载失败。
- **`serverName` 被占用**在挂载失败里只有一种来源，且**已被结构挡掉**：官方判重的键是 `scopeOf(ctx) ?? ctx.root`（`mcp-client` 的 serverName effect），而作用域标签是**模块内的 Symbol**——依赖树里 `@deepseek-ai/dsh-scope` 一旦有两份实例，标签就互不相认，owner 退化成整个 app 的 root，`serverName` 于是成了全进程唯一，两个项目的同名条目就会互相占用（第一个项目照常、第二个项目整批起不来）。本插件因此在隔离作用域之外，把这条**回退键**也做成每条连接独有的（`createSharedConnection`：`scoped.ctx.extend({ root: scoped.ctx })`）：标签认得出来时 `??` 短路、它根本不被读到（行为与修复前逐字一致），认不出来时官方拿到的仍是一个只属于本连接的 owner。真机实测（把 dsh-scope 换成第二份实例模拟该安装）：修复前第二个项目整批「未能挂载到会话」，修复后两条连接都 ACTIVE。剩下真正会走到这条错误文本的情形，是宿主根本不按注册作用域判重（更早的 mcp-client 把注册表挂在全进程）——那时文本会补齐「和谁同名」（全局条目 / 其他项目路径）与这条根因，同一形状在 `test/real-host-integration.test.mjs`（真宿主）与 `test/workspace-runtime.test.mjs`（替身注入拒绝）各有用例钉住。
- **作用域故障**（`scopeFailed`）：连接是好的，但工具不在共享作用域层——工具落到了全局层，说明 `@deepseek-ai/dsh-scope` 在宿主与插件之间解析成了两份模块实例（作用域标签是模块内的 Symbol）。这是最隐蔽的故障形态：`tools.schemas(scopeKey)` 认不出标签时会**退回全局层**，面板因此显示「已连接 N 工具」，而工具其实对所有会话、所有项目都可见。所以判定直接对比全局视图（同名前缀的工具出现在全局视图 ⇒ 它们不属于本作用域），并把原因写在 `scopeFailed` 行与 `mcpManager/projectConnections` 的 `scopeError` 上。判定刻意保守：只有「没有同名全局条目、也没有其他项目用同名」时才断言，否则无法与「别人的同名实例的工具」区分；同一连接只判定一次（结论缓存在连接上，不在轮询里重复开销）。

项目 MCP 的工具注册在它自己的共享作用域层里，全局工具视图看不到，所以面板按该作用域枚举（不是走全局 `tools.schemas()`）。

## 生效时机语义表

项目配置的每一种改动各自在什么时候生效，只有一条规则：**写盘即对齐**（`reconcileWorkspaceConnections` 是「配置 → 连接集 → 会话投射」的唯一同步点）。

| 改动 | 生效时机 | 机制 |
|---|---|---|
| 新增 server | **立刻**（含正在运行的会话） | 写盘后 reconcile → 为存活会话 acquire 连接并投射工具 |
| 删除 server | **立刻**（含正在运行的会话） | 连接立刻 retire，指向它的会话投射整批撤掉（不留僵尸工具） |
| 改已有 server 的配置 | **立刻**，就地重载 | 指纹变了就销毁旧连接、按新配置重建，并把所有会话的槽位改指新连接 |
| 屏蔽 / 取消屏蔽（`exclude`） | 立刻 | 重算 `restrict` 写入会话作用域 |
| 手工编辑 `.dsh/mcp.json` | 下一次会话挂载时 | 挂载路径自己会做同一套对齐（没有文件监听器，所以不是"立刻"） |

「改配置就地重载」不是自创的取舍，而是宿主对配置条目的既有语义（`dsh-mcp-client` README：*"Editing the configuration entry reloads the server connection in place, and unchanged names stay unchanged"*），而且它安全：**工具名是 `(serverName, rawName)` 的纯函数**，重载后名字不变，所以会话历史与权限规则不受影响。旧实现选择"复用旧连接 + 面板标 `配置待生效` + 等所有会话结束"，代价是用户改了配置却看不到变化——那条路已删除。

**连接的生命周期跟配置走，不跟会话走**：最后一个会话结束只归还引用并起一个空闲计时器（`idleTimeoutMs`，默认 5 分钟，`0` = 永不回收），连接与 stdio 子进程都留着，下次会话直接复用。这既符合 MCP 规范对 session 的关闭时机（"不再需要（例如用户要离开客户端应用）"），也避免反复起停进程（社区里"重连一次泄漏一个进程"的那类问题）。真正销毁只在：配置删除/改动、面板「重连」、插件卸载、或空闲超时。

### 项目级专有字段（`.dsh/mcp.json` 里每个 server 可写）

这两个键是**本插件的策略**，不属于 mcp-client 的配置 schema（`toMcpClientConfig` 不把它们下发；下发了会被未知字段拒绝）。它们是数字，单位毫秒，`0` 都是有意义的值而不是"未设置"：

| 字段 | 默认 | 语义 | 边界 |
|---|---|---|---|
| `idleTimeoutMs` | `300000`（5 分钟） | 最后一个会话结束后，连接还保留多久；到点才真的销毁 | `0` = 永不自动回收（常驻）。上限 `2147483647`（与宿主其他计时器同口径） |
| `readyTimeoutMs` | `5000` | 挂载时等待这条连接就绪的**共享总预算**；预算内就绪则工具赶在首轮之前进声明 | `0` = 不等就绪（回到纯异步，工具由 `tools/change` 补）。同一次挂载只取各 server 上限的最大值，不逐个相加 |

两者都会被面板的编辑表单原样带回（表单是重建 spec，不渲染的字段必须显式保留），也都在 `normalizeEntry` 里做同一套校验（非负安全整数、不超上限）。`idleTimeoutMs` 尤其**不得**进入 `MANAGED_CONFIG_FIELDS`——那个集合决定哪些字段会被写进全局 profile 补丁，而它是项目级策略。

### 只读诊断接口（排障用）

面板每行只回答得了「这个项目的这个 server 怎么了」。进程级的问题（一共有几条共享连接、有没有引用卡住不归零）由一个只读 RPC 回答：

```
mcpManager/projectConnections → { connections: [{ wsPath, serverName, state, refs, sessions, toolCount, fiberState, configStale, configError, duplicateOwners, scopeError }] }
```

- `state`：`ready`（已就绪）/ `connecting`（建连中，还没有连接态可读）/ `disposing`（释放中，占位未清）。卡在后两种状态不走才是最需要排障的形态，所以它们也如实出现在列表里。
- `refs` 与 `sessions` 是**两个独立事实**：前者是引用计数，后者是真实持有它的存活会话数。健康时二者相等；`refs > sessions` 就是漏了引用（会话已销毁但引用没归还），后果是连接永不释放、配置永远刷不新。接口不把两者合成一个“健康”布尔，判读留给使用者。
- `configStale` 为 `null` 表示无从判定（还没建连，或配置里已经没有这个 server），不伪造 `false`；读配置失败时原因在 `configError`。
- `scopeError` 非空表示作用域视图不可用（工具落到了全局层，见上文的作用域故障）：这是「工具对所有会话可见、而面板看着一切正常」的唯一可见证据。
- 全程只读：不改引用计数、不碰 fiber、不触发建连或释放。面板目前不接线，它是给排障留的接口。

## 入口显示偏好（为什么不能两个都关）

面板只有两个入口：右下角悬浮按钮（`shell.overlay`）与左侧栏底部「MCP」（`sidebar.footer.action`，0.1.5 起声明）。两个都能单独关掉，但**不能同时关**——真关了两者，面板就再也打不开（只能手改 localStorage 才能回来）。

这条不靠 UI 的禁用逻辑保证，而靠**数据模型**：偏好存的是一个三值枚举（`both` / `fab` / `sidebar`），不是一个入口一个 boolean。「两个都关」这个组合在类型里不存在，所以不需要守卫、灰置的按钮或「至少留一个」的提示文案；`test/client-entry.test.mjs` 直接对那张可见性表断言「每一项至少一个入口可见」，将来新增入口时先在那里红，而不是等用户把自己锁在门外。

两个实现要点值得写下来，因为都是踩过的坑：

- **面板的挂载点与悬浮按钮是同一个 slot 注册**（`shell.overlay`），所以「关掉悬浮按钮」只能是不渲染那个按钮，注册必须留着——侧栏入口只改 `panelVisibility`，真正渲染面板的是这个组件。把整个组件也用偏好门住 = 侧栏入口点了没反应，用户直接锁死。渲染决策抽成纯函数 `overlaySeats()`，就为了把这条能脱离 React 测出来（组件在 node 里渲染不起来，测试替身的 hooks 是空实现）。
- **侧栏入口隐藏用「渲染 null」，不注销注册**：宿主 list 型 slot 把每个条目的组件直接渲染进侧栏的 `.footerActions`（`display:flex`、无 gap/padding），外层 outlet 锚点又是 `display:contents`，所以空子树不占布局、也不留空行（对着 0.1.5-rc.2 的 `dsh-client-ui-renderer` 确认过）。注销注册要多管一份生命周期，换不来任何可观测差别。

偏好存 localStorage（`dsh-mcp-manager-ui/entry`），与悬浮按钮位置（`dsh-mcp-manager-ui/fab-pos`）同一条路。不进 profile 配置：本插件没有 Config 面，客户端半也拿不到插件配置，为一个显示偏好加一条 host→client 投递不划算，而且改配置还要等宿主热加载。localStorage 是外部输入（旧版本写的、手改的、原型链上的键），一律归一化回默认；存储被禁用时本次会话内仍然生效，只是不跨会话记忆。

## 更新提示：「这次变了什么」为什么要本地写一份

升级后第一次打开面板时会弹一张卡片，列出这次的变化并指路（例如「入口」开关在面板右上角）。它存在的理由很直接：新能力如果只写在 README 和 release note 里，用户不会去找——上一个版本的「入口」开关就是这么被忽略掉的。

**触发点是「打开面板」而不是「页面加载」**：提示的本来就是面板里多出来的东西，用户在面板里才用得上；挂在面板里也意味着它随面板挂载，加载时不会用一个弹框把应用挡住（曾经是页面加载触发，实测那样会挡启动，而收益并不更大）。

四个取舍，改它之前先读：

1. **内容真源是 `lib/whats-new.js`，不是 GitHub Releases**。抓远端会让网络、限流、离线决定这条提示出不出得来；而现有的 `updateHint`（「有新版本可用」提示条）已经确立了「纯增值信息、失败静默」的设计，不该再把一条用户点名要的提示压在同一链路上。本地常量还顺带保证同一版本在任何机器上提示的内容完全一致。
2. **`package.json` 的版本必须是这里的最后一条**（`test/whats-new.test.mjs` 钉住）。这是对根因的治理：bump 了版本却没写「变了什么、在哪找」，本地就红，发不出去。
3. **「上次确认过的版本」存客户端**（localStorage，与 `updateHint.dismissed` 同一个惯用法）。它是每台浏览器自己的事实，宿主没有这个视角；所以宿主只给真源与当前版本，判定放客户端的纯函数 `whatsNewFor`。
4. **分不清「新装」和「从还没有这个提示的版本升上来」时，偏向说一次**。两者在 localStorage 里都没记录，而后者正是要覆盖的人；所以没记录时只报当前这一条（不满屏倒历史，也不漏掉这次的变化），代价只是新装用户看到一条本次更新。反过来，认得出上次那版就报它之后的全部，跨版本升级不漏。

落盘时机是**确认关闭**而不是显示：显示即落盘会把用户没看到的提示直接吞掉，确认才代表看过。而「知道了」、点遮罩、Esc 都算确认，而且提示挡住面板时**唯一能出来的路都会确认它**（想不确认只能直接关掉标签页），所以实际观感就是「每个版本弹一次」。

它是**阻塞式**弹框（遮罩盖住面板），这是有意的：要「不会被忽略」就得有分量，代价是升级后首次打开面板会挡一下。另外，因为它不是用户主动打开的，键盘可达性由它自己负责——打开时聚焦「知道了」、Esc 关闭、并用一个 `focusin` 守卫把焦点拦在弹框内。这里不能用「延迟一点再 focus」：宿主应用会把焦点抢到自己的输入框（实测在弹框出现后约 300ms），延迟等于在赌对方的时序；同一个原因，关闭时只能**尽力**把焦点还给应用原本想聚焦的那个节点（节点已被应用重建就算了，不猜选择器）。

## 已知限制

- **首轮就绪**：挂载时会在**共享就绪预算**内等待连接就绪（`readyTimeoutMs`，默认 5s，`0` = 不等），所以首轮请求里就有工具——这是宿主自己的契约（`dsh-mcp-client` README：*"The server's tools appear before the harness starts its first turn"*）。超时**不算失败、也不阻断会话**：预算用尽就先开起来，就绪后由 `tools/change` 补投射；连接状态由 fiber 状态与工具数如实呈现。预算是"这次会话创建"的总预算（取各 server 上限的最大值），不是每个 server 各发一份——否则 5 个连不上的服务器会给每次会话创建加上 5 倍等待。若某个服务器配置了 `failOnStartupError: true`，则按官方语义等它出结论（这条是用户显式选择的等待，不受预算约束）。
- **屏蔽不释放全局实例**：「屏蔽」全局 MCP 只隐藏它的工具，该 serverName 的全局实例仍在运行（占用它自己那个作用域）。DSH 0.1.5 起项目可以直接用同名服务器独立连接，不需要先把全局那份禁用；更早的宿主按全进程唯一判定，那时同名会启动失败。
- **同名按注册作用域隔离（0.1.5 起）**：`mcp-client` 按**注册作用域**判定 `serverName` 唯一性（`scopeOf(ctx) ?? ctx.root`），而本插件给每个 `(项目, serverName)` 一个独立作用域，所以项目之间、全局与项目之间同名都是合法配置，各自独立连接、各自注册工具（实测：同一作用域内同名仍被拒绝）。**这条不变量由结构保证，且不依赖依赖树是否干净**：作用域标签认不出来时（`@deepseek-ai/dsh-scope` 有两份实例），判重回退键是 `ctx.root`，本插件把它也做成每条连接独有的（见上文「`serverName` 被占用」）。同一根因的另一面是工具泄漏到全局层——那条仍会如实报出来（`作用域隔离失败`）。
- **共享连接按配置就地重载**：见上文「生效时机语义表」——改配置立刻重载连接并改指会话槽位；连接不再随会话结束而销毁（空闲保留）。
- **连接进入终态后要有人拉一把**：mcp-client 的重连有次数上限，耗尽后它注销工具并停止，只能靠重载配置或重启宿主恢复（它的 README 明写）。项目 MCP 不是常驻服务（VS 重启、脚本结束都会让它消失），所以这个终态几乎必然出现：挂载路径会在下次有人用时把已死的连接拆掉重建，面板的「重连」按钮提供立即出口。
- **不支持 per-session 隔离**：见上文「不适合共享的服务器」。
- **会话结束后不再需要"等旧连接销毁"**：连接不随会话结束而销毁（空闲保留），所以"关掉最后一个会话后立刻重开"不会撞上释放窗口——直接复用同一条连接。只有真正重建（改配置、点重连、空闲回收后重建）时才需要等旧连接 teardown，这段等待取决于 MCP 服务端退出的快慢。**上界约 9 秒**：MCP SDK 的 stdio 关闭本身最多等 2s（stdin 关掉）+ 2s（SIGTERM）再 SIGKILL，mcp-client 对关闭确认又有 5 秒上限。同一会话的多个 server 是并行释放的，不累加。实测正常服务器远低于这个上界（Windows、SDK 1.30.0）：`transport.close()` 对 `@modelcontextprotocol/server-memory` 35ms、`mcp-deepwiki` 43ms、`fast-context-mcp` 34ms、`serena` 167ms；整个 `dsh web` 进程的优雅退出（同时拆 4 个 stdio + 2 个 HTTP 连接）约 0.5s。慢的前提是服务器不理 stdin EOF，见下一条。
- **Windows：忽略 stdin EOF 的 stdio 服务器会漏孙进程**。stdio 服务器在 Windows 上通常是一条进程链（`npx` 解析成 `npx.cmd`，于是 `dsh → cmd.exe → node`），而 MCP SDK 的 `StdioClientTransport.close()` 只对**直接子进程**发 SIGTERM/SIGKILL（`sdk/dist/esm/client/stdio.js` 的 `close()`），没有 job object，孙进程不在射程内。实测常见服务器（memory、deepwiki、fast-context、serena、chrome-devtools）都在 stdin EOF 时自行退出，因此 DSH 正常退出与被强杀都**不残留进程**；但这份干净来自服务器行为，不是 transport 的保证——故意忽略 stdin EOF 的服务器会让 `close()` 吃满 4 秒（2s + 2s）并留下一个孤儿孙进程。遇到这类服务器请让它自己处理退出，或改用 `streamable-http`。
- **DSH 的退出宽限是 5 秒**：官方启动器在 SIGINT/SIGTERM 后只给整棵插件树 5 秒（`dsh/lib/profile-boot-*.js` 的 `PROCESS_SHUTDOWN_TIMEOUT_MS`），超时就 `process.exit()`。正常情形绰绰有余（实测 ~0.5s），但若同时有多个“退得慢”的服务器，退出可能在 teardown 完成前被强行截止。
- **来源导入只取用户级 `mcpServers`**：`~/.claude.json` 里的 `projects[*].mcpServers` 不展开（那会把每个历史项目都铺出来）；项目级配置请从项目标签导入 `.mcp.json`。单文件超过 8 MB 的来源会被跳过。
- **插件热重载会清空运行中会话的项目工具**：HMR/卸载时会撤回所有投射并释放连接（否则会留下指向已销毁连接的僵尸工具）。已在运行的会话要重新拿到项目 MCP 工具需新开会话。
- **英文变体有三处如实边界**：界面文案、MCP 市场文案、文档都有英文版，但——① 技能市场的**分类名**来自上游 `api.skillhub.cn`，它只给中文，英文界面下分类行显示中文；② 安全扫描结论（`statusText`，如「安全，无风险」）上游也只有中文，没有对应英文字段；③ 「这次变了什么」弹窗的内容在 `lib/whats-new.js`，目前只有中文。三处都选择**显示中文而不是留空**——空文案比中文更难用。

## 兼容性与依赖细节

DSH 宿主 API 通过 `peerDependencies` 与 `engines.dsh` 以 `>=0.2.1-rc.5 <0.3.0` 声明；当前发布准入从 0.2.1-rc.5 开始，0.2.2 的新版 executor/step toolSet 作为匹配宿主目标单独验证。

**为什么只支持 0.2.x**：ToolSearch 的三条地基都是 0.2 的形态——

1. **per-agent 呈现模式**（`ctx.tools.modeFor(agent)`）：同一个进程里可以有 native 与 ptc 两种会话。装配点只能读到**部署默认层**，所以判据必须下移到 per-agent——更早宿主没有这个接口。
2. **PTC 手册段 `tools:sdk`**：PTC 下模型看的不是函数清单而是这份生成物，插件能改它（它在 `assembly.sections` 里）才有 PTC 下省字的可能。
3. **会话投影 `ctx.sessionProjections`**：PTC 的搜索发生在程序内部，只留 `tool/ptc-dispatch` 事件（不是 surface 事件，`deriveMessages()` 看不到），投影是唯一能恢复发现集的正当路径。

0.1.x 与 0.2.0 不在当前发布准入范围内，也不再为它们保留降级分支。当前窗口是 `>=0.2.1-rc.5 <0.3.0`，并通过 `engines.dsh` 与 peer 同时声明。

### 版本范围怎么定（以及它管不到什么）

三条取舍规则，改动范围前先读这里：

1. **下限是硬要求，上限是宿主执行的硬闸门**。`0.2.1-rc.5` 之前的组合不在当前发布准入范围内，`0.3.0` 上限只在宿主确实会向后破坏时才有意义——DSH 自称「开发者预览…未来将出现破坏兼容性的变更」，而插件面对宿主升级必然慢一步，所以留一个**粗**上限：它的作用是把「你正跑在一个我们没验证过的大版本上」变成宿主明确的拒绝，而不是静默装上再出怪问题。

   **这道闸门由 DSH 自己执行，不是 pnpm/npm**——安装器的 peer 警告（如 pnpm 的 `[WARN] Issues with peer dependencies found`）既不是判定依据，也不与它一致。`dsh-app-boot` 的 `evaluatePluginCompatibility` 拿 `dsh --version` 的实际版本比对本插件的 `peerDependencies`：不兼容的 bundle 会被跳过并打印 `skipping profile bundle …`，插件根本不加载（走 profile 清单的 `preflight` 路径时则是 `disabling profile plugin …`）。用户不想升级时可以授予**精确版本**豁免继续用：`dsh plugin --profile <profile> allow-version <name>@<version> --dsh-version <exact> --accept-risk`（豁免按 `name@version` × 精确宿主版本记账，落在 profile 目录的 `compatibility.json`）。**下限不会挡住任何新版本，只有上限可能「限死」，所以上限宁粗不细。**
2. **预发布不需要特殊照顾**。宿主的兼容评估使用 `includePrerelease: true`，因此 `0.2.1-rc.5` 之后的同一 0.2.x 预发布按数值参与比较；`0.3.0-rc.1` 这类更高元组越过上限。发布窗口只承诺当前已验证支持面，不把未来 0.2.x 预发布当作已验证功能。

   注意这条**只对宿主自己的闸门成立**：谁要复核这个范围，必须用宿主自己的 `evaluatePluginCompatibility`，而不是 `semver.satisfies(range)` 或 pnpm 的 peer 检查。`test/package-contract.test.mjs` 只钉 manifest 的窗口与 engines 同源，不模拟 semver。
3. **范围回答不了「装上还对不对」，而 CI 也只能盖住一半**。`0.1.6-alpha.2` 把 typert strict codec 从 `schema:`（zod v4 实例）换成 `create()`（进程内 realm 的懒工厂，registry 用 `record.value ??= record.create()` 物化）就是这么一次：它落在当时的 `>=0.1.5-rc.1 <0.2.0` 之内，插件的兼容性声明天生拦不住，2026-09-21 的漂移任务因此变红（那一次 130 项里唯一失败的就是加载期契约那条）。真正的保护分两层：**(a) 运行时契约**由 [`.github/workflows/upstream-drift.yml`](../.github/workflows/upstream-drift.yml) 每周把宿主整套换到 `latest` / `next` / `alpha` 三个渠道跑契约用例（`test/*.test.mjs` 去掉 `package-contract`，因为那份断言的是 pin 本身）；**(b) 宿主侧的加载期契约**（`lib/typert.js` 的形状由宿主 loader 校验，不由我们校验）由 `test/typert-manifest.test.mjs` 覆盖：它直接调宿主自己的 `validateTypertManifest` 验这份产物，形状一变就红；同一文件里还有一条**不依赖 loader 版本**的形状断言，钉住「strict codec 同时带 `schema` 与 `create()`」（下一条理由）——本地 devDependency 的 loader 是开发基线，看不见 alpha 的要求，只靠前者要等一周才知道。这一层原本是缺口——既有用例只保证 `lib/typert.js` 与 `lib/client.js` 两份产物彼此一致（`client-lifecycle.test.mjs`），宿主改了要求也不会变红，而后果是用户升级 DSH 后面板整个不可用。它也是 `@deepseek-ai/dsh-typert-loader` 只进 `devDependencies`、不进 peer 的原因：校验发生在宿主进程里，插件运行时不 import 它。

4. **当前发布支持面从 0.2.1-rc.5 开始**。0.2.0 只作为历史 loader 回归保留，不是发布准入；当前两类宿主组合是 0.2.1-rc.5（Loader 1.0.6）与 0.2.2-rc.1（Loader 1.1.0），而**换的这层不在 dsh-\* 的 API 面上**——`@deepseek-ai/dsh@0.2.1-rc.2` 只是把依赖声明改成了 `cordis ~4.0.5` / `cordis-plugin-loader ~1.0.6`（0.2.0 是 `~4.0.2` / `^1.0.3`），破坏性全都在 `cordis-plugin-loader` 1.0.3 → 1.0.6 的重构里。实测两处差异，都在插件侧做了显式适配，各有一条**不依赖宿主版本**的常驻用例（`test/loader-compat.test.mjs`）：

   | # | 差异 | 1.0.3（0.2.0） | 1.0.6（0.2.1） | 插件的适配 |
   |---|---|---|---|---|
   | L1 | 启动失败会不会冒到调用方 | `Entry.update()` 里 `throw updateError("apply", …)`，`loader.create()` 自己 reject | 改成 `logger.error/warn`，`create()` **总是 resolve**，错误只挂在 fiber 上 | 创建后 `await entry.fiber.await()`（cordis 4.0.2 与 4.0.5 的实现逐字相同，都会重抛启动错误）。不这么做，`add()` 的回滚分支永远进不去，patch 里留下一条连不上的行 |
   | L2 | dispose 时会不会写盘 | unload 处理器有 `if (fiber.entry._disposing) return;` 早退 | **这行被删了**，`fiber.entry.parent.tree.write()` 真的执行；对 include 子树条目就是 `Include.write()`，写回 base + **其余 patch 行** | 移除条目前先置 `entry.options.disabled = true`——该处理器里唯一还能早退的判据就是它。不这么做，"删一台服务器"会把兄弟服务器的 patch 行烙进 `cordis.yml`，下次启动 base 一份 + patch insert 一份 = 重复条目 |

   **L2 是历史宿主差异，不是我们的写法问题**：同一条路径在 0.2.0 上是干净的（`_disposing` 守卫挡住了）。上游若修回来，`disabled` 这一行仍然无害——它是一个即将被删除的条目，标记 disabled 不改变任何可见语义。当前支持的 Loader/Include 组合已由真 Loader、真 Include 和重启用例覆盖；GUI 的逐条人工点穿仍属于每次发布检查，不把当前工作树的浏览器快照冒充为版本矩阵证据。

   验证方式就是本仓库自己的漂移方法：隔离副本 + `pnpm add` 把 11 个 peer 宿主包整套换到目标版本，**再**按该 dsh 自己声明的 `dependencies.@deepseek-ai/cordis` / `cordis-plugin-loader` 换掉这两代（`upstream-drift.yml` 现在两件事都做）。0.2.1-rc.2 + cordis 4.0.5 + loader 1.0.6 的稳态是 **748/748**（`node --test`，去掉按定义会红的 `package-contract`）；0.2.1-rc.3 + 同一对 cordis/loader 在 2026-10-24 复跑是 **785/785**（仓库 1.8.3，套件已比上面那次长；首次跑的唯一一条红是环境问题——该用例读 `process.env.HOME`，而 PowerShell 只设 `USERPROFILE`，补上 `HOME` 即绿，同一份用例在 0.2.0-rc.2 基线上同样红）；0.2.1-rc.5 + 同一对 cordis/loader 在 2026-10-30 复跑是 **812/812**（仓库 1.9.0；同样只有那条 `HOME` 环境用例首跑红，补上 `HOME` 即绿）；0.2.0-rc.2 基线是 **796/796**。

   **为什么 strict codec 两个键都写，以及 0.2 之后还剩不剩意义**（`lib/typert.js` 与 `lib/client.js` 各一份，`client-lifecycle.test.mjs` 钉住两者一致）：宿主在两个渠道上查**不同的键**，且都忽略对方的键——`0.1.5-rc.x`（= 当时的 `latest` / `next`，也就是 `npx` 默认装到的那条）查 `codec.schema.parse` 必须是 zod v4 实例；`0.1.6-alpha.2` 起查 `typeof codec.create === 'function'`。少写 `schema` 会在最新 RC 上加载即拒，少写 `create` 会在 alpha 上加载即拒；`mode: 'src-json'` 不是出路（loader 强制 invocation 的 codec 必须是 strict）。拿三个版本的 loader 直接跑自己的产物：

| codec 形状 | loader `0.1.5-rc.2` | loader `0.1.6-alpha.1` | loader `0.1.6-alpha.2` |
|---|---|---|---|
| 只有 `schema` | PASS | PASS | 拒：`has no create() factory` |
| 只有 `create()` | 拒：`is not backed by a zod v4 schema` | 拒 | PASS |
| **双写** | PASS | PASS | PASS |
| `mode: 'src-json'` | 拒 | 拒 | 拒 |

历史验证记录：`0.2.0-rc.2` 与 `0.2.1-rc.2` 的 loader 都与 `0.1.6-alpha.2` 同列，只有 `create()` 通过、只有 `schema` 被拒。双写两个 codec 键仍保留，因为历史宿主可能检查不同键；这不是当前发布支持窗口的承诺。当前准入组合是 `0.2.1-rc.5`（Loader 1.0.6）与 `0.2.2-rc.1`（Loader 1.1.0），形状由 `test/typert-manifest.test.mjs` 与匹配宿主契约共同验证。

浏览器半（`@deepseek-ai/dsh-typert-registry` 的 `lib/client.js`）做同一份校验，所以 `lib/client.js` 里的 codec 必须同步改——只改 host 那份会变成「面板能加载，一调用就炸」。

漂移任务红了怎么读：

- **契约用例（含真机集成）失败** → 上游契约真的变了，按失败点修插件并发补丁（2026-09-21 那次就是这样红的）。
- **本地 `npm test` 里 `package-contract.test.mjs` 的 pin / lockfile 断言失败** → 宿主可用，去同步 pin：`package.json` 的 devDeps、`DEV_BASELINE`、README / README.en / installation 的「已验证至」，然后 `pnpm install && npm test` 确认全绿。

  这一条**不会**由漂移任务报出来：它的 `files` 是 `grep -v 'package-contract'`，pin 断言按定义就不参与漂移判定。所以「漂移任务绿」不等于 pin 没过期——2026-09-10 到 09-24 之间 pin 停在 `0.1.5-rc.2`，而 `latest` 已经是 `0.1.5-rc.3`、`next` 是 `0.1.7-rc.1`，两周无人发现，就是这条缺口。同步 pin 只有两个触发源：人注意到新 RC，或本地跑完整套件。

  改基线时保持 `COMPAT_WINDOW`、`engines.dsh` 与 manifest 同源；当前发布窗口是 `>=0.2.1-rc.5 <0.3.0`。只更新 `package-contract.test.mjs` 的 `DEV_BASELINE`、锁文件和“已验证”文档，且必须重新跑匹配宿主契约。

已实测（2026-09-24，漂移任务 [run 35943153431](https://github.com/Imzl-zl/dsh-mcp-manager-ui/actions/runs/35943153431)，三个渠道各 190 项全绿、0 跳过）：

| 渠道 | 宿主 | 结果 |
|---|---|---|
| `latest` | `0.1.5-rc.3` | 190/190 |
| `next` | `0.1.7-rc.1` | 190/190 |
| `alpha` | `0.1.7-alpha.2` | 190/190 |

2026-09-29 推进基线到 `0.2.0-rc.2`（本地实跑，234 项）：232/234 通过，失败的 2 项都是 pin 断言本身（`DEV_BASELINE` 与锁文件版本仍写着旧基线），同步后 233/234，最后 1 项是文档的「已验证至」——它按 `DEV_BASELINE_VERSION` 推导，同样属于 pin，改文档后全绿。也就是说 **0.2.0-rc.2 上没有任何一条契约用例失败**，含真机集成那组（真 cordis + 真 dsh-tools + 真 dsh-scope + 真 dsh-mcp-client + 真 stdio 子进程）。`0.2.0-rc.2` 落在 peer 窗口内也是必然的：`includePrerelease` 让预发布按数值比较，只有 `0.2.0` 正式版才越界（见上文第 2 条）。

更早：`0.1.6-alpha.1` 上契约用例全绿；`0.1.6-alpha.2` 上修复前唯一失败的是 `typert-manifest` 那条，双写后按漂移任务的文件清单 137/137 全绿（复现方式：把宿主整套换到 alpha.2 再跑那份清单）。

**alpha 全绿不等于它进了「已验证」**：这次它绿是因为我们的改动恰好是追加式（codec 双写 + 结构探测 cordis 私有字段），不是因为它稳定。所以兼容性表只写 `0.2.0-rc.2`——那是承诺；alpha 交给漂移任务每周探测，不承诺。这与上文第 2 条（预发布不需要特殊照顾）是同一个取舍。

**这份证据盖不到的地方**：客户端侧是替身测试（组件在 node 里渲染不起来），所以上表证明的是 **slot 注册契约**成立，不是 slot 在 0.2.0-rc.2 宿主上**渲染**正常。而 `0.1.6-alpha.2` 的发布说明里有「客户端 Session 会话支持多实例共存，相关 API 及 slot 有变化」。这类失败的表现是面板白屏、不会让任何用例变红，所以它属于发布前的人工检查（触发条件见 [安装与升级](installation.md#每次发布) 的「每次发布」），不进 CI。推进基线到 `0.2.0-rc.2` 这一次已按该检查单做过真机复核：面板打开、7 个作用域标签、16 条全局 MCP 正常渲染。

开发基线（`devDependencies`）跟随已验证的最新 RC，并按官方约定**镜像每一个 peer 依赖**（含 `@deepseek-ai/cordis`）；唯一的例外是 `@deepseek-ai/dsh-typert-loader`，它只供测试用（见上文第 3 条），不是运行期宿主契约。这条镜像不是冗余：`dsh plugin ... add <本地目录>` 是 `link:` 安装，Node 会从插件自己的路径向上解析，插件若只声明 peer 而没有本地副本，连它自己那份宿主依赖都找不到；反过来本地副本的传递依赖缺一个（例如旧配置遗漏 `@deepseek-ai/cordis`），整个插件树会在启动时直接加载失败。升级 DSH 后用 `pnpm install && npm test` 验证。

两个不在 `@deepseek-ai/dsh-*` 契约面里、但在真实安装中位于宿主模块层的依赖，值得点名：

- `@deepseek-ai/cordis-plugin-loader`（当前 peer `>=1.0.6 <1.2.0`，已验证 1.0.6 / 1.1.0）：`reveal` 用它的 `interpolate` 求值 `!!js` 配置节点。它是 vendor 包，靠 profile 的模块回退解析得到（与 `@deepseek-ai/cordis` 同一条路径）。
- `@deepseek-ai/cordis` 的私有字段：`LoggerService.exporter()` 的 disposer 删的是「当时的最大 ID」而不是注册时的 ID（`lib/index.js` 的 `return () => this.exporters.delete(this._snExporter)`），热重载会误删其他插件的 exporter。本插件因此直接读写 `logger.exporters` / `logger._snExporter` 这对私有字段，并把 peer 限定在已验证的 `>=4.0.5 <4.2.0`（4.0.5 / 4.1.0）；字段形状一变就退回 `exporter()` 通道并明确告警。

peer 怎么被解析到也很关键：官方 profile 的 `pnpm-workspace.yaml` 带 `nodeLinker: hoisted` + **`autoInstallPeers: false`**（`initProfile` 写入，注释写明理由：让缺失的 peer 走 `profiles/node_modules` 安装回退层，「so every plugin shares the installation's single cordis instance instead of a duplicate」）。因此本插件的 9 个 peer **不会**被 pnpm 装进 profile 的 `node_modules`，而是与宿主共用同一份包实例——这一点对 `@deepseek-ai/dsh-scope` 是硬要求：作用域标签是模块内的 `Symbol`，两份实例会让工具投射静默失效（见「连接状态语义」的作用域故障）。如果面板报「作用域隔离失败」，先确认这个配置没被改掉。

## 从本机客户端导入的读边界
来源导入是 Host 唯一一处去读「用户没有通过本插件指定过的路径」（其他客户端自己的配置文件）。边界钉在三处，改动前先读这里：

1. **文件名由来源表固定，目录只来自既有作用域参数**：全局位置从 `HOME` 与各客户端自己的环境变量（`CODEX_HOME`、`CLAUDE_CONFIG_DIR`、`XDG_CONFIG_HOME`…）推出，项目位置只往 `wsPath` 后面接固定文件名。浏览器送的是 `sourceId` + `scope`（项目作用域再带既有的 `wsPath`），没有「读哪个文件」这个参数，所以接口面不会变成通用文件读取器。
2. **值不出 Host**：扫描回给浏览器的是名称、传输、掩码字段名三类投影；`maskedSourceFields` 复用列表投影的掩码规则，只报字段名不报值。导入时由 Host 重读文件取真值，不然用户主目录里的密钥就进了浏览器会话。
3. **内容指纹**：预览返回文件内容的 sha256，导入必须回传且一致——没有它，「预览的是 A、导入的是 B」只差一次文件改动。

写盘路径没有新增：全局来源导入复用 `applyManagedImport`，项目来源导入复用 `applyWorkspaceImport`，与粘贴 JSON 是同一个函数。

导入进来的环境变量引用必须是个**总值表达式**（`!!js (process.env.X ?? "")`）：裸引用在变量缺失时求值为 `undefined`，而 mcp-client 的 Config 只接受字符串，会让宿主在启动时整棵树加载失败。这条边界适用于任何新增的导入路径。

同一个地方还要保证**同一作用域内 `serverName` 唯一**：官方 mcp-client 按注册作用域预留 `serverName`，同作用域重名会让插件加载直接抛（`mcp-client: serverName "x" is already in use`，整棵树起不来），项目层则会被 `mcpServers` 的对象键静默覆盖、丢条目。处理方式是**保留先出现的那条、跳过其余**，并把跳过的名字写进预览与导入结果：同批里一条重名不该让其余条目一条也导不进来。名字被 bundle / Agent preset 占用（外部层）是同一类问题，走同一取舍——跳过并提示，而不是整批失败。**读一份项目配置文件时相反**：文件自相矛盾就整份拒绝，静默少一条更糟。

这条规则收在 `lib/import-admission.js` 的 `admitImportedServers` 里，并由两个写盘入口（`applyManagedImport` / `applyWorkspaceImport`）各自调用一次（幂等）：写盘口不依赖调用方记得做，以后新增的导入器也不会漏。`normalizeMcpImport` 只负责归一化与**检测**同名（`duplicateServerNames`），不做策略——策略属于知道赌注的那个边界。

**但「写盘时不许造出同名」不等于「加载时不会出现同名」**：bundle 自带的 patch、Agent preset、被历史 bug 写脏的 `cordis.yml`（见上文 L2 那一行的 `Include.write()`）都能让同名条目绕过所有写盘口出现在 loader 里。所以面板上「这台服务器能不能改」与「有没有同名条目」必须是**两个判据**：

- **能不能改**：只看 `entry.options.id` 是否等于 profile patch 里那一行的 id（`resolveManagedEntry`）。名字只用于在我们自己这一层定位那条配置，不参与身份判定。曾经这里还要求「全场只有一条同名条目」，结果是别人多一条同名条目就把自己那条锁死——真机上表现为「一行、两条条目、编辑/停用/移除全灰」。
- **有几条同名**：`summarize()` 的 `conflict` 与 `duplicates: [{ id, phase, disabled }]`，只作展示。行上必须点出另一条的 id 与状态，因为 mcp-client 在 apply 期按作用域判重、同名条目里只有一条连得上——用户看到「连接失败」时必须能分清失败的是哪一条、另一条是谁的。

两条配套的诚实要求：移除后若还剩下别层的同名条目，note 要把「剩下的是谁、要重启宿主才会重新连接」写出来（否则删完仍看到失败日志，用户会以为移除没生效）；而**导入**路径维持上面的跳过语义不变——那是"要不要再写一行进去"，写下去就是第三条同类条目，与"改自己那条"不是一件事。

`!!js` 语法只在 `lib/env-expression.js` 里实现（生成 / 校验 / 抽取变量名 / 反转模板 / 求值）。**不要在其他文件里另写解析**：接受面比产出面宽一格，就足以让裸引用直通、把宿主拖下水。

## 工作区复制与导出的边界

「复制到另一个工作区」与「导出 JSON」看起来是同一件事（都是把配置弄到别处），但它们的**泄密面不同**，边界因此也分开定：

- **复制**：源配置在 Host 内读出来、直接写进目标，浏览器只送 `{from, to, names, overwrite}`，拿回名字清单与计数（`added` / `updated` / `skipped` / `targetCount` / `changed`；写盘那次还多一个 `note`），配置值一律不出 Host。值的投影纪律与列表投影一致，所以同机搬运不需要任何新的信任假设。
- **导出**：这是**唯一**一处让完整配置（含字面凭据）经过浏览器的路径，而且是有意的——备份、跨机器迁移、分享给同事都必须能拿到完整文件，给一份脱敏副本等于这些用途一个都做不了。代价写在界面上（「字面写死的凭据会原样出现在这里」）并落在文档里，而不是靠不提来回避。它只读、不写任何文件；**「只在项目作用域」是入口的性质，不是 Host 强制的**（`exportWorkspaceJson` 与既有只读 RPC 一样接受 canonical 路径，界面上只在项目标签页给这个入口）。要看**有效运行值**仍然走 `reveal`（那条路是逐字段、按需、且只对当前 Web profile 管理之外的 server 关闭）。

**写路径比读路径严**：读某个目录的配置只需要 canonical 路径（`getWorkspaceView` 一直如此），但写 `<目录>/.dsh/mcp.json` 需要那个目录是这台机器上**已注册**的工作区。只按 canonical 路径写，等于把「往任意目录写文件」的接口暴露给浏览器——那是与「读任意文件」完全不同量级的能力。这条不变量只在 `withRegisteredWorkspaceWrite(ctx, wsPath, operation)` 里表达一次，**所有**写项目配置的 Remote 都从它过（`lib/index.js` 里不再有直接调用 `withWorkspaceWrite` 的写路径），所以新增一条写路径不可能"忘了加门"——`test/package-contract.test.mjs` 把这一点钉成结构断言。注册表访问同样只有一处（`workspaceRegistryOf` 是低层取用，`registeredWorkspacePaths` 是它的抛出式投影）。

**同名处理刻意与导入不同**：复制默认**跳过**（保留目标现有条目），显式 `overwrite` 才覆盖；而导入的「合并」是**同名更新**（incoming 胜）。两个默认值不同是有意的，各自贴合自己的意图：

- 导入「合并」说的是"照这份 JSON 改这个项目"——用户手上那份就是目标状态，所以同名更新；
- 复制说的是"把这几条也拿过去"——目标项目里同名的那条是**目标自己的**配置，凭什么被源覆盖，所以"改动目标已有配置"必须由用户明确选一次。

「哪些名字算新增 / 更新 / 移除」只有一份规则（`classifyMerge`），它同时供**判定**与**物化**两个形态使用。判定只有一份：`mergePreview` 退化成纯格式化（拼 warnings/conflicts），不再自己数名字——所以"结果文案与文件内容对不上"不是靠约定避免的，是没有第二种可能。物化有**两份**，因为落盘对象不同：整份配置形态（项目 `<工作区>/.dsh/mcp.json`）走 `planMerge(existing, incoming, { replaceAll, onExisting })`，服务项目导入与跨工作区复制；profile patch 形态（带 entry id 的 YAML 增量）走 `updateManagedMcpPatch`，服务全局导入与单条增删改。策略由调用点给出（导入的合并传 `onExisting: 'replace'`、复制按开关传 `'skip'`/`'replace'`；`replaceAll` 只管落盘结果、不管清单），incoming 侧的重名由 `firstByName` 收成一条规则（与 `import-admission` 同一取舍）。**预览与写盘也共用一份解析**（`resolveWorkspaceCopy`）：面板给用户看的"这次会新增/覆盖/跳过什么"就是写盘那次要执行的那个计划，所以不可能出现"预览说跳过、实际却覆盖"。客户端那一侧也不放过这个时间差：预览结果与算出它的输入（目标 / 勾选 / 跳过-覆盖）绑定（`lib/client.js` 的 `copyPlanKey` / `copyPlanReady`），选择一变旧结果立即失效、重算完成前确认按钮不可按——宿主侧的同源拦不住"按着旧预览点确认"这个窗口。唯一的时间差是预览与写入之间目标被别的会话改过——写盘在写锁内重新解析一次，以最新配置为准。改同名语义时：判定改一处（`classifyMerge`），物化按形态各改一处（`planMerge` / `updateManagedMcpPatch`）——别照着一份实现推断另一条路径照此办理。目标项目的 `exclude` 不在搬运范围里：它是那个项目对全局 MCP 的可见性决定，不是配置数据。

**全部被跳过时不写文件**：一次什么都没变的复制不该刷新目标配置的 mtime（那会连带让配置缓存失效、白跑一遍连接对齐）。写盘之后的对齐照旧在写锁外做，失败也只记日志——与两条导入路径同一条纪律。**边界要说清**：这条捷径只在"全部被跳过"时成立；选了「覆盖」时即使目标那份与源逐字段相同，也会照常重写文件（`changed` 只看有没有命中同名，不比对内容）——用户显式要求覆盖，重写是诚实的。

## 设计约束

`dsh-toolbox-ui` 是 Web Host 单实例插件。固定的 Remote namespace 和 UI slot id 是有意设计；重复加载属于配置错误，插件会明确失败，而不是静默忽略。多个 MCP server 则由 `@deepseek-ai/dsh-mcp-client` 的不同 `serverName` 实例管理。

## 面板样式：为什么没有任何自选配色

DSH 的 `ui-theme` 拥有全部颜色、几何与字体，插件只消费语义令牌。这不是风格偏好而是硬契约，规范正文在 `docs/web-styling.md`：

> Use `--dsw-alias-*` semantic tokens in feature components. **Do not copy static palette values or write literal colors there.**
> Keep theme selectors out of feature component CSS. **Light/dark overrides belong to the theme owner.**

所以面板里没有 `@media (prefers-color-scheme: dark)`，也没有一处 hex。

> 引用边界：`packages/extensions/cordis-client-runner` 的 `CLIENT_NOTES` 里有同一句话，但那个包服务的是**动态包**（用户在面板里即时求值的代码，走 `styles.insert`），不是预构建插件。预构建插件的契约是 `docs/web-styling.md` 加 `docs/ui-radius.md`，别把动态包沙箱的说明当成通用规范引用。

落地方式是在 `MCP_CSS` 顶部一层别名：把要用的令牌一次性收成 `--mcp-*`，之后一千多行规则只引用别名。换主题、调刻度都只改这一处。

### CSS 怎么进页面：跟官方构建器保持一致

预构建插件的样式由官方构建器 `packages/client/tsdown.client.ts` 的 `styleInjectionModule()` 生成注入代码，形如：

```js
const tag = document.createElement('style')
tag.dataset.plugin = id          // 模块加载器认领/清理的凭据
tag.dataset.pluginCss = tagId    // 插件自己的去重键
tag.textContent = css
document.head.appendChild(tag)
```

本插件是手写 bundle（没有走 tsdown 预设），所以 `__injectCss` 自己实现同一件事，**两个属性都要盖**：

- `data-plugin` 是加载器认领样式的依据。`entry-lifecycle.ts` 的 `removeOwnedStyles()` **只删 `data-plugin === 插件 id` 的标签**；`system.ts` 的 `claimStyles()` 只有一条兜底——认领「materialize 期间新出现的未打标 style」。
- 因此只盖 `data-plugin-css` 时，正常路径靠兜底也能被清掉（所以它长期没暴露），但**在认领窗口之外插入的标签会变成孤儿**，HMR 反复替换时累积泄漏。

`test/client-lifecycle.test.mjs` 钉住了这两个属性，且经变异验证（去掉 `data-plugin` 该测试立刻变红）。

### 别名层为什么挂在 `body`

两个约束同时成立才安全，而且**两个方向都踩过一次**：

1. **必须是三个 slot 子树的公共祖先。** 插件同时往 `shell.overlay`（悬浮按钮）、`sidebar.footer.action`（侧栏入口）和面板自己渲染，它们没有公共祖先。最初别名挂在 `.dsh-mcp-wrap` 上——把圆角改走 `--mcp-r-*` 之后，悬浮按钮的圆角与阴影当场解析失败。
2. **必须与主题令牌同层。** `ui-theme` 把 `--dsw-alias-*` 定义在 **`body`** 上（`design-platform.css` 的 `body{}` 与 `body[data-ds-dark-theme]{}`；`ui-layout` 也是 `body.setAttribute('data-ds-dark-theme','')`）。自定义属性在声明处就完成替换、不参与"向上查找"，所以挂在 `:root`（`body` 的祖先）会取到空值——整片颜色别名失效，卡片与面板背景全部变透明。

`test/theme-contract.test.mjs` 钉住了这条：`aliasHost()` 要求别名宿主是 `body`（真实样式表上断言 `=== 'body'`，违规样本上断言 `:root` 会被照实报出来），`subtreesMissingLabelColor()` 另外要求三个 slot 子树各自都能取到 `--dsw-alias-label-primary`。

### 四条对齐官方 spec 的规则

判据直接对齐 DSH 自己的 spec（`packages/client/ui-theme/tests/`），语义逐条对应，上游收紧时可直接比对：

| 规则 | 判据 | 违反后果 |
|---|---|---|
| 全圆角配对 | `50%`/`100%`/`≥99px` 必须同规则配 `corner-shape: round` | `corner-shape.css` 在 `@supports` 里用通用选择器 `*` 给整个文档套 `superellipse(1.5)`，没配对的圆点被压方、药丸被削平两端 |
| 圆角走刻度 | 不得写字面值，只引用 `--dsw-radius-*` | 官方 spec 把「>4px 且 <99px 的字面圆角」判为违规（≤4px 算绘图细节）；刻度是 `xs:4 / sm:8 / md:12 / lg:16 / xl:20 / panel:28` |
| 抬升表面用阴影不用边框 | `border: 0` + `--dsw-elevation-prominent` | 中性边框与 elevation 阴影并用会画两遍轮廓，且边框宽度撑动布局 |
| 等宽走 `--ds-font-family-code` | 带 fallback，不写字面栈 | 这个是 `ui-theme` 真正定义过的（`base.css` 的 `:root`，官方 51 处用它）。名字很像的 `--dsw-font-mono` 全仓无定义（`dsh-market` 误用了它的 alias 形态 `--dsw-alias-font-mono`），引用它等于永远命中 fallback，等宽字形跟宿主代码块对不上 |

`corner-shape` 那条只在支持该特性的引擎上显形（Chromium 实测 `CSS.supports('corner-shape','superellipse(1.5)') === true`），jsdom 渲染不出来，所以只能扫样式表文本——这也是上游 ui-theme 的做法。

`scripts/theme-spec.mjs` 是这套判据的唯一实现，`test/theme-contract.test.mjs` 用它断言。测试刻意分两侧写，缺一不可：

- **「抓得到错」**——每个扫描器都有一组必须命中的违规样本。否则扫描器退化成"永远通过"时，另一侧全是空的。
- **「不误报」**——在真实样式表上必须全零。否则一个满屏误报的扫描器会被当成噪声关掉。

写这套判据时用变异测试核过一遍：人为在真实 CSS 上制造八类错误（去掉一处 `corner-shape`、圆角换成 `14px`、抬升表面加中性边框、别名层写死颜色、硬编码等宽栈、别名指向不存在的令牌、宿主改回 `:root`、删掉某子树的 label 色），最初只抓到 6/8——漏掉的两条都是**本仓库最常见形态**：规则里写的是别名 `var(--mcp-line)` 而非 `--dsw-alias-border-*`，以及别名层被整体排除后写死颜色无人管。两条都补进了判据。

### 令牌存在性：为什么需要一份快照

「别名指向的令牌真的存在吗」是这套判据里最容易做成空的一条——第一版就是：只对 `--dsw-radius-*` 查清单，其余 `--dsw-*` **只查前缀**。于是 `--mcp-accent:var(--dsw-alias-brand-typo)` 这种名字被静默放行，而上面的八类变异里恰好有一类是"别名指向不存在的令牌"，它在当时其实**没有**被真正抓到（那轮变异把它误记为已捕获）。前缀合法的错名字正是最危险的形态：`--dsw-alias-font-mono` 看着完全像真的，`var()` 却取到空值，面板当场丢色，而 jsdom 渲染不出来。

存在性必须查清单，所以仓库里带一份生成物：

- `scripts/sync-theme-tokens.mjs` 从**宿主源码树**的 ui-theme 样式表抽出全部 `--dsw-*` / `--ds-*` 定义，写出 `scripts/dsh-theme-tokens.mjs`（408 个令牌）。宿主更新时手工重放一次，diff 里能直接看出上游增删了哪些令牌。
- 快照口径是所有**定义**处，不论在哪个选择器下——真机全局扫描只能看到 407 个，少的那个是 `--dsw-focus-ring-color`（定义在 `:focus-visible` 上，只在聚焦元素可见）。存在性检查关心"这个名字有没有人定义"，宽一点才对；收窄会开始误报。
- 不覆盖 `--dsh-*`：那是各包自己的运行时变量，全仓分散、没有单一所有者，不属于主题契约。将来真要用，先扩生成器的采集范围，**不要退回去放行前缀**。

`test/theme-contract.test.mjs` 两头都钉：违规样本必须被抓到，且快照本身要有规模与关键成员（否则清单退化成空表时，存在性检查会反过来变成"任何令牌都不存在"而让另一侧的断言失去意义）。

## 技能能力面：为什么与 MCP 面并列而不是合并

面板有**两个能力层**（MCP / 技能），由顶部枚举切换，共享同一个悬浮窗与侧栏入口。它们必须是两个独立的宿主服务：

- **`skills` 不能进 MCP gateway 的 `static inject`**。Cordis 的 `inject` 是**依赖声明**——服务缺失时
  fiber 只是保持不激活并等待，**不报错**。而宿主的内置插件 `dsh-skill` 是可被用户禁用的，
  一旦把 `skills` 加进现有 gateway 的 inject，那些 profile 会连 **MCP 面板一起静默失效**。
  所以 `SkillsManagerGateway` 是独立子插件、自带 `inject = ["skills"]`，未满足时只影响技能面。
- **两个服务必须在同一个 patch 条目内挂载**：`cordis.patch.yml` 只有一条，且
  `package-contract` 断言该 id 与 name 各出现恰好 1 次，所以子插件由现有插件的构造函数
  `ctx.plugin()` 挂载。
- **契约必须并进同一个 `MCP_CONTRIBUTION`**：`typert.remotes.register()` 按 `contribution.package`
  去重，第二次 `$mount` 会抛 `Remote package "…" is already registered`，插件在 mount 阶段
  激活失败、**面板整体消失**。descriptor 只按 endpoint（namespace/method）与 id 去重，
  一个 contribution 天然支持多 namespace。同理 `SKILLS_CSS` 必须与 `MCP_CSS` **合并成一次**
  `__injectCss` 调用（那个函数的 id 写死，二次调用会覆写同一 `<style>`）。

### 技能的「位置」从哪来（根 + 磁盘条目）

`ctx.skills` **不暴露 `roots()`**（公开面只有 list/get/snapshot/collect/register），而启停与删除
必须精确到**一个文件**。所以位置从 summary 的 `resourceBase` 与 `path` 反推——但要分成两件事：

- **根**：目录捆绑取 `dirname(resourceBase.path)`，扁平取 `resourceBase.path` 本身。
  这是宿主给的**展示路径**，也正是写盘要用的那个。
- **磁盘条目**：目录捆绑取 `resourceBase.path` 的末段（宿主固定构造 `directory = <根>/<条目>`，
  所以末段就是磁盘目录名）；扁平则在根下**扫一遍、按 realpath 匹配宿主报的 `path`** 查出那个名字。

⚠️ **技能名（frontmatter 的 `name`）不参与定位**。宿主允许磁盘条目名与它不一致，按名字拼路径会让
这类技能在面板里所有操作都失败。两个路径字段的**口径也不同**（`resourceBase.path` 是展示路径、
`path` 是 realpath），链接下必然分叉，所以不能拿它们互相做路径比较。
推不出位置就**不填**——猜错会让启停/删除作用在错误的目录上，是本层最危险的失败模式。

### 启停为什么写 frontmatter，而不是改名

DSH 的技能没有 `disabled` 字段（MCP 有、技能没有）。但宿主原生的**两个调用面字段**组合起来
就是「停用」，而且这正是 VS Code / Copilot 官方文档里叫 “Disabled skills” 的那一档：

```
disable-model-invocation: true   # 模型不自动调用
user-invocable: false            # 你也不能手动调用
```

于是「停用」= 写这两个字段，「启用」= 都回到缺省。好处是**结构性的**：

- 技能仍在磁盘原处，宿主**照样报告它**（`list` 是调用无关的）→ 面板不必自己扫盘
  → 没有第二真值来源，也就没有「同一身份两行」「链接目录扫不到」那一类缺陷；
- 不再产生 `SKILL.md.disabled` 这个**任何规范都不认识**的形态。用户的技能常在
  `~/.agents/skills`——Agent Skills 标准的共享位置，VS Code / Codex 都扫它；
  把它改名等于为了本面板的一个开关，在**别的工具里**把用户的技能弄坏。

⚠️ 代价（写在这里免得下次当成 bug）：**「启用」会把两个调用面都恢复成可调用**。
用户原本若手工设过 `disable-model-invocation: true`（只想要「仅手动可调用」那一档），
一次「停用→启用」往返会重置它。所以详情页把两个面**各自**做成一个独立的可写开关
（`setModelInvocable` / `setUserInvocable`，共用 `setSkillInvocationFace` 一处实现）——
重置了也能在面板上拨回来，不必去编辑文件。「停用」只是「两个都关」这一个组合的快捷动作。

⚠️ 1.6.x 用的是「改名成 `SKILL.md.disabled`」那套自创机制。`scanDisabledSkills` 保留为
**一次性迁移读取**：把用户磁盘上（我们自己写下的）那些残留列出来并允许恢复，
它在下一个大版本可以整体删除——它不是第二个真值来源。

### 许可门禁为什么逐技能判定（2026-10-10 已下线）

这一节是决策记录：**逐技能许可门禁已随内置精选目录一起下线**，本节保留当年的推理。

当年判定的是本插件自维护的内置精选目录。同一个仓库里既有 Apache-2.0 的技能，也有禁止
「在服务之外保留副本」的专有许可技能（`anthropics/skills` 的文档技能就是后者）。按仓库聚合
两个方向都会错：要么把能装的毙掉，要么把不能装的放进来。所以目录里记录的是**事实**（许可是
什么、证据在哪个文件），「能不能装」由 `classifyLicense()` 在生成目录时算出——门禁只有一处实现。

2026-10-10 下线，两条理由：

- **没有可判定的对象**：目录不再自维护、生成物被删，判定链路上的东西一起没了；
- **上游不给许可信息**：今天唯一的来源（skillhub.cn）条目里**没有 license 字段**，无从查证，
  也不编一个出来。

所以今天的安全边界不是那条硬闸门，而是「外部源不做许可判定 + 披露 + 一次显式确认」。
「逐技能而非按仓库聚合」这条推理本身仍然成立——将来任何引入第三方目录的方案都要面对它。

### 为什么直连 skillhub.cn 上游，而不是复用第三方插件的路由

DSH 已经有一个接 skillhub 的第三方插件（`@cocofhu/skillhub`），它暴露的是自己注册的同源路由
`/skillhub`。我们没有复用它，两个理由：

- 那是它的**私有协议**，不是宿主契约：它换版本或被卸载，这条路就断了；而且那个插件同时握着
  装/重启 DSH 插件的权限，把它当数据源等于把市场绑死在它身上。
- 上游本身**公开且无鉴权**：`GET /api/skills`（搜索/列表）、`/api/v1/skills/<slug>`（详情）、
  `/api/v1/download?slug=`（302 跳 zip）、`/api/v1/categories`；基址可用 `DSH_SKILLHUB_BASE`
  指到镜像。直连还换来一条实质好处：**落点由面板选**（复用同一套「安装到」＝全局/项目 ×
  `.dsh`/`.agents`），而不是由上游替用户决定。

请求全在**宿主侧**发出，面板本身不联网——既避开浏览器 CORS（那多半正是第三方插件要服务端代理的
原因），也让「面板不开新网络依赖」这条约束继续成立。

上游条目**没有许可字段**，所以外部源只做披露 + 显式确认（发布方企业认证、腾讯 keen/sanbu
扫描结论、是否需 API Key）。确认由**服务端**校验：`acknowledged` 必须上 wire，UI 的勾选框
只是它的界面。下载只落到临时 zip，安装仍交给既有的 `importSkill`——外部源与「从本机导入」
因此走**同一条写入路径**，大小上限、zip slip、符号链接这些守卫只有一处实现。

一个易错点：新版面板跑在**老宿主进程**上时 `skillHubSearch` 这个 endpoint 根本不存在（wire 404）。
把它显示成「连接 skillhub.cn 失败」是误报——上游一次都没被访问过。所以面板对这两种情况给的是
不同的话：宿主进程是旧的 → 提示重启宿主；上游真挂了 → 在结果区给告警 + 重试。

## 写盘与运行中：一条链路

用户点一次「保存」，面板要说清两件事：**写进配置了吗**、**运行中的连接真按新配置起来了吗**。
这两件事以前共用一句「已更新」，于是出现两类静默错误：

- 宿主的更高层配置（home patch / CLI overlay）压着同一个条目：盘上写了、运行中没变，用户看到「成功」；
- 插件自己拼的 loader 条目与 patch 里的行不是同一个事实源：面板读一处、运行时走另一处。

现在只有一条路（`lib/profile-composition.js`）：

1. **读**当前 profile 的完整有序组合（bundle → profile → home → CLI overlay → telemetry），
   用官方 `readProfilePatches`；
2. **改**profile patch 文件的对应行（原子写 + 版本校验，仍是唯一写盘函数）；
3. **判**这一行在**最终有效配置**里算不算数——官方 `composeEntries`，被覆盖或被禁用就当场失败；
4. **应用**整份组合——官方 `reconcileProfilePatches(root, patches, name, requiredIds)`，
   条目由宿主自己挂起来/移除/重启，插件不再调用 `loader.create` / `entry.update` / `parent.remove`；
5. **验**运行中的条目（live owner 数量；`setDisabled` 另验启用态），失败就把盘上内容写回上一份并再应用一次，
   然后把"两份失败原因"一起报给调用方。

结果是所有变更型 RPC 都返回同一组字段：`persisted`（`applied` / `unchanged` / `rolled-back`）、
`live`（`applied` / `unchanged` / `skipped` / `failed`）、`diagnostics`。没有 profile 启动器的部署
（拿不到 `profileContext` 或官方组合 API）如实报 `live: 'skipped'` + 原因，绝不假装热生效。

### 两个必须知道的细节

- **根 context**：官方组合 API 认的是启动器挂 include 时用的那个根 `ctx`（内部 `WeakMap<Context, Entry>`），
  插件自己的派生 ctx 取不到；本层统一用 `ctx.root`。
- **移除前先标 `disabled`**：`cordis-plugin-loader@1.0.6`（0.2.1 宿主）在插件卸载时会
  `fiber.entry.parent.tree.write()`，对 include 子树条目就是 `Include.write()`——而它写的是
  **已应用树**（base + patch 行），于是"删一台服务器"可能把兄弟服务器的行烙进 `cordis.yml`。
  卸载钩子唯一的早退判据是 `fiber.entry.disabled`，所以行在 reconcile 之前先置位。
  0.2.2 的 include 换成 journal（按 patch/文件归属回写），这个补丁在那里不需要，但无害。

### 契约与产物：同一份定义

RPC 的四张脸（宿主 `@Remote`、`lib/typert.js`、`lib/client.js` 的 descriptor、网关原型）
只允许有一份定义：`lib/rpc-contract.js`。`scripts/rpc-contract.mjs` 从它**生成**中间两张、
**校验**第一张的顺序，第四张由测试比对；CI 跑 `npm run contract:check`，手改生成物或加了方法
没重生成都会当场失败。客户端按能力面拆成若干部件，`lib/client.js` 仍是单文件产物，
由 `scripts/build-client.mjs` 生成并校验（`--check`）。

## 工具搜索策略

**只有一件事：逐个工具决定它能不能被搜索。**

- 面板「工具搜索」列出 DSH 内置与其他插件的工具，每个可选 **常驻 / 可搜索**，默认常驻。
  没有全局开关，也没有「推荐 / 全部常驻」这类模式——列表本身就是开关。
- MCP 服务器不在这张表里重复控制：启停与「延迟 / 全量」仍在 MCP 列表上，一条服务器一个开关。
- 被标成「可搜索」的工具不进模型上下文，模型要用 `tool_search` 搜到它、拿到 schema 后才能调用。
  搜索入口与 PTC 的 `run_code` 永远不可被隐藏。

配置落在 `toolLoading.tools`（工具名 → `resident` / `deferred`），项目级写项目自己的
`.dsh/mcp.json`；没写的工具按常驻处理。

为什么默认常驻：宿主没有公开的工具来源（provenance）接口，插件分不清内置与第三方，
默认藏任何一个都可能藏掉用户的日常工具；所以默认一个都不动，要不要搜索由用户点名。

**没有可搜的工具时，搜索入口不出现**：延迟集为空（一台延迟的服务器都没有，或全部已发现）时，
`tool_search` 与目录段一起从模型可见的工具里消失——它虽然仍注册在宿主里，但"此刻搜什么都是空的"，
发出去只会让模型白搜一轮（issue #9）。这一条与"搜索入口不可被用户策略隐藏"不冲突：前者是
"没有东西可搜"，后者是"用户不能把它关掉"。

服务器级仍然是三态：条目上 `defer: true` = 延迟、`defer: false` = 常驻（明确覆盖）、
没写 = 跟随其它设置。这样列表里的「延迟 / 全量」芯片在任何配置下都说了算。

## 包结构

- `package.json`：声明 `dsh.bundle` 和 Web `dsh.client`
- `cordis.patch.yml`：插入唯一的 Host 插件实例
- `lib/index.js`：`mcpManager` Host Remote
- `lib/mcp-registry.js`：loader 中 MCP 条目的枚举与工具归属推断
- `lib/workspace-runtime.js`：项目配置读写状态、按 `(项目, serverName)` 引用计数的共享 mcp-client 连接，以及把其工具投射进每个会话作用域
- `lib/workspace-config.js`：项目级 `.dsh/mcp.json` 的读写与转换
- `lib/mcp-config.js`：JSON 规范化与 YAML patch 结构化读写
- `lib/own-property.js`：按用户可控名字建映射的唯一赋值原语（`setOwn` / `hasOwn`），零依赖
- `lib/mcp-import-sources.js`：本机其他客户端的来源表（位置 + 格式转换）与按条目容错的归一化
- `lib/env-expression.js`：受限 `!!js` 表达式的唯一实现（生成 / 校验 / 抽取 / 反转 / 求值）
- `lib/import-admission.js`：导入结果的写盘前准入（同作用域 `serverName` 唯一、环境变量引用归一为总值形式）
- `lib/mcp-observability.js`：连接状态判定与 mcp-client 日志格式化
- `lib/skills-registry.js`：宿主 `ctx.skills` 的投影（source / 作用域 / 根 + 磁盘条目推导）、安装目标能力表、物理位置去重
- `lib/skills-file-ops.js`：技能文件动作（启停 = 写 frontmatter 两个调用面字段、删除、导入、旧机制残留的迁移读取），按 `(根, 磁盘条目)` 精确定位、找不到即报错不回退
- `lib/skills-archive.js`：压缩包安全解包（防 zip slip、拒符号链接、按**实际解出字节**卡限额）
- `lib/skills-frontmatter.js`：frontmatter 校验与逐条诊断（判定逐字照抄宿主，宿主只 warn+skip，用户看不到）
- `lib/client.js`：响应式 Web UI、Remote 客户端和生命周期清理（由 `lib/client/` 若干部件拼成，见 `scripts/build-client.mjs`）
- `lib/profile-composition.js`：写盘 + 应用的唯一入口（官方 profile 组合 API 的适配层，含回滚与结构化结果）
- `lib/rpc-contract.js`：RPC 契约的唯一定义（其余三面由它生成或校验）
- `lib/typert.js`：Remote 契约描述（生成物：`npm run contract:write`）
- `scripts/theme-spec.mjs`：面板样式对 DSH 主题契约的判据（全圆角配对、圆角刻度、抬升表面、字面色值、等宽字体、别名宿主、别名令牌存在性），由 `test/theme-contract.test.mjs` 断言
- `scripts/dsh-theme-tokens.mjs`：DSH 主题令牌清单（生成物），存在性判据的数据源
- `scripts/sync-theme-tokens.mjs`：从宿主源码树重放上面那份清单

`scripts/` 与 `test/` 都不进发布包（`package.json` 的 `files` 只收 `lib`、`docs/*.md` 与几个根文件），它们是开发期的契约闸门。

`lib/` 是预构建产物，GitHub、tarball 和 npm 安装均不需要执行构建脚本。

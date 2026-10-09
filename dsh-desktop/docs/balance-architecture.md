# 余额显示功能架构说明（balance architecture）

本文档描述「余额 / 本轮费用 / OpenCode Go 用量」功能的整体架构、数据契约与安全边界。
**现役链路只有一条**：`assets/plugins/dsh-balance`（宿主半边 `lib/index.js` +
`lib/balance-core.js` + `lib/balance-scheduler.js`，展示层 `lib/client.js`），
外加 `assets/plugins/dsh-openclaw-bridge/lib/openai-compat.js` 的 usage 侧契约。
自制壳时代的余额链（`dsh-desktop/balance.js` + `dsh-desktop/balance-scheduler.js`
+ Rust `dsh-tauri/src-tauri/src/app/src/commands/balance.rs` + sidecar `balance-fetch`
+ 桥垫片 `dsh-balance-changed`）**已于 2026-10 整体拆除**（页面零消费方，却每 180s
仍真发一次 `/user/balance`；拆除台账见 §1.2，防复活守卫见
`scripts/test/unit-balance-legacy-retire.test.js`）。

> 本架构按「整体重构而非打补丁」的原则落地：并发仲裁、重试、密钥边界等
> 机制统一收口到独立模块，各缺陷与修复点的对应关系见文末映射表。

---

## 1. 数据流总览（现役，四层）

```
┌─────────────────────────────────────────────────────────────────────┐
│ 展示层  assets/plugins/dsh-balance/lib/client.js（浏览器内）          │
│   · normalizeUsage()：token 用量归一化（单一真源）                    │
│   · sessionCost()/hasUsage()/money()/goUsageText()                   │
│   · observeSessionCost()：增量计价账本（issue #168，见 §2.1）          │
│   · 唯一取数面：GET /api/dsh-balance/state（60s 轮询 + 转可见时一次）  │
│     首轮额外 POST /api/dsh-balance/refresh 强制刷一次                 │
└───────────────────────────────▲─────────────────────────────────────┘
                                │ 内核 webServer 上的两条 exact 路由
                                │ （插件宿主半边注册，仅回环地址可达）
┌───────────────────────────────┴─────────────────────────────────────┐
│ 编排层  lib/balance-scheduler.js（插件宿主半边，跑在内核 Node 进程）   │
│   · 节流（30s）/ 并发仲裁（in-flight 去重 + latest-sequence 守卫）     │
│   · 失败指数退避重试（30s→1m→2m→5m 封顶，成功清零）                    │
│   · 后台轮询 DEFAULT_POLL_MS = 3 分钟                                 │
│   · 单一 now 时刻（prices/priceTable/peak/pricingTier/at 同刻一致）    │
│   · 唯一数据出口：push(result) → 写 latest 缓存指针（路由只读不产）    │
└───────────────┬─────────────────────────────────────────────────────┘
                │ 同进程直接函数调用（无 IPC、无桥）
┌───────────────▼─────────────────────────────────────────────────────┐
│ 数据层  lib/balance-core.js（插件宿主半边，纯 Node 可单测）            │
│   · queryBalance / queryOpencodeUsage：取数 + 规整                    │
│   · fetchJson：HTTP 安全边界（见 §4）                                 │
│   · 凭据/模型/价格/金额解析纯函数；配置文件 mtime 缓存（P1-2+A-7）      │
│   · isPeakHour()/pricingTier()/periodTables()/pricingSince()（§7）    │
│   · HTTPS_PROXY/HTTP_PROXY/NO_PROXY 代理（CONNECT 隧道/absolute-form） │
└───────────────┬─────────────────────────────────────────────────────┘
                │ 只读
        DeepSeek /user/balance、OpenCode Go /zen/go/v1/usage
```

设计原则：

1. **密钥不出内核 Node 进程**：凭据只在数据层读取、只附加在内核进程发出的请求上；
   页面经 `GET /state` 拿到的载荷不含任何密钥。两条路由都先过 `isLoopback`
   （非回环一律 403），所以「同机的另一个进程」也读不到别人账号的余额。
2. **数据只有一条入页面通道**：`GET /api/dsh-balance/state`。编排层的 `push(result)`
   是数据的唯一出口，但它只写宿主侧缓存（`latest`），不往外投递；
   `POST /api/dsh-balance/refresh` 只触发一轮查询、其响应体被客户端**忽略**
   （`fetchHostState` 里 force 分支 `await … .catch(() => {})` 之后仍然只读 `/state`），
   所以「响应 + 缓存」双投递在结构上不可能发生。客户端也不消费任何返回值型桥接口。
3. **分层可独立测试**：`balance-core.js` / `balance-scheduler.js` 为纯 Node 模块
   （零 Electron/零壳依赖），注入依赖后可在普通 node 进程完整测试
   （`assets/plugins/dsh-balance/test/*.test.js`）；展示层经
   `scripts/test/verify-balance-dock.cjs`（vm + 最小 React mock + 假 fetch，逻辑级）
   与 `scripts/test/edge-client.test.js` 验证。

### 1.1 通道形态与节流层次（为什么是轮询）

| 层次 | 节奏 | 出处 |
|------|------|------|
| 页面轮询 `/state` | 60s（`BALANCE_POLL_MS`）+ 文档转可见时一次 | `lib/client.js` |
| 路由侧节流 | 30s（`ROUTE_THROTTLE_MS`，透传给编排器 `throttleMs`） | `lib/index.js` |
| 宿主后台轮询 | 180s（`DEFAULT_POLL_MS`） | `lib/balance-scheduler.js` |
| 单请求时限 | 4s（`BRIDGE_PUSH_TIMEOUT_MS`，`AbortSignal.timeout`） | `lib/client.js` |

即：**页面每 60s 读一次缓存，真发 HTTP 最快 30s 一次**（手动/首轮 force 穿透节流），
后台自己每 180s 刷一次。刻意不用 SSE：SSE 意味着每个标签页一条长连接，而官方客户端的
更新准入锁在安装期间对 connection/request 一律 503——长连接会成片断掉并触发重连风暴，
换来的收益在 60s 这个节奏上为零。

缺席与失败是两件事：`/state` 返回 **404** 判为「宿主半边没挂载」（插件未装/被禁用），
一次性置 `hostAbsent` 并永久改用 `browserOnlyPayload()`（`FALLBACK_PRICES` 计价、
不带 `peak`/`pricingTier` 即不渲染峰谷 chip、档位归 `unknown`），**此后不再反复探测**；
5xx / 网络错误判为「这一轮查询失败」，只在一次数据都没落过时才降级，避免把已有余额刷成空。

### 1.2 遗留线（已于 2026-10 整体拆除）

v1.0.0 的插件化把余额链搬进 `dsh-balance` 后，自制壳那条链一直没同步拆除，长期
「每 180s 真发一次查询、结果没人看」。本轮（拆 Electron 余额线）按四个前置依次落地：

| 环节 | 处置 |
|------|------|
| `dsh-desktop/balance.js` + `balance-scheduler.js` | 已删；`check-syntax.js` 的 `entryFiles` 同步摘除（该清单缺文件即 exit 1，不会假绿） |
| sidecar `node cli.js balance-fetch --app-dir …` | `case 'balance-fetch'` 已删；`sidecar/cli.test.js` 改锁「未知子命令 exit 2」 |
| Rust `commands/balance.rs`（`start_balance_loop` / `BalanceState` / `balance_refresh` / `trigger_fetch*`） | 整模块已删；`lib.rs` 的 AppState 字段与 `generate_handler!` 注册、`menu.rs` 的 toggle 触发、`session_notify.rs` 的 turn-end 挂点（C2）全部摘除 |
| `app.emit("balance-changed")` → 桥垫片 → `window` 事件 `dsh-balance-changed` | 事件与垫片转发已删；`shim.rs` / `dist/bridge-shim.js` 各留一条反向断言（含该字面量即红） |
| 桥命令 `balance_refresh` / 通道 `dsh:balance-refresh` | 已从 `bridge-api.md`（46 面）、`ipc-commands.md`（38 通道）、`commands.rs::CHANNELS`、权限真源 `permissions/bridge.toml` 四处同步移除；通道号 3173 与命令名不复用 |
| `unit-balance*` / `integration-balance` / `ta10-time-window-matrix` / `unit-balance-weekend` 存量覆盖 | **改指插件产物**（Node ≥22.12 的 require(esm) 可直接被测），而非删用例——现役链路 coverage 不留盲区；与 `dsh-offpeak` 的峰谷交叉锁原样保留 |

防复活：`scripts/test/unit-balance-legacy-retire.test.js` 逐层断言上述令牌只以
「裁撤说明」形态出现（段落级判定，兼容 markdown 与 Rust doc 注释的折行；代码侧按
「登记形态」判——`m(...)` 条目行、`"balance_refresh",` 授权行、`REQUIRED_SURFACES`
数组字面量本体，散文注释里的退役说明不算），并反向核对
插件的两条回环路由仍在（防止守卫把唯一活链路一起删掉却测不出来）；六条人为复活
反证（重建遗留模块 / 垫片重转发 / 契约复活行 / CHANNELS 复活通道 /
REQUIRED_SURFACES 复活面 / 把 `balance-core.js` 的代理客户端压成 `http`）均已
实测判红后逐字节还原。

不在裁撤范围内的是两样仍在用的东西：菜单项 `toggle-balance` 与设置项
`showBalanceDock`（控制插件 dock 显隐），以及插件自己的 180s 宿主轮询。

### 1.3 Electron 时代的接线（历史，仅供考古）

Electron 壳已退役，原 `main.js` 余额段曾整体平移到 Rust 壳 + sidecar，构成 §1.2
那条遗留线；下表右侧一列的实现已于 2026-10 删除，保留本表只为说明「为什么插件
路线不需要这些」：

| Electron（main.js） | Tauri 对应物（§1.2，已拆除） | 语义 |
|---------------------|----------------------------------|------|
| `ensureBalanceScheduler()` 常驻编排 | `commands/balance.rs::start_balance_loop`（代数守卫防线程累积） | 编排宿主 |
| `startBalanceLoop()` 首刷延后 500ms（A-10） | `BALANCE_FIRST_FETCH_DELAY_MS = 500` | 首屏稳定后再刷 |
| 3 分钟轮询（`DEFAULT_POLL_MS`） | `BALANCE_POLL_SECS = 180` | 轮询周期 |
| `shouldSkipRefresh`（最小化/隐藏暂停） | 轮询环可见性判定（5s 粒度检测） | 暂停不推进节拍 |
| `win.on('restore')` force 补刷 | 隐藏→可见边沿：先回放缓存再强制刷 | 恢复补刷 |
| `win.on('show')` 推 `balanceCache` | 恢复边沿回放 `AppState.balance.last` | 页面即时有数 |
| 取数（main.js 进程内直调） | sidecar `balance-fetch`（stdout 末行 JSON） | 单轮取数 |
| `win.webContents.send('dsh:balance')` | `app.emit("balance-changed")`（垫片转 window 事件） | 页面推送（拆除时已无消费者） |
| ipc `dsh:balance-refresh` | command `balance_refresh`（回放缓存 + 触发后台刷） | 刷新触发（拆除时已无调用者） |
| 菜单 toggle-balance 后立即刷 | `menu_action` toggle 分支 `trigger_fetch` | 开关即时生效 |

环境变量（`HTTPS_PROXY`/`DSH_HOME`/`DSH_TAURI_USERDATA` 等）曾由 Rust 侧整表
继承到 sidecar 子进程——两侧同口径（contracts/data-flow.md §5.1）。
插件路线下这些都不再需要：宿主半边就跑在内核自己的 Node 进程里，有完整 Node 权限，
取数与路由注册都不需要任何原生辅助进程。

---

## 2. 出站载荷契约（`BalancePush`）

载荷形态自 Electron 时代逐字沿用至今，只是投递方式从「事件 detail」换成
「`GET /api/dsh-balance/state` 的 JSON 响应体」；`/state` 在无缓存时返回同构的
空载荷（`pendingPayload()`），不会返回 204 或错误码。

```ts
interface BalancePush {
  ok: boolean;              // 余额查询是否成功
  disabled?: boolean;       // 用户关闭「显示余额/本轮费用」
  error?: string;           // 失败原因（no-key / HTTP xxx / 超时…）
  warning?: string;         // 非致命告警（http 端点明文传输 / 重定向剥离密钥 / 金额解析失败）
  isAvailable?: boolean;
  balances: Array<{         // queryBalance 规整后的余额条目
    currency: string;
    total: number;          // 全部可解析为有限非负数（千分位/货币符号已剥离，负数钳 0）
    granted: number;
    toppedUp: number;
  }>;
  opencodeGo?: {            // OpenCode Go 用量（设置关闭或查询失败时 ok:false）
    ok: boolean;
    reason?: string;
    error?: string;
    disabled?: boolean;
    usage?: {
      rolling: UsageWindow | null;
      weekly: UsageWindow | null;
      monthly: UsageWindow | null;
    };
  };
  prices: Prices;           // 默认模型在推送时刻的有效单价（== priceTable[默认模型]，含 balancePrices.<model> 覆盖）
  priceTable: Record<string, Prices>; // 全部已知模型同一时刻的价目表（含 balancePrices.<model> 覆盖）
  model: string;            // 默认模型名（settings.yaml agent-default-model）
  peak: boolean;            // 推送时刻是否高峰时段（与 prices/priceTable 同刻求值）
  at: string;               // 推送时刻 ISO 时间戳
  // —— issue #168 增量计价字段（全部可选：旧宿主不注入即缺席，客户端自行降级）——
  pricingTier?: 'legacy' | 'peak' | 'off';      // 推送时刻所属计价档（未注入时由 peak 兜底推导）
  periodTables?: Record<'peak'|'off'|'legacy', Record<string, Prices>>; // 三张全模型价目表
  pricingSince?: { peakPricing: string; weekendOffpeak: string };        // 规则生效节点（ISO）
}

interface UsageWindow {
  status: string | null;
  percent: number | null;   // 已用百分比 0-100；未知为 null（绝不折算成 0）
  resetsAt: string | null;
}

interface Prices { cacheMiss: number; cacheHit: number; output: number } // ¥/百万 token
```

兼容性约定：新增字段（`warning` / `priceTable` / `at` / issue #168 的
`pricingTier` / `periodTables` / `pricingSince`）为可选项，旧客户端忽略未知
字段即可正常显示；`prices` / `model` / `peak` / `balances` 等既有字段语义不变。
表中的「推送时刻」现指**宿主本轮刷新求值的时刻**（经 `/state` 读出，不再有事件推送）。
`model` 的来源在插件形态下是：宿主 `agentDefaultModel` 服务 → 本条目 `config` 块 →
`readActiveModel(DSH_HOME)` 的回落链（读不到为 `""`，客户端再落回 `DEFAULT_MODEL`）。

除正常载荷外还有两个**同构合成分**，字段集合与上表一致，靠 `error` 区分：
宿主侧 `pendingPayload()`（`error: "pending"`，从未刷新成功过、路由照旧 200）与
客户端侧 `browserOnlyPayload()`（`error: "no-host"`，宿主半边缺席；刻意不带
`peak`/`pricingTier`，故不渲染峰谷 chip、档位归 `unknown`，价目走 `FALLBACK_PRICES`）。

`periodTables` 与 `priceTable` 的一致性不变量（同一次求值内）：
`periodTables[pricingTier] === priceTable`（对象身份相等）。由此保证
「客户端首次入账」取到的价目与旧实现逐字相同，新字段只影响**后续跨档位**
的增量取价精度。用户 `balancePrices` 覆盖会并入三张表（定价单一真源不外溢到账本）。

### 2.1 增量计价账本（issue #168）

「本轮 ¥」不再是「会话累计 token × 推送时刻价目」——那个口径下峰谷一切换，
整段历史费用会被按新价重算（用户看到金额突然跳变）。现按**消耗时刻**计价：

| 要点 | 语义 |
|------|------|
| 入账单位 | 每个「用量增量」（本次观察 − 历史高水位）按当帧档位一次性入账，锁定不再改写 |
| 选档依据 | `pricingTier`（缺省时由 `peak` 推导，再缺省 → `unknown`），取价走 `periodTables[tier]`（缺省时降级 `priceTable`） |
| 幂等 | 投影是会话累计总量，增量 = `max(0, cur − highWater)`；重复渲染 / StrictMode 双渲染增量为 0，不叠加 |
| 投影回退 | 重试可致累计量小幅下降 → 高水位不下调、差额丢弃（官方口径：已结算不追溯） |
| 持久化 | `localStorage["dsh-balance:cost-ledger:v1"]`，按 `sessionId`（slot 标准 kit props）隔离；超 60 个会话按 `updatedAt` 淘汰；损坏/版本不符/写失败一律静默重建，绝不影响取价与余额显示 |
| 老会话兼容 | 无账本时首帧用**当前价目**对全部累计用量一次性入账（`backfilled: true` + `cost-ledger backfill` 日志），此后才走增量；首帧金额与旧实现逐分相等 |
| 无 localStorage | 退回模块级内存账本（受限上下文 / 纯浏览器），行为一致只是不跨重载 |

---

## 3. token 用量契约（单一真源：normalizeUsage）

历史上 `sessionCost` 直接读 `usage.uncachedInputTokens + usage.cacheWriteTokens`，
而 OpenAI 兼容适配器产出的是 `{ inputTokens, outputTokens, cacheReadTokens }`——
两个字段契约不一致，导致求和产生 `NaN → 0`，**所有 OpenAI 兼容端点的本轮费用
输入项恒为 0**。

现统一为「归一化 + 每操作数独立守卫」：

```js
// 形态 A：会话投影视图（官方 token-meter 契约）
{ uncachedInputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }
// 形态 B：provider usage 原样透传（OpenAI 兼容适配器等）
{ inputTokens, outputTokens, cacheReadTokens?, cacheWriteTokens?, model? }
```

归一化规则（`normalizeUsage`，客户端展示层的唯一入口）：

- `uncached = Number(uncachedInputTokens ?? inputTokens)`，非有限/非正 → 0；
- `write = Number(cacheWriteTokens)`、`read = Number(cacheReadTokens)`、
  `output = Number(outputTokens)`，同样的独立守卫；
- 费用 = `max(0, (uncached + write)/1e6 × cacheMiss) + max(0, read/1e6 × cacheHit)
  + max(0, output/1e6 × output)`（负 token 不会产生负费用）。

provider 侧契约（`openai-compat.js` 的 `mapUsage`，与 dsh-llm-deepseek 同构的
DISJOINT 计数）：

- `inputTokens = prompt_tokens − cacheReadTokens − cacheWriteTokens`（缓存读/写
  都从 prompt 总量中扣除，三桶相加恒等于 `prompt_tokens`，计费侧绝不重复计费）；
- 缓存写 token（`prompt_tokens_details.cache_creation_tokens` /
  `cache_write_tokens` / `prompt_cache_write_tokens` / `prompt_cache_creation_tokens`
  任一命名）单列为 `cacheWriteTokens`（按 miss 价计，与官方一致）；
- usage 附带 `model` 字段（余额小部件按会话真实模型取价的数据源）。

### 按模型取价

宿主每次刷新携带**全模型价目表** `priceTable`（同一时刻求值，经 `/state` 下发）。客户端：

1. usage 携带 `model` 且 `priceTable[model]` 存在 → 按会话真实模型计价，
   title 标注「按会话模型 X 单价估算」；
2. usage 携带的模型不在价目表 → 回退默认模型，title 标注「…会话模型 X 不在价目表内」；
3. usage 无模型字段（会话投影未透传）→ 回退默认模型，title 标注
   「…会话实际模型未知」——绝不假装精确。

宿主半边从未成功刷新过时，`/state` 返回 `pendingPayload()`：字段集合与正常路径同构，
`priceTable` 从同一份 `periodTables()` 里按当帧档位取（**不能另给字面量 `{}`**——
那会让首帧违反 §2 的对象同一性不变量，这个坑踩过并记在 `lib/index.js` 注释里）。

---

## 4. HTTP 安全边界（fetchJson）

| 规则 | 行为 |
|------|------|
| 首跳认证 | 调用方显式配置的端点**始终携带** Authorization（本地 http 代理场景依赖此行为） |
| 重定向认证 | 仅「同主机（hostname + port 相等，默认端口归一化）且 源/目标均为 https」保留；跨主机、https→http 降级、http 重定向一律剥离 |
| 剥离可见性 | 剥离动作经 `onAuthStripped` 回调并入结果 `warning`，宿主侧经 `ctx.logger` 记日志 |
| 重定向上限 | ≤ 5 跳，超出拒绝「重定向次数过多」；畸形 Location 拒绝「重定向地址无效」 |
| 总超时 | 跨重定向共享 deadline（slow-drip 无法靠空闲超时保活绕过） |
| 空闲超时 | socket 空闲即中断（第二道防线） |
| 体积上限 | 按**字节**累计（Buffer.length），多字节内容不绕过 1MB |
| 明文提示 | http:// 端点照常支持（README 承诺的代理场景，issue #78），但结果携带明文传输 warning |
| 本地路由 | 页面→宿主的两条路由只认回环 `remoteAddress`（127.0.0.1 / ::1 / ::ffff:127.0.0.1），其余 403；响应带 `cache-control: no-store` |

---

## 5. 编排语义（`lib/balance-scheduler.js`）

| 机制 | 语义 |
|------|------|
| 节流 | `maybeRefresh()` 距上次实际发起不足 30s 跳过；`maybeRefresh(true)`（重试/`POST /refresh`）绕过。宿主侧把 `ROUTE_THROTTLE_MS = 30s` 注入 `throttleMs` |
| in-flight 去重 | 并发触发共享同一次请求：后触发者等待同一结果，杜绝重复 HTTP |
| latest-sequence 守卫 | 只有最新一次请求的结果写入 cache / 推送；旧请求（慢失败/旧数据）完成即丢弃。在当前 API 下为防御性兜底（in-flight 去重已杜绝并发多请求，`seq === latestSeq` 恒真、无独立触发路径），其可达的 `!stopped` 分支经单测覆盖 |
| 重试 | 失败后指数退避 30s→1m→2m→5m 封顶；每次新失败按最新计数重排定时器；成功清零；`disabled` 不重试 |
| 单一 now | 每次刷新取一次 `new Date()`，prices / priceTable / peak / at 全部同刻 |
| 设置单读 | 每次刷新只读一次设置（余额开关与 OpenCode Go 开关同源）。插件包形态下读的是本 profile 条目的 `config` 块（经 `settings.describe()` 按条目 id 取行，见 §6）；读不到一律按默认走，**绝不因设置缺失而隐藏 dock** |
| 生命周期 | `scheduler.start()` 随插件 apply 的 effect 启动（首轮 + 3 分钟轮询），dispose 时 `stop()`——必须先停编排器，否则残留定时器会在插件卸载后继续发 HTTP |

注：`shouldSkipRefresh`（窗口最小化/隐藏暂停门）在插件路线下**没有接线**——宿主半边
不认识窗口状态，且页面自己已按「不可见不轮询」收敛（`visibilitychange` 只在转可见时同步一次）。
该依赖仍保留为编排器 `lib/balance-scheduler.js` 的可选注入（不传即不暂停）；
曾接线它的遗留线已于 §1.2 拆除。

### 触发点清单

| 触发点 | 入口 | 节流 |
|--------|------|------|
| 插件装配（内核启动/重载） | `lib/index.js` 的 `scheduler.start()` 首轮 | 强制 |
| 宿主后台轮询 | 编排器 `DEFAULT_POLL_MS = 180s` 定时器 | 是 |
| 页面首次挂载 dock | 客户端首轮 `force=true` → `POST /refresh` | 强制 |
| 页面 60s 轮询 | 客户端 `GET /state`（命中缓存即返回，不额外发 HTTP） | 是（30s 路由节流 + 180s 宿主轮询） |
| 文档转可见 | 客户端 `visibilitychange` → `GET /state`（不强制） | 是 |
| 失败自动重试 | 编排器内部退避定时器 | 强制 |
| ~~会话回合完成~~ | session-watcher 挂钩在插件形态下不存在，由 180s 轮询覆盖 | — |
| ~~菜单「显示余额」开关~~ | 自制壳菜单项；官方桌面形态无该菜单，开关迁到本插件设置条目 | — |
| ~~遗留线（§1.2）~~ | ~~Rust 轮询环首刷 500ms + 180s 周期 + 隐藏→可见边沿强制刷 + `balance_refresh` 命令 + `menu_action` toggle~~ —— 2026-10 整体拆除 | — |

---

## 6. 凭据与配置读取

- `readCredentialLine`：只匹配**列 0 顶层键**（嵌套段同名键不读）；
  支持引号值、行尾注释、正则元字符键名。
- `readActiveModel`：逐行状态机锚定 `agent-default-model` 段（前缀相似段不误匹配），
  段内取缩进最浅的 `model:`（深层嵌套同名键不优先）。
- 优先级链不变：环境变量 > `.credentials.yaml`（OpenCode 另有 CLI auth.json 兜底）。
- 宿主半边对服务依赖刻意收敛到 `inject = ["webServer"]` 一项：credentials / settings /
  agentDefaultModel / deepseekAccount 全部经 `ctx.get` 惰性软读并整体吞异常
  （未声明注入的属性访问会直接抛 `cannot get property … without inject`）。写进 inject
  会让「某个官方包没挂载」直接判本插件装配失败、整个余额 dock 消失，而它们每一个
  都有可用的兜底路径。
- ⚠ 历史坑（已修，别改回去）：`settings.get(ns)` 这个 API 在内核里**不存在**
  （SettingsForms 只有 describe/update/configure/schema/prepareDocument/mutate/replace），
  外面套的 `typeof settings.get === "function"` 守卫恒假 ⇒ 整段静默跳过，dock 开关与
  「从设置读默认模型」从未生效过也不报错。现读法是 `settings.describe()` 返回的按条目 id
  索引的行，且 `ns` 是 **profile 条目 id**（`cordis.patch.yml` 的 `- id:`，本插件为
  `balance`；`readSettings` 依次试 `balance` 与 `dsh-balance` 两个 ns），不是包名。
  条目级设置块支持 `showBalanceDock` / `showOpenCodeGoUsage` / `balancePrices`（或 `prices`）。
- `DSH_HOME` 解析与 `dsh-home-paths` 同口径：显式覆盖 > `$DSH_HOME` > `~/.dsh`。

## 7. 端点与定价

- 余额端点：`DEEPSEEK_BALANCE_URL`（完整 URL）> `DEEPSEEK_API_BASE`（拼
  `/user/balance`）> 官方 `https://api.deepseek.com`。
- OpenCode Go 端点：`OPENCODE_USAGE_URL`（代理/镜像场景）>
  `https://opencode.ai/zen/go/v1/usage`。
- 定价：2026-08-17 起峰谷定价（北京**工作日** 9:00-12:00 / 14:00-18:00 全价，其余半价），
  此前旧版固定价；`isPeakHour` 在峰谷生效节点之前恒为 false，保证 chip 与
  计价档一致。
- **周末全天空闲**（官方 2026-08-23 00:00 北京时间起）：周六/周日全天按空闲价计。
  数据层的生效门槛常量 `WEEKEND_OFFPEAK_SINCE_UTC` 与
  `assets/plugins/dsh-offpeak` 的 `WEEKEND_OFFPEAK_EFFECTIVE_FROM`（issue #158 产物）
  指同一北京日历日，口径以两侧交叉一致性测试守住
  （`scripts/test/unit-balance-weekend.test.js` 从 offpeak 源码正则读常量对拍）。
  该规则**不溯及既往**：门槛之前的周末仍按旧窗口判高峰。
- **价目常量只有一份**：`assets/plugins/dsh-balance/lib/balance-core.js` 的
  `PEAK_PRICES` / `LEGACY_PRICES` / `PEAK_PRICING_SINCE_UTC` / `WEEKEND_OFFPEAK_SINCE_UTC` /
  `isPeakHour`。遗留 `dsh-desktop/balance.js` 曾与之**无共享代码**地各存一份，靠
  `unit-balance-weekend.test.js` 第 4 节逐时刻对拍锁住漂移；该遗留线已于 2026-10 整体
  拆除（§1.2），这份重复随之消失，双拷贝对拍也随遗留文件一同下线——现役口径由
  `isPeakHour` 的直接求值用例把守，并与 `dsh-offpeak` 源码常量交叉对拍（改价/改窗口
  仍要同时核对 offpeak 侧，见 §10）。
- **切换瞬间价格跳变**：按小时切价是官方计费规则本身（整点切换、无比例过渡）。
  issue #168 修复后，展示层不再「用当前价重算历史」——各时段增量在发生时即按
  当时价目锁定（见 §2.1），跨整点不再跳变；chip 与价目仍由「单一 now」保证自洽。

## 8. 安全与隔离（测试约定）

- 全部自动化测试（单测 / 集成 / 竞态）**绝不触碰真实 `~/.dsh`、真实 API 端点与本机
  已安装的 DSH Desktop**：临时目录、回环 mock server、注入式依赖、harness 自有 userData。
- 集成测试使用的 TLS 自签名证书仅存在于 `scripts/test/fixtures/`，测试进程内
  设置 `NODE_TLS_REJECT_UNAUTHORIZED=0` 并在退出前恢复。
- 展示层不再有独立渲染 harness（Electron 时代的 `scripts/test/renderer-balance-harness/`
  已随壳退役删除）：vm 沙箱 + 假 fetch 的 `edge-client.test.js`（在册）与
  `verify-balance-dock.cjs`（CI 独立步骤）就是渲染级验证。
- ⚠ `assets/plugins/dsh-balance/test/*.test.js`（宿主半边自己的单测）**不在 `npm test`
  的 glob 内**（`node --test "scripts/test/*.test.js" "scripts/test/*.test.mjs"` 只收
  `scripts/test/`）。现役链路的定价/路由语义靠 `scripts/test/` 侧的
  `edge-client` / `unit-balance-weekend`（第 4 节双拷贝对拍）/ `unit-balance-scheduler*`
  把守；插件内那份测试要单独跑：
  `node --test assets/plugins/dsh-balance/test/*.test.js`。

## 9. 缺陷 → 修复映射表

下表是历史台账，「修复落点」写的是**当时的文件名**：`balance.js` / `balance-scheduler.js`
现对应插件侧的 `assets/plugins/dsh-balance/lib/balance-core.js` / `lib/balance-scheduler.js`
（遗留同名文件已于 2026-10 随 §1.2 整体删除，本表只作变更史保留）；`main.js` 对应 `lib/index.js`。

| 严重度 | 缺陷（现象与根因） | 修复落点 |
|--------|--------------------|----------|
| 🔴 严重 | sessionCost NaN 清零 + tokenUsage 契约不匹配 | client.js `normalizeUsage` + openai-compat.js `mapUsage` |
| 🔴 严重 | 重定向泄露 API Key | balance.js `fetchJson` + `redirectAuthorization` |
| 🟠 高 | refreshBalance 无并发去重，last-writer-wins | balance-scheduler.js in-flight 去重 + latest-sequence 守卫 |
| 🟠 高 | 持久失败 30s 无限重试 | balance-scheduler.js 指数退避（30s→1m→2m→5m 封顶，成功清零） |
| 🟠 高 | 默认模型价估实际会话费用（3x 偏差） | main.js 推送 `priceTable`；openai-compat.js usage 携带 model；client.js 按模型选档 + 估算标注 |
| 🟡 中 | peak 与 prices 双 `new Date()` + 切换点 | balance-scheduler.js 单一 now；balance.js `isPeakHour` 旧版期返回 false |
| 🟡 中 | pickUsageWindow 把 percent:null 转 0 | balance.js `pickUsageWindow` `== null` 分支 |
| 🟡 中 | 超时为空闲超时 + 1MB 按字符计 | balance.js fetchJson 总 deadline + 按字节累计 |
| 🟡 中 | readCredentialLine 不区分 YAML 段 | balance.js 列 0 顶层键锚定 |
| 🟡 中 | http 端点明文传输 | balance.js 结果携带 warning + README 提示 |
| 🟡 中 | Number(x)\|\|0 静默清零格式化余额 | balance.js `parseAmount`（千分位/货币符号剥离、负数钳 0、脏数据告警） |
| 🟡 中 | sessionCost 无下限保护 | client.js 逐桶 `Math.max(0, …)` |
| 🟡 中 | OpenCode URL 硬编码 | balance.js `OPENCODE_USAGE_URL` 环境变量覆盖 |
| 🟢 低 | money 格式化边界（1e+21 / Infinity / 跨数量级） | client.js `money`（非有限 → "—"、0 → "0.00"、大额走本地化） |
| 🟢 低 | rel 缺 noopener | client.js 两个外链 `rel="noopener noreferrer"` |
| 🟢 低 | goUsageText 全空返回 "Go " | client.js 全空返回 null，调用方不渲染 |
| 🔴 严重 | **issue #168-1**「本轮 ¥」= 会话累计 token × 推送时刻价目 → 峰谷切换后历史费用整段跳变 | balance-scheduler.js 推送 `periodTables`/`pricingTier`/`pricingSince`；client.js 增量计价账本（按消耗时刻选档入账，已结算不追溯，localStorage 按会话持久化，见 §2.1） |
| 🟠 高 | **issue #168-2** `balance.js` `isPeakHour` 缺周末规则，与 `dsh-offpeak`（issue #158）口径不一致：2026-08-23 起周六/周日 9-12/14-18 仍按全价 | balance.js `WEEKEND_OFFPEAK_SINCE_UTC` + `isPeakHour` 周末豁免（含生效门槛，不溯及既往）；与 dsh-offpeak 交叉一致性测试 |
| 🟢 低 | sessionCost/money 零单测覆盖 | 新增 95 项断言 + 存量 dock 17 项，合计 112 项（当时的真实 Electron 渲染层验证已随壳退役） |
| 🟢 低 | readActiveModel 正则可匹配更深嵌套 | balance.js 逐行状态机（缩进最浅优先） |
| 🟢 低 | settings 双读 | balance-scheduler.js 每次刷新单次 `getSettings()` |
| 🟢 低 | IPC 双通道重复投递 | 当时：IPC 只触发不返回、client 只消费事件、`bridgePushedOnce` 防重复触发。**现形态**：数据只从 `GET /state` 进页面，`POST /refresh` 的响应体被忽略；`hostPolledOnce` 取代 `bridgePushedOnce`（首轮之后不再强制刷） |
| 🟠 高 | **本轮（dsh-balance 0.1.2 随迁）**：CI 独立步骤 `verify-balance-dock.cjs` 场景4 仍按「window 事件推送」建模 → 客户端不再注册监听，校验器 `handler is not a function` 崩在断言中途（`npm test` 不收 `.cjs`，全量套件全绿也看不见） | 场景4 改走假 fetch 的 `POST /refresh` + `GET /state` 链路，新增 4b（404 缺席降级 + 不再反复探测）与反向锁（window 监听数为 0）；`flush()` 的定时器**绝不 unref**（unref 会让进程在 await 中途退出、EXIT=0 假绿） |
| 🟡 中 | **本轮**：现役价目（插件 `balance-core.js`）没有任何在册测试把守——`unit-balance-weekend` 只对遗留 `balance.js` 求值，插件自带 `test/` 不进 `npm test` | `unit-balance-weekend.test.js` 新增第 4 节：现役/遗留逐时刻对拍 + 现役侧与 dsh-offpeak 参考实现对拍（已实测三例人为漂移均判红）。**后续**：遗留线 2026-10 拆除后本行只剩单向语义——该文件整体改指 `balance-core.js` 直接求值，双拷贝对拍随 `balance.js` 一同下线 |
| 🟠 高 | **本轮（dsh-balance 0.1.3）**：flash 档自迁入起就与官网不符——① 内核真实模型 id `deepseek-flash`（`dsh-llm-deepseek` 的 DEFAULT_MODELS 下发名）不在价目表内，查表未命中静默落回 pro 档（会话模型 `deepseek-flash` 按命中价 0.3 计，为官方 0.04 的 7.5 倍，即「命中缓存算错」的主因）；② flash 峰值 3/0.1/9 是按 pro÷3 推导的，官方为 未命中 2 / 命中 0.04 / 输出 8，命中价高估 2.5 倍 | `balance-core.js` 的 `PEAK_PRICES` 新增 `deepseek-flash` 键并把 flash 档改为官方值（`deepseek-v4-flash` / `deepseek-chat` 同改）、`LEGACY_PRICES` 镜像 `deepseek-flash` 旧价 {1, 0.02, 2}；宿主侧 `priceTable` / `periodTables` 因遍历 `PRICING_MODELS` 自动覆盖真实 id，客户端零改动。回归锁：`unit-balance-pricing-key.test.js`（真实 id 命中档 / 后缀变体 / 旧版期镜像，配变异红验证） |


## 10. 维护约定

- 价目表变更：只改 `assets/plugins/dsh-balance/lib/balance-core.js` 的
  `PEAK_PRICES` / `LEGACY_PRICES` / `PEAK_PRICING_SINCE_UTC`（**唯一真源**；曾与遗留
  `dsh-desktop/balance.js` 各存一份、双向判红的现实已随 §1.2 拆除结束）。客户端零改动
  （`priceTable` / `periodTables` 自动同步），价目与档位口径由
  `unit-balance-weekend.test.js` 直接对 `balance-core.js` 求值把守。
- 峰谷规则变更（窗口、生效门槛）：`balance-core.js` 的 `isPeakHour` 与
  `assets/plugins/dsh-offpeak` 的 `isPeak()` **两处必须同步**改，两侧口径由
  `unit-balance-weekend.test.js` 的源码交叉断言把守（从 offpeak 正则读
  `WEEKEND_OFFPEAK_EFFECTIVE_FROM` / `DEFAULT_PEAK_WINDOWS` 对拍）；
  历史门槛类常量只能新增、不可改写（不溯及既往）。
- 新增模型 id / 别名（先核对 `dsh-llm-deepseek` 的 DEFAULT_MODELS 真实下发名——它才是
  会话模型名，别名只是历史称呼）：**三处同步**——`PRICING_MODELS` + `PEAK_PRICES` +
  `LEGACY_PRICES` 各补该键。只加 `PRICING_MODELS` 而漏价格键，`priceTable` 会静默产出
  pro 兜底档（0.1.3 前 `deepseek-flash` 的缺陷形态）。
- 新增网络边界参数：一律走 `fetchJson` options（timeoutMs / maxRedirects /
  maxBodyBytes），默认值集中在 `balance-core.js` 顶部常量。
- 新增出站字段：先更新本文档 §2 契约，再改代码；可选项向后兼容。
  宿主侧的字段出口在 `pendingPayload()` 与 `push(result)` 两处，**首帧（未刷新成功）
  与正常帧的字段集合必须同构**，否则客户端首帧会读到 undefined 而非降级值。
- 改页面取数节奏：只动 `lib/client.js` 的 `BALANCE_POLL_MS`；别把 `/state` 改成
  「顺手查一次」——单一入页面通道是 §设计原则 2 的立身之本。
- 测试命令（全部隔离，测试只使用临时目录与回环地址，绝不触碰真实 ~/.dsh）：
  `node --test scripts/test/*.test.js scripts/test/*.test.mjs`（`npm test`）、
  `node scripts/test/verify-balance-dock.cjs`（CI 独立步骤，见 ci.yml）、
  `node --test assets/plugins/dsh-balance/test/*.test.js`（插件自带，不在 npm test 内）；
  Tauri 侧 `node --test ../dsh-tauri/sidecar/cli.test.js`（sidecar 子命令面，
  含「`balance-fetch` 已撤 → 未知子命令 exit 2」判据）与 `cargo test --workspace`
  （壳侧余额实现已整体删除，防复活判据落在 Node 侧
  `scripts/test/unit-balance-legacy-retire.test.js`）。Electron 时代的
  `verify-balance-renderer.cjs`（依赖 Electron 运行时）已随壳退役删除，
  渲染层覆盖由 `verify-balance-dock.cjs` / `edge-client.test.js` 承接。


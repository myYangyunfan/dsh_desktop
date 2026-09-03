# 余额显示功能架构说明（balance architecture）

本文档描述「余额 / 本轮费用 / OpenCode Go 用量」功能的整体架构、数据契约与安全边界，
是 `balance.js`、`balance-scheduler.js`、壳层余额接线（Electron 时代 `main.js` 余额段；
Tauri 线为 `dsh-tauri/src-tauri/src/app/src/commands/balance.rs` + sidecar
`balance-fetch` 子命令）、`assets/plugins/dsh-balance`
与 `assets/plugins/dsh-openclaw-bridge/lib/openai-compat.js` 的单一事实来源。

> 本架构按「整体重构而非打补丁」的原则落地：并发仲裁、重试、密钥边界等
> 机制统一收口到独立模块，各缺陷与修复点的对应关系见文末映射表。

---

## 1. 数据流总览（四层）

```
┌─────────────────────────────────────────────────────────────────────┐
│ 展示层  assets/plugins/dsh-balance/lib/client.js（浏览器内）          │
│   · normalizeUsage()：token 用量归一化（单一真源）                    │
│   · sessionCost()/hasUsage()/money()/goUsageText()                   │
│   · observeSessionCost()：增量计价账本（issue #168，见 §2.1）          │
│   · 只消费 window "dsh-balance-changed" 事件（单一投递）              │
└───────────────────────────────▲─────────────────────────────────────┘
                                │ Electron：preload.js 转发 'dsh:balance'
                                │ Tauri：桥垫片监听 emit("balance-changed")
                                │   → window.dispatchEvent('dsh-balance-changed')
┌───────────────────────────────┴─────────────────────────────────────┐
│ 编排层  balance-scheduler.js（壳层宿主进程，纯 Node 可单测）           │
│   · 节流（30s）/ 并发仲裁（in-flight 去重 + latest-sequence 守卫）     │
│   · 失败指数退避重试（30s→1m→2m→5m 封顶，成功清零）                    │
│   · 最小化/隐藏暂停门 shouldSkipRefresh（P1-2+A-7，force 穿透）        │
│   · 单一 now 时刻（prices/priceTable/peak/pricingTier/at 同刻一致）    │
│   · 唯一数据出口：push(result)                                       │
└───────────────┬─────────────────────────────────────────────────────┘
                │ Electron：main.js 薄接线（注入查询函数/设置读取/push 回调）
                │ Tauri：sidecar `balance-fetch` 单轮取数（同款注入，
                │   pollMs=0 不装轮询定时器）+ Rust 编排层轮询调用
┌───────────────▼─────────────────────────────────────────────────────┐
│ 数据层  balance.js（壳层宿主进程，纯 Node 可单测）                     │
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

1. **密钥不出宿主进程**：凭据只在数据层读取、只附加在宿主进程发出的请求上；
   页面拿到的载荷（Electron `dsh:balance` / Tauri `balance-changed`）不含任何密钥。
2. **数据只有一条出站通道**：编排层的 `push(result)`。刷新触发通道
   （Electron ipc `dsh:balance-refresh` / Tauri command `balance_refresh`）
   只触发刷新、不返回值；客户端不消费 `refreshBalance()` 的返回值。
   同一份数据绝不会经两个通道各投一次。
3. **分层可独立测试**：`balance.js` 与 `balance-scheduler.js` 均为纯 Node
   模块（零 Electron 依赖），注入依赖后可在普通 node 进程完整测试；展示层
   经 `scripts/test/verify-balance-dock.cjs`（vm + 最小 React mock，逻辑级）
   与 `edge-client.test.js` 验证。

### 1.1 Tauri 接线（Electron 壳退役后的宿主换位）

分层与契约零变更，宿主从 Electron main.js 换到 Rust 壳 + Node sidecar：

| Electron（main.js） | Tauri 对应物 | 语义 |
|---------------------|--------------|------|
| `ensureBalanceScheduler()` 常驻编排 | `commands/balance.rs::start_balance_loop`（KernelReady 后启动，代数守卫防线程累积） | 编排宿主 |
| `startBalanceLoop()` 首刷延后 500ms（A-10） | `BALANCE_FIRST_FETCH_DELAY_MS = 500` | 首屏稳定后再刷 |
| 3 分钟轮询（`DEFAULT_POLL_MS`） | `BALANCE_POLL_SECS = 180` | 轮询周期 |
| `shouldSkipRefresh`（最小化/隐藏暂停） | 轮询环可见性判定（5s 粒度检测） | 暂停不推进节拍 |
| `win.on('restore')` force 补刷 | 隐藏→可见边沿：先回放缓存再强制刷 | 恢复补刷 |
| `win.on('show')` 推 `balanceCache` | 恢复边沿回放 `AppState.balance.last` | 页面即时有数 |
| 取数（main.js 进程内直调） | sidecar `node cli.js balance-fetch --app-dir …`（stdout 末行 JSON） | 单轮取数 |
| `win.webContents.send('dsh:balance')` | `app.emit("balance-changed")`（垫片转 `dsh-balance-changed`） | 页面推送 |
| ipc `dsh:balance-refresh` | command `balance_refresh`（回放缓存 + 触发后台刷，返回 Null） | 刷新触发 |
| 菜单 toggle-balance 后立即刷 | `menu_action` toggle 分支 `trigger_fetch` | 开关即时生效 |

环境变量（`HTTPS_PROXY`/`DSH_HOME`/`DSH_TAURI_USERDATA` 等）由 Rust 侧整表
继承到 sidecar 子进程——两侧同口径（contracts/data-flow.md §5.1）。

---

## 2. 出站载荷契约（`dsh:balance` 事件 detail）

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

`periodTables` 与 `priceTable` 的一致性不变量（同一次推送内）：
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

主进程每次推送携带**全模型价目表** `priceTable`（同一时刻求值）。客户端：

1. usage 携带 `model` 且 `priceTable[model]` 存在 → 按会话真实模型计价，
   title 标注「按会话模型 X 单价估算」；
2. usage 携带的模型不在价目表 → 回退默认模型，title 标注「…会话模型 X 不在价目表内」；
3. usage 无模型字段（会话投影未透传）→ 回退默认模型，title 标注
   「…会话实际模型未知」——绝不假装精确。

---

## 4. HTTP 安全边界（fetchJson）

| 规则 | 行为 |
|------|------|
| 首跳认证 | 调用方显式配置的端点**始终携带** Authorization（本地 http 代理场景依赖此行为） |
| 重定向认证 | 仅「同主机（hostname + port 相等，默认端口归一化）且 源/目标均为 https」保留；跨主机、https→http 降级、http 重定向一律剥离 |
| 剥离可见性 | 剥离动作经 `onAuthStripped` 回调并入结果 `warning`，主进程记日志 |
| 重定向上限 | ≤ 5 跳，超出拒绝「重定向次数过多」；畸形 Location 拒绝「重定向地址无效」 |
| 总超时 | 跨重定向共享 deadline（slow-drip 无法靠空闲超时保活绕过） |
| 空闲超时 | socket 空闲即中断（第二道防线） |
| 体积上限 | 按**字节**累计（Buffer.length），多字节内容不绕过 1MB |
| 明文提示 | http:// 端点照常支持（README 承诺的代理场景，issue #78），但结果携带明文传输 warning |

---

## 5. 编排语义（balance-scheduler）

| 机制 | 语义 |
|------|------|
| 节流 | `maybeRefresh()` 距上次实际发起不足 30s 跳过；`maybeRefresh(true)`（重试/用户显式触发）绕过 |
| in-flight 去重 | 并发触发共享同一次请求：后触发者等待同一结果，杜绝重复 HTTP |
| latest-sequence 守卫 | 只有最新一次请求的结果写入 cache / 推送；旧请求（慢失败/旧数据）完成即丢弃。在当前 API 下为防御性兜底（in-flight 去重已杜绝并发多请求，`seq === latestSeq` 恒真、无独立触发路径），其可达的 `!stopped` 分支经单测覆盖 |
| 重试 | 失败后指数退避 30s→1m→2m→5m 封顶；每次新失败按最新计数重排定时器；成功清零；`disabled` 不重试 |
| 单一 now | 每次刷新取一次 `new Date()`，prices / priceTable / peak / at 全部同刻 |
| 设置单读 | 每次刷新只读一次 settings.json（余额开关与 OpenCode Go 开关同源） |
| 生命周期 | `start()`（启动刷新 + 3 分钟轮询）/ `stop()`（清定时器，幂等），应用退出前调用 |

### 触发点清单（与改造前一致）

| 触发点 | 入口 | 节流 |
|--------|------|------|
| 应用启动 | Electron `start()` / Tauri 轮询环首刷（延后 500ms） | 强制 |
| 3 分钟轮询 | Electron `maybeRefresh()` / Tauri 轮询环周期触发 sidecar 取数 | 是 |
| 窗口显示（托盘恢复） | Electron `maybeRefresh()` / Tauri 恢复边沿（回放缓存 + 强制刷） | 是 |
| 会话回合完成 | Electron session-watcher `maybeRefresh()`（Tauri 线 session-watcher crate 尚处 Phase 0，暂由 3 分钟轮询覆盖，接入后补挂） | 是 |
| 页面加载后 dock 挂载（IPC） | `maybeRefresh(true)` / Tauri `balance_refresh`（回放缓存 + 后台刷，只触发不返回数据） | 强制 |
| 菜单「显示余额」开关 | Electron `maybeRefresh(true)` / Tauri `trigger_fetch` | 强制 |
| 失败自动重试 | 编排器内部定时器（Tauri 线由下轮轮询覆盖——sidecar 单轮进程无定时器） | 强制 |

---

## 6. 凭据与配置读取

- `readCredentialLine`：只匹配**列 0 顶层键**（嵌套段同名键不读）；
  支持引号值、行尾注释、正则元字符键名。
- `readActiveModel`：逐行状态机锚定 `agent-default-model` 段（前缀相似段不误匹配），
  段内取缩进最浅的 `model:`（深层嵌套同名键不优先）。
- 优先级链不变：环境变量 > `.credentials.yaml`（OpenCode 另有 CLI auth.json 兜底）。

## 7. 端点与定价

- 余额端点：`DEEPSEEK_BALANCE_URL`（完整 URL）> `DEEPSEEK_API_BASE`（拼
  `/user/balance`）> 官方 `https://api.deepseek.com`。
- OpenCode Go 端点：`OPENCODE_USAGE_URL`（代理/镜像场景）>
  `https://opencode.ai/zen/go/v1/usage`。
- 定价：2026-08-17 起峰谷定价（北京**工作日** 9:00-12:00 / 14:00-18:00 全价，其余半价），
  此前旧版固定价；`isPeakHour` 在峰谷生效节点之前恒为 false，保证 chip 与
  计价档一致。
- **周末全天空闲**（官方 2026-08-23 00:00 北京时间起）：周六/周日全天按空闲价计。
  `balance.js` 的生效门槛常量 `WEEKEND_OFFPEAK_SINCE_UTC` 与
  `assets/plugins/dsh-offpeak` 的 `WEEKEND_OFFPEAK_EFFECTIVE_FROM`（issue #158 产物）
  指同一北京日历日，口径以两侧交叉一致性测试守住
  （`scripts/test/unit-balance-weekend.test.js` 从 offpeak 源码正则读常量对拍）。
  该规则**不溯及既往**：门槛之前的周末仍按旧窗口判高峰。
- **切换瞬间价格跳变**：按小时切价是官方计费规则本身（整点切换、无比例过渡）。
  issue #168 修复后，展示层不再「用当前价重算历史」——各时段增量在发生时即按
  当时价目锁定（见 §2.1），跨整点不再跳变；chip 与价目仍由「单一 now」保证自洽。

## 8. 安全与隔离（测试约定）

- 全部自动化测试（单测 / 集成 / 竞态 / 真实 Electron 渲染）**绝不触碰真实
  `~/.dsh`、真实 API 端点与本机已安装的 DSH Desktop**：临时目录、回环 mock
  server、注入式依赖、harness 自有 userData。
- 集成测试使用的 TLS 自签名证书仅存在于 `scripts/test/fixtures/`，测试进程内
  设置 `NODE_TLS_REJECT_UNAUTHORIZED=0` 并在退出前恢复。
- 渲染层测试的 harness 入口为 `scripts/test/renderer-balance-harness/`，
  隐藏窗口、零网络、退出即清。

## 9. 缺陷 → 修复映射表

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
| 🟢 低 | sessionCost/money 零单测覆盖 | 新增 95 项断言 + 存量 dock 17 项，合计 112 项（含真实 Electron 渲染层验证） |
| 🟢 低 | readActiveModel 正则可匹配更深嵌套 | balance.js 逐行状态机（缩进最浅优先） |
| 🟢 低 | settings 双读 | balance-scheduler.js 每次刷新单次 `getSettings()` |
| 🟢 低 | IPC 双通道重复投递 | IPC 只触发不返回；client 只消费事件；`bridgePushedOnce` 防重复触发 |

## 10. 维护约定

- 价目表变更：只改 `balance.js` 的 `PEAK_PRICES` / `LEGACY_PRICES` /
  `PEAK_PRICING_SINCE_UTC`，客户端零改动（`priceTable` / `periodTables` 自动同步）。
- 峰谷规则变更（窗口、生效门槛）：`balance.js` 的 `isPeakHour` 与
  `assets/plugins/dsh-offpeak` 的 `isPeak()` **必须同步**改，两侧口径由
  `unit-balance-weekend.test.js` 的源码交叉断言把守；历史门槛类常量只能新增、
  不可改写（不溯及既往）。
- 新增模型别名：加入 `PRICING_MODELS`。
- 新增网络边界参数：一律走 `fetchJson` options（timeoutMs / maxRedirects /
  maxBodyBytes），默认值集中在 `balance.js` 顶部常量。
- 新增出站字段：先更新本文档 §2 契约，再改代码；可选项向后兼容。
- 测试命令（全部隔离，测试只使用临时目录与回环地址，绝不触碰真实 ~/.dsh）：
  `node --test scripts/test/*.test.js scripts/test/*.test.mjs`、
  `node scripts/test/verify-balance-dock.cjs`；
  Tauri 侧 `node --test ../dsh-tauri/sidecar/cli.test.js`（balance-fetch 单轮
  取数）与 `cargo test`（Rust 编排环，commands/balance.rs）。Electron 时代的
  `verify-balance-renderer.cjs`（依赖 Electron 运行时）已随壳退役删除，
  渲染层覆盖由 `verify-balance-dock.cjs` / `edge-client.test.js` 承接。

# MCP ToolSearch 设计：工具定义的延迟加载

> 状态：已实现并落地（v1）。本文回答「做什么、为什么这么做、边界在哪」。
> **第二轮起的历次修正（对抗式审查 / 独立审查后）见 §12**——那里记录每条被证据推翻的论据与相应的代码改动。
> **没做完 / 没验证的事见 `.tasks/mcp-tool-search/OPEN-ITEMS.md`**——skills 三个 RPC 的运行中生效性、
> 隔离 profile 主题色异常、lightvela 网关拒 `role:"developer"`、夹具 MCP 双 spawn。
> `add` / `removeServer` / `installBuiltins` 的运行中生效已在第五轮修好（§12.3 #24）、
> 第六轮用真 Include + 真重启终验（§12.3 #26 与 OPEN-ITEMS 的 O1R）。

## 1. 目标与非目标

**目标**：MCP 服务器的工具定义不再无条件全量注入每个会话的模型上下文，改为默认延迟、按需搜索加载——复刻 Claude Code ToolSearch 机制，**插件层实现，不等 harness 原生支持**。

**非目标（v1 明确不做）**：

- 不改 harness 内核（`@deepseek-ai/*`），只消费其公开 API
- 不做 embeddings 语义搜索（BM25 足够，见决策 5）
- 不做跨会话的"已加载"持久化、加载集的 LRU 驱逐
- 不做 auto 阈值模式（可延迟定义占上下文 10% 才激活，Claude Code 的 `ENABLE_TOOL_SEARCH=auto`）——v1 用 per-server 显式开关，阈值模式留 v1.1
- 不改模型系统提示词（引导放在工具描述里，见决策 6）

## 2. 问题

两个后果，都有官方数据支撑：

- **上下文税**：工具定义每个请求都在上下文里。Anthropic 博客实测：5 个服务器 58 个工具 ≈ 55K tokens，加 Jira（~17K）逼近 100K+；内部见过 134K。启用 ToolSearch 后 77K → 8.7K（85% 降幅），且不破坏 prompt caching（延迟工具完全不在初始 prompt 中）。
- **选错率**：一次加载超过 30-50 个工具，工具选择准确性显著下降（Claude Code 文档原话）。启用后 Opus 4 从 49% → 74%，Opus 4.5 从 79.5% → 88.1%。

本仓现状更极端：一个接满 MCP 的会话（jshook 735 + firecrawl/chrome-devtools/serena/exa…）上下文里挂着 300+ 个工具定义，远超选错率恶化区间。DSH 现状是 MCP 工具全量注册、每步全量注入。注意：DSH **有一套原生延迟加载传输层**（见 §3.1），但对 MCP 工具今天不可用——没有生产方。

## 3. 可抄的资产（Claude Code，v2.1.72 逐字原文）

社区逆向镜像（Claude Code 本体未开源，npm 打包产物可读，权威源头是官方博客+文档）：

- 工具描述 bulk 部分（[dsdanielpark/claude-code-system-prompts](https://github.com/dsdanielpark/claude-code-system-prompts) `tool-description-toolsearch-second-part.md`）：

> Until fetched, only the name is known — there is no parameter schema, so the tool cannot be invoked. This tool takes a query, matches it against the deferred tool list, and returns the matched tools' complete JSONSchema definitions inside a `<functions>` block. Once a tool's schema appears in that result, it is callable exactly like any tool defined at the top of the prompt.
>
> Query forms:
> - `"select:Read,Edit,Grep"` — fetch these exact tools by name
> - `"notebook jupyter"` — keyword search, up to max_results best matches
> - `"+slack send"` — require "slack" in the name, rank by remaining terms

- 引导模式：**两处并存，不是二选一**。① 提示侧索引：系统提示里**只列出全部延迟工具的名字**（v2.1.7x 系统提示原文："Deferred tools appear by name in `<system-reminder>` messages. Until fetched, **only the name is known** — there is no parameter schema, so the tool cannot be invoked."；Piebald-AI 镜像 `tool-description-toolsearch-unfetched-tool-note.md`，v2.1.231 是同一句）。⚠️ **更正（2026-10-18）**：此处早前写"名字 + 一行用途"，与所引镜像不符——镜像里没有用途；把用途或它的截断版放进 prompt 是**我们自己加的**，已于同日删除（见 `.tasks/mcp-tool-search/TUNING-DECISIONS.md` F1/F5、Q1）。② 就近显式提醒：v2.1.221 系统提示 claude-in-chrome 段原话 *"If the `mcp__claude-in-chrome__*` tools are deferred (must be loaded via ToolSearch before use), load every tool you expect to need first."*。**修正（审查后）**：早前此处写"Claude Code 实际也不用总则"是以单处引语概括全局——Agent SDK 官方文档明确推荐总则式引导："You can also add a system prompt section listing available tool categories. This gives the agent context about what kinds of tools are available to search for."（code.claude.com/docs/en/agent-sdk/tool-search → Optimize tool discovery）。我们的实现两者都有（`tool-search:guidance` 静态总则 + `tool-search:catalog` 活库存），与官方建议一致。
- 官方博客（[advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use)）：开箱提供 regex 与 BM25 两种搜索后端；工具定义 >10K tokens 才值得用；<10 个工具不划算。
- 官方文档：每次搜索默认返回最多 5 个；加载的工具在后续轮次保持可用，直到压缩后才需重搜。

三个最值钱的设计决策，直接继承：

1. **"未加载 = 不可调用"写进描述**——明确告诉模型延迟工具只有名字、无参数 schema，掐断凭记忆幻觉调用；
2. **查询语法三形态**（`select:` 精确 / 关键词 top-N / `+server` 限定命名空间）；
3. **返回结果即完整定义**——模型见到即可用，零学习成本。

**完整闭环是三段式（本轮新取证）**：① 系统提示侧列出全部延迟工具的**名字** + unfetched 注解（“Until fetched, only the name is known — there is no parameter schema, so the tool cannot be invoked”，Piebald-AI 镜像 `tool-description-toolsearch-unfetched-tool-note.md`，v2.1.231）；② 工具描述本体（查询语法 + 返回格式）；③ **动态 system-reminder**（`system-reminder-deferred-tools-available.md`，v2.1.218）：“The following deferred tools are now available via ToolSearch. Their schemas are NOT loaded — calling them directly will fail with InputValidationError. Use ToolSearch with query 'select:<name>[,<name>...]' to load tool schemas before calling them:” + 名字清单。

**我们比 Claude Code 快一步**：Claude Code 即便收到 availability 提醒，也还要再发一次 `select:` 搜索才能调用（它的 schema 加载是二次的）；DSH 的方案是搜索命中即掀罩——完整 schema 在结果文本里、工具同时在原生工具列表里，**下一轮直接调用，无需二次 select**。描述文案必须体现这个差异（不能教模型“再搜一次”）。

**一处被迫偏离**：Claude Code 的模型“知道全部延迟工具的名字”（索引在系统提示里）；DSH 的工具描述静态、无提示通道，活库存改为查询形态获取（决策 9）。

**模型依赖性的处置（范围决策）**：Claude Code 官方只支持 Opus 4 / Sonnet 4 / Haiku 4.5 及以上，社区确认其在 Kimi 等模型上直接拒绝开启。DSH 模型无关，但**不做模型门控**——机制保证完善与优雅，模型配合度问题由用户用全局开关自行处置（`DSH_MCP_TOOL_SEARCH=off` / per-server `defer: false`）。内部实测仍要做，但目的从"决定是否默认开"变为"验证机制在真实模型阵容上可运行"。

## 3.1 原生传输层核对（复核修正：早期"内核零延迟加载"的结论是错的）

DSH 内置了一套完整的工具延迟加载**传输层**（0.2.0-rc.2，四包协作）：

| 层 | 包 | 机制 |
|---|---|---|
| 定义 | `dsh-tools` | `defineTool({ deferLoading: true })`；schema 投影带 `deferLoading` 字段 |
| 组装 | `dsh-system-prompt` | toolProvider 的 schema 原样透传进 `assembly.tools` |
| 记录 | `dsh-session` | `request/header` 记工具全集；`developer/message` 带 `tool-addition` / `tool-removal` 块（引用 header 里的完整定义，`deferLoading` 必须为 true） |
| 折叠投影 | `dsh-llm` | `projectToolUpdates`：按历史位置重建 provider 声明——"显式延迟的基线工具首次 addition 后才可用" |
| 自动记账 | `dsh-agent-loop` | 工具集相对基线变化时**自动**追加 `developer/message`（source: `tool-registry`，`index.js:1233` 附近） |

**为什么 v1 不用它（三个原因）**：

1. **没有生产方**：全库确认（PowerShell 全量复核）没有任何包注册 `deferLoading: true` 的工具；MCP 工具由 `dsh-mcp-client` 注册，它**不支持**这个标记（只有第一方 `defineTool` 能设）。
2. **tool-addition 引用必须在 header 里**：被遮罩的 MCP 工具不在 `request/header` 中，就没有可引用的定义——原生激活链路对 MCP 工具今天走不通。
3. **路由依赖**：不支持 toolUpdate 的路由会剥掉 flag、全员立即可用（`dsh-llm` 原注释："Unsupported routes need immediately available tools"）——原生机制在那类路由上等于没有。

**两个对设计有影响的结论**：

- **意外收获**：agent-loop 的自动记账意味着我们的"掀罩"（工具新出现在组装集里）会被原生机制自动记成 tool-addition——**历史位置一致性由宿主保证，我们不需要自己管**。这消除了一个早期未识别的风险。
- **迁移路径**：两条，主动权都在本插件手里——① 等 `dsh-mcp-client` 支持 defer 选项，本插件的 `defer` 配置与 UI **1:1 映射**即可切换；② **本插件自己当生产方**：`ctx.systemPrompt.tools(provider)` 已验证可注册 tool-schema provider（`dsh-system-prompt/lib/index.js:286-288`，每次组装求值、schema 带 `deferLoading` 透传）——插件可让 provider 先只回报未加载的延迟工具（标 `deferLoading: true`），搜索命中后回报集合增大，agent-loop 自动记 tool-addition 完成原生激活。但必须**按路由门控**：不支持 toolUpdate 的路由会剥掉 flag 全员立即可用（遮罩失效），而路由支持性只有 harness 侧知道——所以 v1 仍走 assembly 过滤路线，native 路线作为路由透明后的切换项。

## 3.2 原生能力分层结论（表面通读后定稿）

把"问题能不能原生解决"按层拆开，每层都以上界通读为依据（不靶向验证）：

| 问题 | 原生能否解决 | 依据 |
|---|---|---|
| 可发现性/引导（模型知道有什么、怎么加载） | **能，纯原生** | `systemPrompt.section()` 动态渲染活库存（`dsh-system-prompt:240-243`）；DSH 自带的 skills 就是同款先例（目录进提示 + 工具按需加载），证明此模式在本 harness 出厂就跑 |
| 激活（命中后让工具可用） | **能，纯原生** | 两条：agent-loop 在 assembly 变化时自动追加 `developer/message` tool-addition（`dsh-agent-loop:1229-1248`）；或插件直接 `session.append("developer/message", …)`（`dsh-session:1441`） |
| 声明-扣留语义（看得见但调不了） | **条件性原生** | `deferLoading` + `projectToolUpdates` 的 offered 集机制（`dsh-llm content.js:290-339`）——但只在模型声明 `toolUpdate`（`LlmModelInfo.toolUpdate`，`'in-history'｜'addition-only'`）时成立；不支持的模型 flag 被剥、全员立即可用 |
| 上下文税/选错率（工具根本不进模型眼前） | **能，但另一层** | prompt 层扣留在不支持的模型上全部失效（进了 `assembly.tools` 就到眼前）；唯一解是让工具不进 assembly——assembly waterfall 过滤（本插件走的路线）或 registry 层遮罩（`tools.restrict`，但遮不到 scope-local 注册） | 
| 模型配合度（会不会主动搜） | **无原生解** | 任何架构都依赖模型调用 `tool_search`；只能实测 + 拒绝自愈兜底 + 按模型设门（Claude Code 自己就用模型白名单） |

**门控缺口（唯一待 harness 的事）**：`toolUpdate` 只在 `prepareCall` 返回的 `preparedCall` 里（`dsh-llm:2222`），session header 不落、无查询 API。混合架构要按模型分流，缺这个干净信号。需求形态：把 `modelInfo.toolUpdate` 落进 `request/header`，或开一个 `llm` 侧的能力查询方法。**在拿到之前，L2 层不可做**（做了就是赌路由）。

**终极架构 = 四层，全部 harness 原生能力**：

- **L0 引导层**（全模型）：`systemPrompt.section` 活库存 —— 对应 Claude Code 的提示侧索引
- **L1 遮罩层**（全模型）：assembly waterfall 过滤 `resolved.tools` —— 上下文税的唯一天花板无关解（`tools.restrict` 是备选，但遮不到 scope-local 注册，见决策 8）
- **L2 声明层**（`toolUpdate` 模型，门控就绪后）：`systemPrompt.tools()` provider + `deferLoading` + 激活 —— 更富语义（名字+描述可见、不可调），可就位后停用对应 L1
- **L3 行为兜底**（全模型）：拒绝自愈（监听 `UNKNOWN_TOOL`，对已知延迟工具自动掀罩）。**不做模型能力门控**（范围决策）：模型配合度由全局开关交用户自处置

**v1 = L0 + L1 + `tool_search` + L3**——不是妥协，是四层里当前可做的三层；L2 等门控信号。

## 3.3 提供方能力与生态实现查证（外部调研）

**提供方原生延迟加载能力**（2026-07 查证）：

| 提供方 | 能力 | 形态 |
|---|---|---|
| Anthropic | ✅ 有 | Tool Search Tool + `defer_loading` + `tool_reference`（2025-11 beta，`advanced-tool-use-2025-11-20`）；官方数据 77K→8.7K、Opus 4 49%→74% |
| OpenAI / Azure | ✅ 有 | Responses API `tool_search` + `defer_loading` + namespace 级延迟（gpt-5.4+；[Azure 文档](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/tool-search)）：hosted（服务端搜索）与 client-executed（应用侧搜索回传 `tool_search_output`）两种模式；延迟的 function 模型仍可见 name+description，延迟的是 parameter schema |
| DeepSeek | ❌ 无 | 无原生延迟协议（其 function calling 仅常规形态） |
| Gemini 等 | 未发现 | — |

**生态已有实现（两个，均为 agent 层、提供方无关——与本文 L1 结论一致）**：

- [studyzy/dsh-lazy-tools](https://github.com/studyzy/dsh-lazy-tools)：`ctx.tools.restrict()` 遮罩 + `tool_search` + `defer_execute_tool`；激活写入 agent 的 allow 集、下一轮生效；**仅全局工具**（README 明示"已注册在 agent 自身作用域的工具始终可见"）；无名字目录；resume 后从零（自述为避免写未注册的会话事件类型）；配置为 CodeBuddy 风格 `Defer(...)`/`NoDefer(...)`。
- [lordqyxz/dsh-tool-search](https://github.com/lordqyxz/dsh-tool-search)：**与本文 L0+L1+L3 设计高度收敛**——常驻目录 section（系统提示每工具一行：名字+截断目的，注册表不变则字节稳定、变化重建）、BM25（名字+描述+参数文本，CJK 字符二元分词）、命中直调无 dispatcher、单调 guard 自愈、阈值 inert（threshold 15 / maxResults 5 / maxDiscovered 20）、**resume 用 presentation meta + 会话日志持久化**（解决了本文"resume 从零"的行为边界）；基准：120 工具 14632→3417 tokens（省 76.6%）、top-1 100%。

  ⚠️ **2026-10-18：我们没有照抄它的"名字+截断目的"**。上面那个形状被实测证伪：27 个真实工具里
  56% 的描述会被 110 字符切掉，其中 80% 的尾巴带 `only`/`when`/`unless` 这类约束词，而近义工具
  （`read_file` / `read_text_file` / `read_media_file` / `read_multiple_files`）恰恰靠尾巴区分。
  现在目录**只列工具名**。证据与取舍见 `.tasks/mcp-tool-search/TUNING-DECISIONS.md` F1/F5/F9/Q1。

**对本设计的含义**：核心机制（目录 section + registry 遮罩 + 自愈）已获第三重复核（Claude Code + 两个生态实现），且带了基准数据。本文与参考实现的**真实差异**（早前"高度收敛"的说法不准确，粒度不同）：① **延迟粒度**——我们是 per-server defer（未列入的服务器天然稳定），它是"全延迟 + `alwaysVisible` 白名单"（默认白名单含 `skill`/`ask_user_question`/`report`/`submit_*`/`structured_output*`，说明它连内置工具一起延迟）；② **项目族**——两个生态实现都只做全局族，我们的 assembly 遮罩天然覆盖项目族（见决策 8①）；③ **MCP 管理 UI 集成**——现有实现均为配置文件驱动；④ **活配置**——我们的 deferServers/serverNames 是函数形态，开关改了下一次组装即生效，不需要重装。

**照抄之外必须自己补的两件事**（早前遗漏，审查后补上）：
- **MCP server instructions 也要遮**。`dsh-mcp-client` 给每个服务器注册一个 `mcp:<server>` prompt section（order 3100，`interpolate:false`，默认上限 `maxInstructionBytes` 32768 字节），只遮 tool schema 不遮它，延迟收益会被这八分之一上下文吃掉。参考实现用 `deferToolGuidance` 处理同类问题；我们对"还有未发现工具的服务器"清空该段，全部发现后恢复。（项目族不受影响：项目连接的 section 注册在兄弟作用域，本来就不进 agent 的 prompt——已实测。）
- **目录必须有体积上界。** 目录**只列工具名**（2026-10-18 起）：实测 27 个真实工具的名字均长 33.3 字符，每行 `- <name>` 约 35 字符，于是 300 行 ≈ 10.6k 字符 ≈ 2.6k tokens。旧形态（名字 + 110 字符用途）同样 27 工具实测 3401 字符，是现在的 **3.6 倍**，而且 56% 的描述会被切——**体积不是删它的理由，切掉区分性信息才是**。
  > ⚠️ **2026-10-26 更正（§12.11）**：上界保留，但**单位与形态都变了**。① 预算是**字符**不是行数
  > （`maxCatalogChars`，只算名字行）——一行可能 7 字符也可能 38 字符，行数表达不了成本；
  > ② 目录改成**按服务器分组 + 裸名**，因为全名每行都重复 `mcp__<server>__`。同构夹具（7 台真实服务器名 /
  > 456 工具）实测：旧口径 300 行全名 = 12,896 字符且隐藏 142 个，新口径 12,500 字符**列出全部 456 个**
  > （名字行 10,976 / 整段 11,690）。`maxCatalogLines` 已删除，写进配置会显式报错并给换算。
  >
  > ⚠️ **2026-10-26 二次更正**：**默认值取消** —— `maxCatalogChars` 缺省 = **不截断**（全部列出），
  > 只有用户显式写正整数才启用。理由不是"目录很便宜"，而是**与"没有这个功能"的基线比**——
  > 这是本条唯一该用的参照点，拿它和旧的上限比会得出相反的结论（2026-10-26 审查时我自己犯过这个错）。
  >
  > 口径（两个都是实测，不是一个外推）：完整定义 **442.04 字符/工具**（v1.8.0 发布说明记录的一台
  > 360 工具真实服务器 = 159,136 字符）；目录 **25.64 字符/工具**（本节 456 工具实测 11,690 字符）。
  > 两者比例**恒为 17.2×**，与工具数无关：
  >
  > | 工具数 | 常驻 schema 全量 | 只列名字的目录 |
  > |---|---|---|
  > | 360 | 159,136 字符（≈40k token） | 9,229 字符（≈2k token） |
  > | 456 | 201,572（≈50k） | 11,690（≈3k） |
  > | 1,200 | 530,453（≈133k） | 30,763（≈8k） |
  > | 3,000 | 1,326,133（≈332k） | 76,908（≈19k） |
  >
  > 128k 窗口在约 **1,158 个工具**处就被常驻 schema 吃光，而那时目录只占 ≈7k token——也就是说这类
  > 用户**只有靠本功能才跑得起来**。所以"不截断"最坏也只是"那个本来跑不起来的会话的 1/17"：
  > 上限在这条曲线上没有保护作用，只有省钱的边际作用，而省的是一个已经付得起的人的钱。
  > 截断的代价仍是**静默的**（模型拿到半张地图，可能据此对用户说"没有这个能力"），机制
  > （注水分配 / I6 / 截断日志）因此保留给想自己压上下文的人，默认关闭。
  >
  > **API 边界变化（记下来，别当内部细节）**：导出的 `catalogSectionText` / `flatCatalogText` 对"配置里没有
  > 这个键"的语义从**预算 0（一个都不列）** 变成**全部列出**。仓库内调用点都传 `resolveRuntimeConfig` 的结果，
  > 所以没有实际影响；但如果将来有人拿原始配置直接调这两个函数，"漏传键"会从"列不出东西"变成"列全部"。

**策略决策（B：差异化，不做全自研）**：引擎层“稳”不求新——查询语法照抄 Claude Code 三形态、BM25/CJK 参数对照 lordqyxz 实测调、resume 用其 presentation meta 方案（消除本文“resume 从零”边界）；集成层“精”——per-server defer 开关进服务器列表 UI（生态零 UI）、项目族支持（生态空白，见决策 8①）、与 exclude 合并、加载状态与节省量面板可见。明确不做：重新发明搜索算法、自造 dispatcher、发明新查询语法。前提：三样“更多”（UI、项目级、管理器联动）做得出来，否则诚实放弃而非造平庸复制品。

## 4. 总体架构

```
插件安装（一次）
  ├─ ctx.tools.register({ name: "tool_search", ... })          # 全局注册搜索工具
  ├─ ctx.systemPrompt.section(promptSection('tool-search:guidance', …))   # 静态总则（interpolate:false）
  └─ ctx.on('system-prompt/assemble', …, { prepend: true })    # 唯一的订阅
     # 不需要 agent/created 预热、tools/change 脏标记、agent/disposed 清理：
     # 视图按 revision 自愈，标志是要人记得置的，漏置就是静默失配（见 §12 #5）

每次组装（agent-loop 每步都调 assemble）
  └─ viewFor(agent)：读 schemas(agent) → 算 revision → 不变就复用缓存，变了才 buildToolSearchView
     │   view = { managed, catalog, catalogText, managedByServer, deferring }
     │   fail-open：算不出来就返回 INERT_VIEW（全量可见）并记账，绝不把抛错逃进宿主
     ├─ 过滤 resolvedAssembly.tools：只摘 managed 里未发现的（黑名单，不动外来工具）
     ├─ 清空"还有未发现工具的服务器"的 mcp:<server> 指令段（返回新对象，不 mutate）
     └─ 追加 promptSection('tool-search:catalog', view.catalogText)   # 活库存，interpolate:false

模型调用 tool_search(query)
  └─ execute(args, exec)：
       ├─ exec.agent 拿本会话作用域（无 agent 则显式失败，不静默）
       ├─ 索引来源 = `agent.ctx.tools.schemas(agent)`——**不 restrict 所以它就是全量**
       │   （§7 表格里"会话视图不能当索引源"是 restrict 时代的残留，已作废）
       ├─ 过滤已在 managed 划分里做过：per-server 下限 + 聚合阈值 + defer 集合
       ├─ BM25(name + description + 参数文本) 匹配，返回 ≤ max_results 个完整 schema
       └─ 命中即并入 discovered（临界区纯同步：prepareState 到 return 之间无 await）
          # 工具清单每步从 assembly 重建 ⇒ 下一轮模型请求即含这些工具（原生 function calling）
          # 工具新出现会被 agent-loop 自动记 tool-addition，历史位置一致性由宿主保证（§3.1）
```

配置来源（两个族合成唯一一张表，`serverDeferTable`）：
- **全局族**：loader 条目（profile patch 里的 mcp 条目，`defer` 经 schemastery 非严格 merge 活着到达 `entry.options.config`）
- **项目族**：共享连接记录上的 `defer` 活值（项目连接是 `connectionCtx.plugin()` 建的，**不在 loader 树里**，所以必须有第二个来源——见 §12 #4）

归属只能按 serverName（工具名只编码它）：任一同名条目 defer，该名字就 defer。


## 5. 关键决策

| # | 决策 | 理由 | 否决的替代 |
|---|---|---|---|
| 1 | **插件层实现，不等原生** | 原生排期不可控；且内核只供机制不供策略是既定设计哲学——`dsh-tools` 提供 register/restrict/schemas/guards 全套原语，workspace exclude（按服务器 deny + tools/change reconcile）证明策略层就是插件的领地 | 提 harness PR：排期不可控，且越界 |
| 2 | **功能默认开启，双层开关可关** | 内部实测通过后默认开——这正是 Claude Code 的姿势（默认启用 + `ENABLE_TOOL_SEARCH=false` 总开关）。逃逸通道两层：每服务器一个 `defer: false`（描述质量差、或每轮必用的小工具集不适合延迟），全局一个总开关（env `DSH_MCP_TOOL_SEARCH=off`，形态照抄 Claude Code）。默认开的前提是内部实测覆盖 DSH 真实模型阵容——DSH 模型无关，弱模型可能不执行搜索 | 默认关闭等灰度：用户拿不到收益，且开关本就提供逃逸通道。**小工具集自动豁免**：工具数 ≤10 的服务器整体不参与延迟（官方原话 <10 工具"less beneficial"，白付一次往返）——纯计数判定，不依赖上下文窗口。它与聚合阈值（`threshold: 15`）正交：前者是服务器属性，后者是会话属性，两个门槛都过才真正延迟 |
| 3 | **defer 标志放 profile 级（每服务器一条）** | defer 是服务器属性（工具数、描述体积），不是项目属性；workspace exclude 已占"本项目不想要"的语义，两者正交、可合并（见 §6） | workspace 级：重复配置面，且与 exclude 语义重叠 |
| 4 | **会话内加载常驻到会话结束** | 遮罩是每次组装的纯函数，随会话销毁自然清零，无需额外簿记；DSH 没有 Claude 的"压缩后失效"对应物 | 照抄压缩失效：无对应机制。源码调研结论：① 全库确认 DSH 无任何压缩/淘汰/上下文窗口机制（agent-loop 的 compact 仅是流式折叠内部概念），Claude 那招没有对应物；② 显式 LRU 的机械可行性已验证——淘汰只是一次重算视图，反复摘戴无未验证坑。上限框架（不设魔法数）：按"它替代的东西"定，= 全量集的 10-20%（jshook 735 → 40-75 个，最坏仍省 80-90%），或加载集估算 token ≤ 15-20K；反方平衡（上限小了反复搜）：LRU 只在工作集真超上限时才抖，而那正说明该服务器太核心——用 per-server 关整个常驻，两个旋钮配合覆盖两种 regime。v1 不设硬上限，只设 `maxDiscovered`（无界发现会让请求 schema 长回全量基线），实测曲线后再加淘汰 |
| 5 | **BM25 本地实现，不引依赖** | 仓库依赖极简（smol-toml/yaml/zod），BM25 约百行；匹配字段 name+description 是官方明确约定 | 引 bm25 库：依赖治理成本；embeddings：v1 过度 |
| 6 | **引导双通道：静态总则 section + 活库存目录 section（主）+ 工具描述（辅）** | **两条通道都已验证**：① `ctx.systemPrompt.section({ name, order, text })`（`dsh-system-prompt/lib/index.js:240-243`）注册静态总则（"是什么/怎么用/未加载不可调用"）；② 活库存目录在 `system-prompt/assemble` waterfall 里追加（`text` 可以是函数、每次组装求值——`typeof section.text === "function" ? section.text(context)`），因为它必须按**本 agent 的可见集**渲染，全局 section 做不到。名字级 token 成本（比 schema 便宜一个量级）、落在系统提示缓存前缀上（库存不变则字节稳定——行序用 code-unit 比较保证，见 §12 #3）。工具描述退居"是什么/怎么用"，不承载库存。**两条通道都必须 `interpolate:false`**：目录正文嵌第三方 MCP 描述（见 §9） | 只放静态描述（本设计早期方案）：库存常新做不到、`select:` 教不了真名 |
| 7 | ~~面具戴在既有有界等待之后~~ **已作废** | 原方案用 `restrict({deny})` 遮罩，才需要"等连接就绪再戴面具"的时序安排（复用 `waitForConnectionReady` 的 5s 预算）。改走 assembly 过滤后（决策 8）**每次组装都过滤**，晚连服务器的工具在它首次出现的那次组装里就被滤掉，根本没有"先放行后补遮罩"的窗口，也就不需要这个时序安排 | — |
| 8 | **遮罩做在 assembly 过滤层，不做 registry restrict** | 参考实现（lordqyxz/dsh-tool-search `src/index.ts`）采用的机制更优，已采用：① **两族一机制**——`system-prompt/assemble` waterfall 里过滤 `resolved.tools`，全局族与项目族（scoped 注册）通吃，restrict 对 scope-local 抛错的问题不存在；② **窗口不存在**——每次组装都过滤，晚连服务器的工具在它首次出现的那次组装里就被滤掉，无"先放行后补遮罩"；③ **自愈有指令**——工具不 restrict（保持可解析），`tools.guard` 对"未发现的延迟工具"返回带指引的拒绝（"call tool_search with the exact name 'X'"），比 UNKNOWN_TOOL 裸错好。**修正（审查后）**：早前此处称"DSH 对不可见工具在 guard 之前就返回 UNKNOWN_TOOL"是错的——`prepareExecution` 的 `guardReason`（dsh-tools:3241）跑在 `dispatchToolBody` 抛 `ToolNotFoundError`（:3308；早前写的 :3307 是 `resolveExecution` 那一行）之前，且 `createExecution` 对不可见工具返回 `kind:"ready"`（:3188）。也就是说 restrict 路线**同样**能拿到 guard 自愈；本条的真实优势只有 ①②④⑤，不含 ③；④ **索引源简单**——`schemas(agent)` 即全量（没被 restrict 掉），不需要全局视图+连接视图的绕路；⑤ 与 exclude 天然取交集——exclude 滤掉的工具不在 agent 可见集里，不进 catalog，本机制当它不存在。代价：遮罩完备性依赖"assembly 是唯一模型可见面"（主路径已验证：agent-loop L907 → buildRequest）；**PTC 模式下不成立**——`tools:sdk` section 是独立投影路径（dsh-tools `sdkSection`→`sdkSchemas`），**遮罩是 no-op**，故当时的处置是 PTC 部署下本功能**整体不装配**（见 §12）。
**第九轮修订（重要）**：① 当时写的"遮罩与 guard **双失效**"**只有一半对**——实测 PTC 下 `run_code` 的**嵌套派发**（`parent: exec.token`，dsh-tools:1306）**绕过 `collapses` 但走完整管线含 `guardReason`**，所以 guard 与 `tool_search` 在 PTC 下**都是活的**；真正失效的只有"省上下文"这一项（那正是本功能的目的）。
② 装配判据读 `ctx.tools.modeFor()`（**不传 scope = 部署默认层**），所以"整体不装配"**只覆盖"整个部署是 ptc"**；`dsh-agent-tool-presentation` 让 preset **按 agent** 声明 ptc，于是"部署 native + 某 agent ptc"会**照装**（出货 preset `dsh-web-app/presets/ptc.patch.yml`，Web 设置里两步可达）→ 实测**倒贴 3181 字符/请求**。
③ 修法已定为**裁 `tools:sdk` 文本**（实测 `tools:sdk` 9533→2664，整体真省 3688），失败时兜底退成 per-agent inert view。全套证据见 `.tasks/mcp-tool-search/OPEN-ITEMS.md` 的 O6 与 §12.6 | registry restrict（原设计）：两族两机制、有晚连窗口 |
| 9 | **活库存走 assemble waterfall 追加的目录 section，静态总则走 `systemPrompt.section`** | 目录必须按**本 agent 的可见集**渲染，所以它在 `system-prompt/assemble` waterfall 里追加（`prepend:true` 保证我们的过滤有最终发言权）；静态总则与可见集无关，走普通 `section()` 注册即可。`select:` 所需的真名由目录直接列出。complete-section 部署下目录会被吞（宿主规则：存在 effective complete section 时它成为唯一 prompt section，`dsh-system-prompt:356-361`，**读码确认**——grep 全 test/ 没有覆盖 complete section 的用例，早前写的"已实测"没有支撑），那时模型至少还能靠工具描述主动查 | 库存变化时 dispose+重注册 `tool_search`：工具定义变动触发 `toolsChanged`/新 series（缓存失效），且重注册瞬间的调用会 UNKNOWN_TOOL——风险大于收益 |
| 10 | **loaded 集变更的临界区必须同步** | DSH 支持并行工具调用（agent-loop 并行调度器 `DEFAULT_MAX_PARALLEL_TOOL_CALLS = 10`）；两步 `tool_search` 同轮执行时，若 read-discovered 与 write-discovered 之间有 await，后写覆盖先写 → 前一次搜索命中的工具被重新遮罩（结果文本说"已可用"、工具列表里却没有）。约束：execute 里从取视图到写 discovered 全程无 await（配置读取已由活配置 getter 前置掉） | 加锁/队列：DSH 无现成 per-session 锁原语，自己造轮子；纯同步临界区零成本且足够 |
| 11 | **自愈走 guard 指引拒绝，不走 UNKNOWN_TOOL 观测** | 采用参考实现的机制：工具保持可解析（不 restrict），`ctx.tools.guard` 注册单调守卫——对"在延迟目录里但未被发现"的直调返回拒绝并附指引（"call tool_search with the exact name 'X' as the query, then call it directly"）。已发现的工具直接放行；其他策略（exclude）拒掉的工具不在 catalog 里，守卫不置词——取交集不放宽。**guard 内自动掀罩已评估并否决**：guard 是任意函数，本可以在拒绝前把该名字加进 discovered（"模型都报出确切名字了，替它省一轮搜索"）。否掉的理由是 Claude Code 在拥有远超我们的模型调优经验下，仍然选择"拒绝 + 指引先搜索"（其 system-reminder 原文："calling them directly will fail with InputValidationError. Use ToolSearch with query 'select:<name>…'"）。默认拒绝；若将来要为弱模型开放自动掀罩，应做成显式开关而不是悄悄改默认 | 观测 UNKNOWN_TOOL 结果自愈：需要验证事件可达性，且拒绝信息不可定制。**guard 内自动掀罩**：与 Claude Code 的既定行为相反，且会让"凭记忆幻觉调用"直接变成加载 |

## 6. 与现有机制的合并规则

- **遮罩语义 = 黑名单过滤，不用 deny**：`assembly.tools` 里只摘"本机制管理的且未发现的"（`filterManagedTools`），其余一概不动。刻意不用"稳定集+已发现"的白名单——assembly 里可能有非本注册表来源的工具（其他插件的 toolProvider），白名单会把它们误删。per-server 延迟的语义是"只延迟这些服务器的工具，对别的工具没有意见"。
- **与 workspace exclude 取交集不放宽**：exclude 用 `restrict` 把工具从会话视图去掉，被 exclude 的工具不在 `schemas(agent)` 里 → 不进 `managed` → 既不被我们滤（本来就不在），guard 也不置词。`loaded` 不可能含 excluded 工具。
- **唯一 owner 判定**（沿用 `toolInventory` / `applyWorkspaceRestrict` 的既有规则）：工具名以 `mcp__<server>__` 为前缀且**唯一命中**一个服务器名才可归属（`uniqueOwner`）。serverName 含 `__` 时裸前缀匹配会误伤，必须要求唯一；歧义时落稳定侧，不延迟。
- **同名即同延迟**：归属只能按 serverName（工具名只编码它），所以任一同名条目 defer，该名字就 defer。DSH 0.1.5 起各注册作用域允许同名，这不是冲突。
- **tool_search 自身永不被延迟**：`partitionSchemas` 把它直接放稳定侧；它是插件全局注册的原生工具。

## 7. 集成点契约

已验证（读码确认，行号为当前 node_modules/源码）：

| API | 契约 | 位置 |
|---|---|---|
| `tools.restrict({ deny })` | per-agent 作用域遮罩，返回 disposer；**只管全局工具**：未知名与 scope-local 名都会抛错；scoped 注册不受影响、restrictions 相交。**本实现不用它**（决策 8①：遮不到项目族） | `dsh-tools/lib/index.js:2888-2910` |
| `tools.register(definition)` | 全局层注册，返回 disposer；定义**必填 `output { schema, render }`**（`render` 须为函数，缺了直接 TypeError）；`defineTool({ name, description, parameters, execute, output, timeoutMs? })`，完整签名实现时按 schema.d.ts 钉死 | `dsh-tools/lib/index.js:2878-2887`、`schema.d.ts:248` |
| `tools.schemas(scope)` | 模型可见 schema；被 restrict 的工具"reads as absent"——**会话视图只含可见工具，被 restrict 遮掉的工具不在内**。本实现不 restrict，所以 `schemas(agent)` 就是全量索引源（见决策 8④）；§4 架构图里"会话视图不能当索引源"那句是 restrict 时代的残留，已作废 | `dsh-tools/lib/index.js:3023`、`view()` 2959-2985 |
| `readConnectionTools(ctx, entry)`（插件自有） | 项目族工具的唯一枚举通路（工具在共享作用域层，全局视图看不到）：只用宿主公开读面 —— `schemas(scopeKey)` 一次拿名字（全量深拷贝，只在**换代**时付）、`get(name, scopeKey)` 逐个拿定义；稳态靠**代次哨兵**（缓存一个定义对象的身份，mcp-client 每次 tools/list 同步都整批重建定义，哨兵换人即换代）短路成一次 `get()`。`view()`/`schemaOf()` 是宿主 private 方法（TS `private`，运行期可达但非契约），不碰。同时按**定义身份**对账，重连/就地重载后把旧定义换掉（只按名字会把死工具留在会话里）。返回值只有 `{definitions, error, failed}`；`readScopedToolSchemas()` 只给面板（5s 轮询）用 | `lib/workspace-runtime.js:763-845` |
| 每步重建工具清单 | assembly 每步重算（agent-loop preStep）→ 新遮罩对运行中会话**下一轮请求即生效** | `dsh-agent-loop/lib/index.js:907` |
| `agent/created` / `tools/change` / `agent/disposed` | **本功能一个都不订阅**（见 §4）。列在这里只为说明"为什么不需要"：视图按 revision 自愈，预热与脏标记都是冗余门，标志是要人记得置的 | `lib/workspace-runtime.js:1408`（MCP 运行时自己的订阅） |
| agent-loop 自动记账 | 工具集相对基线变化时自动追加 `developer/message`（tool-addition/removal）——掀罩后的历史位置一致性由宿主保证，插件无需自理 | `dsh-agent-loop/lib/index.js:1233` 附近、`dsh-llm` `projectToolUpdates` |
| `ctx.effect(() => () => cleanup, label)` | 生命周期归属 | `lib/workspace-runtime.js:1390` |
| `exec.agent` | 调用所属 agent，`agent.ctx` 即作用域上下文 | `dsh-tools/lib/types/index.d.ts:228-229` |

实现时待钉（不影响设计）：`defineTool` 的完整选项签名（已知 `output { schema, render }` 必填，其余字段实现时按 `schema.d.ts` 钉死）；`exec.agent` 为 undefined 的 agent-less 执行路径可达性（可达则显式失败并说明，不静默降级）。搜索索引按会话构建（`schemas(agent)`，含本会话投射的项目工具），不用全局视图。

**两处刻意不照抄 Claude Code**：① 返回格式不用 `<functions>` XML——DSH 走原生 function calling，直接返回 JSON schema 数组 + 一句"以上工具已在你的工具列表中可用"；② 无压缩失效语义（决策 4）。

## 8. 配置与 UI

- **配置**：**两个族**的服务器条目都有 `defer: boolean`（默认 `true` = 延迟；置 `false` = 该服务器工具常驻）。全局族走 profile patch（`PLUGIN_OWN_CONFIG_FIELDS`，mcp-client 非严格 merge 透传）；项目族走 `.dsh/mcp.json`（`specToMcpEntry` 往返）。`defer` **不进** `toMcpClientConfig`——它不是 mcp-client 字段，进指纹会让"改个延迟开关"触发一次重连；它作为活值存在共享连接记录上，每次挂载刷新。
- **全局开关**：env `DSH_MCP_TOOL_SEARCH=off` 一键回退全量注入（形态照抄 Claude Code `ENABLE_TOOL_SEARCH`）；置关时所有服务器视同 `defer: false`，本插件所有延迟逻辑短路。
- **UI**（面板是本职）：服务器行加"延迟加载"开关（全局与项目两族都渲染）；徽标只标"延迟"状态。会话维度"已加载 N/M"v1 可省。**徽标与详情行不带 token 估算**——那个数字的精确感是假的（我们不知道用户装了什么 MCP，schema 大小差一个量级），而给了数字用户就拿它做决定，于是它在主动误导；留下的判断材料是真实数据（工具数）与真实规则（per-server 下限）。整套撤除的记录见 §12.3 F4。

## 9. 风险

- **晚连服务器没有窗口期**：assembly 过滤**每次组装都跑**（agent-loop 每步 assemble），晚连/重连的服务器工具在它首次出现的那次组装里就被滤掉。视图按 revision 判失效，不需要 dirty 标志，也就不存在"忘了置标志导致静默不遮"这一类失配。
- **静默全量不可观测**：视图算不出来时 fail-open 退回全量可见（§4），此时必须记账到日志——否则"没挂上"发生时用户无感知。当前记 `ctx.logger.error`；与 exclude 一样进面板错误账是后续可做项。
- **`tool_search` 常驻的固定成本**：它全局注册、每个会话都在（无 defer 服务器的会话也付这份描述 token，约 350）。Claude Code 按阈值条件注入；DSH 无对应通道（工具描述静态），接受这笔固定税，描述保持精简，无延迟服务器时返回明示文案。
- **complete-section 吞掉目录**：宿主 assemble 的规则是"存在 effective complete section 时，它成为唯一 prompt section"（`dsh-system-prompt:356-361`，**读码确认**：`completeSection === void 0 ? transformed.sections : [completeSection]`；全 test/ 没有覆盖这条的用例，早前写的"已实测"没有支撑）——若某部署/preset 注册了 complete section，我们的目录 section 会被静默丢弃，但**遮罩仍然生效**（`{...transformed, sections:[completeSection]}` 保留过滤后的 tools）。兜底：工具描述里的静态引导仍在，模型至少还能主动查。
- **section 每组装渲染的成本**：已按 revision 缓存——工具可见面内容或任一影响划分的配置变了才重建视图与目录正文，否则两次组装产出**字节一致**的目录（实测 735 工具：revision 3.08ms / 重建 52.8ms）。目录行序用 **code-unit 比较**而不用 `localeCompare`：后者依赖 ICU 与区域，混合大小写会给出不同序，"库存不变则字节稳定"就不成立（宿主 `compareToolNames` 用同一理由避开它）。超大规模仍在预算外截断（§12.11 起按**字符**预算、**整行原子**、按服务器**注水**分配，任何服务器都不会整台消失），`select:` 真名不足时用查询形态补。
- **第三方文本绝不能进插值**：目录正文嵌 MCP 工具描述，必须 `interpolate:false`——否则描述里一个 `{{var}}` 就让每步 `renderPrompt` 抛 `unknown prompt variable`，agent loop 每步失败。宿主给 `mcp:<server>` 指令段和 `tools:sdk` 设的就是这个（mcp-client:739、dsh-tools:2749），我们照做。
- **MCP server instructions 是另一笔上下文**：`dsh-mcp-client` 给每个全局服务器注册 `mcp:<server>` section（order 3100，默认上限 32768 字节）。只遮 tool schema 不遮它，延迟收益会被吃掉。当前实现：对"还有未发现工具的服务器"清空该段，全部发现后恢复。项目族不受影响（项目连接的 section 注册在兄弟作用域，本来就不进 agent 的 prompt——已实测）。

**行为边界（有意的语义选择，非缺陷）**：

- **resume 状态恢复（已解决）**：发现状态事件源化——`tool_search` 的结果在 **presentation meta** 里带累积发现列表（`protocol: 'dsh-tool-search/v1'` + `allDiscoveredTools`），render 时剥掉（不泄露进提示词）；重建的 agent 从会话日志恢复。**恢复走受支持的 `session.deriveMessages()`**（扫 `role==='tool'` 消息里的 protocol JSON），不用 `snapshotEvents()`——后者在 dsh-session 上标注 `@deprecated … new calls are prohibited`（:1358/:1370）。两条路径已用真 Session 验证等价，且派生消息方案更短：不需要 tool/call↔tool/result 配对，也没有 ptc-dispatch 特例。上限淘汰用 `maxDiscovered`（最旧先让位，≥ maxResults），但**淘汰下限会抬到本次返回的名字数**——`select:` 一次能返回任意多个名字，硬按 `maxDiscovered` 砍会把这一批里靠前的工具当场重新遮罩，而结果里的 `instruction` 正写着"按名字直接调"（第七轮独立审查实测复现，见 §12.3 #32）
- **子 agent 独立**：子 agent 继承同一 assembly 过滤（waterfall 按 assembly 的 context.agent 跑），发现集独立——它用到的工具自己搜一遍
- **PTC 模式**：assembly 遮罩需同步整形 `tools:sdk` section（参考实现的 `shapeSdkSection`）。**未补，因此 PTC 部署下本功能整体不装配**并在日志明说。
  **第九轮修订（推翻本条的两处论据）**：① "半失效（模型看着完整 schema 却调用即错）"**不成立**——PTC 下模型的**原生函数清单里只有 `run_code`**（`wireSchemas` 过滤到一条），模型**没有机会**发出 model-direct 调用；而 `run_code` 内的**嵌套派发**（`parent: exec.token`）**绕过 `collapses` 却走完整管线含 guard**，所以 `tool_search` 与 guard 在 PTC 下**都能用**。真正坏的只有"省上下文"这一项。② "PTC 部署下整体不装配"只覆盖**部署级** ptc（判据读 `modeFor()` 不传 scope）；preset 可以**按 agent** 声明 ptc，那种组合会**照装并倒贴**（实测 +3181 字符/请求，出货 preset 两步可达）。修法见 §12.6 与 OPEN-ITEMS 的 O6：**裁 `tools:sdk` 文本**（实测整体真省 3688 字符），失败兜底退成 per-agent inert view。
- **`agent/created` 监听器必须吞错**：宿主把该串行监听器的抛错当作否决这次会话创建（dsh-agent:472）。**已通过删订阅解决**——预热是冗余的（assemble 必定早于第一次模型请求，guard 必定早于第一次工具执行），删掉它比给它加 try/catch 更彻底。剩下的 assemble / guard / execute 三个入口共用同一个 fail-open 边界：视图算不出来就退回全量可见并记账，绝不让抛错逃进宿主。
- **`tool_search` 作为新全局工具的审批面**：某些权限模式下首次调用可能弹审批；描述里写清用途可降低困扰。
- **模型不搜就调**：DSH 是模型无关的 harness（DeepSeek 及第三方模型），指令遵循弱的模型可能无视搜索、凭记忆调延迟工具。缓解：guard 拒绝里带**确切查询串**（模型照抄即可）+ 目录里列出全部真名；**默认开启前必须用真实模型阵容实测**；观测靠工具调用日志。
- **agent-less 执行**：搜索工具拿不到作用域时显式失败，禁止"返回 schema 但不掀罩"的静默半生效。
- **阈值模式缺输入**：上下文窗口在 harness 内部是流动的（`dsh-llm` adapter context → agent-loop `preparedCall.context.contextWindow`），但**插件侧的公开查询通道未验证**；故 v1 不做 auto 阈值，通道验证后可在 v1.1 补（届时照抄 Claude Code 的 10% 规则）。

## 10. 测试计划（node --test）

> ⚠️ **两组数字在仓库里没有可复现产物**（独立审查核对过，别当成已验）：
> ① `lib/tool-search-runtime.js` 与 `lib/tool-search-index.js` 的注释里的词干化收益
> （serena「核心工具进 top5 67%→78%、top10 94%→100%」，以及 runtime.js 里同一组数的另一种表述
> 「top5 漏掉 33%」）与「多花约 570 token」；② runtime.js/maxResults 注释里的「两个真实 MCP 工具集
> （serena 28 工具 / chrome-devtools 32 工具）」。这些数**只出现在注释里**（本文档没有引用），
> 而 `scripts/` 下没有重跑它们的脚本、test/ 也没有对应用例，两个工具集的查询词表也不在仓库里。
> 要坐实得补一支脚本（连 serena / chrome-devtools、固化查询词表与"核心工具"判据）或把原始记录挂进 `.tasks/`。
> 在补上之前，这几条只能算**一次性的手工测量**，`maxResults: 10` 与 `stem: true` 的默认值就建立在它之上。

- `tool-search-index`（纯函数）：三种查询语法解析（含 `+` 约束对含 `-`/`_` 服务器名）、BM25 排序 fixture、max_results、空查询/无命中、CJK 分词、平手 code-unit 序
- `tool-search-runtime`（mock tools service）：`uniqueOwner` 歧义、`partitionSchemas`、`filterManagedTools` 黑名单语义、`guardDecision`、`clampDiscovered`、`discoveredFromMessages`（含非本工具/错误结果/非 JSON）、`viewRevision` 纯度、`buildToolSearchView`、`activeMaskedServers`、`catalogSectionText`（**只列名字**、code-unit 序、**字符预算 + 整行原子（I6）**、**分组裸名**、描述一个字都不进目录）、`maskInstructionSections`（不 mutate）、装配层（只订阅 assemble、目录 interpolate:false、指令段清空、fail-open、agent-less 显式失败、活配置、revision 缓存）
- 挂载边界：宿主视图抛错时零干预（fail-open），不炸会话
- **项目级 defer 端到端**：`projectMcpServers` + `serverDeferTable` 把项目族并进同一张表（`workspace-runtime` 用例）
- **PTC 模式不装配**（`tool-search-wiring` 用例）
- **真宿主集成**（`tool-search-real-host`，真 cordis + 真 SystemPrompt + 真 ToolRuntime + 真 dsh-scope）：遮罩同时覆盖全局族与项目族、目录 `interpolate:false`、第三方描述含 `{{var}}` 不抛错、guard 拒绝未发现直调并经真 dispatcher 放行、发现后工具回到 assembly 且指令段恢复、库存不变目录字节稳定、`+` 约束对含连字符服务器名生效。**这一类用例不可用手写夹具替代**——§12.1 的两个阻塞 bug 都是夹具绿、真宿主炸
- 配置：`defer` 字段读写往返不丢（全局 patch 与项目 `.dsh/mcp.json` 两路）
- 回归锚点：workspace exclude / workspace-runtime 现有用例全绿

## 11. 实施顺序（TDD，一步一验）

1. ~~`lib/tool-search-index.js`~~——**已完成**（查询三形态 + BM25 + CJK 二元分词 + 精确全名置顶）
2. ~~`lib/tool-search-runtime.js`~~——**已完成**（assembly 黑名单过滤 + guard 自愈 + 目录 section + 搜索工具注册）。assembly 过滤机制**天然覆盖项目族**（assembly 含投射进会话 own 层的项目工具，目录从 `schemas(agent)` 构建亦然）——原计划的“项目族投射过滤”独立步骤被吸收
3. ~~配置字段 `defer` + UI 开关~~——**已完成**：profile patch（`PLUGIN_OWN_CONFIG_FIELDS`，mcp-client 非严格 merge 实测透传）与 workspace 配置（`specToMcpEntry` 往返）双路落盘；`lib/tool-search-config.js` 配置桥（**全局族 loader 条目 + 项目族共享连接**两个来源合成一张表，`DSH_MCP_TOOL_SEARCH=off` 总开关）；运行时可迭代配置（函数形态，视图按 revision 判失效即生效）；UI：编辑表单复选框 + **开启前预告**（只说 per-server 规则：≤10 工具“不参与延迟”，>10 显示“N 个工具”；会话级聚合阈值行级看不到，不说）+ 详情行状态 + 列表行徽标（虚边框 t-defer，只标“延迟”）。token 估算曾在这里出现过两轮，已整套撤除，理由见 §12.3 F4
4. 真机验证：接 jshook（735 工具）实测延迟前后上下文差量与搜索命中率；用真实模型阵容验证“模型会搜索”

每步跑 `node --test` 最窄子集，全绿再进下一步。

## 12. 第二轮：对抗式审查后的修正

一轮独立审查把每个结论按"读到的 / 推断的"重新取证（真 cordis + 真 Loader + 真 dsh-scope + 真 dsh-mcp-client + 真 dsh-system-prompt + 真 dsh-session 实跑）。结论：**架构路线成立且几乎是唯一解**，但实现层有 2 个会静默破坏功能的缺陷、1 个违反本仓既有不变量的缺陷、1 个"UI 承诺而运行时不交付"的缺陷。以下按"错论据 → 改动"记录。

| # | 被推翻 / 遗漏的事实 | 证据 | 改动 |
|---|---|---|---|
| 1 | `+<server>` 查询形态对含 `-`/`_` 的 serverName **完全静默失效** | 约束只取一个拉丁词 `/^\+([a-z0-9_-]+)/`，而工具名按非字母数字切词 → `nameTokens.has('chrome-devtools')` 恒 false。内置目录 47 个 serverName 里 11 个含 `-` | `parseQuery` 的约束段改走**和名字同一套** `tokenize`，切成词集合要求全部命中（`tool-search-index.js`） |
| 2 | 目录 section 未设 `interpolate:false`，第三方工具描述里一个 `{{var}}` 就让**每步组装抛错** | `renderPrompt` → `interpolate` 抛 `unknown prompt variable`（实测复现）。宿主给 `mcp:<server>`、`tools:sdk` 都设了 `interpolate:false` | 模块内统一 `promptSection()`，永远带 `interpolate:false` |
| 3 | 目录行序用 `localeCompare`，"库存不变则字节稳定"**不成立** | 混合大小写时 locale 序与 code-unit 序不同（实测）。宿主 `compareToolNames` 用同一理由避开它 | 换 code-unit 比较（`tool-search-index.js` 排序 + 目录行序） |
| 4 | **项目级 defer 是彻底的静默 no-op**，而 UI 三处都在渲染它 | `toMcpClientConfig` 不转发 `defer`；且项目共享连接是 `connectionCtx.plugin()` 建的，**不进 loader 树**，`allMcpEntries` 看不见（实测：`loader.create()` 的条目在，`connectionCtx.plugin()` 的不在） | `workspace-runtime` 导出 `projectMcpServers(ctx)`，`tool-search-config` 把两个族合成唯一一张 `serverDeferTable`；`defer` 做成连接记录上的活值（不进指纹，所以切开关不触发重连） |
| 5 | `agent/created` 监听器未吞错，违反本仓既有不变量 | 隔壁 `installAgentRuntime` 有 try/catch 并注释"宿主把抛错当作否决会话创建"（dsh-agent:472 明写）；设计自己的测试计划也列了这条却未实现 | **删掉该订阅**：预热是冗余的（assemble 必早于首次模型请求，guard 必早于首次工具执行）。同时删掉 `tools/change`、`agent/disposed`——4 个订阅收敛为 1 个 |
| 6 | MCP server instructions（每服默认上限 32KB）完全没遮 | `dsh-mcp-client:736-743` 注册 `mcp:<server>` section（order 3100）。参考实现用 `deferToolGuidance` 处理同类问题，我们漏了 | 视图带 `managedByServer`，assemble 时对"还有未发现工具的服务器"清空该段（返回新对象，不 mutate），全部发现后恢复 |
| 7 | 阈值语义 UI 与运行时不一致；决策 2 承诺的 per-server 豁免**没实现** | 运行时是聚合 `managed.size >= 15`，UI 行级用 `toolCount < 15` | 两条规则都实现且分工明确：per-server `> minServerTools(10)` 才可延迟（行级文案只说这条），聚合 `>= threshold(15)` 才启用机制（会话级，行级不说） |
| 8 | 用了宿主标注"new calls are prohibited"的 `snapshotEvents()` | dsh-session:1358/1370 双处 `@deprecated` | 改走受支持的 `deriveMessages()`，扫 protocol JSON。真 Session 验证两条路径等价，且净减代码（去掉配对与 ptc-dispatch 特例） |
| 9 | 目录无体积上界、每次组装全量重渲染 | 实测 735 工具：`catalogSectionText` 11.1ms/次、正文 100,914 字符 | 加 `maxCatalogLines`（默认 300）+ "另有 N 个" 提示；视图按 revision 缓存（实测 revision 3.08ms vs 重建 52.8ms）。**2026-10-18 重算口径**：100,914 / 735 = **每行 137 字符**，证明那次的"100,914 字符"是**含用途**的旧形态（名字 33 + 分隔 + 110 用途）；names-only 同规模约 26k 字符（每行 35.3，见 TUNING-DECISIONS F9）。`maxCatalogLines` 维持 300 不变——外推不足以改数。**⚠️ 2026-10-26 已被 §12.11 取代**：真因不是"默认值偏小"，而是**单位选错了**；预算换成字符（`maxCatalogChars`，只算名字行）、形态改分组裸名，同一预算从"列 314 个"变成"全部列出"；**随后默认值也取消**——缺省不截断，只有显式正整数才启用 |
| 10 | `estimateSchemaTokens` 的 chars/4 对中文低估 2.7–4× | 算术推断（本机无 DeepSeek tokenizer），但方向确定 | 改 CJK 感知：CJK 字符按 1、其余按 `charactersPerToken`；纯 ASCII 走快路径，数值与旧版一致。**⚠️ 这条已被 §12.3 #23 推翻并作废**：估算器整套撤除， chars/4 与 CJK 粗估都不再存在。留下的判断材料是真实数据（工具数）与 per-server 规则 |
| 11 | PTC 模式下遮罩与 guard **双失效**，设计只承认前者 | `tools:sdk` 是独立投影路径（dsh-tools `sdkSection`→`sdkSchemas`）；且 `collapses` 直接拒 model-direct 调用，guard 根本不跑 | PTC 部署下**整体不装配**并在日志明说。要支持需先补 `shapeSdkSection`，那是另一个改动。**⚠️ 第十轮已推翻本条的后半**：guard **没有**失效——`run_code` 的嵌套派发（`dsh-tools:1306` 的 `parent: exec.token`）绕过 `collapses` 但走完整管线含 `guardReason`，真 token 实测四向对照通过；"整体不装配"也被取代（改为 per-agent 判据 + 裁 `tools:sdk`）。见 §12.7 与 `.tasks/mcp-tool-search/DECISIONS.md` |
| 12 | 决策 8③/11 引的"UNKNOWN_TOOL 先于 guard"是错的 | `prepareExecution` 的 `guardReason`（dsh-tools:3241）在 `dispatchToolBody` 抛 `ToolNotFoundError`（:3308；早前写的 :3307 是 `resolveExecution` 那一行，复核时按安装包逐行核对）之前；`createExecution` 对不可见工具返回 `kind:"ready"`（:3188） | 改文档论据。结论不变（assembly 过滤仍是对的），但真实优势只剩 ①②④⑤ |
| 13 | 决策 6/9 引的"Claude Code 不用总则"是以偏概全 | Agent SDK 官方文档明确推荐 "add a system prompt section listing available tool categories" | 改文档论据。实现两者都有，与官方建议一致 |
| 14 | §3.3 "与 lordqyxz 高度收敛"言过其实 | 粒度不同：我们 per-server defer，它全延迟 + `alwaysVisible` 白名单（连内置工具一起延迟） | 改为逐条列真实差异 |

### 12.1 第三轮：真宿主集成测试又抓出两个（都是"夹具全绿、真宿主炸"）

前两轮所有用例都是手写夹具。补了 `test/tool-search-real-host.test.mjs`（真 cordis + 真 SystemPrompt + 真 ToolRuntime + 真 dsh-scope，跑真 `assemble()` 与真 `tools.execute()`）之后**当场**抓出两个问题，而且都是阻塞级：

| # | 问题 | 为什么夹具全绿 | 证据 |
|---|---|---|---|
| 15 | **重构时丢了 section 的 `order`** → 真实宿主里插件加载即抛 `prompt section "tool-search:guidance" order must be a finite number`，整个 MCP 面板起不来 | 夹具的 `systemPrompt.section()` 只是 push 进数组，不校验；wiring 夹具压根没提供 systemPrompt，那条路径从未被执行 | dsh-system-prompt:241（`if (!Number.isFinite(section.order)) throw`）。**这是我引入的回归**，681 个全利用例无一发现 |
| 16 | **`select:` 查询在真实宿主里直接报错**：结果带 `score: Infinity`，而 `JSON.stringify(Infinity)` 是 `null`，被 `snapshotToolValue` 判为"非无损 JSON" → `INVALID_TOOL_OUTPUT` | 夹具直接调 `definition.execute()`，绕过了宿主的输出校验 | dsh-tools:3542-3544（`validateJsonSchemaValue(tool.output.schema, detached, "value")` → `ToolOutputError`）。主查询形态完全不可用 |

**改动**：`promptSection(name, text, order?)` 补回 order（只有走 `systemPrompt.section()` 注册的那条需要）；工具结果**不再返回 `score`**——它是内部排序产物，排序已由数组顺序表达，模型不需要这个数，也就不该让它有机会变成 `null` 污染输出。

**教训（比两个 bug 本身更值钱）**：手写夹具会系统性地漏掉"宿主对输入的校验"这一类契约。凡是本功能的输出要进宿主管线、或本功能要调宿主入口的地方，都必须有一条真宿主用例。现在 `tool-search-real-host.test.mjs` 守住的包括：`section()` 的 order 校验、`renderPrompt` 的插值、`tools.execute()` 的完整管线（createExecution → pre-execute waterfall → guardReason → dispatch）、输出 schema 的无损 JSON 校验、assemble 的 context 形状（`{agent, scope: agent, signal}`）。

**另一处修正**：真宿主测试还确认了 `assemble` 的 context 里**没有 `agent` 字段时本功能按 fail-open 早退**（不遮）。宿主 `assembleContextFor` 恒返回 `{agent, scope: agent, …}`，所以生产路径总有；但测试最初就是漏传了 `agent`，结果"看起来没遮住"——这条行为现在是显式文档化的。

### 12.2 第四轮：真机复跑与 RPC 生效性审计

| # | 被推翻 / 遗漏的事实 | 证据 | 改动 |
|---|---|---|---|
| 17 | **引导段无条件注入**：`tool-search:guidance` 在启动时一次性注册，文案是 "Most tools are deferred… call tool_search…"。当用户把所有服务器的 `defer` 关掉（`view.deferring` 为 false）时，`## Deferred tool catalog` 不出现，这段仍在——在教模型去找一批并不存在的延迟工具 | 真机实测（isolated profile，serena `defer:false`）：`system/message` 只有 7375 字符、既无目录也无引导段缺失的对照；修复前同形状的会话里引导段在、目录段不在 | 引导段的注入改成**有条件**：在 `system-prompt/assemble` waterfall 里按 `view.deferring` 决定是否清空它的文本（`maskGuidanceSection`）。条件判断放组装层而不是注册层——defer 是活状态（面板开关、服务器晚连都会改），`section()` 却是启动时一次性；视图按 revision 自愈、每次组装重算，所以这里才跟着活状态走，且不新增任何订阅。清空文本而非删段：宿主 `renderPrompt` 本就 `.filter(text => text.length > 0)`，效果等于不注入而段列表形状不变，与 `maskInstructionSections` 清空 `mcp:<server>` 指令段同一种做法。**"没事情可做就不碰 assembly"**：段里没有引导段时原样返回，`maskInstructionSections` 的 `size===0` 早退同此——低于阈值的组装仍是同一个对象 |
| 18 | **`add` / `removeServer` / `installBuiltins` 只写盘，运行中进程毫无变化** | 真 loader 夹具实测（`ctx.plugin(Loader)` + `ctx.loader.create()` 造真 mcp-client entry）：`add` 后 `loader.entries()` 不变、无新连接，note 已如实说"重启后生效"；`removeServer` 后 patch 里没有该服务器，但 entry 还在、工具还在、子进程 pid 没变；`installBuiltins` 后 patch 里追加了 `exa`，loader 里没有对应条目 | 文案已如实（上两轮）。**本条停摆理由在第五轮被证伪并已修复**，见 §12.3 #24：生产形状可以零新依赖复现，"缺 cordis-plugin-include/group 所以无法复现"是事实错误 |
| 19 | **`setDisabled`/`enable`/`disable`/`reconnect` 是真热加载**（此前的"疑似"落地为判定） | 同一真 loader 夹具：`disable` 后 `entry.disabled=true` 且工具从全局视图消失；`enable` 后工具回来；`reconnect` 后 pid 集合整体换新且 `echo()` 仍可执行 | 无（代码已走 `entry.update()` / `entry.fiber.restart()`，含失败回滚）。审计结论进报告，未改代码 |

**架构结论（不变）**：assembly waterfall 是当前 DSH 下唯一能同时遮罩全局族与项目族的注入点——toolProvider 只能 append 不能移除 dsh-tools 的贡献（dsh-system-prompt:286-288/319-333），`restrict` 的 `restrictableNames` 结构性排除 agent own 层（dsh-tools:2970-2978），项目工具正是注册在 own 层（workspace-runtime:550）。`prepend:true` 经 cordis `unshift`（cordis:336）保证我们的过滤有最终发言权。

**结构收敛**：九个问题里七个同根——缺少一个"按 revision 算一次的自包含视图对象"。修正后所有派生状态（managed 划分、per-server 计数、目录、目录正文、遮罩集、阈值判定）挂在同一个 `buildToolSearchView` 产物上，三个调用点只做"取视图 + 自己那一件事"，取视图包在同一个 fail-open 边界里。副作用是删掉三个订阅、一处死状态（`tokenCount`/`stableNames`）和一个"要人记得置"的失效机制。

### 12.3 第五轮：独立审查后的整改（F1–F4 修透 + O1 落地）

一轮独立审查把前四轮的每项修复重新取证，结论是"真修了，但没修透"：F1/F2 是补丁式正确（症状修了、根因原样保留），F3 留了三处残留，F4 删得基本干净但留下一个永假守卫与 i18n 漏洞。审查轮还用真 loader 夹具端到端实测出了 O1 的正确形状，**推翻了两条此前写进 OPEN-ITEMS 的停摆理由**（"缺 cordis-plugin-include/group 所以复现不了生产形状"、"dsh-fs/dsh-home-paths 不在依赖树里"——两者都是事实错误）。下表按"错论据 → 证据 → 改动"记录本轮整改。

| # | 被推翻 / 遗漏的事实 | 证据 | 改动 |
|---|---|---|---|
| 20 | **F1 的三边比对对"均匀缺失"结构性失明**。`setDeferAll` 的原始 bug 形态是 index.js / typert.js / client.js **三边同时**缺，而三边同序比对在那种形状下照样绿（当时只有 manifest 的精确计数 34≠35 会红）——OPEN-ITEMS 里"三边比对守住了它"只对不对称退化成立，那句话是错的 | 审查轮变异实验：把 `setDeferAll` 从三边同时删掉 → 三边比对测试**绿**，只有 typert-manifest 计数红 | 补**第四边**：`McpManagerGateway.prototype` / `SkillsManagerGateway.prototype`（纯导入即可枚举，无需起 Context）。新断言"原型上每个方法都必须出现在三份清单"让均匀缺失直接红；仅内部使用的方法（`setDisabled`）显式登记并说明理由。变异复验：三边同删时新断言红、三边比对绿 |
| 21 | **F2 的 managed 字段清单实缴五份手抄**（一份常量 + 四处手抄）。漂移实验：往常量加一个 `futureField` → 712 个用例全绿，而 round-trip 实测"写出 v1、读回 `undefined`"——静默丢失、零测试覆盖 | 审查轮逐一核实五处：`MANAGED_CONFIG_FIELDS`（唯一真相源）、`entrySpec` 读侧 9 字段、`makeEntry` 10 字段、`warnUnsupported` 的 known 集合、`index.js:1481` `installWorkspaceBuiltins` 10 字段 | 四处全部改引常量（`entrySpec` 的 `transport` 特例显式跳过并注明理由）；known 集合从两份字段常量派生；`installWorkspaceBuiltins` 改用 `builtinSpec()`（`mcp-config.js` 里本来就为这件事存在的函数，此前没复用）。补一条**表驱动 round-trip 测试**（遍历常量本身，每个 MANAGED 字段写进 patch 再读回必须相等）——它让上面的漂移实验变红 |
| 22 | **F3 的三处残留**：① 项目作用域 ≤6 服务器时整个控件行（含"全部延迟"按钮）不渲染——而项目作用域恰恰是延迟开关的第二个写入口，"唯一入口"在项目小列表下不存在；② 计数口径分裂（客户端按 `filtered`、Host 按 patch 全量），同一次交互出现两个数；③ `ListFooter` 的 `action` 槽 + 4 条 `.dsh-mcp-foot-action` CSS 是死代码，而 docstring 还指示后人往底栏加第二个入口 | 审查轮子审查者抓到、已核实代码路径；计数口径两侧源码对照 | ① 门分成两道：控件本身照旧按数量收，动作行只要有 `toolbarAction` 就渲染（新增 `.dsh-mcp-filters.bare` 单列靠右）；② `deferAllState` 的输入从 `filtered` 改成 `servers`（当前作用域全量），与 Host 的 `state.byName` 作用面一致；③ 删槽位 + 4 条 CSS + 改 docstring，`panel-css-invariants` 加一条"死槽位连样式一起删干净" |
| 23 | **F4 的删除留了三样**：一个**永假守卫**（`tool-search-wiring.test.mjs` 守 `/estimateSchemasTokens/`，真名是 `estimateSchemaTokens`，差一个 s——即使有人用真名把估算器加回来，这条也永远绿）；5 个在用字符串没有英文条目（含主按钮"全部延迟"/"取消全部延迟"，英文界面主按钮显示中文）；6 条死词条 | 审查轮抽查 + grep 实证；712 个全利用例一条都没抓到 | 正则改成真名（守"不许再加回来"）；词典补 6 条 EN（本轮实测是在用缺英 6 条、死词条 8 条——比审查报告数的 5/6 各多一条，`'中文'` 与 `'已开启（工具经 tool_search 按需加载）'` 也被新测试抓出来）；parity 测试**扩到 `t()` 调用点**（此前只覆盖表驱动标签），同时守"缺英文"与"死词条"两个方向，并要求译得动（`t(key) !== key`） |
| 24 | **O1 的两条停摆理由是事实错误，正确形状已端到端实测**。"复现不了生产形状"不成立：`EntryTree` 由已安装的 `cordis-plugin-loader` 导出，手写一个最小子类（`[Service.init]` 里 `root.update(固定条目列表)`）注册进 `ctx.loader.builtins.include` 就能搭出生产形状，**零新依赖**。"缺的只是那个带 `[Service.init]` 的 group 包装"也与事实相反——可用的那个（`Group`）一直在已安装的 loader 包里且导出 | 审查轮真 loader 探针 V1–V7：根部 `loader.create({id,name,config})` 后条目立即可见、工具连上、`list()` 报 `managed:true, connected`、**patch 文件不被根部创建改写**（根部 `tree.write()` 是 no-op）；`ctx.loader.remove(id)` 后条目移除、夹具进程退出（哨兵文件为证） | `add()` / `installBuiltins()`：writePatch → `await ctx.loader.create({ id: patch 行 id, name: MCP_NAME, config: entryConfigOf(spec) })` **根部创建**（不用 `'include'` 子树：那条路触发 `Include.write()` 把含 patch 插入条目的整个 root.data 写回 base 配置，下次启动重复 insert）；`removeServer()`：writePatch → `entry.parent.remove(entry.options.id)`。三条路共用同一个失败回滚形状（抽成 `rollbackLiveChange`：patch 写回原版本，回滚也失败就抛 AggregateError）。新测试 `test/real-host-loader.test.mjs` 用真 Loader + 真 ToolRuntime + 真 mcp-client + 真 stdio 子进程覆盖：连上、工具活、`managed:true`、子进程退出、create 失败回滚 patch |
| 25 | **`update()` 改 env 时，重连后的进程拿到的是 `!!js` 字面量而不是环境变量的值**（审查清单外，本轮实测发现） | 真 loader 探针：patch 里的 `MARKER: !!js process.env.HOME ?? ""` 经 include 子树物化后子进程拿到 HOME 的真值；同一条配置经 `manager.update()` 改 env 后重连，子进程拿到的是字符串 `!!js (process.env.HOME ?? "")` | loader 的 `interpolate` 只求值 `{ __jsExpr }` 对象、**raw 字符串原样透传**。`entryConfigOf()` 因此先把内部 `!!js <expr>` 转成 `{ __jsExpr: <expr> }`（递归进对象与数组），`add`/`installBuiltins`/`update` 三条路共用。`entry.options.config` 于是与生产条目同形（盘上 `!!js`、内存 `__jsExpr`），`reveal()` 的 `resolveLiveConfigValue` 本就是为这个形状存在的 |
| 26 | **`ctx.loader.remove(id)` 对 include 子树条目是静默 no-op**（审查清单外，本轮实测发现） | `EntryTree.remove()` 先用完整 id `include:<id>` resolve 出条目，再把**同一个完整 id** 传给 `EntryGroup.remove()`，而后者按 `this.tree.store[id]` 查的是**局部 id** → 查不到 → `if (!entry) return`。真 loader 实测：remove 不抛错，条目与工具原样留着、子进程不退 | `removeServer()` 改用 `entry.parent.remove(entry.options.id)`（loader 自己"停掉并移除一个条目"的原语，局部 id）。**第六轮已终验**（`test/real-host-include.test.mjs`，真 `cordis-plugin-include@1.0.10` + 真重启）：那条路还有第二个后果——`EntryTree.remove()` 结尾的 `tree.write()` = `Include.write()` 把整个 `root.data`（含 patch 插入的 mcp 条目）写回 base 配置。正向用例全绿（add 后 cordis.yml 一字节不动、重启后无重复、remove 后无残留），反向对照证明走 `ctx.loader.remove()` 会"既没删掉、又把配置写脏" |

**O1 的终验**：`test/real-host-include.test.mjs` 使用真 `@deepseek-ai/cordis-plugin-include` 与匹配宿主组合，执行“创建 → dispose 整个 ctx → 用同一对 cordis.yml / cordis.patch.yml 重启”。结果：`add()` 根部创建后 base 配置字节不变，重启后无重复；`removeServer()` 后二次重启无残留。旧记录中的版本号属于历史基线，不代表当前发布支持窗口。

**本轮新增的两条测试纪律**（都是"撤掉改动看红"实证过的）：① 手写 loader 桩必须补 `create`/`remove`/`entry.parent.remove`——否则三条 RPC 在桩上以 "is not a function" 炸掉，而那不是产品缺陷、是夹具不忠实（与 `entry.update` 同一理由）；② 凡是输出进宿主管线或调宿主入口的路径必须有一条真宿主用例——`test/real-host-loader.test.mjs`（第五轮）与 `test/real-host-include.test.mjs`（第六轮，真 Include + 真重启）就是为此新建的，F1/F2/O1 的三个盲区全是它们或第四边断言抓到的。

**审查清单外顺手修掉的一处同源缺陷**：`skillTargets` 的 effect（client.js:5555）与 `skillHubCategories` 是同一个形状——只处理 `result.ok === false`，RPC 抛错时逃逸成 `Uncaught (in promise)`，而注释同样承诺"拿不到就留空"。审查轮只点了后者的名，两者都修（各有自己的 try/catch 与说明，因为缺省值不同：一个是空候选、一个是原始分类 key）。真机 console 实测两者都会冒出来。

**第六轮（O1 终验）**：用户要求把剩下那个未决项也验掉。新增 `test/real-host-include.test.mjs`，用**真** `@deepseek-ai/cordis-plugin-include`（为此把它加进 devDependencies）复现生产形状，并且真的"重启"——dispose 整个 cordis Context、用同一对 `cordis.yml` / `cordis.patch.yml` 重新起一个宿主。这一轮同时产出三样东西：① 正向证据（`add()` 根部创建后 base 配置一字节不动、重启后无重复条目、`removeServer()` 后无残留）；② 反向证据（走 `ctx.loader.remove()` 会"既没删掉、又把 patch 条目烙进 base 配置"，两个后果同时发生）；③ 一条不许回退的闸门（产品代码改回 `ctx.loader.remove()` 立刻红）。

### 12.4 第七轮：O2 终验（skills 三个 RPC 的投递机制）

OPEN-ITEMS 的 O2 一直写着「三个变更 RPC 的运行中生效性没实测，投递机制是读码推断」。本轮把它验掉：
**推断成立，三个 RPC 都在运行中生效，投递机制就是宿主 watcher → `control.invalidate` → registry 重扫**。
新增一条用例 `test/skills-host.test.mjs` 的 `the three mutating RPCs take effect in the running host,
not only on disk`（夹具 = 临时技能根 × 真 `SkillRegistry` × 真 `dsh-skill-filesystem`，`watch: true`；
引用取自面板自己的 `listSkillViews`，不手写 wire 形状）。

| # | 被推翻 / 遗漏的事实 | 证据 | 改动 |
|---|---|---|---|
| 27 | **「三个 RPC 只写盘、运行中不生效」是未验证的推断，实际成立**。`removeSkill` 是三者里唯一**零覆盖**的一条，而它也是唯一不可逆、且 watcher 侧走 `unlinkDir`（与启停的 `change` 不是同一条代码路径） | 真夹具：启/停、模型面关/开、捆绑停用、捆绑删除（`unlinkDir`）、扁平删除（`unlink`）七条 RPC 全部 `changed:true`，且宿主**新会话视图**（`snapshot()` + `get()`）在 200–300ms 内收敛到盘面（watcher 的 `stabilityThreshold: 200ms` 支配）；删除后目录里真的消失 | 产品代码**不需要改**——原先担心的"只写盘所以要点重启"不成立。用例进 `test/skills-host.test.mjs`，并带三样东西：① 正向七条；② 负对照（同格前后各读一次：旧描述 → 改盘 → 自己翻成新描述，证明探针读的是宿主缓存且缓存会被作废）；③ 反证（`watch:false` 复跑：三个 RPC 都报 `changed:true` 而 registry 永远不变，`removeSkill(bundle)` 目录删掉 3 秒后目录里还报得出那条技能） |
| 28 | **「可以用一个 watcher 判据之外的静默改动做负对照」是错的**。原计划拿「只改技能文件里的描述」当作宿主不会作废缓存的那类事件 | 实测 `isRelevantWatchEvent`（`dsh-skill-filesystem/lib/index.js:541`）收得极宽：根下 `*.md` 的 `add`/`unlink`、一级的 `addDir`/`unlinkDir`、两层以内的 `SKILL.md` 的 `add`/`change`/`unlink` **全算**。改描述这条手工编辑立刻被宿主发现（第一版负对照当场红） | 负对照改成「同一格前后各读一次目录」，不再依赖任何"宿主看不见"的假设 |
| 29 | **宿主的发现缓存只在**目录**一侧陈旧，`get()` 永远是盘上最新的** | 探针实测：刚写完文件，同一刻 `snapshot()` 报旧描述，而 `ctx.skills.get('x').description` 已是新描述（`get()` 每次回 provider 重读正文，`dsh-skill/lib/index.js:250-263`） | 陈旧性断言一律取 `snapshot()` 侧（也正是「模型自动调用哪些技能」依据的那一侧）。拿 `get()` 的量做负对照会恒真——本条用例第一版就是在那里翻车的 |
| 30 | **扁平技能的 wire `entry` 带扩展名**（`probe-flat.md`，不是 `probe-flat`），手写引用会让 RPC 直接抛 `SkillNotFoundError` | 用例第一版手写 `{ entry: 'probe-flat', kind: 'flat' }` → `resolveSkillTarget` 抛「找不到技能条目 probe-flat」；条目名来自 `locateSkill` 的 `matchFlatEntry`（按 realpath 匹配后返回**根下条目名**） | 三条 RPC 的引用改从 `listSkillViews` 现取。这是 §12.1 那条教训的又一例：手写 wire 形状测的是"我以为的契约" |
| 31 | **「watcher 起不来时 provider 的 `complete:false` 会让每次读都重扫」是错的**（写 §12.4 时自己写的结论，随后读码核对时推翻）。缓存命中路径根本不看 provider 的 complete | `SkillRegistry.collect()`（`dsh-skill/lib/index.js:265-297`）：`const cached = this.collectCache.get(key); if (cached !== undefined) return { entries: cached, cacheable: true }` ——**先返回**；`collectFresh` / `collectLayer` 的 `cacheable=false` 只在未命中那条路上产生 | 残留说明改成两段式：**首次读取之前**失败 → 不缓存、真会重扫；**先有过一次可缓存读取、随后 watcher 失效** → 缓存留着、`complete:false` 到不了判定点，消费者**永久**读到陈旧目录。这条是读码结论、仍**未实测** |

**O2 残留（本轮明确没验，不许当成已验）**：
- **生效性的硬前置**是 filesystem provider 的 watcher 真的起来了。它不由挂载触发，而由 `provider.list()` 里的
  `observeRoots()` 拉起（`dsh-skill-filesystem/lib/index.js:93-108`）。所以「某个根上的第一次读取」是这三个 RPC
  在该根上生效的前提。
  ⚠️ **provider 的 `complete:false` 兜不住这件事**（本条第一版写成「退化成每次重扫」，读码核对后推翻）：
  `SkillRegistry.collect()`（`dsh-skill/lib/index.js:265-297`）在缓存命中时**直接返回**
  `{ entries: cached, cacheable: true }`，而 `cacheable=false` 只在**未命中**那条路上由 `collectFresh` /
  `collectLayer` 产生。于是分两种：首次读取之前 watcher 就失败 → 不缓存、每次重扫（`complete:false` 有效）；
  **先有过一次可缓存读取、随后 watcher 失效** → 缓存条目留着、`complete:false` 到不了判定点，消费者可以
  **永久**读到陈旧目录。**读码结论，本轮没实测**（要实测得让 watcher 中途死掉，夹具里没有现成触发手段）。
- **watcher 中途失效后的行为没测**（`handleWatcherError` / `scheduleRewatch`；失效这个动作本身会调
  `queueInvalidation`，所以不是静默的，但之后没有后续文件事件就不会自愈——结合上一条即永久陈旧）。
- 没走隔离 profile 的 UI toggle → 新会话 `/` 列表那条最小路径：程序化夹具拿到的证据更强（直接读 `ctx.skills` 目录，
  而 UI 只能看见渲染结果），且 UI 路径的每一段都已被这条用例覆盖（同一 RPC 入口、同一 `listSkillViews`、同一宿主）。

### 12.5 独立审查（ToolSearch 后续复核）

> ⚠️ **轮次编号不要推断**：§12.3 自称"第五轮"、§12.4 自称"第七轮"，中间没有第六轮小节（第六轮的内容散在 §12.3 正文里）。
> 本节因此**不占轮次号**，只按"这一轮发现了什么"记。

一轮独立复核（真宿主探针 + 真机 UI 测量 + 变异复验）在 ToolSearch 上找出四处，两处改了产品代码、两处只补测试：

| # | 事实 | 证据 | 改动 |
|---|---|---|---|
| 32 | **`select:` 一次取超过 `maxDiscovered` 时，本批靠前的工具被当场重新遮罩，而结果自己写着"按名字直接调"** | 真宿主探针（真 cordis + 真 SystemPrompt + 真 ToolRuntime + 真 dsh-scope，一台服务器 30 工具、默认配置）：`select:30` → `matchesReturned:30 / discoveredTools:30 / discoveredCount:20`，下一次 `assemble` 里可见的只剩 `t10…t29`；直调 `t0`/`t9` → `isError:true`「is deferred」，`t10`/`t29` → `isError:false`。对照：同样 20 个名字分 20 次 `select:` 取时全部可调（证明是"单批超上限"而不是"上限本身"的问题） | `select:` 不受 `maxResults` 限制（目录 section 正是教模型用它），所以淘汰下限抬到 `Math.max(maxDiscovered, 本批名字数)`。代价：单次超量 `select` 会让累积集临时超上限，但**那批 schema 本就已经在提示词里**，下一次搜索按正常上限回落。回归用例进 `test/tool-search-real-host.test.mjs`（先红后绿，真 dispatcher 逐个直调 30 个工具断言无一被拒）；`clampDiscovered` 改为返回淘汰数，`test/tool-search-runtime.test.mjs` 补一条单批超上限的夹具级用例 |
| 33 | **唯一的"发现即放行"纯函数断言恒为真** | `test/tool-search-runtime.test.mjs` 那条 `guardDecision('mcp__a__x', {managed, discovered}, state, config)` 传了 **4 个实参给 3 参函数**：第 3 个实参 `state` 落进 `config` 形参，于是 `if (!config.requireDiscovery) return undefined` 立刻返回——断言与"已发现的工具应放行"毫无关系。变异复验（删掉 `guardDecision` 里 `if (discovered.has(name)) return undefined`）原先只红 2 条、**不含**这条 | 改成 3 参调用；同一变异现在红 **4** 条（含这条）。"生来就是空的守卫比没有守卫更坏"（`tool-search-wiring.test.mjs`） |
| 34 | **同名条目的 defer 是"后写覆盖"而不是注释承诺的 OR，结论取决于 `loader.entries()` 顺序** | 探针（照 `tool-search-config` 的夹具形状）：同名两条 `[defer:false, defer:true]` → `[["dup",true]]`；`[defer:true, defer:false]` → `[["dup",false]]` —— 用户的同一份配置，`entries()` 顺序一变结论翻面，而顺序是 loader 树的遍历产物，用户改不了也看不见 | 全局族改用 OR，与项目族同一条合并规则（`serverDeferTable`）。新增用例钉"顺序无关"（`[false,true]` 与 `[true,false]` 同一个结论），变异回"后写覆盖"立刻红。注：同名**不会**让 `uniqueOwner` 判定歧义——`serverDeferTable` 是 Map，`serverNamesOf` 天然去重（已实测） |
| 35 | **`test/tool-search-real-host.test.mjs` 顶部 `const DEFER_CONFIG = …` 声明后从未使用** | 全文件只有声明那一处命中（`Select-String`） | 删除，并把 `globalTools(server, count = 16)` 参数化以支撑 #32 的 30 工具夹具 |

**变异复验补强（同轮）**：四处核心逻辑改坏后全量曾仍绿，逐条补了"能区分"的夹具——`NAME_BONUS 12→0`（旧用例的查询词恰好等于裸工具名，走 `isExactName` 的 `Infinity` 分支把加分支路；新用例让两个文档命中同一个词、只有名字命中侧拿 bonus）、去掉平手 tie-break（旧 fixture 输入序**恰好就是**期望序，V8 稳定排序本身就给出同样结果；新 fixture 把输入序反过来）、`deferring: managed.size >= threshold` 改成 `>`（旧用例只有 16 与 14，两者在两种写法下同结果——边界这个数用 `DEFAULTS.threshold` 现取，不再写字面量）、`viewRevision` 里删 `servers`（`serverNames` 是活输入：项目 MCP 晚连会多出名字；新增单独变 `serverNames` 的断言）。`descriptionChars` / `maxCatalogLines` / `threshold` 仍不进测试：它们是**安装期固定值**，会话内不可能变，删了没有 stale 风险（读码结论，非实测）。**（2026-10-26：`maxCatalogLines` 已删除，由 `maxCatalogChars` 取代；新键进了 `viewRevision` 并有独立用例——它决定目录文本，改参数必须让缓存失效。）**

> ⚠️ **2026-10-18 更正**：`descriptionChars` 当天已从代码里删除——目录改 names-only 之后它没有
> 意义，写进配置会**显式报错**（有单测钉住）。顺带更正一个当时的误判：把 `maxCatalogLines` 归为
> "不进测试"是对的，但 `descriptionChars` 的问题从来不是"没 stale 风险"，而是**这个数字本身没有
> 依据**——详见 `.tasks/mcp-tool-search/TUNING-DECISIONS.md` F5/Q1。
>
> ⚠️ **2026-10-26 再更正（§12.11）**：`threshold` 与 `maxCatalogLines` **都已从代码里删除**，
> 这条批注里"仍然成立的部分"现在一个都不剩。`maxCatalogLines` 是被 `maxCatalogChars` 取代的
> （字符、只算名字行、**缺省不设 = 不截断**），旧键写进配置会显式报错并给换算。

**仍未实测、也不许当成已验证的两项**：
- **PTC 组合（已实测，缺陷确认）**：部署默认 `native` 时插件照装（装配判据读的是 `ctx.tools.modeFor()`，**不传 scope = 部署默认层**），而 `dsh-agent-tool-presentation` 会给某个 agent preset 的 scope 调 `presentAs('ptc')`。真宿主探针（`ctx.provide('ptcRuntime', { language: 'typescript' })` 最小 stub + 真 `presentAs('ptc')`）：该 agent 的 `tools:sdk` 段里 **30/30 个 mcp 工具 schema 全在**（含 `tool_search` 自己），而 `assembly.tools` 里 0 个——**遮罩对它是 no-op**；直调 `tool_search` → `isError:true`「only `run_code` is callable directly」；对照同进程 native agent → `isError:false`。即"半失效比不装更坏"这条判断在**跨 scope 组合**下真实发生。修法方向：装配判据改成按 agent 判 `agent.ctx.tools.modeFor(agent)`（装配时读一次全局默认做不到），但 `installToolSearchRuntime` 目前是全局装配、`assemble`/`guard` 里才拿得到 agent，要动装配结构——**本轮只取证、未改**。
- **`update()` 改连接字段走 `entry.update()` 重连那条路没有覆盖**：`test/tool-search-wiring.test.mjs` 的注释称"真 loader 上的重连效果由手动探针 `scripts/probe-live-defer.mjs` 覆盖"，但那支探针只跑 `setDeferAll`（**刻意不重连**），而 `test/real-host-loader.test.mjs` 的 7 条用例覆盖的是 `add` / `removeServer` / `installBuiltins` / env 表达式 / 回滚，**没有 `update()`**。注释承诺了不存在的覆盖。另外该探针只 `console.log` PASS/FAIL、**不设非零退出码**，自动化里读不到它的结论。

### 12.6 第九轮：O6/O7/O8 方案调研（只调研，未改代码）

一轮纯调研（真宿主探针 + 真 `--dump-config` + 官方文档抓取 + 变异复验），产出是选型而不是补丁。
**产品代码零改动**（`git status` 干净、738 绿）。完整证据与未验证清单已写进
`.tasks/mcp-tool-search/OPEN-ITEMS.md` 的 O6/O7/O8 条目；下一轮交接提示词在
`.tasks/mcp-tool-search/NEXT-SESSION.md`。下面只记**被推翻的论据**与**方法教训**。

| # | 被推翻 / 遗漏的事实 | 证据 | 结论 |
|---|---|---|---|
| 36 | **O6 的定性"半失效（模型看着完整 schema 却调用即错）"不成立** | 真宿主三 agent 对照：PTC 下 `wireSchemas(agent).schemas` **只有 `run_code` 一条**（`dsh-tools:2840-2843`）——模型**没有机会**发出 model-direct 调用，`collapses` 那条拒绝路径**在真实使用里不可达**。第八轮测的是"直调"，而直调在 PTC 下不是模型的可用动作 | 定性改为**净亏**：不装插件 9003 字符 / 装了 12184（**倒贴 3181**）/ 装了+裁 SDK **5315（真省 3688）** |
| 37 | **"遮罩生效了，只是遮的是另一条投影"不准确** | 装/不装插件，PTC 下 `assembly.tools` 都是 `[run_code]`、mcp 数都是 0——遮罩**没有可作用的对象** | 遮罩是 **no-op**，不是"打错投影" |
| 38 | **"插件够不到 `tools:sdk`"是过度断言**（第九轮自己先写、又自己推翻） | `tools:sdk` 与 `mcp:<server>` 指令段在**同一个 `assembly.sections` 数组**里，而插件**本来就在改这个数组**。实测裁剪：`tools:sdk` 9533 → 2664 字符，自检通过 | O6 首选方案从"整体闭嘴"改为**裁 SDK 文本**，"闭嘴"降级为**裁剪失败时的兜底** |
| 39 | **"两道门槛是照官方抄的"是错的** | 官方中文文档原话：「工具搜索默认启用：MCP 工具被延迟并按需发现」「(未设置) → **所有 MCP 工具延迟并按需加载**」；官方唯一的阈值模式是按**体积**（`auto`：定义总计 ≥ 上下文窗口 10% 才延迟），免除方式是**用户手动 `alwaysLoad: true`** | `minServerTools: 10` 源自官方博客一句 "less beneficial"（**程度判断**），`threshold: 15` 抄自社区实现 lordqyxz——**都不是官方做法**，且两道**叠加**造成断层 |
| 40 | **术语"统一到按需加载"方向是错的** | 官方中文**自己两词并用**且分立方式与本仓一致：状态/小节标题用「延迟」（「延迟服务器的工具」），机制效果用「按需加载」 | 改为**一个词一个意思**（状态=延迟 / 效果=按需加载），不是砍词 |
| 41 | **O7 的"两道门槛"少算了一道** | `DSH_MCP_TOOL_SEARCH=off` 时 `deferServersOf` 直接返 `[]`（`tool-search-config.js:50`），而全仓 grep 该变量**只在 runtime/config/npm test 里**——**面板从不读它** | 效果断言有**四条**失效路径（per-server / 会话级 / 全局开关 / PTC） |

**本轮的方法教训（比上表更值钱）**：第 38 条那次"过度断言"的根因是**只读了源码就下结论、没去试最显然的那一招**。
而真正去试的时候，第一版裁剪器**静默失败**了——`renderKey` 对合法标识符**不加引号**
（`mcp__srv__t0:`）、只对含连字符的加（`"defer-me-x":`），我按"都带引号"写 → **删了 0 个**；
**而我的自检也按引号写 → 报"自检通过"**。两个错误假设互相掩护，正是本项目禁止的
"看着成功其实没生效"。教训有两条：
1. **"做不到"这类否定结论，必须真的试过再下**——读码推断只能得出"这条路不清楚"，不能得出"这条路不通"。
2. **自检不能和被测代码共享同一个假设**。第一版自检依赖"键带引号"这个形态假设；
   改成**不依赖形态的条目计数对账**（两个 map 剩余数相等且 = 期望 + 名字残留 + 结构锚点）之后，
   同一个错误立刻变红。（第二处坑：用"数花括号"切块会被第三方描述里不配对的花括号带偏；
   换成"行首第 0 列的 `}`"判据即免疫，因为宿主把 `description` 用 `\s+` collapse 成单行。）

---

## 12.7 第十轮：独立复核推翻第九轮的地基

第十轮对第九轮的全部断言做了逐条实测复验。**结论：第九轮的"伤害量化"和"PTC 下闭环是通的"
两类定性都成立，但它选的实现路线建立在一个错误断言上。**

| # | 被推翻的事实 | 证据 | 结论 |
|---|---|---|---|
| 42 | **「`SDK_RENDERERS` / 渲染器不在公开面上」** —— 第九轮据此把"裁剪"设计成**解析生成物**，并提出"要正解得求官方" | `dsh-tools:3714` 的 `export` 列表含 `renderToolsSdk`、`renderToolsSdkPy`、`jsonSchemaToTs`、`jsonSchemaToPy`；`lib/types/ts-types.d.ts:36`、`py-types.d.ts:48` 有类型声明 | **直接调官方渲染器重渲染子集**，不解析生成物；**不需要向官方提需求**。实测 `renderToolsSdk(sdkSchemas(agent))` 与宿主生成的 `tools:sdk` 段**逐字节相等** |
| 43 | 第 38 条"裁 SDK 文本"的实现细节（`renderKey` 裸标识符 / 别数花括号 / 两个 map 同步删 / 三条自检 / Python 另写判据） | 第 42 条成立后，这些都变成"解析生成物"路线的副产物 | **全部作废**。自检改为一条更强的不变量：`renderToolsSdk(全集) !== 原文 → 退回原文`，最坏 = 现状 |
| 44 | **O8 #1「`applyServerFloor` 改注释不改判据」** | 第十轮定：两道门槛整个删掉（官方没有这两道，且它们制造"勾了没效果"的断层） | `applyServerFloor` / `minServerTools` 成为**死代码，整删除**，连那条 `>` 变异用例一起改写 |
| 45 | **O7「这几层不误导模型，误导的只有面板」** | 12 工具探针（`deferring=false`）：`tool_search` 仍可见，返回 `matches:[]` + `instruction:"...or consult the deferred tool catalog section of the prompt."` ——**指向一个不存在的段** | 对 **PTC** 不成立（原生会话看不见 `tool_search`，受害面仅 PTC）。改成"没东西可搜时明确报错" |
| 46 | 第九轮「未验证」里的**最后一个缺口**：裁剪后模型能否真写程序并调通 | 挂真 `dsh-ptc-runtime-node` + 真 Session，跑真程序：P1 未发现→守卫拒 / P2 `tool_search` / P3 调通 / P4 直调被 `collapses` 拒 | **闭环成立**。PTC 下唯一失效的仍然是"省地方" |
| 47 | **O6「更干净的正解（宿主需求，主动权不在我们手里）」整段** | 第 42 条成立 | **作废**。官方已导出渲染函数，我们自己做得到 |

### 12.7.1 第十轮的方法教训

- **"够不到"和"够得到"两类断言都必须试。** 第九轮学会了"否定结论要真试"，但**肯定结论**
  （"只能解析生成物"）同样需要试——它导致多写一整套脆弱的文本裁剪器，而真正该做的是**先查一眼导出了什么**。
- **"优化"不能只算省不省字。** 第十轮初版方案盯着"最小改动"，漏掉了"装配判据是进程级的，
  而插件状态本来就是 per-agent 的"这个错配——它才是缺陷本体。
- **成本估算要落到具体钩子上。** 一度断言"LRU 要挂进执行管线、成本高"，实际
  `tools.guard` 就是每次调用都经过的现成钩子，记录使用几乎零成本。

**所有最终决策见 `.tasks/mcp-tool-search/DECISIONS.md`。**

---

## 12.8 第十一轮：实施（S1–S9 落地，S10 未做）

按 `IMPLEMENT-PLAN.md` 的 S1→S10 实施。**S1–S9 全部落地并各有独立提交**，
`node --test` 从 738 涨到 **793 全绿**；S10（真机 UI）因上下文预算未做，记在
`OPEN-ITEMS.md` 的第十一轮小节里。

### 12.8.1 结构变化（这轮真正的改动）

| 新模块 | 职责 | 为什么拆出来 |
|---|---|---|
| `lib/tool-search-host.js` | 宿主能力探测（`probeHost` / `warnOnce`）、`chooseToolName`（G4 重名换名）、`inferMode`（`modeFor` 缺席时的公开退化判据） | 两个 private API 依赖要 feature-detect 并**只记一次**日志；塞进 600 行的 runtime 里没人会去读 |
| `lib/tool-search-state.js` | 发现集 LRU（`evict` 的 B9 公式）、`foldEvent` + `discoveryProjection`（C4）、协议与解析器 | 协议 + 解析器 + fold 必须同时改，落单就是静默失败；`parseDiscoveredMeta` / `discoveredFromMessages` 从 runtime 迁到这里（runtime 再导出以保留既有引用） |
| `lib/tool-search-sdk.js` | `trimSdkText`（唯一正确的顺序 + 前提自检）、`readSdkSchemas`（公开 API 优先）、`rendererFor` | 纯决策，可单测；runtime 只负责"取数 + 替换段" |

### 12.8.2 五处不变量（本轮的核心）

1. **`D = managed − discovered` 是唯一集合**（B11）。遮蔽函数清单、遮 `mcp:<server>` 指令段、
   目录段、SDK 裁剪、守卫五处全部从它派生。`deferring` 一个布尔身兼两义的写法没了，
   换成 `hasDeferredServers`（`managed.size > 0`）与 `hasDeferredWork`（`D.size > 0`）。
   **`D = ∅` 时目录段与引导段一起消失**——那是 F15 那句"The tools below stay deferred"的来源。
2. **目录只过滤显示，不重建索引**（B11 修正）。索引仍建在 `managed`（可按 revision 缓存），
   显示文本按 `(revision, versionOf(state))` 单独缓存两个 slot。缓存键去掉 `version`
   会让发现后的目录停在旧字节——这条有专门的反证。
3. **裁手册四道门，顺序即正确性**：段非空 → `requireDiscovery` → 有 `ptcRuntime` →
   能拿到原输入。`tools:sdk` 段存在但文本为空是常态（PTC 部署下的 native agent），
   先短路才不至于每次组装白跑一次全集重渲染。
4. **装配判据 per-agent**（B4/§11.4）：`native` 与 `ptc` 都启用，**只有 `both` 是 inert**。
   写成"非 native 就 inert"会把 PTC 整个关掉——这条有专门的护栏用例。
5. **投影只当恢复种子**（C4）：`apply` 恒返回状态对象、没有新名字返回同一引用、状态有界；
   运行期状态仍是 per-agent `WeakMap`。

### 12.8.3 这轮新拿到的实测证据

| # | 结论 | 证据 |
|---|---|---|
| 48 | **内部投影能从 `installToolSearchRuntime` 内部注册**，并在**真** `dsh-session-projection` 上工作 | 一次性探针（已删）：真 `dsh-session` + 真 `dsh-session-projection`，`PASS-fold`（真 `tool/ptc-dispatch` 事件被 eager drive 喂进 `apply`）/ `PASS-unregister`（cleanup 注销键）/ `PASS-restore`（第二次装配、新 agent、同一 session，发现集被还原）三项全过 |
| 49 | **公开 API 重建的 SDK 输入与快路径逐字节等价**，且两条路都排除 `run_code` | `test/tool-search-sdk.test.mjs`：`renderToolsSdk(public) === renderToolsSdk(sdkSchemas)` |
| 50 | **PTC 下"发现集恢复"这条闭环现在有真实路径** | 同上 + `test/tool-search-runtime.test.mjs` 的投影恢复用例（真事件形状 + 契约级假注册表） |
| 51 | **去门槛之后 1 个工具的服务器也真启用** | 集成用例：遮罩 / 目录 / 守卫三处同时生效（旧行为是 ≤10 整台不参与） |

### 12.8.4 反证（撤掉改动看红）逐条真跑

`IMPLEMENT-PLAN.md` §6 的九条全部跑过，每条都在提交信息里。要点：

- 撤掉"最多踢一半" → 收敛表用例红（21→1 / 31→11 / 100→50→25→20）。
- 撤掉"发现即播种 `lastUsed`" → touch 用例与 B8 用例同时红（**注意**：最初那版 B8 用例
  在"播种全为 0"的变异下仍然绿——因为稳定排序让插入序恰好等于新旧序；改成"先 touch 几个旧工具"
  之后才真正有区分力。**测不到的断言等于没写**）。
- 撤掉前提自检 / 不转发 `programFormat` / 不按模式门控签名 / 投影不当种子 / 不做重名预检 /
  探测恒为 true —— 各自对应用例都红。
- 重新引入一个"数量门槛" → 纯函数层与装配层共 4 条红。

### 12.8.5 本轮的方法记录

- **先写"能区分"的用例，再写实现**：B8 那条第一次写出来是**假守卫**（变异照样绿），
  发现之后才补了"touch 让新旧序与插入序分离"的构造。这和第九轮"自检与被测代码共享假设"
  是同一类错误，只是这次在测试侧。
- **夹具的保真度决定用例的价值**：SDK 裁剪的用例最初让夹具只返回测试清单里的工具，
  于是"搜索工具自己必须留在手册里"没有对手（真宿主的 `schemas(scope)` 必然包含它）。
  改成"注册之后才出现在 `schemas()` 里"（真宿主语义）之后，那条断言才有内容。
- **`both` 的 inert 必须显式早退**，而不是靠"managed 为空"自然发生：两者在组装层的
  差别是"引导段摘不摘"，而摘了就不是 inert 了。

## 12.9 第十一轮（C2）：把三个有证据的参数开放给用户

**落点**：插件自己那条 profile patch 条目（`- id: mcp-manager-ui / name: dsh-toolbox-ui`）的
`config.toolSearch`，**不新开设置文件**。这是本插件**第一次有 `Config`**（`lib/index.js` 的
`static Config = ToolSearchConfigSchema`），cordis 用标准 schema 在加载时校验
（`resolveConfig` → `runtime.Config['~standard'].validate`）。

**只开三个**（证据见 `TUNING-DECISIONS`）：`maxResults`（Q2/F4）、`maxCatalogChars`（Q4 + §12.11，2026-10-26 由 `maxCatalogLines` 换成字符口径；同日改为**默认关闭的开关**，缺省不截断）、
`maxDiscovered`（Q2）。**不开** `requireDiscovery`（Q6：关掉 = 让模型凭记忆直调未加载工具），
也不开 `toolName` / `stem`（前者是换名逃生门；后者只有两组真实工具集的零误伤证据）。
`descriptionChars` / `threshold` / `minServerTools` 已删除，schema 的 strict 让它们**写进来就报错**。

**四个决定与理由**：

1. **schema 必须接受 `undefined`**。存量 profile 的 patch 行没有 `config:`，loader 传
   `undefined`——不接受它等于"升级后面板消失"。用 `z.object({…}).strict().default({})`，
   `test/tool-search-settings.test.mjs` 第一条钉的就是这件事。
2. **落盘稀疏**：与 `DEFAULTS` 相同的值**不写**。否则默认值将来有更好的实测依据时，老用户会
   被这次抄下来的数字钉住，而面板照样显示"默认"。删键后空的 `config` / `toolSearch` 一起删
   （不留空壳）。
3. **生效方式是重装运行时，不是"活值 getter"**。`max_results` 的**取值范围与默认值写在工具
   定义里**（模型据它决定传什么数字），而工具定义只在 `tools.register` 那一刻生成一次；做成
   活值就会出现"运行值 25、模型看到的上限 10"的假生效。重装的代价（发现集要从会话投影恢复）
   实测可接受：`test/tool-search-runtime.test.mjs` 的「换参数重装后已发现集仍在」证明守卫照样
   放行、目录照样不再列它。
4. **先校验 → 再写盘 → 最后重装**。写盘失败整个失败（运行时不改），免得"只在本进程生效、
   盘上没写"在下次重启时静默回退；重装失败则把旧配置装回来并**明确报错**（参数已写盘、
   重启后生效）。patch 文件**不会被热加载**（这正是 `add()` 走 `loader.create` 的原因），
   所以"改了真的生效"必须由插件自己完成——真 loader 用例钉的就是这一条。

**验证**（19 条新增用例，全绿；含两处变异复验）：
- 纯逻辑 11 条（`tool-search-settings`）：schema 三形状 / 非法值与已删除键报错 / 稀疏归一 /
  patch 往返与注释保留 / 条目缺失时报错而不凭空新建；
- 运行时 2 条：工具定义里的上限随配置变；重装后已发现集恢复；
- **真 loader 2 条**（`real-host-loader`）：读默认 → 写三个值（注释与别的条目一个字不动）→
  **同一进程里注册的工具定义换成新上限** → 回到默认删键 → 非法值盘上不动；另一条覆盖
  **bundle 安装形态**（用户 patch 里没有我们的条目 → 追加 id 定向覆盖）；
- 面板 7 条（`tool-search-settings-panel`）：打开即读、三项填生效值、保存发数字且成功回报、
  失败把宿主原话留在表单里、读失败不渲染半截表单、恢复默认、每个字段的 ⓘ 说明标记；
- 变异复验：掐掉"重装" → 真 loader 那条以"改完参数后模型可见的工具定义必须跟着变"变红。

### 12.9.1 真机验证发现的两个缺陷（都已在 1.8.0 修掉）

真机（隔离 `DSH_HOME` + 发布的 `dsh@0.2.0-rc.2` + 真模型 + 真浏览器）跑一遍才发现，两条
**夹具全绿也照样存在**的缺陷：

1. **落点找错了（严重）**：`dsh plugin add` 把插件装成 **bundle** 时，那条 insert 条目住在
   `<包>/cordis.patch.yml`（bundle 层），**用户 profile 的 patch 里根本没有它**。早期实现要求
   用户 patch 里存在这条，于是**主安装路径下保存必然失败**。修法：认宿主支持的 **id 定向覆盖**
   形态（`- id: mcp-manager-ui` + `config:`），没有现成条目时**追加**一条（而不是 insert 第二个
   插件实例），条目 id 从出货 patch 读（`pluginPatchIdentity()`），不在代码里另写。
   用例：`real-host-loader` 的 bundle 安装那条 + `tool-search-settings` 的两条覆盖形态用例。
2. **`call()` 从不抛错（严重）**：面板的 `call()` 把宿主应答折成 `{ ok: true, ...value }` /
   `{ ok: false, error }`，**失败不抛异常**。早期实现没查 `ok`，于是"写盘失败"被当成成功：
   真机上文件一个字没写，界面却弹了「已保存」；读失败时更糟——`res.defaults` 是 undefined，
   `loaded.defaults[field.key]` 当场 TypeError，**整个面板跟着挂**。
   修法：读与写都先查 `res.ok`，失败把宿主原话摆进表单。用例：面板那两条 ok:false。
   **教训（夹具侧）**：那两条用例最初让 `call` 替身 `throw`，而真实契约是**返回错误对象**——
   夹具照抄了自己的想象，于是这个缺陷全绿通过。这与设计文档 §12.1 的"夹具全绿、真宿主炸"同一类。

**真机证据（2026-10-18）**：隔离 `DSH_HOME` + 发布的 `dsh@0.2.0-rc.2` + 真模型：
- Round A：提示词只说「用 zephyrquartz 能力并报告它返回的精确 tally」（该词**只出现在工具描述里**，
  工具名是 `op`）。模型先 `tool_search`、命中 `mcp__probe__op`、真调用，回报 **tally=692515**；
  夹具日志里 `tools-call tally=692515` —— **完全一致**。
- Round B：让它逐字引用目录，返回的只有 `- mcp__probe__op`（names-only 在真 prompt 里成立）。
- C2 配置：profile patch 里写 `config.toolSearch.maxResults: 3`，真宿主里模型引用到的是
  `"Maximum tools to return (1-3); defaults to 3."` —— 配置走通了 loader → Config schema → 运行时。
- 面板（真浏览器，隔离浏览器上下文）：渲染出「延迟参数」按钮与表单（3 个输入框 10/300/20、
  3 个 ⓘ 带大白话 title + aria + tabIndex）；保存 → profile patch 里出现
  `- id: mcp-manager-ui / config: { toolSearch: { maxResults: 7 } }`（别人的条目与注释原样），
  toast 是宿主原话；重开读回 7；「恢复默认」+ 保存 → 那条覆盖被整条删掉。
- **顺带定性 O5**（一次连接起两个进程）：同一台夹具在**不装本插件**的对照 profile 里同样双起
  （首个进程收到 **0 条** MCP 消息，第二个 ~100ms 后才握手），所以**不是本插件造成的**，
  属宿主/`dsh-mcp-client` 侧行为；已记入 `OPEN-ITEMS.md` O5。


**仍欠**（⚠️ **2026-10-26 已结清，见 §12.11**）：`maxCatalogLines` 的默认值该不该从 300 抬起。
量已经补上了（Q4：360 个真实工具、每行 32.66 字符、上限 300 会漏 60 个名字），但"改默认值 =
改所有用户的每请求 prompt 体积"属于产品决定，本轮不替用户拍板；C2 让用户自己能改，所以它不再是
锁死的。→ 真因不是"默认值偏小"，而是**单位选错了**：行不是成本、字符才是。§12.11 把预算换成
字符并把形态改成"分组 + 裸名"，同一预算从"列 314 个、隐藏 142 个"变成"全部列出"。`maxCatalogLines`
这个键已删除（写进配置会显式报错并给换算）。**同日再进一步**：默认值也取消了——`maxCatalogChars`
缺省不截断，只有显式写正整数才启用（§12.11 二次更正），所以"该不该抬高默认值"这个问题随默认值一起消失。

## 12.10 行内单台延迟开关（1.8.1）

**用户原话**：「哦，那你这个按钮确实藏的有点深了啊」。1.8.0 里行上那颗「延迟」只是**状态
徽标**：想给某一台开延迟，必须进「编辑」弹框勾一个复选框，而列表上看不出那个动作在哪。

**改法**：徽标升级成**状态即按钮**的芯片，两种状态都渲染、都可点（`全量` ↔ `延迟`），
非本插件管理的条目只展示不可点。

- **为什么是芯片不是开关**：右侧那颗 Toggle 是「启用/禁用」（关掉 = 该服务器不加载、工具全没）。
  延迟只是"工具放不放常驻上下文"，两者外观一致会让人以为关掉延迟等于关掉服务器。
  与眼睛（可见性）同一条教训：后果不同的控件必须长得不一样。
- **写路径**：新增单台 RPC `setDefer({ name, defer, wsPath? })`，与 `setDeferAll` **共用**
  `applyGlobalDefer` / `applyProjectDefer`（区别只有 `names`：批量传 undefined，单台传 `[name]`）。
  于是"批量"与"单台"不可能写出不同形状的配置，客户端也不需要自己拼一份 spec（那会碰
  "保留原值标记"那套密钥回流逻辑，为了翻一个布尔位不值得）。
- **名字对不上必须报错**：单台路径找不到目标时抛错，而不是静默 no-op —— 面板点了没反应
  是最难排查的形态。
- 编辑框里那个复选框**保留**（它仍是批量编辑与"看到规则说明"的地方），但它不再是唯一入口。

**验证**：真 loader 用例「单台延迟开关只改那一台，并同步内存活条目」（盘上用生产解析器
读回、内存活条目同步、名字不存在时报错）；客户端侧用例覆盖芯片两态、只读态、`aria-pressed`、
点它不顺带选中行、两个作用域的列表都接上线；i18n 双语同步。

## 12.11 目录改「分组 + 裸名」，预算从「行」换成「字符」（1.9.0）

**起因**：用户问"分类之后还用截断吗"，顺着查下去发现两件事——① 目录每行都重复
`mcp__<server>__`，同服务器连续 360 行就重复 360 次；② 预算是**行数**，而行数表达不了成本
（一行可能是 `- click` 7 字符，也可能 38 字符）。

**同构夹具实测**（7 台真实服务器名 / 456 个工具，不是某台机器独有）

| 口径 | 列出 | 名字行字符 | 整段字符 | 未列出 |
|---|---|---|---|---|
| 旧：300 行全名 | 314 | 11,872 | 12,896 | **142** |
| 新：12,500 字符裸名 | **456** | **10,976** | **11,690（-9.4%）** | **0** |

⇒ 两个轴同时改善：多列 142 个名字，整段反而短 1,206 字符。

**形态**：每台服务器一个组头，下面只写裸名。

```
### browser-tools · 40 tools · Browser automation server: take screenshots, click…
- click
- take_screenshot
```

去掉前缀之后，组头不再是冗余，而是**服务器身份的载体**——§3.3 里"分组头只是把排序重复一遍"
那条结论的**前提（名字自带前缀）已消失**，故该结论作废（见决策 9 的批注）。

**归属与切分不做任何字符串解析**（这是本轮最关键的一条）：

- `owner` 来自 `view.ownerOf`，它是 `uniqueOwner` 对**已知服务器名**做前缀**唯一命中**的结果；
- 切分点是 `'mcp__' + owner + '__'` 的**长度**，且先 `startsWith` 验证 ⇒ 不变量 I2
  `prefix + bare === name` 恒成立；
- 归不上（无前缀 / 前缀不符 / 裸名为空 / 两台服务器前缀互相包含）一律**保留全名**、不分组；
- 禁止 `split('__')`：`serverName` 允许含 `_`（`mcp__a__b__x` 会切散）；
- `serverName` 受 `/^[A-Za-z0-9_-]{1,32}$/` 约束 ⇒ 前缀最长 39 字符 < 截断保留区 51
  ⇒ **64 字符截断永远切不坏前缀**（早前"serverName 超长会切坏前缀"的担心不成立）。

**预算**：`maxCatalogChars`（**缺省不设 = 不截断**；设了才只算名字行。标题/intro/组头是"地图骨架"
另付，≈700 字符且随服务器数线性——把它算进预算会让"预算小于骨架"无解：要么砍组头使地图缺块，
要么超支）。面板上是一个**默认关闭的开关**，打开时预填 12,500 —— 那是旧口径 300 行全名的实测成本
（12,435 → 取整 12,500），是建议起点，不是默认值。

**分配**：按服务器**注水**（短的组先满足，剩下额度在还饿着的组之间继续平分），保证任何服务器
都不会整台消失；溢出数写在各自组头（`· N not listed`）。

**绝不切名字（不变量 I6）**：分配粒度是**整行**，一行装不下就少一行。半个名字等于给模型一个
错的调用名，比少列几个更糟。用例用"预算逐格下压约 100 个采样点"扫，每次断言出现过的每一行都
是完整名字、且名字行用量 ≤ 预算。

**`select:` 支持裸名**：目录显示裸名，模型会照着它写 `select:`，不吃裸名等于把这条主路径废掉。
唯一命中直返**全名**，多命中全返（不猜），缺失仍 `found:false`。

**明确不做**（留档防后人再加）：

| 被排除 | 理由 |
|---|---|
| 组内 **LCP** 自动发现并剥公共前缀 | 会剥语义前缀（`find_`、`analysis_`）；字节不稳定（加一个工具就可能让整组前缀变化，破 prompt 缓存）；真实数据上 chrome-devtools / jshook 的整组 LCP 都是空 |
| 剥 `serverName + '_'` 重复段 | 真实数据里确有重复（`firecrawl_scrape`；`mcp-deepwiki` 的工具是 `deepwiki_fetch`，属**变体**），但精确匹配抓不住变体、要抓就得做归一化猜测；即便全剥也只省约 240 字符（<3%），且不影响正确性 |

**验证**（三道，均为真组件）

1. `node --test` **845/845**（`real-host-loader` 的 HOME 用例需设 `HOME`，历史上同样红）；
2. 隔离进程真宿主（真 cordis / SystemPrompt / ToolRuntime）：遮罩后模型只见 `tool_search`；
   摘要自动跳过宿主拼的 `### MCP server: <name>` 行；预算压到 600 时小服务器全列、大的标注
   `· 6 not listed`；不变量三条（不超预算 / 无半截名字 / 不重复标题）全过；
3. 真模型（DeepSeek）：中英文提问都正确调 `tool_search`，中文提问**自动转英文查询**
   ——旁证"中文不必手写词表，模型自己会翻"（对应 §12.6 里那条待定项）。

**提示词与代码的分工**（2026-10-26 定；用户口径："相辅相成互补或者增强"）

一条判据管这类问题：**能用代码算出来的答案，就不要写成提示让模型判断。**

| 层 | 管什么 | 为什么 |
|---|---|---|
| 代码 | 确定的复原与判定：裸名 / 全名 / 用点或空格拼坏的名字能反拼回现有工具；真不存在就是 `found:false` | 有确定性，不受模型是否听话影响 |
| 提示词 | 降低**犯错频率** + 代码无法确定的判断：抄名字、换英文关键词、工具真不存在时该改哪条路 | 只能靠模型，没有百分之百 |

两条配套纪律：

1. **两边不许互相拆台。** 代码开始接受点 / 空格之后，提示词里那句 "(server.tool, server tool,
   server_tool do not exist)" 立刻成了假话，必须同批改掉——提示词里只要有一句不成立，模型学到的
   就是一条错规则。
2. **反拼的合法性判据**：分隔符必须是**合法名字里不可能出现的字符**。宿主把模型可见的工具名归一化成
   `[A-Za-z0-9_-]`（`mcp-client/src/tools.ts:51,83`，非法字符替换成 `_`），所以只有 `.` 与空格能反拼；
   单个 `_` 是合法名字字符（`repo_read_file` 可能真是某张工具的名字），**不认**——认了就是策略不是事实。
   用例钉死：`select:jshook_tool_1` 必须报不存在，哪怕 `mcp__jshook__tool_1` 就在目录里。

**成本判断（据此加过一句提示词）**：常驻提示词多几个字符，只要能少一次模型犯错就是划算的——一次失败
往返（发查询 → 落空 → 重读回执 → 换个写法重试）本身就比多写的十几二十个字符贵。所以 `select:` 的参数
描述里明确写出"可逐字复制的是哪两种形态"（裸名 / 结果里的全名），不再让模型自己从组头 + 列表项去推。

## 12.12 1.10.0：写盘与应用合成一条链路（reconcile 是唯一的 live 主体）

§12.3 #24 记录的"writePatch 之后自己 `ctx.loader.create` 根部创建 / `entry.update()` 重连"
**已经不是当前实现**。1.10.0 起，MCP 行的生命周期（新增 / 编辑 / 启停 / 移除 / 导入 / 内置安装）
只经由官方 profile 组合：读完整有序组合 → 写 profile patch → `composeEntries` 判定这一行是否
真的算数 → `reconcileProfilePatches` 应用整份组合 → 校验运行中的条目；失败则写回上一份并重新应用。

为什么换掉（两条都在真机上出过事）：

1. **两套事实**：插件自己拼的 loader 条目与 patch 里的行不是同一个来源。面板读一处、运行时走另一处，
   于是会出现"盘上写的是 A、运行中是 B"——本轮面板里"看起来正常、策略却是反的"就是这条链路上漂出来的。
2. **rc.5 的卸载钩子**：`cordis-plugin-loader@1.0.6` 卸载插件时会
   `fiber.entry.parent.tree.write()`，而 include 子树的写是把**已应用树**（base + patch 行）写回
   `cordis.yml`。`removeServer` 一度会把兄弟服务器的行烙进 base 配置。

延迟（`defer`）是**纯视图遮罩**，不走 reconcile：它不改变连接参数，也就不该让 serena 那种冷启动
1–1.5 分钟的服务器重连。遮罩在内存里改 `entry.options.config.defer`，由下一次组装直接读到。

所有变更型 RPC 现在返回同一组字段（`persisted` / `live` / `diagnostics`），"写盘成功但运行中没生效"
如实报 `live: 'skipped'` + 原因，而不是一句「已更新」。契约单源与客户端产物见
[`docs/design.md`](design.md) 的「写盘与运行中：一条链路」与「契约与产物：同一份定义」两节。

## 12.13 没有可搜的工具时不再发搜索入口（issue #9，1.10.0）

**现象**（用户报的）：把所有 MCP 停用、或把工具全设成常驻之后，模型仍然看得见 `tool_search`，
于是它先搜一次——而此刻目录是空的，这一轮白花。

**原因**：搜索入口是"稳定项"（不能被自己延迟掉，也不能被用户策略藏掉），旧实现把它当成
"永远发给模型"。这是两件事被写成了一件：**不可被用户隐藏** ≠ **永远应该出现**。

**现在的判据**（`lib/tool-search-presentation.js` 的 `presentAssembly`）：延迟集
`D = M − 已发现` 为空时，搜索入口与目录段、引导段一起从模型可见的工具里摘掉；它本身仍注册在
宿主里（`ctx.tools.schemas()` 依旧能看到），所以一旦有工具被延迟，下一次组建立刻又有它。
PTC 的手册同理：把搜索入口放进"要摘掉"的集合交给渲染器重画（`trimSdkText` 的 `drop`）。

**覆盖**：`test/tool-search-presentation.test.mjs`（3 个方向的纯层用例）、
`test/tool-search-real-host.test.mjs`（真 rc.5 宿主：提示词里既无引导段也无目录段、
声明里没有搜索入口、但宿主里仍注册着）、`test/tool-search-rc22-host.test.mjs`
（真 rc.1 宿主，同一判据）。

# billion-context 配置参考

[English](./CONFIGURATION.md) | [中文](./CONFIGURATION.zh-CN.md)

`billion-context` 是一个 HTTP 代理，用于将 [ACP](https://github.com/ranxianglei/acp-kernel)（Active Context Pruning，主动上下文剪枝）的上下文压缩注入到 LLM API 流中。下文所有选项都位于同一个 JSON 配置文件中（也可通过等价的环境变量 / CLI 参数设置）。

---

## 配置文件位置

| 范围 | 路径 | 说明 |
|------|------|------|
| **配置文件（Linux）** | `~/.config/billion-context/billion-context.json` | XDG 基础目录规范 —— 标准、用户可编辑的配置 |
| **配置文件（覆盖目录）** | `XDG_CONFIG_HOME` 的值 | 重定位整个配置目录 |
| **配置文件（显式指定）** | `BILI_CONFIG_FILE` 的值 | 直接指向任意 JSON 文件 |
| **CLI 参数** | `--config <FILE>` | 与 `BILI_CONFIG_FILE` 等价，文件路径优先级最高 |
| **会话数据** | `~/.local/share/billion-context/sessions/` | 持久化的压缩状态，会随时间增长 |

首次运行时，`billion-context` 会在配置路径下生成一个空模板（`{ "providers": {} }`），方便你直接编辑。它**不会**覆盖已存在的文件。

配置文件是一个纯粹的覆盖层 —— 每个字段都是可选的。任何未设置的字段都会回退到内置默认值。

---

## 快速开始

```jsonc
// ~/.config/billion-context/billion-context.json
{
  // 服务端
  "port": 8787,
  "host": "127.0.0.1",

  // 路由两个 provider
  "providers": {
    "https://api.anthropic.com": {
      "models": {
        "claude-sonnet-4-5": { "context": 200000, "output": 8192 }
      }
    },
    "https://generativelanguage.googleapis.com": {
      "models": {
        "gemini-2.5-pro": { "context": 1000000 }
      }
    }
  },

  // 全局压缩调优（应用于每个请求）
  "compress": {
    "maxContextLimit": "75%",
    "emergencyThresholdPercent": "95%"
  }
}
```

---

## 参数参考

状态说明：**ACTIVE（启用）** = 当前生效 | **DEPRECATED（已弃用）** = 接受但无效果 | **EXPERIMENTAL（实验性）** = 可能变更

<!-- bili:gen param-ref -->
以下索引由 `website/config-reference/*.yaml` 生成——改种子后运行 `node tools/gen-config-docs.mjs generate`，不要手改本区块。

**服务与核心**

| Key | Type | Default | Env | Description |
|-----|------|---------|-----|-------------|
| `port` | number | 8787 | ACP_PORT, PORT | 代理监听端口（用户区；车道派生代理使用 BILI_ZONE_PORT，互不干扰）。 |
| `host` | string | 127.0.0.1 | ACP_HOST | 绑定地址。127.0.0.1 仅本机回环；:: 双栈；0.0.0.0 对外暴露（无鉴权，仅限可信网络）。 |
| `sessionHeader` | string | x-acp-session | ACP_SESSION_HEADER | 携带会话 id 的请求头；相同取值的请求共享压缩状态。 |
| `log` | boolean | true | ACP_LOG | 逐请求日志总开关。 |
| `logFile` | string | XDG state path (off disables the file, keeps stderr) | ACP_LOG_FILE | bili.log 的显式路径；10 MB 自动轮转。 |
| `debug` | boolean | false | ACP_DEBUG | 逐请求详细日志。 |
| `dumpSse` | string | unset (directory) | ACP_DUMP_SSE | 原始 SSE 帧转储目录（排障用），含循环内发起的上游响应。 |
| `passthrough` | boolean | false | ACP_PASSTHROUGH | 全局裸转发开关：所有请求不做压缩、工具注入或提醒直接转发。 |

**上游与计费**

| Key | Type | Default | Env | Description |
|-----|------|---------|-----|-------------|
| `upstream` | string | https://api.anthropic.com | ACP_UPSTREAM | 请求未命中任何路由时的兜底上游基础地址。 |
| `proxy` | string | unset (direct) | BILI_UPSTREAM_PROXY | 代理自身出站的全局代理。解析顺序：按路由 → BILI_UPSTREAM_PROXY → Web UI → 本值 → HTTP(S)_PROXY 环境变量 → Windows 系统代理 → 直连。空字符串 = 显式直连；不支持 SOCKS5。 |
| `upstreamProxy` | string | unset | — | Web 面板手动设置的代理层级（由仪表盘代理编辑器写入）；解析顺序中位于 BILI_UPSTREAM_PROXY 之下。 |
| `upstreamProxyMode` | "auto" \| "manual" \| "direct" | auto (unset behaves as direct) | BILI_UPSTREAM_PROXY_MODE | 全局代理来源策略：auto（环境变量/系统发现）、manual（仅 Web 面板值）、direct（从不使用代理）。 |
| `providers` | record url-prefix → route entry | {} | — | 路由表：URL 前缀键到逐 provider 条目（models、compress、compat…）的映射。详见 Providers 章节。 |
| `modelContextLimit` | number | 200000 | ACP_MODEL_CONTEXT_LIMIT | 旧版全局窗口上限（窗口来源中优先级最高，兼作使用率分母）；建议改用 compress.modelContextLimit。 |
| `imageBilling` | "auto" \| "pixels" \| "bytes" | auto (resolves to pixels) | BILI_IMAGE_BILLING | 全局图片 token 估算口径；逐请求实时读取，优先于所有逐 provider 设置。 |
| `imageTokenCap` | number | unset (uncapped) | BILI_IMAGE_TOKEN_CAP | 全局单图 token 上限，叠加在计费口径之上生效；逐请求实时读取。 |
| `imageRescale` | boolean | true | BILI_IMAGE_RESCALE | 出站图片降采样总开关（#3295/#3400）：大图以缩小形态发给模型，原图在会话存储中保持字节级原样。逐请求实时读取。 |
| `billing` | object | {} | — | 按模型计费单价（#4899）：billing.prices[模型] = { input, output?, cacheRead?, cacheWrite? }，美元/百万 token；覆盖 models.dev 快照价，驱动面板美元花费台账与省钱折算。无价模型只显示 token。 |

**行为开关**

| Key | Type | Default | Env | Description |
|-----|------|---------|-----|-------------|
| `rollout` | object | {} | — | 灰度发布配置块:按特性覆盖版本内置的灰度计划;特性按安装占比放量,分桶基于每台机器稳定的 id。 |
| `rollout.installId` | string | auto-generated UUID persisted at ~/.local/state/billion-context/rollout-id.json | — | 钉住分桶身份,替代 state 目录自动生成的 UUID(支持/测试用:选取或计算一个桶值落在目标人群内的 id)。 |
| `rollout.features` | record feature name → { enabled?, percent?, salt?, base? } \| boolean \| number | {} | — | 按特性覆盖,键为当前版本处于灰度中的特性名。enabled(布尔)覆盖任何百分比;percent(0–100)重设比例;salt 重新洗牌;base 重设嵌套父特性。缩写:"x": true/false 强制开/关,"x": 20 等价 percent 20。类型写错的字段(如 enabled 写成字符串)会被忽略并在启动警告中点名,绝不静默放宽圈层。 |
| `rollout.features.enabled` | boolean | unset (bucket math decides) | BILI_ROLLOUT_<FEATURE> | 无视百分比强制开关某个灰度特性。环境变量 BILI_ROLLOUT_<特性名>(大写下划线;0/false=关,其余值=开)优先于一切,包括本字段。 |
| `rollout.features.percent` | number | the version's baked-in plan | — | 看到该特性的安装占比(0–100,支持小数)。单调:上调比例不会把已入组的安装踢出;每台安装的桶值是前缀稳定的。 |
| `rollout.features.salt` | string | the feature name | — | 分桶哈希盐。修改它会重新随机整个分组(唯一的洗牌方式;仅上调 percent 永不洗牌)。 |
| `rollout.features.base` | string | unset (roll out over everyone) | — | 嵌套灰度:仅在所指特性的已入组人群内评估本特性,percent 相对该人群(B 只放量给 A 的用户;允许链式,环路判为关)。 |
| `rollout.features.identityChannelHarvest` | boolean \| number | 0(关) | BILI_ROLLOUT_IDENTITY_CHANNEL_HARVEST | 身份信道采集的灰度门(#5825):当安装级开关(BILI_IDENTITY_HARVEST)未设置时,允许仅由本灰度键激活回环专属的转录/SQLite 采集(claude-code / codebuddy / mcode / goose / qwen 车道);两者都不设则永不读客户端存储。owner 裁定 2026-11-07:本灰度键与 rollout.features.pluginLaneServerHistory(它管已接纳 id 的行钉住)刻意分离——任一使能方可激活采集。默认 0%,小流量观察退化率后再抬。见 identity-channels.zh-CN.md。 |
| `rollout.features.pluginLaneServerHistory` | boolean \| number | 0(关) | BILI_ROLLOUT_PLUGIN_LANE_SERVER_HISTORY | 插件车道服务端正史(#4491):对已放量的安装,(a) 插件车道请求可携带与 `messages` 平行的内部字段 `biliMsgIds`,把消息身份钉在客户端提供的 id 上(转发上游前一律剥掉;格式错误的数组告警后忽略,身份投毒形态在增量车道直接硬失败);(b) 仅回环可达的 `POST /__bili/plugin/render` 端点从统一存储渲染出站前缀(折叠区收敛为摘要锚点;任何失步都返回非 2xx,shim 退回本地历史);(c) 增量车道探测响应通告 `serverHistory`。默认 0%,放量前无行为变化。 |
| `rollout.features.pluginFullResendWatermark` | boolean \| number | 5(实验性灰度) | BILI_ROLLOUT_PLUGIN_FULL_RESEND_WATERMARK | 全量重发水位快路径(#5403/#5418):插件车道 chat-completions 回合若上一轮响应盖有 x-bili-pf-seq,则用回声计数声明重发前缀(结构扫描,不做全量解析);命中时管线只消费钉存的前缀核 + 新增尾巴窗口(出站字节同源可证;任何疑点当轮回退未动过的全量解析路径并重新盖戳,连续五次计名失配将车道按住一小时)。需客户端把戳回声为 x-bili-pf-count(适配的车道回带;其余车道不会命中)。**实验性灰度**——默认仅约 5% 的安装开启(owner 裁定 2026-11-02:先小流量再 GA;web 面板对全部安装显示一次性公告、快速配置提供三态开关);`true` 强制开、`false`(或百分比)/ env = 0 关。见 TECHNICAL-NOTES.zh-CN.md「全量重发水位快路径」。 |
| `maskHosts` | boolean | true | BILI_LOG_MASK_HOSTS | 日志中把非公开目标主机遮成 <private-host>；凭据头无论此开关如何总是遮盖。 |
| `security.adminRelay` | boolean | false | — | 允许宿主（当前为 dsh web）把它自己入口域名下的整个 /__bili/ 管理面中继到本机代理，使远程浏览器能打开面板（#3373）。默认关闭、仅配置文件。中继跳到达代理时是本机非浏览器客户端（回环源地址 + 回环 Host、无 Origin 头），管理端门槛不变；开启后，凡能访问宿主 web 入口的人都能改配置、写凭据——请先给入口加鉴权/反代。 |
| `subagentSplit` | boolean | true | BILI_SUBAGENT_SPLIT | Claude 子代理拥有独立会话命名空间（<session>\|sub:<agent-id>），不再排队在主会话锁后。仅 anthropic 线路 —— Responses 线路上本开关无效（见 `subagentSplit` / BOTH-mechanisms 作用域说明）。 |
| `personaSplit` | boolean | true | BILI_PERSONA_SPLIT | 当 instructions 文本变化且入站历史不连续时，把按 instructions 指纹分键的 Responses 车道（Claude Code over /v1/responses；Codex 根线程 / 旧版本构建）分叉出去（默认开）。用环境变量 BILI_PERSONA_SPLIT=0 或配置 personaSplit: false 关闭（环境变量优先）。 |
| `forkAdoption` | boolean | false | BILI_FORK_ADOPTION | 匿名 fork 会话继承父会话中源内容完整存在于本次请求里的压缩块。 |
| `autoModeForge.enabled` | boolean | true | BILI_AUTO_MODE_FORGE | Claude Code auto mode 安全分类器请求由 bili 在本地代答放行判定，不再转发上游（#2740）：该旁路零流出、零计费；每条代答写审计日志，会话带提示徽标。false / env 0 恢复纯透传（愿意付费要真判定的用户）。 |
| `affinitySimhash` | boolean | true | BILI_AFFINITY_SIMHASH | 匿名客户端的 simhash 链对齐收养（#2265）：客户端侧大面积装饰性改写（如 Trae 切模型后给每条 assistant 消息重打模型标签）时，重新挂回既有会话并保留压缩状态，而不是每次新铸会话、从零重折。 |
| `resumeInheritance` | boolean | true | BILI_RESUME_INHERITANCE | 以新会话 id 恢复的已识别客户端继承父会话的引用编号与完整存在的压缩块。 |
| `chainContentDetection` | boolean | false | BILI_CHAIN_CONTENT | 按请求体内容识别 bili→bili 链（默认关：正文扫描会对 CCR/模型回声文本误报）；默认仅 x-bili-hop 驱动链识别。 |
| `chainEgressStamp` | boolean | false | BILI_CHAIN_STAMP | 在出口消息上打模型可见的 <bili-chain/> 链完整性标记（默认关：模型会把它当幽灵输入而消耗 token）。 |
| `stableSystemAnchor` | boolean | false | BILI_STABLE_SYSTEM_ANCHOR | 线路层尽力而为的前缀缓存锚点：客户端改动头部 system 时仍重发首次见到的字节（仅纯代理通道）。 |
| `compat` | { roles?, dropFields?, streamErrorShape?, noCacheControl?, keepResponseId? } | {} (disabled) | — | 全局线上兼容块：角色映射、严格 schema 字段剔除、流式错误形态、缓存控制处理。 |
| `compat.roles` | record role → role | {} | — | 把消息角色映射为上游接受的名字（如 developer→system）；仅精确匹配角色，逐 provider 条目按键级胜出。 |
| `compat.dropFields` | string[] (dot paths) | [] | — | 从每个转发请求体中剔除的点路径字段，面向对未知字段返回 400 的严格 schema 网关；全局与逐 provider 列表加法并集。 |
| `compat.streamErrorShape` | "protocol" \| "completion" | protocol | BILI_STREAM_ERROR_SHAPE | 200 已提交后上游流失败的呈现方式：协议原生错误帧（默认）或旧版合成完成形态。 |
| `compat.noCacheControl` | boolean | false | BILI_NO_CACHE_CONTROL | 完全停止 Anthropic 通道的 cache_control 断点打标（面向拒收该字段或有自有断点策略的上游/中继的逃生门）。 |
| `compat.keepResponseId` | boolean | false | ACP_KEEP_RESPONSE_ID | 在内核重建的 Responses 请求上保留 previous_response_id（默认剔除，使重建请求体永不引用上游从未签发过的响应 id）。 |
| `dsh` | object | {} | BILI_ALLOW_DSH_COMPACTION | 段仍被识别，但其原逃生门已移除（#3666，取代 #2028）：allowDshCompaction 键与 BILI_ALLOW_DSH_COMPACTION 环境变量已不存在——dsh 原生压缩现在在所有线路上被无条件拒绝。遗留的 dsh.allowDshCompaction 取值会被忽略（一次性弃用警告）；请改用宿主侧抑制（#3354/#2474）。存活的键——dsh.authoredCompaction、dsh.contextTab、dsh.contextTabLabel——见接下来的条目。 |
| `dsh.authoredCompaction` | boolean | true (on, #3901 flip) | BILI_DSH_AUTHORED_COMPACTION | bili 用折叠快照本地应答 dsh 压缩摘要请求而非拒绝（#3723/#3733）。0.1.203 狗粮窗口守住后默认开启；false（或环境变量 BILI_DSH_AUTHORED_COMPACTION=0）恢复 #1729 拒绝路径。 |
| `dsh.contextTab` | boolean | true | BILI_DSH_CONTEXT_TAB | 是否注册 DSH 顶栏「上下文」会话标签页（#3862/#4237）：false 只移除该标签页——压缩、设置页一节及其余所有入口不受影响。隐藏绝不关闭压缩；账本仍可从设置页（会话子页）、插件 bundle 配置面、Web UI 与 /acp 命令查看。下次页面加载 / dsh 重启生效（槽位注册发生在页面加载时）；默认 true = 现状不变。 |
| `dsh.contextTabLabel` | string | unset (built-in 「上下文」/「Context」) | — | DSH 顶栏上下文标签页的自定义显示名（#4237），例如另一插件（dsh-context）已占用「上下文」时改为"压缩账本"。去空白后的非空字符串优先于内置名；留空或缺省回退内置名。仅文件层（显示偏好，按 #2030 不设 env 开关）。默认缺省 = 内置名不变。 |
| `resign` | scheme → { enabled?, passthrough?, credentialRef? } | {} (armed; built-in scheme sdk-hmac-sha256) | BILI_RESIGN, BILI_RESIGN_PASSTHROUGH, BILI_CODEARTS_REF, BILI_RESIGN_BENEFIT | 按 Authorization 方案键控的重签名臂：可重签名的模型请求全程重签转发；无法重签的请求本地 403 拒绝，除非该方案经 passthrough 选择原文透传。 |
| `promptCache.routing` | "auto" \| "enabled" \| "disabled" | disabled | ACP_PROMPT_CACHE_ROUTING | bili 自注入 `prompt_cache_key` 的姿态（两条 wire 同时生效）；客户端自带的 key 永远原样转发。 |
| `cacheKeepalive.enabled` | boolean | false | BILI_CACHE_KEEPALIVE | Anthropic 线路空闲期提示缓存保活总开关（#3376）：会话空闲时按 TTL 推导的节奏以 max_tokens=1 重放最后一次转发的请求体，维持上游前缀缓存温热；以 usage.cache_read_input_tokens 验证命中，miss/429/连续错误/时长上限即停；支持逐 provider 路由与逐模型覆盖。 |
| `cacheKeepalive.ttlFactor` | number | 0.9 | BILI_CACHE_KEEPALIVE_TTL_FACTOR | 作用于检测/假定缓存 TTL 档位的节奏因子（ping 间隔 = 档位 x 因子；0.9 → 5 分钟档约每 4.5 分钟、1 小时档约每 54 分钟一次）。取值须在 (0, 1]。 |
| `cacheKeepalive.maxDurationMs` | number | 86400000 | BILI_CACHE_KEEPALIVE_MAX_DURATION_MS | 单会话保活时长上限，自其最后一次真实请求起算（默认 24 小时）；超过后即使仍在命中也会解除武装。 |
| `cacheKeepalive.maxConcurrentPings` | number | 4 | BILI_CACHE_KEEPALIVE_MAX_PINGS | 同时武装的会话数上限；超限时先驱逐空闲最久的已武装会话。 |
| `cacheKeepalive.assumeTtl` | "5m" \| "1h" | null (detect from body breakpoints) | BILI_CACHE_KEEPALIVE_ASSUME_TTL | 跳过 body 断点检测，直接按该档位推导节奏——面向会在 bili 下游注入或改写 cache_control TTL、导致转发 body 无断点（或档位不对）的中继/代理。 |
| `cacheKeepalive.armWithoutBreakpoints` | boolean | false | BILI_CACHE_KEEPALIVE_ARM_WITHOUT_BREAKPOINTS | 转发 body 无任何 cache_control 断点时也武装保活（默认关——没有断点就没有显式打断点的内容可刷新；断点由你的中继自管时配合 assumeTtl/intervalMs 使用）。 |
| `cacheKeepalive.intervalMs` | number | null (derive from TTL tier) | BILI_CACHE_KEEPALIVE_INTERVAL_MS | 绝对 ping 间隔（毫秒）；优先于 ttlFactor、assumeTtl 与检测档位。用于不随上游 TTL 策略变化的固定节奏。 |
| `native.attachExternal` | boolean | false | BILI_NATIVE_ATTACH_EXTERNAL | 允许无启动器的原生插件挂到外部（车道化、未武装看门狗）守护进程，而不是自行派生。 |
| `native.attachLanePriority` | string[] | [] (own lane → user zone → spawn) | — | 本 lane 没有自己的实例时可搭车的外部 lane 名字有序列表（#2905）。本 lane 永远第一；用户区（手动 bili start、8787 全局）永远最后；未列出的 lane 仍不可挂。仅配置文件，无 env。 |
| `native.attachPolicy` | "own-lane" \| "global-fallback" | own-lane | BILI_NATIVE_ATTACH_POLICY | native hook 附着的 lane 亲和，也是是否发生跨 lane 搭车的总闸（#2877）。own-lane（默认）：lane 型 hook 只搭同 lane 的守护；没有时自行派生，而不是回落到无 lane / 手动启动的 bili start 守护或其他 lane 的守护（那种汇聚会把所有 agent 钉死在一台守护的版本上并双写会话）；已武装的无 lane 守护（受管共享代理，#1225）在两种策略下都可被搭车。global-fallback 恢复 #2877 之前的行为：先同 lane，再兼容的无 lane/用户区守护，以及（配 attachLanePriority）列出的外部 lane。 |
| `native.attachUrl` | string | unset (discover per lane) | BILI_MCP_PROXY | native hook 附着的显式目标源（任意 URL）。设置后，hook 只附着到该精确 origin 而不是自动发现，若其不在线则自行派生；仍需代码兼容并通过生命周期门禁。BILI_MCP_PROXY 环境变量（CLI --origin 亦会设置它）优先于此文件值；空/空白视为未设置。 |
| `claude.nativePort` | number | unset (lane sticky zone port) | BILI_CLAUDE_NATIVE_PORT | claude 原生车道钩子派生代理的精确端口钉死（严格端口：被占用时响亮拒绝而非跳端口）。 |
| `pi.subagents` | object \| boolean | {} (acp_delegate enabled with package defaults) | PI_ACP_DELEGATE_FORCE_ENABLE, PI_ACP_DELEGATE_MAX_DEPTH, PI_ACP_DELEGATE_SYNC_TIMEOUT_MINUTES, PI_ACP_DELEGATE_IDLE_TIMEOUT_MINUTES, PI_ACP_DELEGATE_ASYNC_TIMEOUT_MINUTES, PI_ACP_DELEGATE_MAX_CONCURRENT | 内置 pi lane 子代理（acp_delegate）面（#2230 配置搬家）。billion-context.json 的 pi.subagents 段拥有 delegate 配置；acp.json 四键（delegate/delegatePrompt/displayUsage/debug）为已废弃回退源，仅段缺失时读取。prompt 取代 delegatePrompt；debug 限定子代理子系统。布尔简写 subagents: false 整体关闭。完整字段表见 CONFIGURATION.md 的 pi 段。 |
| `pi.inline` | boolean | true (unset env+file runs inline) | BILI_PI_INLINE | pi 内联压缩通道（#3278；自 #5428 起默认开启，取代 #4687 的手动开启规则）：pi 扩展的压缩在进程内完成——不派生代理进程、无临时端口；模型流量与 /__bili//__acp 工具面由进程内引擎经伪源站服务，codex 的 Responses WebSocket 通道走随引擎启动的仅回环 WS 桥，Web UI 走随引擎启动的仅回环监听。未设置 env+文件时默认内联；显式宣告的附着目标（launcher 预置的 BILLION_CONTEXT_PROXY/ATTACH）仍压过默认，`bili pi` 照旧用 launcher 代理。不想用就 BILI_PI_INLINE=0/false/no/off 或本键设 false——恢复旧的 attach/spawn 姿态。解析顺序 env > 文件 > 默认；显式开启永远压过附着目标。人类入口:`bili -i/--inline pi`(≡ 一键车道)与 `bili -s/--server pi`(钉死代理姿态,压过继承的内联变量)。 |
| `opencode.inline` | boolean | false | BILI_OPENCODE_INLINE | opencode 内联压缩通道（#3278 移植；需手动开启——按 #4687 决定，默认仍是派生代理）：opencode 插件的压缩在进程内完成——不派生代理进程、无临时端口、无 MITM 证书；模型流量与 /__bili/ 工具面由进程内引擎经伪源站服务（已在 Bun 宿主验证）。设 true（或 BILI_OPENCODE_INLINE=1）开启。解析顺序 env > 文件；显式开启永远压过附着目标，未设置时行为与旧版一致（attach/spawn）。`bili opencode-inline` 一键车道。 |

**MITM 通道**

| Key | Type | Default | Env | Description |
|-----|------|---------|-----|-------------|
| `providersPath` | string | unset | ACP_PROVIDERS | 外部 providers.json 路径（遗留/共享路由文件）；优先于内联 providers 与配置文件位置。 |
| `mitm.enabled` | boolean | true | BILI_MITM | 面向写死 HTTPS 上游的登录客户端的拦截开关；域名首次发现即加入白名单。 |
| `mitm.domains` | string[] | [] | BILI_MITM_DOMAINS | 显式 MITM 白名单域名（与首次发现的自动白名单取并集）。 |
| `mitm.handshakeTimeoutMs` | number | 10000 | BILI_MITM_HANDSHAKE_TIMEOUT_MS | 被拦截连接的 TLS 握手超时。 |

**进程级配置块**

| Key | Type | Default | Env | Description |
|-----|------|---------|-----|-------------|
| `network` | object | {} (all defaults) | — | 上游调用的传输超时、看门狗与重放策略。 |
| `network.upstreamTimeoutMs` | number | 720000 | BILI_UPSTREAM_TIMEOUT_MS | 单次上游调用的硬上限（12 分钟覆盖慢速深度思考模型）。 |
| `network.requestWatchdogMs` | number | 2× upstreamTimeoutMs | BILI_REQUEST_WATCHDOG_MS | 绝对看门狗：即使按调用计时器从未挂上，也强制中止卡死的上游套接字。 |
| `network.keepAliveTimeoutMs` | number | 5000 | BILI_KEEP_ALIVE_TIMEOUT_MS | 连接池内上游套接字的空闲保活超时。 |
| `network.clientErrorBackstopMs` | number | 30000 | BILI_CLIENT_ERROR_BACKSTOP_MS | 中止停止读取已提交响应的客户端连接的兜底超时。 |
| `network.exposureLogIntervalMs` | number | 3600000 (0 disables the log) | BILI_EXPOSURE_LOG_INTERVAL_MS | 绑定地址暴露警告在日志中的重复间隔；0 完全禁用。 |
| `network.streamKeepAliveMs` | number | 15000 (0 disables) | BILI_STREAM_KEEPALIVE_MS | 模型块之间的下游流保活心跳间隔；0 禁用心跳。 |
| `network.preflightHoldMs` | number | 30000 | BILI_PREFLIGHT_HOLD_MS | preflight 失败后，允许请求未校准放行的持有时长。 |
| `network.preflightDeadEndCooldownMs` | number | 300000 | BILI_PREFLIGHT_DEAD_END_COOLDOWN_MS | 死胡同 preflight 后，对同一会话重试校准的冷却时长。 |
| `network.replayRetryMax` | number | 3 (1 disables replays) | BILI_REPLAY_RETRY_MAX | 同一请求在向上游暴露错误前的最大传输失败重放次数。 |
| `network.replayRetryBaseMs` | number | 1500 (0 disables the delay) | BILI_REPLAY_RETRY_BASE_MS | 重放之间的基础退避延迟（指数增长）。 |
| `network.throttle429Enabled` | boolean | true | BILI_THROTTLE_429 | 出站 429 治理器（#4204）：连续上游 429 会在本地应答而不再转发。账号限额及无法识别/格式错误的响应按 origin+凭据持有；只有 KeyRing 精确返回 `keyring_model_temporarily_unavailable` 且响应模型与请求模型完全相同时，才按 origin+凭据+模型持有，让其他模型继续可用。模型不匹配或缺失仍按账号级处理；设为 false 恢复旧的总是转发行为。 |
| `network.throttle429MaxConsecutive` | number | 5 | BILI_THROTTLE_429_MAX_CONSECUTIVE | 连续上游 429 达到该次数后 hold 转为终局（本地 424，不在任何已知 SDK 重试集合内）；每个退避窗口仍放行一次探测，直到账号级 hold 收到任意非 429 响应，或模型级 hold 收到同一模型的非 429 响应后清除。 |
| `network.throttle429BaseDelayMs` | number | 2000 | BILI_THROTTLE_429_BASE_DELAY_MS | 429 hold 的基础退避（每连续一次 429 翻倍、抖动到 [0.5×, 1×]、以 throttle429MaxDelayMs 封顶；上游 Retry-After 更大时优先）。 |
| `network.throttle429MaxDelayMs` | number | 30000 | BILI_THROTTLE_429_MAX_DELAY_MS | 429 hold 退避的上限，也是终局阶段探测间隔的上限。 |
| `network.throttle429Scope` | string | credential | BILI_THROTTLE_429_SCOPE | 无标记上游 429 的 hold 粒度（#5199）。`credential`（默认）保持 #5696 的保守语义——凡未携带可识别模型标记（`keyring_model_temporarily_unavailable`，或 bili 中继的 `bili_throttle_hold` scope=model）的 429 均按整个 origin+凭据持有，该凭据下所有模型一起退避等待。`model` 改按发送请求的模型分桶持有，适用于单凭据背后多模型独立限流的网关（LiteLLM/one-api/opencode.ai 类中继，一个模型的 RPM 耗尽不应冻结兄弟模型）；无法识别模型的请求仍按凭据级持有，两种模式下已识别标记的语义均不变。 |
| `network.maxShrinkPerCompress` | number | unset | BILI_MAX_SHRINK_PER_COMPRESS | 单次压缩允许收缩历史的上限（防塌缩护栏）。 |
| `network.proxyKeepAliveMaxMs` | number | 55000 (0 = one-shot connections) | BILI_PROXY_KEEPALIVE_MAX_MS | 经出站代理的连接最大存活时长，到期强制重建（规避陈旧 NAT 映射）。 |
| `network.postResponseLingerMs` | number | 5000 | BILI_POST_RESPONSE_LINGER_MS | 代理主动发起的响应后关闭的优雅关闭预算：socket 挂起等待对端 FIN/TLS close_notify，到点销毁（reason=linger-backstop）。 |
| `network.allowPrivateHttpProviders` | boolean | false | BILI_ALLOW_PRIVATE_HTTP_PROVIDERS | 可选开关（#2984）：允许私网（RFC1918、127/8、link-local、ULA、*.local/.lan/.internal）明文 HTTP provider 进入 agent-registry 接收与摘要端点守卫。默认关——明文仅回环受信；公网 IP/域名与 CGNAT（100.64/10）无论如何都拒。1/true 启用。 |
| `network.receiveBodyBytes` | number | 5368709120 | BILI_RECEIVE_BODY_BYTES | 单请求读入内存的入站 wire 字节上限，超限在 receive 阶段返回 413。由硬编码 100 MiB 提升到 5 GiB（#3128 owner 决定），使多 GB 单请求被接受而非断连。同时也是解码请求占用两个共享大解码准入槽位的阈值。WebSocket lane 保持固定 100 MiB 表面。 |
| `network.decodedBodyBytes` | number | 10737418240 | BILI_DECODED_BODY_BYTES | content-encoding 解压（gzip/deflate/br/zstd）后的解码字节上限，解码过程中增量检查（decode 阶段 413）。默认为接收预算的 2 倍，沿用旧的 decode=2×wire 关系；用于防解压炸弹。 |
| `network.outboundBodyBytes` | number | 5368709120 | BILI_OUTBOUND_BODY_BYTES | 转发到上游的重建请求字节上限（forward 阶段 413），按最终 body 字符串的 UTF-8 字节计。在 fetch 之前检查，超预算的重建不会触发上游看门狗分配。 |
| `network.wsOutboundBytes` | number | 10485760 | BILI_WS_OUTBOUND_BYTES | 仅针对 WebSocket 通道的软字节预算（#3701）：当最终序列化的 Responses WS 帧超出该预算时，优先从出站副本中裁减较早的图片（归档为占位符备注——原始文件仍保留在会话存储中，可通过 read_original_image / decompress 恢复——仅限注册了 bili 工具的通道；拒绝注入工具的 codex 类通道只有尺寸备注），随后对剩余内容通过 jimp maxDim 阶梯进行有界降采样。若帧仍超出限制且上游在任何事件发出前即以 1009 关闭连接，则在同一请求内尝试一次严格更小的重发。设为 0 可禁用裁减（即恢复此前的原样发送行为）。HTTP 通道不受影响——硬性拒绝上限仍为 network.outboundBodyBytes。 |
| `network.httpOutboundBytes` | number | 10485760 | BILI_HTTP_OUTBOUND_BYTES | 面向普通/代理/pi 原生 HTTP 中继通道的软字节预算（#3909）：当最终序列化的请求超出该预算时，优先从出站副本中裁减较早的图片（归档为占位符备注——原始文件仍保留在会话存储中，可通过 read_original_image / decompress 恢复——仅限注册了 bili 工具的通道；拒绝注入工具的 codex 类通道只有尺寸备注），随后对剩余内容通过 jimp maxDim 阶梯进行有界降采样。它补上图片密集会话留下的缺口：token 空间折叠按 token 决策，而上游按字节/像素解码 CPU 拒收（Cloudflare Worker 503），于是 ~48 MiB 的请求会永远 503、每次重试都重发同样的像素。仅在未安装受管传输（即 spawn 出来的中继）时生效；WebSocket 通道用 network.wsOutboundBytes，受管 HTTP 传输（inline-engine / dsh-inline）在此从不裁减（#3701 Finding 1）。设为 0 可禁用（恢复此前的原样发送）；硬性拒绝上限仍为 network.outboundBodyBytes。 |
| `network.caFile` | string | unset | BILI_CA_FILE | PEM 文件路径，包含要额外信任的根 CA（#3776），仅作用于 bili 自己的上游 fetch。与 Node 内置根证书及 NODE_EXTRA_CA_CERTS 中的条目合并——从不替换。安全软件做 HTTPS/加密连接扫描（卡巴斯基、企业 DLP）或企业 MITM 代理重签上游时使用：把该厂商根证书导出为 PEM 并指向此键。未设置 = 默认信任，行为逐字节不变。 |
| `guardrails` | object | {} (all defaults) | — | 守卫集合：pi/omp 插件的工具输出守卫（#3066）及代理侧流式 text-run 守卫（#3406）。 |
| `guardrails.bashTimeout` | number | 60 | BILI_GUARDRAIL_BASH_TIMEOUT | 模型未写 timeout 时注入到 bash 工具的秒数（#3066 owner 有意为之，#3366 重申：无人看管的 bash 会把 pi 会话挂死一整天——宿主 schema 本身无默认值）。设 N 调整秒数，设 0 关闭注入（恢复 pi 原生行为）。 |
| `guardrails.maxOutputBytes` | number | 50000 | BILI_GUARDRAIL_MAX_OUTPUT_BYTES | pi/omp 插件中每个工具结果的文本输出合计字节上限（0 禁用）。超限输出从头截断并附指向宿主已存完整输出的提示。 |
| `guardrails.repetition` | boolean \| object | true | BILI_GUARDRAIL_REPETITION | pi/omp 插件的同一调用循环破除器：快速连续的相同调用（参数比较忽略键序；上一次相同调用若实际执行 ≥5s 视为长轮询并重新计数）从第 3 次起随结果附警告；第 5 次只拒绝这一次调用并发出明确的最后警告（回合保留，合法的等待/轮询此时可改成一次更长的等待继续）；被拒之后仍一字不差地重发同样调用才终止整个回合（#5225）。对象形式另接受 `enabled`（默认 true，总开关）、`warn`（默认 3，警告阈值）、`abort`（默认 5，最终拒绝阈值）和 `recovery`（默认 false，选择性的优雅终止模式：调用 6 至 (abort+4) 次被拒绝并附卡死报告（回合保留、不中断宿主回合），直到同一调用连续达到 abort+5 次才强制终止回合（#5505））。false 或 env 0 关闭。对象子字段仅限配置文件（不通过环境变量暴露）。 |
| `guardrails.repetition.enabled` | boolean | true | — (file-only) | 使用对象形式时控制调用循环破除器的开关。true（默认）启用；false 禁用。简单禁用请用 `repetition: false`（布尔形式）。 |
| `guardrails.repetition.warn` | number | 3 | — (file-only) | 首次警告阈值。从第 N 次起，相同调用会在结果中附带 WARNING 通知（#3066）。必须小于 `abort`。 |
| `guardrails.repetition.abort` | number | 5 | — (file-only) | 最终拒绝阈值。此计数之后的下一次相同调用会被阻止并拒绝执行，附带 FINAL WARNING（#5225）。必须大于 `warn`。 |
| `guardrails.repetition.recovery` | boolean | false | — (file-only) | 选择性的优雅终止模式（#5505）。开启后，最终拒绝（abort）之后的相同调用被拒绝并附卡死报告（软停止，回合保留）。同一调用连续达到 abort+5 次时才强制终止回合（硬保底，默认 10）。false（默认）= 原始行为：第 6 次调用时 ctx.abort()。 |
| `guardrails.textRunThreshold` | number | 200 | BILI_GUARDRAIL_TEXT_RUN_THRESHOLD | 响应流上解码后模型文本的单字符重复破除器（#3260；#3331 审查后由 #3406 第 1 项补上开关）。连续 N 个相同码点即触发——正常文本远低于默认 200，符号循环的模型会撞上。设 N 调整阈值，设 0（或负数）关闭：合法的长同字符输出（代码注释分隔线、ASCII 分隔线）不会再被中途掐断。thinking/reasoning 通道也在该守卫内。 |
| `persist` | object | {} (all defaults) | — | 会话落盘持久化（XDG state 目录之下）。 |
| `persist.enabled` | boolean | true | BILI_PERSIST | 会话记录落盘总开关（0/false 关闭）。 |
| `persist.zstd` | boolean | false | BILI_PERSIST_ZSTD | zstd 压缩持久化会话文件（1/true 启用）。 |
| `persist.debounceMs` | number | 500 | BILI_PERSIST_DEBOUNCE_MS | 会话文件写入的去抖窗口。 |
| `persist.tailTokens` | number | 16384 (0 disables message persistence) | BILI_PERSIST_TAIL_TOKENS | 为导出保真保留的最近消息原文 token 尾部大小。 |
| `persist.epermAlertThreshold` | number | 5 | BILI_PERSIST_EPERM_ALERT_THRESHOLD | 连续 EPERM 写失败达到该次数后在日志中告警。 |
| `persist.epermAlertRepeatMs` | number | 0 (no repeats) | BILI_PERSIST_EPERM_ALERT_REPEAT_MS | EPERM 告警的重复间隔；0 只记录一次。 |
| `storage` | object | {} (all defaults) | — | 统一 SQLite 存储边车设置（#2671）。 |
| `storage.unified` | legacy\|shadow\|full | unset (full) | BILI_STORAGE_UNIFIED | 分层存储迁移开关（#2671）：shadow = 统一 SQLite 双写干跑 + digest 对账；full = 平替读路径（unified-first 加载 + 有机导入 + legacy 兜底）。两处均未设置时默认 full（#3818 翻转 —— shadow 干跑自 #2815 起对账一直干净，索引因此成为默认加载路径；JSON 信封照写，legacy 仍是一行逃生口）。文件层只接受 legacy/shadow/full；环境变量层还接受 1/true（=shadow）与 unified（=full）并优先于文件。每个 lane 启动时解析一次 —— 热改动需重启生效。加密（BILI_ENCRYPTION_KEY）会硬阻断边车。 |
| `storage.backend` | sqlite\|mysql | unset (sqlite) | BILI_STORAGE_BACKEND | 存储后端选择（#3388 / #3931）：统一存储消费操作级的异步 StorageBackend 契约。sqlite 为默认（现有 UnifiedStore 套一层 Promise 包装适配器）。mysql 已完整接线（第二+三步）：openBackend("mysql", dsn) 打开真正的 MysqlBackend,对接 MySQL 8.0 —— 完整契约面（带 CAS 引用计数的 ingest、读取、session_ext、收割台账、归档/恢复/GC、checkpoint、会话绑定）,mysql2 作为常规依赖打包并按需懒加载（从不选 mysql 的启动永不加载它）。代理热路径经异步影子 facade 接线：保存进串行后端队列（水位 delta、孤儿/收割台账、digest 采样 —— sqlite 保持零 await 同步快车道不变）,同步读走 JSON 信封（sidecar 经 ready() 异步挂载;viewFor/importRecord 同步面按设计 miss）,replicas/ext/GC/export/fork 走异步孪生（#4911：fork 车道经它们 await lastLiveSeq + 行克隆；fold-anchor 回填/快照渲染用的同步窗口读按设计仍走信封）。writerOff 仅 sqlite（信封就是 mysql 的同步读路径）。未知名字回退 sqlite 并提示。每个 lane 启动时解析一次。 |
| `storage.mysql.dsn` | string | unset | BILI_MYSQL_DSN | storage.backend="mysql" 的 MySQL DSN（#3388 第二步，#3931）：mysql://user:pass@host:3306/db。由 StorageBackend 契约路径消费（含热路径 —— 异步影子队列）。环境变量 BILI_MYSQL_DSN 优先于文件键。空/未设置 = mysql 后端无法打开 —— 文档化错误会同时列出两个旋钮和可用的默认值。 |
| `storage.sqliteAutoDownload` | boolean | true | BILI_SQLITE_AUTO_DOWNLOAD | SQLite 引擎一次性自下载的闸门（#2833）：进程内没有可用引擎（无内置 node:sqlite、宿主未装 better-sqlite3）且本平台希望启用统一边车时，bili 从 npm registry 一次性下载钉死的 better-sqlite3 预编译 tarball（约 11 MB，sha512 校验）到缓存目录，之后每次启动复用。引擎解析顺序：内置 node:sqlite（Node >= 22.5）-> 宿主机已装的 better-sqlite3 -> 缓存的自下载副本 -> 自下载（本开关控制）-> 无引擎（仅 legacy，即 #2825 降级契约）。开关只控制网络下载 —— 为 false 时缓存副本仍会使用；不支持的平台永不下载。 tarball 下载内置镜像列表兜底（#3338）：先试配置的 registry（BILI_UPDATE_REGISTRY / update.registry），再试 https://registry.npmjs.org、https://registry.npmmirror.com —— 第一个通过 sha512 校验的镜像生效；Node < 22.5 且无引擎时，降级原因会给出明确的 Node 升级提示（#3385）。引擎产物按运行时特性分别钉死，因为 binding 无法在包自身声明的范围之外加载：Node >= 22 且 N-API >= 10 用 better-sqlite3 v13（单个 tarball 自带 prebuilds），而 Node 20 与 Node 22.0–22.12（满足 v13 的大版本下限但只带 N-API 9）用 v12.9.0（纯 JS tarball 加与之 ABI 匹配的 prebuild，从二进制镜像获取并经 nativeBinding 注入）—— 低版本 Node 因此留在统一存储车道上，而不是降级到 legacy。任何钉死产物都不支持的运行时（低于所有下限，或 ABI 无对应 prebuild）会在加载之前被拒绝，下载与缓存副本注册都不进行 —— 在那里加载该 binding 会让进程崩溃，而不是优雅失败（#3341、#3894）。下载失败会置一个 6 小时的重试冷却，以标记文件形式持久化在缓存目录下（billion-context/sqlite/.bootstrap-failed.json）；storage 诊断块会显示该标记的绝对到期时间与路径 —— 删除该文件并重启 bili 即可强制立即重试，不必等完整个冷却窗口（#3788）。 |
| `storage.jsonWriter` | on\|off | on | BILI_STORAGE_JSON_WRITER | Phase 3 信封开关（#2960）：off 时若 storage.unified 为 full 则不再写 legacy JSON 会话信封 —— SQLite 索引成为唯一持久化副本（读路径本就 unified-first；boot 枚举索引并集，纯索引会话可正常加载）。仅在有效 full 模式下生效：shadow/legacy（或加密激活）下请求会被忽略并警告一次，因为 JSON 文件仍是唯一事实源。环境变量层 0/false/off = off、1/true/on = on，优先于严格拼写的文件层。失败安全：若边车运行中自禁用，下次保存即恢复信封写入。回滚：去掉该开关 —— 写入恢复，纯索引会话经 boot 并集继续可加载，replicas/restore 可重新物化可移植的 JSON 信封。降级二进制（或丢失 SQLite 引擎）会让纯索引会话在 v0.1.196 及更早版本上不可见，直到重新运行 >=v0.1.197 —— 数据在 index.db 中完好无损，只是旧代码不读它。每会话的 content-store 边车无论开关如何都照写。jsonWriter=off 的 lane 必须是其会话目录的唯一写者：off lane 读路径 unified-first、永不回退到文件，因此同一目录上跑 legacy/shadow 的对等实例会静默分叉（它的 JSON 副本收不到更新，off lane 也看不到对等实例的写入）。 |
| `storage.walJournalSizeLimitBytes` | number | 8388608 | BILI_STORAGE_WAL_JOURNAL_SIZE_LIMIT_BYTES | index.db-wal 的 WAL 回收上限（#3250），单位字节：每次完成的 checkpoint 把 WAL 文件截回该大小，约束长驻进程的磁盘占用与崩溃恢复重放。不是每会话数据配额 —— 数据写入时就已落进 index.db，WAL 只是两次 checkpoint 之间的帧暂存区，会话数量/大小不会放大它；大 burst 可能暂时超出，直到下一次完成的 checkpoint 截回。调大 = truncate IO 更稀疏，但稳态磁盘占用更多、崩溃恢复重放尾更长。环境变量层（正整数）优先于配置文件层；env 值非法或非正数时静默落到文件/默认层，boot 不崩。lane 启动、store open 时生效 —— 热改动需重启。实际取值会出现在 unified-enable 日志行与 storage 诊断块中。 |
| `storage.archiveAfterDays` | integer | 365 | BILI_STORAGE_ARCHIVE_AFTER_DAYS | GC 年龄清扫窗口（天，#3463/#3901）：闲置超过该时长的会话被归档 —— 以单行 JSON 追加到单一归档日志（会话目录下的 archive/archive.jsonl——不撒每会话小文件），墓碑行保留标签与身份，释放内容/媒体引用，一条 POST 即可恢复。0 关闭年龄清扫；POST /__bili/storage/gc 始终可用并支持 ?vacuum=full 收缩存量 index.db（新写入始终 auto_vacuum=INCREMENTAL）。同一套操作另有 CLI 层（#3928）：bili storage gc [--days N] [--vacuum full\|incremental] [--dry-run]，以及 bili sessions ls/rm/archive/restore <id>（README「存储维护 CLI」一节）。环境变量优先于配置文件层。 |
| `sessions` | object | {} (all defaults) | — | 会话表容量上限与可选垃圾回收。 |
| `sessions.max` | number | 256 | BILI_MAX_SESSIONS | 内存会话表上限（空闲会话 LRU 逐出）。 |
| `sessions.warmMax` | number | 0 | BILI_SESSION_WARM_MAX | 有界启动（#2803/#3050）：启动监听前预热加载的最近保存会话数上限，更早的状态按需重新加载。默认 0（不预热——首次访问按需加载一次；设 8 恢复预热行为）。受 sessions.max 封顶。 |
| `sessions.warmMaxBytes` | number | 67108864 | BILI_SESSION_WARM_MAX_BYTES | 启动预热集的解码字节预算（#2803）。按解码后大小计而非磁盘压缩字节，zstd 归档无法绕过内存上限；单文件超预算则永不预热。 |
| `sessions.residentMaxBytes` | number | 4294967296 | BILI_SESSION_RESIDENT_MAX_BYTES | 驻留会话估算字节的软目标（#2803；#5779 从 512 MiB 提高到 4 GiB——单个会话经常就超过半 GiB，旧预算下会被反复逐出、永远驻留不下来）。活跃/在途状态始终固定保留；超过目标时，空闲状态随请求完成回写磁盘释放。内存小的机器可调低。 |
| `sessions.hardMaxBytes` | number | (same as `sessions.residentMaxBytes`) | BILI_SESSION_RESIDENT_HARD_MAX_BYTES | 单会话驻留字节的硬上限（#4788，决策 #4792 D1-A）。不同于池软上限——它只能逐出其他冷会话、从不触碰唯一活跃会话——它约束单个会话：在请求结束边界超过上限时，其可丢弃字段（已折叠块的原文、元数据账本、超出有界视图的原始尾巴）会被强制回写磁盘，即使该会话被池逐出豁免；下一轮通过窄盘读透明地重新读取所需内容。只要上一次保存已被证明落盘，安全丢弃就在每个请求边界运行；该上限额外加入单会话告警（warn，限流至 60 秒）。`0` 关闭该检查。 |
| `sessions.contentStorePin` | boolean | false | BILI_SESSION_CONTENT_STORE_PIN | #4788 二期驻留丢弃的逃生门：把会话内容存储钉在内存（永不折叠）。默认关闭：每次已证明落盘的保存之后，空闲会话的内容存储在请求间隙被释放，需要时从统一索引镜像或伴生文件按需重读；没有可证明落盘副本的会话（如新建 fork 子会话）自动保持驻留。需要零重读延迟且愿意用内存换时可设此项。 |
| `sessions.gc.enabled` | boolean | false | BILI_SESSION_GC | 过期持久化会话的可选垃圾回收（未开启时用户数据绝不被悄悄清理）。 |
| `sessions.gc.maxAgeDays` | number | 7 | BILI_SESSION_GC_MAX_AGE_DAYS | GC 年龄阈值（天）。 |
| `sessions.gc.maxTokens` | number | 1000000 | BILI_SESSION_GC_MAX_TOKENS | GC 单会话记录的 token 大小阈值。 |
| `sessions.gc.intervalMs` | number | 3600000 | BILI_SESSION_GC_INTERVAL_MS | GC 清扫间隔。 |
| `plugin.snapshotCapBytes` | number | 104857600 (0 disables snapshots) | BILI_PUBLIC_SNAPSHOT_CAP_BYTES | 提供给原生插件的 fork API 公共快照大小上限。 |
| `snapshot.shadow` | boolean | true (on) | — | 快照渲染影子对账（#3756 后续）：渲染车道仍处灰度关闭时，每轮已折叠会话都现算一次快照视图，与 legacy 实际出站比对分类，逐会话记账（web 面板行 + /__bili/status snapshotShadow 汇总 + snapshot-shadow 诊断主题）。默认开 —— 这是全舰队干跑，其错误率决定灰度翻转。环境变量 BILI_SNAPSHOT_SHADOW 优先。不想要每轮额外计算可用 false/0/off 关闭。 |

**更新与公告**

| Key | Type | Default | Env | Description |
|-----|------|---------|-----|-------------|
| `autoUpdate` | boolean | true | ACP_AUTO_UPDATE | 自动 npm 版本检查（约每 3 分钟）；ACP_AUTO_UPDATE=0 或 --no-auto-update 关闭。 |
| `autoRestartOnUpdate` | boolean | false | ACP_AUTO_RESTART_ON_UPDATE | 新版本装好后自动重启守护进程。 |
| `updateTag` | string | latest | ACP_UPDATE_TAG | 自更新的 npm dist-tag 通道：latest（默认）、dev 或 pr。 |
| `update` | object | {} (all defaults) | — | 自更新通道设置。 |
| `update.registry` | string | "npmjs" (registry.npmjs.org) | BILI_UPDATE_REGISTRY | 自更新用的自定义 npm registry 基础地址（私有镜像）。 |
| `update.checkIntervalMs` | number | 180000 | BILI_UPDATE_CHECK_INTERVAL_MS | npm registry 版本检查间隔。 |
| `update.staggerMinDelayMs` | number \| string | 900000 (built-in 15 min) | BILI_UPDATE_STAGGER_MIN_MS | #3619 错峰升级：本机基础升级延迟窗口下限；毫秒数字或时长字符串（15m / 2d / 1d12h）；0 = 禁用延迟（恢复立即升级）。远端策略的 default 窗口与按版本 overrides 叠加在其上。 |
| `update.staggerMaxDelayMs` | number \| string | 172800000 (built-in 48 h) | BILI_UPDATE_STAGGER_MAX_MS | #3619 错峰升级：本机基础升级延迟窗口上限；毫秒数字或时长字符串（48h / 2d）；与 min=0 一起恢复立即升级。 |
| `update.policyUrl` | string | official repo raw URL | BILI_UPDATE_POLICY_URL | 远端自动更新策略文件的覆盖地址（测试接缝——生产固定指向官方仓库）。 |
| `advisoryCheck` | boolean | true | BILI_ADVISORY_CHECK | 关键缺陷公告监视器；本机版本命中受影响范围时装填推荐修复版本。 |
| `advisoryUrl` | string | unset (built-in feed) | BILI_ADVISORY_URL | 公告源覆盖地址。 |
| `remoteAnnouncementsUrl` | string | unset (official feed: GitHub master announcements/remote.json) | BILI_ANNOUNCEMENTS_URL | 远程公告源覆盖地址（#5548）：JSON 文档 {v: 1, entries: [...]}，记录格式与本地公告文件一致；与其他监视器一样约每 3 分钟拉取一次，缓存快照可跨重启/断网存活。无法直连的安装把它指向中继镜像；坏推送会被拒绝并继续显示上一份有效公告。配置目录 announcements/*.json 的本地文件按同 id 覆盖远程/内置公告。 |
| `releaseNotesCheck` | boolean | true | BILI_RELEASE_NOTES_CHECK | Web 面板里的发布说明源（只抓取缓存、从不安装任何东西）。 |
| `releaseNotesUrl` | string | unset (built-in feed) | BILI_RELEASE_NOTES_URL | 发布说明源覆盖地址。 |

**诊断与调优**

| Key | Type | Default | Env | Description |
|-----|------|---------|-----|-------------|
| `diagnostics` | object | {} (all defaults) | — | 本地排障旋钮（转储、渲染/注入开关、count-tokens 透传）。 |
| `diagnostics.dumpBody` | boolean | false | ACP_DUMP_BODY | 把完整请求/响应体转储到日志用于排障。转储内容为明文，可能包含凭据——分享前必须清洗（#4482）。 |
| `diagnostics.dumpReq` | boolean | true | ACP_DUMP_REQ | 逐次调用记录发往上游的请求元数据；开启 dumpBody 时同时是明文请求体转储的闸门（分享前必须清洗，#4482）。 |
| `diagnostics.rawDumpDir` | string | <state dir>/raw | ACP_RAW_DUMP_DIR | 原始线路转储目录。 |
| `diagnostics.dump4xx` | boolean | false | BILI_DUMP_4XX | 把上游 4xx 响应落盘以便事后检查。转储内容为明文，可能包含凭据——分享前必须清洗（#4482）。 |
| `diagnostics.dump4xxMaxBytes` | number | 2097152 (floor 1024) | BILI_DUMP_4XX_MAX_BYTES | 单个 4xx 转储文件的大小上限。 |
| `diagnostics.maxTotalBytes` | number | unset (off) | BILI_DUMP_MAX_TOTAL_BYTES | 调试转储目录（dumps/、raw/、SSE dump 目录）的总大小上限；超限时按最旧优先删除（下限 1 MiB）。转储默认无任何轮转，持续捕获下每天可增长数十 GB（#2412）。 |
| `diagnostics.maxAgeDays` | number | unset (off) | BILI_DUMP_MAX_AGE_DAYS | 调试转储目录的保留天数上限；超过该天数的文件被删除（下限 1 小时）。默认关闭。 |
| `diagnostics.renderNone` | boolean | false | ACP_RENDER_NONE | 禁用所有 ACP 标签渲染（原始线路研究模式）。 |
| `diagnostics.invariantJudge` | boolean | true | BILI_INVARIANT_JUDGE | 保持 I1/I2 出站不变量判官以 L1 advisory 形态开启（#3938）：每笔请求的出站字节都与客户端入站历史对账，违规以 warn 记录、干净判定以 debug 记录，绝不阻塞流量。设为 false 或 BILI_INVARIANT_JUDGE=0 可静默。 |
| `diagnostics.noInjectTool` | boolean | false | ACP_NO_INJECT_TOOL | 停止向请求注入 acp_compress 工具定义。 |
| `diagnostics.noCompressPrompt` | boolean | false | ACP_NO_COMPRESS_PROMPT | 停止向系统提示词附加压缩教条文本。 |
| `diagnostics.countTokensPassthrough` | boolean | false | ACP_COUNT_TOKENS_PASSTHROUGH | 把 /v1/messages/count_tokens 转发给上游，而不是本地应答。 |
| `diagnostics.compressProtocol` | "tools" \| "marker" | "tools" | ACP_COMPRESS_PROTOCOL | 压缩的 ACP 注入面：原生工具（默认）或旧版提示词标记。 |
| `fakeCompletion` | object | {} (all defaults) | — | 末块被截断时重新发起请求的重试环。 |
| `fakeCompletion.retries` | number | 0 (opt-in) | BILI_FAKE_COMPLETION_RETRIES | 被截断的末块完成可被重新请求的次数；0 禁用该重试环。 |
| `fakeCompletion.bufCapBytes` | number | 16777216 | BILI_FAKE_BUF_CAP | 重试环累积流缓冲的大小上限。 |
| `codexCompact` | "intercept" \| "pass" | "intercept" | BILI_CODEX_COMPACT | 在 bili 内处理 Codex 的压缩请求（intercept，默认）还是转给上游（pass）：覆盖显式形态（compaction_trigger + /responses/compact）与以普通请求形态过线的内联自动压缩（按 SUMMARIZATION_PROMPT 模板检测，#3008）—— 用户自定义 compact_prompt 后锚点失配、按原样转发；bili 仅旁路观察到的压缩（pass/安全阀放行）走事后 rebase（#2372）。 |
| `ccrRetrievalTtlMs` | number | 600000 (0 disables retrieval) | BILI_CCR_RETRIEVAL_TTL_MS | CCR 回取指针的有效期，过期后原文不再可通过 acp_retrieve 取回。 |
| `decompressTmpCap` | number | 50 | BILI_DECOMPRESS_TMP_CAP | 会话内临时展开内容的大小上限（按块计）。 |

**压缩（全局层级）**

| Key | Type | Default | Env | Description |
|-----|------|---------|-----|-------------|
| `compress.modelContextLimit` | number \| "N%" | native window (model-declared) | — | 有效上下文窗口（token 数或 N%）：使用率的分母，也是硬性 preflight 墙；窗口来源中优先级最高。 |
| `compress.maxContextLimit` | number \| "N%" | "75%" | — | 强制压缩提醒阈值：历史超过窗口该占比时提醒立即触发，绕过增长门槛。不是硬上限。 |
| `compress.emergencyThresholdPercent` | number \| % | "95%" | — | 历史超过窗口该占比时对超大工具输出做紧急截断（必须 >= maxContextLimit）。 |
| `compress.outputHeadroomMaxPct` | number \| % | 0.25 | — | max_tokens 输出预留占窗口的最大比例。 |
| `compress.nudgeGrowthTokens` | number | 50000 (kernel flat cadence) | — | 增长门槛：可折叠片段超出基线增长达到该 token 数才发提醒（按设计恒定，与窗口大小无关）。 |
| `compress.tierNudgeTokens` | object {t1?, t2?, t3?} | derived (T1 = nudgeGrowthTokens, T2/T3 = ×1.5) | — | 分层 token 质量触发阈值；每层未设置时回退到派生默认值，缺省/空对象＝老的统一行为（#2376）。 |
| `compress.minPressureBenefitTokens` | number (≥ 0) | max(5000, limit × 1%) | — | 压力带 nudge 触发所需的最小可回收 token 数；虚报表线路调大它，让折叠攒成大批量而非高频小折（#3211）。显式 0＝老的任意 pending 行为。 |
| `compress.requireUsageSampleForPressure` | boolean | true | — | 幻影压力守卫：本轮读数为本地估算（无计费样本——中断/TTL 丢 usage）时，压力带延后至多 compress.maxEstimateHoldRounds 轮（默认 2）等真样本，再回落到老的估算驱动决定，防止永不回传计费的线路被无限挂起。false＝始终老行为。 |
| `compress.maxEstimateHoldRounds` | number | 2 | — | 幻影压力守卫的兜底（#5865 裁定）：压力带最多连等多少轮估算读数就必须照估算动手。兜底保证从不回传计费的会话（匿名零基线 fork、静默后端——本地估算是它们唯一的压力信号）也能拿到自动压缩。0＝完全不等待。仅在 requireUsageSampleForPressure 开启时生效。 |
| `compress.nudgeModelDecided` | boolean | off (unset) | — | 模型自决的压缩时机（#2228）：tier-1 提醒触发时，先通过一次走会话缓存前缀的短 side call 问模型——以当前任务为前提，现在压缩是否划算。严格 JSON 的 "yes" 会注入带程序最终确定范围的明确压缩指令；"no"、格式错误或超时则本轮不注入任何内容。EMERGENCY 档与 tier≥2 蒸馏始终保留原有 advisory。默认关闭，需显式开启。 |
| `compress.nudgeDecisionMaxTokens` | number | 200 | — | nudgeModelDecided 所用模型决策 side call 的输出预算（token）。必须 > 0。 |
| `compress.requireNudge` | boolean | off (unset) | — | 禁止未提示的模型主动压缩（#5683）：只有当前轮次压缩提醒真正送达模型时（advisory、模型自决指令、紧急提醒都算；"gated"/"vetoed"/"skipped" 不算）才允许 compress，否则拒绝并回错误回执；同一轮内的多次 loop 请求保持武装，下一个未提示轮次自动解除。bili 自己的溢出兜底折叠不受影响。针对会自行乱压的模型（如 qwen 27b），可按 provider/model 单独开启。默认关闭。 |
| `compress.requireRecommendation` | boolean | off (unset) | — | 禁止越界的模型主动压缩（#5683）：提交的每个范围必须落在 bili 当前推荐折叠的集合内——即 nudge 文案与 acp_status 展示的同一份实时可压缩列表（有本轮 prepare 快照用快照，否则实时重算）。按「覆盖」判定而非精确相等：把推荐跨度拆小段通过；已折进活跃块的消息豁免（重折已有块更新摘要合法）。范围里含任何其他仍存活的消息则整体拒绝，回执点名越界跨度并指向 acp_status。默认关闭。 |
| `compress.streamSummary` | boolean | false (unset) | — | 强制 preflight 摘要从首次尝试起就走流式（SSE）请求。要求流式的上游现在由错误驱动自学习自动处理（非流式摘要的任何 400 都会触发一次性 SSE 探测，#2494），但网关超时（如 Cloudflare HTTP 524）永远无法触发自学习：在此类网关位于 bili 与源站之间时设置此项，或用于省去一次探测往返。 |
| `compress.preserveRecentMessages` | number | 3 | — | 最近的消息软保护、免于折叠。 |
| `compress.preserveRecentTokens` | number | kernel ≈5000 | — | 最近的 token 软保护、免于折叠。 |
| `compress.minCompressRangeChars` | number (deprecated alias: minCompressRange) | kernel ≈5000 | — | 可折叠片段的最小字符数；更短的永不折叠。 |
| `compress.maxSummaryLength` | number | kernel 20000 | — | 单条生成摘要的硬字符上限；超长的回复被整段拒绝（不截断、不重试）。外部摘要模型会被提前告知这个确切上限（#3635）。0 = 不限制。 |
| `compress.minSummaryLength` | number | kernel 50 | — | 生成摘要的字符下限；过短的回复被整段拒绝。0 = 禁用。外部摘要模型受同一下限约束（#3635）。 |
| `compress.reconcile` | "off" \| "warn" \| "repair" | "repair" | BILI_FOLD_RECONCILE | 客户端在轮次之间回退或改写历史时校准已折叠状态。 |
| `compress.compressAtFoldPoint` | boolean | false | BILI_COMPRESS_AT_FOLD_POINT | 实验性，默认关闭：把仍可见的压缩调用/结果对从原位置（贴近尾部）移到它自己的折叠点，即 [已折叠区]–[调用对]–[保护消息]，避免弱注意力模型把历史末尾的工具交换当成新命令。纯视图变换：refs 与状态不变、每轮重算结果一致；关闭时布局字节级不变。 |
| `compress.compressAtFoldPointClearThinking` | boolean | false | BILI_COMPRESS_AT_FOLD_POINT_CLEAR_THINKING | 依附于 compress.compressAtFoldPoint 的第二层开关：调用对被挪位的一瞬间，同时丢掉紧邻其前的未签名思考段（模型对本次折叠本身的思考），让挪位后的开头更干净。主开关关闭时无效；带签名的思考块与严格推理回显会话绝不受影响（#1658/#684）。 |
| `compress.promptPack` | string (builtin: "default", "lean") | builtin "default" | — | 压缩提示词包，按 项目包 → 用户包 → 内置 解析；不受 acknowledgePromptsRisk 门控。 |
| `compress.tiers` | boolean | true | — | T1→T3 分级蒸馏把折叠成本摊到多代。 |
| `compress.protectedTools` | string[] | none | — | 全历史硬排除：列出工具的结果永不折叠。路径模式（skill/<name>）可按名指定 skill（#1947）。 |
| `compress.protectedLatestTools` | string[] | none | — | 只保护累积快照类工具「最新一次」实例（新结果覆盖旧结果的工具，如 todo 列表）。路径模式按 skill 分组各保最新（skill/*，#1947）。 |
| `compress.neverPreserveRecentTools` | string[] ([] valid) | ["decompress", "search_context", "read", "bash"] (kernel) | — | 从近期保护区排除（立即可压）；空数组合法＝不排除任何工具（最大保护）。 |
| `compress.preserveRecentTools` | string[] | n/a (subtraction form) | — | 减法形式：近期区工具减去本列表得到完全保护；此处空数组按笔误拒绝。 |
| `compress.visibilityMarkers` | boolean | true | — | 在 compress/decompress/search_context/acp_status 结果后追加可见性标记；关闭可抑制模型模仿叙述。 |
| `compress.messageTimestamps` | boolean | true | BILI_MESSAGE_TIMESTAMPS | 为压缩消息记录附加不可变墙钟时间戳：线上 ACP 标签的 time="…" 属性、压缩回执指纹行的 [start – end] 覆盖跨度、渲染摘要的 Occurred 行。默认开启：每条消息首次出现时铸不可变戳、确定性渲染（历史重发字节稳定）；设为 false 可精确复现特性前（pre-#4313）的线上字节。 |
| `compress.rules` | boolean | false | — | 通过注入的 acp_rule 工具提供持久模型提醒——对折叠硬保护；pi/omp 提供 /acp-rule 命令。仅代理模式生效——插件模式下宿主自管工具面，此项无效。 |
| `compress.injectTool` | boolean | true | ACP_COMPRESS_TOOL | 向客户端注册 acp_compress 工具（仅全局层级生效）。 |
| `compress.injectNudge` | boolean | true | ACP_COMPRESS_NUDGE | 窗口填满过程中发送增长提醒（仅全局层级生效）。 |
| `compress.reasoning` | { drop?, threshold? } | drop true · threshold 2048 | — | 丢弃超过 2048 字符的已结束轮次推理块（drop 默认 true）；严格推理上游需设 drop:false。 |
| `compress.absorb` | object | opt-in (disabled) | — | 可选即时蒸馏：把工具结果蒸馏成短摘要，原文进内容库。默认仅图片类结果参与。 |
| `compress.ccr` | object | enabled in proxy mode since v2 | — | 内容缓存与回取：大输出无损存到会话旁、替换为首段摘录+指针，模型用 acp_retrieve 取回原文；无上限、永不清除。 |
| `compress.search` | object | off | — | search_context 的检索行为设置；当前含 planAware 重排。 |
| `compress.search.planAware` | boolean | false | — | 开启后 search_context 候选按当前计划状态重排；关闭时结果逐字节不变。 |
| `compress.prompts` | Partial<Prompts> | unset (kernel doctrine) | — | 覆盖内核教条文本；对压缩质量承重要——受 acknowledgePromptsRisk 门控。 |
| `compress.reasoningGuard` | object | off | — | gpt-5.x/6.x 推理格截断自动修复（最多 3 轮继续提示）。 |
| `compress.outputSteering` | object { enabled?, verbosityLevel?, effortRouting? } | enabled false · verbosityLevel 2 | — | 向系统提示词尾部附加简洁度指令；只收紧机械延续请求。 |
| `compress.priceProfile` | { w?, r?, q? } | unset (registry, kernel fallback {1, 0.1, 4}) | — | w/r/q 相对输入价的比率（写入/缓存读/输出）；仅供报告，不影响触发条件或线上行为。 |
| `compress.externalSummary` | object | opt-in (disabled) | — | 把压缩摘要交给 providers 表引用的独立配置模型；三级 compress 均为整链替换语义。 |
| `compress.acknowledgePromptsRisk` | boolean | false | — | 必须先置 true，自定义 prompts 才会生效。 |
| `compress.absorb.enabled` | boolean | false | — | 启用 absorb 蒸馏块。 |
| `compress.absorb.minToolTokens` | number | 1000 | — | 可被吸收的工具结果的最小估算 token 大小。 |
| `compress.absorb.contextThresholdPct` | number \| % | unset | — | 仅当上下文使用率超过窗口该占比时才吸收。 |
| `compress.absorb.excludeTools` | string[] | [] | — | 排除出吸收范围的工具名。 |
| `compress.absorb.toolName` | string | "absorb" | — | absorb 工具的注册名。 |
| `compress.absorb.mediaOnly` | boolean | true | — | 仅吸收携带媒体（图片）的工具结果；图片字节不计入文本 token，故豁免 minToolTokens 门槛。置 false 恢复对任意大结果的全文吸收（旧行为）。 |
| `compress.ccr.enabled` | boolean | true (proxy mode) | — | 启用内容缓存与回取块。 |
| `compress.ccr.minToolTokens` | number | ≈4000 | — | 可进入 CCR 存储的工具结果的最小估算 token 大小。 |
| `compress.ccr.excludeTools` | string[] | [] | — | 排除出 CCR 存储的工具名。 |
| `compress.ccr.toolName` | string | "acp_retrieve" | — | 回取工具的注册名。 |
| `compress.ccr.maxHeadChars` | number | 96 | — | 存储指针处内联首段摘录的最大长度。 |
| `compress.prompts.compressPhilosophy` | string | unset (kernel text) | — | 覆盖压缩哲学教条文段。 |
| `compress.prompts.howToCompressRules` | string | unset (kernel text) | — | 覆盖压缩操作规则。 |
| `compress.prompts.tier2DistillRules` | string | unset (kernel text) | — | 覆盖二级蒸馏规则。 |
| `compress.prompts.tier3CondenseRules` | string | unset (kernel text) | — | 覆盖三级浓缩规则。 |
| `compress.reasoningGuard.enabled` | boolean | false | — | 启用推理格自动修复。 |
| `compress.reasoningGuard.maxContinue` | number | 3 | — | 单次截断的最多继续提示轮数。 |
| `compress.reasoningGuard.maxTierN` | number | (built-in) | — | 修复后格层索引的上限。 |
| `compress.reasoningGuard.markerText` | string | "Continue thinking..." | — | 标识被截断推理格的标记文本。 |
| `compress.reasoningGuard.base` | number | (built-in) | — | 修复格的基础偏移参数。 |
| `compress.reasoningGuard.offset` | number | (built-in) | — | 修复格的偏移步长参数。 |
| `compress.reasoningGuard.debugLog` | boolean | false | — | 修复环的详细日志。 |
| `compress.outputSteering.enabled` | boolean | false | — | 启用附加在系统提示词尾部的简洁度指令。 |
| `compress.outputSteering.verbosityLevel` | number (0–4) | 2 | — | 指令的目标详细程度级别。 |
| `compress.outputSteering.effortRouting` | boolean | (built-in) | — | 随指令一起路由 effort 提示。 |
| `compress.priceProfile.w` | number | unset (registry) | — | 写入价相对输入价的比率。 |
| `compress.priceProfile.r` | number | unset (registry) | — | 缓存读价相对输入价的比率。 |
| `compress.priceProfile.q` | number | unset (registry) | — | 输出价相对输入价的比率。 |
| `compress.reasoning.drop` | boolean | true | — | 丢弃超过阈值的已结束轮次推理块。 |
| `compress.reasoning.threshold` | number | 2048 | — | 已结束推理块被丢弃的字符阈值。 |
| `compress.minCompressRange` | number | same as minCompressRangeChars | — | minCompressRangeChars 的弃用别名（接受，映射到后者）。 _(已弃用)_ |

**路由表字段**

| Key | Type | Default | Env | Description |
|-----|------|---------|-----|-------------|
| `models` | record name → { context?, output?, compress?, benefit? } | {} | — | 逐模型声明：上下文窗口、输出上限、逐模型压缩覆盖；不是流量过滤器。 |
| `models.context` | number | unset (model registry) | — | 为该模型名声明的上下文窗口 token 数。 |
| `models.output` | number | unset | — | 为该模型名声明的输出 token 上限。 |
| `models.compress` | object | unset | — | 该模型的第 3 级压缩覆盖（全局→provider→模型合并中最深）。 |
| `models.benefit` | boolean | false | — | 在经济学账本中标记该模型为免费额度计费。 |
| `proxy` | string ("" = explicit direct) | unset | — | 本路由出站代理地址。 |
| `compressProtocol` | "tools" (default) \| "marker" | "tools" | — | 本通道的 ACP 注入面。 |
| `protocol` | "anthropic" \| "openai" \| "responses" \| "google" | inferred from the URL marker | — | 声明本通道的线上协议；客户端侧 /bili/<protocol>/ URL 标记优先级更高。 |
| `compress` | object (level 2) | unset | — | 任意 compress 字段可在此覆盖——全局→provider→模型三级合并的第 2 级。 |
| `compat` | { roles?, dropFields? } | {} | — | 逐路由线上兼容覆盖；provider 条目按键级覆盖全局；dropFields 加法并集。 |
| `direct` | boolean | false | — | 客户端侧豁免：该上游流量完全不指向 bili。 |
| `passthrough` | boolean | false | — | 路由级逐字节透传、无会话状态——面向反作弊上游。 |
| `imageBilling` | "auto" \| "pixels" \| "bytes" | auto (→ pixels) | — | 本路由图片 token 计费口径；bytes 为字节中继的显式指定。 |
| `imageTokenCap` | number | unset (uncapped) | — | 本路由单张图片 token 成本上限。 |
| `resign` | scheme → { enabled?, passthrough?, credentialRef? } | {} (global map applies) | — | 按路由覆盖全局 resign 映射（第 2 级，最深层胜出）。 |
| `bind` | string (named entries only) | unset | — | 把具名（非 URL）条目深合并到所绑定的 URL 通道作为别名；无 bind 的具名条目不参与路由。 |
| `apiKeyEnv` | string (env var name) | unset | — | 通道凭据覆盖（#2336）：用该环境变量的值替换客户端凭据。与 credentialRef 二选一；见[通道凭据](#lane-credentials-apikeyenv--credentialref)。 |
| `credentialRef` | string (store name) | unset | — | 经私有摘要凭据存储的通道凭据覆盖（secret:NAME 语义）。 |
| `calibration` | { disabled?: boolean, max?: number } | unset (learned k̂ applies) | — | 按路由的 k̂ 校准策略（#3211）：对虚报报数线路做退出或钳制；见[线路级 k̂ 校准策略](#route-level-k-calibration-policy)。 |
| `compactionOptIn` | boolean | false | BILI_NON_HTTP_PROVIDERS | 仅命名条目：把非 http(s) baseUrl 供应商纳入压缩所有权（pi/omp 车道）；与 env BILI_NON_HTTP_PROVIDERS 取并集。 |

**仅环境变量（无配置文件键）**

| Key | Type | Default | Env | Description |
|-----|------|---------|-----|-------------|
| `BILI_DSH_AUTHORED_COMPACTION` | boolean | true (on, #3901 flip) | — | 让 bili 本地应答 dsh 压缩摘要请求（返回折叠快照而非拒绝，#3733）：身份头 + 内核渲染格式的块摘要，零出口流量；重放经 #2432 再基线识别。 |
| `BILI_DSH_CONTEXT_TAB` | boolean | true | — | dsh.contextTab 的 env 层（#4237）：0/false 移除 DSH 顶栏「上下文」标签页（其余一切照常工作）；其他取值强制开启并覆盖文件层；缺省 = 按文件层取值（默认 true）。下次页面加载 / dsh 重启生效。 |
| `BILI_DSH_MAX_TESTED_VERSION` | string | 0.2.0-rc.2 (CI e2e anchor) | — | “dsh native lane 启动提示的“我们测过的最高版本”上限（#4545）：从注入包上方最近的 node_modules/@deepseek-ai/dsh/package.json 读出运行中的构建,**严格高于**上限才弹一条启动提示(持久日志 + 横幅),建议先回滚到上限版本。只覆盖"更新"一个方向:≤ 上限保持静默(旧版已知坏法有专门的失锁探测)。只提示、绝不拦截或阻断流量;新版本验证通过后抬高上限,空字符串 = 关闭本 lane 检查;读不到/解析不了的版本按静默处理。” |
| `BILI_IDENTITY_HARVEST` | string | off | — | #5825 身份信道接线的采集开关（灰度门控下的回环本地转录/SQLite 采集）：缺省关闭、完全惰性；`all` 或逗号列表（`claude,codebuddy,mcode`）开启对应来源，且仅对回环身份请求生效，同时要求 pluginLaneServerHistory 灰度为开。任何无法判定的情形整轮退化为接线前路径，绝不做部分映射。设计上是开发/验证开关而非调参旋钮。 |
| `BILI_STORAGE_BACKEND` | sqlite\|mysql | sqlite | — | storage.backend 的环境变量层（#3931）：sqlite（默认）或 mysql（已接线，#3388 第二+三步 —— 保存经异步影子队列入 mysql,同步读走 JSON 信封,replicas/ext/GC/fork 走异步孪生（#4911）;export 同样支持）。优先于文件层。 |
| `BILI_MYSQL_DSN` | string | unset | — | storage.backend="mysql" 的 MySQL DSN（mysql://user:pass@host:3306/db）（#3388，#3931）。优先于文件键 storage.mysql.dsn。留空 = mysql 后端无法打开;文档化错误会列出两个旋钮。连接池惰性打开;closeQuietlyAsync 排空入队事务并关闭。 |
| `BILI_STORAGE_ARCHIVE_AFTER_DAYS` | integer | 365 | — | GC 年龄清扫窗口（天，#3463）：闲置超过该时长的会话被归档（单文件归档日志 archive/archive.jsonl 追加一行 + 墓碑行保留标签 + 释放内容/媒体引用）。0 关闭年龄清扫；手动入口 POST /__bili/storage/gc 始终可用。配置文件键 storage.archiveAfterDays 为持久形式。 |
| `BILI_STORAGE_QUICK_CHECK` | string | on | — | 存储开库自检（#4175）：每次 index.db 打开在迁移之前先跑 PRAGMA quick_check；一旦由本次启动自己的扫描证实损坏，文件原样保留在原地——不做任何自动搬移、复制或重建（自动恢复已撤回：BILI_STORAGE_JSON_WRITER=off 时索引是唯一的持久副本，自动操作无法保证完整数据恢复）——bili 照常启动，改用 JSON 信封服务，并给出响亮、可操作的告警指明手工修复步骤（备份后把 index.db/-wal/-shm 手工移开再启动——全新索引会从 JSON 信封重建）。PASS 判定会被缓存，之后的启动跳过重扫；FAIL 判定永不持久化（2026-10-30 owner 策略）：运行期/后台发现只是告警（响亮日志 + runtime-status，进程继续服务——JSON 信封始终是恢复来源），每次启动都对当前文件集做新鲜扫描再判定，旧版本遗留的陈旧 FAIL 永远不能阻断后续启动。既没有自动改名/修复，也没有 legacy-only 兜底（继续以 legacy-only 运行会让 JSON 信封与死掉的索引永久分叉、再无对账可能）。瞬态打开失败（无引擎 / CANTOPEN / 只读 / 后端 DSN）仍响亮地拒绝启动并给出可操作的错误——环境类问题同样不允许静默走 legacy 兜底（活的第二写者已于 2026-10-31 移出该拒绝清单：多进程共享一个本地盘 index.db 是受支持拓扑，只提示、永不阻断启动）；真正需要纯 JSON 服务的部署请显式设置 BILI_STORAGE_UNIFIED=legacy（或留空）。仅当超大部署对启动耗时敏感、检测成本构成问题时才设 0 跳过。 |
| `BILI_SNAPSHOT_SHADOW` | boolean | true (on) | — | 快照渲染影子对账（#3756 后续）：每轮已折叠会话都用引擎现算一次出站快照视图但不使用，与 legacy 实际出站比对分类，逐会话计数进 web 面板与 snapshot-shadow 诊断主题。0/false/off 关闭；1/true/on 开启；否则读配置文件 snapshot.shadow 布尔（默认开）。渲染车道本身仍受灰度开关控制（BILI_ROLLOUT_SNAPSHOT_RENDER），影子车道绝不改变出站字节 —— 它是后续翻转灰度的干跑证据。 |
| `BILI_CONFIG_FILE` | string | unset (XDG config path) | — | 覆盖配置文件路径（路径重定位）。 |
| `BILI_SESSIONS_DIR` | string | unset (XDG state path) | — | 会话记录的存放目录（路径重定位）。 |
| `BILI_ENCRYPTION_KEY` | string | unset | — | 加密持久化载荷的密钥材料（机密）。 |
| `BILI_TUNNEL_ALLOWED_HOSTS` | string[] (csv) | unset | — | MITM 隧道车道的主机白名单。 |
| `BILI_RECLAIM_FETCH_PATCH` | boolean-ish | on | — | 进程退出时回收全局 fetch 补丁的开关。 |
| `BILI_CONFLICT_SCAN` | boolean-ish | off | — | 启用安装车道冲突扫描探针。 |
| `BILI_CHAIN_MAX_FUTURE_SKEW_MS` | number | (built-in) | — | 链检查点时间戳未来偏移的容忍度。 |
| `BILI_CHAIN_RECENT_WINDOW_MS` | number | (built-in) | — | 链检查点校验的近期窗口大小。 |
| `BILI_ZONE_PORT` | number | 18787 base (derived per lane) | — | 车道派生代理端口区的基础端口（端口重定位）。 |
| `BILI_ZCODE_ROUTE` | string | unset | — | zcode 车道的路由选择。 |
| `BILI_ZCODE_PORT` | number | unset | — | zcode 车道的端口钉死。 |
| `BILI_ZCODE_SIGNING_FIXED` | boolean-ish | off | — | zcode 凭据车道的固定签名模式。 |
| `BILI_CLAUDE_UPSTREAM` | string | unset | — | claude 车道的上游钉死。 |
| `BILI_CODEX_STATE_MODE` | string | auto | — | codex 状态处理方式：auto（新版 codex 走 CODEX_SQLITE_HOME 共享库，旧版回退 overlay 副本）、shared、legacy。shared 模式最多 16 个并发会话，每会话一个独立 overlay 槽位；legacy 保持一次仅一个独占 overlay。 |
| `BILI_ATTACH_HEALTH_DEADLINE_MS` | number | (built-in) | — | 挂接外部守护进程时健康检查的截止时间。 |
| `BILI_SPAWN_WAIT_MS` | number | (built-in) | — | 新派生的代理子进程在启动器延长等待之前的初始健康等待窗口（毫秒）。 |
| `BILI_SLOW_START_GRACE_MS` | number | (built-in) | — | 对仍存活但仍在启动（慢速存储、杀毒扫描、共享存储锁竞争）的子进程的额外宽限（毫秒）；总启动预算为两者之和。 |
| `BILI_ATTACH_EVIDENCE_GRACE_MS` | number | (built-in) | — | 挂接归属证据的宽限期。 |
| `BILI_SILENT_DIRECT_MAX_MB` | number | (built-in) | — | 静默直连超大请求保护上限（MiB）。 |
| `BILI_PROVIDER_REWRITES` | string | unset | — | 路由前应用的 provider URL 重写规则。 |
| `BILI_MCP_PROXY` | string | unset | — | 派生通道：插件宿主工具的 MCP 代理目标。 |
| `BILI_PARENT_PID` | number | unset | — | 派生通道：父进程 id，用于生命周期监管。 |
| `BILI_STRICT_PORT` | number | unset | — | 派生通道：精确端口要求（被占用时响亮拒绝而非跳端口）。 |
| `BILI_UPGRADE_REPLACEMENT` | boolean-ish | unset | — | 派生通道：标记自重启替换进程——必须独占被释放的精确端口，否则直接退出而非跳端口（#3044）。 |
| `BILI_OPENCODE_ACP_SPEC` | string | unset | — | 派生通道：opencode 原生车道的 ACP 规格标记。 |
| `BILI_LAUNCHER_MODEL_WINDOWS` | string | unset | — | 启动器通道：传入被派生客户端的模型窗口覆盖。 |
| `BILI_LAUNCHER_LANE` | string | unset | — | 启动器通道：派生方 bili 进程的车道身份。 |
| `BILI_LAUNCHER_PLUGIN` | string | unset | — | 启动器通道：插件模式交接标记。 |
| `BILI_LAUNCHER_DIRECT` | boolean-ish | off | — | 启动器通道：本次启动绕过注入的代理。 |
| `BILI_INHERITED_HTTP_PROXY` | string | unset | — | 启动器通道：跨派生边界保留的 http_proxy 继承值。 |
| `BILI_INHERITED_HTTPS_PROXY` | string | unset | — | 启动器通道：跨派生边界保留的 https_proxy 继承值。 |
| `BILI_INHERITED_ALL_PROXY` | string | unset | — | 启动器通道：跨派生边界保留的 all_proxy 继承值。 |
| `BILI_INHERITED_NO_PROXY` | string | unset | — | 启动器通道：跨派生边界保留的 no_proxy 继承值。 |
| `BILI_NATIVE_CLAUDE` | boolean-ish | off | — | 宿主姿态：标记 claude 原生插件进程。 |
| `BILI_NATIVE_DSH` | boolean-ish | off | — | 宿主姿态：标记 dsh 原生插件进程。 |
| `BILI_NATIVE_KIMI` | boolean-ish | off | — | 宿主姿态：标记 kimi 原生插件进程。 |
| `BILI_NATIVE_OMP` | boolean-ish | off | — | 宿主姿态：标记 omp 原生插件进程。 |
| `BILI_NATIVE_OPENCODE` | boolean-ish | off | — | 宿主姿态：标记 opencode 原生插件进程。 |
| `BILI_NATIVE_PI` | boolean-ish | off | — | 宿主姿态：标记 pi 原生插件进程。 |
| `BILI_PI_INLINE` | boolean-ish | inline when unset (DEFAULT-ON since #5428; explicit 0/false/no/off opts out) | — | 宿主姿态：pi 内联压缩通道（#3278）——pi 扩展在进程内通过伪源站直接压缩，不再另起代理进程；优先于预置的 BILLION_CONTEXT_PROXY 附着目标。自 #5428 起默认开启（取代 #4687 的手动开启规则）：未设置 env+文件时走内联；显式宣告的附着目标仍压过默认，`bili pi` 照旧用 launcher 代理。显式关闭 = 0/false/no/off（或 `"pi": {"inline": false}`）——恢复旧的 attach/spawn 姿态。人类入口：`bili -i/--inline pi` 强制内联，`bili -s/--server pi` 钉死代理姿态（压过继承的内联变量）。除 0/false/no/off 外任何非空值均算开启（on/yes/TRUE 均可）。codex 的 Responses WS 流量改走随引擎启动的仅回环桥；桥起不来时该通道退回直连（打 warn），HTTP 压缩仍留在进程内。 |
| `BILI_OPENCODE_INLINE` | boolean-ish | off (opt-in) | — | 宿主姿态：opencode 内联压缩通道（#3278 移植）——opencode 插件在进程内通过伪源站直接压缩，不再另起代理进程；优先于预置的 BILLION_CONTEXT_PROXY 附着目标。需手动开启：按 #4687 决定，opencode 通道默认保持旧行为（另起代理），只有本环境变量或 "opencode": {"inline": true} 显式开启才切换；除 0/false/no/off 外任何非空值均算开启（on/yes/TRUE 均可）。已在 Bun 宿主上验证（无 node:sqlite 时引擎 boot/dispatch 正常）。 |
| `BILI_INLINE_DEBUG` | boolean-ish | off | — | 仅内联通道（#3278）：把引擎日志保留在 stderr 上（默认关闭——内联引擎跑在 pi 进程里，stderr 就是交互终端，每行 [persist]/[storage]/[inline] 都会把输入框挤掉；默认只写 bili.log）。 |
| `BILI_NATIVE_ZCODE` | boolean-ish | off | — | 宿主姿态：标记 zcode 原生插件进程。 |
| `BILI_PI_BIN` | string | pi (PATH lookup) | — | 宿主姿态：pi 客户端二进制的显式路径。 |
| `BILI_DSH_BIN` | string | dsh (PATH lookup) | — | 宿主姿态：dsh 客户端二进制的显式路径。 |
| `BILI_MODEL_INFO_RETRY_MS` | number | (built-in) | — | 测试钩子：模型信息查询的重试间隔。 |
| `BILI_DSH_RETRY_INTERVAL_MS` | number | (built-in) | — | 测试钩子：dsh 车道操作的重试间隔。 |
| `BILI_DSH_RECOVERY_INTERVAL_MS` | number | (built-in) | — | 测试钩子：dsh 车道恢复清扫间隔。 |
| `ACP_DUMP_DIR` | string | unset | — | 线路转储输出基础目录覆盖（路径重定位）。 |
| `BILI_STREAM_STALL_MS` | number | (built-in) | — | 已提交上游流的停滞检测超时（无字节静默多久后中止）。 |
| `BILI_CLIENT_BIN` | string | unset (PATH lookup) | — | 被启动客户端二进制的显式覆盖（在 PATH 上解析）。 |
| `BILI_CONVERSATION_ID` | string | unset (per-spawn UUID written by bili) | — | 传给 MCP 子进程的逐派生会话 UUID（宿主不传会话 id 时用于无头自注册）。 |
| `BILI_LAUNCHER_MODEL_MAX_OUTPUTS` | string (JSON id→maxOutput map) | unset | — | 启动器通道：传给被派生代理的逐模型最大输出映射，用于输出预留。 |
| `BILI_LAUNCH_TOKEN` | string | unset (generated per launch) | — | 启动令牌，鉴权启动器与其派生代理之间的车道内部端点（机密）。 |
| `BILI_MCP_DEFAULT_ORIGIN` | string | http://127.0.0.1:8787 | — | MCP 入口的兜底代理 origin 候选。 |
| `BILI_MCP_NO_ORPHAN_ADOPT` | boolean-ish | off (=1 disables orphan adoption) | — | 多个宿主会话共享一个代理时，退出恢复会话的孤儿收养。 |
| `BILI_MITM_HOSTS` | string[] (csv) | unset | — | 启动器通道：传给被派生代理的 MITM 白名单主机（区别于配置文件对应项 BILI_MITM_DOMAINS）。 |
| `BILI_PLUGIN_AGENT` | boolean-ish | off | — | 派生通道：标记插件 agent 进程。 |
| `BILI_IMAGE_RESCALE_MAX_DIM` | integer | 1600 | — | 出站图片降采样 pass 的最长边触发阈值（像素，#3400）；非数字或低于 128 的取值按默认处理。设计上仅环境变量。 |

<!-- /bili:gen -->

---

## 服务端设置

这些顶层键控制代理的监听方式与全局行为。

### `port`

- **类型：** `number`
- **默认值：** `8787`
- **状态：** ACTIVE
- **说明：** 代理监听的 TCP 端口。必须是 1 到 65535 之间的整数。可由 `ACP_PORT`（或 `PORT`）环境变量或 `--port` CLI 参数覆盖。非法值会导致启动中止。这是**用户主权区**（`bili start`，默认 `8787`）——这个口归你管。lane 拉起的代理（原生 hook、launcher lane）住在独立的自管区（`BILI_ZONE_PORT`，默认 `18787`），永不碰这个口（#1660）。

### `host`

- **类型：** `string`
- **默认值：** `127.0.0.1`
- **状态：** ACTIVE
- **说明：** 代理绑定的网络接口。`127.0.0.1`（默认）仅监听本机 —— 适合本地 sidecar。使用 `::` 可同时监听 IPv4 + IPv6 双栈。使用 `0.0.0.0`（或局域网 IP）可将代理暴露给其他机器 —— 常见于容器或可信局域网: 远程 agent 把模型 `baseURL` 指向 `http://<本机>:<端口>/bili/…`，MITM 模式的 `CONNECT` 仅对白名单内的模型域名接受远程客户端（盲隧道仍仅限本机，`/__bili/` 管理端点也仍仅限本机，除非开启了下方的宿主中继 security.adminRelay）。没有任何鉴权 —— 请确保所在网络可信。可由 `ACP_HOST` / `--host` 覆盖。

### `upstream`

- **类型：** `string`（base URL）
- **默认值：** `https://api.anthropic.com`
- **状态：** ACTIVE
- **说明：** 仅路径模型请求的回退 base URL：客户端不带 host POST 到 `/v1/messages` 时转发到 `${upstream}/v1/messages`。尾部斜杠会被剥掉。可由 `ACP_UPSTREAM` 覆盖。同时作为 `GET /__bili/health` 的 `upstream` 字段报告。

### `sessionHeader`

- **类型：** `string`
- **默认值：** `x-acp-session`
- **状态：** ACTIVE
- **说明：** 客户端可发送的、用于标识一次会话的 HTTP 请求头名称。携带相同值的请求会在多次调用间共享压缩状态。可由 `ACP_SESSION_HEADER` 覆盖。

### `log`

- **类型：** `boolean`
- **默认值：** `true`
- **状态：** ACTIVE
- **说明：** 启用逐请求日志。设为 `false`（或 `ACP_LOG=0`）可关闭标准请求日志。

### `logFile`

- **类型：** `string`
- **默认值：** XDG state 路径（`~/.local/state/billion-context/bili.log`）
- **状态：** ACTIVE
- **说明：** 代理 tee 日志（文件 + stderr）的位置。设为 `"off"` 完全禁用文件日志（仅 stderr）。10 MB 自动轮转为 `bili.log.old`。设置时由 `ACP_LOG_FILE` 覆盖（空值解析回默认路径，而非 off）。

**日志位置与清理。** 共有两个日志文件：

1. `~/.local/state/billion-context/bili.log` —— 共享实例日志（本机所有代理都追加到这里；每行自带 `[v=<版本>]` 与 `[sess=<id>]` 标签）。10 MB 轮转，保留一份 `.old`。
2. `%TEMP%/bili-proxy-<port>.log`（`os.tmpdir()/bili-proxy-<port>.log`）—— 仅由启动器拉起的代理（`bili dsh`、pi/claude/codex overlay 等）会创建：拉起进程把子进程的 stdout/stderr 直接重定向进该文件。自 #2864 起，子进程在文件日志（即上面的 bili.log）可用后关闭 stderr 腿，因此该文件只保留日志系统启动前的崩溃输出（通常接近 0 字节）；打开时另有封顶：达到 5 MB 后，下次拉起先轮转为 `.old`（保留一份）再重新打开。其余清理依赖操作系统临时目录策略——把它当临时空间对待，过时的文件可随意删除；持久记录永远在 `bili.log`。

### `debug`

- **类型：** `boolean`
- **默认值：** `false`
- **状态：** ACTIVE
- **说明：** 详细日志 —— 等价于设置 `ACP_DEBUG=1`。在排查路由或压缩行为时很有用。

### `passthrough`

- **类型：** `boolean`
- **默认值：** `false`
- **状态：** ACTIVE
- **说明：** 将每个请求**不经过**压缩、工具注入或 nudge，直接转发到上游。等价于 `ACP_PASSTHROUGH=1`。便于与未压缩基线做 A/B 对比。

### `compactionOptIn`

- **类型：** `boolean`
- **默认值：** `false`
- **状态：** ACTIVE
- **说明：** `#1392` —— 为**非 http(s) baseUrl 的 provider**（如 pi-claude-bridge 的字面量 `"claude-bridge"`）放行 bili 的压缩接管考量。条目的键 = provider id —— 非 URL 键本身对路由惰性无效（给它 [`bind`](#named-provider-entries-bind) 即成为真实 lane），用于启动器导出的 `BILI_NON_HTTP_PROVIDERS` 白名单，供 pi/omp 插件在原本要一票否决非 http baseUrl 的地方（#1383）查询。放行只是扩大候选集：仍需正证据（插件已盖章会话、或 `/__bili/plugin/status` 确认代理承载）才会取消原生压缩。环境变量等价： `BILI_NON_HTTP_PROVIDERS=a,b`（与文件并集去重）。仅在 `bili pi` / `bili omp` 启动器或直接安装插件时才有意义。

  ```jsonc
  {
    "providers": {
      "claude-bridge": { "compactionOptIn": true }
    }
  }
  ```

### `compat`

- **类型：** `{ roles?: Record<string, string>; dropFields?: string[]; streamErrorShape?: "protocol" | "completion"; noCacheControl?: boolean; keepResponseId?: boolean }`
- **默认值：** `{}`（禁用）
- **状态：** ACTIVE
- **说明：** 全局线上兼容角色映射。`roles` 把消息角色映射为上游接受的角色名，例如 `{"compat":{"roles":{"developer":"system"}}}` 把 `developer` → `system`，用于拒绝 `developer` 角色的上游（#552，新版 codex 客户端会发送）。作用于 `openai` chat-completions 与 `responses` 请求；仅精确匹配角色，体内其它内容不动；压缩重试重发的请求体同样携带。按 provider 的 `compat.roles`（见 [Providers](#providers)）按键优先。默认 `{}` 逐字节透明转发。
- **失败自学习：** 未配置 compat 时，上游返回 `400 Invalid role: …` 会被自动修复 —— bili 把被拒角色改写为 `system`，重试一次，并把学到的映射记在**会话上**（仅内存，绝不写入配置）。该会话后续请求免 400 往返。修复生效时打印的 info 日志附带可永久化的 per-provider 片段。
- **dropFields：** 最终转发体中要删除的字段点分路径列表 —— 用于严格 schema 上游拒绝*客户端*固定发送但上游不认的字段（#1757）。路径仅限纯对象段（如 `reasoning.summary`），不支持通配符与数组下标；不存在的路径与非对象中间节点静默跳过；字符串值永不检查或改写 —— 只删结构键，工具参数与消息内容逐字节不变。与 `roles` 不同，适用于所有 wire 协议（任意 JSON 请求体）。全局与 per-provider 列表**相加**合并（并集）—— provider 条目只能追加、不能撤销全局路径。应用于角色映射/输出转向之后的最终出站体（prompt-cache stamp 之前）、压缩重试重发的每个请求体，以及逐字节直通转发。无命中时逐字节不变；实际删除 ≥1 个字段时打一条 info 日志列出被删路径。纯 opt-in，v1 不做失败自学习：`"compat":{"dropFields":["reasoning.summary"]}`。
- **streamErrorShape：** 200 响应已提交后，上游流式失败在 anthropic/openai 线上如何呈现给客户端（默认 `"protocol"`，或 `"completion"`）。`protocol` 走协议原生失败通道——anthropic/responses 收 `event: error` 帧，openai 收顶层 `error` 帧后跟 `[DONE]`——客户端能区分「这一轮失败了」和「这一轮完成了」，自身重试逻辑保持可用（#1455：旧版合成的 `end_turn`/`finish_reason` 让死掉的回合看起来像正常完成，静默吃掉了客户端的重试预算）。`completion` 恢复该旧形状（失败文本包在合成的成功完成里），供无法呈现带内错误事件的宿主使用。配置文件：`"compat":{"streamErrorShape":"completion"}`；环境变量 `BILI_STREAM_ERROR_SHAPE` 优先。仅 google 线不受影响（本来就是原生错误帧）；responses 线上该开关改变的是服务端出口：从合成的 item 生命周期完成帧改为 `event: error` 帧（其循环内出口本就走 `response.failed` 原生通道）。
- **noCacheControl：**（#2030）`true` 关闭 bili 在 Anthropic 通道上的 `cache_control` 断点标注 —— 用于拒绝该字段的上游或有自己断点策略的中继。环境变量对应项 `BILI_NO_CACHE_CONTROL` 优先；完整机制见其[环境变量条目](#环境变量)。
- **keepResponseId：**（#2030）`true` 保留 kernel 重建的 Responses 请求上的 `previous_response_id`，不再剥离（默认剥离：重建后的 body 引用的是上游从未为改写后输入签发过的 response id，没有意义）。环境变量对应项 `ACP_KEEP_RESPONSE_ID=1` 优先。

### `proxy`

- **类型：** `string`
- **默认值：** *（无 —— 不使用上游代理）*
- **状态：** ACTIVE
- **说明：** 用于代理**自身**到模型 provider 的出站连接的上游 HTTP 代理（`http://host:port`）—— 针对 provider 只能经 HTTP 代理才可达的主机（例如 GFW 内的 `api.openai.com`；把 bili 指向你本地的 v2rayA/clash HTTP 端口）。

  **解析顺序（首个命中生效）：** per-URL `providers.<url>.proxy` → `BILI_UPSTREAM_PROXY` 环境变量 → Web UI 手动代理 → 本顶层 `proxy` → `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY` 环境变量 → Windows 系统代理 → 直连。auto 模式下环境/系统回退遵守 `NO_PROXY` 与 Windows 代理绕过列表。指向 bili 自身本地端口的值会被忽略或拒绝，防止成环。Windows 上常见的 Clash/Mihomo 静态系统代理会被自动发现；Web UI 显示生效来源及在 Internet Settings 里检测到的 PAC URL（如有）。

  空字符串表示"显式直连"—— 覆盖并禁用其下所有层级（顶层：为所有 provider 禁用任何环境/系统代理回退；per-provider：仅该 provider）。

  两条出站路径都覆盖：`/bili/` 路径模式（fetch）与 MITM CONNECT 隧道（代理到真实上游的连接也走 HTTP CONNECT 代理）。自动更新器自身的出网（npm registry 检查 + tarball 下载）对其主机使用同一决策，所以 npm 只能经代理可达的机器上 `bili update` 与自动更新同样可用（#609）。

  不支持 SOCKS5：显式 `BILI_UPSTREAM_PROXY` / 配置 `proxy` 使用 `socks5`/`socks5h` scheme 会以可操作的错误启动失败；env/系统代理使用此类 scheme 则被忽略并打一次性警告（流量回落到直连）。Clash/mihomo 用户把 bili 指向同一个 mixed 端口的 `http://`（如 `http://127.0.0.1:7890`）。

  ```jsonc
  {
    // 全局默认：所有 provider 走这个代理
    "proxy": "http://127.0.0.1:20172",
    "providers": {
      "https://api.openai.com/v1": {
        // Per-URL 覆盖全局（该主机用另一个代理）
        "proxy": "http://127.0.0.1:20173"
      },
      "https://open.bigmodel.cn/api/anthropic": {
        // 空字符串 = 显式直连，覆盖全局代理
        "proxy": ""
      }
    }
  }
  ```

### `upstreamProxy`

- **类型：** `string`（代理 URL）
- **默认值：** *（无）*
- **状态：** ACTIVE
- **说明：** Web UI 手动代理控件的配置文件载体 —— UI 写入这个键（重启后保留；`BILI_UPSTREAM_PROXY` 是阶梯上它之上的 env 层）。设置后若未显式指定 `upstreamProxyMode`，生效模式变为 `"manual"`，用的就是这个值。它在 [`proxy`](#proxy) 解析顺序中位于 `BILI_UPSTREAM_PROXY` 与顶层 `proxy` 之间。空字符串按未设置处理。

### `upstreamProxyMode`

- **类型：** `"auto" | "manual" | "direct"`（其他值一律解析为 `"direct"`）
- **默认值：** *（未设置 —— `upstreamProxy` 有值时解析为 `"manual"`，否则 `"direct"`）*
- **状态：** ACTIVE
- **说明：** 代理自身出站连接的选择模式（完整阶梯见 [`proxy`](#proxy) 解析顺序）：`"manual"` 用 Web UI 手动代理（`upstreamProxy`），其为空时回落顶层 `proxy`；`"auto"` 与 `"direct"` 用顶层 `proxy`；**显式设置**为 `"direct"` 还会让辅助出网（MITM 盲隧道）退出代理回退。`BILI_UPSTREAM_PROXY` 无论何种模式都作为显式代理优先。可由 `BILI_UPSTREAM_PROXY_MODE` 覆盖。

### `imageBilling`

- **类型：** `"auto" | "pixels" | "bytes"`
- **默认值：** `"auto"`
- **状态：** ACTIVE
- **说明：** 预检尺寸门与输出钳制对内联（base64）图片的计费方式（#488/#496/#767/#1843）。`"pixels"` 只解析图片头（PNG/JPEG/WebP/GIF/BMP）、不解码完整图像，按像素 tile 计费（OpenAI high-detail 模型：512px tile、短边放大到 768px、长边封顶 2048px → 每图 765–2805 token；无法解析的格式回退为固定 16384）。`"bytes"` 按 `base64 长度 / 4` 计 token —— 保守、对字节计费 relay 正确，但自 #1843 起是**显式选择**：旧默认在未知 host 上把这个 ±15× 的估算混进每个窗口决策，把真实用量明明在窗内的图片重会话永久挡死（#1800 事故：6 张截图估算 278,161 vs 实际计费 18,870）。远程（`https://`）图片在两种模式下都固定计 4096。`"auto"`（默认）对所有 host 都解析为 `pixels`。按 provider 的 `providers.<url>.imageBilling` 优先于本全局项，而 `BILI_IMAGE_BILLING` 环境变量优先于两者（实时读取，无需重启）。

### `imageTokenCap`

- **类型：** 正整数（每图 token）
- **默认值：** *（未设置 —— 无上限）*
- **状态：** ACTIVE
- **说明：** 预检尺寸门、输出钳制与图片压缩统计所用单图 token 估算的统一天花板（#488/#496/#1843）。叠加在任何计费模式之上 —— 适用于路由真实编码器计费远低于像素先验的场景。优先级：`BILI_IMAGE_TOKEN_CAP` 环境变量（实时读取，无需重启）> 按 provider 的 `providers.<url>.imageTokenCap` > 本全局项。非数字或非正值按宽松解析丢弃（与 `imageBilling` 一致）。

### `imageRescale`

- **类型：** boolean
- **默认值：** `true`
- **状态：** ACTIVE
- **说明：** 出站图片降采样 pass 的总开关（#3295 删除了旧的入站时降采样；#3400 以简化形态重新引入）。每个出站请求在 kernel 折叠之后、协议编码之前，对最长边超过 `BILI_IMAGE_RESCALE_MAX_DIM`（默认 1600）**或** base64 体积超过 100 KB 的图片做 fit-inside 重编码（不放大、保留原格式），且只作用于**出站副本**——会话存储中的原始字节保持逐字节原样。重编码节省不足 20% 字节的结果直接丢弃（keep-smaller），小图与低收益图原样通过。仅处理 PNG/JPEG/BMP（纯 JS 编码器，零原生依赖）；其他格式原样通过。每张被缩小的图片旁附一段稳定注释，报告当前与原图尺寸；在注册 bili 工具的车道（代理注入车道，以及经插件 manifest 注册的插件车道）中还会指明 `acp_read_original_image("<ref>")`——它从本地会话存储取回原始字节；拒绝注入工具的车道（如 codex）只拿到报尺寸的注释、没有工具。`acp_read_original_image` 的结果**结构性豁免**再次降采样（防 #3266「猜→拒→重发」循环复发的环锁）。输出确定性：同一输入字节永远产出同一缩小字节与同一注释文本，同一历史反复重发保持逐字节稳定，上游前缀缓存不受扰动。每张唯一图片记一条日志（内容 hash 缓存；缓存命中静默）。优先级：`BILI_IMAGE_RESCALE` 环境变量（`"0"`/`"false"` 关闭；实时读取，无需重启）> 本配置键 > 默认开启。

### `resign`

- **类型：** `object` —— 按签名方案分键：`Record<方案, { enabled?, passthrough?, credentialRef? }>`,键 = 电线上检测到的签名方案 token(小写；内置:`"sdk-hmac-sha256"`；自定义:HMAC `Authorization` token 如 `"aws4-hmac-sha256"`,或 body 签名头名如 `"x-ofm-signature"`)
- **默认值：** 内置 `"sdk-hmac-sha256"` 键开箱即用 —— `enabled: true`、`passthrough: false`、`credentialRef` *（未设置 —— 账号池发现）*；文件没提到的方案一律保持这些默认 —— 对**非内置方案**，这意味着本地 403 拒收，且持续有效直到 bili 补上该方案的重签器（二元契约，#2090）；见说明
- **状态：** ACTIVE
- **说明：** #1884 重签臂的配置文件面（body 级签名；今天就是华为 CodeArts APIG 的 `SDK-HMAC-SHA256`）。检测是**形状判定**而非名字白名单（#2090）：任何命名了 HMAC 构造的 `Authorization` 方案 token，或以 `-signature` / `-content-sha256` 结尾的请求头，都把该请求标记为 body 已签名 —— 每个网关都自造一套头（dsh 免费模型插件就是 `x-ofm-signature`），封闭名单会不断漏掉新形状，变成静默的上游 401，并在别的插件界面里显示成「凭据无效」。接下来发生什么取决于 bili 能否重签该方案：
  - **内置方案且能解析出凭据**（dsh codearts 账号池）：零配置重签臂 —— 在 dsh 上它通过 credentials 服务从 `$DSH_HOME/jet-hub/state.json` 发现启用的 `codearts` 账号，并对自己产出的每个出站 body 重签，签名上游上的压缩开箱即用。内置键的默认值**就是**这套行为，所以按方案分键并不把这个字段做成华为特殊设计。
  - **其他任何被检测到的方案**（SigV4、网关自造头）：bili 内部**既没有凭据来源，也没有重签器实现**，所以 bili **一律拒收**（owner 二元契约拍板，#2090：签名请求要么重签+压缩、要么拒绝，绝不无签名放行）。403 文案指明方案名并明说「目前没有任何配置能让这条链路工作」；每次拒收都会记进 state 目录下的 `resign-pending.json`（`~/.local/state/billion-context/`），此后每次启动 bili 都会打 `[resign] … UNRESOLVED` 横幅列出未解决项（dsh agent lane 在插件装载时也会警告），直到 bili 补上该方案的重签器。这些方案的 `passthrough` 设置**无效**——提醒只在分支被卸载（`enabled: false` / `BILI_RESIGN=0`，恢复 pre-resign 改写处理、上游大概率又 401）时自动清除。自 v0.1.186（#2260）起，这类死键还会在配置加载时被一条 `[acp-config]` 警告点名（同一死键集合只报一次），403 文案不再是唯一信号。

  本块只管失败/覆盖路径 —— 每个字段环境变量都优先于文件：
  - `enabled: boolean` —— 该方案的开关；`false` 整体卸载重签臂（回到修复前行为：带签名的请求照常改写、上游 401）。环境变量 `BILI_RESIGN=0` 优先。
  - `passthrough: boolean` —— 对该方案的、无法重签的请求的原样转发。**仅对内置方案有效**（其拒收有用户侧修复——提供凭据——所以在不压缩直送上做显式选择是真实决策；#1884）。对其他任何方案该字段**无效**：按 #2090 二元契约，签名请求要么重签+压缩、要么拒绝，没有任何取值能把拒收变成放行。**键定死签名**：配置一个方案永远不会顺带放开另一个方案。环境变量 `BILI_RESIGN_PASSTHROUGH=1` 优先（同样只影响内置方案）。
  - `credentialRef: string` —— 钉死重签用的 dsh credentials 服务 ref，而不是账号池发现。环境变量 `BILI_CODEARTS_REF` 优先。

  已知方案注册表与可观测性：bili 自带 `sdk-hmac-sha256`（内置，#1884）、`aws4-hmac-sha256`、`hmac-sha256`、`x-ofm-signature`（#2090）的名称标签与出处。**登记是一种承诺而非能力**：按二元契约，每个已登记方案最终都必须在 bili 里补上重签器 —— 在此之前该方案被响亮拒绝（web UI 标记为「等待重签器」）；尚未注册的新方案由形状检测兜底，同样拒绝、绝不静默改写。待处理拒收、各方案实时状态与未解决集合可在 web UI（`/__bili/` → 配置 → 签名上游（resign））查看，或读回环限定的 `GET /__bili/resign`。

  内置（CodeArts）前置条件与临时缓解：`sdk-hmac-sha256` 的重签 arm 由 bili 自己的 dsh native lane 注入 —— 它遍历 `$DSH_HOME/jet-hub/state.json`（Windows 默认 `%USERPROFILE%\.dsh\jet-hub\state.json`）中 `provider: "codearts"` 且未 `enabled: false` 的账号，用宿主凭据服务（必须暴露给 native 插件）逐个解析账号的 `credentialRef`，取第一个能解析出 `{access_key_id, secret_access_key}` 的。如果你的宿主版本缺了其中任何一环（例如某个 DSH 构建不再注入凭据服务、或状态文件布局变更），所有签名请求都会被拒收为 `bili_resign_unavailable`——即使凭据本身有效；这是宿主侧缺口而非 bili 配置错误，最低 DSH 版本随宿主跟踪、不在此钉死。升级宿主之前，`BILI_RESIGN_PASSTHROUGH=1` 可让 codearts 链路字节原样直通（仅内置方案，不压缩）。注意拒收消息打印的配置路径与配置加载器读取用的是同一个函数计算出的精确解析路径，按报错里写的文件改总是对的。

  模型级开关刻意不在本块里 —— 见下面三级说明。

  ```jsonc
  {
    "resign": {
      "sdk-hmac-sha256": { "passthrough": true },
      "aws4-hmac-sha256": { "passthrough": true } // 非内置方案无效（#2090）——配置加载时会被点名
    }
  }
  ```

- **严格三级（route-first）：** #1884 的开关遵循仓库标准联级 —— 环境变量 > 三级（`providers.<url>.models.<name>.benefit`）> 二级（`providers.<url>.resign["<方案>"]`）> 一级（全局 `resign["<方案>"]`）> 内置默认，解析发生在路由之后，与 [`imageBilling`](#imagebilling) 同一条联级：

  ```jsonc
  {
    "resign": {
      "sdk-hmac-sha256": { "passthrough": false }
    },
    "providers": {
      "https://codearts.example.com": {
        "resign": {
          "sdk-hmac-sha256": { "passthrough": true }
        },
        "models": {
          "glm-5.3-flash": { "benefit": true },
          "deepseek-v4.1":  { "benefit": false }
        }
      }
    }
  }
  ```

  - `models.<name>.benefit: boolean`（三级）—— 这个模型在这个 provider 上是否走免费额度计费（重签请求附带参与签名的 `maas_type: benefit` 头）。`true`/`false` 都是显式的 —— `false` 可以把默认集里的模型踢出；未设置则落到内置回退集 `glm-5.3-flash, deepseek-v4.1-flash`（dsh codearts 插件 `CODEARTS_BENEFIT_FALLBACK` 的镜像）。环境变量 `BILI_RESIGN_BENEFIT`（逗号分隔）优先于整棵树。
  - `providers.<url>.resign["<方案>"]`（二级）—— 同样的方案键下 `{ enabled?, passthrough?, credentialRef? }`，逐字段压过全局块。
  - 宿主侧拦截（dsh native lane）运行在路由存在之前，始终用全局块 —— 那是传输必要性判定（签名 body 只能隧道或拒收），不是策略。方案键匹配不区分大小写（电线 token 形如 `SDK-HMAC-SHA256 Access=…`，键一律小写）。

### `billing`

- **类型：** `object` — `{ prices: Record<string, { input: number, output?: number, cacheRead?: number, cacheWrite?: number }> }`，单价为美元/百万 token
- **默认值：** `{}`（由内置 models.dev 快照给已知模型定价）
- **状态：** ACTIVE（#4899）
- **说明：** 面板金钱视图的按模型单价。每份落账的 usage 报告都会在会话上累计一笔美元台账（`session.stats.costUsd`：输入/缓存读/缓存写/输出）；「节省」列另外把折叠节省折算成美元。每个模型 id 的解析顺序：先 `billing.prices`，再内置 models.dev 快照，都没有则不计价（只显示 token —— 不折算假美元，也不显示假的 `$0`）。
  - 键为模型 id，匹配规则与 registry 一致：`"anthropic/claude-sonnet-4-5"`、裸 `"claude-sonnet-4-5"`、大小写漂移都能命中。
  - `input`（美元/百万输入 token）必填 —— 没有锚点价就诚实地不计费；`output` / `cacheRead` / `cacheWrite` 可选，缺省时按输入价计（花费估算绝不伪造折扣或溢价 —— 刻意不用内核经济学比例 r=0.1w / q=4w）。
  - 单价按请求盖戳（最新模型胜出），会话中途换模型立即按新价计；已入账的条目保持当时单价（电表语义）。
  - 形状非法（未知字段、input 零/负、非数值）时整个块在加载时拒收 —— 单价打错字绝不静默失效。
  - Web 编辑器（`/__bili/` → 配置 → 计费单价）列出会话用过的每个模型、预填 registry 默认价并保存回本块；保存空表即删除该块。

  ```jsonc
  {
    "billing": {
      "prices": {
        "anthropic/claude-sonnet-4-5": { "input": 3, "output": 15, "cacheRead": 0.3, "cacheWrite": 3.75 },
        "openai/gpt-5": { "input": 1.25 }
      }
    }
  }
  ```

### `modelContextLimit`

- **类型：** `number`
- **默认值：** `200000`
- **状态：** ACTIVE
- **说明：** 进程级绝对上下文上限（token）—— provider 条目与模型条目都未声明各自上限时的兜底层。可由 `ACP_MODEL_CONTEXT_LIMIT` 覆盖。区别于[压缩调优](#压缩调优)下参与三级合并的 `compress.modelContextLimit` 合并键。

### `providersPath`

- **类型：** `string`
- **默认值：** *（无 —— providers 来自本文件的内联 `providers` 块）*
- **状态：** ACTIVE
- **说明：** 外部 `providers.json` 的路径（内联 [`providers`](#providers) 表的遗留 / 共享文件形态）。可由 `ACP_PROVIDERS` 覆盖。

### `promptCache`

- **类型：** `{ routing?: "auto" | "enabled" | "disabled" }`
- **默认：** `{ routing: "disabled" }`（#5079 起；无法识别的值一律按 `"disabled"` 解析，#5079 之前默认是 `"auto"`）
- **状态：** ACTIVE
- **说明：** bili 自己出网写 `prompt_cache_key` 的总开关，两条 wire 同时管住：chat wire 插件车道请求体盖章 + Responses wire key 注入。客户端自带的 `prompt_cache_key` 不归 bili 管：任何模式下都原样转发（出网 A/B 探测记忆仍会对已证实拒绝该 key 的 origin+model 组合撤掉它）。插件车道上请求体里等于绑定会话 id 的 key 是 bili 自己的机制回显（例如 dsh 的 `PI_CACHE_RETENTION=long` 栈），算 bili 自注入。模式：`"disabled"`（默认）= bili 从不写自己的 key；`"auto"` = #5079 之前的行为（chat wire 每个插件车道请求都盖；Responses wire 仅当上游 host 恰好是 `api.openai.com` 时注入）；`"enabled"` = 所有支持的车道都盖/注（Responses wire 任意 host）。可通过本文件、`ACP_PROMPT_CACHE_ROUTING` 或 Web UI 快速配置开关设置。升级到以该 key 做前缀缓存路由的中转站/号池上游的用户应设为 `"auto"`（或 `"enabled"`）——否则流量可能随机路由、频繁不命中前缀缓存；直连官方 API 的用户保持默认即可。

### `cacheKeepalive`

- **类型：** `{ enabled?: boolean, ttlFactor?: number, maxDurationMs?: number, maxConcurrentPings?: number, assumeTtl?: "5m" | "1h", armWithoutBreakpoints?: boolean, intervalMs?: number }`
- **默认值：** `{}`（功能关闭）
- **状态：** ACTIVE（#3376）
- **说明：** Anthropic 线路的空闲期提示缓存保活（#3376）。Anthropic 前缀缓存按 TTL 过期（每个断点 5 分钟或 1 小时）；会话空闲期间（午休、过夜）缓存失效，下一个真实请求就要为整个已缓存前缀付全价冷重建。启用后，bili 对每个会话快照其最后一次成功转发的请求体——到达上游的精确字节，含其中的 `cache_control` 断点——并在会话保持空闲时以 `max_tokens=1` 按 TTL 推导的节奏重放；命中缓存的响应只需一次最小补全即可刷新 TTL。每次 ping 以上游返回的 `usage.cache_read_input_tokens` 验证：命中则排定下一次；读数为 0 说明前缀已死，立即停止。
  - **武装条件。** 只有成功的（2xx）Anthropic 线路 POST 才会武装/刷新快照。透传请求、重签名通道（存下的签名对应旧字节）、非字符串请求体、超过 64 MiB 的请求体、以及无任何 `cache_control` 断点的请求都不会武装（除非用下面的开关覆盖）。快照仅存内存：重启即清空，下一个真实请求重新武装。
  - **节奏。** `档位 × ttlFactor`：body 中任一断点声明 `ttl: "1h"` 则档位为 `1h`，否则 `5m`；默认因子 `0.9` → 约 4.5 分钟 / 54 分钟一次。可用 `assumeTtl` 覆盖（跳过 body 检测——面向会在 bili 下游注入或改写 `cache_control` TTL 的中继），或用绝对值 `intervalMs`（优先级最高）；`armWithoutBreakpoints: true` 让无断点的 body 也武装（配合 `assumeTtl` 使用）。
  - **停止条件。** 该会话出现真实请求立即取消（真实请求自己就会刷新缓存）；到点时该会话有在途请求则延迟约 5 秒再试；`cache_read_input_tokens = 0` → 停（`prefix-dead`）；HTTP 429 → 立即停；连续 3 次其他错误 → 停；距该会话最后一次真实请求超过 `maxDurationMs`（默认 24 小时）→ 停；`maxConcurrentPings`（默认 4）限制同时武装的会话数，超限时先驱逐空闲最久者。
  - **成本与可观测性。** ping 完全绕过代理管线，因此不会进入 `/acp-cache` 命中率台账（合成流量不得污染健康判定），也不会产生任何缓存归因样本——miss 归因计算跑的请求序列与不开保活时完全一致。每次武装/ping/解除武装都记录 `[keepalive] …` 日志行；`acp_status` 对已武装会话输出一行 `CACHE KEEPALIVE: armed tier=… cadence=… · pings=N [· last-hit Mm ago]`（未武装时不出现）；Web UI 在会话列表显示保活徽标、详情页显示完整状态行，其原始 JSON 配置编辑器可直接写入本配置节（保存时服务端校验）。
  - **逐 provider / 逐模型覆盖。** 所有字段也可写在 provider 路由下（`providers.<url>.cacheKeepalive`），或写在该路由的某个具体模型下（`providers.<url>.models.<model>.cacheKeepalive`）——同一上游后的不同模型可以跑不同的档位/节奏。逐字段优先级：环境变量 > 模型 > 路由 > 全局块 > 内置默认值。

### `autoUpdate`

- **类型：** `boolean`
- **默认值：** `true`
- **状态：** ACTIVE
- **说明：** 周期性 npm registry 版本检查（每 `update.checkIntervalMs`，默认 3 分钟；每进程首次检查忽略节流）。检测所配 `updateTag` 通道上的新版本构建；运行进程是否真正换装取决于 `autoRestartOnUpdate`（自我重启）或公告通道（强制安装）。`ACP_AUTO_UPDATE=0` 关闭。独立于 `advisoryCheck`：关闭自动更新的安装仍会经公告监视器被强制移出已知缺陷版本范围。自 #3619 起，发现新版本后不再立即应用——自动升级在随机延迟窗口内撒点执行（内置默认 15 分钟 – 48 小时，远程策略可调；见下文 [`update`](#update)），以便有问题发版能在铺满前拦下，而不是等全量升级完才发现。

### `autoRestartOnUpdate`

- **类型：** `boolean`
- **默认值：** `false`
- **状态：** ACTIVE
- **说明：** 自动更新安装后的 opt-in 自我重启（#811）：要求零在途请求、通过安装自检、遵守 10 分钟冷却标记；失败时恢复原监听器。`ACP_AUTO_RESTART_ON_UPDATE=1`（任意非 `0` 值）开启。

### `updateTag`

- **类型：** `string`（npm dist-tag）
- **默认值：** `"latest"`
- **状态：** ACTIVE
- **说明：** 自动更新器跟随的 dist-tag 通道（如 `dev`）。滚动的 `pr` tag 跟踪所有 PR 中最新的测试构建；旧式按 PR 的 `pr-N` tag 冻结在该 PR 最后一次构建，仅在显式配置时跟随。可由 `ACP_UPDATE_TAG` 覆盖。

### `advisoryCheck`

- **类型：** `boolean`
- **默认值：** `true`
- **状态：** ACTIVE
- **说明：** 严重缺陷公告监视器（#1481）：轮询伴生包 `billion-context-advisories`（CI 从 `advisories/` 发布），运行版本落入声明的缺陷范围时强制安装钉死的 `target` 版本 —— 可能是**回滚**。独立于 `autoUpdate` 运行，所以关闭自动更新的安装也能被强制移出已知缺陷版本。fail-open：公告源不可达/格式错误只告警，绝不阻断模型流量。`BILI_ADVISORY_CHECK=0` 关闭。

### `advisoryUrl`

- **类型：** `string`（URL）
- **默认值：** *（所配 registry 上的伴生包 `billion-context-advisories` —— 感知 `update.registry`）*
- **状态：** ACTIVE
- **说明：** 公告文档 URL 覆盖。可由 `BILI_ADVISORY_URL` 覆盖。

### `releaseNotesCheck`

- **类型：** `boolean`
- **默认值：** `true`
- **状态：** ACTIVE
- **说明：** release notes 可见性监视器（#1870）：拉取伴生文档 `billion-context-release-notes`，且仅当待更新区间含 `critical` 级条目时，才在 `acp_status` 与 `/acp` 面板显示 "CRITICAL update ready — restart to finish" 或 "critical update available" —— 常规版本从不显示（设计上即静默，#1977）。不安装、不重启；fail-open。`BILI_RELEASE_NOTES_CHECK=0` 关闭。

### `releaseNotesUrl`

- **类型：** `string`（URL）
- **默认值：** *（所配 registry 上的伴生包 `billion-context-release-notes` —— 感知 `update.registry`）*
- **状态：** ACTIVE
- **说明：** release notes 文档 URL 覆盖。可由 `BILI_RELEASE_NOTES_URL` 覆盖。

### `security`

- **类型：** 对象
- **默认：** 各键均不设置（全部 fail-closed）
- **状态：** 生效中
- **说明：** 安全姿态开关 —— 打开会刻意扩宽信任边界的地方，集中在一个块里便于审计。仅配置文件生效：本块任何键都没有 `BILI_*` 环境变量孪生（#2030）。

#### `security.adminRelay` (#3373)

- **类型：** `boolean`
- **默认：** `false`（fail-closed）
- **说明：** 允许宿主 —— 当前是 dsh 的 web 面板 —— 把整个 `/__bili/` 管理面通过宿主自己的 web 入口中继到本机代理，让另一台机器上的浏览器无需代理绑定非回环网卡就能打开面板。无头部署：跑 `dsh web`，把反向代理指向它，在任何地方打开 bili 标签页 —— 设置 iframe 和它的 API 调用与入口同源，走宿主中继。机制：dsh 侧的 bili 插件注册 `/__bili` 前缀路由转发到回环代理（`127.0.0.1:18787` 区），`/bili/origin` 开始上报 `{"relay":true}`，面板 UI 据此改用同源 URL，面板自己的 API 根从页面路径推导 —— 前缀网关（`/app/dsh/…`）也能工作。管理端门槛本身不变（#1538）：中继跳到达代理时是本机非浏览器客户端 —— 回环源地址、回环 `Host`、不携带 `Origin`/`Cookie`/`Referer` —— 与现有检查早已放行的形状完全一致。**安全提示：** `/__bili/` 是完整管理面而非只读仪表盘 —— 包含改配置与写凭据。开启此开关意味着凡能访问宿主 web 入口的人都能触及这些能力；开启前请先给入口加鉴权 / 反向代理。逐请求实时读取：改文件对下一次调用即生效，无需重启。无环境变量 —— 刻意的姿态决策属于文件。

### `maskHosts`

- **类型：** `boolean`
- **默认值：** `true`
- **状态：** ACTIVE
- **说明：** 代理日志中的 host 掩码（#897/#255）：非公开的目标 host（私有中继、内网域名）记为 `<private-host>` 而非原文 —— 因为日志常被原样贴进公开 issue。凭据头掩码独立且始终开启。不动这个开关也能通过 `GET /__bili/stats` → `blindTunnels` 与 `GET /__bili/health`（均仅限 loopback）查看真实目标 host。`BILI_LOG_MASK_HOSTS=0` 关闭。

### `subagentSplit`

- **类型：** `boolean`
- **默认值：** `true`
- **状态：** ACTIVE
- **说明：** Claude Code subagent 会话拆分（#970/#4352），两套机制都由本开关控制。(1) 携带 `x-claude-code-agent-id` + `x-claude-code-parent-agent-id` 对的 anthropic-wire 请求获得自己的 `<session>\|sub:<agent-id>` 会话 —— 独立的锁链与压缩状态 —— 而不是排在主会话锁后面。(2) 无头 claude code 流量（VS Code 扩展构建：其 subagent 不带 agent-id 头、且与父会话逐字共享第一个 system block，因此双信号门必然不命中，#4352）改走顺序优先会话解析器 —— 历史连续的主会话按顺序+内容证据留在原 key，历史不相交的 subagent 借道则分叉到自己的车道：首条 user 消息上带 bili SubagentStart hook token 时按派发铸键（`<session>\|sub:<fp>:t:<token>`），否则用本 run 首条 user 消息片段作兼底（`<session>\|sub:<fp>:<userFp>`），同一父 id 下反复派发的同型子代理不再共用一条压缩会话（#5095）；既无有效 token、又无可用 user 文本的借道保留两段式 `<session>\|sub:<fp>` 形态。设 `BILI_SUBAGENT_SPLIT=0` 同时关闭两套机制。

> **作用域 — 仅 anthropic 线路。** 走 **Responses** 协议的 Claude Code（带 `x-claude-code-session-id`、上游 `/v1/responses`）**不会**经过 `claudeSubagentSplit`。该车道按 instructions 指纹键控（`WIRE_CLIENTS` → `claude-responses`，见 `src/server/lane-decisions.ts`），`subagentSplit` 管不到 —— 在那里设 `BILI_SUBAGENT_SPLIT=0` 无效。该车道的两条出路：
> - `personaSplit: false` / `BILI_PERSONA_SPLIT=0`，或
> - `stableSystemAnchor: true`，把 instructions 漂移当作预期事件，系统提示变更不再把主会话分叉出去。

### `forkAdoption`

- **类型：** `boolean`
- **默认值：** `false`
- **状态：** ACTIVE
- **说明：** 匿名（前缀亲和）客户端的 fork 块继承（#629）：此类客户端在会话中途 fork 自己的历史（编辑重发 / 重新生成更早的回合）时，新会话继承父会话中源内容完整存在于 fork 请求里的压缩块，而不是从零压缩状态起步、把共享前缀从头重新折叠。已识别的 resume-fork 不受此开关管辖 —— 它们随 `resumeInheritance` 一起继承块（#1834）。即使开关关闭，每次匿名 fork 也会记录可继承清单，便于启用前评估收益。`BILI_FORK_ADOPTION=1` 开启。

### `affinitySimhash`

- **类型：** `boolean`
- **默认：** `true`
- **状态：** ACTIVE
- **说明：** 匿名（前缀亲和）客户端的 simhash 链对齐收养（#2265）：当客户端侧大面积装饰性改写（Trae 切换模型后给每条 assistant 消息重打模型标签）打断精确哈希链时，若不处理，每个请求都会新铸一个 pfa-* 会话并从零重折全部历史。本开关在精确前缀匹配与新铸之间增加一级：逐位置比较每条消息的 simhash 指纹 —— 覆盖率 ≥90%（Hamming ≤10）且变异位置 ≥20%（大面积改写而非单点编辑）且至少一条字节相同的 USER 消息（所有权锚点 —— 用户原话不会跨对话重复，机具内容会）时，重新挂回既有会话并保留压缩状态；随后存储链按改写后的字节重锚，下一个请求即回到精确快路径。编辑重发 fork 仍然新铸会话（#629 契约不变）；已识别会话永不收养；双候选歧义时拒绝猜测。`BILI_AFFINITY_SIMHASH=0` 关闭。

### `resumeInheritance`

- **类型：** `boolean`
- **默认值：** `true`
- **状态：** ACTIVE
- **说明：** 已识别客户端的 resume 继承（#1486/#1834）：发送自有 session id 的客户端（如 Claude Code 的 `x-claude-code-session-id`）在全量回放转录（`cc --resume` fork 出新 UUID）的同时以**新的** session id 恢复会话时，bili 把入站历史与该客户端跟踪的链做逐字节匹配（≥8 条消息、追加式跟踪），并在恢复会话的首个请求上继承父会话的 ref 分配 —— 模型的陈旧引用解析到**原始**消息而不是错命中重新编号的消息 —— 同时继承完整存在的压缩块并记录 `derivedFrom` 谱系。父会话永不被修改，新消息编号高于父会话 ref 空间。resume 必须严格**扩展**父会话历史 —— 另一 id 下同深度逐字节回放是重复而非 resume。匿名会话保持自己的 pfa-* 世界（#309）。`BILI_RESUME_INHERITANCE=0` 关闭。

### `stableSystemAnchor`

- **类型：** `boolean`
- **默认值：** `false`
- **状态：** ACTIVE
- **说明：** 稳定 system 锚定（#1085）—— 面向 prefix cache 的最佳努力 wire 层兜底；根因修复属于客户端侧（客户端拥有自己的历史并决定如何呈现指令变更）。仅纯代理模式：插件模式 agent（`x-bili-plugin`）自管上下文，永不被锚定。开启后，bili 记住每个会话首次见到的头部 system/instructions 块，并在客户端 system prompt 之后变化时继续重发那些确切字节：局部变更（与当前生效版本共享 ≥70% 行的文件式编辑）追加一条尾部 `[System context update] …` user note，携带紧凑行级 diff（`-` 删除 / `+` 新增）；非局部变更（结构性重排、工具定义抖动、带时间戳横幅、超过 400 行的头部）直接采纳 —— 一次故意的 cache miss 好过追加会误导模型的噪音；累计超过 8 条 note 同样以最新文本替换锚点。锚点与 note 日志随会话元数据持久化，穿越压缩/compaction。排除在锚定之外：标题生成微请求（OpenAI/Google）、Responses compaction-trigger 请求、auto-mode 分类器请求。`BILI_STABLE_SYSTEM_ANCHOR=1` 开启。

### `chainContentDetection`

- **类型：** `boolean`
- **默认值：** `false`
- **状态：** ACTIVE
- **说明：** bili→bili 链感知的 body 内容检测（#1086/#1421/#1683 后续）：入站请求 body 里携带压缩产物（渲染标签 / 历史性 `acp_status`+`search_context` 工具调用）或带摘要的 `<bili-chain …/>` checkpoint，但既无 `x-bili-hop` 头也无该会话的本地压缩状态时，bili 记录告警观测和/或应用 first-processor-wins 直通。默认关，因为扫描请求 BODY 会对 CCR/文件引入的文本与形似真实标记的模型回声标签误报 —— 只在中间盒子剥掉 `x-bili-hop` 的多 bili 中继窄场景、且你接受该误报风险时启用。`x-bili-hop` 信号本身两种情况都不受影响。`BILI_CHAIN_CONTENT=1` 开启。

### `chainEgressStamp`

- **类型：** `boolean`
- **默认值：** `false`
- **状态：** ACTIVE
- **说明：** 模型可见 `<bili-chain …/>` 链完整性 checkpoint 载体的出站发射（#1683）：开启后，本实例实际处理的每个请求离开时都带上带摘要的戳，使下游 bili 即使在 `x-bili-hop` 头被中途剥离（#1421）时也应用 first-processor-wins。载体落在终端模型也会读的位置（OpenAI/Responses 的尾部 `user` 消息，Anthropic/Google 的尾部 text part），模型会把它当作幽灵用户输入并烧 token 评论它 —— 这就是默认关的原因。独立于 `chainContentDetection`（入站 body 检测）与始终有效的 `x-bili-hop` 直通。仅在上述多 bili 中继窄场景启用。`BILI_CHAIN_STAMP=1` 开启。

### `claude`

- **类型：** `{ nativePort?: number }`
- **默认值：** `{}`（lane 走自管端口区）
- **状态：** ACTIVE
- **说明：** claude native lane 设置。`nativePort` 为 hook 拉起的代理钉死一个**精确**端口（#964/#1660）：严格端口语义 —— 端口上有占位者就大声拒收而不是跳口 —— 且烘焙的受管 `ANTHROPIC_BASE_URL` 指向它。不设时 lane 走自管区（`BILI_ZONE_PORT` 基址 + per-lane sticky），并在每个会话把受管 URL 重新钉到活 origin，端口漂移自愈。可由 `BILI_CLAUDE_NATIVE_PORT` 覆盖。

### `native`

- **类型：** `{ attachExternal?: boolean; attachLanePriority?: string[]; attachPolicy?: "own-lane" | "global-fallback"; attachUrl?: string }`
- **默认值：** `{}`（own-lane 策略；lane'd 实例的 attach 门关闭；无外部 lane 列表）
- **状态：** ACTIVE
- **说明：** native hook 附着选择（#1335、#1660、#2905、#2877）。当 native hook 代码兼容且通过生命周期门禁（`watchdog.armed == true`，或 `attachExternal: true`）时，可搭车一个已在运行的代理而不是自行派生。四个独立开关决定它搭哪台：
  - **`attachPolicy`**（默认 `"own-lane"`，env `BILI_NATIVE_ATTACH_POLICY`）—— lane 亲和，也是“是否发生跨 lane 搭车”的总闸。`"own-lane"`：lane 型 hook 只搭同 lane 的守护；没有时**自行派生**，而不是回落到无 lane / 手动启动的 `bili start` 守护或其他 lane 的守护（那种汇聚会把所有 agent 钉死在一台守护的版本上并双写会话，#2877）。一台**已武装**的无 lane 守护（受管共享代理，#1225）在两种策略下都可被搭车。`"global-fallback"` 恢复 #2877 之前的行为：先同 lane，再兼容的无 lane/用户区守护（配 `attachLanePriority` 时还含列出的外部 lane）。
  - **`attachLanePriority`**（#2905，仅配置文件，无 env）—— 本 hook 在没有自己 lane 的实例时可搭车的**外部 lane** 名字有序列表。当跨 lane 搭车被允许时（即 `global-fallback` 下），attach 优先级为：本 lane 第一 → 按列表顺序的外部 lane → 用户区**永远最后**。未列出的 lane 仍不可挂（泳道隔离 #1225/#1232）。默认 `[]` = 本 lane → 用户区 → spawn。刻意做成显式 opt-in：外部实例的 MITM 白名单未必覆盖你的 provider，否则模型流量会盲隧道、所有压缩工具调用都会失败。对所有 lane 感知的 attach 点生效（launcher 各 lane + hermes 原生插件的发现路径）。示例：`"native": { "attachLanePriority": ["dsh"] }`。
  - **`attachUrl`**（env `BILI_MCP_PROXY`，同样接受 `--origin`；env 优先）—— 显式目标 origin（任意本地或远程 URL）。设置后，发现只附着到该确切 origin（绕过策略过滤）；若它不可达或不兼容，hook 自行派生而非硬失败。这是宿主把自己钉到某台特定常驻守护的方式。
  - **`attachExternal`**（env `BILI_NATIVE_ATTACH_EXTERNAL`）—— 生命周期门禁逃生舱：`true` 时也附着到 *lane 型* 未武装 listener（任何 code/lane 兼容者无论看门狗状态，含 pre-#1330 构建），并整体绕过 `own-lane` 亲和过滤（完全宽松）。它不改变优先哪个 lane 的守护 —— 那是 `attachPolicy`。优先级：`1` 即使文件关闭也开门；`0` 即使文件宽松也关门。
  - **行为变更（#2877）：** 默认从「lane 型 hook 回落到搭乘兼容的无 lane/手动守护」翻转为「自行派生」。若你依赖一台手动 `bili start` 守护服务所有 native agent，请设 `native.attachPolicy: "global-fallback"`（或保留 `BILI_NATIVE_ATTACH_EXTERNAL=1`）。完整机制见 [TECHNICAL-NOTES.zh-CN.md](TECHNICAL-NOTES.zh-CN.md#代理复用与附着门禁122513351232)。

### `pi`

- **类型：** `{ subagents?: PiSubagentsFileConfig | boolean }`
- **默认值：** `{}`（acp_delegate 面按包默认值启用）
- **状态：** ACTIVE（#2230 配置搬家）
- **说明：** 内置 **pi lane 子代理**（`acp_delegate` / `acp_delegate_wait` / `acp_delegate_cancel`，`bili pi` 装入内嵌扩展时注册）的配置。`pi.subagents` 段是该功能的配置家；仓内组件 `pi-subagents/`（npm 名 `billion-context-pi-subagents`）用自己的 loader 读同一段（契约是文件格式，不是共享代码）。此前这些旋钮在 pi 的 `~/.pi/acp.json`（`delegate` / `delegatePrompt` / `displayUsage` / `debug` 四键）——这四键是**已废弃的回退源**：段缺失时仍读取（宿主进程 stderr 打印一次性弃用警告），**段存在后完全忽略**，未来版本移除。改名：`delegatePrompt` → `prompt`；`debug` 限定子代理子系统，**不**与顶层代理 `debug` 冲突。

```jsonc
"pi": {
  "subagents": {
    "enabled": true,              // 总开关；false（或 "subagents": false）移除工具+提示词+快捷键（新会话生效）
    "forceEnable": false,        // 检测到任一作用域（项目级或用户级）的 pi-subagents 安装时仍保留 acp_delegate（#415、#5637）
    "displayUsage": "separate",  // "separate"（独立 footer 块）| "merged"（并入工具结果用量）
    "maxDepth": 2,               // 嵌套深度上限，向子进程传播
    "syncTimeoutMinutes": 5,     // 同步 delegate 硬超时；0/null 关闭
    "idleTimeoutMinutes": 5,     // 异步 delegate 空闲看门狗；0/null 关闭（告警）
    "asyncTimeoutMinutes": 30,   // 异步 delegate 硬时限；0/null 关闭
    "maxConcurrent": 4,          // 后台并发上限（默认无限；超出排队）
    "thinkingLevel": "medium",   // off|minimal|low|medium|high|xhigh|max；优先级 每次调用 > 角色 > 此处 > pi 默认
    "agents": {                  // 角色默认：{ model: "provider/id", thinkingLevel: "…" }
      "reviewer": { "model": "anthropic/claude-sonnet-4-5", "thinkingLevel": "high" }
    },
    "notifyIfRead": "skip",      // "skip" —— 模型已读结果文件则不再补发完成通知
    "fleetShortcut": "ctrl+alt+d", // "" 关闭快捷键（/acp-fleet 仍可用）
    "prompt": null,              // 替换（字符串）或移除（null）ACP_DELEGATE NOTIFICATIONS 附录
    "debug": false               // ~/.pi/acp.log 调试事件，仅限子代理子系统
  }
}
```

**环境变量覆盖**（进程级 spawn 通道，随子代理子进程传播；`PI_ACP_DELEGATE_*` > `pi.subagents` > 已废弃 acp.json > 默认）：

| 环境变量 | 覆盖 | 说明 |
|---|---|---|
| `PI_ACP_DELEGATE_FORCE_ENABLE` | `pi.subagents.forceEnable` | `true`/`false`；非法值告警并回退到文件值。 |
| `PI_ACP_DELEGATE_MAX_DEPTH` | `pi.subagents.maxDepth` | ≥1 整数；非法值告警并回退。 |
| `PI_ACP_DELEGATE_SYNC_TIMEOUT_MINUTES` | `pi.subagents.syncTimeoutMinutes` | `0` 关闭；负数/非数字告警并回退。 |
| `PI_ACP_DELEGATE_IDLE_TIMEOUT_MINUTES` | `pi.subagents.idleTimeoutMinutes` | `0` 关闭（告警 —— 挂死子进程需 `acp_delegate_cancel`）。 |
| `PI_ACP_DELEGATE_ASYNC_TIMEOUT_MINUTES` | `pi.subagents.asyncTimeoutMinutes` | `0` 关闭。 |
| `PI_ACP_DELEGATE_MAX_CONCURRENT` | `pi.subagents.maxConcurrent` | ≥1 整数；非法值回落到文件值，再回落到无限。 |

修改在**新会话**生效（工具在会话启动时注册）。完整 delegate 面文档（角色、执行模型、fleet 检查器）见 [billion-context-pi-subagents README](pi-subagents/README.md)。

### 进程级配置块（#2030）

自 #2030 起，每个纯行为开关在环境变量之外都有配置文件键。解析顺序为**环境变量 > 配置文件 > 内置默认值**：已设置的环境变量值即使内容非法也独占其开关（解析方式与 #2030 之前完全一致 —— 回落到默认值），既不泄漏进文件层、也不被文件层遮蔽。这些块的作用域是**代理进程本身**（传输时序、持久化、会话生命周期、自更新、诊断）。它们有意**不参与**压缩配置的三级合并（[全局 → provider → 模型](#三层合并示例)）：这些开关都不存在按 provider / 按模型的语义 —— 它们的环境变量形态本来就是进程级的，顶层键恰好保持作用域不变。所有键均可选；省略整个块不会改变任何行为。每个开关的完整语义见下文[环境变量对照表](#环境变量的配置键对照-2030)。

```jsonc
// ~/.config/billion-context/billion-context.json — #2030 进程级配置块（全部可选）
{
  // 传输与重试时序
  "network": {
    "upstreamTimeoutMs": 720000,          // 每次上游请求的空闲预算（默认 12 分钟）
    "requestWatchdogMs": 1440000,         // 单请求总预算；默认 = 2× 上游超时
    "replayRetryMax": 3,                  // 瞬态上游 429/5xx 后的尝试次数
    "replayRetryBaseMs": 1500,            // 退避基数；0 禁用延迟
    "maxShrinkPerCompress": 0.4,          // 单次压缩最多缩减的比例 (0,1]；省略 = 不引导
    "keepAliveTimeoutMs": 5000,           // 客户端侧 socket keep-alive
    "clientErrorBackstopMs": 30000,       // 半开客户端 socket 的销毁兜底
    "exposureLogIntervalMs": 3600000,     // [exposure] 遥测间隔；0 禁用
    "streamKeepAliveMs": 15000,           // 上游静默期的 SSE 保活；0 禁用
    "preflightHoldMs": 30000,             // 长 preflight 开始 hold 前的宽限
    "preflightDeadEndCooldownMs": 300000, // preflight 死路判定后的冷却
    "proxyKeepAliveMaxMs": 55000,         // 经上游代理的连接复用上限；0 不限
    "postResponseLingerMs": 5000,         // 响应后关闭的优雅关闭预算（#1982）
    "allowPrivateHttpProviders": false    // 私网明文 HTTP provider 可选放行（#2984）
  },

  // 会话持久化
  "persist": {
    "enabled": true,                      // false = 仅内存，重启即失
    "zstd": false,                        // true = BILIZSTD1 文件（#1080 owner 决定：默认关）
    "debounceMs": 500,
    "tailTokens": 16384,                  // 持久化快照预算；0 = 完全不持久化消息
    "epermAlertThreshold": 5,             // Windows 杀软排除项告警的失败次数阈值
    "epermAlertRepeatMs": 0               // 0 = 只告警一次
  },

  // 会话生命周期
  "sessions": {
    "max": 256,                           // 内存会话 LRU 上限
    "gc": {
      "enabled": false,                   // 显式开启（#1082）：会话文件是用户数据
      "maxAgeDays": 7,
      "maxTokens": 1000000,
      "intervalMs": 3600000
    }
  },

  // 自更新器
  "update": {
    "registry": "https://registry.npmjs.org",
    "checkIntervalMs": 180000
  },

  // 调试与诊断开关
  "diagnostics": {
    "dumpBody": false,                    // dump 完整请求/响应体
    "dumpReq": true,                      // 请求体 dump 的闸门
    "rawDumpDir": null,                   // raw dump 位置；null = <state dir>/raw
    "dump4xx": false,                     // 捕获被拒的 4xx 响应体
    "dump4xxMaxBytes": 2097152,
    "maxTotalBytes": null,                // 转储目录总字节上限；null = 不限制（#2412）
    "maxAgeDays": null,                   // 删除超过 N 天的转储文件；null = 关闭
    "renderNone": false,                  // 停止向出站历史注入 mNNNNN 渲染标签
    "invariantJudge": true,               // L1 advisory 出站不变量判官（#3938）
    "noInjectTool": false,                // 抑制 compress 工具注入
    "noCompressPrompt": false,            // 抑制压缩提示文本
    "countTokensPassthrough": false,      // /count_tokens 原样转发
    "compressProtocol": "tools"           // "tools" | "text"
  },

  // Fake-completion 安全网（#371，显式开启）
  "fakeCompletion": { "retries": 0, "bufCapBytes": 16777216 },

  // 标量
  "codexCompact": "intercept",            // 或 "pass"
  "ccrRetrievalTtlMs": 600000,            // 排队 acp_retrieve 的过期时限；0 禁用
  "decompressTmpCap": 50                  // 并发 decompress 临时文件上限
}
```

### `network`

- **类型：** `{ upstreamTimeoutMs?: number; requestWatchdogMs?: number; replayRetryMax?: number; replayRetryBaseMs?: number; maxShrinkPerCompress?: number; keepAliveTimeoutMs?: number; clientErrorBackstopMs?: number; exposureLogIntervalMs?: number; streamKeepAliveMs?: number; preflightHoldMs?: number; preflightDeadEndCooldownMs?: number; proxyKeepAliveMaxMs?: number; postResponseLingerMs?: number; allowPrivateHttpProviders?: boolean }`
- **默认：** `{}`（内置值依次为：`720000`、`2× 上游超时`、`3`、`1500`、未设置、`5000`、`30000`、`3600000`、`15000`、`30000`、`300000`、`55000`、`5000`、`false`）
- **状态：** ACTIVE
- **说明：** 进程级传输与重试时序（毫秒）。每个键按 env > file > default 解析，对应环境变量分别为 `BILI_UPSTREAM_TIMEOUT_MS`、`BILI_REQUEST_WATCHDOG_MS`、`BILI_REPLAY_RETRY_MAX`、`BILI_REPLAY_RETRY_BASE_MS`、`BILI_MAX_SHRINK_PER_COMPRESS`、`BILI_KEEP_ALIVE_TIMEOUT_MS`、`BILI_CLIENT_ERROR_BACKSTOP_MS`、`BILI_EXPOSURE_LOG_INTERVAL_MS`、`BILI_STREAM_KEEPALIVE_MS`、`BILI_PREFLIGHT_HOLD_MS`、`BILI_PREFLIGHT_DEAD_END_COOLDOWN_MS`、`BILI_PROXY_KEEPALIVE_MAX_MS`、`BILI_POST_RESPONSE_LINGER_MS`、`BILI_ALLOW_PRIVATE_HTTP_PROVIDERS`、`BILI_CA_FILE`。要点：`upstreamTimeoutMs` 端到端约束首字节时间与 chunk 间静默（#551）；`requestWatchdogMs` 是单请求总预算（负值 = 退出该约束）；`replayRetryMax` 统计瞬态上游拒绝后的尝试次数（#189/#1688）；`maxShrinkPerCompress` 限制单次压缩对请求的最大缩减比例，超限则引导模型选择更小的范围（#189）；`streamKeepAliveMs` 在响应零字节写出超过该时长时发一条 SSE 注释行（#1647）；`proxyKeepAliveMaxMs` 把经上游代理的连接复用窗口压在上游回收周期之下（#1263），`0` 取消上限；`postResponseLingerMs` 是代理主动发起的响应后关闭的优雅关闭预算 —— socket 被挂起等待对端 FIN/TLS close_notify，到点销毁（`reason=linger-backstop`）（#1982）；`allowPrivateHttpProviders` 是可选开关（#2984）：为 true 时，私网（RFC1918、127/8、link-local、IPv6 ULA/link-local、`*.local`/`.lan`/`.internal`）上的明文 HTTP provider baseUrl 被 agent-registry 接收与摘要端点守卫放行——这些守卫默认只信任回环明文；公网 IP/域名与 CGNAT（100.64/10）无论如何都拒；默认 false 保持 #2984 之前的行为逐字不变；`caFile`（#3776）让 bili 自己的上游 fetch 额外信任一个根 CA PEM 文件——与内置根证书和 `NODE_EXTRA_CA_CERTS` 合并，从不替换——用于安全扫描软件/企业 MITM 重签的上游。完整细节见[环境变量表](#环境变量的配置键对照-2030)。

### `persist`

- **类型：** `{ enabled?: boolean; zstd?: boolean; debounceMs?: number; tailTokens?: number; epermAlertThreshold?: number; epermAlertRepeatMs?: number }`
- **默认：** `{ enabled: true, zstd: false, debounceMs: 500, tailTokens: 16384, epermAlertThreshold: 5, epermAlertRepeatMs: 0 }`
- **状态：** ACTIVE
- **说明：** 会话持久化行为（对应 `BILI_PERSIST`、`BILI_PERSIST_ZSTD`、`BILI_PERSIST_DEBOUNCE_MS`、`BILI_PERSIST_TAIL_TOKENS`、`BILI_PERSIST_EPERM_ALERT_THRESHOLD`、`BILI_PERSIST_EPERM_ALERT_REPEAT_MS`）。`enabled: false` 会话语仅存内存；`zstd: true` 写 `BILIZSTD1` 文件（#1080 owner 决定：纯 JSON 仍是默认，可恢复性优先）；`tailTokens` 约束持久化折叠快照的预算（`0` 完全不持久化消息）；两个 `eperm*` 键调节 Windows 杀软排除项告警。详见[环境变量表](#环境变量的配置键对照-2030)。

### `sessions`

- **类型：** `{ max?: number; gc?: { enabled?: boolean; maxAgeDays?: number; maxTokens?: number; intervalMs?: number } }`
- **默认：** `{ max: 256, gc: { enabled: false, maxAgeDays: 7, maxTokens: 1000000, intervalMs: 3600000 } }`
- **状态：** ACTIVE
- **说明：** `max` 以 LRU 淘汰约束内存会话数（对应 `BILI_MAX_SESSIONS`；磁盘仍是事实来源）。`warmMax`/`warmMaxBytes` 约束启动预热缓存、`residentMaxBytes` 约束空闲常驻目标（#2803 有界启动：启动只预热最近的热集，其余按需重载；活跃/in-flight 状态永不被逐出）。`gc` 控制陈旧会话文件清理（对应 `BILI_SESSION_GC*`）—— **显式开启**，因为会话文件是用户数据：压缩过的会话永不删除、每次删除都审计记录、年龄 + 无损尺寸双闸门同时满足才删。详见[环境变量表](#环境变量的配置键对照-2030)。

### `plugin`

- **类型：** `{ snapshotCapBytes?: number }`
- **默认：** `{ snapshotCapBytes: 104857600 }`
- **状态：** ACTIVE
- **说明：** 插件面开关（#2017）。`snapshotCapBytes` 限制为公开 fork API（`GET /__bili/plugin/snapshot`、`POST /__bili/plugin/fork`）按插件会话保留的原始 wire 历史快照大小：序列化快照超限时 bili 拒绝留存 —— 该会话不再可 fork（snapshot/fork 返回 `409` 并注明原因），而不是在磁盘上无限保留全量原始副本。默认 `100 MiB`；`0` 完全停用留存；对应环境变量 `BILI_PUBLIC_SNAPSHOT_CAP_BYTES`。详见[环境变量表](#环境变量的配置键对照-2030)。

### `update`

- **类型：** `{ registry?: string; checkIntervalMs?: number; staggerMinDelayMs?: number | string; staggerMaxDelayMs?: number | string; policyUrl?: string }`
- **默认：** `{ registry: https://registry.npmjs.org, checkIntervalMs: 180000 }`（撒点字段未设置 → 内置窗口 15 分钟 – 48 小时；`policyUrl` 未设置 → 官方仓库 raw 地址）
- **状态：** 生效
- **说明：** 自更新器来源（对应 `BILI_UPDATE_REGISTRY`、`BILI_UPDATE_CHECK_INTERVAL_MS`、`BILI_UPDATE_STAGGER_MIN_MS`、`BILI_UPDATE_STAGGER_MAX_MS`、`BILI_UPDATE_POLICY_URL`）。撒点的文件字段接受人类可读时长字符串（`"15m"`、`"2d"`、`"1d12h"`，单位 s/m/h/d/w，可组合）；环境变量保持纯毫秒数字。`registry`/`checkIntervalMs` 在 import 时解析，下次重启生效 —— 与环境变量行为一致。`registry` 用于 hermetic 测试（verdaccio e2e lane）；生产保持默认（#1153）。撒点字段与 `policyUrl` 每个更新周期实时读取。

#### 升级撒点与远程更新策略（#3619）

发现新版本后，自动升级不会立即执行：实例在延迟窗口内随机抽取**一个**时刻——内置默认 **15 分钟到 48 小时**——到点再升。抽中的时刻落盘持久化在缓存目录（`~/.cache/billion-context/.update-stagger.json`），按 `(dist-tag, 目标版本)` 为键，进程重启不重摇（重启频繁的机器不会反复抽到早值）。这样全量升级会摊开在整个窗口内，而不是发版后十几分钟内全体升完，给坏发版留出中途拦截的响应窗（#3401/#3600/#3394）。

窗口合成（min、max 两侧各自独立）：本地 config/env > 远程策略 `default` > 内置值（15 分钟 / 48 小时）。**`0` 表示本机不延迟**——两侧都设 `0` 即恢复旧版立即升级。

远程策略文件：bili 匿名 GET 官方仓库 raw 地址上的 `auto-update-policy.json`（`update.policyUrl` / `BILI_UPDATE_POLICY_URL` 覆盖仅供测试）。带 ETag/If-None-Match 缓存在缓存目录。失败阶梯（fail-open——文件永不阻断升级能力）：拉取/HTTP 失败 → 若最近一次有效副本不超过 30 天则继续用，否则回退本地默认；JSON 非法或 `schemaVersion` 不认识 → 丢弃缓存，用本地默认。零遥测：纯 GET，无 query 参数、无设备 ID。

文件格式（字段只增不删；未知字段忽略）：

```jsonc
{
  "schemaVersion": 1,
  "default": { "minDelay": "15m", "maxDelay": "2d" },
  "overrides": [
    { "range": ">=0.1.200", "maxDelay": "1h" },
    { "version": "0.1.199", "maxDelay": "1m" }
  ],
  "hold": false,
  "blocked": [],
  "pinned": null
}
```

- `default` — 未被 override 命中的目标版本使用的基础窗口。
- `overrides[]` — 按目标版本微调窗口：精确 `version` 优先于 `range`（npm semver 区间）；多个 range 命中取第一个。override 可以只设一侧。
- `hold: true` — 全局冻结自动升级（检查照跑，不动作）。手动 `bili update` 不受影响。
- `blocked: ["x.y.z", …]` — 跳过这些版本；升级器退到下一个未在列表里的已发布版本。
- `pinned: "x.y.z"` — 升级天花板：自动升级永不超过该版本（绝不强制降级正在运行的安装；把运行版本回滚仍是公告通道的职责）。`null` = 不钉住。

安全边界：文件只控制「何时升」和「跳过/钉住哪些已发布版本」，**从不控制装什么字节**。安装来源永远是 npm registry 的 dist-tag 解析；`blocked`/`pinned` 里不是真实已发布版本的值会被忽略并打日志。状态对用户可见：冻结/钉住/撒点等待期间，`/__bili/status` 上报 `updatePolicy`（`source`、`hold`、`pinned`、`blocked`、`plannedUpgrade`），日志同样可见。退出方式：手动 `bili update` 绕过 `hold` 和撒点（但仍遵守 `blocked`/`pinned`）、`ACP_AUTO_UPDATE=0` 完全停掉自动更新、本机 `0`/`0` 撒点恢复旧版时序。

### `diagnostics`

- **类型：** `{ dumpBody?: boolean; dumpReq?: boolean; rawDumpDir?: string; dump4xx?: boolean; dump4xxMaxBytes?: number; maxTotalBytes?: number; maxAgeDays?: number; renderNone?: boolean; invariantJudge?: boolean; noInjectTool?: boolean; noCompressPrompt?: boolean; countTokensPassthrough?: boolean; compressProtocol?: "tools" | "text" }`
- **默认：** `{ dumpBody: false, dumpReq: true, rawDumpDir: <state dir>/raw, dump4xx: false, dump4xxMaxBytes: 2097152, maxTotalBytes: null, maxAgeDays: null, renderNone: false, invariantJudge: true, noInjectTool: false, noCompressPrompt: false, countTokensPassthrough: false, compressProtocol: "tools" }`
- **状态：** ACTIVE
- **说明：** 此前仅有环境变量形态的调试/诊断开关（`ACP_DUMP_BODY`、`ACP_DUMP_REQ`、`ACP_RAW_DUMP_DIR`、`BILI_DUMP_4XX`、`BILI_DUMP_4XX_MAX_BYTES`、`ACP_RENDER_NONE`、`ACP_NO_INJECT_TOOL`、`ACP_NO_COMPRESS_PROMPT`、`ACP_COUNT_TOKENS_PASSTHROUGH`、`ACP_COMPRESS_PROTOCOL`）。除 `compressProtocol` 在启动时一次性解析（同旧环境变量行为）外，其余均按请求实时读取，无需重启。`renderNone` 停止向外发历史注入 `mNNNNN` 渲染标签 —— 仅当你的工作流不需要基于 ref 的压缩时才关闭（#933）。保留期限约束（#2412）：转储目录只写不删、默认无轮转 —— 实测持续开启 body/SSE 捕获约 63 GB/天，数天内即可写满磁盘。设置 `maxTotalBytes` 和/或 `maxAgeDays` 可为其设限（最旧优先删除，`err-*`/`summary-err-*` 事故证据文件受保护不删，删除动作以 warn 级别记录日志）；两者都不设置则保持无限期保留。详见[环境变量表](#环境变量的配置键对照-2030)。

### `fakeCompletion`

- **类型：** `{ retries?: number; bufCapBytes?: number }`
- **默认：** `{ retries: 0, bufCapBytes: 16777216 }`
- **状态：** ACTIVE
- **说明：** 针对流中途被宿主掐断场景的 fake-completion 安全网（#371）—— **显式开启**，`retries: 0`（默认）即 #371 之前的透传行为。`bufCapBytes` 是缓冲响应的 OOM 护栏。对应 `BILI_FAKE_COMPLETION_RETRIES`、`BILI_FAKE_BUF_CAP`。

### `codexCompact` / `ccrRetrievalTtlMs` / `decompressTmpCap`

- **类型：** `string`（"intercept" | "pass"）/ `number` / `number`
- **默认：** `"intercept"` / `600000` / `50`
- **状态：** ACTIVE
- **说明：** 顶层标量。`codexCompact`：bili 是否拦截 codex 原生 compaction 请求并本地伪造 ACP 交接，还是放行到上游（对应 `BILI_CODEX_COMPACT`；按请求读取，两层任一改动都无需重启）。作用范围（#3008）：覆盖显式形态（`/compact` 触发的 `compaction_trigger` 与 `POST /responses/compact`）与以普通请求形态过线的内联自动压缩（按 SUMMARIZATION_PROMPT 模板检测）；用户自定义 compact_prompt 后锚点失配、按原样转发。bili 仅旁路观察到的压缩（pass/安全阀放行）走事后 rebase（#2372）。`ccrRetrievalTtlMs`：排队未送达的 `acp_retrieve` 注入的过期时限，过期大声丢弃（对应 `BILI_CCR_RETRIEVAL_TTL_MS`；`0` 禁用）。`decompressTmpCap`：并发 decompress 临时文件上限（对应 `BILI_DECOMPRESS_TMP_CAP`）。

另有三个 #2030 键扩展了既有块：[`mitm.handshakeTimeoutMs`](#客户端接入)（默认 `10000`，对应 `BILI_MITM_HANDSHAKE_TIMEOUT_MS`）、[`compat.noCacheControl`](#compat)、[`compat.keepResponseId`](#compat)。

---

## Providers

`providers` 块将**上游 URL** 映射到按 provider 的配置。每个键是一个 URL 前缀；每个值可以声明模型上下文窗口、按 provider 的代理、压缩协议、wire 协议声明、压缩覆盖项、图片计费模式、按路由的透传开关，客户端侧直连豁免，以及通道凭据覆盖（[`apiKeyEnv`](#lane-credentials-apikeyenv--credentialref)）。 也允许**命名**的非 URL 键：它们本身对路由惰性无效，可通过 [`bind`](#named-provider-entries-bind) 成为真实 lane。
```jsonc
{
  "providers": {
    "https://api.anthropic.com": {
      "models": {
        "claude-sonnet-4-5": { "context": 200000, "output": 8192 }
      },
      "proxy": "http://10.0.0.1:7890",
      "compressProtocol": "tools",
      "compress": { "maxContextLimit": "70%" }
    },
    "https://relay.example.com/my/custom/complete": {
      "protocol": "openai"
    }
  }
}
```

### URL 键匹配

键通过**最长前缀胜出**的方式与请求的上游 URL 匹配。当请求 URL 等于该键，或以 `键 + "/"` 开头时，匹配成立。这使得匹配在边界上是安全的：键 `https://api.example.com` 能匹配 `https://api.example.com/v1/chat`，但**不会**匹配 `https://api.example.com.evil`（一个攻击者控制的相似域名）。

浅层键（`https://open.bigmodel.cn`）匹配该主机上的所有路径。深层键（`https://open.bigmodel.cn/api/anthropic`）仅匹配该端点。当两个键都匹配时，最长（最具体）的那个胜出。键末尾的斜杠会被自动去除。

**上游匹配不到任何键的请求不应用任何 per-provider 覆盖项。** 若请求 URL 匹配不上上面任何键，该请求只按 registry/全局默认运行 —— 它的 `models.<m>.context`、`compress.modelContextLimit`、proxy、protocol 等全部被静默忽略。最常见的坑是把客户端切到*另一个中转 host*，而你的固定值还写在旧 host 的键下：新 host 是 route-miss，你在旧键下设的东西永远到不了它。自 #2317 起这不再是静默的 —— bili 会按 (upstream, model) 各记一条 `[route]` 警告并列出已知键，在 `[window]` / codex-clamp 行打上 `upstream=<…> route=miss`，超窗 payload 的 preflight 502 也会指向缺失的键，而不是让你重设 `compress.modelContextLimit`。给新 host（或其 URL 前缀）加一个 `providers` 条目即可让你的覆盖项在那里生效。这些行里的端点以指纹形式（`<host:xxxxxxxx>`）而非明文打印，与日志主机掩码策略（`BILI_LOG_MASK_HOSTS`）一致。

### MITM vs `/bili/` key schemes

登录客户端（ZCode 经 MITM）与 API-key 客户端可能打向同一个主机（`open.bigmodel.cn`）。要让两者的配置可以不同，MITM 流量在 provider lookup key 里用 `mitm://` scheme，而 `/bili/` 流量用真实的 `https://`：

| 客户端 | Lookup key 示例 |
|---|---|
| ZCode（MITM，登录） | `mitm://open.bigmodel.cn` |
| API-key 客户端（`/bili/`） | `https://open.bigmodel.cn/api/anthropic` |

于是可以给 ZCode 配专属上游代理而不影响 API-key 客户端：

```jsonc
{
  "providers": {
    "mitm://open.bigmodel.cn":            { "proxy": "http://127.0.0.1:20173" },
    "https://open.bigmodel.cn/api/anthropic": { "proxy": "http://127.0.0.1:20172" }
  }
}
```

两个 scheme 互不重叠：`mitm://` 键只命中该主机的 MITM（登录客户端）流量，普通 `https://` 键只命中 `/bili/`（API-key）流量。

### 命名 provider 条目（`bind`）

一个不是 URL 的键（如 `"claude-bridge"`）是**命名**条目。它本身对路由惰性无效——最长前缀匹配永远命中不了它——只承载 [`compactionOptIn`](#compactionoptin) 之类的 agent 侧身份。加上 `bind` 字段后，它成为另一条 lane 的纯**别名**：

- **类型：** `string` —— 被别名 lane 的 http(s) base URL。
- 解析**纯粹发生在配置加载时**：条目的路由字段（`compress`、`models`、`proxy`、`passthrough`、`compressProtocol`、`compat`、`imageBilling`、`imageTokenCap`、`protocol`）被深合并到绑定 URL 的路由上，效果与直接写在该 URL 键下完全一致。名称本身绝不出现在请求路径或线上；代理保持单一 URL 前缀路由。
- **优先级（按字段）：** 显式 URL 键条目胜过任何别名字段；跨来源时外部 `ACP_PROVIDERS` 文件在每一层都胜过内联配置（别名按来源顺序折叠，先设者胜）。对象按键合并；数组/标量整体取自胜者——不做逐元素合并。
- 没有 `bind` 却仍携带路由字段的命名键是死配置：bili 打印启动警告，点名该键与失效字段（"add `bind`, or move these under the URL entry"），而不是静默忽略。非法 `bind` 值（非字符串、非 http(s) URL）警告并让条目保持无效；URL 键上的 `bind` 被忽略并警告（该键已是 lane）。

```jsonc
{
  "providers": {
    "claude-bridge": {
      "bind": "https://api.anthropic.com",
      "compactionOptIn": true,
      "compress": { "maxContextLimitPct": 0.75 }
    }
  }
}
```

### 通道凭据（`apiKeyEnv` / `credentialRef`）

URL 键通道（或带 `bind` 的命名条目）可以向上游发送**自己的**凭据而非客户端的 —— lane 主人的 key 替换 agent 客户端放在 wire 上的任何凭据（#2336）。典型场景：共享机器代理中，主人的 `deepseek` lane 无论哪个客户端（带谁的私人 key）接入，都用主人的 key 认证。

```jsonc
{
  "providers": {
    "https://api.deepseek.com": { "apiKeyEnv": "DEEPSEEK_LANE_KEY" }
  }
}
```

- **类型：** `string` —— `apiKeyEnv` 是环境变量名（`env:VAR` 语义）；`credentialRef` 是私有[摘要凭据存储](#共享外部摘要服务)中的名称（`secret:NAME` 语义）。每个条目二选一；非法值拒绝整个配置（#1909 纪律 —— 启动失败 / Web UI 400）。
- **替换规则：** `x-api-key` 与 `x-goog-api-key` 直接替换。`authorization` **仅当**客户端值是 Bearer token 时才替换 —— 其它方案（SDK-HMAC 签名、mTLS 指纹…）属签名所有，原样保留并告警。三者皆无的请求会注入 `authorization: Bearer <key>`。
- **#1884 交互：** 请求上 CodeArts 重签名臂活跃时跳过 —— 那里重签名器拥有 `Authorization`。
- **失败姿态：** env 未设或 secret 缺失时，bili 保留客户端自己的头，并按通道+引用告警一次（可见，绝不静默退化成必 401）。解析成功后告警槽重新武装。
- 在共享的转发头集合上一次性生效，请求的每次出站（初次发送、角色阶梯重试、溢出重折、压缩循环、续读重取）都携带通道凭据。

### Route-level k̂ calibration policy（线路级 k̂ 校准策略）

- **类型：** `object` — `{ "disabled"?: boolean, "max"?: number }`，至少需要一个键
- **默认值：** *（未设置——学习到的 k̂ 原样生效）*
- **状态：** ACTIVE
- **说明：** 针对 usage 报数系统性虚高（超出任何诚实 tokenizer 量级）的上游的按路由逃生阀（#3211：中转加价／非 token 口径计费会学出 k̂ ≈ 1.86–1.97，把决策表长期钉死在压力带里——压力带按设计绕过增长门控＋节奏门控，于是每攒几千 token 可压量就再折一次，每次只折到刚够掉回线下：高频小收益折叠循环）。bili 无法只靠 usage 流区分「tokenizer 真更密」和「报数虚高」，所以该策略是**按路由显式 opt-in**，且作用在 k̂ **发布**环节——学习环 `stats.calibrationRing` 保持原始值可供审计，只有生效系数（`stats.calibratedEstimate`）改变：
  - `"disabled": true` —— 该路由永不应用学习系数；决策表走原始本地估算。
  - `"max": <number>`（0 < max ≤ 4）—— 应用系数钳制到 ≤ max。`1` = 只允许通缩学习、永不放大：一条诚实地比本地估算**低**一点计费的线路仍能享受那个修正。
  - 两个键可同时设置；`disabled` 优先。
  匹配规则与其他 provider 字段完全一致（最长 URL 前缀，含路径级键）。生效时机是该路由下一次 k̂ 发布（≤ 3 个 settle 轮次）；移除策略后下一次发布即恢复学习值。非法值（类型错误、空对象、`max` 超出 (0, 4]）会响亮地拒绝整个配置加载。

### `models`

- **类型：** `Record<string, { context?: number; output?: number; compress?: CompressSettings; benefit?: boolean }>`
- **默认值：** *（无）*
- **状态：** ACTIVE
- **说明：** 将模型名映射到其上下文窗口声明。LLM 的 `/models` 端点**不会**返回上下文窗口大小（已在 OpenAI、Anthropic、zhipu、comfly 上验证），因此代理无法在运行时发现它们 —— 你必须在此声明。`context` 是模型的上下文窗口（以 token 为单位）；`output` 是最大输出大小，在请求完全不携带输出预算字段时作为 output headroom 预留的回退值（见 [`outputHeadroomMaxPct`](#outputheadroommaxpct)）。它同时是 #546 输出预算恢复的下限：当客户端自己的 `max_tokens` 在携带工具的 main 请求上萎缩到 ≤ 200 时，代理会把它恢复到该会话最近的健康预算，且恢复目标以模型已知的最大输出为下限 —— 客户端上报的 runtime-info > launcher 通道 > 此处声明值 > models.dev registry 条目（#1665/#1840）。若所有来源都不知道该模型的输出上限，代理会按模型打一条一次性警告：此时恢复只以客户端自己最后的非饥饿值为依据，长会话仍可能在 max-tokens 处被截断。当模型未声明时，代理回退到内置上下文表或 models.dev 注册表。每个模型条目还可以携带按模型的 `compress` 块（见[压缩调优](#压缩调优)），以及 #1884 重签臂的模型级开关：`benefit: true | false` —— 这个模型是否走 CodeArts 免费额度计费（重签请求附带参与签名的 `maas_type: benefit` 头；环境变量 `BILI_RESIGN_BENEFIT` 优先于整棵树，未设置落到内置 `glm-5.3-flash, deepseek-v4.1-flash` 集）。

  内置上下文表是随每个版本发布的静态数据，可能过期 —— 例如 DeepSeek 的规范请求 id `deepseek-flash` 在 models.dev 上没有以该名列出（其窗口列在 `deepseek-v4-flash` 名下），因此只有兜底表能回答它（#852）。日志会为每个模型记录一次胜出来源（`[window] ... fallback=true` 表示值来自内置表）。若解析出的窗口不对，按上文声明 `models.<name>.context`（它优先于注册表和内置表），或固定 `compress.modelContextLimit`；注意 provider 键必须带流量的 scheme（MITM 登录态客户端流量用 `mitm://<host>`，`/bili/` 流量用 `https://<host>`）。

### `proxy`

- **类型：** `string`
- **默认值：** *（继承顶层 `proxy`）*
- **状态：** ACTIVE
- **说明：** 按 provider 的上游 HTTP 代理（`http://host:port`）。仅针对该 provider 覆盖顶层 `proxy`。空字符串表示"显式直连" —— 在这一个 provider 上覆盖全局代理且不使用任何代理。

### `compressProtocol`

- **类型：** `"tools" | "marker"`
- **默认值：** `"tools"`
- **状态：** ACTIVE
- **说明：** 压缩工具注入请求的方式。`"tools"`（默认）将它们作为原生函数调用工具注入。`"marker"` 改用文本触发协议 —— 用于那些无法与已声明的 `tools` 字段共存的下游上游。

### `protocol`

- **类型：** `"anthropic" | "openai" | "responses" | "google"`
- **默认值：** *（无 —— 从请求路径推断）*
- **状态：** ACTIVE
- **说明：** 为这条 lane 声明 wire 协议（#1909），适用于端点路径不在内置后缀表（`/chat/completions`、`/messages`、`/responses`、Google 路径）里的上游。两种粒度：裸 host 键（`"https://relay.example.com": { "protocol": "openai" }`）覆盖该 host 下所有带 body 的 POST；路径键（`"https://relay.example.com/my/custom/complete": { "protocol": "openai" }`）只覆盖该子树。它是客户端侧 `/bili/<protocol>/<origin>` 逃生门的**服务端对应物** —— 覆盖那些改不了 base URL 的客户端（自定义端点路径的中转站、MITM 拦截的 host）。优先级：`/bili/<protocol>/` 显式标记 **高于** 声明，声明高于内置后缀表。声明只负责**识别**请求，不放松任何安全网：body 无法按声明协议解析时原样转发（#1284），无 body 的 GET 永远不会被声明接管。

  **客户端侧对应物 —— `/bili/<protocol>/<origin>` 逃生门：** 当你*能*改客户端的 base URL 但端点路径非标准时，可以完全不动配置，直接把协议写进 URL：

  ```text
  http://127.0.0.1:8787/bili/openai/https://relay.example.com/api/custom/complete
  ```

  `<protocol>` ∈ `anthropic` | `openai` | `responses` | `google`。无论路径是什么，它都强制该 wire 协议，且**高于**一切服务端声明（也高于内置后缀表）。不带协议段的普通形式（`/bili/<absolute-url>`）不变：协议仍从路径推断。URL 形式按客户端生效；当 base URL 改不了（硬编码端点、MITM 拦截的 host）时，用这个 `providers.protocol` 字段按 lane 生效。

  **非遮蔽（#1909）：** `protocol` 独立于其他 provider 字段解析 —— 所有匹配的键按最长前缀优先扫描，**显式声明了** `protocol` 的最深键胜出，因此 host 键的声明继续作用于沉默的路径键（无需重复书写）。*其他*字段维持既有的单条目最长键语义：与任何路径键一样，只写 `protocol` 的路径键在其子树内成为胜出条目，所以 URL 作用域字段（`compress`、`models`、…）的 host 级值不会进入该子树，除非在路径键上重复声明。一个例外：`compressProtocol` 只按上游 origin 解析，路径键无法遮蔽它的 host 级取值。不声明 `protocol` 的路径键仍只是路由配置；`mitm://` 键遵循与其他字段相同的 scheme 划分。非法值在配置加载时响亮报错（web 保存得到 400）。

### `compress`

- **类型：** `CompressSettings`
- **默认值：** *（继承全局 `compress`）*
- **状态：** ACTIVE
- **说明：** 按 provider 的压缩覆盖项。这是三层合并中的**第 2 层** —— 见[压缩调优](#压缩调优)。

### `compat`

- **类型：** `{ roles?: Record<string, string>; dropFields?: string[] }`
- **默认值：** `{}`（禁用）
- **状态：** ACTIVE
- **说明：** 按 provider 的线上兼容覆盖。`roles` 把消息角色映射为该上游接受的角色名，例如 `{"developer": "system"}` —— 用于拒绝 `developer` 角色的上游（#552，新版 codex 客户端会发这个角色）。作用于最终转发的 `openai`/`responses` 请求体 —— 客户端发送的角色和 bili 自己注入的提示一视同仁 —— 压缩重试循环重发的请求体同样携带该改写。按键覆盖全局 `compat` 块（见[服务端设置](#服务端设置)）。`dropFields` 删除严格 schema 上游拒绝的客户端固定字段（#1757）：点分纯对象路径（无通配/下标），与全局列表**相加**合并（provider 只能追加、不能撤销全局路径）；仅结构删除 —— 字符串值永不改动，不存在的路径跳过，无命中时逐字节转发。canonical 用例 —— SenseNova Responses 网关对 pi-ai 固定发送的 `reasoning.summary: "auto"` 返回 400：

  ```jsonc
  {
    "providers": {
      "https://token.sensenova.cn/v1": {
        "compat": { "dropFields": ["reasoning.summary"] }
      }
    }
  }
  ```

### `passthrough`

- **类型：** `boolean`
- **默认值：** *（无 —— 压缩开启）*
- **状态：** ACTIVE
- **说明：** 按路由覆盖全局 [`passthrough`](#passthrough) 设置。设为 `true` 时，匹配该路由的所有请求**逐字节转发**：不走 kernel 往返（不重序列化 messages、不注入 ACP 渲染标签、不删除 `prompt_cache_key`），响应原样 pipe，该路由不建立 session 状态。用于上游反作弊会拒绝 bili 改写后请求体的场景 —— 例如 ZCode 对 kernel 重建的 `messages` 请求体返回 `405 / 3012`（"request has been blocked due to unusual activity"，#661）。`mitm://` 键只命中该 host 的 MITM（登录态客户端）流量，普通 `https://` 键只命中 `/bili/`（API key）流量 —— 两种 scheme 互不重叠：

  ```jsonc
  {
    "providers": {
      "mitm://zcode.z.ai": { "passthrough": true }
    }
  }
  ```

### `direct`

- **类型：** `boolean`
- **默认值：** *（无 —— 路由走 bili）*
- **状态：** ACTIVE
- **说明：** 客户端侧路由豁免（#1622）：设为 `true` 时，这个上游在**客户端侧**永不被指向 bili。改写 provider store 的原生通道（目前是 ZCode）会跳过匹配的 provider 条目而非包装它们 —— 流量客户端 → 上游原样直达；与 [`passthrough`](#passthrough) 不同（后者仍在代理处终止）。匹配规则与其他 provider 字段相同（最长 URL 前缀），因此任何 lane 都能以同一方式遵守。用于必须看到客户端真实 origin 的上游（例如请求签名从 origin 派生的账号），或单纯不想让某 provider 走本机 bili 的场景：

  ```jsonc
  {
    "providers": {
      "https://api.moonshot.cn/v1": { "direct": true }
    }
  }
  ```

### `imageBilling`

- **类型：** `"auto" | "pixels" | "bytes"`
- **默认值：** *（全局 `imageBilling`，再回退 `"auto"`）*
- **状态：** ACTIVE
- **说明：** 按路由覆盖尺寸门的图片计费方式（#767/#1843）。字节计数 relay 设 `"bytes"` —— 字节计费下，历史 baseline 超窗加上大 base64 截图会让 preflight 永远 502，而上游实际每图只收几千 token；正因如此，`"bytes"` 自 #1843 起是显式选择，而不再是未知 host 的默认。两级都未显式设置时，计费对所有 host 解析为 `"pixels"`（#1843：像素先验 —— 每张截图约 1K–3K token —— 对所有视觉编码器都是正确的数量级，而旧 bytes 默认在非 OpenAI 上游上偏差可达 15×）。`BILI_IMAGE_BILLING` 环境变量覆盖两级配置：

  ```jsonc
  {
    "providers": {
      "https://relay.example.com/v1": { "imageBilling": "bytes" }
    }
  }
  ```

### `imageTokenCap`

- **类型：** 正整数（每图 token）
- **默认值：** *（全局 `imageTokenCap`，再回退未设置 —— 无上限）*
- **状态：** ACTIVE
- **说明：** 按路由的单图 token 估算天花板（#1843），叠加在该路由解析出的任何计费模式之上。优先于全局 `imageTokenCap`；`BILI_IMAGE_TOKEN_CAP` 环境变量优先于两者。非数字或非正值按宽松解析丢弃（与 `imageBilling` 一致）。

---

## 压缩调优

压缩行为由 `compress` 块控制，它可以出现在三个层级。它们按**逐字段、最深层胜出**的方式合并：在更深层设置的字段会覆盖上层同名字段，但更深层*未设置*的字段**永远不会**清除上层已设置的值。换言之，子级按字段覆盖父级 —— 它绝不是整体替换对象。

### 共享外部摘要服务

可选的 `compress.externalSummary` 会把压缩摘要交给一个或多个独立配置的模型。它与其余 `compress` 字段一样存在于全部三个层级，采用整链替换语义：在更深层级（provider 或 model）设置的链会**整体替换**上层链，不做按目标或按预算的子字段合并，与 `tiers` 完全一致。只有 `enabled` 为 `true` 时才启用；启用后按顺序调用目标，目标失败或返回不可用摘要时继续使用下一个目标。摘要请求不会复用主请求的 provider、模型或认证信息。启用该功能后，压缩工具中的 `summary` 变为可选的、非权威提示；代理仍保留原文可恢复，只提交通过校验的外部摘要。由于会话模型不再撰写最终摘要，链启用期间注入的压缩系统提示会去掉摘要撰写规则（`HOW TO COMPRESS`、`KEEP VERBATIM`、`DROP`、`PRIORITY`）和单条摘要长度预算；摘要请求本身仍携带完整规则（#4460）。

目标是**对 `providers` 表的引用**：每个条目是字符串 `"provider/model"`，其中 `provider` 是一张*具名拨号配方*（`providers` 表中带拨号字段的非 URL 条目），`model` 是其 `models` 表中的一个键。端点、协议与凭据均由配方推导，不需要在每个目标里重复 URL：

```json
{
  "providers": {
    "glm": {
      "baseUrl": "https://open.bigmodel.cn/api/paas/v4",
      "api": "openai",
      "apiKeyEnv": "GLM_API_KEY",
      "models": { "glm-4.9-flash": { "outputTokens": 4096 } }
    },
    "claude": {
      "baseUrl": "https://api.anthropic.com",
      "api": "anthropic",
      "credentialRef": "primary",
      "models": { "claude-haiku-4.5": {} }
    }
  },
  "compress": {
    "externalSummary": {
      "enabled": true,
      "targets": ["glm/glm-4.9-flash", "claude/claude-haiku-4.5"],
      "budget": { "totalTimeoutMs": 50000, "targetTimeoutMs": 25000, "maxSummaryBytes": 65536 },
      "concurrency": 8,
      "autoFold": true,
      "autoFoldTargetTokens": 40000
    }
  }
}
```

配方包含：`baseUrl`（必须 HTTPS，本地开发可用回环 HTTP；拒绝内嵌凭据、代理递归路径与任意 query 参数）；`api`（`openai` | `anthropic` | `responses` | `google` 四选一，决定线上协议并从 `baseUrl` 推导请求路径）；恰好一个凭据引用 —— `apiKeyEnv: "变量名"`（调用时读环境变量）或 `credentialRef: "名字"`（通过 Web UI 存储的值）；以及 `models` 表，每个模型可设 `contextWindow`（默认 128000）、`outputTokens`（默认 `min(8192, 窗口/4)`）、`stream`（默认 false）。配方也可以像 URL 条目一样拆成 `recipe`/`bind` 路由形态；具名条目未绑定时对路由不生效（routing-inert）。

每条链最多 16 个目标。通过 Web API 保存启用的链时会校验每个引用可解析（未知 provider 或 model → HTTP 400）。运行时遇到不可解析的引用会记录一次警告并禁用整条链直至修复 —— 绝不会回退用主模型写摘要。`secret:` 值单独存储在私有的 `billion-context.json.summary-credentials.json` 文件中，不随主 JSON 配置下发，配置 API 也不会返回。Windows 上请用仅管理员的 ACL 保护该文件及其父目录；确认没有代理进程在写存储后，残留的 `.lock` 文件需手工删除。总预算由全部目标与压缩入口共享；取消或会话状态变化会丢弃已生成但未落盘的结果。代理端插件桥（dsh / pi / opencode / codex MCP）会把每次 `compress` 调用的 HTTP 等待时间设为 `totalTimeoutMs` 加少量开销余量 —— 启动时从代理学习得到 —— 因此调高该预算不会再让长折叠被隐藏的 60 秒客户端超时截断（#2652）。

`concurrency`（整数 `1..32`，默认 `4`）决定**进程级摘要队列**的大小：本机所有外部摘要调用 —— *全部* 会话的 preflight 自动折叠加上每次模型发起的 `compress` 调用 —— 共享同一个在途请求池。当你的摘要服务有余量（本地中继、自托管模型、高配额 flash 端点）时调大它；小配额 provider 保持保守默认即可。某条链设置的值只在该链的工作在途期间调整共享池大小；多条不同取值的链并发运行时，池子增长到最大需求，待这些批次结束后回到基础值 —— 任何单个会话都无法永久改变其他会话看到的池大小。注意该旋钮是**只增不减**的：单个会话调大池子不应压制其他会话的在途工作，因此低于默认值的取值（`1..3`）能通过校验但永远不会把池子缩到 `4` 以下 —— 不要指望设小值来保护配额，请改配该链自己的 `budget`/`targetTimeoutMs`。

与 budget 的交互：一个批次能达到的折叠速率由池能容纳的并发数（`concurrency`）和每次调用的时限（`targetTimeoutMs`）共同决定 —— 单看 budget 并不能解释结果。池饱和不会表现为可见错误：批次还在排队就耗尽总时限的话，会被整体丢弃为 `batch=deadline` 且没有任何尝试记录（`attempts=[]`），折叠过程也会就地停止而不是继续排在拥塞后面。对 auto-fold 而言这被当作暂时的调度拥塞而**非**链路故障：不会触发下文所述的 10 分钟退避，下一个回合会在（有望已排空的）池子上重试。如果你看到这些日志行、而直接调用目标却很快成功，说明瓶颈是池而不是超时。

deadline 语义（#4833）：`targetTimeoutMs` 限制的是**每一次单独派发**——即使链上只有一个目标，一次慢调用也不能吃掉整个 `totalTimeoutMs`（回退顺序里的每个目标都拿到自己全新的 `targetTimeoutMs` 窗口，全部从共享的总预算里扣）。某个 deadline 到期时，在途的这次尝试会被中止且**不会重试**：有界重试循环（`attempt 1/3`）只对瞬时 provider 判定（429/5xx/风控 body 标记）和 fail-fast 网络死亡重新派发；deadline 中止会立即终结该次尝试。失败日志会标明是哪只时钟到期：每次尝试的 warn 行携带来源——`target-timeout`、`batch-deadline`，或真正的下游取消时的 `client-abort`——外加安全诊断（已耗时、实际生效的预算、协议/流式模式、payload 字节数、输入 token 估计与输出字符上限），`completed N/M range(s)` 行记录每个尝试的明细（`attempts=[t0:timeout (target-timeout 25000ms (elapsed 25002ms))]`）；当一次 `compress` 整体失败时，同样的诊断也会进入工具结果。大上下文场景取值建议：非流式摘要在收到任何字节之前就要付完整生成延迟，所以 `targetTimeoutMs` 必须覆盖你最大预期输入下的处理 + 完整生成时间——几十万 token 在较慢端点上经常超过默认的 25 秒。若大折叠出现 `target-timeout`，应调高 `targetTimeoutMs`（并保持 `totalTimeoutMs` 足以容纳你预期的回退深度），而不是直接禁用整条链。

两个可选旋钮可把这条链升级为**代理驱动的自动折叠器**（`autoFold`）：`"autoFold": true` 后代理不再等模型调压缩工具 —— 原本只守溢出窗口的零模型折叠引擎同样会在转发前把对话折到 `autoFoldTargetTokens`（默认：模型窗口的一半）以下，范围由内核选定、摘要由外部链完成。主模型完全看不到 nudge，也不会把思考预算花在起草压缩方案上。该旋钮随整链替换语义生效，且只在链本身启用时才起作用——在链未启用（或省略 `enabled`）时设置任一旋钮均无效，并会记录一次警告而非静默失效；`autoFoldTargetTokens` 必须是 `[8192, 10000000]` 内的整数。失败时 fail-open：链在折叠时出错则照常转发请求，退避 10 分钟内暂停自动折叠并恢复经典 advisory nudge。一个例外（#2662）：若零进展完全由队列丢弃造成——批次已提交但因共享池饱和、没有任何一次摘要调用真正派发——则不触发退避（那是调度拥塞而非链故障），auto-fold 在下一轮直接重试。

auto-fold 的增长触发是**收益门槛制**（#3444），不是裸阈值：只有文本通道超出有效目标预算至少 **4096 token** 才会武装增长折叠——已坐在目标上（或刚刚过线）的载荷会直接照常转发，不会为了省不到固定成本的量去烧一整轮外部摘要往返。折叠后同一道门槛再算一次：一场增长折叠实际省下不足 4096 token，就按零进展同样处理，武装 10 分钟退避。图片主导的载荷豁免（图片不可折叠，其超出量永远算不上“预期收益”）；经典溢出折叠不受影响——那是必须触发的。另外，有效目标有一个**实测下限**：当会话不可压缩的基线（系统提示词 + 工具定义 + 存活尾巴）大于配置的 `autoFoldTargetTokens` 时，目标会被抬到实测值并告警提示真实数字——否则一个永远够不着的目标会在每轮请求上重复武装注定徒劳的折叠。下限永远不会把目标抬过模型窗口。

#### Agent 上报的 providers（兜底层）

ACP 原生 agent（当前为 `pi` 扩展）会在每个进程内向代理上报自己已配置的 providers（`POST /__bili/agent-providers`）：provider 名、base URL、线上协议、已解析的 API key 与模型清单。这些 recipes 构成一个**兜底层** —— 链可以直接引用 `"zhipu/glm-5"`，无需在文件里重复拨号字段；在 agent 自身配置过的 provider 可直接用作摘要目标。合并序为**文件优先**：同名 file recipe 会完全遮蔽 agent 对该 provider 的贡献（含模型清单）。agent 层永不落盘：key 只存在于代理进程内存，配置 API 不返回，也不进日志。上报侧的跳过规则：OAuth 认证的 provider、`auth.json`（“stored”）凭据、端点指回代理自身的 provider、以及没有摘要拨号协议的 provider（`bedrock`、`vertex`、`mistral`、`pi-messages`）都不会上报；plain-HTTP 非回环 baseUrl 同样不会发送（服务端会拒绝——内联 apiKey 不能走明文，#2585）。接收按条目隔离：被拒的条目只会被记录并出现在响应的 `skipped` 列表里，不再丢弃整份上报——其余条目照常注册。Web 面板的目标下拉里 agent 上报的模型带 `(agent)` 标记。

三个层级，从最宽泛到最具体：

1. **全局（Global）** —— 顶层 `"compress": { … }` 键。应用于每个请求。这是唯一会生效 `injectTool` / `injectNudge` 开关的层级。
2. **按 provider（Per-provider）** —— `providers[url]` 条目内的 `"compress": { … }` 块。
3. **按模型（Per-model）** —— `providers[url].models[model]` 条目内的 `"compress": { … }` 块。

对于每个请求，代理通过最长 URL 前缀匹配（找到 provider）和请求的模型名（找到模型条目）来解析设置，随后按 全局 → provider → 模型 合并。

### CompressSettings 字段

#### `modelContextLimit`

- **类型：** `number | string`
- **默认值：** *（模型的原始窗口）*
- **状态：** ACTIVE
- **说明：** 上下文窗口大小，以 token 为单位。它是引擎用于计算使用率比例的**分母**（`usage = tokens / modelContextLimit`）—— 它**不是**截断上限。接受绝对数值（`200000`）或百分比字符串（`"80%"` = 模型原始窗口的 80%，从内置表或 models.dev 注册表解析）。在每个层级都省略时，使用原始窗口。这是模型上限的最高优先级来源；它会覆盖内置表、旧版按模型的 `context` 字段以及顶层的 `modelContextLimit`。注意它同时也是**预检压缩的硬墙**：一旦载荷达到该值，代理会在转发前主动折叠上下文；若折叠后仍超出，请求会直接快速失败而不是发往上游。若希望日常上下文保持较小、同时允许大读取任务突发到原始窗口，请让 `modelContextLimit` 保持为原始窗口值，改用 `maxContextLimit` 作为软目标（见[软目标与弹性余量](#软目标与弹性余量-1122)）。
- **溢出武装行为 (#3450)。** 当上游以"窗口超限"错误拒绝载荷时，代理会把这次拒绝"武装"给下一次尝试：若此处声明的窗口与上游给出的数值不一致，会记一条一次性警告（同时给出两个值）并按两者中较小者折叠；若错误正文还给出了 token 计数（如 `you requested N tokens (M in the messages, K in the completion)`），则把 `M` 记为实测载荷大小（上限不是尺寸），并在该武装存续期间从本墙中扣除 `K` 再判断载荷是否装得下——上游已证明完成份额与输入共用同一预算。下一次真实的 usage 报告会同时退役该武装与预留。如果你的声明有误，把本键设为真实窗口即可：警告消失，折叠目标随之修正。

#### `outputHeadroomMaxPct`

- **类型：** `number | string`
- **默认值：** `0.25`
- **状态：** ACTIVE
- **说明：** 输出预留（output headroom）的上限，以上下文窗口的比例为单位：预留量 = `min(max_tokens, pct × window)`。**预算来源：** 当请求完全不带输出预算字段（`max_tokens` / `max_completion_tokens` / `max_output_tokens`）时 —— 例如 Codex native Responses 路径不发送 `max_output_tokens`（#924）—— 代理回退到模型声明的最大输出：先取 per-route 配置 `providers[url].models[model].output`，再取 models.dev registry 的 output ceiling（bundled snapshot 离线兜底）；都拿不到则不预留。同样的 cap 也作用于回退值。该预留让引擎的 nudge/truncate 档位位于 `window − 预留量` 之下，防止长回复把「输入+输出」推进窗口之外 —— 适用于把输出计入窗口的 API（Anthropic Messages 豁免：其 input limit 独立于 `max_tokens` 执行，故排除在外）。不设上限时，注册最大输出占窗口比例大的模型（如 262144 窗口上 maxTokens 131072）会失去大半输入预算，75% 强制压缩阈值会在约三分之一的完整窗口处就触发。默认 0.25 在控制损失的同时保证只要单轮回复不超过窗口的 25%，就不会在 95% 紧急阈值下溢出；更长的回复会溢出一次，由下一轮的 overflow self-heal 恢复。注意该上限只放宽过大的预留：当 `max_tokens` 本身 ≤ `pct × window` 时，预留仍是完整的 `max_tokens`（与旧行为逐字节一致）。接受比例（`0.25`）或百分比字符串（`"25%"`）；设 `0` 完全禁用预留；`>= 1` 恢复旧的完整预留行为（input + 用满预算的响应总能放进窗口 —— SGLang/vLLM 等严格后端的要求）。负数或无法解析的值会拒绝整个 `compress` 块。示例：窗口 262144 token、`max_tokens = 131072` → 默认 `0.25` 预留 65536 → 有效窗口 196608（旧完整预留：131072）；`max_tokens = 65536` → 预留 65536 → 196608 不变（65536 ≤ 窗口的 25%）。与 billion-context-pi（`#207`）对齐，见 #896。

#### `maxContextLimit`

- **类型：** `number | string`
- **默认值：** `"75%"`
- **状态：** ACTIVE
- **说明：** 触发**强制压缩** nudge 的上下文使用率阈值。一旦使用率越过该比例，引擎就会触发一个绕过 growth-gate 与节奏检查的 nudge。接受比例值（`0.75`）或百分比字符串（`"75%"`）。值越小，压缩越早。映射到内核字段 `nudge.maxContextLimitPct`。

#### `emergencyThresholdPercent`

- **类型：** `number | string`
- **默认值：** `"95%"`
- **状态：** ACTIVE
- **说明：** 触发大型工具输出**紧急截断**的上下文使用率阈值。接受比例值或百分比字符串。必须大于或等于 `maxContextLimit`。映射到内核字段 `nudge.emergencyThresholdPct` 和 `truncate.threshold`。

#### `nudgeGrowthTokens`

- **类型：** `number`
- **默认值：** `50000`
- **状态：** ACTIVE
- **说明：** 软压缩 nudge 的 token 增长步长。每当有这么多 token 变为可压缩时，大约就会触发一次 nudge。值越小，nudge 越频繁。映射到内核字段 `nudge.growthFloor` 和 `nudge.growthCap`（它将引擎的自适应区间扁平化为这个固定步长）。**保持该值与最小模型窗口成比例：** T1 质量触发需要整整一个步长的可压缩内容，因此步长大于窗口（例如对 ~1M 窗口设 `1500000`）会让质量触发在整个窗口内都不可达——usage 百分比压力带和 preflight 仍兜底，但增量折叠会静默失效，超窗请求（会话中途 fork 到更小窗口模型的典型场景）不再提前折叠，而是直接坠入多轮 preflight 总结马拉松。

#### `minPressureBenefitTokens`

- **类型：** `number`（token 数，≥ 0）
- **默认值：** *（未设置——内核默认 `max(5000, 上下文上限 × 1%)`）*
- **状态：** ACTIVE
- **说明：** 压力带 nudge（usage 已 ≥ `maxContextLimit`）触发前必须有的最小可回收 token 量。压力带按设计绕过增长门控＋节奏门控，所以在决策表被放大（k̂ 放大，#3211）的线路上，几千 token 的可压量就够再触发一次折叠——每次只折到刚够掉出压力带、随即又被顶回去：高频小收益循环（「到线就折、每次只折一点」）。把这个下限调大（例如 ~200k 窗口设 `50000`），低于下限的压力 nudge 会被抑制（日志可见；`truncate.threshold` 仍是安全阀），增长持续累积直到**一批**大到足以把 usage 压出压力带的批量——这正是诚实线路靠增长门控免费获得的节奏。显式 `0` 恢复老的任意 pending 行为。与其他 compress 字段一样跨全局 → provider → model 按**字段**合并。映射到内核字段 `nudge.minPressureBenefitTokens`。

#### `requireUsageSampleForPressure`

- **类型：** `boolean`
- **默认值：** `true`
- **状态：** ACTIVE
- **说明：** 压缩决策计量路径的「幻影压力」守卫。回合被中断、或上游短 TTL 把 usage 报告弄丢时，本轮判定读数只能落回本地估算（字符级上界）——它量的是即将被改写丢掉的入站字节，实测比真实计费高约 3 倍。这种坏表针过去会直接扣 EMERGENCY/OVER-LIMIT 扳机，对着账单里根本没出现过的内容做破坏性改写，还烧掉前缀缓存。开启本守卫后：估算读数下的压力带（usage ≥ `maxContextLimit`）nudge 延后**一轮**——下一次请求必然带着新鲜计费报告（或来源稳定的锚点），拿真数再决定，代价≈0；硬溢出兜底（`truncate.threshold`、preflight 输出钳制）全程照旧武装。计费级读数（"usage"）与不传来源标记的调用方字节不变；非压力档（增长/节拍/初见大量）完全不受该标记影响。显式设 `false` 恢复旧的估算驱动压力注压。与其他 compress 字段一样跨全局 → provider → model 按**字段**合并。映射到内核字段 `nudge.requireUsageSampleForPressure`。

#### `tierNudgeTokens`

- **类型：** `object` — `{ "t1"?: number, "t2"?: number, "t3"?: number }`（每个值为 token 数，≥ 1）
- **默认值：** *（未设置——每层使用各自的派生值）*
- **状态：** ACTIVE（需要 acp-kernel >= 0.0.108）
- **说明：** T1/T2/T3 三条压缩路径的分层 token 质量触发阈值（#2376）。默认三层都从 `nudgeGrowthTokens` 派生（T1 = 步长，T2/T3 = 步长 × 1.5）；此字段可逐层独立钉死——例如长任务保持 T1 激进、让 T2 提前或延后蒸馏。每个**未设置**的子字段回退到该层的派生默认值，因此缺省或空对象与统一值完全向后兼容。只有 token 质量触发比较会变化：数量触发（`tiers.tier2Trigger` / `tiers.tier3Trigger`）、节奏下限、first-sight 质量旁路、压力/紧急路由均保持既有基准不变。跨全局 → provider → model 按**子字段**合并（model 层的 `t2` 不会丢掉 provider 层的 `t1`）。映射到内核字段 `nudge.tierGrowthTokens`。
#### `nudgeModelDecided`

- **类型：** `boolean`
- **默认值：** *（关闭，除非显式设置）*
- **状态：** ACTIVE (#2228)
- **说明：** 模型自决的压缩时机。开启后，**tier-1**（温和增长或超阈值）提醒触发时不再立即注入 advisory 文本，而是先发一次短 **side call**：复用会话已缓存的前缀（同样的 system/tools/messages 前缀、极小输出预算、15 秒空闲超时），让模型以当前任务为前提判断"现在压缩是否净收益为正"，并可给出建议折叠范围与简短主题。回答必须是严格 JSON（`{"compress": true|false, "range": "mNNNNN-mNNNNN"?, "topic": "?"}`），其余任何输出都按失败处理。有效的 "yes" 会注入一条明确的压缩指令并带程序最终确定的范围——建议范围只有完整落在某个存活可压缩范围内才被采纳，否则取最大的存活范围；"no"、格式错误或超时则本轮不注入任何东西。**连续 3 次硬失败**后，下一次 arm 回退到原有 advisory 一次并把计数清零（自愈阶梯）。**EMERGENCY** 档与 **tier-2/3 蒸馏**永远不经过决策，逐字保留原有 advisory。该字段仅宿主侧使用——不传入内核。默认关闭。

#### `nudgeDecisionMaxTokens`

- **类型：** `number`
- **默认值：** `200`
- **状态：** ACTIVE (#2228)
- **说明：** `nudgeModelDecided` 开启时，模型决策 side call 的输出预算（token）。必须 > 0（非法值在配置加载时被拒绝）。

#### `requireNudge` / `requireRecommendation`

- **类型：** `boolean`（各自独立）
- **默认值：** *（关闭，除非显式设置）*
- **状态：** ACTIVE (#5683)
- **说明：** 针对会自行主动压缩的模型的策略门禁（现场案例：qwen 27b 没有任何提示就调用 compress）。两者都是宿主侧字段——不传入内核——与其他 compress 字段一样按字段在 global → provider → model 三级合并，可在 web 面板快速配置卡片或任意配置层级编辑，从下一个请求起热生效。
  - `requireNudge`（时序门禁）：只有**当前轮次**压缩提醒真正送达过模型（post-gate 投递事实 `nudgeOutcome === "injected"`——advisory 提醒、模型自决指令、紧急提醒都算；"gated"/"vetoed"/"skipped" 不算）才允许模型发起 compress，否则拒绝并回一条错误回执，告知未提示压缩在本线路被禁用、等提醒出现再压。武装在同一轮内的 loop 重请求间保持（一轮响应一个提醒可连续折几次），到下一个未提示轮次自动解除。
  - `requireRecommendation`（范围门禁）：提交的每个范围必须落在 bili 当前**推荐**折叠的集合内——与 nudge 文案、`acp_status` 展示的同一份实时可压缩列表（有本轮 prepare 快照用快照，否则实时重算，带常规的 viable + dead-ref + `minCompressRangeChars` 过滤）。按「覆盖」判定而非精确相等：把推荐跨度拆成小段通过（bili 自己的首见消化指南就鼓励拆分）；已折进活跃块的消息豁免，重折已有块更新摘要保持合法。范围里含任何其他仍存活消息则整体拒绝，回执点名越界跨度并指向 `acp_status`。
  - 豁免与交互：bili **自己**的溢出兜底折叠（preflight / auto-fold——不涉及模型调用）两个门禁都豁免，被门禁的会话不会因上下文溢出而死掉；即使 nudge 通道本身被自愈机制抑制（D1），可用性也不受影响。通过宿主自身机制驱动压缩的车道（如 codex 的 compaction trigger——它不是 bili 的提醒）不在时序门禁「已提示」的定义内——若这类车道与目标共用路由，请把这些设置限定到受影响的 provider/model 而不是全局开启。无新增环境变量；未显式开启任何一级时行为不变。

#### `preserveRecentMessages`

- **类型：** `number`
- **默认值：** *（内核默认值 `3`；由 `5` 调整，见 #3058）*
- **状态：** ACTIVE
- **说明：** 永远不会被纳入压缩的最新消息条数。用于保护活跃工作集，使模型逐字保留最近的几轮对话。映射到内核字段 `preserveRecentMessages`。

#### `preserveRecentTokens`

- **类型：** `number`
- **默认值：** *（内核默认值，通常为 `5000`）*
- **状态：** ACTIVE
- **说明：** 为最近消息保护预留的 token 预算。映射到内核字段 `preserveRecentTokens`。

#### `minCompressRangeChars`

- **类型：** `number`
- **默认值：** *（内核默认值，通常为 `5000`）*
- **状态：** ACTIVE
- **说明：** 一个消息范围可被纳入压缩的最小长度，单位为**字符**（不是 token）；更小的范围会被跳过。英文/代码平均约 4 字符/token，CJK 约 1-2 字符/token，同一数值对英文的实际语义比 token 直觉宽松约 4 倍。映射到内核字段 `compress.minCompressRange`。

#### `minCompressRange`

- **类型：** `number`
- **状态：** DEPRECATED（`minCompressRangeChars` 的弃用别名，向后兼容保留）
- **说明：** `minCompressRangeChars` 的旧名，内核映射（`compress.minCompressRange`）与单位（字符）完全相同。同层两键并存时新名优先；跨层时更深层优先，与键名无关。

#### `tiers`

- **类型：** `boolean`
- **默认值：** `true`
- **状态：** ACTIVE
- **说明：** 启用多层压缩 —— 对旧摘要进行 tier-2 蒸馏，以及 tier-3 凝缩。设为 `false` 可运行在仅 tier-1 模式（每个摘要都是扁平的 tier-1 摘要）。映射到内核字段 `tiers.enabled`。

#### `protectedLatestTools`

- **类型：** `string[]`（工具名模式，如 `["todo_list"]`）
- **默认值：** `[]`（无 —— 按客户端自行开启，工具名因客户端而异）
- **状态：** ACTIVE
- **说明：** 工具名模式列表：匹配工具的**最新**一次 tool-call 及其配对 result 永远不会被压缩（内核 `protectedLatestTools`，需 `acp-kernel` >= 0.0.80）。为累积快照型工具而设 —— 例如 agent 的 todo/任务清单，每条新 result 都取代旧的：只有最新实例是事实源，若用 `protectedTools` 保护**全部**实例会使该工具的历史无限膨胀，而只保护**最新**一条既让活跃快照留在上下文里，又让所有被取代的旧实例照常折叠。这解决了“压缩后 agent 忘掉任务清单”的故障（#639）。保护是硬排除：最新实例不可寻址（其 ref 渲染为 `BLOCKED`），推荐范围与显式范围都无法覆盖它；在两种压缩模式、所有 wire 上一致生效。模式匹配为精确工具名或 `*` 通配（如 `"todo_list"`、`"todo*"`）。含 `/` 的模式改按规范 skill 路径匹配，且按路径分组各保最新（#1947）：skill 装载在所有客户端投影为 `skill/<name>` —— opencode `skill({name})`、Claude Code/ZCode `Skill({skill})`、任意工具读 `<dir>/<name>/SKILL.md` —— 因此 `"skill/*"` 保住**每个** skill 的最新一次装载（每个名字一个受保实例），而无斜杠的 `"skill"` 维持单一最新实例语义。跨层级整体替换（最深层胜出）。示例：`{ "compress": { "protectedLatestTools": ["todo_list", "skill/*"] } }`。

#### `protectedTools`

- **类型：** `string[]`（工具名模式，如 `["skill"]`）
- **默认值：** `[]`（无 —— 按客户端自行开启，工具名因客户端而异）
- **状态：** ACTIVE
- **说明：** 工具名模式列表：匹配工具的 tool-call **及其配对 result，全部实例、完整历史**永远不被压缩（内核 `protectedTools`）。保护是硬排除：所有匹配 ref 渲染为 `BLOCKED`，推荐范围与显式范围都无法覆盖任何实例；在两种压缩模式、所有 wire 上一致生效。模式匹配为精确工具名或 `*` 通配（如 `"skill"`、`"skill_*"`）。含 `/` 的模式可跨客户端按名选定 skill（#1947）：skill 装载投影为规范路径 `skill/<name>` —— opencode `skill({name})`、Claude Code/ZCode `Skill({skill})`、任意工具读 `<dir>/<name>/SKILL.md` —— 因此 `"skill/release-orchestrator"` 只保护该 skill 的每次装载，`"skill/review-*"` 在名字段内通配（`*` 不跨 `/`），`"skill"` ≡ `"skill/*"`（节点含全部后代）。无 `/` 的模式行为不变。跨层级整体替换（最深层胜出）。示例：`{ "compress": { "protectedTools": ["skill/release-orchestrator"] } }`。
- **⚠ 两个旋钮何时用哪个（配置前必读）：** 按工具的各次结果之间的关系选择：
  - **独立内容** —— 每个实例携带独特信息，后续结果不会取代它（opencode/pi 的 `skill` 加载、一次性引用资料）：用 `protectedTools`。折叠旧的加载会永久丢失其内容，保护可让每次加载都留在上下文中（#1109）。用 `skill/<name>` 路径模式可只保护某个编排 skill 的全部装载、让轻量 skill 照常折叠（`protectedTools: ["skill/release-orchestrator"]`，#1947）。
  - **累积快照** —— 每条新结果取代旧结果（客户端的 todo/任务清单）：用 `protectedLatestTools`。对这类工具保护**全部**实例会让其历史无限膨胀 —— 正是 #639 通过只保护最新一条来规避的故障。
  - 经验法则：低频高价值工具 → `protectedTools`；高频刷屏工具 → 绝不做全历史保护（上下文无界增长）；累积快照型工具 → `protectedLatestTools`。

#### `neverPreserveRecentTools`

- **类型：** `string[]`（工具名模式）
- **默认值：** 未设置 → 内置 `["decompress", "search_context", "read", "bash"]`（需 `acp-kernel` >= 0.0.92）
- **状态：** ACTIVE
- **说明：** 从软保护的最近区（`preserveRecentMessages`/`preserveRecentTokens`）中**排除**的工具名模式：匹配的工具结果在最近窗口内立即可压缩，不再等待超龄。内核默认让 `read`/`bash` 保持可压（它们是最大的可回收体量）—— 但正是这个默认值让批量读文件的工作流把刚读的文件立刻折掉，陷入「折叠→重读」死循环（#1198/#1277）。**推荐解法：只移除 `read`** —— `{ "compress": { "neverPreserveRecentTools": ["decompress", "search_context", "bash"] } }` —— 让新读的文件留在最近区，之后按位置超龄回归可压（不同于 `protectedLatestTools` 会把最新一次 read 永久钉住）。不需要逐字替换语义时优先用更简单的正向形式 `preserveRecentTools: ["read"]` —— 见下一节。请保留 `decompress`/`search_context` 在列表里：重新纳入它们会把刚恢复的大块内容钉死在最近区无法回收 —— 换一种病。**⚠ 空数组 `[]` 合法且表示什么都不排除**（最大保护逃生门）—— 与 `protectedTools`/`protectedLatestTools` 不同，空数组不会被拒绝；显式数组逐字替换默认列表，跨层级整体替换（最深层胜出）。

#### `preserveRecentTools`

- **类型：** `string[]`（工具名模式）
- **默认值：** 未设置 → 不做减法（`neverPreserveRecentTools` ?? 内置列表逐字生效；需 `acp-kernel` >= 0.0.93）
- **状态：** ACTIVE
- **说明：** `neverPreserveRecentTools` 的**正向配对旋钮**：从生效的最近区排除列表中**移除**的工具名模式。#1198/#1277 批量读文件「折叠→重读」死循环的解法由此变成一条配置 —— `{ "compress": { "preserveRecentTools": ["read"] } }` —— 既不用重述（也不用冻结一份很快过时的手抄）内置列表，还自动跟随内置列表演化。生效排除表 = `(neverPreserveRecentTools ?? 内置) 减 preserveRecentTools`；可与显式 `neverPreserveRecentTools` 组合（减法同样作用于显式列表）；通配后缀模式移除匹配项（`"bash*"` 移除 `bash`）。除非确实需要逐字替换语义，优先用本旋钮而不是改 never-list。**⚠ 空数组 `[]` 会被拒绝** —— 在这里是纯无操作，裸 `[]` 几乎必然是 `neverPreserveRecentTools: []`（最大保护逃生门）的笔误。与同族旋钮一样跨层级整体替换（最深层胜出）。

#### `prompts`

- **类型：** `object`（`{ compressPhilosophy?, howToCompressRules?, tier2DistillRules?, tier3CondenseRules? }`，均为字符串）
- **默认值：** *（内核默认值 —— 见 `acp-kernel` 的 `defaultPrompts`）*
- **状态：** ACTIVE
- **说明：** 覆盖注入到系统提示词与 nudge 消息中的压缩提示词文本。每个字段都是**承重的（load-bearing）**：内核规则经过数月生产调优，覆盖它们可能降低摘要质量（丢失路径 / 签名 / 决策 → 检索失效）。只有当 `acknowledgePromptsRisk` 经三级合并后解析为 `true` 时覆盖才生效 —— 该标志按自身最深层级独立解析，并门控**所有** `prompts` 覆盖，与各覆盖片段所在层级无关（全局层级的标志即可激活模型层级的 `prompts`）；否则会被忽略并记录一次警告。非字符串字段会被静默丢弃（畸形的局部配置不会破坏正常默认值）。主要用于非英文或小模型调优 —— 见 issue #156。

#### `acknowledgePromptsRisk`

- **类型：** `boolean`
- **默认值：** `false`
- **状态：** ACTIVE
- **说明：** 必须为 `true`，`prompts` 覆盖才生效。与其他字段一样按最深层级独立解析（最深层级胜出），并门控所有 `prompts` 覆盖，与各覆盖片段所在层级无关 —— 无需与所解锁的 `prompts` 位于同一层级。设置它即表示知悉上述摘要质量风险。

#### `promptPack`

- **类型：** `string`（包名，如 `"lean"`）
- **默认值：** `default`（未设置等同——恒等表面，全部使用内核默认值）
- **状态：** ACTIVE
- **说明：** 选择一个具名 prompt pack —— 一套策划好的表面预设，覆盖工具描述、压缩系统提示词段落、nudge 段落 —— 从宿主侧的包解析链解析：**项目** `./.billion-context/packs/<name>.json` → **用户** `<configDir>/packs/<name>.json` → **随包附带**（`chat`）→ **内核内置**（`default`、`lean`）。内置 `lean` 把四个 ACP 工具描述换成单行版（无 snippet/guideline 包装），压缩规则保持默认。内置 `chat`（#5319）只替换压缩哲学段与 how-to-compress 规则段，面向长期陪伴 / 多会话记忆场景；其余表面全部保持宿主默认，同名的用户/项目文件会覆盖它。未知包名回退到恒等表面并记录一次警告。与其他字段一样三级级联合并；包的表面覆盖（工具/段落）直接生效，不经 `acknowledgePromptsRisk` 门控——该门控只管内联 `compress.prompts` 的规则文本覆盖。注意：包文件里的 `prompts` 块会被本代理忽略，规则文本只能经内联 `compress.prompts` 设置。需要 `acp-kernel` >= 0.0.66。设置面板可以直接管理用户目录里的包文件——对 `<configDir>/packs/` 下的包 新建/编辑/删除（选择器知道每个条目的来源；内置与 shipped 包在那里只读，要用同名用户包覆盖）。编辑对话框有三个页签（#5344）：**表单填写**——逐字段说明文字，可一键载入 `default`/`chat`/`lean` 的现有文案做起稿底本（留空字段不写入包文件，运行时沿用系统默认）；**AI 辅助**——用大白话描述使用场景，把生成的提示词复制到任意大模型执行，再把返回的 JSON 粘回来即可自动填入表单；**高级（JSON）**——原始文件文本，给需要完整控制的用户。

**包文件格式。** 每个 `<dir>/<name>.json` 是一个 pack 对象。未识别的字段会被与所有加载路径相同的 sanitize 器丢弃（`sanitizePackSurface`），所以多写元数据无害：

```json
{
  "name": "my-pack",          // 可选 —— 缺省用文件名（去 .json）
  "version": "1.0.0",         // 可选 —— `bili pack list` 与面板会显示
  "description": "……",       // 可选
  "promptSections": {
    "philosophy": "……",       // 替换整段系统提示词；JSON null = 保留默认文本
    "howToCompress": "……"     // 可直接从 src/chat-pack.ts 里调好的全文起步
  }
}
```

可选的表面块：`prompts`（内联规则文本覆盖）、`nudgeSections`、`toolPrompts`、`adapters`（宿主专属附加，如 `"pi": { "promptSections": { … } }`）。至少一个字段在 sanitize 后存活，否则写入时会被拒绝。

**安装别人的包。** 任何根目录带 `bili-pack.json`（即上面的 pack 对象）的 npm 包都可安装：`bili pack install <pkg>`——也接受 `name@version`、带 scope 名、git URL、`.tgz` 路径（底层委托本机 `npm`，所以 registry 鉴权行为与普通 npm 一致）。默认落到 `<configDir>/packs/`（`--project` 指向 `./.billion-context/packs/`；已存在同名包时默认拒绝，`--force` 才替换）。之后可用设置面板管理，或 `bili pack remove <name>` / `bili pack list`。

#### `reconcile`

- **类型：** `string` — `"off"` | `"warn"` | `"repair"`
- **默认值：** `"repair"`
- **状态：** ACTIVE
- **说明：** 控制**折叠状态和解**（#1921）：当客户端重发的历史与已压缩内容发生漂移时怎么处理 —— 例如 fork 重新序列化了早前轮次（#1908）、客户端原地改写消息字节、或 provider 规范化空白。默认情况下消息身份是内容哈希，一字节漂移就会让受影响消息从所有压缩块中静默脱落，原文重回线上（“折叠漂移”）。`"repair"` 模式在折叠运行前逐条分类漂移：稳定的工具调用锚（`tool_use_id`）与规范化身份锚（NFC 文本、CRLF/空白折叠）把压缩块重锚到新消息 id 上，折叠在客户端漂移下存活、字节等价于一次干净重发；真正被**编辑**的消息（规范化文本不同，或长度漂移超过 `max(256, 25%)`）则诚实地重回线上（绝不静默改写）——由下一轮压缩重新折叠。`"warn"` 运行同一分类器但只记录发现；`"off"` 完全关闭该层（#1921 之前的行为）。环境变量 `BILI_FOLD_RECONCILE` 可为单个进程覆盖配置值。锚元数据按会话持久化（会话记录中的 `foldAnchors`，上限 16384 条），覆盖每个块实际引用的消息。系统提示词在无消息漂移时变化会记录一行 `info`（system-only 漂移永不影响折叠状态）。

#### `absorb`

- **类型：** `object`（`{ enabled?, minToolTokens?, contextThresholdPct?, excludeTools?, toolName? }`）
- **默认值：** *（禁用 — 除非显式设置 `enabled: true`，该特性完全关闭）*
- **状态：** ACTIVE
- **说明：** 可选开启的**即时工具结果压缩**（issue #605，经由 `acp-kernel` absorb API）。启用时，大工具结果在到达即被附带强制的 `[ACP absorb]` 指令；模型通过 `absorb` 工具将结果蒸馏为紧凑摘要，原 tool-call/tool-result 配对从下一轮起在线上隐藏 —— 使折叠轮之间的中间会话压力更低。子字段（按字段最深层级胜出，与其他 CompressSettings 字段一致）：
  - `enabled: boolean` — 主开关；任何值不为 `true` 时特性完全关闭（无工具、无提示、无标记）。
  - `minToolTokens: number` — 仅达到此 token 数的结果被附带提示（内核默认 1000）。
  - `contextThresholdPct: number|percent-string` — 仅当用量达到 `modelContextLimit` 的此比例时附带提示（`0` = 仅尺寸门槛；`"75%"` 接受）。
  - `excludeTools: string[]` — 永不吸收的工具名模式。**已知限制：对工具*结果*目前无效，直到 [ranxianglei/acp-kernel#213](https://github.com/ranxianglei/acp-kernel/issues/213) 修复发布**（wire 投影不把 `toolName` 携带在结果上，内核名称守卫无法命中）。
  - `toolName: string` — 重命名注入工具（默认 `"absorb"`）；声明/注入的模式、系统提示段与按会话裁决在两条车道中都跟随该名称。**车道治理（#1359）：** 插件模式用**基础**配置治理整个 `absorb` 块，因此重命名后的工具既以该名声明、也以该名执行（二者永不背离）；provider/model 层的 `absorb.*` 覆盖**仅限代理车道**（代理注入并裁决合并后的名称）。加载时会输出一条警告，列出任何取值与基础值不同的 provider/model `absorb.*` 字段。
  注入跟随线上原生工具面：代理模式在 anthropic/openai/responses 原生工具线上注入工具（按每请求解析的名称）+ 系统提示段，插件模式在插件清单中广告它（MCP shell 自动拾取）。Responses **marker/文本协议**路由不支持（无原生工具面 — 强制的 absorb 指令不可满足），标题生成请求（`max_tokens ≤ 200`）跳过注入如压缩提示一样。吸收配对在重启后保持隐藏（在会话状态持久化）。

#### `ccr`

- **类型：** `object`（`{ enabled?, minToolTokens?, excludeTools?, toolName?, maxHeadChars? }`）
- **默认值：** *（全车道默认关闭（#1207 决策）— 未设置时保持关闭；在任意层级显式设置 `enabled: true` 方可启用（建议先本地验证）。插件通道同样需全局 `enabled: true` 才武装（#1271/#1273））*
- **状态：** ACTIVE（v2 — 全车道 opt-in；插件通道限 anthropic + openai wire，显式开启后生效）
- **说明：** **内容寻址消息存储**/内置 CCR（issue #1097/#1179，经 `acp-kernel` CCR API，需 acp-kernel >= 0.0.84）。超大工具结果不再被强制蒸馏（如 `absorb`）或永远挂在线上：kernel 在到达时将其 ID 引用（ccr-store 节点位于 `processTurn` 内 prune 与 absorb 之间 —— ID 引用优先于蒸馏），线上保留一个确定性、字节稳定的占位符（`📦 [acp-stored #m00423 · shell output · 4,213 tok] \`npm run build\`\n   → acp_retrieve("m00423") returns the full text`），原文进入该会话的内容存储。模型通过注入的 `acp_retrieve` 工具按需取回完整原文；retrieve 是临时的（走请求内工具结果通道，不进入折叠空间，不占用消息 ref）。默认无损：未执行的 retrieve 只花一次廉价工具调用；而被 absorb 蒸馏掉的细节则永久丢失。子字段（按字段最深层级胜出，与其他 CompressSettings 字段一致）：
   - `enabled: boolean` — 主开关。**全层级均未设置时默认为 `true`**（#1179）；任意层级显式 `false` 优先，特性完全关闭（无占位符、无工具）。插件模式武装还需全局显式 `true`（#1273）——插件清单只广播运维者显式开启的能力。
  - `minToolTokens: number` — 仅达到此 token 数的工具结果被 ID 引用（kernel 默认 `4000`）；更小的结果保持原样。
  - `excludeTools: string[]` — 从不存储的工具名模式（允许 glob 后缀；kernel 默认为空）。
  - `toolName: string` — 重命名检索工具（默认 `"acp_retrieve"`）；声明、分发与占位符提示都跟随名称。必须与客户端自身工具名保持唯一。
  - `maxHeadChars: number` — 占位符中头部/命令预览的长度（kernel 默认 `96`）。
  **插件通道治理（#1345）：**插件模式下整个 `ccr` 块跟随**基础**配置——仅当基础层级显式 `enabled: true` 时武装，并以基础的 `toolName` 与阈值执行；因为插件清单（宿主声明 retrieve 能力的唯一出口）只从基础配置构建。provider/model 层级的 `ccr.*` 覆盖因此只对代理模式会话生效（代理按请求在合并块下自行声明并分发）。每个发生分歧的覆盖都会在配置加载时记录一条 `[acp-config] ccr override ignored in plugin sessions: …` 警告，指明层级、字段以及插件会话实际使用的值。
  存储以单个信封文件（`.content-store.json`）持久化在会话 JSON 旁边，设置 `BILI_ENCRYPTION_KEY` 时使用与会话文件相同的静态加密编解码器；条目按内容哈希去重，按会话懒加载。只有 `tool` 结果*内部的内容*缩小——与 assistant `tool_calls` 的配对不受影响。范围门控：**全车道默认关闭（#1207 决策）— 任意层级显式 `compress.ccr.enabled: true` 方可启用**：代理模式开启即武装；anthropic + openai wire 上的插件模式需全局显式开启（插件清单才会声明 `acp_retrieve`，#1271）；responses marker/文本协议路由、`ACP_NO_INJECT_TOOL`、以及插件模式下的 responses/google wire 没有经过验证的请求内往返通道来执行 retrieve，因此存储在这些场景下自动解除武装，而不是丢失内容。v2 起（#1179），折叠同样无损：compress 折叠落定时，被覆盖的原文会持久化进存储（首次写入优先，跳过 reasoning），因此 `acp_retrieve("mNNNNN")` 对已折叠内容同样有效；`decompress` 接受可选的 `startId`/`endId` 消息 ref，只恢复块内的一个区间（临时注入，与 retrieve 同一通道）；`search_context` 命中条目携带覆盖的 ref 区间（`[m00044–m00097 · N msgs]`）；`acp_status` 列出块→ref 关联（`BLOCK SPANS`），并在 STORE 行单独计数 `range-restored`。设计定案（#1282）：**永不设上限、永不逐出**——信封随持有的唯一原文数量增长，与会话同生命周期；足迹在 `acp_status` 中可见。按会话统计（已存字节、当前线上节省字节、retrieve 率）在 `acp_status` 中展示；每次 retrieve 记录一条 `[ccr] retrieve …` 日志。

#### `search`

- **类型：** `object`（`{ planAware? }`）
- **默认值：** *（关闭 —— 未设置即解析为 `planAware: false`；输出与纯词法搜索逐字节一致）*
- **状态：** ACTIVE（CCR v3 规划感知检索，#1336 —— 默认关闭、实测后再启用；代理模式 + 插件模式）
- **说明：** 面向 `search_context` 的可选**规划感知检索**（issue #1336）。启用后，当查询命中的块数超过 `limit` 时，候选块会按当前**规划状态**重排：规划状态从上下文内的消息视图提取——每个规划工具的**最后一次** tool-call（内置模式 `TodoWrite`、`todowrite`、`todo_list`、`update_plan`、`TaskCreate`、`TaskUpdate`，外加全部 `compress.protectedLatestTools` 模式——与内核快照保护的 latest-wins 语义相同）以及最近一条用户消息。候选块的 topic/summary 与该状态的词项做加权重叠打分：得分 >0 的块排前，同分保持原词法顺序。仅在此条件下发生两件事：返回子集可能不同于纯词法截断；结果末尾追加 `[plan-aware]` 引导段——(a) `top fetch targets:` 列出得分最高的返回块所覆盖的 ref 区间，(b) 对本会话内已 retrieve ≥2 次的覆盖 ref 给出提示，建议改用一次性 `decompress({blockId, startId, endId})` 区间恢复代替反复 `acp_retrieve`。标志关闭、上下文中无规划状态、或命中池本就在 `limit` 之内时，输出与功能引入前逐字节一致。重排只动候选顺序——不改存储/折叠/注入机制、不新增持久化、跨会话搜索（`conversation_id`）保持只读词法。每次重排记一条 `[acp-search-plan] …` 日志（含逐块得分）。配套统计：整块 decompress 计入 `acp_status` 的 `RETRIEVAL QUALITY` 行（总数 + 其中有多少次存在更便宜的精确路径可用——即该块带 ref 区间且 CCR 已武装），便于启用前后度量 retrieve 与 decompress 的取舍。子字段（按字段最深层级胜出，与其他 CompressSettings 字段一致）：
  - `planAware: boolean` — 总开关；非 `true` 一律保持功能完全关闭。

#### `rules`

- **类型：** `boolean`
- **默认值：** `false`
- **状态：** ACTIVE
- **说明：** **持久化模型提醒**（issue [ranxianglei/billion-context-pi#433](https://github.com/ranxianglei/billion-context-pi/issues/433)，经由 `acp-kernel` rules API），**默认关闭**——设 `compress.rules: true` 显式开启(#1399 定案:开启后模型对会话规则有全权,可未经提示自主调用,含 delete/clear)。启用后，一个 `acp_rule` 工具随 ACP 工具一同注入：传入简短的 `rule` 参数调用可记录一条**原则级提醒**，该提醒受**硬性保护**免于压缩（调用及结果在每次折叠中都保留在上下文中）；省略参数则列出已记录的规则。传入 `delete`(规则 id,如 `"rule3"`)删除该条规则(返回 `Removed ruleN: <text>`);传入 `clear: true` 清空全部规则。两者互斥,且均与 `rule` 互斥——一次调用只能执行一种操作——因此过时或误记的规则可以直接删除,而无需再写一条"作废声明"对冲。关于*何时*记录（用户强调的教训、用户要求记住的行为、遇到的重大陷阱）的指导完全写在工具描述里——不向系统提示词添加任何内容。受内核限制约束（50 条规则 × 每条 300 字符）；重复文本会被拒绝并指向已有的 id。注入跟随线上原生工具面，与 `absorb` 完全一致：代理模式在 anthropic/openai/responses 原生工具线上注入该工具，插件模式在插件清单中声明（执行按会话门控）。已记录的规则在会话状态中持久化，跨重启保留；删除同样持久化。要求 `acp-kernel` >= 0.0.70（delete/clear 需要 >= 0.0.84）。人也可以不经过模型执行全部操作：pi/omp 提供原生 `/acp-rule` 命令，语义与工具一致 —— 裸 `/acp-rule` 列出全部已记录规则，`/acp-rule <文本>` 直接记录一条，`/acp-rule remove <id>` 删除一条，裸 `/acp-rule clear` 清空全部（`clear <文本>` 是记录而非清空）（#1251；remove/clear 由 #1399 补齐）。

#### `reasoning`

- **类型：** `object`（`{ drop?, threshold? }`）
- **默认值：** `drop: true`、`threshold: 2048` — 默认开启
- **状态：** ACTIVE
- **说明：** **压缩回执 reasoning 卫生**（issue #651，对应 `billion-context-pi` #339/#348 / `opencode-acp` #377 的代理侧孪生）。把 `reasoning`/`thinking` 轨迹留在 wire 上的模型会积累一块永久不可压缩的地板：折叠的锚点是一条 `compress` 调用，而它**前方**的 reasoning 消息会作为受保护前缀活过每一次折叠——它们永远无法被重新摘要，只能被剥离。在风暴会话里这块地板曾占到可见上下文的 ~50%。开启后，代理会剥离紧邻**已闭合** `compress` 调用之前的 reasoning 连续段，闭合判定按**回合证据**：该调用的工具结果（`contentType: "tool-result"`、`toolCallId` 匹配）已出现在更晚位置，且其后至少还有一条消息——**不要求用户消息**，长 agent 会话同样能闭合回合（#348 孪生）。安全门：**在飞回合**（结果未返回、或结果仍是最后一条消息）绝不动；普通工具调用（`read`、`bash` …）的 reasoning 保留；连续段按求和后的总长判定（2×1200 字符的段仍会命中 2048 门槛）；不连续的 reasoning（片段之间夹着正文）不动。子字段与其他 CompressSettings 字段一样按“深层覆盖”合并：
  - `drop: boolean` — 总开关；`false` 完整还原旧行为。请求携带 `tools` 时要求 `reasoning` 原样往返的 thinking 模型必须按 provider 关闭——DeepSeek、GLM thinking、Qwen-QwQ 在未回传先前 `reasoning_content` 时返回 HTTP 400。#684 起这一步基本自动：`deepseek` 上游**以及请求体 `model` id 匹配 `/deepseek/i` 的请求**（#1027——经非 deepseek 网关提供的 DeepSeek 模型）静态识别；**Anthropic wire** 上，历史里携带**带签名的 thinking 块**的请求会按请求禁用该剥离（#1658——签名 thinking 必须与其同回合的 `tool_use` 一起原样往返，否则上游拒绝该请求，剥离它会把这对块弄成孤儿；未开扩展思考的会话不受影响）；任何上游以提及 `reasoning_content` 的 400 拒绝时仍会自动学得该会话需保留 reasoning（自愈，会话级；日志携带 `[acp-loop] learned strictReasoningEcho`）。该配置仍作为其他严格 reasoning 上游的手动兜底手段：
    ```jsonc
    "providers": { "https://api.deepseek.com": { "compress": { "reasoning": { "drop": false } } } }
    ```
  - `threshold: number` — 字符门槛；**严格大于**该值的段才被剥离（`0` = 只要非空就剥）。非法值回退默认而不是报错。

#### `reasoningGuard`

- **类型：** `object`（`{ enabled?, maxContinue?, maxTierN?, markerText?, base?, offset?, debugLog? }`）
- **默认值：** *（禁用 —— 除非在某一层设置 `enabled: true`）*
- **状态：** ACTIVE
- **说明：** gpt-5.x/gpt-6.x **"晶格"（lattice）推理截断**守卫（issue #739；上游 [openai/codex#30364](https://github.com/openai/codex/issues/30364)）。这些模型会间歇性地在恰好 `base*n + offset` 个 reasoning token 处（默认 `518n−2` → 516、1034、1552 …）思考到一半就停下，然后基于未完成的思路作答。当作用域内的终止回合落在晶格上**且**携带 `encrypted_content` 块时，bili 会缓冲该响应、带着自己的 reasoning 加一条继续提示重发（最多 `maxContinue` 个续写回合），再把全部折叠成**一个**响应，其 usage 为真实求和值。折叠期间 reasoning 实时流式发给客户端（不做整段缓冲），只有最后一轮干净回合的非 reasoning 输出被透传。仅作用于 Responses/SSE 流式请求（bili 只支持 SSE）；压缩注入的回合被豁免（由循环负责）。子字段与其他 CompressSettings 字段一样按“深层覆盖”合并：
  - `enabled: boolean` — 总开关；非 `true` 时守卫完全关闭。作用域由该块在三级树（全局 / provider / model）**放在哪一层**决定——没有单独模型列表。严格签名（精确晶格命中 + `encrypted_content` + 无工具调用）限制哪些回合真正触发续写。
  - `maxContinue: number` — 首轮之后最多续写的回合数（默认 `3`）。
  - `maxTierN: number` — 允许续写的最高晶格层级 `n`（默认 `6`）；`0` = 不限制。遇到罕见的深层截断时调高（例如在 gpt-6-astra 上观察到一次 `n=11`）。
  - `markerText: string` — 每个续写回合追加的 commentary 提示文本（默认 `"Continue thinking..."`）。
  - `base: number` / `offset: number` — 晶格签名 `tokens == base*n + offset`（默认 `518` / `-2`）。若其他模型家族在不同晶格上截断则覆盖。
  - `debugLog: boolean` — 逐回合详细日志（默认 `false`）。
   ```jsonc
   // 全局开启
   { "compress": { "reasoningGuard": { "enabled": true } } }
    // 按 provider 调参（放在哪一层就作用于哪一层的流量）
    { "providers": { "https://your-relay.example": { "compress": { "reasoningGuard": { "enabled": true, "maxContinue": 2 } } } } }
   ```

#### `priceProfile`

- **类型：** `object`（`{ w?, r?, q? }`，均为非负数）
- **默认值：** *（未设置 —— 报告改用请求模型在 models.dev 的价格行计价（绝对 $/Mtok）；只有注册表解析不到的模型才回落到内核内置相对比例 `{ w: 1, r: 0.1, q: 4 }`）*
- **状态：** ACTIVE
- **说明：** 会话缓存报告（`acp_cache` 工具 / `/acp-cache` 命令 / `GET /__bili/cache-report`，#800/#1279）中**压缩经济学判定**所用的价格档。每个 fold 的损益字段（`oneTimeCostUnits`、`perTurnSavingUnits`、`breakevenTurns`、`paidBack`）由三个基于输入 token 单位的乘数计算得出：`w`（cache 写入成本）、`r`（cache 读取成本）、`q`（output 成本）。两种单位约定并存，且都会原样打印在报告头部（`FOLD ECONOMICS (N folds @ w=.. r=.. q=..)`）：
  - **用户配置**采用**相对输入价归一化（p_in = 1）的比例**：`w` = cacheWrite ÷ input，`r` = cacheRead ÷ input，`q` = output ÷ input。子字段与其他 CompressSettings 字段一样按“深层覆盖”三级合并（provider 层设 `q`、model 层精调单个字段均可）；部分配置中未设置的字段回落到内核比例 `w: 1`、`r: 0.1`、`q: 4`。
  - **注册表默认**（任何层级都未设置该键时）：由请求模型在 models.dev 的价格行推导——**绝对 $/Mtok**，`w = cost.input`，`r = cost.cache_read ?? 0.1 × input`，`q = cost.output ?? 1.5 × input`（缺这些字段的行用惯例回落值）。直连供应商流量取该 host 自己的挂牌行；未知中转站取跨 host 第一个匹配行（挂牌冲突时一次性告警）。可达时实时注册表优先，随包快照为离线兜底（#282）。
  用户配置整体胜出——任何层级设置了 profile 都不会与注册表行逐字段混用。最近一次请求生效的值会被戳记到会话上，因此所有报告出口都用该会话最近一轮所适用的价格档计价。**纯报表面**：价格档绝不影响压缩触发、频率或任何 wire 行为。用户配置示例（覆盖注册表行，例如中转站有自定义加成时）：
  ```jsonc
  // DeepSeek-V3 ≈ output 倍数低
  { "providers": { "https://api.deepseek.com": { "compress": { "priceProfile": { "w": 1, "r": 0.1, "q": 1.5 } } } } }
  // OpenAI GPT-4o/o 系列：缓存读取五折、写入平价、output 4×
  { "providers": { "https://api.openai.com": { "compress": { "priceProfile": { "w": 1, "r": 0.5, "q": 4 } } } } }
  // 自托管 / 免费额度：一切不消耗你的 token 预算
  { "compress": { "priceProfile": { "w": 0, "r": 0, "q": 0 } } }
  ```
  请用同一模型正常输入价的相对挂牌价；有自定义加成的中转站应填实际生效费率。

#### `outputSteering`

- **类型:** `object`(`{ enabled?, verbosityLevel?, effortRouting? }`)
- **默认:** *(禁用——不在任何层级设 `enabled: true` 就完全关闭)*
- **状态:** ACTIVE
- **描述:** 可选的**输出侧压缩**(issue #1093):两个请求期杠杆,削减的是*输出* token——它比输入贵、且一流出就计费。决策逻辑(轮次分类、L0–L4 指令措辞、effort 钳制)在 acp-kernel 内与 agent 侧共享;bili 只负责落在 wire 上,且在所有其他 body 改写之后:
  - **Verbosity steering** — 确定性的简洁指令追加到 system prompt **尾部**(绝不前置——前移会改变客户端自己的提示词字节、击穿前缀缓存)。哨兵包裹且幂等:重试不会累积,等级切换原地替换。措辞跨版本字节稳定(内核改措辞=所有该等级会话的前缀缓存一次性失效)。
  - **Effort routing** — 按结构分类最后一个 user 轮(只看块组成,不做内容模式匹配);在*机械续答*(干净的工具结果、无错误、无新用户信号)时把**客户端已发送的** effort 字段向最低档钳制。只钳不注:绝不注入客户端没发的字段(不支持 effort 的模型会 400)、绝不切换 `thinking.type`、绝不把 `minimal` 上调。覆盖:OpenAI `reasoning_effort`、Responses `reasoning.effort`、Anthropic `thinking.budget_tokens`(下限 1024)、Gemini `generationConfig.thinkingConfig.thinkingBudget`(下限 128;`-1` 动态档不动)。
  - 子字段(与其他 CompressSettings 字段一样最深层级优先):`enabled: boolean` 总开关;`verbosityLevel: number` 0–4(0=不发指令,默认 2);`effortRouting: boolean`(默认随 `enabled` 开启)。越界值**带警告**回退默认,不会整块拒绝。四条 wire 全覆盖(openai chat / responses / anthropic / google);无 system 载体的请求不动(skip-if-absent)。
  ```jsonc
  // 全局启用
  { "compress": { "outputSteering": { "enabled": true } } }
  // 只降 effort,不发措辞指令
  { "compress": { "outputSteering": { "enabled": true, "verbosityLevel": 0 } } }
  // 按 provider(位置决定只作用于该 provider 的流量)
  { "providers": { "https://your-relay.example": { "compress": { "outputSteering": { "enabled": true, "verbosityLevel": 3 } } } } }
  ```

#### `stripImages` — 已移除

- **类型：** ~~`boolean`~~ / **`stripImagesKeepRecent`** ~~`number`~~ — 已移除（2026-10，#2607/#2640 后续）
- **说明：** 可选的 wire 侧图像剥离已不存在。默认媒体折叠（#2640：可归档媒体像普通消息一样参与折叠，像素在折叠前归档到 `<state>/retrieve/img/<session>/`，`decompress({ imageRef })` 随时取回）使其成为冗余，且剥离本身在四条 wire 中的三条上是逐轮破坏 prompt cache 的机制（滑动截断 `len - keepRecent` 每轮移动字节边界；仅 anthropic 有折叠锚定修复）。配置中仍携带 `compress.stripImages` / `compress.stripImagesKeepRecent` 的将变为惰性：键被忽略，并给出一次性 `[acp-config] … INERT` 警告指向本说明。bili 拿不到字节的媒体（远程 URL、文件引用）保持钉在 wire 上——见 #2609。

#### `visibilityMarkers`

- **类型：** `boolean`
- **默认值：** `true`
- **状态：** ACTIVE
- **说明：** 控制代理执行 proxy 工具调用（`compress` / `decompress` / `search_context` / `acp_status`）后输出的 📦/❌ ACP 可见标记。开启时，每次执行会在响应流中追加一行标记，并/或把标记消息重新注入该轮重建后的历史，让模型在后续回合看到发生了什么。设为 `false` 可完全抑制这两类产物 —— 适用于模型会模仿或围绕标记进行旁白的部署场景（自行输出确认行或中文旁白；见 issue #862）。工具执行本身不受影响：调用照常执行、成对的 tool-call/tool-result 消息照常记录，只是省略标记行/标记消息。与其他字段相同的三级合并。#717 对模型伪造标记的防伪造剥离逻辑独立于本开关，始终生效。

#### `messageTimestamps`

- **类型：** `boolean`
- **默认值：** `true`
- **状态：** ACTIVE
- **说明：** 消息时间戳（#4313，PR #5236；缓存审计跟进后改为默认开）：bili 在每条消息首次出现时铸一个不可变的本地时间戳并渲染出来——线上每条 `<acp>` 压缩标签带上 `time="yyyy-MM-dd HH:mm:ss"` 属性、每次 compress 回执的指纹行追加 `[start – end]` 覆盖跨度、渲染出的块摘要带 Occurred 行。可见成本约每条消息 8 token。存戳是确定性渲染输入（只读存储值、不读墙钟），历史重发逐轮字节稳定——生产会话审计显示开关前后提示词缓存命中率相同。设为 `false` 可精确复现特性前（pre-#4313）的线上字节（无 time 属性、原提示词文案、无指纹跨度）。存储层无论开关都会记录时间戳，之后翻开开关即可浮现全史、无需丢数据。标志首次解析为开的那个重启，每个活跃会话付一次冻结前缀缓存重写。解析顺序：env（`BILI_MESSAGE_TIMESTAMPS`；`0` 强制关，其他任何值强制开，约定同 BILI_RESIGN）＞配置文件，且在每个代理实例启动时一次性解析——改开关需要重启实例。

### 注入开关（仅全局生效）

这两个开关只在**全局**层级生效。在按 provider 或按模型的 `compress` 块中设置它们无效。

#### `injectTool`

- **类型：** `boolean`
- **默认值：** `true`
- **状态：** ACTIVE
- **说明：** 将 `compress` / `decompress` / `search_context` 工具与压缩系统提示注入每个请求。设为 `false`（或 `ACP_COMPRESS_TOOL=0`）可完全禁用工具注入。

#### `injectNudge`

- **类型：** `boolean`
- **默认值：** `true`
- **状态：** ACTIVE
- **说明：** 当使用率越过阈值时注入自动压缩 nudge 消息。设为 `false`（或 `ACP_COMPRESS_NUDGE=0`）可禁用 nudge 注入。同时禁用 `injectTool` 和 `injectNudge` 在功能上类似 `passthrough`，区别在于代理仍会跟踪 token 使用量。

### 为什么第一次压缩要到 200k 才触发？

压缩触发时机**不是按绝对窗口位置，而是按增长区间**：默认在开机内容之上**增长
50k token** 才触发第一次软压缩（[`nudgeGrowthTokens`](#nudgegrowthtokens)
恒定步长，与窗口大小无关）。因此第一次压缩的绝对位置 ≈ **开机占用 + 50k**：

- 开机 30k–50k（dsh 默认）→ 第一次压缩在 ~80k–100k；
- 开机 100k 左右，或把 `nudgeGrowthTokens` 设到 100k 左右 → 可能要到
  **~200k** 才发生第一次压缩。

强制压缩线（[`maxContextLimit`](#maxcontextlimit) 默认 75%）只是兜底，且作用在
「有效窗口」上 —— 输出预留 `min(max_tokens, outputHeadroomMaxPct × 窗口)`
（cap 默认 0.25，见 [`outputHeadroomMaxPct`](#outputheadroommaxpct)）先被
扣除。预留通常很小，只有请求携带很大的 `max_tokens` 时才会被 25% 封顶拉满：
262,144 窗口 + `max_tokens = 131072` → 有效窗口 196,608 → 强制线 ≈147k；
262,144 窗口 + 预留 8k → 强制线 ≈190k。

之后仍是增长制节奏：每 +50k 可压缩增长一次增量压缩。本地模型每次压缩都是
整窗重新 prefill —— 重型启动 + 大窗口的长任务会经历多次，任务时长可能被拖长
2–3 倍。

想更早开始压缩（省 token），按这个顺序优化：

1. **删减系统提示词、关闭不需要的工具、精简 skill** —— 开机占用直接决定
   第一次压缩的绝对位置；
2. **把 `nudgeGrowthTokens` 调小到 50k 左右**（尤其当它曾被调大到 100k）；
3. **开启 lean 功能**（`promptPack: "lean"`）；
4. **把 `maxContextLimit` 调低**（例如 `"40%"`）——压力带会在使用率达到该比例时
   就开始要求压缩，而不再等增长节奏；当你所在的上游或客户端在大请求上劣化
   （超时、首字节慢）、默认 75% 兜底线又够不着时用这个（#4007）。低于 45% 时
   内核每轮打一条 validation warning —— 纯噪音，不影响阈值。

调参前先用 `/acp` 或网页界面实测开机/上下文占用。

### 软目标与弹性余量 (#1122)

自主 agent 常常同时想要两件事：保持*活跃*上下文小（成本/延迟），又允许单个任务在确实需要时突发远超该目标（例如读一个大文件）。把 `modelContextLimit` 设到模型原生窗口之下表达不了这一点——一个字段同时扮演两个角色（使用率分母**兼**预检硬墙），任何超过它的载荷都会在中途被折叠或直接快速失败（#1122）。

改用现有的软档位来表达：limit 保持在原生窗口，用 `maxContextLimit` 钉住目标：

```jsonc
// 原生窗口 200k 的模型；日常保持 ~70k 活跃，允许突发到真实边缘
{
  "compress": {
    "modelContextLimit": 200000,   // = 原生窗口 → 硬墙只在真实边缘
    "maxContextLimit": "35%"       // 强制 nudge 区从 ≈ 70k 开始（= 目标 ÷ 原生窗口）
  }
}
```

压缩实际如何决策（acp-kernel，已实证）：

1. **增长层（日常主力，绝对 token）**：自上次锚点（会话起点 / 上次 nudge / 压缩后重置）以来的累计增长达到增长门、且可压缩质量足够时，发出主动 nudge。这两个数都是绝对值、按设计不随窗口放大：增长步长在任意窗口大小下固定 50k（内核 `nudge.growthFloor == nudge.growthCap == 50000`，golden 钉死；窗口百分比缩放被有意移除——#379/#380；可用 `nudgeGrowthTokens` 覆盖）；增长门 = `max(20k, 0.45 × 步长)` ≈ 22.5k，且 T1 路径另需 ≥ 一个步长（50k）的可压缩质量。这一层保证长会话在任何百分比档位之下也持续得到压缩。
2. **压力层（窗口的百分比）**：`usage ≥ maxContextLimit`（默认 75%）→ 每轮注入 nudge，直到上下文回落到线以下；`usage ≥ emergencyThresholdPercent`（默认 95%）→ 强制 nudge + 紧急截断。
3. **资格层（内核默认 45%，未暴露）**：只管第 1 轮冷启动门票和 T2/T3 块数升级地板——不参与日常路径。

注意：把 `maxContextLimit` 设到内核默认 45% 之下功能完全正确（各层相互独立），但 acp-kernel 会每轮打一条校验警告（`minContextLimitPct must not exceed maxContextLimitPct`）——纯日志噪音，阈值不受影响。

与旧的低 limit 配置（如 `modelContextLimit: 70000`）相比的行为差异：硬墙从 70k 移到原生窗口（大读取不再中途被压死或快速失败）；强制区从 75%×70k ≈ 52.5k 移到你选定的 %×原生；强制区之下上下文按增长层漂移而不是每轮被钉住——漂移就是弹性的对价。若既要严格日常上限又要突发余量，静态百分比区间无法两者兼得：为你能接受的上限选 %，或跟踪结构感知压缩（#344）。

同样的字段支持 per-provider / per-model（三层合并），并经 Web UI 热更新。

### 三层合并示例

本示例展示了全局默认值、按 provider 覆盖与按模型覆盖如何逐字段叠加：

```jsonc
{
  // 第 1 层 —— 全局：应用于每个请求
  "compress": {
    "maxContextLimit": "75%",
    "emergencyThresholdPercent": "95%",
    "nudgeGrowthTokens": 50000,
    "tiers": true,
    "injectTool": true,
    "injectNudge": true
  },

  "providers": {
    "https://api.anthropic.com": {
      // 第 2 层 —— 按 provider：为该 provider 覆盖全局字段
      "compress": {
        "maxContextLimit": "70%",          // 在此稍微提前压缩
        "preserveRecentMessages": 8        // 保留更多最近轮次
      },
      "models": {
        "claude-sonnet-4-5": {
          "context": 200000,
          // 第 3 层 —— 按模型：最深层，优先级最高
          "compress": {
            "modelContextLimit": 180000,   // 将窗口视为 18 万（留出余量）
            "emergencyThresholdPercent": "90%"
          }
        }
      }
    }
  }
}
```

对于发往 `https://api.anthropic.com/v1/messages`、模型为 `claude-sonnet-4-5` 的请求，解析出的设置为：

| 字段 | 来源 | 值 |
|------|------|-----|
| `maxContextLimit` | provider（第 2 层） | `"70%"` |
| `emergencyThresholdPercent` | 模型（第 3 层） | `"90%"` |
| `nudgeGrowthTokens` | 全局（第 1 层） | `50000` |
| `preserveRecentMessages` | provider（第 2 层） | `8` |
| `modelContextLimit` | 模型（第 3 层） | `180000` |
| `tiers` | 全局（第 1 层） | `true` |

---

## 环境变量

环境变量优先于配置文件。在不修改文件的情况下，它们适用于环境特定的覆盖（CI、容器）。

**优先级模型（#2030）。** 每个行为开关的解析顺序为 **环境变量 > 配置文件 > 内置默认值**。自 #2030 起，每个纯行为开关同时拥有配置文件键，部署可以完全放在 `billion-context.json` 里；环境变量保留为覆盖层。**已设置**的环境变量独占其开关——即使值是垃圾值，也按 #2030 之前的原样解析（回落到默认值），既不会泄漏到文件层、也不会被文件层遮蔽。纯环境变量仅保留给无法放进文件的东西：密钥（`BILI_LAUNCH_TOKEN`、`BILI_ENCRYPTION_KEY`）、由另一个 bili 组件在 spawn 时写入的进程间通道（`BILI_MCP_PROXY`、`BILI_PARENT_PID`、`BILI_STRICT_PORT`、`BILI_OPENCODE_ACP_SPEC`、`BILI_LAUNCHER_MODEL_*`）、在第三方宿主进程内读取的宿主侧姿态（`BILLION_CONTEXT_PLUGIN*`、`BILI_NATIVE_*`、`BILI_RECLAIM_FETCH_PATCH`）、路径重定位（`BILI_CONFIG_FILE`、`BILI_SESSIONS_DIR`、`ACP_DUMP_DIR`、`XDG_*`）以及第三方约定（`CLAUDE_CODE_SESSION_ID`、`CODEX_HOME`、`https_proxy`）。新开关的准入规则见 AGENTS.md「Environment Variable Discipline」。

### 环境变量的配置键对照（#2030）

文件键仅在对应环境变量未设置时生效。括号内为内置默认值。

<!-- bili:gen env-map -->
| 环境变量 | 配置文件键 | 默认值 |
|---------|------------|--------|
| `ACP_AUTO_RESTART_ON_UPDATE` | `autoRestartOnUpdate` | false |
| `ACP_AUTO_UPDATE` | `autoUpdate` | true |
| `ACP_COMPRESS_NUDGE` | `compress.injectNudge` | true |
| `ACP_COMPRESS_PROTOCOL` | `diagnostics.compressProtocol` | "tools" |
| `ACP_COMPRESS_TOOL` | `compress.injectTool` | true |
| `ACP_COUNT_TOKENS_PASSTHROUGH` | `diagnostics.countTokensPassthrough` | false |
| `ACP_DEBUG` | `debug` | false |
| `ACP_DUMP_BODY` | `diagnostics.dumpBody` | false |
| `ACP_DUMP_REQ` | `diagnostics.dumpReq` | true |
| `ACP_DUMP_SSE` | `dumpSse` | unset (directory) |
| `ACP_HOST` | `host` | 127.0.0.1 |
| `ACP_KEEP_RESPONSE_ID` | `compat.keepResponseId` | false |
| `ACP_LOG` | `log` | true |
| `ACP_LOG_FILE` | `logFile` | XDG state path (off disables the file, keeps stderr) |
| `ACP_MODEL_CONTEXT_LIMIT` | `modelContextLimit` | 200000 |
| `ACP_NO_COMPRESS_PROMPT` | `diagnostics.noCompressPrompt` | false |
| `ACP_NO_INJECT_TOOL` | `diagnostics.noInjectTool` | false |
| `ACP_PASSTHROUGH` | `passthrough` | false |
| `ACP_PORT` | `port` | 8787 |
| `ACP_PROMPT_CACHE_ROUTING` | `promptCache.routing` | disabled |
| `ACP_PROVIDERS` | `providersPath` | unset |
| `ACP_RAW_DUMP_DIR` | `diagnostics.rawDumpDir` | <state dir>/raw |
| `ACP_RENDER_NONE` | `diagnostics.renderNone` | false |
| `ACP_SESSION_HEADER` | `sessionHeader` | x-acp-session |
| `ACP_UPDATE_TAG` | `updateTag` | latest |
| `ACP_UPSTREAM` | `upstream` | https://api.anthropic.com |
| `BILI_ADVISORY_CHECK` | `advisoryCheck` | true |
| `BILI_ADVISORY_URL` | `advisoryUrl` | unset (built-in feed) |
| `BILI_AFFINITY_SIMHASH` | `affinitySimhash` | true |
| `BILI_ALLOW_DSH_COMPACTION` | `dsh` | {} |
| `BILI_ALLOW_PRIVATE_HTTP_PROVIDERS` | `network.allowPrivateHttpProviders` | false |
| `BILI_ANNOUNCEMENTS_URL` | `remoteAnnouncementsUrl` | unset (official feed: GitHub master announcements/remote.json) |
| `BILI_AUTO_MODE_FORGE` | `autoModeForge.enabled` | true |
| `BILI_CACHE_KEEPALIVE` | `cacheKeepalive.enabled` | false |
| `BILI_CACHE_KEEPALIVE_ARM_WITHOUT_BREAKPOINTS` | `cacheKeepalive.armWithoutBreakpoints` | false |
| `BILI_CACHE_KEEPALIVE_ASSUME_TTL` | `cacheKeepalive.assumeTtl` | null (detect from body breakpoints) |
| `BILI_CACHE_KEEPALIVE_INTERVAL_MS` | `cacheKeepalive.intervalMs` | null (derive from TTL tier) |
| `BILI_CACHE_KEEPALIVE_MAX_DURATION_MS` | `cacheKeepalive.maxDurationMs` | 86400000 |
| `BILI_CACHE_KEEPALIVE_MAX_PINGS` | `cacheKeepalive.maxConcurrentPings` | 4 |
| `BILI_CACHE_KEEPALIVE_TTL_FACTOR` | `cacheKeepalive.ttlFactor` | 0.9 |
| `BILI_CA_FILE` | `network.caFile` | unset |
| `BILI_CCR_RETRIEVAL_TTL_MS` | `ccrRetrievalTtlMs` | 600000 (0 disables retrieval) |
| `BILI_CHAIN_CONTENT` | `chainContentDetection` | false |
| `BILI_CHAIN_STAMP` | `chainEgressStamp` | false |
| `BILI_CLAUDE_NATIVE_PORT` | `claude.nativePort` | unset (lane sticky zone port) |
| `BILI_CLIENT_ERROR_BACKSTOP_MS` | `network.clientErrorBackstopMs` | 30000 |
| `BILI_CODEARTS_REF` | `resign` | {} (armed; built-in scheme sdk-hmac-sha256) |
| `BILI_CODEX_COMPACT` | `codexCompact` | "intercept" |
| `BILI_COMPRESS_AT_FOLD_POINT` | `compress.compressAtFoldPoint` | false |
| `BILI_COMPRESS_AT_FOLD_POINT_CLEAR_THINKING` | `compress.compressAtFoldPointClearThinking` | false |
| `BILI_DECODED_BODY_BYTES` | `network.decodedBodyBytes` | 10737418240 |
| `BILI_DECOMPRESS_TMP_CAP` | `decompressTmpCap` | 50 |
| `BILI_DSH_AUTHORED_COMPACTION` | `dsh.authoredCompaction` | true (on, #3901 flip) |
| `BILI_DSH_CONTEXT_TAB` | `dsh.contextTab` | true |
| `BILI_DUMP_4XX` | `diagnostics.dump4xx` | false |
| `BILI_DUMP_4XX_MAX_BYTES` | `diagnostics.dump4xxMaxBytes` | 2097152 (floor 1024) |
| `BILI_DUMP_MAX_AGE_DAYS` | `diagnostics.maxAgeDays` | unset (off) |
| `BILI_DUMP_MAX_TOTAL_BYTES` | `diagnostics.maxTotalBytes` | unset (off) |
| `BILI_EXPOSURE_LOG_INTERVAL_MS` | `network.exposureLogIntervalMs` | 3600000 (0 disables the log) |
| `BILI_FAKE_BUF_CAP` | `fakeCompletion.bufCapBytes` | 16777216 |
| `BILI_FAKE_COMPLETION_RETRIES` | `fakeCompletion.retries` | 0 (opt-in) |
| `BILI_FOLD_RECONCILE` | `compress.reconcile` | "repair" |
| `BILI_FORK_ADOPTION` | `forkAdoption` | false |
| `BILI_GUARDRAIL_BASH_TIMEOUT` | `guardrails.bashTimeout` | 60 |
| `BILI_GUARDRAIL_MAX_OUTPUT_BYTES` | `guardrails.maxOutputBytes` | 50000 |
| `BILI_GUARDRAIL_REPETITION` | `guardrails.repetition` | true |
| `BILI_GUARDRAIL_TEXT_RUN_THRESHOLD` | `guardrails.textRunThreshold` | 200 |
| `BILI_HTTP_OUTBOUND_BYTES` | `network.httpOutboundBytes` | 10485760 |
| `BILI_IMAGE_BILLING` | `imageBilling` | auto (resolves to pixels) |
| `BILI_IMAGE_RESCALE` | `imageRescale` | true |
| `BILI_IMAGE_TOKEN_CAP` | `imageTokenCap` | unset (uncapped) |
| `BILI_INVARIANT_JUDGE` | `diagnostics.invariantJudge` | true |
| `BILI_KEEP_ALIVE_TIMEOUT_MS` | `network.keepAliveTimeoutMs` | 5000 |
| `BILI_LOG_MASK_HOSTS` | `maskHosts` | true |
| `BILI_MAX_SESSIONS` | `sessions.max` | 256 |
| `BILI_MAX_SHRINK_PER_COMPRESS` | `network.maxShrinkPerCompress` | unset |
| `BILI_MCP_PROXY` | `native.attachUrl` | unset (discover per lane) |
| `BILI_MESSAGE_TIMESTAMPS` | `compress.messageTimestamps` | true |
| `BILI_MITM` | `mitm.enabled` | true |
| `BILI_MITM_DOMAINS` | `mitm.domains` | [] |
| `BILI_MITM_HANDSHAKE_TIMEOUT_MS` | `mitm.handshakeTimeoutMs` | 10000 |
| `BILI_MYSQL_DSN` | `storage.mysql.dsn` | unset |
| `BILI_NATIVE_ATTACH_EXTERNAL` | `native.attachExternal` | false |
| `BILI_NATIVE_ATTACH_POLICY` | `native.attachPolicy` | own-lane |
| `BILI_NON_HTTP_PROVIDERS` | `compactionOptIn` | false |
| `BILI_NO_CACHE_CONTROL` | `compat.noCacheControl` | false |
| `BILI_OPENCODE_INLINE` | `opencode.inline` | false |
| `BILI_OUTBOUND_BODY_BYTES` | `network.outboundBodyBytes` | 5368709120 |
| `BILI_PERSIST` | `persist.enabled` | true |
| `BILI_PERSIST_DEBOUNCE_MS` | `persist.debounceMs` | 500 |
| `BILI_PERSIST_EPERM_ALERT_REPEAT_MS` | `persist.epermAlertRepeatMs` | 0 (no repeats) |
| `BILI_PERSIST_EPERM_ALERT_THRESHOLD` | `persist.epermAlertThreshold` | 5 |
| `BILI_PERSIST_TAIL_TOKENS` | `persist.tailTokens` | 16384 (0 disables message persistence) |
| `BILI_PERSIST_ZSTD` | `persist.zstd` | false |
| `BILI_PERSONA_SPLIT` | `personaSplit` | true |
| `BILI_PI_INLINE` | `pi.inline` | true (unset env+file runs inline) |
| `BILI_POST_RESPONSE_LINGER_MS` | `network.postResponseLingerMs` | 5000 |
| `BILI_PREFLIGHT_DEAD_END_COOLDOWN_MS` | `network.preflightDeadEndCooldownMs` | 300000 |
| `BILI_PREFLIGHT_HOLD_MS` | `network.preflightHoldMs` | 30000 |
| `BILI_PROXY_KEEPALIVE_MAX_MS` | `network.proxyKeepAliveMaxMs` | 55000 (0 = one-shot connections) |
| `BILI_PUBLIC_SNAPSHOT_CAP_BYTES` | `plugin.snapshotCapBytes` | 104857600 (0 disables snapshots) |
| `BILI_RECEIVE_BODY_BYTES` | `network.receiveBodyBytes` | 5368709120 |
| `BILI_RELEASE_NOTES_CHECK` | `releaseNotesCheck` | true |
| `BILI_RELEASE_NOTES_URL` | `releaseNotesUrl` | unset (built-in feed) |
| `BILI_REPLAY_RETRY_BASE_MS` | `network.replayRetryBaseMs` | 1500 (0 disables the delay) |
| `BILI_REPLAY_RETRY_MAX` | `network.replayRetryMax` | 3 (1 disables replays) |
| `BILI_REQUEST_WATCHDOG_MS` | `network.requestWatchdogMs` | 2× upstreamTimeoutMs |
| `BILI_RESIGN` | `resign` | {} (armed; built-in scheme sdk-hmac-sha256) |
| `BILI_RESIGN_BENEFIT` | `resign` | {} (armed; built-in scheme sdk-hmac-sha256) |
| `BILI_RESIGN_PASSTHROUGH` | `resign` | {} (armed; built-in scheme sdk-hmac-sha256) |
| `BILI_RESUME_INHERITANCE` | `resumeInheritance` | true |
| `BILI_ROLLOUT_<FEATURE>` | `rollout.features.enabled` | unset (bucket math decides) |
| `BILI_ROLLOUT_IDENTITY_CHANNEL_HARVEST` | `rollout.features.identityChannelHarvest` | 0 (off) |
| `BILI_ROLLOUT_PLUGIN_FULL_RESEND_WATERMARK` | `rollout.features.pluginFullResendWatermark` | 5 (experimental grey) |
| `BILI_ROLLOUT_PLUGIN_LANE_SERVER_HISTORY` | `rollout.features.pluginLaneServerHistory` | 0 (off) |
| `BILI_SESSION_CONTENT_STORE_PIN` | `sessions.contentStorePin` | false |
| `BILI_SESSION_GC` | `sessions.gc.enabled` | false |
| `BILI_SESSION_GC_INTERVAL_MS` | `sessions.gc.intervalMs` | 3600000 |
| `BILI_SESSION_GC_MAX_AGE_DAYS` | `sessions.gc.maxAgeDays` | 7 |
| `BILI_SESSION_GC_MAX_TOKENS` | `sessions.gc.maxTokens` | 1000000 |
| `BILI_SESSION_RESIDENT_HARD_MAX_BYTES` | `sessions.hardMaxBytes` | (same as `sessions.residentMaxBytes`) |
| `BILI_SESSION_RESIDENT_MAX_BYTES` | `sessions.residentMaxBytes` | 4294967296 |
| `BILI_SESSION_WARM_MAX` | `sessions.warmMax` | 0 |
| `BILI_SESSION_WARM_MAX_BYTES` | `sessions.warmMaxBytes` | 67108864 |
| `BILI_SQLITE_AUTO_DOWNLOAD` | `storage.sqliteAutoDownload` | true |
| `BILI_STABLE_SYSTEM_ANCHOR` | `stableSystemAnchor` | false |
| `BILI_STORAGE_ARCHIVE_AFTER_DAYS` | `storage.archiveAfterDays` | 365 |
| `BILI_STORAGE_BACKEND` | `storage.backend` | unset (sqlite) |
| `BILI_STORAGE_JSON_WRITER` | `storage.jsonWriter` | on |
| `BILI_STORAGE_UNIFIED` | `storage.unified` | unset (full) |
| `BILI_STORAGE_WAL_JOURNAL_SIZE_LIMIT_BYTES` | `storage.walJournalSizeLimitBytes` | 8388608 |
| `BILI_STREAM_ERROR_SHAPE` | `compat.streamErrorShape` | protocol |
| `BILI_STREAM_KEEPALIVE_MS` | `network.streamKeepAliveMs` | 15000 (0 disables) |
| `BILI_SUBAGENT_SPLIT` | `subagentSplit` | true |
| `BILI_THROTTLE_429` | `network.throttle429Enabled` | true |
| `BILI_THROTTLE_429_BASE_DELAY_MS` | `network.throttle429BaseDelayMs` | 2000 |
| `BILI_THROTTLE_429_MAX_CONSECUTIVE` | `network.throttle429MaxConsecutive` | 5 |
| `BILI_THROTTLE_429_MAX_DELAY_MS` | `network.throttle429MaxDelayMs` | 30000 |
| `BILI_THROTTLE_429_SCOPE` | `network.throttle429Scope` | credential |
| `BILI_UPDATE_CHECK_INTERVAL_MS` | `update.checkIntervalMs` | 180000 |
| `BILI_UPDATE_POLICY_URL` | `update.policyUrl` | official repo raw URL |
| `BILI_UPDATE_REGISTRY` | `update.registry` | "npmjs" (registry.npmjs.org) |
| `BILI_UPDATE_STAGGER_MAX_MS` | `update.staggerMaxDelayMs` | 172800000 (built-in 48 h) |
| `BILI_UPDATE_STAGGER_MIN_MS` | `update.staggerMinDelayMs` | 900000 (built-in 15 min) |
| `BILI_UPSTREAM_PROXY` | `proxy` | unset (direct) |
| `BILI_UPSTREAM_PROXY_MODE` | `upstreamProxyMode` | auto (unset behaves as direct) |
| `BILI_UPSTREAM_TIMEOUT_MS` | `network.upstreamTimeoutMs` | 720000 |
| `BILI_WS_OUTBOUND_BYTES` | `network.wsOutboundBytes` | 10485760 |
| `PI_ACP_DELEGATE_ASYNC_TIMEOUT_MINUTES` | `pi.subagents` | {} (acp_delegate enabled with package defaults) |
| `PI_ACP_DELEGATE_FORCE_ENABLE` | `pi.subagents` | {} (acp_delegate enabled with package defaults) |
| `PI_ACP_DELEGATE_IDLE_TIMEOUT_MINUTES` | `pi.subagents` | {} (acp_delegate enabled with package defaults) |
| `PI_ACP_DELEGATE_MAX_CONCURRENT` | `pi.subagents` | {} (acp_delegate enabled with package defaults) |
| `PI_ACP_DELEGATE_MAX_DEPTH` | `pi.subagents` | {} (acp_delegate enabled with package defaults) |
| `PI_ACP_DELEGATE_SYNC_TIMEOUT_MINUTES` | `pi.subagents` | {} (acp_delegate enabled with package defaults) |
| `PORT` | `port` | 8787 |
| `— (file-only)` | `guardrails.repetition.abort` | 5 |
| `— (file-only)` | `guardrails.repetition.enabled` | true |
| `— (file-only)` | `guardrails.repetition.recovery` | false |
| `— (file-only)` | `guardrails.repetition.warn` | 3 |
<!-- /bili:gen -->

| 变量 | 效果 |
|------|------|
| `ACP_DEBUG` | 设为 `1` 开启详细日志（等同 `"debug": true`）。 |
| `ACP_PASSTHROUGH` | 设为 `1` 不经压缩直接转发（等同 `"passthrough": true`）。 |
| `ACP_COMPRESS_TOOL` | 设为 `0` 禁用工具注入（等同 `"compress.injectTool": false`）。 |
| `ACP_COMPRESS_NUDGE` | 设为 `0` 禁用 nudge 注入（等同 `"compress.injectNudge": false`）。 |
| `ACP_MODEL_CONTEXT_LIMIT` | 全局覆盖上下文上限（绝对 token 数）。 |
| `BILLION_CONTEXT_NODE` | 非 Node 宿主进程拉起代理时显式指定的 Node 可执行文件路径（#819/#1429）。宿主自身不是 Node 时的解析顺序:本覆盖项 → PATH 搜索 + GUI PATH 会遗漏的众所周知安装位置（`/opt/homebrew/bin`、`/usr/local/bin`、Volta 等）→ Electron 宿主自身二进制以纯 Node 运行（`ELECTRON_RUN_AS_NODE=1`，最后手段 —— 因此 deepseek-harness desktop 这类桌面应用零配置即可用）。每个发现的候选项都会用 `--version` 校验，必须报告 major ≥ 20 的 `vX.Y.Z`（#3383）：仅*名字*叫 `node(.exe)` 的外部程序（如 Microsoft HPC Pack 集群 CLI —— 忽略参数、退出码 0）会被跳过并告警，而不是被拉起 —— 若此类程序在你的 PATH 中位于真正的 Node 之前，请显式设置本变量。用于强制指定某个 Node（如比宿主捆绑运行时更新的版本）；始终优先于上述回退。 |
| `BILI_IMAGE_TOKEN_CAP` | 预检尺寸门、输出钳制与图片压缩统计所用单图 token 估算的统一天花板（#488/#496/#1843）。叠加在任何计费模式之上 —— 适用于路由真实编码器计费低于像素先验的场景。优先于两级配置（[`imageTokenCap`](#imagetokencap)）；每次请求实时读取（无需重启）。不设置 = 回退到配置（`providers.<url>.imageTokenCap`，再全局），默认无上限。 |
| `BILI_IMAGE_BILLING` | 覆盖预检尺寸门与输出钳制的图片计费模式（#767/#1843）：`pixels` 或 `bytes`。每次请求实时读取（无需重启）；优先于全局 `imageBilling` 与所有按 provider 的 `providers.<url>.imageBilling`。自 #1843 起默认对所有 host 解析为 `pixels`，故用 `bytes` 全进程强制保守字节计费（例如字节计数 relay）—— 更窄的场景仍用按路由设置。详见 [`imageBilling`](#imagebilling)。 |
| `BILI_IMAGE_RESCALE` | 关闭（`"0"` 或 `"false"`）或保持开启（其他取值）出站图片降采样 pass（#3400）：大图以缩小形态发给模型，原图在会话存储中保持逐字节原样。每次请求实时读取（无需重启）；优先于配置文件键 [`imageRescale`](#imagerescale)，后者自身默认开启。 |
| `BILI_IMAGE_RESCALE_MAX_DIM` | 出站降采样 pass 的最长边触发阈值（像素，#3400）：图片最长边超过该值**或** base64 体积超过 100 KB 即成为降采样候选；fit-inside 缩放从不放大。默认 `1600`；非数字或低于 `128` 的取值被忽略（按默认处理）。设计上仅环境变量、无配置文件镜像。详见 [`imageRescale`](#imagerescale)。 |
| `BILI_PREFLIGHT_HOLD_MS` | 预压缩超过该宽限期（毫秒）后，代理提前提交响应并用保活字节挂住客户端（默认 `30000`；见 #568）。 |
| `BILI_STREAM_KEEPALIVE_MS` | 流式阶段客户端保活（#1647）：SSE 响应连续该毫秒数没有向客户端写出任何字节时，bili 发一条 SSE 注释行（`: bili-keepalive`，协议层 no-op），防止客户端 undici `bodyTimeout`（默认 300s；Node 内置 fetch 无法按请求覆盖）在长 prefill 时断连——上游的 ping 注释会被重写器/剥离管道吞掉。默认 `15000`；`0` 关闭。与 `BILI_PREFLIGHT_HOLD_MS` 互补：后者覆盖压缩预检期的静默，本变量覆盖流式期上游导致的静默。 |
| `BILI_RECLAIM_FETCH_PATCH` | 设为 `0` 关闭 native 模式 fetch 自愈重武装（#1158）。默认情况下 native fetch 拦截会把 `globalThis.fetch` 装成受保护的访问器：第三方补丁重新赋值 `globalThis.fetch` 时（如 dsh-http-proxy 的 settings 刷新用冻结的 pre-bili `originalFetch` 盲覆盖），会被接链为下游，模型流量继续经过 bili。设 `0` 则回到经典直装：第三方重装生效，bili 将看不到本会话的模型流量。**出口提示：** 自愈生效期间，被认领的模型流量由 bili 代理自身派发——不再走第三方链的出口（例如 dsh-http-proxy 里配置的 SOCKS5；bili 自身的上游代理仅支持 HTTP 形式）。若需要回退第三方出口，设 `0` 并在 bili 层配置出口（`"proxy": "http://…"`）。**共存提示（#3528）：** 默认的访问器形态与要求 `globalThis.fetch` 为普通可写数据属性的第三方组件不兼容——它们读取其属性描述符、发现没有 `value`，便在加载时中止 fetch 观察者（已报告：DSH 桌面「开发者工具 / NodeJS 诊断」插件，`@deepseek-ai/dsh-experimental-inspector`）。设 `0`（然后完全重启宿主）让此类观察者经经典直装正常加载；代价见上文。详见 #3528。 |
| `BILI_RESIGN` | 设为 `0` 整体卸载 #1884 重签臂（回到修复前行为：带签名的请求照常改写、上游 401）。默认开启——可重签的签名请求（SDK-HMAC-SHA256 且能解析出凭据）走隧道，每个出站 body 都重签；重签臂在 dsh 上无需任何配置（经 credentials 服务做账号池发现）。**内置方案**无法重签的请求（解析不出凭据）本地拒收 403 并给出可操作提示——其修复（提供凭据）是可操作的。其他任何被检测到的方案（SigV4、`x-ofm-signature` 等网关自造头——检测是形状判定，#2090）在 bili 内部没有凭据来源也没有重签器，因此**一律本地拒收**（二元契约：重签+压缩或拒绝，绝不无签名放行）：403 指明方案名，记入 `resign-pending.json`，每次启动（以及 web UI）反复提醒直到 bili 补上该方案的重签器。`BILI_RESIGN_PASSTHROUGH=1` 仅对内置方案开启原样转发（不压缩）——对其余方案无效。`enabled` / `passthrough` / `credentialRef` 有配置文件孪生项，见 [`resign`](#resign) 块——按签名方案分键（`resign["sdk-hmac-sha256"]`；`providers.<url>.resign["<方案>"]` 是二级覆盖）——环境变量优先于文件。方案键把 passthrough 钉死到具体签名：只有自己的键设了的方案才走隧道。相关：`BILI_RESIGN_BENEFIT`（逗号分隔的 CodeArts benefit 模型列表，这些请求附带参与签名的 `maas_type: benefit` 头——优先于整棵三级树；文件侧孪生项是三级的 `models.<name>.benefit` 布尔，未设置落到内置 `glm-5.3-flash,deepseek-v4.1-flash`，对齐 dsh codearts 插件的 `CODEARTS_BENEFIT_FALLBACK`）与 `BILI_CODEARTS_REF`（强制指定重签用的 dsh credentials 服务 ref，而不是从 `$DSH_HOME/jet-hub/state.json` 里发现启用的 `codearts` 账号）。 |
| `BILI_CONFIG_FILE` | 覆盖配置文件路径（指向任意 JSON 文件）。 |
| `ACP_PORT` / `PORT` | 覆盖监听端口。 |
| `ACP_HOST` | 覆盖监听主机。 |
| `ACP_UPSTREAM` | 覆盖默认上游 base URL。 |
| `ACP_LOG` | 设为 `0` 关闭请求日志。 |
| `ACP_AUTO_UPDATE` | 设为 `0` 禁用自动更新检查。文件配置键：`autoUpdate`。 |
| `ACP_AUTO_RESTART_ON_UPDATE` | 设为 `1`（任意非 `0` 值）启用自动更新安装后的自我重启（#811）：重启要求零在途请求、通过安装自检、遵守 10 分钟冷却标记，失败时恢复原监听器。文件配置键：`autoRestartOnUpdate`。 |
| `ACP_UPDATE_TAG` | 自动更新跟随的 dist-tag 通道（默认 `latest`，如 `dev`）。文件配置键：`updateTag`。滚动 `pr` tag 指向所有 PR 中最新的测试构建；旧版按 PR 划分的 `pr-N` tag 已冻结在该 PR 的最后一个构建，仅在显式配置时才会被跟随。滚动 `master` tag 指向最新合入 master 的构建——每次非 release 合并都会发布一个（#2049）；设置它即可跟随已合并但未正式发布的状态。 |
| `BILI_UPDATE_REGISTRY` | 自动更新与 `bili update` 使用的 npm registry base URL 覆盖（默认 `https://registry.npmjs.org`）。仅供 hermetic 测试指向回环 registry（`ACP_TEST_REGISTRY` e2e 套件自带的 verdaccio 实例）；生产环境请勿设置（#1153）。 |
| `BILI_UPDATE_CHECK_INTERVAL_MS` | 自动更新检查周期（毫秒，默认 `180000` 即 3 分钟；≤ 0 的值被忽略，回退默认）。hermetic e2e 套件用它缩短周期，避免等待完整间隔（#1153）。 |
| `BILI_UPDATE_STAGGER_MIN_MS` | 随机升级延迟窗口下限（#3619）：发现新版本后，自动升级等到它在 [min, max] 内抽中的时刻才执行——未设置时内置 15 分钟。优先于远程策略的 `default`；`0` = 本机不延迟（旧版立即升级）。环境变量为纯毫秒；文件对应键还接受时长字符串（`"15m"`）。 |
| `BILI_UPDATE_STAGGER_MAX_MS` | 随机升级延迟窗口上限（#3619）——未设置时内置 48 小时。两侧都设 `0` 时恢复 #3619 之前的立即升级。环境变量为纯毫秒；文件对应键还接受时长字符串（`"2d"`）。 |
| `BILI_UPDATE_POLICY_URL` | 远程更新策略 JSON 的 URL 覆盖（#3619）。默认：官方仓库 raw 地址上的 `auto-update-policy.json`——按设计固定，因为策略只能调节奏/跳过/钉住，不能改安装来源；覆盖仅供 hermetic 测试使用。文件对应键：`update.policyUrl`。 |
| `BILI_MODEL_INFO_RETRY_MS` | dsh 原生模型窗口解析失败（或解析结果不带窗口）后的重试冷却（毫秒，#1812/#1836）：匹配的缓存条目没有 context window 时不视为最终结果 —— 不再让整个进程生命周期 latching 成无 header 状态，而是该冷却过期后由下一个请求触发重新解析。默认 `30000`；非数字或负值回退 `30000`。测试钩子 —— dsh-native 单元测试用它缩短冷却、避免真实等待；生产环境保持 unset。 |
| `BILI_DSH_RETRY_INTERVAL_MS` | dsh 原生插件工具注册重试的退避冷却（毫秒，#2082）：manifest 拉取或工具注册瞬时失败后，下一次重试不早于该冷却发生。默认 `10000`；非数字或非正值回退 `10000`。测试钩子 —— dsh-native 单元测试用它缩短冷却、避免真实等待；生产环境保持 unset。 |
| `BILI_DSH_RECOVERY_INTERVAL_MS` | dsh 原生插件独立恢复定时器的间隔（毫秒，#2082）：工具处于 down 状态时，即使零模型流量也持续驱动注册重试 —— 正是模型已放弃缺失工具、其他路径都不会再触发重试的场景。默认跟随 `BILI_DSH_RETRY_INTERVAL_MS`（`10000`）。测试钩子 —— NODE_TEST_CONTEXT 下除非显式设置本变量，否则定时器永不启动；生产环境保持 unset。 |
| `BILI_ADVISORY_CHECK` | 设为 `0` 禁用严重缺陷公告监视器（#1481）。默认开启 —— 它独立于 `ACP_AUTO_UPDATE` 运行，确保关闭了自动更新的安装也能被强制移出已知缺陷版本范围。fail-open：公告源不可达/格式错误只告警，绝不阻断模型流量。文件配置键：`advisoryCheck`。 |
| `BILI_ADVISORY_URL` | 公告文档 URL 覆盖。默认：已配置 registry（感知 `BILI_UPDATE_REGISTRY`）上的伴生包 `billion-context-advisories`。文件配置键：`advisoryUrl`。 |
| `BILI_RELEASE_NOTES_CHECK` | 设为 `0` 禁用发版说明可见性监视器（#1870）。默认开启 —— 纯可见性，且默认静默（#1977）：拉取伴生发版说明文档，仅当待更新跨度内含 `critical` 级条目时，才在 `acp_status` 与 `/acp` 面板提示「CRITICAL 更新已就绪待重启」（磁盘版本新于运行版本）或「存在 critical 更新」；routine/recommended 级发版永不上屏。绝不安装、绝不重启；fail-open。文件配置键：`releaseNotesCheck`。 |
| `BILI_RELEASE_NOTES_URL` | 发版说明文档 URL 覆盖。默认：已配置 registry（感知 `BILI_UPDATE_REGISTRY`）上的伴生包 `billion-context-release-notes`。文件配置键：`releaseNotesUrl`。 |
| ~~`BILI_HOST_USAGE_CREDIT`~~ / ~~`hostUsageCredit`~~ | **#660 已移除。** 曾用于选择宿主可见的用量模式。#408 的未折叠基线回补（backfill）已整体删除 —— 所有宿主现在统一上报“实际转发（后折叠）请求”的 provider 实测用量，与 `[acp-usage] input=` 一致。遗留该环境变量 / 配置键的旧值会被忽略，请删除。教训详见 PR #691 的 “Bug 历史教训” 一节。 |
| `ACP_PROVIDERS` | 指向外部 `providers.json` 的路径（旧版 / 共享文件）。 |
| `BILI_REPLAY_RETRY_BASE_MS` | 回放重试的基础退避延迟（毫秒）：上游瞬时拒绝后重试（默认 `1500`；设 `0` 关闭延迟）。见 #189。同时驱动主路径传输重试的退避（#1688）。 |
| `BILI_REPLAY_RETRY_MAX` | 回放重试的总次数（默认 `3`；设 `1` 彻底关闭重试 —— 旧版单次尝试行为）。见 #189。在 acp-loop/preflight/compress 循环上适用于瞬时 HTTP 故障与 #1263 fail-fast 网络故障（响应前 reset/refused —— 代理回收类），从不适用于超时/中止类。在主模型请求路径上（#1688）仅重放 fail-fast 响应前网络故障；HTTP 判定（4xx/5xx）一律原样透传、不重试。 |
| ~~`BILI_STREAM_STALL_MS`~~ | **#1714 已移除**（退役 #1452 的可选流式阶段停滞守卫）。#1706 中一个残留的 `400` 导出把每次思考阶段的静默都误判成截断；本地模型部署在流式中途合法地静默数分钟（思考阶段、长 prefill），任何有限子预算对某些环境都不安全。上游静默——prefill 与流式中途一律——现在只受常开的 `BILI_UPSTREAM_TIMEOUT_MS` 空闲预算约束（默认 12 分钟，可调）。旧值被忽略；bili 启动时会点名一次残留导出（`no longer read`）——请从 shell profile 中删除。 |
| `BILI_KEEP_ALIVE_TIMEOUT_MS` | 客户端侧套接字的 keep-alive 超时（毫秒，默认 `5000`，与 Node 隐式默认一致；#1452）。空闲客户端连接由 Node 内建回收器以干净 FIN 回收；此开关把原先隐式的值显式化并可配置，回收在连接生命周期台账（debug 日志）中分类为 `reason=idle-timeout`。非数字或非正值回退到 `5000`。 |
| `BILI_EXPOSURE_LOG_INTERVAL_MS` | 长驻暴露遥测行 `[exposure] uptime=… liveConns=… tcpHandles=… handles=… sessions=… blindTunnels=… inFlight=…` 的周期（毫秒，默认 `3600000` 即每小时；#1452）。`0` 关闭。目的是让套接字句柄泄漏与僵尸连接在长期运行日志中现形，而不是靠事后取证。 |
| `BILI_CLIENT_ERROR_BACKSTOP_MS` | clientError 排空路径的终局兜底（毫秒）（#1529，#1452 第 1 项后续）：排空 bail（300ms）对连接调用 `end()` 后，若对端始终不发 FIN，该套接字否则会在我方无限期半开滞留——keep-alive 回收器以已完成响应为键，且 Node 默认不开 SO_KEEPALIVE。bail 后静默超过此值时，代理改为销毁该套接字，在连接生命周期台账中分类为 `reason=clienterror-backstop` 并带独立的 warn 标记。对 #1452 的 RST 签名安全：整个窗口内套接字一直处于 `resume()` 排空状态，销毁时不携带未读残留字节。默认 `30000`；`0` 恢复「持有直到对端死亡」的旧行为。非数字或负值回退到 `30000`。 |
| `BILI_POST_RESPONSE_LINGER_MS` | 响应完成后的优雅关闭预算（毫秒）（#1982）：代理在最后一个响应结束后主动关闭客户端连接（如 `Connection: close`）时，最多为此预算时长持有该套接字，等待对端的关闭信号——TCP FIN 或 TLS close_notify（它只能在我方最后字节被接收并 ACK 之后到达）——然后干净地关闭；预算内无信号则照常销毁套接字，分类为 `reason=linger-backstop`（warn 行）。此举消除了可能在客户端侧把未 ACK 字节竞态成 RST 的激进销毁（与 nginx `lingering_time` 对齐）。默认 `5000`；非数字或非正值回退到 `5000`。错误驱动的关闭、握手前拆除、clientError 排空（#1529）与空闲回收器均刻意不受影响。 |
| `BILI_ALLOW_PRIVATE_HTTP_PROVIDERS` | 可选开关（#2984）：设为 `1`/`true` 后，私网（RFC1918、127/8、link-local、IPv6 ULA/link-local、`*.local`/`.lan`/`.internal`）上的明文 HTTP provider baseUrl 可通过 agent-registry 接收与摘要端点守卫——这些守卫默认只信任回环明文。公网 IP/域名与 CGNAT（100.64/10）无论如何都拒。默认关闭——行为与 #2984 之前逐字一致。已设置的环境变量值优先于 `network.allowPrivateHttpProviders`。 |
| `ACP_SESSION_HEADER` | 会话 id 请求头名称（默认 `x-acp-session`）。 |
| `ACP_REASONING_KEEP` | 仅 Responses API：设 `none` 丢弃全部 reasoning 项。默认让 reasoning 走压缩管道，其轮次被摘要后自动隐藏（避免无限累积破坏 Codex 的 prompt-cache 前缀）。 |
| `ACP_RENDER_NONE` | 设为 `1` 停止向出站请求历史注入逐消息渲染标签（承载 `mNNNNN` ref 的 `` `` `` 标记）——适用于所有线格式（OpenAI chat、Anthropic、Responses）及 compact 重建（#933）。默认 `text-only`：模型靠这些 ref 在 `compress` 调用中引用消息，只有确认自己的工作流不需要基于 ref 的压缩（例如标签回声泄漏到客户端可见输出）后才应禁用。此前该变量仅在 Responses 路径与 compact 上生效；#933 扩展到了所有路径。 |
| `ACP_LOG_FILE` | 日志文件路径（默认 XDG state 路径；`off` 关闭文件只保留 stderr）。10 MB 自动轮转。 |
| `ACP_DUMP_SSE` | 调试用：转储原始 SSE 帧的目录——含压缩重发/截断重试的循环内上游响应（命名 `<ts>-<sid>-loop<N>-raw.sse`），外层 tee 看不到（#1455）。 |
| `BILI_STREAM_ERROR_SHAPE` | 设为 `"completion"` 恢复 anthropic/openai 线上旧的失败形状（失败文本包在合成的成功完成里）；默认 `"protocol"` = 协议原生错误帧（#1455）。与 `compat.streamErrorShape` 同一开关，此环境变量优先。 |
| `BILI_LOG_MASK_HOSTS` | 设为 `0` 关闭代理日志的 host 脱敏（#897）：非公开目标主机（私有 relay、内网域名）原样记录，而不是 `<private-host>`。默认开启（#255 —— 日志常被整段贴进公开 issue）；凭据头脱敏与之独立、始终开启。真实目标域名不依赖此开关也可查：`GET /__bili/stats` → `blindTunnels`、`GET /__bili/health`（均仅 loopback），以及 `acp_status` 输出。 |
| `BILI_SUBAGENT_SPLIT` | 设为 `0` 关闭 Claude Code subagent 会话分流（#970）：默认情况下，anthropic 线路上同时携带 `x-claude-code-agent-id` + `x-claude-code-parent-agent-id` 头的请求（后台 subagent）会获得独立的 `<session>\|sub:<agent-id>` 会话 —— 独立的锁链与压缩状态 —— 不再排在主会话的锁后面。默认开启。配置文件中设 `"subagentSplit": false` 效果相同；环境变量优先。Responses 线路：无效 —— 见 `subagentSplit` / BOTH-mechanisms 作用域说明。 |
| `BILI_FORK_ADOPTION` | 设为 `1` 开启 fork 块继承（#629）：匿名（prefix-affinity）客户端在会话中途分叉历史（编辑重发 / 从更早轮次重新生成）时，新会话直接继承父会话中"源内容在分叉请求里完整存在"的压缩块 —— 而不是从零开始、把共享前缀重新折叠一遍。默认关闭。带自有 id 的 resume-fork 不受此开关管 —— 它们随 `BILI_RESUME_INHERITANCE` 一并继承压缩块（#1834）。配置文件中设 `"forkAdoption": true` 效果相同；环境变量优先。无论开关如何，匿名 fork 发生时日志都会记录可继承的块清单，便于先评估收益再开启。 |
| `BILI_AFFINITY_SIMHASH` | 设为 `0` 关闭 simhash 链对齐收养（#2265）：匿名请求的精确哈希链被客户端侧大面积装饰性改写（如 Trae 切模型后给每条 assistant 消息重打模型标签）打断时，重新挂回既有会话并保留压缩状态，而不是每次新铸会话、从零重折。护栏：覆盖率 ≥90%（Hamming ≤10）、变异位置 ≥20%（单点编辑仍走 fork，#629）、至少一条字节相同的用户消息、双候选歧义拒猜。默认开启。配置文件中设 `"affinitySimhash": false` 效果相同；环境变量优先。 |
| `BILI_RESUME_INHERITANCE` | 设为 `0` 关闭 resume 继承（默认开启）（#1486）：当带自有会话 id 的客户端（如 Claude Code 的 `x-claude-code-session-id`）以**新**会话 id 重放完整历史来续接会话时（`cc --resume` 会 fork 出新 UUID），bili 通过字节级前缀匹配（≥8 条消息、append-only 跟踪）识别出它与该客户端已跟踪历史的父子关系，并在续接会话的首个请求上继承父会话的 ref 分配 —— 模型引用的旧代际 refs 因此命中**原始**消息、而不是错配到重新编号的新消息 —— 同时继承源内容完整存在的压缩块（随本继承一并生效，#1834：resume 丢块会导致被折叠原文重新回到线上、上游请求膨胀；旧的 `forkAdoption` 联动门现仅作用于匿名 fork，#629），并记录 `derivedFrom` 血缘。父会话不受影响；新消息在父会话 ref 空间之上继续编号。resume 必须**严格扩展**父历史 —— 同深度的字节级重放（不同 id）视为重复会话而非 resume。匿名会话不受影响（保留自己的 pfa-* 世界，#309）。配置文件中设 `"resumeInheritance": false` 效果相同；环境变量优先。 |
| `BILI_STABLE_SYSTEM_ANCHOR` | 设为 `1` 开启稳定 system 锚定（#1085）—— **wire 层兜底（best-effort）**：根治在客户端（会话历史与指令变更的呈现方式由客户端决定），本开关只是阻止代理因头部变化而使整个已缓存前缀失效。**仅限 plain-proxy 模式**：plugin-mode agent（`x-bili-plugin`）自管上下文、永不参与锚定，避免对已自带 cache-friendly 更新注入的客户端（如 claude-code 的 system-reminder）做双重处理。开启后，bili 按会话记住客户端首次发送的头部 system/instructions 块并持续原样重发。**局部变更**（文件式编辑，与当前生效版本共享 ≥70% 行）追加末尾 `[System context update] …` user 注记，内含紧凑行级 diff（`-` 删除 / `+` 新增；每条注记顺序叠加在前一条之上）。**非局部变更**（结构性重排、tool 定义增删、带时间戳的 banner、超 400 行的头部）直接采用新文本 —— 一次有意的缓存失效好过追加会误导模型的噪声 diff。防抖保护：累积超过 8 条注记同样直接替换锚点为最新文本并清空日志。锚点与注记日志随会话持久化，不受压缩/compaction 影响（session metadata 而非 kernel state）。已知残留限制：客户端自放的 `cache_control` 断点在换头后仍可能错位。不参与锚定的请求：标题生成微请求（OpenAI/Google）、Responses compaction-trigger 请求、auto-mode classifier 请求。客户端自身已实现同类机制（稳定 prompt + 历史内更新）时零额外注入 —— 这类更新作为普通历史透传。默认关闭。配置文件中设 `"stableSystemAnchor": true` 效果相同；环境变量优先。 |
| `BILI_ALLOW_DSH_COMPACTION` | **#3666 起移除**（取代 #2028）。原开关通过解除 wire 级拒绝（#1729）放行 dsh 内置自动压缩；由于落地的 dsh checkpoint 会永久覆盖原始会话历史——不可逆、摧毁代理的压缩基底——该逃生门已被整体删除：所有 bili 服务的线路上，dsh 原生压缩调用现在一律被无条件拦截，所有构建一致——默认拒绝（422），或在设置 `BILI_DSH_AUTHORED_COMPACTION`（下一行）时由 bili 本地应答。任何遗留取值——`"dsh": { "allowDshCompaction": true }`、旧文件里裸写在顶层的 `"allowDshCompaction"`、或旧环境变量——都会被忽略，并给出一条点名该键的一次性弃用警告。若要彻底避免 dsh 侧 checkpoint 落地，请改用宿主侧抑制：非 web profile 下随附 bundle patch（`auto: false`），web profile 下用 #3354 加载期 overlay 或 #2474 对 preset-standard 的完整快照覆盖。 |
| `BILI_DSH_CONTEXT_TAB` | 设为 `0` **移除** DSH 顶栏「上下文」会话标签页（#4237）——同名标签页与同机安装的 dsh-context 冲突，且此前没有用户侧开关。隐藏只移除该标签页：压缩、设置页一节（会话子页）、插件 bundle 配置面、Web UI 与 /acp 命令全部不受影响——账本仍可从这些入口查看。其他取值（`1`、`true`、…）强制开启并覆盖文件层；缺省则按配置文件 `dsh.contextTab` 布尔值取值（默认 true = 现状不变）。设置经既有的快照 + `/bili/origin` 载体送达 DSH 页面并在页面加载时读取，因此下次页面加载 / dsh 重启即生效，无需重启代理。标签页的显示**名称**是另一个仅文件层的键：`dsh.contextTabLabel`。 |
| `BILI_DSH_AUTHORED_COMPACTION` | 设为 `1` 让 bili **本地应答** dsh 的压缩摘要调用，而不是拒绝它们（#3733）。每次调用的前置条件：#1729 守卫触发（由标记决定；#3651 起无条件）、会话至少持有一个 ACTIVE 折叠块。应答零出口流量构造（autoModeForge #2740 纪律）：一行身份头 `<bili-snapshot v1 conv="…" seq="…" blocks="…" />` 加上每个活跃块的内核渲染格式摘要——与模型在上游已读到的字节完全一致，客户端显示、上游上下文与服务端状态首次吻合，dsh 的 checkpoint 文件随之缩小（终结 #3723 的无界增长环）。原始历史随时可经 CCR/导出恢复；落地的检查点在重放时经同一 #2432 rebase 识别（与外部 checkpoint 同路径），但记为 `dshAuthoredCheckpointLanded`（info 而非 warn）。灰度窗口期 env-only（无配置文件键）；每请求读取，无需重启。 |
| `BILI_NO_CACHE_CONTROL` | 设为 `1` 关闭 bili 在 Anthropic 通道上的 `cache_control` 断点标注(#1637,随 #1639 落地)。默认开启:Anthropic 系上游只缓存被显式打断点的内容(每请求最多 4 个,按 system + tools + 消息块合并计数),因此 bili 会标注 system 块加上至多 3 个累积消息断点——被标注的消息保持标注(前缀字节稳定),断点只随折叠消亡,最近 3 条稳定消息承载推进前沿。客户端自设的任何 `cache_control`(消息块、tools 条目)都会完全抑制 bili 的标注——客户端自管缓存优先。断点随会话持久化。本开关是逃生阀:用于拒绝该字段的上游或有自己断点策略的中继。仅限 plain-proxy Anthropic 通道;OpenAI/Responses 通道隐式缓存,从不标注。配置文件对应项:[`compat.noCacheControl`](#compat) —— 环境变量优先。 |
| `BILI_CACHE_KEEPALIVE` | 设为 `1` 开启 Anthropic 线路的空闲期提示缓存保活(#3376)——完整机制、停止规则与成本说明见 [`cacheKeepalive`](#cachekeepalive)。配置文件对应项:`"cacheKeepalive": { "enabled": true }`;环境变量优先。默认关闭。 |
| `BILI_CACHE_KEEPALIVE_TTL_FACTOR` | 作用于检测/假定缓存 TTL 档位的节奏因子(默认 `0.9` → 5 分钟档约每 4.5 分钟一次,1 小时档约每 54 分钟一次)。取值须在 `(0, 1]`。配置文件对应项:`cacheKeepalive.ttlFactor`。 |
| `BILI_CACHE_KEEPALIVE_MAX_DURATION_MS` | 单会话保活时长上限,自其最后一次真实请求起算(默认 `86400000` = 24 小时);超过后即使仍在命中也会解除武装。配置文件对应项:`cacheKeepalive.maxDurationMs`。 |
| `BILI_CACHE_KEEPALIVE_MAX_PINGS` | 同时武装的会话数上限(默认 `4`);超限时先驱逐空闲最久的会话。配置文件对应项:`cacheKeepalive.maxConcurrentPings`。 |
| `BILI_CACHE_KEEPALIVE_ASSUME_TTL` | `"5m"` 或 `"1h"`:跳过 body 断点检测,直接按该档位推导节奏——面向会在 bili 下游注入或改写 `cache_control` TTL、导致转发 body 无断点(或档位不对)的中继/代理。配置文件对应项:`cacheKeepalive.assumeTtl`。 |
| `BILI_CACHE_KEEPALIVE_ARM_WITHOUT_BREAKPOINTS` | 设为 `1` 让转发 body 无任何 `cache_control` 断点时也武装保活(默认关——没有断点就没有显式打断点的内容可刷新;断点由你的中继自管时配合 `assumeTtl`/`intervalMs` 使用)。配置文件对应项:`cacheKeepalive.armWithoutBreakpoints`。 |
| `BILI_CACHE_KEEPALIVE_INTERVAL_MS` | 绝对 ping 间隔(毫秒);优先于 `ttlFactor`、`assumeTtl` 与检测档位。用于不随上游 TTL 策略变化的固定节奏。配置文件对应项:`cacheKeepalive.intervalMs`。 |
| `BILI_CHAIN_CONTENT` | 设为 `1` 开启 bili→bili 链感知的 ACP 产物 / `<bili-chain …/>` 检查点**正文内容**检测（#1086/#1421）：当入站请求的正文携带压缩产物（渲染标签 / 历史 `acp_status`+`search_context` 工具调用）或带摘要的检查点，但既无 `x-bili-hop` 头、本实例也无该会话的压缩状态时，bili 记录一次告警性观察和/或应用「首个处理器优先」透传。**默认关闭**（#1683 后续）：默认下只有 `x-bili-hop` 头驱动链识别，因为扫描请求正文可能把 CCR/文件引入的文本和模型回声标签误判为真实标记。仅在中间盒子剥掉 `x-bili-hop`、且你接受该误判风险的狭窄多 bili 中继场景下才启用。配置文件中设 `"chainContentDetection": true` 效果相同；环境变量优先。`x-bili-hop` 信号本身不受此开关影响。 |
| `BILI_CHAIN_STAMP` | 设为 `1` 开启**模型可见**的 `<bili-chain …/>` 链完整性检查点载体的出站注入（#1683，默认关闭）：开启后，本实例实际处理的每个请求都携带一个带摘要的戳，使下游 bili 即使 `x-bili-hop` 头在传输中被剥离也能应用「首个处理器优先」（first-processor-wins）（#1421）。该载体落在终端模型同样会读取的位置（OpenAI/Responses 上是一条尾部 `user` 消息，Anthropic/Google 上是尾部文本 part），因此模型会把它当作幽灵用户输入并花 token 去评论它——这正是它默认关闭的原因。仅在多 bili 中继、且中间盒子剥掉 `x-bili-hop`、带摘要校验的 body-stamp 是防止双重处理的唯一手段这一狭窄场景下才启用。与 `BILI_CHAIN_CONTENT`（入站正文检测同样默认关闭）及 `x-bili-hop` 透传相互独立（后者无论如何都生效）。配置文件中设 `"chainEgressStamp": true` 效果相同；环境变量优先。 |
| `BILI_CHAIN_MAX_FUTURE_SKEW_MS` | 校验链检查点 `issued-at` 时间戳时容忍的最大未来偏斜（毫秒）（#1395 step 2）：戳在比当前时间未来超过此值的检查点会被判为 `stale`（重放 / 时钟偏斜），即使其摘要校验通过。默认 `120000`（2 分钟）；非数字或非正值回退到默认值。Step 2 仅影子模式——这些旋钮只调判定日志，绝不影响转发。 |
| `BILI_CHAIN_RECENT_WINDOW_MS` | 链检查点校验的近期窗口（毫秒）（#1395 step 2）：早于此窗口的检查点被判为 `stale`。默认 `600000`（10 分钟）；非数字或非正值回退到默认值。Step 2 仅影子模式——这些旋钮只调判定日志，绝不影响转发。 |
| `BILI_CONFLICT_SCAN` | 设为 `0` 关闭第三方压缩插件检测（#1206）。默认开启：bili 会扫描客户端自身的插件/扩展注册表 —— opencode 全局 + 项目配置的 `plugin` 数组、pi 全局 + 项目 `.pi/settings.json` 的 `packages`、omp `config.yml` 的 `extensions`、claude 设置的 `enabledPlugins`/`plugins` 及其插件目录、kimi `plugins/installed.json`、hermes 插件目录、dsh profile 依赖 —— 查找与 bili 并存的另一个压缩器。两个层级：**已知冲突**（`opencode-acp`、遗留 `billion-context-pi`，确定性判定）和**关键词疑似**条目（名称匹配 compress / compact / acp / summar* / context*；bili 自身条目永远跳过，`context7` 这类非压缩工具不会误报）。发现结果出现在：客户端启动前的 launcher stderr、每个会话首个请求的一次性代理 warn 日志、以及会话冲突台账 —— `acp_status` 的 `COMPRESSION CONFLICTS` 段、`GET /__bili/stats` → `conflicts`、Web UI 横幅。横幅是拦截**失败**的告警（#3235）：只有存在已落地且未恢复的证据（已确认的第三方压缩器、推断出的客户端原生落点、或无法解释的历史改写信号）才弹出——已恢复（拦截+rebase）的落点与疑似/同族存量保持记录但静默；提供持久化「不再提示」（localStorage 水位线，任何更新的事件自动重新武装）与复制诊断/去 GitHub 报告按钮（复用通用 #3040 诊断设施）。运行时干扰证据（未宣告的历史改写 #1001、孤儿块废弃）记入同一台账。「扫描只读、尽力而为、5 分钟缓存，绝不阻塞或改动客户端配置。」 |
| `BILI_UPSTREAM_PROXY` | 代理自身出站连接的上游代理 —— 在*全局*来源中优先级最高（高于 Web UI 手动代理与配置文件 `proxy`）。per-URL 的 `providers.<url>.proxy` 对其匹配的 provider URL 仍然优先。完整解析顺序、防环规则与示例见 [服务端设置 → `proxy`](#服务端设置)。 |
| `BILI_INHERITED_HTTP_PROXY` / `BILI_INHERITED_HTTPS_PROXY` / `BILI_INHERITED_ALL_PROXY` / `BILI_INHERITED_NO_PROXY` | 非用户直接使用 —— launcher 起代理子进程时自动设置（#1012）。launcher 会从客户端和代理子进程两侧剥掉 shell 的代理变量（客户端必须把流量发给 bili；代理的模型出网也不能被 shell 代理劫持），但会把用户剥离前的代理转发到这些变量里，让代理的**辅助出网**（MITM 盲隧道 —— 客户端侧的 MCP/web 流量）仍能走用户的 VPN。它们只作用于盲隧道的 fallback 层：显式路由 / 全局 `proxy` / `BILI_UPSTREAM_PROXY` / 显式 `"upstreamProxyMode": "direct"` 仍然优先，指向 bili 自身端口的值会被丢弃。模型出网不受影响（未显式配置则保持直连）。 |
| `BILI_UPSTREAM_TIMEOUT_MS` | 上游请求的空闲预算（毫秒）：首字节时间（TTFB）与响应体块之间的间隔（默认 `720000` = 12 分钟）。持续产出数据块的健康流永远不会被中途切断；静默的流才会。同一个值同时驱动底层 HTTP 客户端的传输层超时，因此这一个旋钮即可端到端约束本地大模型的超长 prefill（#551）。 |
| `BILI_CA_FILE` | 指向一个 PEM 文件的路径，包含要额外信任的根 CA（#3776），仅作用于 bili 自己的上游 TLS。做 HTTPS/加密连接扫描的安全软件（卡巴斯基、企业 DLP）或企业 MITM 代理会用自家 CA 重签上游：浏览器通过系统证书库信任它，但 Node 的 fetch 只读内置根证书加 `NODE_EXTRA_CA_CERTS`——于是 bili 报 `SELF_SIGNED_CERT_IN_CHAIN`，而机器上其他一切连接正常。把扫描软件/厂商根证书导出为 PEM 后设置此项（或 `NODE_EXTRA_CA_CERTS`）；或在安全软件的 HTTPS 检查中排除 node.exe。该文件与 Node 内置根证书及 `NODE_EXTRA_CA_CERTS` 条目合并——从不替换。未设置 = 当前默认信任，逐字节不变。配置键：`network.caFile`。 |
| `BILI_ATTACH_HEALTH_DEADLINE_MS` | dsh/opencode attach 校验中，attach 目标已挂但本进程模型通道**钉死**在其上（观察到指向它的 `/bili/…` 路由流量）时的健康等待上限（毫秒）：bili 等待目标恢复而不是 spawn 第二实例——spawn 会把会话劈成两半（模型流量保持钉死，bili 工具在另一实例上 404）。超时后大声报错，并在每次模型请求时持续重查直到目标恢复（默认 `15000`）。见 #1365。 |
| `BILI_ATTACH_EVIDENCE_GRACE_MS` | dsh/opencode attach 校验探测到目标已挂时，等待路由通道证据出现的宽限窗口（毫秒），超时才回退到旧的 spawn 路径（覆盖「判定早于首个请求」的竞态：t≈0 时探测失败、t≈1s 时首个模型请求才落地）（默认 `5000`）。见 #1365。 |
| `BILI_PERSIST` | 设 `0` 关闭会话持久化（仅内存，重启即丢）。 |
| `BILI_PERSIST_DEBOUNCE_MS` | 持久化写盘的防抖窗口（毫秒，默认 `500`）。 |
| `BILI_PERSIST_TAIL_TOKENS` | 持久化会话快照的 token 预算（#401）。盘上记录的是**折叠视图**（压缩范围以块摘要替代）并截断到该预算内的最新消息 —— 不再存全量原始历史。默认 `16384`；设 `0` 彻底不持久化消息（块摘要与压缩原件仍会持久化，`bili export` 退回块级渲染）。活会话内存不受影响 —— 活会话的 `bili export` 始终完整。 |
| `BILI_PERSIST_ZSTD` | 设为 `1`/`true` 启用会话文件的 zstd 压缩（#1080，owner 决定：**默认关闭**——纯 JSON 可恢复性最强：可用 jq/grep 调试，且无降级尾部风险）。启用后，每个确实能压缩变小的会话文件均以 `BILIZSTD1` 格式写入——即在 JSON 主体之上附加一个小头部（魔数 + 格式版本 + 模式字节），在 Node ≥ 22.15 上以 zstd 压缩存储，在旧版运行时上则原样存储；读取端兼容两种主体格式（优先使用原生 zstd，否则回退至内置的 WASM 实现），因此文件在不同运行时和版本间均可正常读取。压不小的小会话与无密钥的原始主体以裸 JSON 落盘。与 `BILI_ENCRYPTION_KEY` 相互独立——两者同时生效时，压缩方式会记录在 `BILIENC1` 内部的模式字节中。已有的纯 JSON 文件**永不在启动时改写**（降级安全——批量重编码会让回退到旧版 bili 时把自己的写入当成“损坏文件”）；它们在其下一次保存时自然转换。注意：一旦会话已保存为 `BILIZSTD1`，旧版 bili（< 0.1.135）无法读取——该限制仅对显式启用的部署生效；未设置或其他值均保持纯 JSON。 |
| `BILI_STORAGE_UNIFIED` | 存储迁移分层开关（#2671）。配置文件层：`{"storage":{"unified":"legacy|shadow|full"}}` 选用相同模式（严格拼写），在环境变量未设时生效；`BILI_STORAGE_UNIFIED`（额外接受 `1`/`true`=shadow、`unified`=full）始终优先于文件。模式在每个 lane 启动时解析一次——文件热改动在下次重启生效。设 `1`/`true` 启用**统一 SQLite 存储干跑**（Phase 1）：每次会话写入都会双写到 `<sessions-dir>/index.db`（引擎解析顺序自 #2833 起：运行时提供内置 `node:sqlite` 时优先（Node >= 22.5）-> 宿主已装的 `better-sqlite3` 原生模块 -> 先前自下载的缓存副本 -> 一次性自下载钉死的 `better-sqlite3` 预编译 tarball（约 11 MB，sha512 校验，受 `storage.sqliteAutoDownload` 控制，不支持的平台永不下载；引擎产物按 Node 大版本分别钉死（Node >= 22 用 better-sqlite3 v13；Node 20 用 v12.9.0 及其 ABI 匹配的 prebuild），任何钉死产物都不支持的运行时会在加载之前被拒绝，下载与缓存副本注册都不进行，因为在那里加载该 binding 会让进程崩溃（#3341、#3894））-> 无引擎则按 #2825 降级契约保持仅 legacy；引擎获取永不依赖宿主安装期的构建脚本审批），并将统一层回放与旧格式加载视图做 digest 对账——不匹配时记录 `[storage] unified shadow DIGEST DRIFT …`，绝不阻塞或改写主写路径（旧格式文件仍是唯一事实源）。设 `full`/`unified` 启用**平替读路径**（Phase 1.5）：`loadSync`/`boot`/`loadAll`/`loadStateForSearch` 改为 unified-first——首次打开旧文件会话时有机导入索引（`[storage] unified import on first open: …`），后续加载直接由 `index.db` 提供，任意统一层失败自动回退旧文件；旧格式文件照常双写，**回滚 = 去掉开关（环境变量与/或文件值）**。加密硬互斥：`BILI_ENCRYPTION_KEY` 激活时整个 sidecar 拒绝开启（index.db 明文存 ingest 载荷，记录 `unified sidecar DISABLED` 警告后保持 legacy-only）。枚举/GC 与 web 列表仍以文件为基底；`removeLegacyFile` 同步删除索引行并释放 CAS 引用计数。digest 把末次写入者版本戳 `biliVersion` 与墙钟时间戳视为环境（`__VER__`/`__TS__`），其余字节必须逐一致。连续 3 次内部失败后自动停用（full 模式下停用即回退 legacy 读）。**副本/检查点 REST（Phase 2）**：任意统一层 lane（shadow 或 full）上，`POST /__bili/replicas {sessionId, label?, pinned?}` 把会话持久化状态冻结为一条内容寻址的 checkpoint blob+行（先强制刷新驻留会话），`GET /__bili/replicas[?sessionId=]` 列出副本，`GET /__bili/replicas/<cpId>` 返回详情+字节数，`POST /__bili/replicas/<cpId>/restore {sessionId?}` 把检查点物化为全新的一等会话（走正常双写路径：JSON+统一层 ingest；`meta.restoredFrom`/`restoredCheckpoint` 记录来源），`DELETE /__bili/replicas/<cpId>` 删除。pinned 副本持有 CAS 引用计数，可在 `deleteSession` GC 中存活（本功能的意义：破坏性实验前抓的副本活得过实验本身）；显式 DELETE 仍可删 pinned。legacy-only lane 返回 501 并附开关提示。路由与 `__bili` 其余部分一样仅限 loopback。未设置时默认 `full`（#3818）。 |
| `BILI_PERSIST_EPERM_ALERT_THRESHOLD` | 同一会话连续 N 次持久化写失败（`EPERM`/`EBUSY`/`EACCES`）后触发一次性「把该目录加入杀软排除项」告警的阈值（默认 `5`）。仅 Windows。见下文「Windows：把会话目录加入杀软排除项」章节。 |
| `BILI_PERSIST_EPERM_ALERT_REPEAT_MS` | persist EPERM 告警的重复窗口（毫秒）。`0`（默认）= 只告警一次后静默；`>0` = 失败持续期间最多每这么久重复告警一次。 |
| `BILI_MAX_SESSIONS` | 内存中最多保留的会话数（默认 `256`；LRU 淘汰 —— 磁盘是事实源）。 |
| `BILI_SESSION_WARM_MAX` | 有界启动（#2803）：监听前启动时最多预加载的最近保存会话数（默认 `0` = 不预热，受 `sessions.max` 封顶）；更早的状态按需重载。设为如 `8` 可恢复对最近集的热加载。文件侧对应：`sessions.warmMax`。 |
| `BILI_SESSION_WARM_MAX_BYTES` | 启动预热集的解码字节预算（#2803；默认 `67108864` = 64 MiB）。计的是**解码后**尺寸而非磁盘压缩字节，zstd 归档无法绕过内存上限。单文件超预算则永不预热。文件侧对应：`sessions.warmMaxBytes`。 |
| `BILI_SESSION_RESIDENT_MAX_BYTES` | 常驻会话估算字节的软目标（#2803；默认 `4294967296` = 4 GiB，#5779 从 512 MiB 提高）。活跃/in-flight 状态不受此限制（字节预算约束的是空闲缓存而非活跃负载）；超出目标时空闲状态随请求完成回落磁盘。文件侧对应：`sessions.residentMaxBytes`。 |
| `BILI_PUBLIC_SNAPSHOT_CAP_BYTES` | 为公开 fork API 按插件会话保留的原始 wire 历史快照的大小上限（字节，#2017）。序列化快照超限的插件会话不再可 fork —— `GET /__bili/plugin/snapshot` 与 `POST /__bili/plugin/fork` 以 `409` fail-closed 并注明原因 —— 而不是永久保留无上限的原始历史副本。上限在每次插件模型请求时重新评估：会话缩回上限内（fork 裁剪后或宿主缩短历史）即恢复可 fork。默认 `104857600`（100 MiB）；`0` 完全停用留存（所有会话不可 fork，已有快照在下一次请求时丢弃）。文件孪生键：`plugin.snapshotCapBytes`。 |
| `BILI_SESSIONS_DIR` | 会话持久化目录（默认 XDG data 目录）。 |
| `BILI_SESSION_GC` | 过期会话文件清理（#1082）为**可选开启**：设 `1`/`true`/`on` 启用 —— 默认关闭，因为会话文件是用户数据（可导出、可续聊），不应有静默删除策略。启用后，扫描（启动 + 每小时）只在**两个条件同时满足**时删除一个文件：年龄超过 `BILI_SESSION_GC_MAX_AGE_DAYS`，并且"小"到无损 —— 该会话**从未被压缩过**（零折叠块）且最近一次请求体 ≤ 下述 token 上限，这样继续对话只损失一次冷重建（用客户端自己的历史重建），别无其他。安全边界：被压缩过的会话永不删除（其摘要无法无损重建）；内存中仍持有的会话会被跳过，除非该会话自上次落盘后一直空闲；不可读/损坏的文件原地保留；每次删除逐条写审计日志（路径、大小、年龄），另有一次非空扫描的汇总日志；只触碰会话目录；清空后的协议子目录一并删除。注意 resident 守卫是进程内的：共享 `BILI_SESSIONS_DIR` 但不落盘的另一实例（如 `BILI_PERSIST=0`）不会刷新文件 mtime，其仍活跃的会话文件可能老化被扫 —— 代价同样是有限的一次冷重建，且有年龄门兜底。CCR 内容存储（#1097）与会话共享生命周期（#1180）：`<hash>.content-store.json` 伴随文件随其会话文件一起删除；孤儿伴随文件（会话文件已不存在）超过年龄门后被清扫；不可读的伴随文件会连同其会话文件一起保留（绝不猜测）。 |
| `BILI_SESSION_GC_MAX_AGE_DAYS` | 会话文件成为清理候选的最小年龄（天，默认 `7`）。必须远超任何合理续聊窗口：文件删除后同会话再续聊，消息编号会从 m00001 重新分配，而续聊 agent 的转录里可能还引用着旧编号（内核契约：编号永不复用）。 |
| `BILI_SESSION_GC_MAX_TOKENS` | 清理资格的大小上限（token 数，默认 `1000000` = 1M，#1082 owner 拍板）。按**解码后**的上下文判断，绝不看文件字节数（加密/zstd 文件在盘上小得多）：记录了最近一次请求体 token 估算值（`rawInputTokens`，每轮记录）时以它为准；未记录的旧文件用 `stats.contextTokens`；伴随的内容存储占用（#1097：唯一内容经内核 CJK-aware `defaultCountTokens` 计数，与 `rawInputTokens` 同一估算器，#1180）叠加其上，防止小会话携带大存储钻过上限。仅适用于从未被压缩过的会话 —— 含折叠块的文件无论多大都保留，因为其摘要无法从重新发送中无损重建。 |
| `BILI_SESSION_GC_INTERVAL_MS` | 后台清理扫描间隔（毫秒，默认 `3600000` = 1 小时）。启动时会先扫一次。 |
| `BILI_ENCRYPTION_KEY` | 会话文件静态加密（#708），适用于部署在不可信节点的场景。密钥必须恰好 32 字节，hex（64 字符）或 base64；未设置 = 不加密的纯 JSON 文件（设 `BILI_PERSIST_ZSTD=1` 时为 `BILIZSTD1`——参见 `BILI_PERSIST_ZSTD`）。设置后：每个会话文件均以 `BILIENC1` 格式写入，即对 JSON 施加 AES-256-GCM 加密，JSON 仅在 `BILI_PERSIST_ZSTD=1` 时以 zstd 压缩（Node ≥ 22.15 使用 zstd，其余情况写入原始数据）——启用压缩还可将文件体积缩小约 5–10 倍。加密与压缩现为独立的配置项（#1080）。密钥只从该环境变量读取——永不落盘、永不进日志——请确保它不受同一文件系统上的其他进程触及。非法值会导致启动中止（快速失败，绝不静默明文运行）。用错误的密钥启动时，受影响的会话按损坏文件跳过（有日志，不崩溃）。丢失密钥将使已加密的会话永久不可读。对称加密为刻意设计（同一进程既加密又解密）。已有的未编码文件从不在启动时改写——在其下一次保存时自然加密（降级安全；参见 `BILI_PERSIST_ZSTD`）。威胁模型（#708，owner 确认）：防的是**离线/机械性**的文件获取——云厂商换盘、节点镜像漂移后的离线磁盘快照、磁盘镜像失窃、备份泄露、被云同步的状态目录——离线第三方拿不到密钥即无法读取内容。不防御对活节点有访问权的定向攻击者；那一档应把信任根移出 proxy（KMS / TEE / 机密虚拟机 + 强化权限体系），而不是在 proxy 本身想办法——到了那个程度暴露的远不止密钥，proxy 层不是该守的边界（`BILI_PERSIST=0` 可彻底关闭持久化）。用同一进程/环境中的第二把密钥对密钥做二次加密不增加任何安全性：所有离线失窃场景里攻击者缺的始终只有一个工件——你的非落盘秘密——无论它叫数据密钥还是包裹密钥；只有把包裹密钥放进不同信任域（KMS/TPM/TEE）才能提高门槛，而那属于上面的场景 2。 |
| `BILLION_CONTEXT_PROXY` | launcher 会导出它；客户端侧 bili 插件/扩展检测到后自禁用自身压缩（避免双重压缩）。 |
| `PI_PROXY_ANTHROPIC` | 由 `bili omp` launcher 导出（仅当 `PI_PROXY` 与 `PI_PROXY_ANTHROPIC` 均未来自用户环境时）：把 OMP 的 Cowork anthropic 传输指向代理，让这些请求走可压缩通道而非 node:https 直连（#2583/#3556）。用户设置的值始终优先。 |
| `BILLION_CONTEXT_PLUGIN` | 设 `0` 彻底关闭插件模式（恢复 wire 层工具注入）。 |
| `BILI_LAUNCHER_MODEL_WINDOWS` | 内部使用：launcher 把客户端自身配置里的逐模型上下文窗口（pi `models.json`、omp `models.yml`、opencode `models.<id>.limit`、codex `model_context_window`）以 JSON 传给自己拉起的代理，让 nudge 分母对自托管模型也用真实窗口。只有 launcher 会设置，无需用户配置。 |
| `BILI_LAUNCHER_PLUGIN` | 设 `0` 关闭 launcher 为 claude/codex 注入 bili MCP 服务器（退回纯 wire 模式）；设 `1` 强制插件模式。默认注入——但 codex 上游为本地/私网地址时自动退回 wire 模式（sglang/vllm/ollama 不解析 codex 的 namespace 工具类型）。见[启动器参考](#启动器参考)。 |
| `BILI_LAUNCHER_DIRECT` | 设 `1` 启用 launcher 直连 URL 路由（放弃 MITM/CA 信任）。见[启动器参考](#启动器参考)。 |
| `BILI_NATIVE_ATTACH_EXTERNAL` | 附着门禁逃生舱（#1335）。lane 型原生 hook 只附着于报告了 armed 会话生命周期看门狗（`/__bili/health` 里 `watchdog.armed == true`）的代理——未武装的 lane 型代理（崩溃会话的孤儿、或生命周期状态无法核验的实例）被大声拒绝而不是被静默搭乘。#1660：**手工 `bili start` 守护进程**（无 lane、无 launch token）按定义属于用户主权区——一台**已武装**的用户区守护（受管共享代理，#1225）仍会被任何兼容 client lane 搭车；但一台**未武装**的手动守护在默认（`attachPolicy: "own-lane"`，#2877）下**不会**被 lane 型 hook 搭车 —— 它自行派生；设 `attachPolicy: "global-fallback"` 恢复 #2877 之前「原生 hook 默认附着手动守护」的行为。无论哪种情况，其寿命与版本都由你自己负责。设 `1`/`true` 可以连 lane 型未武装监听者也一并附着：任何 code/lane 兼容的监听者无论看门狗状态都可附着（包括根本不报 `watchdog` 字段的 pre-#1330 构建）。配置文件里 `"native": { "attachExternal": true }` 等效；环境变量优先于文件值。注意：`attachExternal` 只管辖 **lane 型**守护的*生命周期门禁* —— 它并不开/关对 user-zone（手动）守护的附着；那个轴是 `attachPolicy` / `attachUrl`。默认关闭（针对 lane 型实例）。完整机制(复用规则、监听者表、逃生舱)见 [TECHNICAL-NOTES.zh-CN.md](TECHNICAL-NOTES.zh-CN.md#代理复用与附着门禁122513351232)。 |
| `BILI_ZCODE_ROUTE` | zcode 原生插件路由范围（#1622）：`all`（默认 —— 每个有可用 http(s) baseURL 的 provider 条目都吃压缩，pi/dsh 对齐）、`plans`（#1622 前的 bigmodel coding-plan 白名单）、`none`（整体退出，bootstrap 不碰 store）。兼容逃生舱 —— **没有**文件等效项；路由默认即开启。 |
| `BILI_ZONE_PORT` | 自管端口区基准（#1660，默认 `18787`）：所有 lane 拉起的代理（claude/zcode 原生 hook、跑 0 号口的 launcher lane）先试该 lane 的粘性记录，否则这个基准口；端口碰撞由子进程 +1 阶梯解决（例外：占用者是同 lane 的旧版本实例——升级重启重叠时——子进程最多等 5 秒让它释放并复用同一端口，而不是漂移，#1723），落定的口记录在 `<state>/port-zone.json` 粘性表里，后续拉起自动跟随漂移。手工 `bili start` 保持自己的默认口（`8787`）——lane 永不碰用户主权区。 |
| `BILI_ZCODE_PORT` | 为 zcode 原生通道钉死**确切端口**（#1660）：启动变为严格端口——占用者被大声拒绝而不是跳口——共享 store 里的包装也因此跨会话重启存活，无需交接。不设则通道骑自管区（`BILI_ZONE_PORT` 基准 + 粘性漂移跟随）。 |
| `BILI_ZCODE_SIGNING_FIXED` | `1`/`true` = 假设你的 ZCode 构建已修复 ClientRequestSigningV4（#1621）：v3.14+ personal store 上 coding-plan 账号的逐条跳过关闭，恢复路由。临时逃生舱 —— **没有**文件等效项。 |
| `BILI_CLAUDE_UPSTREAM` | claude 直连模式：当 `ANTHROPIC_BASE_URL` 已指向某个 relay 时，用它指定你的 relay 端点（否则会被旁路）。 |
| `BILI_CLAUDE_NATIVE_PORT` | 为 claude 原生通道 hook 拉起的代理钉死**确切端口**（#964/#1660）：严格端口语义——口上的占用者被大声拒绝而不是跳口——烘进受管 `ANTHROPIC_BASE_URL`。不设则 hook 骑自管区（`BILI_ZONE_PORT` 基准 + 每 lane 粘性），且每次会话把受管 URL 重钉到存活 origin，端口漂移自愈（#1660）。 |
| `BILI_CODEX_COMPACT` | codex 原生压缩处理。默认 `intercept`：安全门通过时（transform 成功 + 稳态用量 < 窗口 90% + 至少一个活跃压缩块）拦截 codex 的压缩请求，在本地伪造向 ACP 状态的交接——trigger 形态伪造 2 帧 SSE，endpoint 形态伪造 `{output}`——且不接触上游。作用范围（#3008）：覆盖显式形态（compaction_trigger + /responses/compact）与以普通请求形态过线的内联自动压缩（按 SUMMARIZATION_PROMPT 模板检测）——用户自定义 compact_prompt 后锚点失配、按原样转发；bili 仅旁路观察到的压缩（pass/安全阀放行）走事后 rebase（#2372）。伪造的 ACP 摘要经历史承载交接消息注入（缺席时 developer 消息兜底），保证 codex 截断历史后压缩内容仍可见。设为 `pass` 可退出，把 codex 的压缩请求转发给上游（原生压缩兜底）。任一安全门失败则原样透传。codex 客户端判定（本项生效范围，同时用于窗口 clamp 与会话身份指纹）：User-Agent 须以已注册前缀开头（`codex_cli_rs/`、`codex_exec/`、`codex desktop/`——大小写不敏感，因 Codex Desktop 等变体首字母大写，#1169），或含某个以**小写** `codex` 开头的空白分隔组件（未知变体如 `codex_sdk_ts/…`，#645——#1641 起从裸子串收窄为 token 级前缀，UA 中仅在括号内/路径段提及 "codex" 的非 codex 客户端不再被误判；兜底有意保持大小写敏感，排除 "Codex"-形中继，#1106）。 |

---

## 上游故障诊断（代理上游）

每个上游传输失败都会被分类为一种 `kind=`，作为日志行（以及客户端/状态看到的 `error:` 字符串）的前缀，并附带修复提示（`hint=...`）。分类体系（#1263）：

| kind | 含义 | bili 行为 |
|------|------|-----------|
| `client-abort` | 下游客户端断连 | 无（请求按定义已死） |
| `upstream-timeout` | 空闲预算耗尽（headers/body）或请求看门狗中止 | **不重试** —— 绝不叠加等待预算 |
| `connect-timeout` | TCP 握手未完成（端点不可达/被黑洞） | 透明重放，受 `BILI_REPLAY_RETRY_MAX` 约束 |
| `proxy-reset` | 经代理的连接在响应前死亡（首要嫌疑：代理空闲回收 / 载荷上限 / 节点轮换） | 透明重放，受 `BILI_REPLAY_RETRY_MAX` 约束（默认共 3 次尝试） |
| `upstream-reset` | 同上，直连（嫌疑在上游/本地网络） | 同上（受 `BILI_REPLAY_RETRY_MAX` 约束） |
| `connect-refused` | TCP 被拒（配置了代理时指代理，否则指上游） | 同上（受 `BILI_REPLAY_RETRY_MAX` 约束） |
| `upstream-unreachable` | 主机无路由（ICMP `EHOSTUNREACH` / `ENETUNREACH` / `EHOSTDOWN`）——路由 / ACL / 防火墙 `REJECT`；macOS 另见 Local Network 隐私拒绝（#5663） | 同上（受 `BILI_REPLAY_RETRY_MAX` 约束） |
| `dns` | 域名解析失败（DNS 服务器 / 主机名拼写错误） | 透明重放，受 `BILI_REPLAY_RETRY_MAX` 约束 |
| `tls` / `unknown` | TLS/握手失败（CA/MITM）/ 未分类传输故障 | 不重试 |

握手类韧性配合代理连接的 keep-alive 上限（`BILI_PROXY_KEEPALIVE_MAX_MS`，默认 55s），让 bili 不再向即将回收套接字的代理提供这些连接。

长会话出现周期性连接故障时的**四步清单**（源自 #1249）：
1. 在 `bili.log` 中 grep `kind=` —— `proxy-reset` 聚集指向外部代理；`upstream-timeout` 指向上游健康度。
2. 将失败请求的时间戳与外部代理自身的访问日志对齐（同一主机时钟）——同一毫秒的回收条目即可结案。
3. 确认是哪一跳：同一行里 `proxy=<url>` vs `proxy=direct`；对照代理文档的载荷上限检查转发请求的 `content-length`。
4. 若代理是回收方，要么调高其空闲超时，要么保留 bili 的 55s 复用上限 + 一次重放安全网来吸收。

**宿主侧重试分层（#2568 第 4 项）。** 当插件宿主跑在 bili 后面（如 `bili pi`）时，响应前的传输失败可能被两个互不可见彼此计数的独立层重试：

1. 上述 bili 传输重放（≤ `BILI_REPLAY_RETRY_MAX` 次尝试，`BILI_REPLAY_RETRY_BASE_MS`×2ⁿ 退避），作用于 bili→上游 腿；
2. 宿主自身的轮级重试预算，作用于 宿主→bili 腿（pi：`retry.maxRetries` 默认 3、基础延迟 2s 指数退避；当暴露出的错误文本命中其瞬态模式表时触发）。

两层对连接类故障刻意重叠而非互相让位：bili 的快速本地重放在宿主重跑整条轮次管线之前吸收毫秒级抖动；而当 `BILI_REPLAY_RETRY_MAX=1`（快速失败）时宿主的层仍保护轮次。对完全死亡的上游，最坏情况 = 每个用户可见轮次 (宿主尝试数) × (bili 尝试数) 次连接 —— 默认参数下 4 × 3 = **12** 次，嵌套退避总时长约 30–35 s 后错误才浮现。两层的预算都是有限定值，最坏情形有界。

排障时关联两份日志：bili 每次传输重放都记录 `[<session>] [acp-proxy] upstream <kind> (pre-response network failure): <error>; retrying in <ms>ms (attempt n/m)`（warn 级，`bili.log`）；pi 每次轮级重试发出 `auto_retry_start` / `auto_retry_end` 事件（交互式 TUI 中显示为状态行）。按 session id + 时间窗对齐——两层之间没有共享关联 id。

## CLI 参考

完整命令面（`bili --help` 打印的是精简版）。优先级处处一致：**CLI 参数 > 环境变量 > 配置文件 > 内置默认值**。

| 命令 | 作用 |
|---|---|
| `bili [start] [options]` | 启动代理（默认读取 XDG 配置文件） |
| `bili pi [opts --] [args]` | 启动代理 + 拉起 **pi** 接入它 |
| `bili pi-test [opts --] [args]` | 类似 `bili pi`，但追加 `--no-extensions`（干净测试 —— 压缩完全由代理负责） |
| `bili codex [opts --] [args]` | 代理 + **codex** |
| `bili claude [opts --] [args]` | 代理 + **claude**（Claude Code CLI） |
| `bili omp [opts --] [args]` | 代理 + **omp**（pi 内核）—— opencode zen 模型走默认 `opencode.ai` MITM 白名单（#1405） |
| `bili opencode [opts --] [args]` | 代理 + **opencode** —— 内置 zen 网关（`opencode.ai`）默认证书 MITM（#1405）；`~/.config/opencode/opencode.json` / `~/.omp/omp.json` 中 `providers[].baseURL` 声明的主机自动加入 MITM 白名单（#1411），`~/.aider.conf.yml` / `~/.config/opencode/.aider.conf.yml` 同受监听 |
| `bili hermes [opts --] [args]` | 代理 + **hermes-agent**（`/bili/` 重写） |
| `bili dsh [opts --] [args]` | 代理 + **deepseek-harness**（`/bili/` 重写；`--profile web "task"` 等参数原样透传） |
| `bili codebuddy [opts --] [args]` | 代理 + **codebuddy**（Tencent CodeBuddy Code CLI）—— `CODEBUDDY_BASE_URL` `/bili/` 重写,OpenAI chat-completions wire;预算对齐走 `CODEBUDDY_AUTO_COMPACT_WINDOW`(#640) |
| `bili qoder [opts --] [args]` | 代理 + **qoder CLI**(`qoder`/`qodercli`)—— 证书 MITM(`HTTPS_PROXY` + `NODE_EXTRA_CA_CERTS`);模型端点硬编码 https(`/bili/` 改写不可用,默认主机表加白名单)(#653)。Qoder **Desktop** 是另一条 BYOK/自定义渠道,走 `/bili/` 前缀的明文 OpenAI wire —— 当作普通自定义 provider 指向 bili(不走这条 MITM 车道);官方订阅流量加密,不在范围(#764) |
| `bili trae [opts --] [args]` | 代理 + **Trae CLI**（字节跳动,闭源 Go 二进制)—— 证书 MITM(`HTTPS_PROXY` + `SSL_CERT_FILE`);模型主机取 `TRAE_CLI_API_HOST` 或默认企业网关(#655) |
| `bili jcode [opts --] [args]` | 代理 + **jcode**（Rust 终端编码 agent)—— 环境变量式证书 MITM 启动(`HTTPS_PROXY` + `SSL_CERT_FILE`);托管模型主机 `api.z.ai` 默认加白,本地回环 provider 走 `NO_PROXY` 直连 |
| `bili kimi [opts --] [args]` | 代理 + **Kimi Code**(Moonshot CLI)—— 证书 MITM(`HTTPS_PROXY` + `NODE_EXTRA_CA_CERTS`/`SSL_CERT_FILE`);provider/model 主机取自 `~/.kimi-code/config.toml`(遵循 `KIMI_CODE_HOME`),未声明时用托管 OAuth 端点;回环端点编目并附手动 `/bili/` 前缀提示(#757) |
| `bili test pi` | 无污染的 pi 链路端到端冒烟测试 |
| `bili export [session] [--full] [--jsonl] [--output FILE]` | 列出持久化会话 / 把一个会话导出为 Markdown 交接文档(或 `--jsonl`:按行分隔的 JSON 转储,优先从统一索引表渲染,无索引时回退 legacy 记录——生成物仅作互操作,绝非事实源)—— 见[会话与迁移](#会话与迁移) |
| `bili acp-cache diff <dump-dir> [--json] [--log FILE] [--no-log] [--session SID]` | 从 `ACP_DUMP_BODY` dump 归因缓存失效原因 —— 对同会话相邻请求做前缀 diff(#1266) |
| `bili update` | 立即检查并安装新版本（绕过 3 分钟节流） |
| `bili plugin install <agent>` | 把原生工具插件 / MCP 桥装进宿主 —— 见[插件模式（原生工具）](#插件模式原生工具) |
| `bili plugin remove <agent>` | 卸载 |
| `bili plugin list` | 显示每个宿主的安装状态 |
| `bili mcp` | 独立运行 bili MCP 服务器（stdio） |
| `bili plugin-register <id> [--origin URL] [--agent name]` | 预绑定会话 id 到插件模式（高级用法） |
| `bili --version` / `bili --help` | 打印版本 / 帮助 |

launcher 命令里 `--` 之后的参数原样透传给客户端（`bili pi -- print "hi"`）。

### 参数

| 参数 | 作用 |
|---|---|
| `--port <N>` | 监听端口（默认 `8787`） |
| `--host <ADDR>` | 监听主机（默认 `127.0.0.1`） |
| `--config <FILE>` | 配置 JSON 路径（默认： XDG 位置） |
| `--debug` | 详细日志 |
| `--passthrough` | 不经压缩直接转发 |
| `--no-passthrough` | 强制开启压缩（覆盖配置文件） |
| `--no-auto-update` | 本次运行禁用后台自动更新 |
| `--mitm-domain <domain>` | 追加 MITM 白名单域名（可重复；仅 launcher） |

---

## 客户端接入

不用 launcher 时，把客户端指向代理有两种方式：**`/bili/` 前缀**（API-key 客户端）和 **MITM 透明代理**（端点硬编码的登录客户端）。

### `/bili/` 前缀（API-key 客户端）

用 **API key** 配置（不是登录账号）的客户端允许你改上游 URL。只需在前面加上代理地址 + `/bili/`，其他都不用改。API key 仍留在客户端配置里，代理原样透传。

**OpenCode** —— 编辑 `~/.config/opencode/opencode.json`，改 provider 的 `baseURL`：

```jsonc
// 之前：
"baseURL": "https://open.bigmodel.cn/api/coding/paas/v4"
// 之后（前面加上代理地址 + /bili/）：
"baseURL": "http://localhost:8787/bili/https://open.bigmodel.cn/api/coding/paas/v4"
```

**OpenCode 注意。**这是 OpenCode 的**无插件**路径。若在此类配置之上还装了原生插件,运行时每会话警告一次并附修复指引(去前缀或卸插件);请求本身继续走纯代理路径。三条互斥的 OpenCode 接入路径见 [CLIENTS.zh-CN.md](CLIENTS.zh-CN.md#opencode)。

**其他客户端。**同样的单行前缀适用于任何模型 baseURL 可编辑的客户端(Cline / Roo Code / Kilo Code、Continue、OpenHands、Zed、Void、Cursor 单模型通道等)——已核实的入口清单见 [CLIENTS.zh-CN.md → 收养未列表的客户端](CLIENTS.zh-CN.md#收养未列表的客户端任何模型-baseurl-可配的客户端2340)。

**Codex（API key 模式）** —— 编辑 `~/.codex/config.toml`，改 provider 的 `base_url`：

```toml
# 之前：
base_url = "https://api.openai.com/v1"
# 之后：
base_url = "http://localhost:8787/bili/https://api.openai.com/v1"
```

**Codex（ChatGPT 登录）** —— 设顶层 `openai_base_url` 字段（保持 `model_provider = "openai"` 和 OAuth 登录不变）：

```toml
# ~/.codex/config.toml（顶层字段，不是 section）
model_provider = "openai"
openai_base_url = "http://localhost:8787/bili/https://chatgpt.com/backend-api/codex"
```

照常运行 `codex login`；OAuth token 随 `Authorization` 头传输，代理原样转发给上游。

**Pi** —— 编辑 `~/.pi/agent/models.json`，改 provider 的 `baseUrl`：

```jsonc
// 之前：
"baseUrl": "https://api.anthropic.com"
// 之后：
"baseUrl": "http://localhost:8787/bili/https://api.anthropic.com"
```

**Claude Code** —— 把 `ANTHROPIC_BASE_URL` 环境变量设成 `/bili/` URL。（claude 的 undici fetch 忽略 `HTTPS_PROXY`，所以 `/bili/` URL 形式是唯一的手动方式 —— 证书 MITM 拦不到它。）

```bash
export ANTHROPIC_BASE_URL="http://localhost:8787/bili/https://api.anthropic.com"
```

**Claude Code 走 Vertex AI**（`CLAUDE_CODE_USE_VERTEX=1`）—— 在 Vertex 下普通变量是无效的：Claude Code 忽略 `ANTHROPIC_BASE_URL`，改为请求 `<ANTHROPIC_VERTEX_BASE_URL>/projects/<p>/locations/<loc>/publishers/anthropic/models/<id>:rawPredict|streamRawPredict`，并把这段路径**原样**接到 base URL 后面（连尾部路径一起）。所以要改的是 `ANTHROPIC_VERTEX_BASE_URL`：

```bash
export CLAUDE_CODE_USE_VERTEX=1
export ANTHROPIC_VERTEX_PROJECT_ID=<gcp-project>
export CLOUD_ML_REGION=global
export ANTHROPIC_VERTEX_BASE_URL="http://localhost:8787/bili/anthropic/https://aiplatform.googleapis.com/v1"
```

这个 URL 有三处必须写对（每一处写错都是静默 404）：

- **`/v1` 要写在 base URL 里。** 客户端自己那半个路径从 `/projects/…` 开始；Vertex 只服务 `/v1/projects/…:rawPredict`，无版本号的形式一律 404。
- **`anthropic` 这一段不能少。** 只用 `/bili/<url>` 时代理按路径后缀分类，而 `:rawPredict` 不匹配任何已知后缀 —— 靠显式协议标记才能选中 anthropic 通道。
- **主机名与 `locations/<loc>` 必须一致**，且主机名跟区域走：`global` → `https://aiplatform.googleapis.com`，`us`/`eu` → `https://aiplatform.<loc>.rep.googleapis.com`，其他区域 → `https://<loc>-aiplatform.googleapis.com`。

鉴权在这条通道上原样透传：Claude Code 自己签发 ADC access token，bili 不为它签发任何鉴权。以上动作 `bili claude` 会全部自动完成 —— 它把 `ANTHROPIC_VERTEX_BASE_URL` 设成同样的转发形式，并保留普通变量（在 Vertex 下无效，因此关闭 provider 时同一次启动仍然可用）。

> **自动压缩对齐（仅手动模式）。** `bili claude` launcher 会自动把 `CLAUDE_CODE_AUTO_COMPACT_WINDOW` 设成 bili 对你模型的有效窗口，让 claude 自己的自动压缩阈值与 bili 的压缩预算对齐。手动 `/bili/` 模式下需要你自己设 —— 否则 claude 可能在与 bili 窗口不一致的阈值上跑它自己的本地自动压缩（一次“总结对话”轮次）。这通常无害（同一 session-id，bili 会从截断中重新推导状态），但比必要的更吵。把它设成 bili 对你模型的有效窗口：
>
> ```bash
> export CLAUDE_CODE_AUTO_COMPACT_WINDOW=<bili 有效窗口 token 数>
> ```
>
> claude 会把这个值**向下**钳制到它自己感知的模型窗口（不会向上），所以设大了是安全的。也可以持久化到 claude 的 settings（`autoCompactWindow`）里。

**其他 API-key 客户端（Cursor / Aider / Continue ……）** —— 只要配置了上游 URL，前面加 `http://localhost:8787/bili/` 就行，其他都不用改。

`/bili/` 前缀还是个**自检测信号**：billion-context 的客户端扩展（billion-context-pi / opencode-acp）能在自己的 baseUrl 里认出它并自禁用，避免双层压缩。

### MITM 透明代理（登录/订阅客户端）

用**账号登录**的客户端（ChatGPT Plus/Pro、Claude、ZCode coding plan ……）走 OAuth 认证，且通常**硬编码端点** —— 改不了 baseURL 就没法用前缀方式，这类客户端要用 MITM 模式。

原理：这类客户端只提供 **HTTP 代理**设置，所以它发送 `CONNECT <host>:443`；billion-context 在本地终结 TLS（用本地生成的根 CA），把压缩注入明文，再重新加密转发。OAuth token 随客户端的 `Authorization` 头传输、原样转发 —— 订阅折扣得以保留。

支持的 MITM 客户端：

| 客户端 | 登录方式 | 硬编码端点 | 状态 |
|---|---|---|---|
| **ZCode** | bigmodel coding plan（OAuth） | `open.bigmodel.cn`（内置 provider） | ✅ 已测试 |
| **Claude Code** | Claude 订阅（OAuth） | `api.anthropic.com` | ❓ 未测试（可能不可用 —— 待验证） |
| **CodeBuddy**（VS Code IDE） | IDE 账号登录 | `copilot.tencent.com`（经 `http.proxy` 到达） | ✅ 用户验证（#897） |

> **Codex 例外：** Codex 暴露顶层 `openai_base_url` 配置字段，所以 ChatGPT 登录版**可以**用 `/bili/` 前缀（见上文）。Codex 不需要 MITM。

> **ZCode 原生模式（#1145）：** ZCode 是这张表里唯一同时拥有**原生插件模式**的客户端 —— `bili plugin install zcode` 经 provider store（`~/.zcode/v2/config.json`，v3.14+ 为 `provider_config.json`；v3.14+ 构建上 ZCode 的客户端签名对 coding-plan 账号拒绝 http 回环 origin，这些账号带原因保持直连，其余 provider 照常路由 —— 这些账号上的压缩请用 GUI 证书 MITM 配置，#1621）路由模型流量，其余情况下完全不需要 GUI 代理/CA 设置。原生模式不碰 MITM 面：若两者并用，请保留 GUI 代理设置（以及 `"mitm://zcode.z.ai": { "passthrough": true }` 路由，#661）供登录流量使用。完整机制：[CLIENTS.zh-CN.md](CLIENTS.zh-CN.md)（ZCode）。

MITM 只对一份**白名单**中的模型域名生效（`open.bigmodel.cn`、`api.anthropic.com`、`api.openai.com`、`chatgpt.com`），外加发现机制按 lane 自动播种的自带网关默认域名（如 `opencode.ai` —— opencode `auth login` 的内置 zen 网关，#1405）。其余 HTTPS 主机全部盲转发 —— billion-context 绝不解密非模型流量。

> **只有 `http.proxy` 设置的客户端（CONNECT-only）：** 许多 IDE 系客户端（CodeBuddy、Cursor、Windsurf……）没有模型 base-URL 设置 —— 它们把全部流量经 HTTP 代理以 `CONNECT` 方式发出。这类客户端只有在其模型域名被加进上面的白名单后才会被解密；否则其隧道是**盲**的：不报错，但也**不会压缩**，因为 billion-context 根本看不到明文。该误配置现在会被显式暴露（#897）：每个目标域名的首个盲隧道会在日志打一条一次性 `BLIND TUNNEL WARNING` 并附修复步骤；`GET /__bili/health` 与 `/__bili/stats` 输出 `blindTunnels`（计数 + 精确目标域名，仅 loopback）；存在此类隧道时 `acp_status` 会多一节 `UNDECRYPTED TRAFFIC (instance-level)`。修复：把该客户端的模型域名加进 `"mitm".domains`（或 `BILI_MITM_DOMAINS`），重启，并按下文信任根 CA。注意代理日志默认对非公开目标域名脱敏（`<private-host>`，#255）—— 设 `BILI_LOG_MASK_HOSTS=0` 可在本地日志看到真实域名。

一次性设置（在客户端里信任根 CA）：

1. 启动一次代理以生成根 CA：

   ```bash
   bili start
   ls ~/.local/share/billion-context/ca/root-ca.pem   # 现在存在了
   ```

2. 在客户端的 **设置 → 网络 / 代理** 里设：
   - **HTTP 代理**： `http://127.0.0.1:8787`
   - **代理 CA 证书路径**： 本机 bili 实际生成的 CA 文件 —— Linux/macOS 为 `~/.local/share/billion-context/ca/root-ca.pem`，Windows 为 `%USERPROFILE%\.local\share\billion-context\ca\root-ca.pem`。Web UI「接入」页的 ZCode 卡片直接显示本机实际路径并提供复制按钮，照抄即可。
   - （可选）**No-proxy 列表**： `localhost,127.0.0.1`
   - （ZCode 具体位置：**Settings → Network**。Claude Code 则设 `HTTPS_PROXY` 环境变量、`NODE_EXTRA_CA_CERTS` 指向 CA 路径。）

   > **Windows 注意：** ZCode 在 Windows 上**不会展开 `~`**，填 `~/...` 形式的路径会找不到文件（与当前工作目录无关，每个目录都识别不了）。必须填完整绝对路径，例如 `C:\Users\<用户名>\.local\share\billion-context\ca\root-ca.pem`（#342）。

3. 重启客户端。它的模型流量从此流经 billion-context 并注入压缩。发一条消息，在代理日志（`~/.local/state/billion-context/bili.log`）里找 `mitm <host>:443 tunnel established`。

> 根 CA 在本地生成、只存在于本机 —— **不是**系统级安装。只有你配置的那个客户端（通过它的 CA 路径设置）信任它，其他应用不受影响。删掉 CA 文件并重启代理会重新生成。

要给 MITM 登录客户端配**专属上游代理**（防火墙/GFW）而不影响同一域名上的 API-key 客户端，用 `mitm://` scheme 键 —— 见 [MITM vs `/bili/` key schemes](#mitm-vs-bili-key-schemes)。

---

## 启动器参考

`bili <client>` 在一个独立端口拉起代理（**每次启动都是全新实例** —— 不会复用已在运行的 `bili start`，#216），然后把客户端指向它。**不改动任何配置文件**：启动器只**读取**（绝不编辑）客户端自己的配置来发现它访问哪些上游主机；这些主机自动加入 MITM 白名单。客户端退出时，启动器拉起的代理随之停止。

两种上游方案全自动覆盖，无需配置：

- **HTTPS 上游 → 证书 MITM。** 通过 `HTTPS_PROXY` 把客户端指向代理，并让它信任代理的 MITM 根 CA（`~/.local/share/billion-context/ca/root-ca.pem`，惰性生成）。压缩注入在被拦截的 TLS 流上。
- **HTTP / localhost 上游 → `/bili/` baseURL 重写**（明文没法 MITM）。启动器通过客户端自己的机制重写 base URL，走的是配置的隔离临时副本 —— 真实配置文件一个字节都不碰（见下文）。

各客户端如何被指向代理（自动设置在子进程环境里）：

| 客户端 | 重定向方式 | CA 信任 |
|---|---|---|
| pi | `HTTPS_PROXY` + `BILI_PROVIDER_REWRITES` env 清单（扩展 `registerProvider`） | `NODE_EXTRA_CA_CERTS` |
| omp | `HTTPS_PROXY` + `BILI_PROVIDER_REWRITES` env 清单（扩展 `registerProvider`）+ 用户未设置 `PI_PROXY` / `PI_PROXY_ANTHROPIC` 时的 `PI_PROXY_ANTHROPIC=<proxy>`（将 OMP 的 Cowork anthropic 通道经代理路由而非 node:https 直连，#2583/#3556） | `NODE_EXTRA_CA_CERTS` |
| codex | `HTTPS_PROXY` + `-c key=value` 覆盖 | `SSL_CERT_FILE` → `combined-ca.pem` |
| claude | `ANTHROPIC_BASE_URL` = `/bili/` URL（Vertex：`ANTHROPIC_VERTEX_BASE_URL`，当 `CLAUDE_CODE_USE_VERTEX=1`） | 无需 |
| opencode | `HTTPS_PROXY` + 隔离 `OPENCODE_CONFIG` | `NODE_EXTRA_CA_CERTS` |
| hermes | `HTTPS_PROXY`（明文 http 走 absolute-form 正向代理请求） | `SSL_CERT_FILE` → `combined-ca.pem`（另设旧版 `HERMES_CA_BUNDLE` → `root-ca.pem`） |
| dsh | `HTTPS_PROXY`（明文 http 另加 `HTTP_PROXY`）+ `DEEPSEEK_BASE_URL`；**仅回环**隔离 `DSH_HOME` | `SSL_CERT_FILE` → `combined-ca.pem` |

`NODE_EXTRA_CA_CERTS` 是**追加**到内置信任库，所以只指向 MITM 根证书（`root-ca.pem`）即可。`SSL_CERT_FILE` 会**替换**默认 CA bundle，所以 codex/dsh/hermes 指向 `combined-ca.pem` —— 包含 MITM 根证书**加上**操作系统信任库与 Node 公共根。合并 OS 信任库很关键：部分被启动的客户端把这个文件当作**整个**信任池（codex 的 rustls HTTP 栈是替换而非追加，#1807），它们的直连（不经代理）连接只能靠这个文件校验，因此文件必须是 OS 自身信任集合的超集（Windows 经 PowerShell 读证书库、macOS 经 `security(1)` 读钥匙串；Linux 本就直读文件系统 bundle；最多每 24 小时重建一次）。最初引入该 bundle 是为了让子进程环境里 pip/git/curl 类 TLS（盲转发、真证书）不受影响（#152；hermes 自 #1375 起，因为当前 hermes 只经 `SSL_CERT_FILE` 解析环境信任；OS 信任库合并自 #1807 起）。

Claude Code 的 undici fetch 忽略 `HTTPS_PROXY`，所以证书 MITM 拦不到它。claude 的所有上游 —— 包括预先配置的 `ANTHROPIC_BASE_URL` relay，以及 `CLAUDE_CODE_USE_VERTEX=1` 下的 Vertex 端点 —— 一律改走 `/bili/` URL 形式，通过客户端自己的 base URL 变量下发；无需任何 CA 信任。

上游从哪里发现（只读）：

| 客户端 | 读取位置 |
|---|---|
| Pi | `~/.pi/agent/models.json` —— 各 provider 的 `baseUrl` |
| omp | `~/.omp/agent/models.yml` —— 各 provider 的 `baseUrl` |
| Codex | `~/.codex/config.toml` —— 各 `[model_providers.<name>]` 的 `base_url`（+ 顶层 `openai_base_url`） |
| Claude Code | `ANTHROPIC_BASE_URL` 环境变量；`CLAUDE_CODE_USE_VERTEX=1` 时用由 `ANTHROPIC_VERTEX_BASE_URL` / `CLOUD_ML_REGION` 推导出的 Vertex 主机名，否则硬编码 `api.anthropic.com` |
| OpenCode | `~/.config/opencode/opencode.json` —— 各 provider 的 `baseURL` |
| hermes | `~/.hermes/config.yaml` —— 各 provider 的端点行 |
| dsh | `~/.dsh/settings.yaml` —— 每个 `baseURL`/`baseUrl`/`base_url` 值，按目的地分流（回环 → `/bili/` 重写；非回环 https → MITM 白名单；非回环 http → `HTTP_PROXY`）；内置 `deepseek-official` 路由另经 `$DEEPSEEK_BASE_URL` 接管 |

### 生成文件（写了什么 —— 最后手段，#535）

启动器优先零文件注入（env > CLI 参数/扩展 API > 生成文件；见 [TECHNICAL-NOTES.zh-CN.md —— 注入优先级](TECHNICAL-NOTES.zh-CN.md)）。确实绕不开文件时写的都是**副本** —— 真实配置绝不编辑：

- **pi / omp** —— 不写任何文件（#535）：provider baseUrl 走 `BILI_PROVIDER_REWRITES` env 清单，由 bili 扩展加载时消费（`registerProvider`）；自动原生压缩改由扩展内取消（`session_before_compact`，omp 按 `auto_compaction_start` 预告区分自动/手动，#851）——但仅在代理确实承载该会话有正证据时才取消（插件已为该会话 id 盖章 `x-bili-plugin-conversation`、omp 身份注册成功、或 `/__bili/plugin/status?conversationId=` 确认）；非 http(s) 的 provider baseUrl（如 pi-claude-bridge 的字面量 `"claude-bridge"`）默认永不取消，其自带的压缩接管继续生效（#1382）；可通过 `providers` 表里该 provider 的条目显式放行 —— 键 = provider id（非 URL 键对路由惰性无效），字段 `"compactionOptIn": true` —— 或 `BILI_NON_HTTP_PROVIDERS`（env，逗号分隔）—— 但放行只是扩大候选集，被放行的 provider 仍需上述同样的正证据才会被取消（#1392）——手动 `/compact` 无论如何都保持用户所有。真实 `~/.pi` / `~/.omp` 主目录原样不动。
- **opencode** —— 临时 `opencode.json`（由 `OPENCODE_CONFIG` 指向，客户端退出时删除），明文 `baseURL` 重写为 `/bili/` 形式，**并追加了薄插件**（`/acp` + `/acp-cache` 命令）。OpenCode 1.x 下 `opencode-acp` 条目会从副本中移除（主机不得以激活状态加载它），改由薄插件把同一个包作为库导入、仅对 legacy 会话生效；首个被移除的 spec 经 `BILI_OPENCODE_ACP_SPEC` 传递，保证 bridge 导入的正是主机本会加载的那份拷贝（#920）。
- **hermes** —— 不写任何文件（#535）：其 httpx 栈走 `HTTPS_PROXY`（+ `SSL_CERT_FILE` → `combined-ca.pem`；旧版 `HERMES_CA_BUNDLE` 保留设置，#1375）—— https 经 CONNECT 证书 MITM，明文 http 经 absolute-form 正向代理请求。若没配置任何 provider，启动器打印警告，hermes 将**不经代理**运行（无压缩）。
- **dsh** —— 按目的地分流（#535）：dsh 的 fetch 栈尊重代理 env，但对回环目标无条件绕过，所以**非回环**上游走 `HTTPS_PROXY`（证书 MITM）/ `HTTP_PROXY`（absolute-form 正向代理请求），`SSL_CERT_FILE` → `combined-ca.pem`；仅**回环**上游保留持久 overlay `DSH_HOME`（`~/.dsh-bili`），重写后的 `settings.yaml` 让它们走 `/bili/`。`profiles/`、凭据、会话符号链接共享；真实 `~/.dsh` 绝不触碰。home 顶层的 SQLite 数据库是唯一不共享的例外：每次启动在 overlay 内私有拷贝，退出时作为整体合并回去（文件链接的主库会让两条路径在同一 inode 上长出互不协调的 WAL —— #1917）。内置 `deepseek-official` 路由另行经 `$DEEPSEEK_BASE_URL` 接管（dsh 解析顺序为 settings `llm-deepseek.baseURL` ?? 环境变量 ?? 默认值，用户配置优先，环境变量作零配置兜底）—— 即便没有任何自定义 provider，内置 deepseek 路由也照样走代理。
- **codex** —— 持久 overlay `CODEX_HOME`（`~/.codex-bili`，或 `<CODEX_HOME>-bili`），其余条目（凭据、会话、模型设置）保持指向真实主目录的共享链接。例外是 home 顶层的 SQLite 数据库（`*.db` / `*.sqlite` / `*.sqlite3` —— codex 的日志/状态库都在这里）：每次启动在 overlay 内私有拷贝，退出时作为**一个整体**合并回真实主目录（较新的主库代际胜出，败者完整保留为 `<name>.bili-conflict`）。把这些库文件链接到两个 home 之间会让两条路径在同一 inode 上长出互不协调的 WAL —— 已提交写入丢失或数据库损坏（#1917）。两个生成文件：(a) MCP 注入开启时，合并后的 `config.toml` —— 真实内容加上每次启动的 `[mcp_servers.bili]` 块（内联 `-c` 值在 Windows cmd.exe 引号处理下无法存活，#681）；(b) #1802 起，生成的 `.env`（权限 0600），把**本次启动**的 `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` / `NO_PROXY` / `SSL_CERT_FILE` / `BILLION_CONTEXT_PROXY` 重新钉死：codex 自己的 `load_dotenv()` 会在启动**之后**用 `$CODEX_HOME/.env` 覆盖启动器注入的环境变量，否则用户 `.env` 里指向 socks5h 之类的代理会悄悄把 codex 重新路由出 bili（且 codex 自定义 CA 的 rustls HTTP 栈根本不支持 SOCKS）。你 `.env` 里的其他变量逐行原样保留；既有的共享 `.env` 链接会迁移为自有文件；真实主目录的 `.env` 及其他所有文件绝不触碰。direct-URL 模式（`BILI_LAUNCHER_DIRECT=1`）不生成 `.env`（没有需要保护的注入代理），且未开 MCP 时连 overlay 都不建。

### 启动器里的原生工具

- **pi** —— 未安装插件时，启动器借用 pi 的 `-e <file>` 参数为本次运行加载 `dist/agent/pi.js`（不写任何东西）：开箱即原生工具 + `/acp`、`/acp-cache` 与 `/acp-rule` 命令（`/acp-cache` 默认总账摘要 —— 总计、判定、异常行；追加 `full`（或 `--full`）看全量明细，等价于 `acp_cache` 工具传 `detail: "full"`）。已安装则符号链接的 `settings.json` 已加载它 —— 不再加 `-e`。
- **omp** —— 发行版不自带插件；启动器在配置里没有可加载的 bili 条目时自动注入 `-e dist/agent/omp.js`（与 pi 相同的零配置搭车）。两个 omp 专属机制让插件在那里完全原生：omp 17.x 会把未声明 `loadMode` 的扩展工具挂到 `xd://` 设备 URL 下（模型主回合看不到），插件因此用 `loadMode: "essential"` 注册 —— 模型直接拿到四个 ACP 原生工具；omp 分叉不发 `before_provider_headers`，插件改走启动器身份注册（`POST /__bili/plugin/register`，以 omp 会话 id = `prompt_cache_key`/`x-session-id` 为键）绑定会话 —— 绑定后的会话进入插件模式（抑制 wire 注入）并带有原生 `/acp`、`/acp-cache` 与 `/acp-rule` 命令。
- **opencode** —— 临时配置自动追加薄插件。
- **claude / codex** —— 默认开启：启动器注入单个 `bili` MCP 服务器（claude 用临时 `--mcp-config` 文件；codex 的定义写在 overlay 生成的 `config.toml` 里，见[生成文件](#生成文件写了什么----最后手段--535) —— 两种情况都不写真实宿主配置），开箱即原生工具（已在 claude 2.1.227 / codex 0.147.0 验证）。`BILI_LAUNCHER_PLUGIN=0` 退回纯 wire 模式 —— 适用于早于已验证版本、未针对注入参数测试的宿主。
- **codex + 自建上游自动回退** —— codex 0.147 把 MCP 工具以 `namespace` 工具类型发给模型；自建推理服务（sglang/vllm/ollama/llama.cpp）不解析该类型，工具会静默失明。当 codex 上游主机是环回/私网地址（`127.0.0.1`、RFC1918、ULA、`.local` 等）且未设置 `BILI_LAUNCHER_PLUGIN` 时，bili 自动改用 wire 模式（扁平工具，所有服务都认识）并在 stderr 说明。`BILI_LAUNCHER_PLUGIN=1` 可强制插件模式。
- **hermes** —— 无插件 API；永远 wire 模式。
- **dsh** —— 启动器始终在 dsh 的 argv 里拼接 `--patch <file>`（写入 `~/.dsh-bili/.bili-acp.patch.yml`），把 `dist/agent/dsh-acp.js` 插进 profile 的加载树：原生 `/acp` 与 `/acp-cache` 命令，与 dsh 自带 `/compact` 同一形态（`/acp-cache` 显示默认总账摘要 —— dsh 的命令 API 不传参数，因此没有 `full`）。在任何组合了 commands 服务的 profile（web/tui 交互表面）都可用；`headless` 一次性驱动器把任务直接发给模型、不解析命令（原生 `/compact` 在那里同样不可用）。子命令形态已处理：`dsh web` 的 flag 插在 `web` 之后，`dsh plugin`/`--dump-default-config` 不注入。

启动器模式矩阵：

| 模式 | 工具形态 | 设置 |
|---|---|---|
| 启动器 + MCP（claude/codex 默认） | 原生 MCP 工具 | 无 —— `bili claude` / `bili codex` 即可 |
| 启动器 wire 模式（claude/codex，`BILI_LAUNCHER_PLUGIN=0`） | 代理注入的 wire 工具 | 一个环境变量 |
| 启动器 `-e` / 自动插件（pi、omp、opencode） | 原生插件工具 | 无 |
| 手动插件（`bili plugin install`） | 客户端侧插件 | 执行 install |
| 手动 baseURL（`/bili/` 前缀） | 代理注入的 wire 工具 | 改客户端配置 |

### 直连 URL 模式（可选）

`BILI_LAUNCHER_DIRECT=1` 彻底放弃 MITM/CA 信任 —— claude 的 `ANTHROPIC_BASE_URL` / codex 的 provider `base_url` 直接指向 `/bili/` 前缀。警告：

- **codex 直连模式**：LLM 流量**不**经过代理，压缩不生效 —— 只有 bili MCP 工具调用经过。要完整压缩请用默认 MITM 模式（不设 `BILI_LAUNCHER_DIRECT`）。
- **claude 直连模式**：`ANTHROPIC_BASE_URL` 被覆盖指向代理；预先配置的 relay 被旁路，除非设 `BILI_CLAUDE_UPSTREAM=<relay>`。OAuth 订阅流量需要默认 MITM 模式。

`--mitm-domain <domain>`（可重复）在自动发现之外追加 MITM 白名单域名 —— 适用于客户端在运行时才获取、不写进配置文件的主机。默认端口被占用时启动器自动换空闲端口；`--passthrough` / `--debug` / `--no-auto-update` 与普通 `bili` 用法相同。

---

## 插件模式（原生工具）

想要原生插件体验，可以在客户端里装一个配合代理的插件：插件把四个 ACP 工具（`compress` / `decompress` / `search_context` / `acp_status`）原生注册进客户端、由客户端自己的工具循环驱动，而代理仍然是压缩引擎（状态、历史折叠、压缩哲学 prompt、nudge 全归代理）。工具 schema 由代理统一下发（`GET /__bili/plugin/manifest`），插件与代理永远不会版本漂移。协议规范见 [PLUGIN.md](PLUGIN.md)。

带插件的会话通过请求头自动识别 —— 该会话的 wire 层工具注入自动关闭（不会双重压缩，工具体验原生）。两种代理模式都支持：`/bili/` 前缀 baseURL **和** MITM 透明模式。插件还可以上报客户端自己的模型上下文窗口（`x-bili-plugin-context-window`），并通过 `GET /__bili/plugin/status` 读取实时上下文水位。

### install / remove / list

```bash
bili plugin install pi      # 把本 billion-context 安装加入 pi 的 settings.json（packages）
bili plugin install omp     # omp 同理（config.yml extensions）
bili plugin install claude  # 注册 bili MCP 服务器（claude mcp add，user 作用域）+ 写入
                                   # <configdir>/commands/acp-cache.md（模型中介的 /acp-cache）
bili plugin install codex   # 向 ~/.codex/config.toml 追加 [mcp_servers.bili]
bili plugin install opencode  # 向 ~/.config/opencode/opencode.json 加 mcp.bili
bili plugin list            # 所有受支持宿主的安装状态
bili plugin remove pi       # 撤销（原文件一次性备份为 *.bili-bak）
```

`install pi` 还会替换**遗留的** billion-context 条目（旧的 `npm:billion-context-pi` 引用、过期的 `npm:billion-context@x.y.z`、残留的 dev 目录路径），确保只有恰好一个 bili 插件在生效。

安装的插件是**薄**插件（约 5 KB，零运行时依赖）：它检测代理（从 `/bili/` baseURL 或 `BILLION_CONTEXT_PROXY`）、从代理拉取工具 schema、注册原生工具、转发执行 —— 代理始终是唯一的压缩引擎，所以插件与代理永远版本一致。没有插件 API 的宿主（claude、codex）改装 MCP 桥 —— claude 装 `dist/claude-mcp-entry.js`（同一桥加会话内代理守护，lane 代理死亡时自动重生，#1821），codex 装纯 `dist/mcp.js` —— 底层协议相同，但 MCP 没有斜杠命令（没有 `/acp`；claude 额外获得模型中介的 `/acp-cache` markdown 命令，写入 `<configdir>/commands/acp-cache.md`，其提示词驱动 `acp_cache` MCP 工具 —— 模型把报告原样贴回）。

总开关：`BILLION_CONTEXT_PLUGIN=0` 彻底关闭插件模式（恢复 wire 层注入）。

**到底什么时候需要 `plugin install`？** 用启动器的基本都不需要（见[启动器参考](#启动器参考) —— pi/omp 自动 `-e`、opencode 自动注入、claude/codex 自动注入 MCP、dsh 经 `--patch` 自动获得原生 `/acp` 与 `/acp-cache` 命令、hermes 只能 wire）。它适用于手动配置客户端（`/bili/` 前缀或 MITM）又想要原生面板的场景：pi/omp/opencode 装后获得原生工具 + `/acp` 与 `/acp-cache`（pi/omp 另加 `/acp-rule`）；claude/codex 获得原生 MCP 工具（无 `/acp`；claude 获得模型中介的 `/acp-cache`）；dsh 的 `/acp` 与 `/acp-cache` 由启动器 `--patch` 注入（手动配置的 dsh 可自行添加同一 patch）；hermes 装不了（只能 wire）。不装任何插件一切照常工作 —— 压缩走 wire 注入的工具，让模型调 `acp_status` 即可查看实时用量。

### 检测其他压缩插件（#1206）

两个压缩器作用于同一会话会双压缩、破坏消息引用，所以 bili 会主动查找与自己并存的另一个压缩器：

- **扫描**（只读、尽力而为、5 分钟缓存）：opencode 全局 + 项目配置的 `plugin` 数组；pi 全局 + 项目 `.pi/settings.json` 的 `packages`；omp `config.yml` 的 `extensions`；claude 设置的 `enabledPlugins`/`plugins` 键 + `~/.claude/plugins/` 目录；kimi `plugins/installed.json`；hermes `~/.hermes/plugins/` 目录；dsh profile 的 `package.json` 依赖。两个层级：**已知冲突**（`opencode-acp`、遗留 `billion-context-pi`，确定性判定）和**关键词疑似**条目（名称匹配 compress* / compact* / acp / summar*；裸 `context` 刻意不匹配——它指领域而非压缩动作本身，`context7`/`dsh-context` 这类只读工具不会误报）；已验证的只读/仅显示插件（如 `pi-compact-transcript`、`pi-context-inspector`）直接豁免。
- **发现结果的出口**：客户端启动前的 launcher stderr；每个会话首个请求的一次性代理 warn 日志（client 由 `x-bili-plugin` 头或 wire 头识别）；会话冲突台账 —— `acp_status` 的 `COMPRESSION CONFLICTS` 段、`GET /__bili/stats` → `conflicts`、Web UI 横幅。
- **运行时证据，按证据层级展示（#2545）**：未宣告的历史改写（#1001）与孤儿块废弃（被摘要的内容从客户端历史中被删掉）与「疑似并存」记入同一台账。严重程度表面按**证据层级**分级：**已确认** = 检测到的客户端原生压缩落点（bili 会 rebase 到其上，#2372/#2432）或非 suspected 的插件发现——只有它会触发「请只保留一个压缩器」的强制告警；**未确认信号** = 未宣告改写 + 孤儿块废弃——观测到变化但原因未确认（「历史发生了变化，原因未知」），绝不呈现为原生自动压缩或第二个压缩器；纯名称匹配的 [suspected] 停留在软性的「先核实」层级（#1736）。指向已验证只读插件的存量台账记录在显示期被中和，而不是持续作为告警残留；跨会话聚合的未确认信号计数永远不会升级成「同一会话双压缩」的结论。
- **dsh 的 `auto: false` 只关闭自动触发**。profile bundle patch（`dsh.bundle.patch.yml`）写入的 `compaction-basic: { auto: false }` 跳过压力/溢出自压缩 —— 手动 `/compact`（以及空闲会话压缩）仍会触发。经 bili 路由的调用会被服务端闸门拒绝（#1729/#2360）；未经过 bili 直达上游的调用（桌面端插件接管门无法归因的路径）会落地，bili 在下次重放时检测出来（checkpoint 框架 + 折叠覆盖缺口），一个 turn 内重建自己的压缩状态，而不是让之后每次 compress 永久失败（#2432）。若目标是把 dsh 压缩**整个关掉**（含手动 `/compact`），delta 应写成同一行上的 `disabled: true`，而不是 `auto: false`（配方见下）。

 #### 在 web profile 下关掉 dsh 原生自动压缩（#1772/#3354，#3354 起自动；#2474 配方为回退）

 **#3354 起自动完成。** 在 bundles 含 `@deepseek-ai/dsh-web-app` 的 profile 里，真正运行的 compaction-basic 实例位于 agent preset（`preset-standard.config.plugins`）内部，任何 patch 层都无法按 id 直寻那条嵌套行（#1772）—— 随包的 `- id: compaction-basic` 行落在 web-app 已禁用的宿主平面行上、什么都没改。bili 现在在**加载期**补上这一环：一个**常驻**的 bundle 条目 `bili-compaction-gate`（与 `bili-native` 并列的独立 cordis 条目，由同一组 patch 层挂载，因此 `bili-native` 被禁用或 kill-switch 时它仍然存活，#3662）注册一个 cordis `internal/config` overlay（移植自 [deshark42/dsh-compaction-basic-disable](https://github.com/deshark42/dsh-compaction-basic-disable)，MIT），在 bili 持有该泳道期间把 preset 里的 `compaction-basic` 与 `command-compact` 行标记为 `disabled: true`；`dsh.bundle.patch.yml` / 启动器 overlay 里的 preset 门控行让每个 Web preset 在注册前等待该 overlay 的服务。这些 profile 里原生自动压缩无需任何用户操作即关闭；ACP 压缩不受影响。

 overlay 依赖 dsh 的内部钩子，对版本敏感。若在新/旧 dsh 构建上仍见到 dsh 压缩 checkpoint 落地，用下面的回退配方。

 **禁用与移除的区别（#3662）。** 禁用 `bili-native`（dsh 插件管理器或 patch 层里的 `disabled: true`）不再会导致会话创建被「砖」：门控服务存活在独立的常驻条目 `bili-compaction-gate` 里，preset 回落到**原生**自动压缩而不是永久 pending —— 压缩关闭、dsh 完全可用。请勿禁用 `bili-compaction-gate` 本身（那会重新造成「砖」）；要彻底卸载，从 profile 的 `dsh.profile.bundles` 移除 `billion-context` 后重启。卡在 #3662 之前版本且已被禁用的安装，升级即自愈；手动解砖是在 `$DSH_HOME/cordis.patch.yml`（HOME 层；默认 `~/.dsh/cordis.patch.yml`）追加 `- id: preset-standard` / `preset-ptc` / `preset-minimal` / `preset-cordis`，各配 `inject: null` —— 顶层键为整体替换，清掉 pending 锁。

 **回退配方（#2474）**（已在 dsh `0.2.1-alpha.1`、Windows 11、bundles 含 `@deepseek-ai/dsh-web-app` 的 profile 上实测）。profile 层补丁可以关掉它 —— preset 是 bundle 层插入的普通顶层条目，而 profile 补丁层在其之后应用。不能用「按 id 定位嵌套行」的写法，可行的是**整体覆盖 preset 行的 `config`**。

```bash
# 1. dump 组合后的 profile，复制 preset-standard 的完整 config 块
dsh --profile <name> --dump-config > /tmp/profile.yml
```

2. 往 `$DSH_HOME/profiles/<name>/cordis.patch.yml` 追加一条 `preset-standard`，`config` 用上一步 dump 出的**完整内容**（每一个 `plugins` 条目逐字节照抄），只在 `compaction` 组里做一处改动。两种写法：

    - **强（推荐，#3235）：停用组件** —— 在嵌套的 `compaction-basic` 行上设 `disabled: true`。这是 dsh 自己在宿主层用的机制；插件整个关闭（运行状态不再是「运行中」），压力触发与手动触发都不可能再从它发出。
    - **弱：保留加载但关闭自动触发** —— 改为在该行下加 `config: { auto: false }`。自动压力压缩关掉，但手动 `/compact` 与 tool-result pruner 仍然开着，组件仍在运行。

```yaml
- id: preset-standard
  name: '@deepseek-ai/dsh-agent-preset'
  config:
    id: standard
    order: 1
    plugins:
      # … dump 出的全部条目，原样照抄 …
      - id: compaction
        name: cordis:group
        group: true
        isolate:
          compaction: true
          toolResultPruner: true
        config:
          - id: compaction-basic
            name: '@deepseek-ai/dsh-compaction-basic'
            disabled: true           # ← 强变体：唯一改动
            # config: { auto: false }  # ← 想要弱变体时改用这个
          - id: command-compact
            name: '@deepseek-ai/dsh-command-compact'
          - id: tool-result-pruner
            name: '@deepseek-ai/dsh-compaction-tool-result-pruner'
            config:
              thresholdChars: 8192
              headChars: 4096
              tailChars: 1024
      # … 其余条目原样照抄 …
```

3. 用之前先核对：`dsh --profile <name> --dump-config | grep -A2 'id: compaction-basic'` —— `preset-standard` 的条目数必须**不变**，且嵌套行现在带上了 `disabled: true`（或 `config.auto: false`）。

压力/溢出自动压缩关掉（强变体则是整个组件一起关）；弱变体下手动 `/compact` 与 tool-result pruner 保留。**`preset-ptc` 与 `preset-cordis` 也要按同样形状各覆盖一份**——切换会话模式会重新解析 preset，那里留着的启用压缩行会在 `preset-standard` 打补丁后让原生压缩复活（`preset-minimal` 没有 `compaction` 组）。

**三种错法 —— 全都静默**（同一份 dump 上实测）：

| 补丁写法 | 结果 |
|---|---|
| `- id: preset-standard.compaction.compaction-basic` | `patch: entry "…" not found`；**无任何效果** |
| `- id: preset-standard` + 只写部分 `config.plugins` | `config` 是**替换而非合并** —— preset 塌缩成你写的那几项（实测 35 → 3）：persona、工具全没了 |
| `- insert:` + `id: preset-standard` | 在树末尾**追加第二条** `preset-standard`；真正运行的 preset 未被修改 |
| 完整 `config` 快照 + 一处 `disabled: true` | ✅ 条目数不变，唯一差异是 `disabled: true` |

**快照会冻结在你复制的那个 dsh 版本上。** 与 bundle 层补丁不同，profile 层的 `config` 是一份时点拷贝：dsh 升级后若增删或调整了内置 preset 里的行，这份覆盖仍会继续供应旧名单 —— 上游新加的插件不会静默加载。请重新执行第 1 步，把新的 `preset-standard` 段与补丁里的那份做 diff，只要该段有变化就整段重抄一次。若不想维护这份快照，那就保持原生自动压缩开启，让 #1729/#2432 的 rebase 路径去处理两者的相互作用。

部分覆盖失败时没有任何诊断信息，所以改完务必重新 dump 并比对条目数。
- opencode launcher/native 模式下已存在的 `opencode-acp` 按设计只记 info（#920 有意吸收它处理 legacy 会话）；其他场景一律告警。
- 关闭方式：`BILI_CONFLICT_SCAN=0`。

---

## 会话与迁移

### 压缩状态存在代理里（#151）

压缩状态（块、摘要、原始消息缓存）存在**代理**里，不在客户端。客户端自己的本地历史是完整的未压缩视图。两个后果：

- 把客户端指回真实上游（或停掉代理）后，客户端每轮重放**完整本地历史**。长压缩会话之后这很容易超出模型上下文窗口（`context_window_exceeded`）。
- 没有办法把压缩块「解包」回客户端本地历史 —— 客户端从未见过压缩形态。

### 从代理迁移出去

导出会话，粘贴到新会话里作为交接：

```bash
bili export                      # 列出持久化会话（id、标签、块数）
bili export <id|label>           # 打印 Markdown 交接文档（块摘要）
bili export <id> --full          # 附上每个块的原始消息
bili export <id> --full --output handoff.md
```

然后在客户端里开一个新会话（直连上游），把交接文档粘贴为开场上下文。

### Codex 子代理有独立压缩命名空间（#150）

Codex 子代理（如 `guardian_subagent` 审批 reviewer）复用主会话的 `session_id`，在线路上看起来是同一个会话。若不处理，子代理请求会继承主会话的压缩状态 —— 子代理轮次的上下文可能被折叠（丢失它必须逐字读取的用户授权），两个角色的用量估算也会互相污染。

billion-context 通过 `instructions` 字段识别：子代理请求带自己的角色 prompt。会话**首次**看到的 instructions 锚定主命名空间（即使主 prompt 后来漂移也稳定）；任何其他 instructions 值映射到独立的 `|sub:` 命名空间，拥有自己的空白压缩状态。子代理请求是自包含重放，所以新命名空间无损 —— Web UI 的会话列表会把两个命名空间显示为共享同一客户端标签的独立会话。

这个锚定不只对 Codex / Claude Code 成立——但分裂是有意的、按客户端启用的：只有流量已被证实「同一个会话 id 盖在多个角色上、每个角色在该 id 下带自己的 system prompt」的客户端才启用，目前是 Codex、Claude Code 与 DeepSeek Harness。其他客户端的 system prompt 中途变化意味着「同一会话、提示词演进」，仍留在主命名空间。一个非 Claude 的实例是启用了 `@deepseek-ai/dsh-experimental-auto-review` 的 DeepSeek Harness：reviewer 在每次待执行工具调用前用自己的小块固定 system prompt（约 1 KB；`ENVIRONMENT` / `PROJECT_INSTRUCTIONS` / `FILTERED_HISTORY` / `PENDING_ACTION` 四节走的是它的 user 轮）发一次请求，于是它的会话行与主对话并排出现，同样显示「运行中」。

四个读数可以在不读代码的情况下认出这类车道：

| 读数 | 主对话 | 评审 / 子代理车道 |
| --- | --- | --- |
| system prompt | 完整提示词（数十 KB） | 很小（约 1 KB） |
| 压缩次数 | 随时间增长 | 0 |
| 请求数 | 大致每轮一次 | 大致每次工具调用一次 |
| 缓存命中率 | 因场景而异 | 约 99.9%（前缀稳定，只有待执行动作在变） |

### Windows：把会话目录加入杀软排除项（#362）

billion-context 把每个会话的压缩状态持久化为会话目录（默认 `%USERPROFILE%\.local\share\billion-context\`）下「一会话一 JSON 文件」，长会话每一轮都会重写该文件。在 Windows 上，实时杀毒（Windows Defender）、搜索索引器或同步工具（OneDrive）可能在写入中途锁住该目录。当锁跨多次写入持续时，rename 会以 `EPERM` 失败，在锁解除前该会话的每次持久化都会失败。

同样的环境故障也可能直接拒绝打开统一存储索引本身:当 SQLite 打不开 `%USERPROFILE%\.local\share\billion-context\sessions\index.db`(`unable to open database file` / SQLITE_CANTOPEN,#3823)时,存储降级为 legacy-only,降级告警与诊断信息会把这条排除项列为第一嫌疑(另两个嫌疑是 OneDrive 占位文件和超过 260 字符的路径)。

当同一会话连续 N 次写失败（默认 `5`，可用 `BILI_PERSIST_EPERM_ALERT_THRESHOLD` 调整）时，代理会打一条**一次性、可操作**的告警，明确指出要排除的目录。它不会重复刷屏（设 `BILI_PERSIST_EPERM_ALERT_REPEAT_MS > 0` 可在失败持续期间最多每 M 分钟重复一次）。

要从根上止住失败，把会话目录加入杀软排除项，并确保它不在任何同步文件夹内：

1. **Windows Defender 排除项：** 设置 → 隐私和安全性 → Windows 安全中心 → 病毒和威胁防护 → 管理设置 → **排除项** → **添加排除** → *文件夹* → 选择 `%USERPROFILE%\.local\share\billion-context\`。
2. **不要同步该目录。** 确认 OneDrive（或 Dropbox / Google Drive 等）没有同步 `%USERPROFILE%\.local\share\billion-context\`。若它位于同步文件夹下，用 `BILI_SESSIONS_DIR` 把它迁到非同步路径。

高频 persist 写入否则会在每一轮反复触发实时扫描 —— 这正是产生 `EPERM` 写失败的原因。目录加入排除项后，告警即止。

### Windows:node 运行时被打了 Low 完整性标签(NTFS mandatory integrity)(#5154)

上面各节都假设问题出在*文件*上。#5154 发现了相反的形态:**Node 运行时本身**(`node.exe`)带着 **Low 强制完整性标签**,进程因此是 Low 完整性级别,*对 Medium 级文件的每一次写入*——CA bundle 重建、`index.db`、会话信封——都以 `EPERM` 失败,而所有 ACL 检查全部通过。标签通常靠**继承**而来:某个父目录曾被 `icacls <dir> /setintegritylevel "(OI)(CI)Low" /T` 之类的命令打过 Low `(OI)(CI)` 标签,之后放进该目录的每个文件都会被盖上 Low,且重启不消失。这正是「崩溃循环但看不到原因」一类启动故障的机制(#5096)。

bili 启动时会对自身运行时探测一次标签(对 `process.execPath` 跑 `icacls`),发现 Low/Untrusted 就打一条醒目的 `[integrity]` 告警——不阻断,代理继续运行。

手工检查与修复(用管理员权限运行;务必用**绝对路径**——某些 PowerShell/cmd 环境下 `icacls` 的 PATH 解析会失败):

```bat
:: 找 "Mandatory Label\Low Mandatory Level" 这一行(没有 Mandatory Label 行 = 无标签 = 正常)
C:\Windows\System32\icacls.exe "C:\Program Files\nodejs\node.exe"

:: 把运行时恢复为 Medium(这就是修复;再用上一条命令验证)
C:\Windows\System32\icacls.exe "C:\Program Files\nodejs\node.exe" /setintegritylevel Medium
```

若标签带 `(I)`(继承)标记,说明**父目录**才是源头:只修目录**根、不递归**——`icacls "<目录>" /setintegritylevel Medium`,**不加 `/T`**。新建/重建的子项会继承出「(no label)」并收敛;`/T` 只是白扫几千个文件。不确定时先用 `icacls "<目录>" /save acl.txt` 备份当前 ACL。

**不要**用「把 billion-context 数据目录打成 Low」来修——方向反了,只会更糟(对比 #3823 与 #5154:文件变成只有 Low 进程可写,到处撞完整性天花板)。

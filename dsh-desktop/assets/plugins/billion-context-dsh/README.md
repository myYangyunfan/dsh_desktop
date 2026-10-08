# billion-context-dsh

[中文](./README.md) | [English](./README.en.md)

> **⚠️ 测试版声明——请勿用于生产环境**
> 本项目（**v0.2.26**）仍处于开发中的测试版。[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 本身也处于**公开测试版**阶段。**请勿将两者用于工程化 / 生产环境**——预期会有破坏性变更与粗糙之处。

<p align="center">
<strong>衷心感谢以下项目——请给它们一个 ⭐：</strong>
<br />
<a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness</a> ·
<a href="https://github.com/ranxianglei/billion-context-pi">billion-context-pi</a> ·
<a href="https://github.com/ranxianglei/acp-kernel">acp-kernel</a> ·
<a href="https://github.com/ranxianglei/opencode-acp">opencode-acp</a>
</p>

<p align="center">
<strong>Billion-Context</strong> for <a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness</a>
<br />
由模型决定<em>何时</em>压缩、<em>压缩什么</em>——而不是一个硬性上限。
</p>

---

<p align="center">
<a href="https://www.npmjs.com/package/billion-context-dsh"><img src="https://img.shields.io/npm/v/billion-context-dsh.svg?style=flat-square" alt="npm"></a>
<a href="https://github.com/Tyan66666/billion-context-dsh/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/billion-context-dsh.svg?style=flat-square" alt="license"></a>
<a href="https://github.com/Tyan66666/billion-context-dsh"><img src="https://img.shields.io/badge/GitHub-Tyan66666%2Fbillion--context--dsh-181717?style=flat-square&logo=github" alt="GitHub"></a>
<a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/topic-dsh--plugin-blue?style=flat-square" alt="dsh-plugin"></a>
</p>

<p align="center">
<code>npm install billion-context-dsh</code>
</p>

---

## 为什么？

当对话变长，模型会耗尽上下文。多数工具直接硬截断——悄悄丢弃早期消息。**billion-context-dsh** 给模型一个 `compress` 工具：由 LLM 决定**何时**、**压缩什么**，写成高保真摘要，保留关键细节（文件路径、决策、错误信息）的同时回收上下文空间。

与 DSH 内置的自动压缩（用自动生成的摘要替换一段范围）不同，billion-context-dsh：

- **模型驱动** —— 摘要由模型自己书写，没有第二次 LLM 摘要调用
- **只建议、不强令** —— 自动策略只 *nudge*（提醒），是否压缩、何时压缩由模型决定（唯一的例外：provider 确认的上下文超窗会让引擎自己抢救一次——见配置表的 `maxOverflowRetries`）
- **持久且可恢复** —— 压缩范围成为 checkpoint 节点，原文保留在 append-only 会话日志中；`decompress` 可恢复，`search_context` 可在块内查找
- **长任务稳得住** —— 每一步都接着前面的成果走，关键结论持续可用、不断叠加，超长任务更容易跑完
- **上下文始终精简** —— 每次请求都只用少量、精炼的上下文，只保留关键信息；不做大段统一压缩，细节不随之衰失，token 消耗自然更低

这是 [billion-context-pi](https://github.com/ranxianglei/billion-context-pi)（Pi 编码代理适配器）在 DeepSeek Harness 上的移植：压缩内核（[acp-kernel](https://github.com/ranxianglei/acp-kernel)）原样复用，适配层针对 DSH 的 durable-surface 模型重写——经过验证的映射关系见 [docs](https://github.com/Tyan66666/billion-context-dsh/tree/main/docs)。

## 安装

> 💡 **想让 DeepSeek Harness 帮你装？** 本仓库本身就运行在 DSH 上：把
> [docs/INSTALL.md](docs/INSTALL.md) 交给会话里的 agent，它会读取指南、解析
> 你的 profile、编辑组合配置并验证挂载。前提：① 配置写在 `~/.dsh` 下，需要
> 你批准一次文件权限；② 装完让它调用 `acp_status` 自证。

**方式一（推荐）：DSH 商店 / `dsh plugin` 一键装（bundle）——装完即全局生效，零配置。**

在 DSH 的插件商店里点安装，或命令行执行：

```bash
dsh plugin --profile web add billion-context-dsh
```

命令内部会装包并把本包的 bundle 补丁（[cordis.patch.yml](cordis.patch.yml)）自动挂进该 profile 的层栈。补丁做了两件事：

- **禁用 host 的 `compaction-basic`**——避免同一 realm 内两个后端同时注册 `ctx.compaction` 冲突（现代 DSH 的 web bundle 已自带该禁用，此行为幂等兜底，任何受支持版本下都成立）；
- **把 ACP 引擎挂到 host 平面**——四种模型工具（`compress` / `decompress` / `search_context` / `acp_status`）、`/acp-prune` 命令、nudge、ACP 提示词段对该 profile 的**所有模式**（standard / code / minimal / cordis / 自定义预设）生效。窗口自动探测、工具/命令/nudge 默认全开，**无需任何手工配置**。

装完**重启 `dsh`**（bundle 层在启动时组合），新开会话即可用——让模型调用 `acp_status` 或执行 `/acp-prune status` 自证。shipped 预设（standard / code / cordis）内部的 realm 级 `compaction-basic` 自动压缩兜底仍然保留（这些模式里"自动摘要"照旧，ACP 工具与 nudge 并存）；minimal 等不带 compaction realm 的预设直接使用本引擎。

> **与 DSH 版本的兼容性。** 包把五个运行期 seam 包（`dsh-compaction` /
> `dsh-session` / `dsh-llm` / `dsh-tools` / `dsh-settings`）都声明为 peer
> 依赖，共享同一个
> 范围 `>=0.1.5-alpha.1 <0.1.6-0`——恰好是整条 `0.1.5` 线（所有预发布加最终
> `0.1.5`）。从 `0.1.5` 线起，会话 replace 操作的协议字段由 `{ op, start, end }`
> 改名为 `{ op, startSeq, endSeq }`，且校验严格（只接受这三个字段）；本引擎只
> 输出新形态，因此在更旧的 DSH（< 0.1.5）上每次 `compress` 都会被宿主在运行时
> 拒绝（issue #136）——旧版本不再受支持，请先升级 DSH 再安装本发行版。范围
> 写成显式区间而非 caret 是**有意为之**：caret 会悄悄放进未经验证的 0.1.6+
> 线。把这五个 seam 包一并声明为 peer（而不只是 `dsh-compaction`），是为了让
> 安装在 pnpm 的集成/封存布局下仍能把它们解析到**宿主自己的副本**，而不是
> 某个与宿主不一致的陈旧嵌套副本。
>
> 行为注记（0.1.5 起）：宿主不再允许"不可见"替换节点，引擎清理孤立工具消息时
> 会在其位置留下一条短可见占位消息；宿主的系统提示节点（surface node 0）被排除
> 在可压缩范围表之外。

**方式二：纯 `npm install`（只装包，需要手写组合行）。**

```bash
npm install billion-context-dsh
```

这只把包装进你的项目/全局，**不会**触碰任何 profile——请按下方「两种生效范围与自定义」手写组合行，引擎才会挂载。

**git 源安装（`github:` 规格，插件商店展示的形态）。** 预构建产物 `dist/` 已提交到仓库，从 git 源安装同样开箱即用——**无需任何构建步骤**，pnpm 11 默认拦截构建脚本（`allowBuilds`）的机制对这个包不构成障碍：

```bash
dsh plugin --profile web add github:Tyan66666/billion-context-dsh#v0.2.26
```

建议带 `#<tag>` 安装，拿到与对应 npm 版本完全一致的产物；不带 ref 则装默认分支的最新构建。只有 clone 仓库自行从源码构建（`npm run build`）才需要放行构建。背景与方案取舍见 [docs/git-source-install-design.md](docs/git-source-install-design.md)（issue #92）。

## 两种生效范围与自定义

本节服务于两类人：① 方式二（纯 npm 安装，必须手写组合行）；② 方式一用户想自定义 `config`（bundle 已有默认行为，只需用**同 id** 行覆盖）。

**自定义 config（方式一 bundle 用户）。** 在你的 profile 补丁（如 `~/.dsh/profiles/web/cordis.patch.yml`）里追加一个 `compaction-acp` 行并附 `config:`——同 id 行覆盖 bundle 的默认行：

```yaml
- id: compaction-acp
  name: 'billion-context-dsh'
  config:
    modelContextLimit: 128000   # 可选；省略时自动探测模型真实窗口（回退 128000）
```

**全局生效（host 平面，所有模式）——推荐**。这是方式一 bundle 的默认行为；纯 npm 安装的用户在 profile 补丁中追加以下全部内容（bundle 用户跳过前两行）：

```yaml
# ACP 作为全局压缩后端：四个模型工具 + `/acp-prune` 命令 + nudge + ACP 提示词段，
# 对所有模式（standard / code / minimal / cordis / 自定义预设）生效。
# 必须同时禁用 host 的 compaction-basic：同一 realm 内两个后端同时
# provide `ctx.compaction` 会冲突。（bundle 安装已自动带上这两行。）
- id: compaction-basic
  disabled: true

- insert:
    - id: compaction-acp
      name: 'billion-context-dsh'
      config:
        modelContextLimit: 128000   # 可选；省略时自动探测模型真实窗口（回退 128000）
```

**（可选）自定义提示词文案 —— `config.prompts`。** 所有模型可见的提示词（普通/紧急 nudge 首句、上下文分解、增长行、批量提示、tier 蒸馏行、范围表、ACP system prompt 段、四个工具描述）默认**直接复用 acp-kernel 的 `renderNudgeText`**——效率提示、上下文分解、压缩规则、批量提示全部来自 kernel 原文，仅范围表换成 surface-seq 版（kernel 用 mNNNNN 引用，我们架构没有 `<acp>` 标签；seq 范围表同样携带 `[tool X% | text Y%]` 组成占比并 oldest-first 排序，与 kernel 展示语义一致）。覆盖任一 nudge 槽位后自动切换到模板渲染。模板支持命名占位符（如 nudge 的 `{pct}`、`{philosophy}`、范围表的 `{surface}`），**构造期校验**：占位符拼写错误会在引擎启动时抛错（fail-fast），而不是把字面 `{pct}` 漏进模型上下文：

```yaml
      config:
        modelContextLimit: 128000
        prompts:
          nudge:
            normal: '上下文使用率 {pct}%。这是效率提示——请尽早压缩保持上下文精简。'  # 中文 nudge 首句
          tools:
            acpStatus: '报告 ACP 块账本：压缩块数、回收 token、当前上下文压力。'  # 自定义工具描述
```

可配置槽位清单、每槽可用占位符、空串/`null` 语义见 [docs/configurable-prompts-design.md](docs/configurable-prompts-design.md)。未配置 `prompts` 的部署直接使用 kernel 渲染（对齐 kernel/pi，见设计文档 v6）。

**（可选）运行时设置 —— 编辑 `~/.dsh/settings.yaml` 或 `/acp-prune config`，无需重启。** 六个标量键（`modelContextLimit`、`autoModelContextLimit`、`nudgeMinContextLimitPct`、`nudgeMaxContextLimitPct`、`nudgeEmergencyThresholdPct`、`autoNudge`，见「配置」表中带「运行时热调」标记的行）在宿主 settings 层有一份可热改的副本：编辑 settings 文件或 `/acp-prune config` 会**立即生效于运行中的会话**（组合行 `config:` 仍是起点——分层为 schema 默认 → 组合行 → 用户 settings 段）：

```yaml
# ~/.dsh/settings.yaml
compaction-acp:
  nudgeMaxContextLimitPct: 0.72   # 保存即生效，无需重启
```

```text
/acp-prune config                                  # 列出六个键当前值 + 来源层（user / base / default）
/acp-prune config set nudgeMaxContextLimitPct 0.72 # 热改一个键
/acp-prune config set autoNudge false              # 布尔键（false 是合法值）
/acp-prune config reset nudgeMaxContextLimitPct    # 退回组合行 / 引擎默认
/acp-prune config reset all
```

窗口相关键（`modelContextLimit` / `autoModelContextLimit`）改动会清空窗口探测缓存——下一次 pre-step 按新值重新探测（探测失败也会被缓存，正是靠这个机制在修复网关后重新探测）。无 settings provider 的纯 npm 安装组合下 `/acp-prune config` 降级为指引文案；DSH 0.1.7+ 宿主线（settings 服务已移除 `installSection`，在本插件声明的 peer 区间之外）同样干净降级：启动时记一条 warn，六个键改由组合行 `config:` 调整，引擎与工具不受影响（issue #173）；`settingsEnabled: false` 可整体关闭该集成（组合行专用，不进 settings 层——开关不能关掉自己）。设计细节见 [docs/settings-integration-design.md](docs/settings-integration-design.md)。

**单模式生效（agent preset 的 `compaction` realm）**。先在该 realm 内*禁用（或删除）原有的 `dsh-compaction-basic` 行*，再插入本引擎——同一 realm 内两个后端不能并存：

```yaml
# 先禁用 realm 内默认后端（或直接删掉这一行）
- id: compaction-basic
  disabled: true

# 再插入本引擎
- id: compaction-acp
  name: 'billion-context-dsh'
  config:
    modelContextLimit: 128000   # 可选；省略时自动探测模型真实窗口（回退 128000）
```

> **每个 agent 只留一个上下文管理器。** 两个后端同时 provide `ctx.compaction` 会冲突——同一 realm 内切勿并存。完整安装与验证指南见 [docs/INSTALL.md](docs/INSTALL.md)。

## 工作原理

DSH 的每个模型请求都派生自其 append-only 会话日志（*surface*）。ACP 语义直接映射到这一模型：

| ACP 概念 | DSH 实现 |
|---|---|
| `compress` 工具遮蔽一段范围 | 持久化 `surfaceOp: { op: 'replace' }`——模型书写的摘要成为 checkpoint 节点；原文保留在日志中 |
| refs（`m00001` 标签） | surface seq，由 nudge 的可压缩范围表携带 |
| nudge（"效率提示——尽早压缩保持精简"） | 由内核的压力决策在 `agent/pre-step` 注入——效率通知 + 上下文分解 + 压缩规则，语气对齐 kernel/pi；绝非命令 |
| `decompress` | 从日志只读恢复被遮蔽的原文 |
| `search_context` | 从日志重建块摘要 + 被遮蔽原文的统一文档集（按日志快照缓存：新事件落盘前重复搜索直接复用，issue #133），交 acp-kernel `searchBlocks`（hybrid：词干化 + CJK bigram + 字符 n-gram 模糊）打分；命中回链所属块 |
| `acp_status` | CONTEXT BREAKDOWN（tool/text/summaries 占可见总量）+ 压缩块账本 + nudge 决策行 + `Checkpoint seqs` 行（active 块的 `bN → seq` 映射——压缩某个 checkpoint seq 即蒸馏该块，issue #60）；不含上下文窗口；支持 scope/view/tool/sort/limit 钻取 |
| 块状态 | 内存内核状态 + **日志重建账本**（无旁车文件） |
| 分层蒸馏（T2/T3） | 再次压缩某块的摘要节点 = 蒸馏该块（tier 2），蒸馏 tier-2 块得 tier 3；tier 与内核块 id 持久化进日志，重启后内核状态从日志再水合、可继续蒸馏 |
| 压缩记账（影子价格） | `shadowedTokenCount`（宿主占用率据此扣减）**用宿主 token-meter 的固定启发价计价**（`ctx.tokenMeter.measure` 优先、按 `heuristicTokens ?? tokens` 读固定启发价基准，`src/host-tokens.ts` 精确镜像兜底）——绝不混用插件内部的 CJK 感知估算（那是展示货币，混用会把宿主账本扣成负数、卡死中文会话，issue #54），也不按路由重定价的 `node.tokens` 计价（0.1.2+ 图片路由计价下那是请求压力价，读它会让含图片区间的 claim 虚报视觉价、同样扣穿账本，issue #103） |
| 图片/文件块可见性 | `image`/`file` 块没有字符，早先被投影层静默丢弃——于是它们在压缩范围表里没有 ref、不能当边界、不受内核"最近一条 user 消息"保护，还按 0 token 计价（截图会话里最后一条提问可能被整段压掉，issue #117）。现在 `extractText` 用附件的持久元数据生成一行确定性占位符（`[image image/png shot.png 800x600 4.2KB]`、`[file notes.txt 1.0KB]`，与宿主对文件的 handle 文本投影同源），媒体价格读宿主 token-meter 节点上 `tokens` 与 `heuristicTokens` 的差值（该节点只暴露这两个价格：`tokens` 是当前路由下的请求压力，媒体出现时带适配器声明的视觉价，`heuristicTokens` 是与路由无关的固定启发式——差值即路由多收的那部分），并在此之上**叠加宿主固定启发式对媒体引用的结构价**（`hostMediaStructuralPrice`，镜像宿主自己的 `estimateStructuralBlock`）：今天所有适配器都不声明视觉价，差值恒为 0，只读差值会让图片重新看起来"免费"，范围表行尾标注 `[+N images]`；无媒体的会话不做任何额外测量 |
| 注入指令行卫生 | 宿主会把 AGENTS.md 等策略文件注入会话表面；压缩其**当前副本**会让宿主立刻重注入同一份文件——压缩→重注→压缩死循环（issue #71）。可压缩范围表把注入行当屏障：永不提供、永不计入段；手动压缩（模型的 compress 工具、人用的 /acp-prune compress 命令）若覆盖某文件的当前副本都会被**直接拒绝**（报错点名行号，并提示过期的旧副本可以压），因为压当前副本没有收益——宿主必重贴。按 `source.changes[].scope`（= 一个文件）分组，只有每组最新副本受保护——被更新取代的旧副本可以安全压缩 |

承载性的压缩指引（工具、哲学、摘要规则、tier 蒸馏/浓缩规则）注册为一次性系统提示段；每条 nudge 携带精简版（效率提示 + 哲学 + 上下文分解 + 压缩规则 + 范围表 + 批量提示）。刻意**不做自动摘要**：自动策略只 nudge 模型（`compactIfNeeded` 返回 null）。

## 视频讲解

本项目继承的 ACP 哲学讲解——主动上下文压缩如何在约 20 万 token 内保持会话精简（opencode-acp 与 billion-context-pi）。*视频原作者：[裘香莲](https://space.bilibili.com/)（B 站 UP 主），非本项目制作。*

[![在 B 站观看](https://i1.hdslb.com/bfs/archive/083a77fede77502cbd6b2e206f8aadcc4dacc7ea.jpg)](https://www.bilibili.com/video/BV1qAMR6MEA4/)

## 模型工具

| 工具 | 作用 |
| --- | --- |
| `compress` | 用你书写的紧凑摘要替换 seq 范围（边界自动平衡到 tool-call/result 配对点）；对某块的摘要节点再次压缩 = 分层蒸馏（tier 2/3）。每个 range 可附 `verifiedReadings: string[]`——记录该范围里你实际读过并核实过的文件/章节，随摘要持久化，并在 compress 结果中以 `verified: …` 回显，后续回合不必重读即可知道哪些已核实 |
| `decompress` | 恢复已压缩块的原始内容（只读）；接受 acp_status 显示的 `bN` 或 compaction id。大块按字符预算分页（默认每页约 7K 字符、至多 100 条），使普通页面低于宿主 tool-result 截断阈值（8192）；`offset`/`limit` + 续页提示走完全块 |
| `search_context` | 按关键词搜索压缩块摘要与原文（acp-kernel hybrid 检索：词干化 + CJK bigram + 模糊）；命中回链所属块 |
| `acp_status` | CONTEXT BREAKDOWN（tool/text/summaries 占可见总量）+ 压缩块账本 + nudge 决策行 + `Checkpoint seqs` 行（active 块的 `bN → seq` 蒸馏入口，issue #60）；不含上下文窗口。支持钻取：`scope:"compressed"` 逐块、`scope:"uncompressed"` + `view:"messages"`/`"ranges"` 逐消息/区间，`tool` 过滤、`sort` 排序、`limit` 截断。钻取行 ref 是内核 mN——可直接作为 `compress` 的 `startSeq`/`endSeq`（自动映射为 live surface seq）；`Surface:` 的 seq 同样可用 |
| `/acp-prune` | 从命令栏执行 status / compress / decompress；status 额外展示 human-side 窗口信息（estimated context、context window 来源、压缩账本、**nudge 仲裁**——`nudge: idle/ACTIVE — reason` 及距下一次 nudge 还差多少 token，与 nudge 路径同一内核判定） |

- **摘要标源（模型自写摘要的框架行）**：每条压缩摘要在写入时前置 `[Model-written summary — not user words; re-verify any obligations before relying on them]`——同时写进持久化摘要事件与其 checkpoint 节点（同一份文本），投影路径对旧块幂等补框。目的：阻止模型把摘要里的义务句当成用户原话直接执行。
- **瘦身 nudge**：压缩哲学/规则段不再随每次 nudge 重复（它们已在系统提示里）；nudge 正文只保留触发框架 + 上下文分解 + 范围表。模板路径（`config.prompts.nudge`）同样摘除这些段落。设计背景：[docs/injection-governance-design.md](docs/injection-governance-design.md)。

## 上游项目与致谢

本项目是一个**移植/派生项目**，站在以下上游工作的肩膀上——全部为 MIT 许可。**衷心感谢** [ranxianglei](https://github.com/ranxianglei) 和 DeepSeek Harness 团队创建并开源这些项目：

| 上游项目 | 作者 | 角色 |
|---|---|---|
| **[billion-context-pi](https://github.com/ranxianglei/billion-context-pi)** | [ranxianglei](https://github.com/ranxianglei) | 本项目移植的 Pi 编码代理适配器；适配器设计、工具语义与本项目默认配置的来源 |
| **[acp-kernel](https://github.com/ranxianglei/acp-kernel)** | [ranxianglei](https://github.com/ranxianglei) | 框架无关的上下文压缩引擎——**原样复用**（refs、blocks、tiers、nudge 决策、search、status） |
| **[opencode-acp](https://github.com/ranxianglei/opencode-acp)** | [ranxianglei](https://github.com/ranxianglei) | ACP（"模型决定何时压缩、压缩什么"）设计的源头 |
| **[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)** | DeepSeek AI | 本项目所扩展的宿主平台（compaction 能力接缝、agent preset、持久化会话日志） |

本项目原样复用 `acp-kernel` 的压缩内核与 `billion-context-pi` 的默认行为；DSH 适配层（会话事件投影、持久化表面事务、模型工具、nudge、配置）为本仓库原创。上游版权与许可归其各自作者所有；本项目的许可条款见 [LICENSE](LICENSE)。

## 配置

| 键 | 默认值 | 含义 |
|---|---|---|
| `modelContextLimit` | 自动探测（回退 `128000`） | 用于内核压力决策的上下文窗口；显式配置时优先且跳过探测。省略时优先读宿主会话投影 `contextPressure.contextWindow`（按**当前真实路由**披露的新窗口，切模型会话自动跟随，无需重启），无投影时再从模型 API 探测；显式配置同样跳过输出预留扣减（分母完全由操作者定义）（运行时热调：`/acp-prune config`） |
| `autoModelContextLimit` | `true` | 从模型 API 自动探测真实窗口（`agent.ctx.llm.resolveModelInfo`）；探测失败回退默认值，`/acp-prune` 命令展示窗口来源（模型工具 `acp_status` 不含窗口信息）。省略时窗口先读宿主投影（`windowFor` → `projectedContextWindow`，`src/window.ts`）再走探测；投影与探测在 `autoModelContextLimit: false` 时均跳过。探测失败会在宿主日志与 `/acp-prune` 面板提示（`restart to re-probe`）——失败结果同样被缓存，修复网关后需重启或显式设置 `modelContextLimit` 才会重新探测。探测成功后还会**扣减 adapter 的每请求输出上限**（`defaultMaxTokens`，窗口末端每请求保证的输出预留）：所有下游压力决策（nudge 档位、truncate、growth）以「可持续输入预算」（窗口 − 输出预留）为分母——96K 窗口 + 16K 上限实际最多承载 80K 输入，原裸窗口分母会把用量低估 cap/window（此处 ≈17%；小上下文窗口模型比例更高）；上限未披露、显式配置或探测失败时保持裸窗口行为，`/acp-prune status` 展示扣减明细（raw − reservation）。经 `/acp-prune config` 改动 `modelContextLimit`/`autoModelContextLimit` 会清空窗口缓存，改完即重探 |
| `nudgeMinContextLimitPct` | 内核默认 `0.45` | Nudge 窗口下界（用量占比）——仅作配置校验，增长路径的触发没有百分比下限——与 billion-context-pi 相同的默认值（运行时热调：`/acp-prune config`） |
| `nudgeMaxContextLimitPct` | engine 默认 `0.70`（内核/pi 默认 `0.75`） | 过限线：超过此值则无论增长与否都触发 nudge——刻意低于宿主 compaction-basic 的 80% 自动压缩线，保证强制 nudge 先触发；显式配置优先（`coreOverrides.nudge` 同名键优先级更高，见下）（运行时热调：`/acp-prune config`） |
| `nudgeEmergencyThresholdPct` | engine 默认 `0.85`（内核/pi 默认 `0.95`） | 紧急 nudge（绕过每轮去重，但每个 user turn 最多注入 3 次——issue #108）——从 `0.95` 下调：95% 时模型已无操作空间且会被 80% 自动压缩线遮蔽；显式配置优先（`coreOverrides.nudge` 同名键优先级更高，见下）（运行时热调：`/acp-prune config`） |
| `preset` | — | （可选）一句话选择 nudge 的激进程度：`preserve` / `relaxed` / `balanced` / `efficient` / `aggressive`（详见下文「预设」）。只填充你**未显式设置**的三个 nudge 阈值，优先级 显式值 > `preset` > engine 默认；未知名称在构造期报错，与显式阈值合并后若窗口反向（`min` / `max` / `emergency` 顺序错误）同样在构造期报错。不影响其他键（`modelContextLimit` / `autoNudge` / `prompts` / `coreOverrides`） （组合行专用：`preset` 尚未接入 `/acp-prune config`，见 issue #75 后续） |
| `coreOverrides` | — | 任何其他 acp-kernel `Config` 覆盖（billion-context-pi 的 `coreOverrides` 逃生口）。合并顺序：内核默认 → 顶层 pct 配置 → `coreOverrides.nudge` 最后落地——同名键以它为准（只读：组合行专用，不经 settings 层） |
| `autoTools` | `true` | 在 `ctx.tools` 注册四个模型工具 |
| `autoCommand` | `true` | 在 `ctx.commands` 注册 `/acp-prune` 命令 |
| `autoNudge` | `true` | 当内核建议时向 `agent/pre-step` 注入 nudge（运行时热调：`/acp-prune config`） |
| `maxOverflowRetries` | `1` | 宿主确认的上下文超窗（`CONTEXT_WINDOW_EXCEEDED`）自动抢救预算：超窗时引擎挑一段**最大且合规**的范围做一次紧急压缩（摘要是引擎自己写的标记，不调模型——请求刚被拒，本就没有模型回合可写摘要；原文都留在日志里，`search_context`/`decompress` 找得回来），然后应答宿主的 `agent/request-error` 让该请求重试。预算按请求计数，模型有进展（落一条 assistant 消息）或 agent 回到 idle 即重置；`0` 关闭这个自动动作（错误原样抛给用户）。这是 ACP 唯一的自动压缩动作——压力侧始终只 nudge、由模型决定（组合行专用，不进 settings 层；原理与取舍见 [docs/overflow-recovery-design.md](docs/overflow-recovery-design.md)） |
| `settingsEnabled` | `true`（未配置即启用） | （可选）整体关闭运行时设置集成（组合行专用，不进 settings 层——开关不能关掉自己；关闭后组合行 `config:` 仍是唯一生效通道） |
| `prompts` | — | （可选）自定义提示词文案：nudge / 范围表 / system prompt / 工具描述按槽位覆盖（模板 + 命名占位符，构造期校验；见上文「自定义提示词文案」与 [docs/configurable-prompts-design.md](docs/configurable-prompts-design.md)） |

## 预设（preset）

不想逐个调三个百分比时，用一个词选择 nudge 的激进程度——从「尽量保留上下文」到「尽早频繁压缩」共五档：

| `preset` | min | max | emergency | 定位 |
|---|---|---|---|---|
| `preserve` | 0.55 | 0.78 | 0.93 | 尽量保留上下文，接近上限才提醒压缩 |
| `relaxed` | 0.50 | 0.75 | 0.90 | 轻度压缩，比 preserve 稍早提醒 |
| `balanced` | 0.45 | 0.70 | 0.85 | 默认平衡——与插件开箱阈值一致（选它等于不改） |
| `efficient` | 0.40 | 0.60 | 0.78 | 更勤快地修剪，偏向低 token 占用而非保留完整历史 |
| `aggressive` | 0.30 | 0.50 | 0.70 | 精简上下文，更早更频繁地压缩 |

- **只填未设的阈值**：`preset` 仅填充你没有显式设置的 `nudge*ContextLimitPct`；同时写了 `preset` 和某个阈值时，该阈值以你的显式值为准（优先级 显式 > preset > 默认）。
- **preset 同样落到运行时设置层**：组合 preset 填出的三个阈值注册为 settings 层的 `base` 层——`/acp-prune config list` 把它们归因为 `source: base`，`/acp-prune config reset <key>` 退回的是 **preset 值**而非引擎默认（运行时 reset 恢复的是组合的选择）；未配 preset 时行为完全不变。
- **不碰其他旋钮**：`modelContextLimit`、`autoNudge`、`prompts`、`coreOverrides` 完全不受影响；`coreOverrides.nudge` 仍最后落地、同名键最高优先。
- **查看当前档位**：`/acp-prune status` 会打印生效的 `preset` 及其**真实生效的**三个阈值——这一行镜像 `kernelConfigFor` 的合并顺序，所以你在其上做的显式覆盖、以及 `coreOverrides.nudge` 里的同名键都会如实显示。
- **拼错即报错**：未知名称在引擎构造期直接抛错并列出合法值（与自定义提示词模板同一约定），不会静默回退默认。注意 bundle 行本身不带 `config`，`preset` 只能由你自己的同 id `compaction-acp` 行提供；该行构造失败即挂载失败，profile 会在你修好配置前一直起不来（fail-fast 的既定行为）。
- **运行时热切换**：预设目前走组合配置（安装 / `cordis.patch.yml`）；待 #75 的 settings.yaml 热加载落地后，可在 `/acp-prune config` 里改。本 PR 先让它在组合层可用。
- **反向窗口直接报错**：与显式阈值合并后若出现 `min > max`、`max > emergency` 或 `min > emergency`（例如 `preset: 'preserve'` 配 `nudgeMaxContextLimitPct: 0.5`），引擎在构造期抛错并列出三个值。内核对这种配置只打警告、不会拒绝，所以这道校验由引擎在 `resolveAcpConfig` 里补上。
- **与宿主 80% 线赛跑的是 `max`**：反复触发的过限提醒（`OVER-LIMIT`）由 `max` 决定；`preserve` / `relaxed` 的 emergency（0.93 / 0.90）高于宿主 compaction-basic 的 80% 线，只是超过它之后的标签升级，宿主先压缩时不会到达。
- **`min` 是首见提醒与 T2/T3 块数触发的地板**：内核 0.0.63 在运行时读它两处——① `firstSightMassReady`（从未提醒过、还没有基线、用量 ≥ `min` 且待压内容达到增长下限时立刻提醒一次，理由串带 `[first-sight mass]`）；② `tierCountUsageFloor`（T2/T3 的「块数达标」触发同样要求用量 ≥ `min`）。常规 T1 增长提醒不看 `min`（由 `max` 与 `growthRatio` 决定），所以五档之间的主要差异仍来自 `max` 与 `emergency`，但更低的 `min` 会让首见提醒来得更早。
- **两个暂未纳入的旋钮**：原始需求里的 `growthRatio`（内核已有 `nudge.growthRatio`，可经 `coreOverrides` 调）和 `protectedLastMessages`（≈ 内核 `preserveRecentMessages`）目前不是本项目的一等旋钮；是否采纳为命名键 / UI 项由维护者决定，未擅自并入预设。

## 开发

```bash
npm install
npm run typecheck   # 严格 TS
npm test            # node --import tsx --test tests/*.test.ts
npm run build       # tsup 打包（内联 acp-kernel）+ .d.ts
npm run test:e2e   # 端到端宿主回归：真实 agent 循环 + 脚本化假 LLM（见下文）
```

端到端回归（`scripts/e2e/`）在进程内组装真实 DSH 宿主（cordis + agent-loop + DeepSeek 适配器），指向脚本化假 LLM 服务，挂载本引擎作为压缩后端，然后断言持久化事件日志：compaction 起止配对、durable replace 节点、严格 tool-call/result 配对、nudge 注入节奏；以及假 LLM **实际收到的请求体**（wire 级 prompt-cache 字节稳定性：envelope、`tools` 数组、leading message，无 compaction 场景全程 append-only）。背景与取舍见 [docs/e2e-harness-design.md](docs/e2e-harness-design.md)（issue #120）。

`dist/index.js` 自包含，仅外链 `@deepseek-ai/*` 接缝包（由宿主部署提供）。

## 架构

```
src/
├── index.ts        # AcpCompactionEngine（CompactionEngine 后端）+ 接线
├── messages.ts     # M1: 会话事件 ↔ acp-kernel CoreMessage 投影
├── state.ts        # M2: 每会话内核状态
├── region.ts       # M5: 持久化区域事务 + 日志重建块账本
├── block-ledger.ts # M5 支持：tier/lineage 字段编码进 compaction/summary 的 rawOutput（绝不作顶层成员，issue #141）
├── tools.ts        # M3: compress / decompress / search_context / acp_status
├── nudge.ts        # M4: 内核压力决策 → 注入的建议式 nudge
├── system-prompt.ts# M4: 一次性 ACP 指引段（让 nudge 保持简短）
├── config.ts       # 内核配置组装（阈值 + coreOverrides）
├── window.ts       # 自动上下文窗口探测（宿主投影优先，LLM 运行时探测回退，兜底 128000）+ 输出预留探测（defaultMaxTokens，windowFor 内扣除）
└── commands.ts     # M4: /acp-prune 斜杠命令
```

## License

MIT

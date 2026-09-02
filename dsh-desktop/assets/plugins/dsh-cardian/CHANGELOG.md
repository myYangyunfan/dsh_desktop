# Changelog

All notable changes to cardian are documented here. The project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **/cardian 斜杠命令**：dsh 会话内输入 `/cardian <子命令>` 即可查询/沉淀知识库——status / search / recall / tag / doctor / reindex / wiki(list·graph·get·sync) / card(get·due·add) / memory(list·commit)，无参 `/cardian` 列出清单。dsh 插件协议无命令注册面且内核不拦截 "/" 前缀消息，故实现为 systemPrompt 注入的命令约定（`SLASH_GUIDE` 常量）：零内核依赖，web 与桌面两端经同一插件即时共用。
- **vault 文件监听自动刷新**（`watchVault` 配置，默认开启）：在 Obsidian 手工编辑笔记后自动 reindex + 重建三区 MOC，无需手动跑 `cardian.reindex`。细节：只认 .md；README/_index/index/MOC 与点开头路径一律忽略（refreshAll 重建的正是这些 MOC 文件，不忽略就自触发成环）；1.2s debounce 合并 Obsidian 原子保存的事件风暴，刷新中到达的新变更排队合并不丢失；FSWatcher `unref()` 不阻塞短生命周期进程退出；`watchVault: false` 可关闭；监听实例暴露在 `cardian.watcher`（stats 可观测），插件卸载时随 apply 清理函数关闭。

### Fixed
- **vault 监听首版会把调用 apply() 的测试/CLI 进程挂死**：FSWatcher 默认撑住事件循环，含 apply() 的测试文件（cardian.test 等）测试全过但进程永不退出，全量 runner 卡死在中间文件。修复为挂载即 `unref()`。

## [0.13.0] - 2026-09-01

AI 扫盘建库：知识中心现在会像 Qoder 那样逐文件直调宿主模型，把项目梳理成「项目总览 → 模块 → 文件」三级卡片，带可视化分阶段进度、实时暂停/继续、以及只处理变更项的 diff 重扫。

### Added
- **core 扫盘底座（`core/repowiki.js`，对目标仓库全程只读）**：
  - `enumerateFiles(repoPath, {maxFiles, excludes, onProgress})` —— 只读枚举可分析文件，返回 `{relPath, language, lines, size, contentHash, excerpt, imports, symbols}` 清单，不写任何盘；沿用 `assertAllowedRoot` 白名单，非 `allowedRoots` 内的目录直接拒绝。
  - `applyHierarchy(repo, {overview, modules[]})` —— 落 1 张项目总览卡（`level: project`、`path: __OVERVIEW__`，正文回链各模块）+ N 张模块概述卡（`level: module`、`parent` 指向总览），并返回可供逐文件回填使用的 `assignments`（最长前缀优先）。
  - `changedSince(repoPath, {onProgress})` —— 磁盘指纹与已存卡 `contentHash` 对账，返回 `{added, changed, removed, unchanged, targets, truncated, pruneSafe}`；`targets` 是 added + changed 的完整元数据，可直接喂回填。清单触顶时 `pruneSafe:false`，绝不据不完整的磁盘视图剪卡。
  - `skeletonForFile()` 公开入口 + 文件卡 frontmatter 新增 `level` / `parent`（经 `compact()` 合并语义，局部 upsert 不会把已挂好的父子关系冲掉）。
- **网关逐文件直调宿主 LLM（`src/index.js`）**：放弃原先的放养 agent 会话，改为 `ctx.get('llm').stream()` 三段流水线 scan → plan → enrich，每个 job 一个 `AbortController`。新增 `listModels` / `pauseIngest` / `resumeIngest` / `cancelIngest` / `rescanDiff` 五个网关方法，`ingestProject` 重构为接受 `{dir, repoName?, maxFiles?, model?:{provider,model}, depth?}` 并立即返回 `jobId`；`ingestStatus` 快照新增 `phase` / `paused` / `model` / `overviewCount` / `moduleCount` / `enrichedCount` / `skippedCount` / `failedCount` / `diff`（字段白名单浅拷贝，不把 AbortController 与大数组过 wire）。无 llm 服务或未选模型 → 降级为仅骨架（`aiStatus:'unavailable'`）。
- **扫盘向导与进度 UI（`src/client/`）**：RepoWiki 总览顶部新增「AI 扫描项目 · 建立知识库」大按钮与「仅扫描变更」入口，overlay 表单可选目标夹（DSH 已打开工作区快捷选择 + 手输路径）、模型（`listModels` 下拉，默认沿用宿主默认模型）、文件上限与层级深度；进度卡展示总进度条 + 三段阶段标记 + 当前文件 + 「总览 N / 模块 M / 已回填 K」，running 可暂停、paused 可继续/停止；知识树按 `parent` / `level` 组装三级层级（无层级线索时回退目录树），文件卡带「AI / 骨架」徽章；每轮轮询发现新卡即刷新已建立卡片。
- **契约与回归测试**：`test/gateway-contract.test.mjs` 将 5 个新方法纳入三处清单同步断言；新增 `test/ai-scan.test.mjs`（12 项）覆盖 `enumerateFiles` 只读性（递归快照比对）、`applyHierarchy` 父子链、`changedSince` diff、`applyIngestControl` 状态翻转幂等、以及真实暂停/继续/停止/diff 重扫的端到端流水线。

### Fixed
- **知识中心右上角按钮与宿主侧栏重叠**：面板 header 的 `padding-right` 由 16px 增至 40px，新建/刷新/关闭钮组整体左移，不再被宿主浮动按钮遮挡。
- **AI 回填看门狗误伤长时扫盘**：enrich 每落一张卡就把 `aiDeadlineAt` 往后推（心跳），且单次模型调用新增 90s 超时——挂死的文件回退骨架卡，不再卡死整条流水线。
- **暂停后 aborter 被误删**：`_runIngest` 的 finally 在 `paused` 状态下不再删除 `AbortController`，避免「继续」刚换新的控制器就被上一轮循环抹掉，导致下次暂停无法中断在途调用。

## [0.12.0] - 2026-09-01

大检修：知识中心面板全面对标 Qoder Quest，界面精美简约；修复一批引擎与网关缺陷。

### Fixed
- **Typert 网关 arg-count bug**：`status` / `doctor` / `schema` 曾被误声明为 1 个 wire 参数，客户端报 `expected 1 argument(s), got 0`。现由 `ZERO_WIRE_METHODS`（describe/status/doctor/schema）统一驱动 controller.ts 与 index.js 两处清单，并新增契约回归测试锁定三处同步。
- **memory.promote 抛 ReferenceError**：`NotFoundError` 未导入，提升记忆为卡片时崩溃。补齐导入。
- **RepoWiki sync 误删数据**：孤儿剪枝在 `maxFiles` 触顶时会误删概览页/超限页。改为触顶跳过剪枝，并始终跳过 `__OVERVIEW__` / overview 页。
- **doctor 返回双 `problems` 键**：数字与数组同名互相覆盖。改为 `{ healthy, errors, problemCount, problems }`。
- **BM25 词频恒为 1**：`tokenize` 用 `Set` 去重使 tf 永远为 1，BM25 退化成布尔匹配。改为保频数组，恢复真实词频打分。
- **索引对外部编辑不失效**：旧 `freshness()` 只看目录 mtime，就地改文件内容不被察觉。改为逐文件 mtime 比对 + 增量重建该条。
- **importMarkdownFolder 缺根白名单**：直接读取任意目录，存在越权读取风险。补 `allowedRoots` 校验。
- **Markdown 链接 XSS**：`href` 无协议白名单。新增 `safeHref()`，仅放行 http/https/mailto/obsidian，其余降级为纯文本。
- **examples/demo.mjs 损坏**：旧版依赖 cordis Proxy，纯 stub 下崩溃。重写为直连 `createCardian`，并以 `import.meta.url` 锚定包根，幂等可重复 seed。

### Added
- **知识中心双栏布局**：左侧分区导航树（知识卡片 / 记忆 / RepoWiki）+ 分组/类型筛选 chips，右侧概览 / 最近更新 / 详情。
- **轻量 Markdown 渲染器**（ui.tsx）：标题 / 粗斜体 / 列表 / 代码块 / 引用 / 表格 / 行内码，替换原 `<pre>` 原文显示。
- **力导向依赖图谱**：纯 SVG + React 的节点连线图，节点按度数定大小，悬停高亮邻接、点击定位条目，配「被引排行」柱图（零第三方运行时依赖）。
- **可点击 wikilink**：`[[标题]]` 渲染为可点元素，经 `crossSearch` 解析跳转，缺回调时防御式回退。
- **SVG 图标集 + 洞察卡片化**：状态总览 / 标签洞察 / 依赖图谱 / 健康检查 统一卡片观感。
- **网关暴露治理方法**：`promote` / `due` / `exportJson` / `exportSkill` 经三处清单同步接入面板，并补契约测试覆盖。

## [0.6.3] - 2026-08-27

### Fixed
- **AI 回填卡死在「凝练中」**：完成判定此前只依赖 session/disposed；真实宿主里
  后台会话常驻不 dispose，且模型/凭据缺失时首轮静默失败 —— 面板无限转圈而卡片
  毫无变化。现为三层保险：turn 边界复核剩余张数（全零→done，否则实时显示
  「剩余 N 张」）、error 类事件直接透出失败原因、超时看门狗
  （backfillTimeoutMs，默认 5 分钟）把卡死标为 error 并给出排查指引。

One-click condense now includes real AI enrichment: clicking 沉淀 in the panel
scans the skeleton cards and automatically spawns an agent session that rewrites
each skeleton into a semantic card (职责 / 关键现现 / 依赖 / 注意点).

### Added
- **一键沉淀 = 骨架 + AI 凝练**：`ingestProject` 骨架扫描完成后自动新建一个
  agent 会话对`ctx.get('agents').create(...)`，复用超模注入器已验证的模式），
  prompt 指示 AI 用 `cardian.wiki.list` / `cardian.wiki.get` / `cardian.wiki.upsert`
  把该 repo 的骨架卡逐张回填成语义卡片对语义正文、一句话摘要、人类可读标题、
  去掉「## 待补充」占位、published）；已有回填的卡跳过对幂等，不覆盖人工成果）。
  - job 新增 `aiStatus`对none / running / done / unavailable）、`aiSessionId`、
    `aiMessage`；骨架 done 与 AI 会话 run 同时呈现；
  - agent 会话被 dispose对`session/disposed`）时把 job 标成「AI 凝练完成」；
  - 宿主无 `agents` 服务或创建失败时优雅降级：job 仍是 done，aiStatus 标
    unavailable 并提示「可稍后在对话中让 AI 回填」；
  - 面板 dock 在 done 任务旁显示 AI 状态行对✦ AI 凝练中 / ✅ 完成 / ⚠️ 不可用）；
  - 新配置项 `aiCondense`对默认 true）可整体关闭自动 AI 凝练；
  - `ai: false` 传参可对单次沉淀关闭 AI 步骤。
- 导出 `CardianGateway` 供白盒测试。
- 回归测试：`ingestProject spawns an AI condense session after skeleton scan`
  对断言 agents.create 被调、prompt 含 repo/upsert/list、meta.cwd=项目目录、
  dispose 后 aiStatus=done）与 `ingestProject skips AI condense when ai:false or
  agents unavailable`对ai:false 不 spawn；无 agents 服务时降级 unavailable）。
- 修复：package.json 因先前改写残留 BOM 导致 tsdown 无法解析对已剥除，改回
  UTF-8 无 BOM）。

### Fixed
- **seed 结构修复对「点沉淀后 AI 会话创建失败」根因，两轮）**：`agents.create`
  传递的 seed 里 `user/message` 事件的 `data` 必须是 message 本体对`id` 非空、
  `role: 'user'`、`source.kind`、`content` 数组），此前沿用的
  `data: { message: { kind: 'user', ... } }` 包裹结构不满足 dsh-session
  `assertMessageEventShape` 契约，导致运行时报
  `seed user/message at index 0 lacks an identified message`、AI 凝练会话建不起来。
  现改为按 dsh-llm `createUserMessage` 产物形态手写 message 本体对零依赖，
  用全局 `crypto.randomUUID()`），AI 凝练可真正起会话。
- **seed 还要带 surfaceOp 标记对第二层契约）**：`user/message` 是
  surface-eligible 事件，dsh-session SurfaceManager 校验对`surfaceOpOf`，
  `dsh-session/lib/types/surface.js`）要求事件必须携带 `surfaceOp: 'append'`
  标记，否则 validateNext 抛 `session event user/message is
  surface-eligible and requires a surfaceOp marker`。seed 事件现已补上该字段。
- 回归测试更新：`ingestProject spawns an AI condense session after skeleton scan`
  补充断言 seed 事件 type/seq、`surfaceOp === 'append'`、`data.id` 非空、
  `data.role === 'user'`、`data.source.kind === 'user'`、`data.content` 为数组。

## [0.6.2] - 2026-08-27

Fix: re-ingesting a project no longer wipes AI-condensed content. Knowledge tree
panel now renders projects/folders as an expandable hierarchy.

### Fixed
- **ingest 幂等保护对「点击凝练后失效」根因）**：`wiki.ingest` 再扫描同一项目时，
  跳过已被语义回填的卡片对body 不再是「待补充」骨架）——agent/用户 upsert 过的
  职责描述、摘要、标题全部保留，不再被骨架模板覆盖；仅有骨架标记或缺失的卡片
  会被重新生成。返回 `{ count, skipped, reserved }`，`ingestStatus` 的 summary
  与面板完成文案带出「保留已凝练 N 张」。
- 回归测试：`re-ingest preserves semantically enriched wiki cards (clobber fix)`
  对骨架 → upsert 回填 → 再 ingest → 断言 body/summary/title 不变、skipped=1）。

### Added
- **知识树文件夹层级**：面板列表改为可展开的树——按分区组对RepoWiki=仓库 /
  知识卡片=分类 / 记忆=scope）为第一层，RepoWiki 内再按文件路径段
  对`src/lib/store.js` → `src` ▸ `lib` ▸ `store.js`）展开成目录结构；点击
  项目/文件夹展开收起，点击文件查看凝练内容。无搜索词时显示树，搜索时切回
  扁平结果列表。`sectionList` 条目新增 `path` 字段对frontmatter 真值优先）。
- 回归测试：`sectionList carries path so the panel can build folder trees`。

## [0.6.1] - 2026-08-27

Maintenance round: conversation-activity refresh + RepoWiki/knowledge-tree polish.

### Added
- **对话活动钩子**（主流知识中心产品做法：项目有对话活动时三个分区都刷新）：宿主监听
  `session/event`对`user/message`），从会话 `header.cwd` 推导项目对basename →
  slug，与 RepoWiki repo slug 对齐）；当该项目已有 RepoWiki 分区时：
  1. 以 `scope=<project>` upsert 一条固定标题「最近对话 · <project>」的
     episodic 记忆对合并语义 → 稳定 id + 修订历史），正文含用户消息摘录与时间；
  2. `refreshAll()` 重建三个分区 MOC，保证「知识树」面板视图新鲜。
- 回归测试：`conversation hook refreshes memory for a known project`
  对含"同一项目第二次消息原地更新、id 稳定"断言）。

### Fixed
- `CardianGateway`对Typert 远端网关）构造现在优雅降级：宿主 `ctx.reflect` 缺失
  对如测试的最小 mock ctx）时不再抛 `TypeError`，工具注册不受影响。
- 测试 mock 对齐真现 dsh-tools 契约对`register(def)` 单对象）与提供者语义
  对`provide(name, value)` 真现落键），42 → 43 项测试全绿。

## [0.6.0] - 2026-08-26

dsh host integration + 「知识树」sidebar.

### Added
- Host read model `cardian.describe()` (knowledge-tree shape) + test.
- dsh **client half** (`client/`): a 「知识树」 surface that registers into the
  official `sidebar.footer.action` (left sidebar foot) and `shell.overlay`
  (floating panel) slots, rendering/searching all three sections.
- `dsh.client` manifest + `./client` export + `docs/dsh-integration.md`.

### Note
- Client half builds to `lib/client.js` via `npm run build:client` (React 18 +
  tsdown; dsh client packages are type-only and not installed). Rendering still
  needs the real dsh web client to verify.

## [0.5.0] - 2026-08-26

Third review round (2 fresh read-only agents: R12-feature review + coverage/
hygiene gap analysis).

### Fixed
- `related()` returned duplicate entries when one target appeared in multiple
  `relations` strings.
- `extractImports` produced false positives from comments and missed Rust /
  Python / Java / C# / Go-block / Ruby forms; it is now language-aware and
  strips comments first.
- `recall()` claimed a confidence boost but never applied it; confidence now
  enters the rank and keyword scores are normalized so the boost is meaningful
  in both keyword and semantic modes.
- `as_of` / `expires` accepted garbage; invalid dates are now rejected.

### Added
- Flashcards: `front` / `back` / `deck` card fields, `cardian.card.review`
  (SM-2 scheduling), and `cardian.card.due`.
- `cardian.doctor` health check (MOC presence, orphan temp files, missing
  required fields, expired notes) + `cli doctor`.
- `cardian.schema` frontmatter introspection + `cli schema`.
- CLI: `doctor`/`schema` subcommands, missing-arg validation, `ValidationError`
  for bad subcommands, `card due`/`review`, and a full CLI smoke-test suite.
- Package hygiene: `repository`/`homepage`/`bugs`/`author`, `sideEffects:false`,
  `publishConfig`, `prepublishOnly`, and `files` now includes `CHANGELOG.md` /
  `ITERATIONS.md` / `examples`.

### Changed
- Tool count 26 → 30; test count 30 → 41 (with `test/cli.test.mjs`).

## [0.4.0] - 2026-08-26

Second review round (2 fresh read-only agents: regression + edge-case), plus the
domain items the first round's research already specified.

### Fixed
- Tags containing interior quotes (`a"b`) were silently merged on round-trip.
- Titles containing `#` (e.g. "Kubernetes #101") were truncated by js-yaml/Obsidian.
- Markdown starting with a `---` horizontal rule was misparsed as frontmatter.
- MOC wikilinks could be broken/injected by titles with `]]`, `|`, `#`.
- `extractWikilinks` matched `[[...]]` inside code fences (phantom backlinks).
- `importJson` validated section-prefix but not `..` traversal up-front (partial import).
- `importMarkdownFolder` aborted the whole import on an empty note.
- Notes named `index`/`moc` (e.g. a wiki page for `index.js`) were silently
  excluded from list/search/export.
- RepoWiki tag-less `upsert` wiped auto-derived tags (now preserves via merge).
- RepoWiki scanned hidden dirs (`.github`, `.vscode`, …) and mangled file
  extensions in stems.
- Search index could go stale after external/hand edits (added dir-mtime probe +
  version captured before rebuild).

### Added
- RepoWiki dependency extraction: `imports` frontmatter + `## 依赖` section.
- Typed `relations` frontmatter (`"relates_to [[X]]"`) on all three types;
  `related()` resolves relations before falling back to shared tags.
- Memory revision history (`cardian.memory.history`, append-only, capped).
- Freshness: `as_of` / `expires` fields + `stale` count in `cardian.status`.
- `cardian.reindex` tool; `summary` field on cards/memory; `aliases` on wiki.
- Required-argument validation at the tool boundary.
- Symlink guard now works without a prior `init()` call.

## [0.3.0] - 2026-08-26

Multi-agent review round (deep code review + engineering-structure research +
domain-model research) against 12+ open-source projects.

### Fixed
- `cardian.search` returned empty when `topK` was omitted (NaN slice).
- Changing `category`/`scope` updated frontmatter but left the note in the old
  folder; notes now relocate to their new group.
- Concurrent upserts of the same title could interleave and lose updates; the
  whole read-modify-write now runs inside the store transaction queue.
- Unsanitized `category`/`scope` could contain `/` or `..`; groups are slugified.
- Tags containing commas were corrupted on round-trip; the YAML writer now
  quotes them and the parser splits flow sequences quote-aware.
- Hand-edited `title: 2024` / `tags: [42]` parsed to numbers; title/tags/aliases/
  facts are normalized to strings.
- `ingest` treated `maxFiles: null` as 1 and silently swallowed file-read errors.

### Added
- Typed error taxonomy (`core/errors.js`): `ValidationError`, `NotFoundError`,
  `ConfigError`, `PathError`, `StoreError`, compacted to structured JSON at the
  tool boundary (12-factor Factor 9).
- Config validation/coercion (`core/config.js`) with fail-fast `ConfigError`.
- Structured logger (`core/log.js`); diagnostics on stderr, data on stdout.
- `cardian.recall` — budgeted, importance/recency/confidence-ranked recall.
- `status` (draft/published), `confidence`, and memory `kind`
  (semantic/episodic/procedural) fields.
- Alias matching in `find`/`resolveRef`; `status` filter on list.
- Search index now rebuilds only when the store is mutated (was every query).
- Symlink-escape guard on writes.

### Changed
- Tool count 23 → 24 (`cardian.recall`); CLI gained `recall` and exit codes
  mapped from error codes.

## [0.2.0] - 2026-08-26

Ten rounds of engineering optimization informed by real-world projects
(basic-memory, 12-factor-agents, claude-obsidian, obsidian-second-brain,
vault-ld, open-zread, and others — see `ITERATIONS.md`).

### Added
- Framework-agnostic `core/` engine, decoupled from the dsh adapter (`src/`).
- Tool behavior hints (`readOnly` / `idempotent` / `destructive`) on all tools.
- Atomic writes (temp + rename) and a serialized mutation queue.
- Collision-safe slugs and merge-semantics upserts (unspecified fields preserved).
- Ranked keyword search via an inverted index (CJK bigrams + latin words).
- Pluggable embeddings with a dependency-free `HashEmbedder` and hybrid search.
- Tag cloud, backlinks, and related-notes views (`[[wikilink]]` graph).
- JSON export/import and Markdown-folder import.
- Standalone CLI (`cli.mjs`) with logging and `--dry-run`.
- `node:test` suite (`npm test`) with committed fixtures.

### Changed
- `cardian.search` now returns ranked, scored results with keyword + semantic
  breakdown; new filters `section` / `tag` / `topK` / `semantic`.
- Upsert return shape now uses `rel` for the vault-relative path.

### Fixed
- Negative IDF scores in keyword search (switched to smoothed positive IDF).
- Upserts wiping unmentioned fields (now merge semantics).

## [0.1.0] - 2026-08-26

Initial release: three features (RepoWiki / 知识卡片 / 记忆) as dsh tools,
stored in a local Obsidian vault.

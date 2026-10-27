# Changelog — DSH Desktop

DeepSeek Harness（dsh）的 Windows 桌面客户端：内置独立 Node 运行时与 dsh CLI，
一键启动 Web UI。

## [Unreleased]

### build(release)：发版正文改为仓库内按版本落盘，内嵌模板只作兜底（2026-10-27）

- **病灶**：`tauri-release.yml` 的 `Generate release notes` 把正文写死在 YAML 里，记的是**某一版**的数字。
  v1.0.6 → v1.0.7 → v1.0.8 连续三次发出去的正文都在讲上一版的内核版本、tgz 份数与插件条数
  （v1.0.7 还因一次错误的 PATCH 变成 PowerShell 对象串，事后手工修）。模板跟着改不是可靠做法。
- **修法**：工作流先按 tag 从仓库取 `.github/release-notes/v<version>.md`（`gh api contents?ref=<tag>`
  → `base64 -d`），取到即用并 `exit 0`；取不到才回落内嵌模板，并打一条 `::warning::` 提示逐项核对。
  发版正文从此是**可评审的文件**，随代码一起进 tag。
- **随本版落盘**：`.github/release-notes/v1.0.8.md`（本版实际正文；v1.0.8 已发布，正文由
  `gh release edit v1.0.8 --notes-file` 就地替换，未重建 release、资产与下载数不动）。
## [1.0.8] - 2026-10-27

（本轮随包内核换代 0.2.1-rc.2 → 0.2.1-rc.4，内容见下节；壳层与插件代码零改动。）

### build(kernel)：随包内核换代 0.2.1-rc.2 → 0.2.1-rc.4（2026-10-27）

- **pin**：`scripts/compat/kernel-pin.json` 的 `kernel.tag` / `kernel.packageVersion` 改
  `dsh-v0.2.1-rc.4` / `0.2.1-rc.4`；`validate-pin` 回 `✓ dsh-v0.2.1-rc.4（0.2.1-rc.4，offline-tarball）`。
- **vendor**：`vendor/dsh-kernel/` 换成 340 个 `deepseek-ai-dsh-*-0.2.1-rc.4.tgz` + 13 个框架件
  （353 总计；rc.2 的 339 个 tarball 全部移出，无混版）。每个 tarball 按 registry `dist.integrity`
  校 sha512 + 内嵌 `package.json` 校 name/version 才入库。家族本轮**零撤包**：340 个候选名在
  registry 上全有 rc.4 版本。
- **唯一新包**：`@deepseek-ai/dsh-client-ui-entry-customization`（rc.3 引入的左栏 / 会话视图 / 右栏
  「更多」菜单——浏览与创建插件），随 vendor 入库；`package.json` 336 条 `@deepseek-ai/dsh*`
  依赖与 `package-lock.json`（1021 条目 / 353 个 `file:` 条目）由 `generate-kernel-lock.mjs` 同批重生成。
- **补丁层零重靶**：`patch-deps` 实况「写入 75 处 / 失配 0 / 失败 0 / 降级 0 / 告警 0 / 共 62 项」；
  `patch-surface` 85 文件干预面零漂移（重取快照）；`ta6-baseline-matrix` 判定矩阵与 rc.2 **逐 id 相同**
  （43 changed / 14 root / 5 target-absent）。9 处「内容漂移」逐文件核过：7 个是真被补丁改过、
  transform 仍命中 rc.4 字节、注入体引用的上游符号一个没丢；另 2 个（`dsh-client-ui-plugin-manager`、
  `dsh-tool-cordis/lib/types/api-catalog.js`）根本没被打过补丁，进面纯因 marker `the profile`
  （`patch-adapters.js:163` 的横幅被撇号截断）撞上上游散文——见「已知问题」。
- **上游变更面**（rc.3 → rc.4 无 GitHub release，按 npm 与发行字节实测）：rc.3 给左栏 / 会话视图 /
  右栏各加一个「更多」菜单，并修「切换会话后点新会话找不回未发送草稿」；rc.4 把 DeepSeek API Key
  适配器的模型列表刷新口径与账号登录模式对齐。340 个包里有 16 个换了主入口产物（含
  `dsh-api-remotes` / `dsh-client-ui-conversation` / `dsh-llm-deepseek` 等），我们的锚点全部原样命中。
- **验证**：`npm test` 2222 例 / 2213 pass / 9 skip / **0 fail**；`check-syntax.js` 通过；
  `unit-patch-output-parsable` 把 109 个被干预产物 CJS+ESM 双形态编译通过。
- **已知问题（未在本轮修）**：`patch-surface.js:30` 的 `MARKER_RE` 终止符含撇号，把
  `/** dsh-desktop guard: the profile's own patch layer …` 截成泛化 marker `the profile`，
  再叠 `buildSurface` 的全文件子串匹配 → 快照里 **49/85** 个条目挂在这一条垃圾标记上，
  每次换版必报那 2 个从未打补丁的文件为漂移。修法（marker 捕获加引号感知、或把该横幅文本去掉撇号）
  单独提交，不与换代混在一起。

### feat(plugin)：移除「临时对话」+ 内置 DeepSeek-Bot（2026-10-22）

- **移除「临时对话」**：`side-session`（`@dsh-external/dsh-side-session` 0.3.1）从
  `COMPANION_PLUGINS` 摘出并进 `RETIRED_COMPANIONS`，源目录 `assets/plugins/dsh-side-session`
  与更新源表条目一并删除。存量机器的 patch 登记、profile 镜像目录与 manifest 登记由
  `sync-companion-plugins.js` / `integration/plugin-sync.js` 两个入口共用的
  `removeRetiredCompanionPatchRows` + `syncCompanionFiles` 回收（隔离实机已实测目录/manifest 撤回）。
- **内置 DeepSeek-Bot**：`ds-bot` 0.2.0（Apache-2.0，loader id `bot`）作为第 34 个伴随插件随包交付，
  提供主 Bot + 长期 Bot + 群聊、@ 转交、群共享记忆、能力库与用量页。vendored `cordis.patch.yml`
  只保留 Bot 本体，不复制上游的 `web-search-auto` / `web.searchProvider: auto` 覆盖，避免与
  `dsh-free-search` 抢 web provider；更新源表新增 `bot`（npm `ds-bot`）。
- **README 重写**：中英两份的门面改为「精选插件整合包」定位，补充 DS Bot / Better Sidebar /
  Free Search / 插件商店 / 通知的统一管理与开箱即用叙事；版本、安装包命名与数据位置同步到 1.0.7。
- **验证**：`npm test` 2222 例 / 2213 pass / 9 skip / **0 fail**；隔离 boot 的 `plugin-list`
  中 `bot` 为 enabled、`side-session` 消失；真实 `dsh web` 页面加载出 Chief 主 Bot 界面；
  `unit-hub-registry` / `unit-vendored-upstream-plugins` / `unit-companion-bulk-retire` 等台账锁全绿。

## [1.0.7] - 2026-10-22

### feat(plugin)：会话地图 dsh-synapse 随包默认关闭（2026-10-22）

- 新建/升级 profile 时由 `sync-companion-plugins.js` 与 Tauri boot 的
  `scripts/integration/plugin-sync.js` **双入口**写入顶层 `- id: synapse` + `disabled: true`，
  与 compaction-acp 同机制（顶层 disabled 覆盖 bundle 自身 insert）。
- 写入禁用块的同时写一次性标记 `# DSH Desktop：dsh-synapse 默认禁用已应用（用户开启后不再回写）`；
  用户在内置插件页开启后，下次启动 sync 看到标记不再回写，选择可持久（显式关闭仍会重新禁用）。
- 验证：全新隔离 home boot → `plugin-list` 的 `synapse.enabled=false`；开启后重启仍为 `true`；
  `unit-companion-profile` 12/12（含「开启不回写」「显式关闭仍写入」两条反证）。

### feat(plugin)：随包内置五个上游插件 + 内置件统一查看/更新（2026-10-22）

- **新增五条内置件**（`COMPANION_PLUGINS` 29→34，`assets/plugins` 34 目录 1:1）：
  `web-search-free` / `dsh-free-search` 0.9.11（MIT）、`shop` / `dsh-plugin-shop` 0.9.0（Apache-2.0）、
  `network-proxy` / `@local/dsh-network-proxy` 1.0.0（MIT）、`mcp-manager-ui` / `dsh-toolbox-ui` 1.8.2（MIT）、
  `dsh-notify` / `@bittersmilezzz/dsh-notify` 0.4.5（MIT）。loader id 逐条与各自 `cordis.patch.yml` 对齐。
- **统一查看/更新（B 案）**：`dsh-tauri/sidecar/cli.js` 的 `plugin-list` 行新增 `version` / `updateSource` /
  `updateExcluded`；更新源收敛到唯一表 `scripts/lib/plugin-update-sources.js`（8 条，含 5 条新增），
  sidecar 与 `plugin-core` 同源；`better-sidebar` 明确排除（本地重建件，npm 更新会覆盖本地修复）。
  GitHub 源支持「release 无资产」的 zipball archive 模式（network-proxy 只有 tag，没有 release asset）。
  `dsh-builtin-manager` 页新增行内版本、「检查更新」、可更新行的「更新」按钮（成功提示 + 刷新列表，
  失败落 sidecar 原文）；桥命令与契约零新增（`checkUpdates` / `update` 早已在册）。
- **随包兼容改动（均带回归锁）**：free-search 的 research 缓存落点改为 `DSH_HOME` 优先（不再写死
  `~/.cache`）；network-proxy 的 `network-proxy.json` 按 0600 落盘、客户端 locale 快照改读
  `snapshot.active`；notify 补 `private: true`；toolbox 静态导入的 `smol-toml` 进
  `dsh-desktop/package.json` 与 `VENDOR_DEPS`（新 `unit-vendored-upstream-plugins` 9 例咬住，
  含三处反证）。
- **壳层通知下线**：`dsh-notify` 接管回合完成通知；详见 `dsh-tauri/CHANGELOG.md` 同批条目。
- **台账**：`THIRD_PARTY_NOTICES.md`（§4.1 34 件 + `smol-toml` 1.9.1 BSD-3-Clause）、
  `docs/builtin-plugins-inventory.md`（§一 34 行、§5.2 34 行七数本地重放）、`README.md` / `README.en.md`
  两表、`AGENTS.md` 计数已同步；`plugin-contract.md` 的 33→34 漂移一并修正。
- **门禁**：`check-syntax` / `validate-pin` / `patch-surface verify`（85 文件）全绿；
  `unit-hub-registry` 24/24、`unit-plugin-inject-services`、`unit-plugin-channels`、`unit-plugin-peer-floor`、
  `unit-payload-plugin-deps`、`unit-doc-command-truth`、`unit-builtin-manager-client` 21/21、
  `unit-plugin-update-sources` 8/8、新 `unit-vendored-upstream-plugins` 9/9；
  sidecar `cli.test.js` 21/21；全量 `npm test` 2253 例 / 0 fail / 0 cancelled（9 skip，均为环境缺料）。

### fix(plugin)：dsh-better-sidebar（本机版本仍 0.24.2，未 bump）—— 右上角「文件资源管理器」两处坏根治（2026-10-21 用户报障）

- **报障**：客户端右上角的「文件资源管理器」点击后无反应。宿主半边先证明无罪：隔离实机
  `GET /open-in-app/apps` 回 `["explorer","vscode","gitbash"]`，`POST /open-in-app/open`
  （`{app:"explorer",path:<工作区目录>}`）回 **200 `{"ok":true}`** 且资源管理器真开窗。坏在客户端侧，两条：
- **坏 ①（能看见的那颗）**：屏幕上唯一的「资源管理器」是我们常驻左栏的栏头，而它当时是个
  **没有 handler 的 `<span>`**（折叠只挂在旁边那颗小箭头上）。修法：栏头整行做成
  `button`（`aria-expanded` + `title/aria-label=收起文件树`），图标/标题/箭头一体，折叠态仍由
  `ExplorerRailCollapsed` 那颗「展开文件树」按钮负责。
- **坏 ②（本该存在的那颗不见了）**：内核的「文件资源管理器」分体按钮画在
  `sidebar.right.tab.files.actions`，而该槽的**唯一宿主**是 built-in `FilesBody`
  （`@deepseek-ai/dsh-client-ui-sidebar-files/lib/client.js:699`）；本插件以同 kind 的
  `priority: 'extension'` 接管 `files` 主体之后，那一格永不再渲染，入口在产品里彻底消失。
  修法：`TreePanel` 工具条自建 `OpenLocallyButton`——清单直读宿主 catalog，主按钮按首个应用打开
  工作区目录、箭头菜单列全清单（实机菜单渲染「文件资源管理器 / VS Code / Git Bash」），
  **宿主不可用或 catalog 为空即整块不渲染**（不给死行），失败走一行自清提示。
- **产物**：走 `.tmp-bs-build` 沙箱 `npm run build`（`tsc` 类型门禁 + `tsdown`，`Build complete in 1909ms`）
  重建后回填 `lib/`；发行字节里 CSS 类名表逐键核对 **185 键零丢失、只新增 `openLocallyGroup`**，
  其余大块 diff 是生成产物的键序重排。兼容实测随新增原语取用变动：`member` **413 → 419**
  （TreePanel 三处内核原语 × 双频道产物），inventory §5.2 #3 的实测列已随迁。
- **回归锁**：新增 `scripts/test/unit-better-sidebar-explorer-open.test.js` **17 例 / 0 fail**
  （12 判据 + 5 反证：丢 catalog id、摘空清单守卫、摘 `aria-expanded`、`onCollapse` 换空函数、
  强改单应用分支）。门禁：`check-syntax` 通过；better-sidebar / 右栏相邻六套 **92 例全绿**；
  `unit-hub-registry` 台账对账 24 例全绿；全量 `npm test` **2226 例 / 2217 pass / 0 fail / 0 cancelled / 9 skip**。
- **文档**：`docs/better-sidebar-kernel-integration.md` 新增「接管 built-in 工作区文件：被我们弄丢又找回的入口」
  一节（槽位宿主表 + 修法 + 锁名）；AGENTS.md 记一条同型坑（接管型插件吞掉宿主专属槽，静态扫与 boot 全绿）
  并把测试基线更新为 204 文件 / 2226 例。

### fix(plugin)：dsh-synapse 0.3.0 → 0.3.1 —— 吸收 d-pack 的 snapshotEvents 兼容口（2026-10-19）

- **断链**：0.3.0 的回填路径读 `session.events`，而 rc.2 / 0.2.1 的 `Session` 已无该字段
  （`Session.prototype` 反射实测只有 `snapshotEvents` / `ownEvents`）。失败形态是静默空转：
  投影永远应用 0 条事件、画布看起来「没有数据」，控制台干净。逐文件差量见
  `dsh-desktop/docs/builtin-plugins-inventory.md` §5.5。
- **修法**：采用 d-pack `0.3.1` 的 `sessionEvents(session)`（优先 `snapshotEvents()`，
  老宿主退回 `session["events"]` 下标读取），本仓包版本与 PACK 对齐到 `0.3.1`；
  `app.js` / `styles.css` / `client.js` 与 d-pack `0.3.1` 逐字节一致，唯一代码差量是
  `index.js` 里的兼容口。
- **回归锁**：`test/replay-watermark.test.js` / `test/workspace-store.test.js` 的夹具改成
  真实宿主形状（只有 `snapshotEvents()`、没有 `events`）。反证：旧 `0.3.0` 代码在 25 例中
  7 例红；修后 `node --test test/*.test.js` **102 例全绿**。
- **台账**：`README.md` / `README.en.md` 插件表、`THIRD_PARTY_NOTICES.md` §4.1、
  inventory §一/§3.1/§4.1 同批 `0.3.0` → `0.3.1`。

### refactor(plugin)：dsh-prompt-optimizer 换为上游 Y1X1n 0.6.1（本地版本线 3.0.0，2026-10-19）

- **整体替换**：`assets/plugins/dsh-prompt-optimizer/` 由本仓 2.4.0 自研升级线整体换成
  上游 [`Y1X1n/dsh-prompt-optimizer`](https://github.com/Y1X1n/dsh-prompt-optimizer) `0.6.1`
  的 vendored 版本（MIT，Copyright (c) 2026 Y1X1n），本地版本线记为 `3.0.0`。
  产物为 `lib/{index,client,prompt,controller}.js`，`src/`、上游 `test/` 与
  `scripts/build.mjs` 随源保留，可在本仓内重建。
- **包名与 loader id 不变**（`dsh-prompt-optimizer` / `prompt-optimizer`）：老 profile 里的
  同名安装会被 3.0.0 原地覆盖（`companion-profile` 的 keep-newer 判据），不会形成双挂载；
  `COMPANION_PLUGINS` 与 `cordis.patch.yml` 无需迁移。上游 npm 真包名是
  `@y1x1n/dsh-prompt-optimizer`；npm 裸名 `dsh-prompt-optimizer` 属另一实现（winditer），
  本地 `repository` 指向 Y1X1n 后身份判 `foreign`，**禁止按裸名更新**。
- **能力面**：输入框旁「优化」按钮 + `conversation.input.dock` 流式结果面板 +
  `settings.plugins.tab` 插件设置页标签（读写走内核 `configForms`）；宿主注册
  `POST /dsh-prompt-optimizer/optimize`（SSE）与 `POST /dsh-prompt-optimizer/test-model`，
  宿主 `inject=['llm']`。设置页自带「优化用模型 / 回退模型」两行下拉：模型目录经
  `session/modelCatalog` RPC 拉取，固定 `provider/model` 后所有优化与探活都走该路由，
  留空才跟随发起请求的会话；旁附模型连通性测试。上游自带的 0.1.x 兼容面（`settingsScope` 服务与
  `settings.plugin.item` 槽）在 pin 的 0.2.1 内核上已退役，随本次一并摘净——客户端主
  `inject` 只保留 `['slots', 'connection', 'remote']`，`configForms` 等可选服务各自独立
  inject，避免宿主缺任一服务时整个客户端永远等不到就绪。旧自研线的项目优化目标、
  上一轮上下文、意图行、一键撤销等实现随目录替换一并退役。
- **清理**：撤除 `.gitignore` 的旧 `dist/` 例外；删除旧实现专属的四个回归套件
  （`unit-prompt-optimizer-{context-intent,lexical-write,project-goal,upgrade}`）；
  新增 `unit-prompt-optimizer-vendored`（8 例）锁住清单/入口/宿主导出/客户端槽位/身份判定、
  解析行为，以及「设置固定模型压过会话选择、留空跟随会话」的端到端路由。G10 槽位 props 契约扫描器同批学会下钻「工厂返回组件」——
  `createOptimizeButton` / `createResultDock` 的外层形参是依赖注入而非槽位 props，
  旧扫描把它们误当成 `props.*`；新增正反夹具各一条，追不到时仍落 INCONCLUSIVE。
  四处逐名台账（`THIRD_PARTY_NOTICES` §4.1、inventory §一/§4.2/§5.2、README 中英）
  同批随迁到 3.0.0。
- **验证**：上游自带 `prompt.test.mjs`（24 例）/ `controller.test.mjs`（27 例）/
  `slot-guard.test.mjs`（5 例）全绿；本仓全量 `npm test` **203 个测试文件 / 2209 例 /
  0 fail / 0 cancelled**（pass 2200 / skip 9），`check-syntax`、`validate-pin`
  （`dsh-v0.2.1-rc.2`）与 `patch-surface verify`（85 文件无漂移）同批通过。隔离真内核
  （临时 `DSH_HOME` / `DSH_TAURI_USERDATA`）：boot 五步全绿（3.25s），31 条插件中
  `prompt-optimizer` 已启用；`web` 启动后 stdout 打出
  `[dsh-prompt-optimizer] loaded`，`POST /dsh-prompt-optimizer/test-model` 与
  `/optimize` 分别回插件自己的「未找到可用模型」409 与参数校验 400（**不是 404/405**），
  stderr 全程 0 字节；页面实测渲染出 `button.dsh-po-btn.dsh-po-opt`（空草稿时按设计
  disabled + title「先在输入框输入提示词」），无 `Failed to load plugins`、console 零消息。

## [0.6.5] - 2026-09-22

### feat(release)：v0.6.5 正式版发布

- **内置会话迁移插件 `dsh-zcode-migrate`**：
  - 支持一键将 zcode 历史会话迁移导入为 DSH 原生会话并关联工作区。
  - 工具参数定义适配严格 JSON Schema（Draft 4+），彻底杜绝布尔型 `required: false/true` 引发的模型 API 400 拒收打回。
- **知识中心与图谱记忆默认软禁用（按需启用）**：
  - 默认软禁用 `dsh-cardian`（知识中心）与 `graph-memory`（图谱记忆），避免未显式开启时无故污染工作目录或在长对话中无界注入提示词。用户可在应用内插件管理中一键按需开启。
- **内核升级适配**：
  - 内核平滑迁移并适配 `0.1.6-alpha.1`。
- **全平台构建与便携版双轨分发**：
  - 支持全平台远端构建，Windows x64 同时提供「内置 Node 完整便携版」与「轻量 Lite 便携版（免自带 Node）」。

## [1.0.6] - 2026-10-18

v1.0.6 只换随包内核：`0.2.1-rc.1` → `0.2.1-rc.2`。壳侧 Rust / 契约 / sidecar 零改动，
构建期补丁层仍是 62 项（仅 `patch-web-search-baseurl` 一处按新字节重锚），内置插件在册 29 条不变。
rc.2 带来 DeepSeek-V4.1-Flash-1017 模型适配与新版 DeepSeek Search & Fetch API。

### feat(kernel)：内核换代 0.2.1-rc.1 → 0.2.1-rc.2 —— pin/vendor/锁/补丁层随迁（2026-10-18）

- **换血三处同步**：`scripts/compat/kernel-pin.json` 的 exact pin 与 tag 改 `0.2.1-rc.2` /
  `dsh-v0.2.1-rc.2`（禁止浮动的老规矩不变）；`vendor/dsh-kernel/` 换成 rc.2 的 **352 份离线 tgz**
  （339 个 dsh 包 + 13 个框架件；rc.1 的 337 个 dsh 包全在，新增
  `@deepseek-ai/dsh-client-ui-deepseek-model-label-1017` 与 `@deepseek-ai/dsh-web-deepseek-api`。
  旧 rc.1 的 350 份 tgz 仅留存于 gitignore 的 `.tmp-kernel-rc2/vendor-rc1/` 作取证，不入库）；
  `package.json` 337 处依赖声明（336 deps + 1 devDep）与 `package-lock.json` 同批重生成，
  锁内 352 个 `file:` 条目、339 个 dsh 条目 version 全为 0.2.1-rc.2。
  `node scripts/compat/validate-pin.js` → `✓ dsh-v0.2.1-rc.2`。
- **rc.2 上游变更（换代带来的面）**：新增 DeepSeek-V4.1-Flash-1017 适配（新包
  `dsh-client-ui-deepseek-model-label-1017`）；新增 DeepSeek Search & Fetch API（新包
  `dsh-web-deepseek-api`，网页搜索设置页新增「启用新版 Web 搜索 API」开关与第二个地址字段
  `searchApiBaseUrl`，追加 `/search` 或 `/fetch`）；`dsh-web-search-deepseek` 请求体加
  `thinking: { type: "disabled" }` 并重写错误文案。另有两处纯版本号 / 内置件清单变动
  （`dsh-client-ui-settings-account`、`cordis-client-runner`），与补丁面无关。
- **补丁层重锚一处**：`patch-web-search-baseurl` 的设置页文案半边按 rc.2 新字节重录——
  `description` 已含新语义不再改写，`baseUrlHint` 两对（中英）按 rc.2 新文案重锚；provider 半边
  （基址归一化 + 协议契约指引）两条锚点在 rc.2 逐字在位，一字未动。首次 `npm ci` 实测
  **写入 74 处 / 失配 1 项**（失配即该 client.js），重锚后 `patch-deps` 增量
  **写入 1 处 / 失配 0 / 失败 0 / 共 62 项**，合计 75 处与 62 项全落地；二次运行写入 0（幂等）。
  `unit-web-search` 夹具改为 rc.2 真字节，并新增「回灌 rc.1 旧 baseUrlHint → client 半边必跳过、
  字节级不变」反证。
- **两道基线锁按真跑重录**：`ta6-baseline-matrix` 的 `BASELINE` 版本键换 `0.2.1-rc.2`（pristine
  闭包 `.consumer-0.2.1-rc.2`，352 包），矩阵**逐项与 rc.1 相同**——43 changed / 14 root /
  5 target-absent，零 anchor-missing、零 already、零 THROW，无补丁因换代退役；
  `patch-surface.snapshot.json` 在 `npm ci` 重收敛后重取，**85 个被干预文件 / 85 个标记家族**，
  `verify` 复绿后与本次改动同一批入库。
- **门禁**：全量 `npm test` **2277 例 / 0 fail / 0 cancelled**（pass 2268 / skip 9；206 个测试文件），
  `check-syntax` 通过；Rust workspace **709 passed / 0 failed / 4 ignored**（gnu 链配对，exit 0）。
- **隔离内核实机（全新 `DSH_HOME` / `DSH_TAURI_USERDATA`，不碰真实 `~/.dsh`）**：sidecar boot
  五步全绿（repair 29ms / sync 3547ms / patches 89ms / compat-pin 120ms / preflight 60ms，共 3.8s），
  29 条内置插件在册；`web` 起在 `127.0.0.1:3197`，stderr 零 `failed to load` / 零 `anchor-missing` /
  零 `pending (waiting for`。**真发一条消息**经 `/api` RPC 落盘：`session/create` →
  `session/prompt` accepted，system prompt 装配成功（6378 字符、cwd 已填实、无未解析占位符），
  回合仅因隔离 home 无密钥在模型调用处报
  `no API key for provider route "deepseek-official"`（与「无密钥止步于凭据」判据一致）；
  `unknown prompt variable` / `has no value` 在 kernel 日志与会话日志的**装配上下文**中零命中
  （会话日志里的两处字面命中来自注入的 AGENTS.md 正文，不是错误）。

## [1.0.5] - 2026-10-18

v1.0.5 是 v1.0.4 的补发版：v1.0.4 因 makensis 构建期路径墙缺了 Windows 全部资产（见下方
`fix(release)` 条目），本版用同一份工作树补上 Windows x64 / ARM64 / 便携包，并在发布流水线里
新增「期望集合」门禁——主平台缺件直接拒绝发布，不会再把不完整的正式版推成 `latest`。
同时收入两项用户报障的根治：自动压缩清空草稿（`dsh-auto-compact` / `dsh-change-review` 0.1.2）
与壳进程闪退（Rust 侧退出闸门、孤儿内核收割、会话退出标记，详见
[`dsh-tauri/CHANGELOG.md`](../dsh-tauri/CHANGELOG.md) 的 v1.0.5 段）。内核与补丁层不变
（`0.2.1-rc.1` / 62 项），内置插件在册 29 条。

### fix(companion)：右下角「已自动压缩」把我写了一半的草稿清掉了——`dsh-auto-compact` / `dsh-change-review` 0.1.2 加提交前闸门

- **用户报障（2026-10-18）**：「正在会话沟通，打了一大半内容，突然弹出自动压缩上下文的弹窗，
  写了半天的引导词直接给我清空了」。凶手不是提示，是提示旁边那次提交：
  `fireCompact` 无条件 `inputActions.setDraft("/compact")`，而内核这条 API 的契约是
  **整篇替换**——`@deepseek-ai/dsh-client-ui-conversation/lib/client.js:15023`
  原文 `Replace the whole draft (persisted-draft seed and programmatic writes)`，
  且 `publish()` 会立刻把它写进该会话的**持久化**草稿（`:15708-15716` +
  `:17965` 的 `bindDraftPersistence(actions.setDraft)`），成功提交后 `commit-draft` 还会
  砍掉 undo 栈（`lib/types/client/contract/input.d.ts:380-388`）。
  所以半篇引导词不是「被挡住」，是不可恢复地被覆盖。旧触发链只有
  `enabled / 阈值 / 冷却` 三道判据，既没判草稿非空、也没判这一轮在跑，
  而 `/compact` 本身要求 agent 空闲——忙时还会「草稿已丢 + 压缩被内核拒」双重坏；
  设置页那句「仅在对话空闲时进行」在 0.1.1 里是不成立的文案。
- **修法（一层纯函数 + 两处接线）**：新增 `composerGate(input, session)`，判据**照内核
  InputBar 的同源口径**（`:18803-18806`：`empty = draft.trim() === "" && attachments.length === 0`；
  `machineBusy = phase === "adjudicating" || "submitting"`）加上
  `useSession(s => s.running / s.pendingSubmissions)`：草稿有内容或有附件 → `has-content`；
  形态非 `plain` 或轮次在跑 → `busy`；`useInput`/`useSession` 读不到或形状不认识 → `unknown`。
  **只有 `ready` 才提交**；自动那一路被挡时**不记冷却**（等输入框空了由下一次投影更新补做），
  也不弹那条误导性提示；设置页「立即压缩」走同一道门，被挡时把原因说出来
  （新增 `nowBlocked` / `nowUnknown` 中英文案），`note` 改成与真判据一致。
  `dsh-change-review` 是同一条根的第二个实例（它把一大段生成的审核提示写进草稿，
  自动模式在「变更停止 20 秒」后触发，那一刻用户很可能正在写下一轮），同批加闸门，
  并把 `fireReview` 的返回从布尔改成状态串 `fired / blocked / none`
  （旧调用点用真值判断，字符串会变恒真——两处调用点同批改），被挡时**保留 `pendingChanges`**。
- **为什么不读 `inputActions`**：那个对象只有 8 个方法
  （`captureInsertion / insertText / setDraft / persistDraft / addAttachments /
  removeAttachment / pruneAttachments / submit`，`:14932-14958`），
  **没有** `state` / `getDraft` / `draft` / `busy` / `canSubmit` 任何一项——按那些字段读会恒
  `undefined`，守卫就做成静默死的（本仓第三次踩「幽灵字段」）。快照的 sanctioned 来源是 dock
  occupant 的标准注入面 `hooks.input = shell.state` / `hooks.session`（`:19738-19753`）。
- **顺带逮到一条行尾落差**：写反证用例时发现 `assets/plugins/dsh-{auto-compact,change-review}/lib/client.js`
  在本机工作树是 **CRLF**（index 是 LF，`git ls-files --eol` 实测 `i/lf w/crlf`，本机
  `core.autocrlf=true` 来自 `C:/Program Files/Git/etc/gitconfig`），多行锚点的 `src.replace`
  在我机器上**静默空转**——变异体等于原件，反证用例却在报绿。这正是上面 `fix(release)`
  条目里 CI 三条红的同一个成因。夹具进门先把 `\r\n` 拍平（本机与 CI 从同一字节起步），
  仓库级修法是新增的根目录 `.gitattributes`。
- **实测**：新增 `scripts/test/unit-auto-compact-gate.test.js` **17 例全绿**（判据表 12 条断言 ×
  两件内置件、两件实现逐字同源的防漏修锁、occupant 渲染级「草稿非空时 `setDraft` 一次都不许发生」、
  附件 / `claimed` / `running` / 读不到快照四类停手、被挡不记冷却的「补做」顺序、手动按钮被挡的
  文案与空闲时的正常发送、change-review 半边保留待审内容连点两次仍不发，
  外加**反证四条**：摘掉闸门判断、把 `composerGate` 改成恒 `ready`、把「跳过也记冷却」写回去、
  摘掉 `blocked` 分支——每条都让对应用例按预期变形，另有一条断言变异锚点真的命中）；
  挂载方式与 `unit-goal-completion-client` / `unit-builtin-manager-client` 同族
  （真实 React + dispatcher 槽位手驱，非浏览器语义，不冒充真机实测）。
- **台账随迁**：两件 `package.json` 0.1.1 → 0.1.2，五处逐名同步（`THIRD_PARTY_NOTICES.md` §4.1、
  `docs/builtin-plugins-inventory.md` §一 与 §5.2 各一行、`README.md`、`README.en.md`），
  由 `unit-hub-registry` 的 `ledgerDiff` 咬名称/版本/许可与中英互对。
- **给当下就在被咬的用户（不必等发版）**：设置 → 「自动压缩」把开关关掉即可
  （配置在浏览器 localStorage，不改文件、不动用户数据）；或在内置插件管理页停用
  `dsh-auto-compact`。`dsh-change-review` 默认是手动模式，只有切成「自动」才会有同款风险。

### fix(release)：v1.0.4 的 Windows 包在 CI 断在 makensis 路径墙——新增构建期第二道 staging 门禁；CI 行尾差异用 `.gitattributes` 收口

两条都是「本机全绿、CI 红」的形态，且都只在 Windows 发布通道上显形。取证与判据同批入库。

- **用户可见后果**：tag `v1.0.4` 的发布 run 39056936067 里 `Windows x64 (NSIS)` 与
  `Windows ARM64` 两个 job 失败、`Windows x64 Portable (zip)` 被跳过，而 `Publish Release`
  照跑并成功——正式版 v1.0.4 已上线但**只有 Linux/macOS 资产**（`gh release view v1.0.4` 实测
  6 条资产里无一条 Windows），`releases/latest` 也指向它。主平台的更新链因此拿不到包。
- **根因（构建期的第二道路径墙，与安装态那道不同源）**：`makensis` 拿到的是
  `tauri.conf.json` 里 `bundle.resources` 的 from 串**未归一化**的字面量
  （`D:\a\dsh_desktop\dsh_desktop\dsh-tauri\src-tauri\src\app\..\..\..\package-payload\dsh-desktop\…`，
  94 字符前缀），`..\..\..\` 一个字符都没被吃掉。x64 与 ARM64 两个 job **同点**炸在
  `installer.nsi:33251`：`File: failed opening file "…\dsh-experimental-inspector\lib\devtools\
  models\issues_manager\descriptions\federatedAuthUserInfoRequestNoReturningUserFromFetchedAccounts.md"`。
  同一次 CI 里 258 字符的邻居文件正常进了包，260 字符的中断——墙就在 259/260 之间。
- **为什么本机与上一版都看不见**：本机 staging 前缀只有 55 字符（`D:\workspace\dsh\…`），
  同一条树最长 229——**短 39 个字符，本地打包永远量不到**；v1.0.2/v1.0.3（内核 0.2.0-rc.2）
  的 `dsh-experimental-inspector` 包里 `issues_manager/descriptions/` **0 命中**（实测 tarball 列表），
  0.2.1-rc.1 新增 236 条议题说明文本，才把最长名顶到 268/263/260/260/259。是内核换代带进来的，
  与我们的补丁层无关。
- **修法（判据在 lib、走盘在门禁、位置由测试咬死）**：
  - `scripts/lib/payload-plugin-deps.js` 新增 `NSIS_SOURCE_PREFIX_DEFAULT`（94，CI 口径）、
    `NSIS_SOURCE_LIMIT`（**258**——按已证通过的长度收口，259 因字母序在 260 那条之后、CI 从未走到，
    无实证故从严）、`NSIS_SOURCE_PRUNE_DIR` / `NSIS_SOURCE_PRUNES`（**5 条有名有姓**的越线文件）。
  - 新增 `dsh-tauri/scripts/stage-nsis-path-gate.mjs`：① 拿 `tauri.conf.json` 现场拼前缀与常量对账
    （挪 staging 名/位即叫）；② 按清单剪除（DevTools 前端按 URL 懒取的说明文本，缺了只是议题面板
    某几条没有正文，不影响装载）；③ 全 payload 走盘，**清单外**再冒一条越线即 FATAL 并列出三条出路
    （加清单 / 缩短 staging 路径腾前缀 / 上游压短文件名），安装态 240 那条墙也一并覆盖到内核文件；
    ④ 合规时把「最长 CI 源路径 + 剩余量」打出来，不许静默通过。
  - 接线位置是硬要求：必须在 `node_modules` 镜像与 compat 注入**之后**——现有的
    `stage-plugin-gate.mjs` 跑在 assets 镜像之后、那时 payload 里还没有内核树，所以它管不到这条墙。
    `stage-payload.sh` 末尾 1 处 + `tauri-release.yml` 五个架构 staging 各 1 处（五处同改）。
- **实测**：对现有本地 payload（82 574 个文件）跑新门禁 → 剪除 5 条、最长安装路径 215（< 240）、
  exit 0；2.6s 走盘。`unit-payload-plugin-deps` 由 7 例增至 14 例：前缀与 `tauri.conf.json` 对账、
  清单每条真的越线、258 放行/259 判红的边界、**反证「同一条文件在本机前缀下全绿」**（把本机量不到
  这件事钉成判据）、**实测哨兵**（走 pin 内核闭包里的 inspector 包，断言越线集合恰好等于清单——
  内核换代新增越线文件当场红）、接线判据 + 三种漏接变异的反证。
- **CI 行尾差异（同批，`.gitattributes` 新建）**：ci.yml run 39056911580 的 3 条红
  （`unit-prompt-optimizer-upgrade` 的「src ↔ dist 逐字节一致」20 个源文件全报不一致、
  `unit-prompt-optimizer-context-intent` D6 反证「composer 观察落点锚点丢失」、
  `unit-goal-completion-client` 反证 1「守卫摘掉后页面会谎报完成」）同源于 windows-latest 镜像
  **全局** `core.autocrlf=true` 把 checkout 变成 CRLF——多行锚点 `src.includes('…{\n\t\tsetAction(…')`
  恒 false，`replace` 静默空转，于是一条有 `assert.ok` 的当场判红、另一条连锚点都不核就把
  「未变异的成功渲染」当成反证结果。本机工作树是工具直接写盘的 LF（`git ls-files --eol` 实测
  `i/lf w/lf`），本地 2251 例 0 fail 复现不出来。新 `.gitattributes` 钉 `* text=auto eol=lf`
  并对 `*.tgz`/图像/原生件 `-text`（vendor 的 344 个内核 tgz 绝不允许被当文本规整化）；
  加入后 `git status` 仍只有本次改动 6 项，无大规模重标。
- **裁定与补发**：不重做 v1.0.4，以 **v1.0.5** 补发（本版即该裁定的产物）。
  Windows 资产的补齐只能在 CI 上验证——本机的路径短，构不出这条墙。
- **v1.0.5 首跑补正（run 39103817256 / 39104685021）**：`stage-nsis-path-gate.mjs` 有两处
  只在跨平台 CI 才显形的问题。① 前缀对账用 `path.sep` 拼串，Linux/macOS runner 上拼出正斜杠，
  与写死反斜杠的常量做字面比较 → 两个非 Windows job 在 staging 末尾误判「前缀对不上」
  （两边都是 94 字符）。② 长度判据本身只适用于 makensis——macOS 本机装的
  `libreoffice-kit-darwin-arm64` 带 `LibreOffice.app` 的长配置名，按 Windows 前缀量就是假阳性
  （12 个文件 259–265 字符），且那棵树永远不会进 NSIS。修法：前缀拼接收敛成纯函数
  `nsisSourcePrefixFrom`（固定 Windows 反斜杠，与宿主无关）；新增 `nsisGateApplies`，
  非 Windows 宿主在完成前缀配置对账后跳过剪除与长度检查。`unit-payload-plugin-deps`
  补「函数结果全反斜杠且等于常量」与平台门控的反证断言。
- **同批（CI 时序抖动）**：主分支 ci run 39103806498 另有一条与本次改动无关的唯一红——
  `unit-plugin-core-fs-atomic-deep` 的心跳用例用 `staleMs=500`，Windows runner 一次秒级调度延迟
  就让心跳迟到、B 把 A 的锁误判成陈旧锁。测试阈值提到 2000（心跳随之 ~666ms、持有窗口 6.5s），
  判据本身不变；生产默认 `staleMs=30s`。

### merge(main)：吸收 GitHub 侧 v1.0.3 的 macOS 设置写入根治，补丁层 61→62 与 0.2.1 换代合流

- **分叉事实**：本地这条线（内核换代 + 405 根治 + 插件迭代）自 `4f11af31e` 起未推，而
  `github/main` 在此之后多了两条并已发版 v1.0.3（2026-10-11，7 资产齐全）：
  `fix: macOS 上任何设置都存不了` 与 `chore(release): bump version to 1.0.3`。
  `git push github main` 被 non-fast-forward 拒是**正确行为**——强推会把 mac 用户已拿到的修复
  与 v1.0.3 的记录一起抹掉，故走合并吸收。
- **合并冲突 11 处，逐处的判据**：版本三源（`package.json` / `package-lock.json` /
  `Cargo.toml` / `tauri.conf.json`）取 1.0.4；`CHANGELOG.md` 两侧条目都留（本版 [Unreleased]
  在前、`## [1.0.3] - 2026-10-11` 成节在后）；`patch-registry.js` 与四个计数哨兵
  （`ta6-registry-invariants` / `unit-patch-registry` / `ta6-heal-rollback-audit` /
  `ta6-transform-contract`）按合并后的真数重写——**总数 62 = root 14 + file 48，cli:true 26**
  （换代退役 `pi-ai-opencode-go-models` 使 62→61，吸收 `appboot-bootstrap-singleton` 使 61→62，
  净数与换代前相同而成分已变，这是「数字相同≠没变化」的典型，别照着旧数硬改）；
  `patch-surface.snapshot.json` 不手改，`npm ci` 重收敛后重取。
- **那条 mac 补丁在 0.2.1 下成不成立——按真字节判，不按版本猜**：两条锚点
  `const bootstrapIncludes = /* @__PURE__ */ new WeakMap();` 与
  `if (entry === void 0) throw new Error(\`${binName}: profile reload requires the root Include entry\`);`
  在 `dsh-app-boot/lib/index.js`（0.2.1-rc.1，行 3859 / 3900）**逐字在位**，所以 transform 与
  marker 一字未动；新鲜 `npm ci` 实测 **写入 75 处 / 失配 0 / 失败 0 / 共 62 项**，产物里
  `bootstrap includes singleton` marker 在位。`ta6-baseline-matrix` 按真跑新增
  `0.2.1-rc.1/appboot-bootstrap-singleton: changed` 一行（漂移判据当场报出
  「基线=undefined → 现在=changed」，正是它该报的形）。
- **快照随迁**：`patch-surface` 重取后 **85 个被干预文件 / marker 家族 84→85**，`verify` 复绿；
  与补丁改动同一提交入库（悬空快照会「假绿」，见 AGENTS.md 已知坑）。
- **门禁**：`ta6-registry-invariants` + `unit-patch-registry` + `ta6-heal-rollback-audit` +
  `ta6-transform-contract` + `unit-appboot-singleton-patch` 合并后计数类 37 例全绿；
  `ta3-boot-chain`（applyAll 一条龙，含 pristine 真跑，83.9s）与 `ta6-baseline-matrix` 共 5 例
  全绿；全量 `npm test`（2026-10-18 02:07 实测）**2251 例 / 0 fail / 0 cancelled**（pass 2242 / skip 9），
  `check-syntax` 通过，`validate-pin` → `✓ dsh-v0.2.1-rc.1`。测试文件数随并 205（`*.test.js` 203 + `*.test.mjs` 2）。

### fix(companion)：文件—资源管理器「HTTP 405」根治——两件内置件的宿主 inject 从下线的 `webRuntime` 改 `connection`（0.24.1→0.24.2 / 0.4.1→0.4.2）

- **用户报障**：「文件 - 资源管理器里面我们查看不了文件了，提示 HTTP 405」。症状是 0.2.1 换代后真机 GUI 里
  文件树打不开、点文件读不出内容。
- **根因（对 pin 闭包逐字比出来，不是推断）**：0.2.1-rc.1 把 rc.2 的 `webRuntime` 服务整块删了——
  rc.2 由 `dsh-web-app/lib/index.js:30 const WEB_RUNTIME_SERVICE = "webRuntime"` + `:175 ctx.provide(WEB_RUNTIME_SERVICE, runtime)`
  提供，0.2.1 同一包只 `provide("webApp")`，**全闭包 grep `webRuntime` 命中 0 个文件**；它的唯一消费面
  `trustedHosts`（HTTP 栅栏用）迁到 `@deepseek-ai/dsh-client-connection` 的 `connection` 服务
  （`HostConnectionService.trustedHosts` / `isTrusted()`，实测 rc.2 与 0.2.1 双代都在位）。
  而 `dsh-better-sidebar`（`src/index.ts:91`）与 `dsh-basics-panel`（`src/index.ts:27`）的宿主半边仍
  `inject = [..., 'webRuntime', ...]`。
- **坏形为什么一路绿灯**：cordis 的 `inject` 是**就绪门**——名字解析不到 → fiber 永久 `pending` →
  `loader-activation-isolation` 按非核心条目静默隔离（不抛、不 `failed to load`）→ 该插件
  `ctx.webServer.register` 的 `/sidebar/*`、`/basics/*` **一条都没挂** → 资源管理器发出的
  `POST /sidebar/api/fs.trees` 落进 `dsh-host-frontend-static` 的 SPA 兜底，而兜底只认 GET/HEAD
  （`res.writeHead(405); res.end()` 空体）→ 客户端 `api.ts` 拿不到 envelope，拼出 `HTTP 405`。
  同期 boot 五步全 OK、29 条插件无一 `failed to load`、内核进程照常 listen、stderr 零 error——
  peer / 模块表 / 入口可见性 / `dsh.client` 声明 / 移除服务 id 这六道静态扫**无一覆盖这条形状**（它们看的
  是模块与 `ctx.get`，不是 `inject` 声明）。更要紧的是：本仓 AGENTS.md 曾把这同一条 `pending (waiting for webRuntime)`
  写成「无头跑的必然噪声，别当回归」，把真缺陷登记成了噪声。
- **修法（两件的 `src/` 改 + 沙箱重建回填产物）**：`inject` 与栅栏改读 `connection`
  （`isTrustedApiRequest(req, ctx.connection.trustedHosts)`）。better-sidebar 不能简单改名——它的
  `SidebarContextShape` 是宿主/客户端**共用形状**，客户端半边已有一个带 `state`/`reconnect` 的 `connection?`，
  直接占名会被 `tsc` 类型门禁当场拦下（TS2300 Duplicate identifier / TS2717 类型不一致 / TS7026 JSX 连带），
  现合成一个 `connection?: SidebarConnectionTrust & SidebarConnectionLifecycle` 并让栅栏走
  `ctx.connection?.trustedHosts ?? []`（每请求现读，替换清单不需重启插件即生效，语义与原样一致）。
  产物按上游构建链重建：better-sidebar 在 `.tmp-bs-build` 沙箱跑 `rmSync lib && tsc -p tsconfig.build.json && tsdown`
  （tsc 非零即挡住 tsdown，是类型门禁不是装饰）；basics-panel 复用同一套 devDeps 于新建的 `.tmp-bp-build`，
  其 `tsconfig.build.json` 补 `rootDir: "src"` 才能在 tsc 5.9 下出与在位 lib 同形的声明（这条是**构建可复现性**修复，
  不改任何运行字节）。两件 lib 各自回填，文件数一一对齐（192 / 33）。
- **新增第七道静态扫 `unit-plugin-inject-services`（5 用例，纯函数收敛到 `scripts/lib/plugin-inject-services.js`）**：
  按 `package.json` 的 `exports['.']`/`main` 解析每条内置件**实际挂载**的宿主入口，抽顶层 `const inject`，
  逐个服务名核对「pin 内核闭包扫出的提供集」——三形都认（`super(ctx,"NAME")` / `.provide("NAME")` /
  局部字符串常量间接；rc.2 的 `webRuntime` 正是第三形，漏了就会把在位服务误判成下线）。
  实测提供集 **159 名**（含 `connection` / `webServer` / `sessions` / `tools` / `settings`，不含 `webRuntime`），
  29 条内置件里 17 件声明非空 inject，**违规 0**。反证按事故原形打：把 `webRuntime` 回灌进 better-sidebar 的
  `lib/index.js` → 舰队判据与事故件字节锁双双判红（这正是「新守卫必配反证」的口径）；入口解析不到必判
  `entry-missing`，不许静默跳过。`kernel-pin.services.removed` 随迁登记 `webRuntime`（12 → 13 条）。
- **隔离内核实机（全新 `DSH_HOME` / `DSH_TAURI_USERDATA`，不碰真实 `~/.dsh`）**：boot 五步全 OK +
  `补丁应用汇总 写入 0 / 失配 0 / 失败 0 / 降级 0 / 告警 0 / 共 61`，`web` 起在 127.0.0.1:3194，
  stderr **零 `pending (waiting for`**（两件不再被隔离）。逐条打真路由：
  `POST /sidebar/api/fs.trees` → **200 / 2759B**（真实目录列表，含 isDir/isSymlink/hidden 位）；
  `POST /sidebar/api/fs.read` → **200 / 829B**（读出 `dsh-workspace-anchor/package.json` 正文）；
  `POST /basics/api/nope` → **404 且带插件自己的 envelope** `{"ok":false,"error":{"code":"not-found",…}}`
  ——路由在位的最硬证据，因为空体 405 的那个 405 来自兜底、不来自插件。
- **台账随迁**：`THIRD_PARTY_NOTICES.md` §4.1、`README.md` / `README.en.md` 插件表、
  `docs/builtin-plugins-inventory.md` §一 #3/#24 与 §4.2/§5.2 判定行的版本列同步；§5.1 判据面加一行判据 G、
  「六条静态扫」改「七条」。另记一条**过期判语**：`dsh-prompt-optimizer` 宿主半边注释写「桌面宿主运行时没有
  `connection` 服务」，本轮实测在 0.2.1 下不成立（`connection` 由 `dsh-client-connection` 无条件提供，
  只有其 `/api` 传输半边才 `ctx.inject(['webServer'])` 条件挂载）——碰那条线前先按判据 G 复核，别据注释回退。

### fix(plugin)：dsh-workspace-anchor 0.1.0 → 0.1.1 —— 0.2.1 撤除 `{{cwd}}` 提示词变量的连带坏（2026-10-17 隔离实机）

- **症状只有真发消息才看得见**：换代后在隔离 home（临时 `DSH_HOME` + `DSH_TAURI_USERDATA`）里发一条消息，
  界面直接「处理失败 / UNKNOWN」，原文 `unknown prompt variable "{{cwd}}" in section "dsh:workspace-anchor";
  registered variables: provider, model`。boot 五步全 OK、29 条插件全部加载、页面无任何报错——
  坏在**每一条 prompt 的装配期**，等于「客户端打不开话」。稳定三原则第 1 条的判据面。
- **判据是对两份内核逐字比出来的**：rc.2 的 `dsh-agent-loop` 有三行变量注册
  （`vendor/dsh-kernel/deepseek-ai-dsh-agent-loop-0.2.0-rc.2.tgz` 解包后 1564-1566 行，第三行就是
  `variable("cwd", (context) => context.agent?.session.header.cwd)`），0.2.1-rc.1 同一处**只剩 provider / model**；
  而 `dsh-system-prompt` 的装配 throw 在两个版本逐字相同（合法但未注册的变量必抛）——
  所以坏的不是我们的补丁，是上游撤掉了一个公开变量，而 rc.2 的 README 还把 `{{cwd}}` 当示例教人用。
- **修法两层，都不依赖内核版本**：① 锚点文本由插件自己把 `agent.session.header.cwd` 填成实路径，
  并给节标 `interpolate: false`（装配期不再扫描它，路径里真出现 `{{` 也不会炸）；
  ② 顺手按 rc.2 原形状把 `cwd` 变量补注册回去，让别的节和用户自写文本（`dsh-prompt-custom` 的提示词卡）
  里的 `{{cwd}}` 继续可解析。`header.cwd` 缺失时**宁缺不炸**：不注册锚点。
- **回归锁 `unit-workspace-anchor-cwd` 4 例**，判据直接拿真渲染函数 `require('@deepseek-ai/dsh-system-prompt').renderPrompt`
  作证：新形状必须渲染出实路径，**旧形状（带 `{{cwd}}`、未关插值）必须抛** `unknown prompt variable`——
  反证不打桩，避免「用例替一条不存在的契约作证」。台账四处随迁（`THIRD_PARTY_NOTICES.md` §4.1、
  `docs/builtin-plugins-inventory.md` §一 + §5.2 #9、`README.md`、`README.en.md`）由 `unit-hub-registry` 复绿。
- **实机复验**：同一隔离环境重跑，人轮正常落盘、错误退到预期的 `MISSING_CREDENTIAL`（沙箱里没有密钥），
  `unknown prompt variable` 零命中；顺带在同一次实机里跑通 dsh-prompt-optimizer 2.4.0 的
  上下文/意图/撤销全链（第二次 `✨` 请求体里 `recentConversation` 带上了上一轮原话）。



### feat(kernel)：内核换代 0.2.0-rc.2 → 0.2.1-rc.1 —— pin/vendor/锁/补丁层四线随迁（2026-10-17）

- **换血三处同步**：`scripts/compat/kernel-pin.json` 的 exact pin 与 tag 改 `0.2.1-rc.1` /
  `dsh-v0.2.1-rc.1`（禁止浮动的老规矩不变）、`vendor/dsh-kernel/` 整批换成 0.2.1-rc.1 的
  350 份离线 tgz（旧 rc.2 全清）、`generate-kernel-lock.mjs` 重生成 `kernel-lock.json` 与
  `package.json` 的依赖声明。`node scripts/compat/validate-pin.js` 绿（fail-closed 口径）。
- **重收敛证据不是推断**：`npm ci` 走完整 postinstall（install-kernel + patch-deps），
  patch-deps 报 **写入 74 / 失配 0 / 失败 0**；随后 `patch-surface.js snapshot` 重取
  **85 文件**、`verify` 复绿——AGENTS.md 已知坑里「悬空快照会假绿」这条要求快照与改动同一提交。
- **锚点随迁 8 处**（每处都是内核字节真变了，不是漂移）：
  ① `dsh-api-gateway` 的 `lib/client.js` 拆成 `client.node.js`（2 tab 缩进）+ `client.browser.js`
  （4 tab），靶面从单 `pkgRel` 改 `GATEWAY_CLIENT_PKG_RELS` 两条；
  ② `journal-prepend-continuity` 原锚点写死 4 个 tab，node 半边真字节是 2 个 tab → 改成
  **缩进捕获**的整行正则（`^(\t+)…$` + `gm`），注入体按命中缩进回填，半边缺失从此可判；
  ③ `dsh-session-persistence` 的损坏会话分支由 `continue` 改成 `return { selected, metadata: void 0 }`，
  告警补丁的 OLD 锚点连形状一起重锚（`catch` 体三 tab，正则相应 `\t+\}`）；
  ④ `dsh-llm-pi-ai` 把匿名 map 回调提为具名 `piTool(tool)`，`pi-ai-tool-name-wire` 的注入位随之
  改锚 `function piTool(tool) {`，并新增**出站**替换 `toolsOf-outbound`（`name: tool.name` →
  `name: __dshPiWireToolName(tool.name)`）；
  ⑤ `dsh-api-workspace-controller` 的 typert 描述符由「数组 + id 字段」改成
  `'<namespace>/<method>'` 键控对象（带 `codec`/`strictCodec`/inline `jsonSchema`），且 schema 不再
  包 `z.intersection(...)`——`patch-session-manage.js` 五组锚点全部重写为**生成器**（loose/strict
  两种 schema 各一份），strict 一族补齐注册；
  ⑥ `dsh-app-boot` 读 bundles 外包了一层 `dropRetiredBundles(dir, manifest)`，
  `profile-bundle-heal.js` 两处注入锚点同步（controller 的 `static inject` 声明变多行并新增
  `"remoteAccess"`，注册面注入锚点一并改形）；
  ⑦ `evaluatePluginCompatibility` 返回的信封字段 `peers` → **`requirements`**（实测键面
  `name/version/runtimeVersion/requirements/exempted`），peer 门槛哨兵随迁；
  ⑧ `dsh-token-meter` 的 `contextBreakdown` stateVersion 5 → **6**（`contextPressure` 4 → 5、
  `tokenUsage` 仍 2），`dsh-host-directory-picker-auto` 解析器新增 `allowsRemoteAuthorities` +
  `isLoopbackHost` 两个边界参数，`@earendil-works/pi-ai` 0.87.1 → 1.3.0。
- **退役 1 项补丁：`pi-ai-opencode-go-models`（62 → 61，root 15 → 14）**。判据是「上游已自带」而非
  「锚点丢了」：0.2.1 的 opencode-go 端点目录 37 个 id 已无 `vision-exp` 后缀、catalog 回 `chat:<id>`
  裸键，与本补丁要整形出的目标形状逐字相同——继续打等于把内核自己的映射再覆写一遍。
  `patch-registry` 留【已退役 0.2.1-rc.1】证据注记，`patch-adapters` 摘接线，脚本与其单测 `git rm`，
  `check-syntax.js` 入口清单同批删。
- **两道基线锁按真跑重录**：`ta6-baseline-matrix` 新增 `BASELINE['0.2.1-rc.1']`
  （**42 changed / 14 root / 5 target-absent**，零 anchor-missing、零 already、零 THROW——与
  patch-deps 的「失配 0 / 失败 0」互为对账），`ta6-registry-invariants` 与
  `ta6-heal-rollback-audit` 的计数与 `cli:true` 口径（61 / 14 / 25）随迁；pristine 闭包由
  `scripts/install-pristine-kernel.mjs` 解出 `.consumer-0.2.1-rc.1`（350 包），7 个 pristine 哨兵套件
  在新闭包上复绿。
- **隔离内核实机抓到一条只有真开机才现形的自造坏形（这就是这条线存在的原因）**：上面 ⑤ 的重锚把
  `dsh-api-remotes/lib/client.js` 打成 SyntaxError——remotes 注入体在锚点之后多抄了一遍无头
  `sourceLocation` 尾巴（`"file"/"line"/"column" } },`）。链路全程无红：`check-syntax.js` 只扫本仓入口、
  patch-deps 只判锚点与 marker（写入 74 / 失配 0 照绿）、`patch-surface verify` 只比字节（旧快照与坏产物
  互证一致）、boot 五步全 OK、内核 node 正常 listen、stderr 零 `failed to load`。坏形显形在浏览器：
  `__ModuleLoader__` 对 combo 任一成员解析失败即整束「skipped after an earlier failure」，页面渲染成
  `Failed to load plugins` 铺满 **80 条**（`dsh-client-ui-*` 全家 + `dsh-cordis-client-runner`），
  首屏只剩错误面板。修好后同一套隔离环境复跑：面板消失、composer/侧栏/右栏齐活，
  插件-contributed 界面位在位（`✨` 润色、导出会话日志、会话地图、文件浏览、文件变动、任务管理、侧边对话(beta)），
  29 个内置插件目录全部同步进 profile、`dsh-reasoning-effort` 无残留，
  stderr 仅两条 `pending (waiting for webRuntime)` 的 auto-isolated（`better-sidebar`/`basics-panel`，
  无头跑的必然噪声，连带其 `/sidebar/api/*` 405 与 `/sidebar/ws/agent-opens` 连不上）。
- **新增门禁 `unit-patch-output-parsable`（2 例，含反证）**：判据源复用 `patch-surface` 的同一套 marker 扫描，
  扫出装机树 **109 个被干预产物**（比 `@deepseek-ai` 单根快照的 85 个宽，含 `@earendil-works/pi-ai`、
  `@openai/codex`、`@anthropic-ai/sdk` 跨根件），逐个按 CJS + ESM 双形态编译（实测 5 个 ESM 产物按单形态判会误报）。
  反证用本轮真实坏形：残留尾巴必须被判红、修好的形态必须判绿，并直接扫 `patch-session-manage.js` 源文本，
  防止同一个无头尾巴被再抄一遍。快照随本轮修复重取（85 文件）并与改动同一提交入库。
- **内核删掉的公开面**（不是本仓库改的，记在这里省下次找）：`dsh-agent-preset-registry/lib/invariant.js`
  文件已不存在，`dsh-session-persistence-jsonl` 不再导出 `JsonlSessionPersistence`——依赖这两者的
  用例改为自建夹具 / 追加导出行。

- **重打包与安装布局冒烟收口**（2026-10-17 同批）：`stage-payload` → `tauri build`（gnu 链，换代那轮
  出包 195,610,689 B；405 修复后第二轮 195,643,131 B / sha256 `36def038…57bb8e31`）→
  `smoke-installed` PASS 三段实测数字与冒烟布局内的换代专项核对（内核版本、
  `dsh-api-remotes/lib/client.js` 语法、workspace-anchor 0.1.1）、以及新 payload 安装树上
  「boot 五步全 OK + 共 61 + `/sidebar/api/fs.trees` 由空体 405 变 400 带插件 envelope」逐条记在
  [`dsh-tauri/CHANGELOG.md`](../dsh-tauri/CHANGELOG.md) 同名条目，本文件不重复。

### chore(plugin)：退役 `dsh-reasoning-effort` 0.8.1 —— 内核 0.2.1 已整块接走（在册 30 → 29）

- **判据是覆盖关系，不是版本号**（对 0.2.0-rc.2 / 0.2.1-rc.1 两份 pristine 树实测）：
  它自称的独立面「自定义 provider 缺 `reasoningEfforts` 声明 → 给 copy-ready 指引」，0.2.1 的
  `dsh-client-ui-settings-models` 已整块接走（新增 `ModelReasoningEfforts` 编辑器，同一份
  Config 校验 `validateReasoningEfforts`，`reasoningEffort` 命中 0 → 21）；它的 Codex 风格
  「模型 + 强度」滑块与官方 composer 选择器重复，且这条**在 rc.2 就成立**
  （`dsh-client-ui-model-selection` 的 `effort`/`effortLabel`/`effortChoices`/`advertised` 计数两版逐字相同）。
- **反向对照也做了**：`input-fold` / `conversation-tweaks` 只在真机上还需比对，
  `goal-completion` / `builtin-manager` / `prompt-optimizer` / `auto-compact` / `subagent-lens` /
  `better-sidebar` 在新内核上面无覆盖，全部保留。
- **撤的是同一条清单的反向操作**：`COMPANION_PLUGINS` 条目移除 → `RETIRED_COMPANIONS` 登记判据 →
  `RETIRED_COMPANION_DIRS` 认领 `assets/plugins/dsh-reasoning-effort` 过期清理 → 源目录 `git rm`；
  四处逐名 1:1 台账（`THIRD_PARTY_NOTICES.md` §4.1、`docs/builtin-plugins-inventory.md` §一、
  `README.md`、`README.en.md`）同批 30 → 29，行序与中英互对由 `unit-hub-registry` 的 `ledgerDiff` 咬住。
- **不随退役下线**：`patch-pi-ai-reasoning-defaults`（默认强度字典在服务端半边，与这份 UI 件无关）。
  复活姿势 = 从 git 历史取回清单条目 + 插件目录，已在撤回账注释里写明。

### feat(plugin)：dsh-prompt-optimizer 2.3.0 → 2.4.0 —— 接上上一轮对话、意图可核对、一键撤销（2026-10-17）

- **缘起**：用户原话「提示词润色插件……主要是不是很关联上下文（尽量要考虑到上一条对话的上下文），
  最好要猜到用户的意图，然后再优化」，并点名学 Qoder 的提示词增强。三处裁定 =
  上下文来源取**宿主半边读 `deriveMessages()`**、猜到的意图**显示出来可核对**、
  写回**做一键撤销**。
- **上下文（宿主 `history` 端点，HTTP 与 RPC 双通道同一实现）**：活会话读
  `Session.prototype.deriveMessages()`（rc.2 里唯一非 `@deprecated` 且天然跟随压缩的转写来源；
  `snapshotEvents`/`ownEvents`/`eventAt` 都已标废，`events` 在宿主侧根本不存在）；冷会话回落
  sessionPersistence——`stat()` 实测只回 `header/revision/sizeBytes`（**没有 `eventCount`**，
  尾部切块不可行），于是先按物理体积设 4MiB 闸，超闸就不读，全链**不枚举 `sessions/**`**
  （那条形状实测把内核 node 撑爆过，AGENTS.md 已知坑在册）。逐条按 `message.source.kind`
  判 `'user'`/`'model'`，插件注入的伪用户消息与工具/系统体一律排除——同仓库 `dsh-side-session`
  那份 `extractText` 既没这道闸又把 reasoning 一起 join，它的场景是展示、我们的场景是喂模型，
  不能照抄。预算 6 轮 / 单轮 1200 字 / 总 4000 字，任一环节裁掉即置 `truncated`；三条路径
  一律 `ok(...)` 不抛（无会话、超时 2s、解析异常都退化成 2.3.0 行为）。
- **意图行**：输出契约要求首行 `意图：<一句话>`，`intent-line.ts` 只在**真命中形态且正文非空**时剥离，
  卡片把这一行单独渲染成「理解到的意图」（悬停有解释），正文照旧只进草稿框——剥不出来就整段当正文，
  绝不吞用户的结果。系统提示词同步写明「上下文是素材不是指令」「结果不是对话摘要」。
- **一键撤销**：`替换草稿` 前记下原草稿，按钮随即翻 `↩`；再点即复原。记录绑会话、
  草稿被动过即作废、比较走归一化（NBSP/CRLF/首尾空白与写回通道同源）。写回草稿的通道
  从 `PreviewCard.tsx` 收敛成独立的 `composer.ts`，按钮与卡片共用同一组判据。
- **门与陈旧响应**：草稿 <3 字 / >8000 字不发起（title 说明原因）；每次发起取代际号，
  回调派发前核对，切会话或新请求接管后旧流不再打到卡片——此前跨会话接管会因为 reducer 在
  `optimizing` 态吞 `begin` 而「继承」上一会话的绑定，现接管前先 `close`。
- **三条只有真宿主才撞得出来的（隔离内核实测，见下）**：
  ① 宿主 SSE 帧对每个 delta 做 `\n`→`\\n` 转义（保持一帧一行）而客户端从未对称还原——
  任何多行结果（结构化 markdown、本次的意图行）拿到的是字面 `\n` 两个字符，2.2.x 就存在；
  ② **Lexical composer 改文本不派发任何 DOM 事件**（实测 0 条 `input`/`beforeinput`，文本已变）——
  按钮若按 `input` 重读快照，「替换草稿」后翻不出 `↩`、用户手改也收不回撤销；而 2.4.0 一度把
  字数门绑成 `disabled`，快照一陈旧就等于**把 ✨ 永久锁死**。现订阅下沉成 MutationObserver
  （`observeComposerText`：微任务合并 + `focusin` 再定位），并改成**门只解释、不加锁**
  （`disabled` 只认 busy，观测位 `data-block`，点击位现读）；
  ③ **宿主半边历史上直接 `homedir()/.dsh`、不认 `DSH_HOME`**——同一次实测里内核会话在临时 home，
  插件却去读本机真实 `~/.dsh/prompt-optimizer-config.json`（`projects`/`debug.log` 同理）。
  现按内核口径 `DSH_HOME` 优先、无则回落 `~/.dsh`，真实用户侧一字不变。
- **实机证据**（隔离 `DSH_HOME` = `.tmp-po24-e2e/home`，boot 五步全 OK，内核 web `127.0.0.1:3180`，
  假 OpenAI 兼容 SSE 服务 `127.0.0.1:3199` 记录请求体；全程不碰真实 `~/.dsh` 与 `%APPDATA%`）：
  发一条真消息造出上一轮（模型侧因无凭证 `MISSING_CREDENTIAL`，人轮照常落盘——正好用来验过滤闸）→
  `POST /api/history` 回 `{turns:[{role:"user",text:"我刚把 npm test…"}], source:"live"}`，
  错误轮与注入体 0 混入 → 点 ✨：假服务收到的请求体 `system` 里「上一轮对话的用法」段在位
  （顺序 正文→上下文→意图契约），`user` 侧 JSON 证据键 = `originalPrompt` + `recentConversation`
  且内容就是那句真实上一轮 → 卡片同时亮「已读上一轮对话」与「理解到的意图」两行，正文多行含围栏块
  且换行是真的换行 → 「替换草稿」写进真 Lexical 后卡片关闭、按钮翻 `↩` → 点 `↩` 逐字复原原草稿。
- **台账与门禁随迁**：版本 2.4.0 五处同步（插件 `package.json` / 插件 `CHANGELOG` /
  inventory §一·§三·§四·§5.2 #27 / README 中英两表 / `THIRD_PARTY_NOTICES` §4.1）；
  §5.2 #27 兼容实测七数与 §5.1 舰队总量 2026-10-17 复算**全部不变**（75 别名 / 434 成员 /
  27 条 client 入口 / 53 处裸名取用 / 57 条 dsh.client 声明，本插件 5 别名 · 0 成员 · 2 裸名 ·
  缺失 0 · 表外 0 · 声明 3 · 移除引用 0）；随包 `src/` 16→**20** 文件（新增
  `conversation-context.ts`/`intent-line.ts`/`undo-bus.ts`/`composer.ts`），sourcemap 入包源
  14→**19**（`settings-epoch.ts` 只供类型引用可被剥离），`dist/client.js` 461.2→467.9 KB。
- **回归锁**：新增 `unit-prompt-optimizer-context-intent.test.js` **37 例**——宿主 history 有界与
  source 闸 / 两半信封与 SSE 转义往返 / 上下文进请求体与系统提示词分段顺序 / 挂载卡与按钮的
  撤销与门态 / composer 观察落点 / 代际守卫，含 **7 条变异反证**（摘 source 闸→注入体混进上下文、
  门写反→没历史也讲历史、比对退回逐字→nbsp 场景失效、代际守卫摘除→陈旧回包复活卡片、
  观察落点摘除→手改收不回撤销、宿主 home 不认 `DSH_HOME`→落点分裂…）。夹具按宿主**真形状**造：
  信封 `{ok,value}`、SSE 帧按宿主写侧转义、composer 变更**只改 DOM 不发事件**。
  既有三套随迁：`unit-prompt-optimizer-upgrade`（SRC_FILES 16→20、2.4.0 标记、观察落点与
  `data-block` 两条标记锚点）、`unit-prompt-optimizer-project-goal`（repair 变异锚点随
  「repair 提前返回」重写、`DSH_HOME` 钉进临时目录）、`unit-prompt-optimizer-lexical-write`
  （文案锁源路径 `PreviewCard.tsx`→`composer.ts`）。

### feat(companion)：新内置插件 `dsh-goal-completion` 0.1.0——右栏「目标收尾」标签页，补上官方没暴露的 `complete`（2026-10-16）

- **缺口是实测出来的**：远端 `ctx.remote.goals` 有七个动词（get / edit / pause / resume /
  **complete** / clear / create），官方 `dsh-client-ui-goal` 的 GoalBar 只暴露
  save / cancel / pause / resume / edit / clear——**complete 在界面上无处可点**，目标只能等
  agent 自己收尾（`dsh-tool-goal`）。状态面同样有盲区：官方字典只有
  `phase.active` / `phase.active.disarmed` / `phase.paused` / `phase.blocked` 四键，
  **连 `phase.complete` 这一档都没有**，`blocked` 的 code + 原因原文也不显眼。
- **形态（用户裁定「轻的」+ 界面落点=右栏标签页）**：`sidebarRightTabs.register`（页面型、
  `priority: 'extension'` 让位内核自带三标签）+ `sidebar.right.pane.tab` 槽主体；入口是标签条
  「＋新标签页」打开的引导页里那枚胶囊（不自动弹出：完成是终态，弹窗式引导会逼人误点）。
  按钮**两次点击确认**（8 秒窗口 + 取消），写带 `{id, revision}` 的 CAS，被拒显示原文并重读。
  界面全走 sanctioned 面：`ctx.locale.register/bind` 字典命名空间（槽位声明 `locale: NS` →
  renderer 注 `t`，切语言整体重渲染）+ 原语 `Tag`（八档语义色）/ `Button`（四档 variant），
  不覆盖原语配色；`sidebarRightTabs` 走 `ctx.inject` 的**可选**接法，缺这套件的内核只是不注册标签。
- **两条只有真内核才撞得出来的宿主契约**（详见 AGENTS.md 同名片段与 §5.2 #30）：
  ① `ctx.remote.*.*` 回的是**信封** `{ok:true, value}`，按裸载荷解析时 `view.id` 恒 undefined，
  界面把「有目标的会话」显示成「还没有目标」——不报错、console 干净；
  ② 投影快照 `{goal:{…}, roundsStarted, createdAt, updatedAt}` **不含 `activation`**，
  它只在远端那份 `value` 里，官方 GoalBar 同样是两条线组合，故本插件按 `id`+`revision` 对齐后合并。
  另外「被拒」分支原先只把原文上屏、没真的重读，而文案承诺了「已重新读取最新状态」——一并补齐。
- **实机证据**（隔离 `DSH_HOME` = `.tmp-goal-e2e/home`，boot 五步全 OK，内核 web `127.0.0.1:3080`）：
  用 `/goal 验证收尾链路` 造出真目标（本轮因无凭证失败，正好是「目标在、agent 不跑」那一档）→
  面板显示「未运行 · 验证收尾链路 · 轮次 1 / 256 · 修订 1 · 不再续跑」，与官方 GoalBar 同一措辞 →
  两次点击 → 胶囊转「已完成」、**修订 1→2**、按钮消失、给终态说明，且会话区 GoalBar 同步不再显示该目标。
- **台账与门禁随迁**：在册 29→**30**（`COMPANION_PLUGINS` 追加 `{ id: 'goal-completion',
  name: '@deepseek-ai/dsh-goal-completion' }`，id 与其 bundle 层 `cordis.patch.yml` 的 loader id
  同源——issue #104 那条坑）；四处逐名 1:1（THIRD_PARTY_NOTICES §4.1、inventory §一 #30 / §5.2 #30、
  README 中英两张表）；§5.1 舰队总量按 2026-10-16 复算刷新（75 别名 / 434 成员 / 27 条 client 入口 /
  53 处裸名取用 / 60 条入口 / 57 条 dsh.client 声明，全列尾计数仍为 0）；计数哨兵随迁
  （`unit-plugin-peer-floor` 30 条、`unit-hub-registry` 挂载命中 28→29、`unit-plugin-channels` 30）。
- **回归锁**：新增 `unit-goal-completion-client.test.js` **27 例**（含 5 条反证：摘 `ok===false`
  分支→谎报完成、摘终态门控→已完成仍可点、摘第一击确认→一击落库、摘事件 sessionId 过滤→跨会话串台、
  放宽 `isGoalView`→空载荷画出可点的卡）。夹具按宿主**真形状**造（`get` 默认回信封、投影快照用探针
  原文），投影面按「真订阅 / 真摘除」建模——否则「stop 之后不再重读」是在为夹具的假语义作证。

### fix(shell)：⋯ 菜单「显示余额/本轮费用」退役——死开关根治，dock 开关迁到 dsh-balance 设置条目（2026-10-16）

- **症状与真因**：⋯ 菜单的「显示余额/本轮费用」勾选点了没反应。菜单写的是**壳侧** settings.json
  （`%APPDATA%/dsh-desktop/settings.json` 的 `showBalanceDock`），而 `dsh-balance` 插件只读
  **内核**设置条目（profile 条目 id `balance` 的 config 块，`settings.describe()` 读法）——两处互不相通；
  且插件从未导出 Config，该条目在内核设置 `describe()` 里根本不出现（只收录「导出 Config 且含
  volatile 字段」的 fiber 活条目）。自设置子系统迁到内核 SettingsForms（rc.2）起它就是个死开关：
  写不进、不报错。
- **处置（两条腿）**：① 壳侧菜单项、`app_init` 返回键与 `menu_action` 的 `toggle-balance` act
  同批摘除（通道号与命令名不复用）；② `dsh-balance` 0.2.0 导出 `Config`——`showBalanceDock` /
  `showOpenCodeGoUsage` / `balancePrices` 三条 volatile（DSH fork 的 `@deepseek-ai/schemastery`，只有 fork 会把
  volatile 字段包成 cosmokit 引用、live-commit 才提交得动）；③ 开关的用户面由**客户端半自注册**：
  实测「导出 Config 后内核自动生成设置页」不成立（`autoGenerate` 在客户端包 0 消费方，设置导航每项
  都要自己注册），故两行开关注入 `settings.general.item`，写回走
  `ctx.remote.settings.mutate("balance", [{op:"set",path:[field],value}], revision)`；dock 显隐亦直读同一
  scope（宿主后台 180s 才真发一次、客户端 60s 读一次，只认载荷 `disabled` 位的话关掉后最长挂约 3 分钟，
  冷启首轮还抢在 settings 就绪前闪一下）。
- **`balancePrices` 价目覆盖复活**：`projectForm` 只投影 volatile 声明过的字段，未声明的手写 config 键
  会被丢弃——实测种子 99/9.9/88 进不了价目表，README 承诺的覆盖自 rc.2 设置迁移起就是死的。现一并声明
  为 volatile 字典（内层档默认可选，半份覆盖由 `applyPriceOverrides` 回落内置有效价），并删掉同属死读的
  `section.prices` 别名。
- **防回潮**：新增 `unit-balance-config-entry.test.js`（Config 可解析 + toJSON 形态 + 三字段全 volatile +
  字段名三方一致（Config ↔ readSettings ↔ scheduler 消费点）+ readSettings 只认投影字段（未声明键与
  `section.prices` 死读负例）+ 壳侧摘除 + 兄弟开关反证不复伤 + 三条负向判据的变异体反证）；
  新增 `unit-balance-settings-client.test.js`（两行注册形态、点击写回的 wire 契约
  `mutate("balance", ops, revision)`、依赖置灰、describe 失败/条目缺席/writable=false 三种降级）；
  `ta4-balance-client-legacy-inject` 随 capability 变更重述（inject 三处、旧宿主降级 register 三处）；
  `unit-balance-legacy-retire` 与 `ta7-contract-audit` 的负断言按「登记形态」判（散文注释里的退役说明不算代码复活）；`ta16-golden`
  菜单文案快照重取（-1 项）；`shim.rs` 增两条字符串存在性断言（`toggle-balance` / 「显示余额」不得回潮）。
- **隔离内核实机实测（2026-10-16，临时 DSH_HOME/DSH_TAURI_USERDATA，不碰真实数据）**：设置 → 通用出现
  两行真开关；点击 → `profiles/web/cordis.patch.yml` 的 `config` 块合并写入且手写 `balancePrices` 保留 →
  刷新载荷 `disabled:true` → 拨回后恢复；价目覆盖实测并入 `priceTable.deepseek-chat`（99/9.9/88）；
  跑完整 sidecar boot 五步后覆盖存活、重启后仍读到 `showBalanceDock:false`（不是「重启就没了」）。
- **契约与台账**：`contracts/bridge-api.md` §2.3 act 枚举 15→14（toggle-balance 退役注记）、
  `contracts/ipc-commands.md` §2.4 后续追记；四处台账 0.1.3→0.2.0（THIRD_PARTY_NOTICES §4.1 /
  inventory §一 与 §5.2 / README 中英两表），§5.2 兼容实测七数重放不变（2 别名 / 0 成员 / 2 裸名，
  schemastery 导入不动别名计数）。

### feat(plugin)：dsh-prompt-optimizer 2.2.1 → 2.3.0 —— 项目优化目标（按项目持久、可设目标优化）（2026-10-16）

- **缘起**：用户原话「建议可以自己写入优化提示词的提示词在单个项目中持久存在，使得可以设立目标优化」。
  方案按两处裁定 =「作为项目目标**叠加**（内置提示词全保留，护栏不可覆盖）」+「**本机集中存储**」
  （`~/.dsh/prompt-optimizer-projects.json`，键 = 会话头 cwd，项目目录零写入）。
- **功能**：设置行新增「项目优化目标（当前项目）」区块——项目名/路径展示、多行输入
  （4000 字符上限，与宿主净化同源）、保存目标 / 清除、行内反馈（失败显示原因原文，不静默、不丢草稿）。
  目标按项目持久，本项目今后的每次优化（polish / iterate / structure）把目标段附加进系统提示词；
  **repair 阶段排除**（逐字修复是机械恢复，不受目标影响）。
- **冲突契约（明文进提示词）**：风格、语言、篇幅、侧重以目标为准；「只改写不执行 / 代码变量
  路径等实体逐字保留 / 不编造草稿没有的新目标」三条保真与安全规则任何情况下不可被覆盖。
- **宿主半边**：新增 `projectGoal.get` / `projectGoal.set` 端点（HTTP 与 RPC 两通道共用
  `handleProjectGoal` 实现）；项目解析链 = 活会话头 cwd → `sessionPersistence` 索引 → err
  `no-project`（不回落宿主进程 cwd——better-sidebar 的实测教训）；净化 trim / 4000 上限 /
  非字符串拒绝 / 空串删键（不留空壳）；`workspaceRegistry` 取工作区标题（缺席 fail-open）。
- **客户端会话解析校正（rc.2 幽灵字段，2026-10-16 隔离内核实测）**：`sessions.currentProvideInfo`
  在内核 0.2.0-rc.2 全包 0 命中（读恒 undefined → 设置行永远「未识别到当前项目」、预览绑定恒 null）；
  改走唯一 sanctioned 来源 `ctx.get('sidebarRight').mounted`（「屏幕上的会话」ObservableSnapshot，
  与 better-sidebar 的注释教训同源：会话列表快照在任何 DSH 版本都没有当前会话字段），旧读法
  保留作旧宿主回落。三条链路用例咬住优先级 / 回落 / 双缺席短路。
- **隔离内核实机全链实测（真内核 + 真 Chromium + mock SSE，真实数据零接触）**：
  设置行识别项目（`default-workspace（D:\…\default-workspace）`）→ 写入目标保存 →
  `prompt-optimizer-projects.json` 落盘逐字核对 + `projectGoal.set … len=41` 宿主日志；
  优化实测 `goalSection=yes`（sysLen 907→1134，system 尾部逐字含目标段与三条不可覆盖契约）、
  卡片「已应用项目目标」点亮；缺 `{{变量}}` 草稿实测 repair 阶段 `goalSection=no`（1134→726）；
  清除后文件回 `projects: {}`、再优化 `goalSection=no` 且卡片无标记。
- **客户端**：`src/project-goal.ts`（新，16 文件）通道面 + fail-open（3s 超时）；
  `buildSystemPrompt(lang, task, projectGoal?)` 叠加；卡片头部「已应用项目目标」标记
  （`goalApplied` 只在真正生效的这轮点亮，begin 归零）；取目标失败与无目标行为与 2.2.1 完全一致。
- **回归证据**：新增 `unit-prompt-optimizer-project-goal.test.js` **24 例**——纯函数叠加
  （zh/en 三任务、trim、多行、repair 排除）+ **变异反证**（删掉排除守卫必须让目标进入 repair）+
  **端到端 SSE 请求体实测**（目标真进入 optimize.stream 的 system；缺变量触发 repair 时该阶段
  system 不含目标；fail-open 两态；第二轮 begin 归零）+ **宿主 HTTP 路由实跑**（apply 捕获的真路由，
  隔离 home 前置守卫 `os.homedir()==TEST_HOME`，get 不写盘 / set 落盘 / 冷会话持久化回落 / 清除 /
  按项目隔离反证 / 四类拒绝码 / registry 缺席）+ **设置行 mini 挂载**（无项目提示、播种、保存/
  清除/失败反馈，两条行为反证）+ 两半 `MAX_GOAL_CHARS` 一致锁。升级锁套件随迁（16 文件、
  2.3.0 标记、errorDetail 解构正则泛化）；升级/写回两套件全绿（15 + 6 例）。
- **版本**：2.2.1 → 2.3.0（插件 `package.json`、`THIRD_PARTY_NOTICES.md` §4.1、
  `README.md` / `README.en.md` 双表、`docs/builtin-plugins-inventory.md` §一/§三/§4.1/§5.2/§5.3、
  插件 CHANGELOG）。

### feat(plugin)：dsh-builtin-manager 0.1.0 → 0.2.0 —— 内置插件页交互与视觉重做（搜索 + 状态筛选 + 单列表行内反馈）（2026-10-15）

- **缘起**：用户原话「优化一下我们的内置插件管理页面，使得其能够更正式和好用」。
  方案按裁定 =「搜索 + 筛选 + 单列表（推荐）」：工具栏（搜索 + 重新读取）+ 状态筛选段
  （全部 / 已启用 / 已停用，**计数与列表同源**）+ 单列表卡片行，行内反馈。
- **边界**：宿主半边与写入链**完全不动**——`lib/index.js`、`settings.plugins.tab` 注册面、
  `dsh:plugin-list` / `dsh:plugin-set-enabled` 通道、自锁行、无桥兜底全部原样；
  本版只重写 client 半边（0.1.0 的页面级「已保存」单条提示改为行内反馈：在途「正在保存…」
  置灰 / 成功「已保存「×」为启用/停用。」+「已改动 · 下次启动生效」徽标 / 失败桥原文上屏
  且不翻转行状态）。
- **搜索与筛选**：按 id / 名称 / 说明三分支过滤（大小写不敏感），无命中给出路；
  筛选标签带计数，筛选后另有「共 N 条 · 当前显示 M 条」——两处数字从同一份 rows 现算。
- **视觉**：全套内核设计系统原语（Button / Switch / SegmentedControl / Input / Tag + 官方图标），
  颜色与圆角走 `--dsw-*` 变量，与 prompt-custom 0.5.0 同一视觉语言；原语引入面与内核真包
  产物交叉核对由回归套件钉住，改引入必须同步断言。
- **回归证据**：client 套件 10 → **12 例**（8 正 + 4 反证：摘 group 过滤 / 摘 `ok===false` /
  摘自锁 / 摘搜索过滤）；隔离内核实机（真内核 + 真 Chromium + mock 桥 29 条真实数据，
  SHA-256 逐字节对账）全链实测：搜索 / 筛选 / 组合无命中 / 开关往返成功 / 失败路径
  （EPERM 原文上屏）/ 在途门控 / 自锁行 / 无桥只读逐条闭环；内核 served-bytes 核验 rev
  随文件更新、无需内核重启。
- **台账**：四处逐名 1:1 随迁（THIRD_PARTY_NOTICES §4.1、inventory §一与 §5.2、README 中英表，
  §5.2 裸名 2→3 为新增内核原语包引入、经本地重放实测）；顺手对齐 README 两处滞后在册数
  （28 → 29，与 en 版及表格实际行数一致）。
- **版本**：0.1.0 → 0.2.0（插件 `package.json`、`THIRD_PARTY_NOTICES.md` §4.1、
  `README.md` / `README.en.md` 双表、`docs/builtin-plugins-inventory.md` §一/§5.2、插件 CHANGELOG）。

### feat(plugin)：dsh-prompt-custom 0.4.0 → 0.5.0 —— 设置页交互与视觉重做（卡片即提示词 + 内核设计系统）（2026-10-15）

- **缘起**：用户原话「把自定义提示词的界面改改，现在的逻辑很差，界面也不好看不方便」。
  方案按裁定 =「卡片即提示词」：卡片不再是「一次性快照」，点芯片即切换并立即生效，
  正文「保存」写回当前卡并把目标写进按钮文案；编辑框有未保存改动时点芯片弹三选面板
  （保存到当前卡并切换 / 另存为卡片并切换 / 丢弃改动并切换），任何一条都不偷偷丢字。
  另有两处顺手的逻辑修正：删除当前卡后正文留在原地（转为「当前正文」虚拟芯片）、
  预览折叠成一行且整行可点（`DisclosureRow` 传 `expandOnRowClick: true`）。
- **边界**：宿主与协议**完全不动**——`lib/index.js`、`API_PROTO=3`、`prompt-custom.json`
  格式全不变（proto 配对锁 `unit-prompt-custom-client` 的「协议常量配对」用例原样咬住），
  老配置无缝可用；host 套件 20 例不受影响。本版只重写 client 半边。
- **视觉**：全套内核设计系统原语（Button / Switch / SegmentedControl / Input / Pill / Tag /
  DisclosureRow + 官方图标），颜色与圆角走 `--dsw-*` 变量，与「内置插件」等既有设置页
  同一视觉语言；原语名字交叉核对用例（client 引入清单 ↔ 内核真包产物 + 类型声明）钉住
  引入面，改引入必须同步断言。
- **回归证据**：client 套件 **19 → 25 例**（原语同名桩 + 真实 React 钩子驱动：模块契约 /
  SSE 首渲染 / statusLine 三态 / 版本错配正反例 / 预览退化与两态 / 开关即时 POST 与失败
  回滚 / 芯片切换三态 / 保存写回 / 新建 / 改名 / 删除 / stale 门控直调不触盘 / 原语交叉
  核对 / 协议配对；反证 ×2）。隔离内核实机（真内核 + 真 Chromium，真实数据零接触）全链
  实测：开关即时生效（宿主回报「当前 1 个会话已注入」）、建卡 / 芯片切换 / dirty 三选 /
  保存写回 / 改名 / 删除 / 预览两态 / 注入方式切换逐条闭环，落盘配置逐步核对。
- **版本**：0.4.0 → 0.5.0（插件 `package.json`、`THIRD_PARTY_NOTICES.md` §4.1、
  `README.md` / `README.en.md` 双表、`docs/builtin-plugins-inventory.md` §一/§四、插件 CHANGELOG）。

### fix(plugin)：内置润色插件 2.2.1 —— 「展开为结构化」后「替换草稿」无反应（Lexical 多行写回静默失败）（2026-10-15）

- **缘起**：用户报「点击『展开为结构化』后生成后的提示词，点击『替换草稿』没有任何反应，
  没有展开为结构化时是有反应的」。
- **复现与根因（隔离内核 + mock SSE + 真 Chromium 坐实）**：DSH composer 是 Lexical 富文本。
  旧写回通道 select-all + `execCommand('insertText')` 在 Chromium 下对多行文本拆成逐行
  insertText + data=null 的换行事件，Lexical 吞掉换行，8+ 行时整段静默失败（事件监听计数
  证据：换行/长序列被吞，DOM 无变化、无异常、无日志）；单行短文本碰巧走通——所以仅结构化
  结果（多行 markdown）必现。E2/E4 双次复现与 E1 基线对照见隔离复现记录。
- **修复**：Lexical 组件改走编辑器自己的粘贴通道——合成 Ctrl+A（SELECT_ALL）再合成 paste
  事件（DataTransfer 带 text/plain），逐字保真（含 `\n`）、同步生效、不依赖焦点；编辑器未
  消费（未 preventDefault）或合成通道不可用时回退旧 insertText。非 Lexical contenteditable
  与 textarea 路径不变。隔离环境（真实数据零接触：`~/.dsh` 调试日志前后 mtime/大小一致）
  复验单行/多行/长文本/连续多轮全通。
- **回归锁**：`unit-prompt-optimizer-lexical-write.test.js`（vm 执行 dist 真产物 + Lexical
  桩：事件序 Ctrl+A → paste(全文)、零 execCommand；反证 ×2——未消费必须回退、非
  Lexical/textarea 走原通道；文本锁 src↔dist 双面咬分支顺序）。活体反证：删掉 Lexical
  分支重构建后 6 例中 5 例变红（唯一绿为纯交付形态用例）。
- **版本**：2.2.0 → 2.2.1（插件 `package.json`、`THIRD_PARTY_NOTICES.md` §4.1、
  `README.md` / `README.en.md` 双表、`docs/builtin-plugins-inventory.md` 三处、插件 CHANGELOG）。

### feat(plugin)：dsh-prompt-custom 升级 0.3.5 → 0.4.0 —— 提示词卡：命名留存 + 一键替换（2026-10-15）

- **缘起**：用户原话「想对这个插件进行调整，使得能够再添加一个按钮，用来可以添加提示词卡，
  然后在下方可以看到以前我保存的提示词卡，这样我可以快速替换和转换留存」。点击语义按裁定
  =「一键替换并立即生效」（点卡直接把当前注入正文换成该卡内容并保存；编辑框有未保存改动时
  **先在内联确认里问一句**，防误丢），与「开关 / 注入方式即时生效」的既有思路一致。
- **host 半边（`lib/index.js`）**：`cards: [{ id, name, text }]` 与 enabled/mode/text 同文件、
  复用 0.3.4 非破坏性合并写盘（卡片是「另一组字段」，不另立文件）；POST 变**部分更新**
  （在场字段才更新，`{...live, ...next}` 再 normalize）——只带 cards 不动正文 / 开关，旧形状
  文本请求也不清卡；cards **非数组即 strip**（防旧 client / 手写请求静默清空已有卡片）；
  净化：上限 50 / 名字裁 60 字 / 畸形条目丢弃 / 缺 id 补齐。**API_PROTO 2→3**：新界面 +
  旧宿主（刷新了页面没重启进程）时旧宿主会静默丢 cards——proto 错配让新界面把卡片区**禁用**
  并说清「完全退出重启」姿势；卡片文本只在被「使用」后成为 `live.text` 才参与注入与变量
  扫描（单独留卡不影响任何装配）。
- **client 半边（`lib/client.js`）**：卡片区在正文编辑框下方——「＋ 添加提示词卡」（预填首行
  建议名）／每卡一行（名字 / 激活标记 / 字数 / 使用这张 / 更新 / 删除）；使用、更新、删除
  都带**行内二次确认**；stale（proto 错配）时整体禁用 + 文案说明；一切写操作只经宿主 HTTP。
- **验证**：host 套件 **16 → 20 例**（部分更新不动正文 / 开关 + 落盘回读；净化含上限与
  非数组不清空；反证 ×2——拿掉畸形丢弃 / 拿掉 POST strip 判据各自变红）；client 套件
  **10 → 19 例**（列表渲染与激活标记唯一性、添加存正文快照、使用干净直达、dirty 三态确认、
  更新 / 删除行内确认、proto 错配禁用；suggestName 4 断言；反证 ×1——拿掉 dirty 确认判据
  变红）。两套件 node 22 预检（TAP 39 例）与 node 24 同绿；靶向门禁（两套件 +
  `unit-hub-registry` 版本锁 + `unit-doc-command-truth` + `check-syntax`）63 + 5 例全绿。
  **全量 `npm test` = 2114 例 / 2105 pass / 9 skip / 0 fail / 0 cancelled**（较 2.2.0
  基线的 2101 例恰 +13，skip 为既有环境缺料）。版本五处同步：插件 `package.json`、
  `THIRD_PARTY_NOTICES.md` §4.1、`README.md` / `README.en.md` 双表、
  `docs/builtin-plugins-inventory.md`（§一 / §5.2 本机列）。

### feat(plugin)：内置润色插件升级 2.1.0 → 2.2.0 —— 逐字保留校验内核 + 有界自动修复（2026-10-15）

- **缘起与取舍**：提问是「这个插件还能不能更工程化、更专业化——算法上和上下文联系上」。
  四个候选方向（校验内核 + 修复重试 / 会话上下文注入 / 质量门自评分 / 多候选档位）里**只圈定
  第一件**：把提示词里「请自检」那句口头约束变成**代码断言**——纯函数、可单测、几乎零额外
  成本；其余三项明确不做。
- **校验内核（`src/validators.ts`，零 DSH 依赖的纯函数）**：从原文提取四类实体——围栏代码块
  正文、`{{变量}}`、URL、文件路径——核对是否在结果里逐字保留。口径刻意保守防误报：路径只认
  「末段带字母开头扩展名」（`3/4`、日期、MIME 不误判）；未配平的围栏整体忽略尾段；URL 吸收
  中文正文的防御（排除 CJK 区间，`打开https://a.com/b然后继续` 不再整段吞）；URL 尾缀
  `[.,;:!?]` 剥离、`)` 按平衡计数；流水线遮蔽（code → URL 先遮蔽再扫 path/variable，同一段
  文本不重复提取）；`pruneNested` 去嵌套去重；容忍口径（`{{ name }}`≡`{{name}}`、URL 末
  斜杠等价）。`validatePreservation` 返回 `{ missing, added, checked }`，added 仅诊断。
- **有界修复（`optimizer-store.ts` 编排）**：主任务完成 → 校验 → 有 missing 才触发**一次**
  修复：卡片切「正在修复未保留内容…」（`step: 'repair'`）、清空流式草稿、**独立计时窗口**
  （总时长 ≤ 2×60s）；修复是第四任务类型（`repair`，ZH/EN 两套提示词：最小修复/逐字恢复/
  位置服从原意/❌ 反例校准），证据信封 `{ optimizedPrompt, missing }`（**上限 8 条 × 200
  字符**，修复请求保持小体积）。修复后重校验：全过 → 结果直出；仍缺 → 结果照常可用 + 卡片
  记数「N 处内容未能逐字保留」（不二修）；修复失败（非用户取消）→ **降级显示主结果 + 计数**，
  主结果不因修复失败而丢；关卡片/超时 → 中止静默 / timeout 错误态（与其他任务口径一致）。
- **顺带修复（latent bug，本升级中发现）**：fetch 通道配置缺失时**引导卡被吞**——旧编排先派发
  `begin`（进 optimizing）再派发 `guide`，而 reducer 只在非 optimizing 态接受 guide（防迟到
  覆盖），于是卡片卡在「正在优化…」永不显示引导；配置检查现前移到 begin 之前。
- **工程**：新增 `src/validators.ts`（随包 src 14 → 15 文件）；沙箱重建 dist（sha256
  `840222a2…`，内联 sourcemap sourcesContent 与 src 逐字节对账通过、17 个升级标记全在位）；
  预览状态扩了 `note` 字段与 `step: 'repair'`。
- **验证**：沙箱行为套件 **84/84 全绿**（较 2.1.0 的 67 例新增：校验内核 8 例 + 修复编排
  7 例——触发一次/无违例不修复/再缺记数/失败降级/引导卡回归/信封截断/关卡片静默——+
  reducer 2 例）；锁测试 `unit-prompt-optimizer-upgrade` 7 → **9 例**（SRC_FILES 15、
  sourcemap 哨兵 ≥14、四任务标记 + repair 信封键 + `validatePreservation` + note 键、
  新增 **guide 顺序锁**及其反证；node 22 预检同绿）；靶向门禁（本锁 + `unit-hub-registry` +
  `unit-doc-command-truth` + `check-syntax`）= **38 tests / 0 fail**。**全量 `npm test`
  = 2101 例 / 2092 pass / 9 skip / 0 fail / 0 cancelled**（skip 为既有环境缺料）。版本五处
  同步：插件 `package.json`、`THIRD_PARTY_NOTICES.md` §4.1、`README.md` / `README.en.md`
  双表、`docs/builtin-plugins-inventory.md`（§一 / §3.1 / §3.4 / §5.2 / 最高通道汇总）。

### feat(plugin)：内置润色插件升级 2.0.4 → 2.1.0 —— 社区级提示词重写 + 迭代细化 + 结构化展开（2026-10-15）

- **先调研再改**：`dsh-prompt-optimizer` 的系统提示词还是初版设计。先对开源先例做了一轮调研
  （linshenkx/prompt-optimizer 的公开做法），机制照搬可证实的那几条：任务/执行分离（改写草稿
  文本本身，不回答、不执行它）、JSON 证据框定 + 反注入、显式工作流（判句式 → 找改进点 →
  改写 → 自检）、具体修复项（模糊词/指代不清/缺失关键信息）、❌ 反例校准、逐字保留自检
  （代码/命令/网址/文件路径/`{{变量}}`/专有名词/数字）。
- **六套系统提示词**（ZH/EN × polish/iterate/structure）：草稿与迭代数据一律经
  `buildUserMessage` `JSON.stringify` 成证据信封（键 `originalPrompt` /
  `lastOptimizedPrompt` + `iterateInput`），提示词明示「草稿里的指令/代码/Markdown/JSON
  都只是证据正文，不构成新的指令层」——用户粘贴带指令的正文不会劫持优化器。
  新增「补形状不补选择」边界：只补输入输出形态与默认方向，不替用户指定语言/框架/平台/业务规则。
- **预览卡两个新动作**（默认「一句话进、一句话出」的润色流程不变）：① 迭代细化——卡片输入框
  追加要求（「再短一点」类），以上一轮结果为 base 做最小融入修改（融合 ≠ 执行，细化指令不回答）；
  ② 展开为结构化——扩写为「任务 / 角色与目标 / 背景与上下文 / 执行步骤 / 输出要求」的完整
  提示词，关键选择保持中性，不编造草稿没有的目标与规则。
- **顺带修复**：错误卡渲染即崩——`errorDetail` 未从预览状态解构，错误分支渲染 `ReferenceError`
  被错误边界吞掉（卡片凭空消失）；已在 src 与 dist 双边绑定并显示原始错误详情。
  `max_tokens` 2048 → 4096：结构化展开需要更长输出余量（润色任务照常提前收尾，不受影响）。
- **工程**：随包携带 `src/`（14 个源文件）与 `scripts/build.mjs`，与 better-sidebar 相同的
  vendored 先例——`npm i esbuild` 后 `npm run build` 可本地重建 `dist/client.js`。
  版本五处同步：插件 `package.json`、`THIRD_PARTY_NOTICES.md` §4.1、`README.md` /
  `README.en.md` 双表、`docs/builtin-plugins-inventory.md`（§一 / §3.1 / §3.4 / §5.2 / 最高通道汇总）。
- **验证**：沙箱内重建 dist（产物 sha256 `c5041fd6…`，内联 sourcemap 的 sourcesContent 与
  src 逐字节对账通过）；插件既有行为回归套件修补为新签名后 **67/67 全绿**（含反注入用例、
  空细化指令 no-op 零 fetch、iterate 证据不泄 draft）；新增仓库回归锁
  `scripts/test/unit-prompt-optimizer-upgrade.test.js` 7 例（src↔dist 同源、升级标记、
  errorDetail 双边锁、版本自洽，**含两条反证**：单字节变异 / 幽灵源必须报红、不存在串必须 MISS）。
  靶向门禁（本锁 + `unit-plugin-module-table` + `unit-plugin-channels` + `unit-patch-engine` +
  `unit-hub-registry`）= **81 tests / 80 pass / 1 skip / 0 fail**（skip 为既有环境缺料）。

### fix(kernel-patch)：Windows 部分机型「点击开始设置没反应」——引导步骤推进不再被渲染时间线扣住（2026-10-14）

- **症状**：首启引导的「开始设置」（内核 `@deepseek-ai/dsh-client-ui-settings-account` 的
  welcome CTA，文案 `client.js:2717`）点了毫无反应，不报错、不转圈、也没有重试按钮；远端仓库
  没有同类 issue（按 开始设置 / 没反应 / 引导 / onboarding 等词搜过，最接近的是 0.4.1 时代
  #129「点提交就卡住」，不是同一条）。
- **真因（实测，不是读码推断）**：设置**写成功了**，卡的是页面自己。引导步骤推进挂在
  `element.animate(...).finished` 上（`client.js:3852-3874`，rejection 被空函数吞掉），
  而 `busy = … || step !== targetStep`（`:3851`）。本机内嵌 Chromium 表面在文档 hidden 时实测：
  3.4 秒内 `document.timeline.currentTime` 只推进 **0ms**、动画 `playState=running / currentTime=0`、
  `finished` 始终 **PENDING**，同期 `setTimeout(3000)` 正常到点——**冻结只发生在渲染时间线，JS 照跑**。
  于是 `step` 永远停在 welcome ⇒ `busy` 恒真 ⇒ 整页按钮 disabled；而错误面板只在 `state.error`
  时出现（`:4027`），这次写入没失败，所以什么提示都没有 ⇒ 用户读到「没反应」。
  最小化 / 关到托盘（我们 `closeToTray` 缺省 true）/ 被遮挡 / RDP / GPU 合成退化都会进这个状态，
  而系统里关掉「动画效果」（`prefers-reduced-motion`）的用户走即时回落不受影响——这就是「部分机型」。
- **第二条同源静默**：`controller.update()/complete()` 有五条 guard 直接 `return false`
  （`:3109-3111`、`:3135`），调用点 `update: (change) => controller.update(change)`（`:4462-4463`）
  把返回值丢弃、控制器区间内零日志（实测 grep 计数 0）——命中即彻底静默，与上面那条在界面上不可区分。
- **改动（两条 guard 组补丁，靶 `dsh-client-ui-settings-account/lib/client.js`）**：
  - `onboarding-step-progress-timeout`（order 162）：步骤推进改成「动画完成 **或** 400ms 到点」
    谁先到算谁；只有真的走了回落才留一行 `[onboarding-timeline]`（带 visibility/playState）。
    原生的两条即时回落（`animate` 不存在 / `prefers-reduced-motion`）一字未动。
  - `onboarding-guard-report`（order 164）：guard 拒绝时把**命中了哪一条**报出去
    （`disposed / completing / saving-in-flight / account=<status> / progress=undefined / progress=done`），
    返回值与控制流不动（`.then(ok => (report(ok), ok))` 原样透传）。
  - 诊断通道用**既有** `page_error` 命令（GUI 子系统下唯一的页面落盘口：eprintln +
    `supervisor::file_log` → desktop.log），不依赖 `DSH_TAURI_DIAG`、不新增桥命令；
    浏览器直连内核时回落 `console.warn`。两条各自带 reporter，不共享函数——若 ② 因版本漂移
    anchor-missing 而 ① 引 ② 定义的符号，注入体自己就会 ReferenceError，把可观测性做成新故障源。
- **顺带查实的宿主桥缺口（本条未修，只登记）**：内核要求宿主提供 `globalThis.dshOnboarding`
  （`open/close/setBounds/hasApiKey/setActive`）与 `globalThis.dshPlatform`，全仓 0 命中——
  桌面端因此拿不到内嵌「充值 / 用量」页（`canRecharge=false` → 去充值置灰，`:4317/:4339/:4461`），
  引导里的 API-key 探测恒抛「desktop login bridge unavailable」（被 catch 吞掉，`:4159-4162`）。
- **随迁**：`patch-registry` 60 → **62**（file 45 → 47，root 15 不变；两条件均 `cli:false`）；
  计数哨兵同批（ta6-registry-invariants A/E、ta6-baseline-matrix `SPEC_COUNT` 与 BASELINE 两行
  「changed」= pristine 闭包真跑判定、ta6-heal-rollback-audit 审计 1 的 45 → 47 + FROM/TO 常量对、
  ta3-boot-chain `applyAll(60)` → `(62)`）；新增靶路径常量 `UI_SETTINGS_ACCOUNT_PKG_REL`，
  两个 marker 经 `onboarding-resilience.markers` 汇入 `patch-adapters.markers`（单一数据源哨兵要求）。
- **验证**：`unit-onboarding-resilience.test.js` 12 例——冻结场景真的跑起来（假时钟 + 假桥），
  断言 400ms 内步骤推进过去且留下一行诊断；正常出帧不抢跑、不多发诊断、cleanup 摘掉定时器；
  七种 guard 组合各报对各成因、`ok!==false` 时零上报、返回值透传；**反证两条**：换回未打补丁的
  原文片段（`STEP_GATE_OLD`）在冻结时间线下 `setStep` 永不被调（＝症状复现）、helper 变空操作时
  诊断归零；再加真字节锚点命中 + 二次应用 `already`（幂等）+ 版本漂移必须报 `anchor-missing`
  + 注入后 bundle 过 `node --check`。



### feat(companion)：内置插件在界面里第一次可管 —— 新增自研伴随插件 `dsh-builtin-manager`（2026-10-11）

- **需求**：随包内置的插件（原 28 条）在界面上完全管不了——看不到、也关不掉。
- **为什么看不见（实测）**：插件中心页的分组判据是 `installed = profile.dependencies.includes(name)`
  与 `optional = 内核常量 OPTIONAL_BUNDLES`，再加 `error !== void 0`；29 条内置件里 **27 条只在
  `dsh.profile.bundles`、0 条在 `dependencies`**（真实 profile 上量的），三条判据全 false，
  于是被 `dsh-client-ui-plugin-manager/lib/client.js:3342` 的过滤整批挡在门外。
- **为什么关不掉（实测，也是本条的落点依据）**：内核那两个开关都只认运行态。包级
  `setBundleEnabled(false)` 把名字从 bundles 摘掉后，`listBundles` 的行名单
  （bundles ∪ dependencies ∪ 安装锚点）三处都不含内置件 → **一关就从页面上消失、开不回来**；
  条目级 `RowSwitch` 的解锁条件 `row.entryId !== void 0` 只认「当前活着的条目」，一关同样锁死
  （内核返回的 `overrides` 数组页面根本没渲染）。把内置件写进 profile `dependencies` 能常驻，
  但那是 issue #177 的事故面（孤儿 `@deepseek-ai/*` → boot `ERR_MODULE_NOT_FOUND` + pnpm 404），不走。
- **改动**：新增自研伴随插件 `assets/plugins/dsh-builtin-manager`（0.1.0，MIT，随包分发，
  在册 28 → **29**）。页面挂 `settings.plugins.tab` 槽（id `builtin`），逐条列出内置件
  （名称/说明/启用态）并给复选开关；清单取**交付清单** `COMPANION_PLUGINS`，与运行态无关，
  所以关着也列得出、也开得回来。启停调 `window.dshDesktop.pluginManager.list / setEnabled`
  → `dsh:plugin-list` / `dsh:plugin-set-enabled`（契约表既有通道，**零新增桥命令**）→ sidecar
  `createPluginManager` → `togglePluginInPatch` 写 profile `cordis.patch.yml` 的 `disabled: true`。
  插件 host 半边刻意留空且不写任何文件——启停保持**单一写者**（本仓库为「两个写者改同一份用户
  文件」付过两次学费：别名链接劫持 scoped 解析、「同步确保全部在位」覆写用户停用）。
  生效时机按实测分两层写（见下条真机一轮）：改动**立刻写入** patch 层、界面**重载页面即更新**，
  插件的内核半边才下次启动生效；页面里没有
  `window.dshDesktop`（浏览器直连内核 / WSL 后端）时只说明原因、不渲染可写开关。
  本页自己那一行**锁成不可停用**——停用会立刻把这条 tab 收掉，而它是唯一能改回来的界面，
  放它关掉等于一次性销毁开关面。
- **随迁**：`COMPANION_PLUGINS` 追加一条 + 四处逐名 1:1 台账同步（THIRD_PARTY_NOTICES §4.1、
  builtin-plugins-inventory §一与 §5.2 判定表、README.md / README.en.md 插件表）；
  `unit-hub-registry` 的「命中补丁面件数」哨兵 27 → 28（29 减 1 条例外）；AGENTS 记一条已知坑，
  `docs/plugin-center-architecture.md` 新增 §4.7。
- **验证**：`unit-builtin-manager-client.test.js` 10 例（模块契约与「host 不得写文件」/
  `normalize` 两种桥形状 + 剔除 + 阳性对照 / 渲染与不可改行置灰 / 成功回写与失败原文上屏且不谎报 /
  自锁与两层生效时机 /
  无桥兜底 / 包面 id 与 `SELF` 三方同源 / **三条反证**：摘掉 group 过滤则 core 行漏进、摘掉 `ok === false`
  分支则失败被报成「已保存」、摘掉自锁则本页自己那条可被真的关掉）；`unit-companion-disable-override.test.js` 4 例（停用块活过 boot
  登记并逐条覆盖全量在册件 / 纯登记块必须被迁移清理删掉的反证 / `togglePluginInPatch` → 登记 →
  再 toggle 的串测 / 卸载行是停用行超集且同样活过登记）。真沙箱端到端：`sidecar boot` 五步全绿 →
  新插件镜像进 profile 且进 `bundles`（`plugin-list` 报 32 行、companion 组 29 条）→
  `plugin-set-enabled dsh-builtin-manager 0` 写入停用行 → **再 boot 一次该行原样在位**，
  `plugin-list` 的 `enabled` 随之为 false（拉锯消失）。
  2026-10-12 补真机一轮（`stage-payload` 29 个插件目录进包 → `smoke-installed` PASS：page-error 0、
  内置件镜像进 profile → 手动续跑壳不杀 → 浏览器开内核页）：「设置 → 内置插件」里本页**真实挂载**，
  无桥时兜底文案照面；桩桥下行状态/置灰原因/`setEnabled(id, enabled)` 实参与「已保存」提示逐项符合；
  写路径在同一条 `plugin-set-enabled … 0/1` 上往返核对（停用行写入与恢复删除逐字对齐）。
  **本轮实测校正了两件原先按代码推断的说法**：① 停用后**重载页面就读不到这条**（客户端半边由活动条目
  门控），不是一律「下次启动」；② 内核自带那一节（`dsh-client-ui-settings-plugins`，标题也叫「内置插件」）
  拥有 Settings 导航与 tab 外壳，我们的 tab 嵌在里面——因此本页必须锁自己那一行。

## [1.0.3] - 2026-10-11

### fix(release)：v1.0.3 发布（macOS 设置写入全线失败根治）

- **触发**：v1.0.2 预发布版装到 macOS 实机后，「点开始设置进不去」+「未能保存设置，
  请重试。」反复回滚 welcome 的故障**仍逐字复现**；多轮探针取证后定位到真根因（见下），
  随本版修复。

### fix：macOS 上「任何设置都存不了」（引导页「开始设置」进不去 + 设置页全线不可存）

- **根因不是设置写入链坏了，是 `dsh-app-boot` 被加载成两个模块实例**：
  - macOS 壳 supervisor spawn 内核时拼的路径是 `Contents/resources`（小写 `r`，
    `[supervisor] 内核 spawn:` 那行日志实证），而 loader 走磁盘真实目录
    `Contents/Resources`（大写 `R`）。APFS 默认大小写不敏感（同一份文件），但
    **ESM 模块缓存按 URL 字符串区分大小写** → 同一份 `dsh-app-boot` 被判定为两个
    模块，各持一份模块级 `bootstrapIncludes` WeakMap。
  - 于是 `mountRootInclude` 登记进「甲实例」的那张表，`reconcileProfilePatches` 在
    「乙实例」里 `get` 必然落空 → 抛
    `dsh: profile reload requires the root Include entry` → 被
    `dsh-api-settings-controller` 包成 `settings/rejected` → **任何设置写入全失败**
    （引导页与设置页一起，用户观感是「点开始设置进不去」+「未能保存设置，请重试。」
    反复回滚 welcome）。
  - 取证链每一步都有日志实证，非推断：前端 `diag5` 拿到 code=`settings/rejected`
    但 details 只带 `{ ns }` → 宿主 `catch` 里打出原始 message → app-boot 埋探针
    出现「`.set` 成功、`sameCtx=true`、`.get` 却 undefined」的 WeakMap 不可能局面 →
    加模块随机指纹 + 打完整 `import.meta.url`，两实例现形。
- **修法**（新增 `appboot-bootstrap-singleton` 补丁，`scripts/lib/appboot-singleton-patch.js`）：
  - `bootstrapIncludes` 从模块级 WeakMap 提升为 **globalThis 上的单例**
    （`globalThis.__dshBootstrapIncludes ??= new WeakMap()`），两实例共享一张表。
  - 顺带把 `reconcile` 落空时的静默 `throw` 补一条 `[dsh-desktop-patch] profile-reload-miss`
    日志，平时零噪音，只在真出问题时留痕，便于日后回归。
  - 语义不变式：仍是 `WeakMap`、键仍是 `ctx` 对象、弱引用不泄漏、`get` 语义逐字不变；
    修的是**存放位置**，不是数据结构。
  - 取「数据侧兜住」而非「改壳 spawn 的大小写」：spawn argv 在 Tauri Rust 侧，改它要三平台
    复验；且任何经符号链接 / profile fallback / agent overlay 落点的二次加载都会重演同样的
    分裂，数据侧收口更稳、无平台面。
- **归 runtime 组 + `cli:true`**（不是 guard 组）：这是功能主线而非出问题时才生效的兜底，
  必须进 payload 的 CLI 同步期，否则装机态缺少该补丁。落 `guard` 布局的 appDir + profile
  fallback 副本。
- **验证**：单测 `unit-appboot-singleton-patch.test.js` 12 例全绿，含**行为级**复现
  （未打补丁时两实例必然读不到 = 原 bug 最小复现；打补丁后必须读到且两实例是同一张表）；
  对 pristine 离线内核树跑全量补丁 `total 61 / changed 68 / anchorMissing 0 / failed 0`；
  `patch-surface` 快照同提交重取（marker 家族 82 → 83）后 verify 复绿。

## [1.0.2] - 2026-10-11

### fix(release)：v1.0.2 预发布版（全平台 · GitHub prerelease，不进 /releases/latest）

- **触发**：v1.0.1 装到 macOS 实机**逐字复现**同一故障（首启「未能保存设置，请重试。」+ 9 条插件
  `failed to load`），证明 v1.0.1 修的「profile 链接落点三种坏法」不是本案根因；同期 CI 全量单测
  自 10-06 起的 chronic 红与 10-10 的两处断链已根治但未随 1.0.1 出包。
- **内容**：下方四条——`fix(companion)`（profile 别名链接劫持 scoped 解析，**真根因**，自愈接进 boot
  `repair` 步）、`feat(diag)`（loader 导入失败 + prompt 准入异常两条 guard 诊断补丁，把静默链的
  原文请出 stderr）、`fix(ci)`（node 22 flush 死锁 12 例 + pristine 闭包缺供 51 例）、
  `fix(compat)`（patch-surface 快照重收敛复绿漂移锁）。壳侧有改动：`run_sidecar_boot` 成功路径的
  sidecar stderr 逐行转进 `desktop.log`（上限 400 行，超出留末尾并注明截断量）。
- **发布形态**：推 `v1.0.2` tag → `tauri-release.yml` 云端构建 + publish 边车/四道闸；release 以
  `--prerelease` 创建（工作流顶层新增 `RELEASE_PRERELEASE` 开关，本版置 `'true'`，下一个正式版
  改回 `'false'`）。**prerelease 不进 GitHub `releases/latest`，在线更新检查看不到本版——这是刻意的**：
  根因修复只经 mac 现场取证 + 本机单测闭环，未取得多平台实机复验，不该自动推给全量用户；
  需要本版的人手动下载安装包。`mirror-gitee` 维持 `if: false` 停用。
- **发布后实测（run `38073333753`，2026-10-11）**：五个构建 job + Publish 全绿、Gitee 镜像 job
  按停用 skipped；`isPrerelease=true`、标题带「（预发布）」、14 资产（7 主 + 7 边车）大小与
  边车哈希双重核对通过。**注意 `releases/latest` 仍停在 v1.0.0**——v1.0.1 的 release 已被删除
  （tag 在、`gh release view v1.0.1` 返 404），叠加本版 prerelease，在线更新通道对存量用户
  当前一律显示「无更新」；取 1.0.2 必须给预发布页直链手动安装。
- **发布时实测基线（2026-10-11，退出码一律直取不经管道）**：192 个测试文件 / `npm test`
  **2063 例 / 0 fail / 0 cancelled**（pass 2053、skip 10，逐条是环境缺料）；
  `dsh-tauri/sidecar/cli.test.js` **21/21 / 0 fail**（exit 0）；`check-syntax`、`validate-pin`
  （✓ dsh-v0.2.0-rc.2）、`patch-surface verify`（✓ 68 文件与快照一致）、
  `verify-balance-dock.cjs`（exit 0）全绿。Rust 面本版有改动（`run_sidecar_boot` stderr 转出 +
  3 例新单测），全量数字见 `dsh-tauri/CHANGELOG.md` 同名段。

### fix(compat)：patch-surface 快照重收敛——CI 漂移锁自 10-06 起 chronic 红根治（2026-10-10）

- **现场**：`ci.yml`「补丁干预面漂移校验」自 2026-10-06 起 5 次 main push 连续红在同一格；
  10-06 首红 1 行（`dsh-client-ui-workspace/lib/client.js` 内容漂移），10-08 起 2 行
  （增 `dsh-api-session-controller/lib/index.js` 标记集变更）。`gh run view --log-failed` 走
  results-receiver 被网络封，经 `gh api …/actions/jobs/<id>/logs` 取到逐行漂移输出。
- **根因（两轮补丁产物变更后快照未重取，本机 dev 树因幂等守卫留在旧态互证「假绿」）**：
  ① `efcbe11b7`（rc.2 换代重锚）时 session-manage 对 ws client.js 的删除守卫已重写为
  `typeof window.__dshSessionManager.deleteSession === "function"` 强判，重锚快照收到的仍是旧
  可选链判 undefined 字节；② `df342e55c`（识图插件批量退役）删掉休眠 vision 变换后 asc index
  不再注入 `describeImagesWithVision` helper，快照里由其注释派生的
  `read the resolved HOST-side value` 两条散文垃圾标记随之失效。
- **修复与验证**：本机 `npm ci` 重收敛后 `verify` 逐字复现 CI 的两行漂移输出；收敛态全量门禁
  复跑全绿（2043 例 / 0 fail / 9 skip、`check-syntax`、`verify-balance-dock.cjs`、`validate-pin`）；
  重取快照（surface 67 文件不变，markerCount 82→80，仅上述两文件 hash 变更）后 `verify` 复绿。
- **影响面**：纯守卫元数据，运行时字节零变化（fresh 收敛态即 CI 构建与安装包的既有形态）。

### fix(ci)：全量单测两处断链根治 —— node 22 flush 死锁 12 例连坐 + pristine 闭包缺供 51 例硬红（2026-10-10）

- **现场**：漂移锁复绿后的 run（`38051140321`）里全量单测首次完整运行：2043 例中
  **fail 51 + cancelled 12**（pass 1958 / skip 22），两类根因互不相关。
- **A：edge-client.test.js 异步组 12 例 cancelledByParent 连坐**。测试床 `flush()` 冲刷辅助
  （等 fetch→json→setData 微任务链跑完）给其 0ms 定时器显式 `unref()`；node 22 测试运行器在
  「唯一挂起句柄是 unref 定时器」时判定事件循环已空，await 中的用例整体 cancelled
  （`Promise resolution is still pending but the event loop has already resolved`；
  node 24 恰好容忍，故本机全量长期假绿）。修复：改 `setImmediate`（持引、同轮 check 相位触发，
  微任务链同样先排空）；沙箱里给 client.js 兜底时限的那只 unref 定时器（防挂起不阻塞退出）不动。
- **B：7 文件 51 例 pristine 哨兵硬红**。ta6-transform-contract（38）/ unit-released-v0-history-recovery（4）/
  unit-pi-ai-tool-name-wire（3）/ unit-patch-engine（3）/ unit-session-header-scan-guard（1）/
  ta6-heal-rollback-audit（1）/ ta6-baseline-matrix（1）按设计硬断言「pristine 内核闭包在位
  （`.tmp-rc2-stage` 或 `.tmp-kernel/.consumer-*`）」而非静默 skip，而 ci.yml 从未供料过它。
  修复：全量单测前插 `node scripts/install-pristine-kernel.mjs` 步骤（离线 vendor tarball 解出、
  不跑 npm 不联网、已在位幂等快路径）；顺带修该脚本 `--root=` 选项未剥前缀被当相对路径拼接的
  老 bug（缺省根不受影响；`--root=` 探测路径已实测 331 包解出 + 二次调用幂等跳过）。
- **验证**：本机 `npx node@22` 逐态复现——修前 edge-client 12 cancelled 与 CI 报错逐字一致，
  修后 21/21 / 0 cancelled；node 24 同 21/21 无回归。CI 复验（run `38051848631`，`21f729fce`）：
  全步骤绿，全量单测 2043 例 / **0 fail / 0 cancelled**（pass 2032 / skip 11，本机同口径
  2033 pass / 10 skip，1 例差额为环境条件差异）。

### feat(diag)：静默失败「原文上身」——loader 导入失败与 prompt 准入异常两处诊断补丁（2026-10-10）

- **现场**：mac 端 v1.0.0 / v1.0.1 连续两轮首启「未能保存设置」+ 9 个伴随插件
  `[loader-isolation] entry …: failed to load — auto-isolated`，日志到此为止；
  另有一条独立症状「发送文件恒报 `prompt rejected(session/agent-busy)`」。
  两轮排查（含两版只读体检脚本 + 逐包 `createRequire` 解析探针）都停在「文件都在位、
  包都能解析」，因为**真实异常从来没有被打出来过**——不是没发生，是无人打印。
- **根因（三段叠加的静默链，逐段有字节依据）**：
  ① rc.2 起插件导入失败不再抛出：`cordis-plugin-loader` 的 `Entry._init` 只
  `this.ctx.logger.error(error); return;`，条目就此没有 fiber（`fiber === void 0`
  = 我们激活隔离里那条「failed to load」）；这条退役判定见 patch-registry 的
  loader-tree-isolation 注释，其 ⚠ 代价行早已写明「核心条目失败也只剩一行 error 日志」。
  ② cordis 默认 `LoggerService` 的 exporter 是**纯内存环形缓冲**
  （`cordis/lib/index.js`：`self.exporter({ export: (m) => { self.buffer.push(m); … } })`），
  没有任何 console sink——`logger.error` 天生不落地。
  ③ `dsh-app-boot` 的 `boot()` 另挂诊断 exporter 把 warn/error 收进 `startupLogs`，
  只在抛 `StartupError` 时才由 `dsh/lib/bin.js::reportStartupFailure` 落盘
  `<DSH_HOME>/logs/startup-*.log`；而 `loader-activation-isolation` 让非核心条目
  **不再抛** StartupError。三段合起来：真实导入错误既不进 stderr、也不进文件。
  发送文件那条同型：`dsh-api-session-controller` 的 prompt 准入链兜底把**任何**非
  RemoteError 一律标成 `session/agent-busy` + `"prompt rejected"`，真因只落在
  `details.reason`，UI 不渲染——「agent 忙」是把磁盘/权限/模块身份问题误标成并发冲突。
- **改动（guard 组两条，判定面一字不动）**：
  · `loader-import-failure-report`（order 148，靶 `cordis-plugin-loader/lib/index.js`）：
  catch 体首补一行 stderr `[loader-diagnostic] entry <id> (<name>) import failed: <栈 <- cause 链>`，
  自身 try 包裹、6000 字截断；`ctx.logger.error` 与 `return` 原样保留。
  · `prompt-admission-reason-report`（order 150，靶 `dsh-api-session-controller/lib/index.js`）：
  兜底分支补 stderr `[prompt-admission] …`（同 cause 链），并把原因摘要带进报文
  `prompt rejected: <message≤400>`；**code `session/agent-busy` 与 `details.reason` 不动**
  （error-codes 契约与前端分支都吃这两样，换 code 属于契约变更，另议）。
  · 前缀刻意避开壳层标记机（`plugin-core/lib/markers.js` 只认 `[loader-isolation]` /
  `[crash-shield]`），故不会多喂一次 quarantine 事件——已作为用例锁死。
- **哨兵基线同步**：`ta6-registry-invariants` spec 总数 58→60、file 型 43→45；
  `ta6-heal-rollback-audit` / `ta6-transform-contract` file 型 43→45（两条各带
  FROM/TO 常量对，归类 inverse-replace，靶均在 vendor/dsh-kernel 离线闭包内）；
  `unit-loader-isolation-deep` marker 单一数据源 3→5；`patch-surface.snapshot.json`
  重收敛重取（68 文件 / 82 标记家族，`verify` 绿，与改动同提交）。
- **验证**：新增 `unit-loader-diagnostic-report.test.js` 9 例，其中两条是**运行时反证**——
  把真实字节里的 `_init` 方法体与 `catch (error) {}` 块原文取出用 `new Function` 执行，
  喂一次真的 `ERR_MODULE_NOT_FOUND`：补丁前 stderr 收到 0 个字节（机制复现），
  补丁后恰好 1 行且带真实错误码与 cause；另含「诊断自身抛异常不得反噬宿主」用例。
  全量单测与 check-syntax 结果见下方收口行。
- **收口实测（本机，退出码直取不经管道）**：`npm test` = **2054 例 / 0 fail / 0 cancelled /
  9 skip**（`scripts/test/` 现 191 个测试文件，上一基线 2043 例 ＋ 本文件 9 例 − 计数口径
  微调）；`node scripts/check-syntax.js` 通过；`ta3-boot-chain`（pristine 源上跑生产
  `applyAll(60)` 一条龙 + 二遍幂等）2/2 绿；`ta6-baseline-matrix` 3/3 绿且两条新判定
  由真跑录入为 `changed`（40 changed / 15 root / 5 target-absent）。
- **仍未决（诚实记账）**：mac 端那 9 条的**真因**仍缺一次现场捕获——本改动只保证
  「下一次启动一定有原文」，不给旧日志补字。补具已就绪：`dsh-mac-doctor.sh` 新增
  4.5 段（逐 bundle 真跑 `import()`，Windows 侧对照实测 28 个入口全 OK）与第 5 段
  `<DSH_HOME>/logs/startup-*.log` 检索；`dsh-mac-trace.mjs` v2 改为注入上述两处
  （v1 注入点选错：`inactiveDiagnostic` 对 `fiber === void 0` 只回字面量
  "failed to import"，本身不含真因）。
  壳层第三处缺口已同批修好（boot 五步的 stderr 在退出码 0 时被整段丢弃）：见
  `dsh-tauri/CHANGELOG.md` v1.0.2 段与 `supervisor.rs::sidecar_boot_log_lines`。

### fix(companion)：mac 端「9 插件 failed to load + 未能保存设置」真根因 —— profile 别名链接劫持 scoped 解析（2026-10-11）

- **现场取证（dsh-doctor.txt 4.5 段「逐 bundle 真跑 import」，macOS 26.6.2 / arm64 / 已装 v1.0.1）**：
  ```
  IMPORT-FAIL dsh-better-sidebar (lib/index.js) :: SyntaxError: The requested module
    '@deepseek-ai/cosmokit' does not provide an export named 'createVolatile'
  IMPORT-FAIL @deepseek-ai/dsh-settings (lib/index.js) :: 同上
  …basics-panel / reasoning-effort / side-session / subagent-lens / openclaw-bridge 同一条
  ```
  不是模块找不到——是 **ESM 具名导出在链接期就不存在**，所以条目连 fiber 都没有，正是
  `loader-activation-isolation` 里 `fiber === void 0` 那条「failed to load」。
  `@deepseek-ai/dsh-settings` 同死 → 设置服务缺席 → 首启「未能保存设置，请重试。」toast +
  `dsh-easyrewrite` 的 `pending (waiting for settings)`。三条症状一次解释干净。
- **根因（profile 里一条 pnpm `npm:` 别名链接）**：
  ```
  profiles/web/node_modules/@deepseek-ai/cosmokit -> ../cosmokit   （10月4 00:40 写入）
  ```
  它把 **scoped 规格符**指到了 profile 里那份**未 scoped** 的 `cosmokit@1.8.1`。本机对照
  （`node_modules/cosmokit` 1.8.1 的 `lib/index.cjs`/`index.mjs`）里 `createVolatile`
  命中数 = **0**，而 payload 的 `@deepseek-ai/cosmokit@1.8.5`（`vendor/dsh-kernel` 离线
  tgz 装的）有。共享 farm 侧 `profiles/node_modules/@deepseek-ai/cosmokit -> payload`
  是**健康**的（9月18 建，doctor §2 实证），只是永远轮不到——profile 自身优先。
  来源是第三方插件安装（同 profile 里有 `.pnpm`/`.pnpm-workspace-state-v1.json`、
  `billion-context-dsh`、`@photostructure` 等外来看客），不是我们的同步写出来的
  （`git log -S"@deepseek-ai/cosmokit"` 全库 0 命中）。
- **为什么 v1.0.1 没治好、两轮排查也没看见**：
  ① 为这个场景写的 `healProfileModuleShadowing` **不在 boot 链上**——只有 `plugin-guard.js:354`
  （`guard-*` 子命令）会调它，boot 五步从不触及；② 即便跑到，它的链接分支只认
  「目标在本 profile 的 `.pnpm` store 内」，而别名链接指向 store 外的兄弟目录，被当成
  `link:` 开发安装**故意保留**；③ 前两版 doctor 的名字表里只有未 scoped 的 `cosmokit`
  （VENDOR_DEPS 就是这个名字），从没问过 `@deepseek-ai/cosmokit`——于是「包都能解析、
  文件都在位」两轮都成立。
- **改动**：
  · `profile-module-heal.js` 新增 `healProfileAliasLinks(home, profile, log)`，判据是
  「链接落点的包名 ≠ 目标 `package.json` 的 name」→ 别名；悬空链接一并摘。保留 issue #7
  守卫：只有该规格符在 farm 里有健康对应物才动手；`link:` 开发安装目标同名 → 不碰。
  · `healProfileModuleShadowing` 的链接分支同用这一判据（两处口径一致）。
  · `scripts/integration/index.js::healBeforeServer` 逐 profile 调用（全容忍、不阻断启动），
  把自愈接进 boot 链——本次缺的从来不是规则，是接线。
  · **刻意不摘真目录副本**：companion-profile 的 sync 每 boot 会按 VENDOR_DEPS 重写
  `@deepseek-ai/schemastery` / `dsh-settings` 等真实副本，若 repair 也删就成了拉锯 +
  每启动重铺 MB 级；那条规则留在 guard 路径。
- **验证**：`unit-profile-alias-heal.test.js` 8 例（别名摘除 / 同名 link: 不误伤 / farm
  不健康时一条不动 / 悬空摘除 / 真目录不动 / guard 路径同判据 / 缺目录早退 / 幂等）；
  `unit-plugin-integration.test.js` 新增接线回归 1 例——断言二遍零动作时带**阳性对照**
  （把别名链接造回去必须再次摘掉并落日志），因为 `integration` 上没有 `.opts`
  （真句柄是 `.ctx`），写错就会拿一个没跑起来的实例空转通过，这次实测踩过。
  全量 `npm test`（退出码直取）= **2063 例 / 0 fail / 0 cancelled / 9 skip**，
  `scripts/test/` 192 个文件；doctor 4.6 段（同一判据的只读体检）在合成 home 上三点全过：
  点得别名、不误报同名 link:、报得出 farm 健康度。
- **用户自救（不等发版，一条命令）**：
  `rm ~/.dsh/profiles/web/node_modules/@deepseek-ai/cosmokit`（删的是链接、不伤目标），
  若 `profiles/web/package.json` 里有 `"@deepseek-ai/cosmokit": "npm:cosmokit@…"` 别名条目
  一并删掉，否则下次 pnpm 安装会重建。重启后解析回落 farm → payload 的 1.8.5。

## [1.0.1] - 2026-10-10

### fix(release)：v1.0.1 补丁版发布（全平台）

- **触发**：macOS v1.0.0 实机报障「首启弹『未能保存设置，请重试。』且点重试无反应」+ 部分 Windows
  用户同症；本机 Windows 沙箱逐字复现（9 条插件 `failed to load — auto-isolated`、1 条 pending）。
- **内容**：修正下方 `fix(companion)` 一条；其余交付内容与 v1.0.0 相同（28 条内置插件随包、
  内核 pin `0.2.0-rc.2` 离线随包、四平台资产形态不变）。壳侧零改动（Rust / 契约 / IPC 未触）。
- **发布形态**：推 `v1.0.1` tag → `tauri-release.yml` 云端构建 + publish 边车/四道闸，与 v1.0.0 同形态
  （`mirror-gitee` 维持 `if: false` 停用）。
- **发布时实测基线**：190 个测试文件 / `npm test` **2043 例 / 0 fail**（9 条 skip 逐条是环境缺料）；
  `dsh-tauri/sidecar/cli.test.js` **21/21 / 0 fail**；`check-syntax`、`validate-pin`（✓ dsh-v0.2.0-rc.2）、
  `patch-surface verify`（✓ 67 文件无漂移）全绿。Rust 面本版零改动，沿用 689 passed / 0 failed / 4 ignored。

### fix(companion)：首启「未能保存设置」toast + 9 插件 failed to load 根治（mac + 部分 Windows 用户）—— profile 链接落点同步自愈（2026-10-10）

- **现场**（macOS v1.0.0 实机日志 + 部分 Windows 用户同症 + 本机 Windows 沙箱逐字复现）：
  settings / better-sidebar / conversation-tweaks / quest-ui / side-session / openclaw-bridge /
  dsh-subagent-lens / reasoning-effort / basics-panel 共 9 条 `failed to load — auto-isolated`；
  `dsh-easyrewrite` `pending (waiting for settings)`；前台弹「未能保存设置，请重试。」
  且点击重试无效（设置服务缺席，保存永远失败）。
- **根因**：profile 的 `node_modules/@deepseek-ai/schemastery` 是旧装配期遗留的
  symlink/junction 落点、指向残缺副本（缺 `lib/index.mjs`）——rc.2 解析路由对 profile
  内候选 statSync 命中即直达、无可用性回退，schemastery 修不好则设置服务（依赖方）
  缺席、9 个依赖 schemastery 的伴随插件全部隔离。旧同步实现修不好链接落点，撞链
  有三种坏法（node v24 实测）：顶层落点 → `ERR_FS_CP_DIR_TO_NON_DIR` 抛错被吞进
  boot 日志（boot 通道日志不落 desktop.log，双重静默）；嵌套悬空 junction →
  **cpSync 原生崩溃**（status 3221226505，JS 层不可 catch）；嵌套非悬空 junction →
  静默写穿，副本文件倒进链接目标。重启 / 重试 / 覆盖安装均不自愈。
- **修复**（`dsh-desktop/scripts/lib/companion-profile.js`）：目录级同步 `syncDir` 复制前
  按 src 树形状摘除全部链接落点（`unlinkLinkDests`，含悬空、不递归穿透）；摘除失败
  （杀软 / handle 锁）跳过本次复制并落日志，绝不让 cpSync 以原生崩溃收场。插件落点
  与 `lib/` 单点同样先摘链重建；单文件复制撞悬空链接时摘链重试一次。修复跨平台
  （junction 与 symlink 同路径）；带上本次更新的用户首启即自愈，不能等待的用户手工
  删掉 profile 内该落点后重启亦可（Windows `rmdir /S /Q`、macOS `rm -rf`，对
  junction / 悬空 junction / 真实目录均实测安全、不伤链接目标）。
- **验证**：新增 `scripts/test/unit-companion-link-dest.test.js` 10 例（mac 形态逐字
  复现 + 原生崩溃回归锁 + 「不写穿链接」负向断言 + 摘链失败兜底反证）；沙箱端到端：
  修复前同环境内核启动 9 failed + 1 pending → 修复后 0 + 0，二次同步零改写幂等；
  反证探针实测 `status 3221226505`。全量：190 文件 / 2043 例 / 0 fail。

## [1.0.0] - 2026-10-09

### feat(release)：v1.0.0 正式版发布（纯净线首版 · 全平台）

- **本版收口的内容**：内核 pin `0.2.0-rc.2`（`vendor/dsh-kernel` 离线 tarball 随包 + boot 链
  fail-closed 校验，禁止浮动）；28 条内置伴随插件随安装包分发（内置线，见本节 `build(plugins)` 条）；
  在册 28 条逐条对 rc.2 宿主做过更新判定与兼容修复（`scripts/lib/plugin-channels.js` +
  inventory §四 §五）；`dsh-better-sidebar` 换代 0.24.1 并迁入 VSCode 式文件体验；`settingsScope`
  幽灵服务退役（两条被启动审计拒装的插件恢复激活）+ 设置子系统全量改到内核真实 API；
  `dsh-balance` 0.1.3 价目对齐官网；`dsh-prompt-custom` 回归套件重建（host 16 + client 10 例）。
- **发布形态**：推 `v1.0.0` tag → `tauri-release.yml` 云端构建 Windows x64（NSIS 安装包 + 便携版 zip +
  轻量便携版 zip）、Windows ARM64（实验性）、Linux（AppImage + deb）、macOS ARM64（dmg）；publish job
  逐资产生成 `.sha256` 边车并过版本一致性四道闸（强制检出 tag / `tauri.conf.json` 比对 /
  产物文件名内嵌版本断言 / 汇总断言）。
- **交付口径变更**：自本版起 release 资产**不镜像 Gitee**（`mirror-gitee` job 整条 `if: false`
  停用、实现原样保留以便恢复），代码也不再推 Gitee；`verify-update-sources.mjs` 的双源核验相应
  只剩 GitHub 单源有意义，发布公告与 `.github/workflows/tauri-release.yml` 头注释同轮改口径。
- **发布后资产实测（2026-10-09，run 37910747727 = Success / 34m39s）**：7 个主资产与 7 份 `.sha256`
  边车逐个 HTTP 200（Setup win-x64 175.2MB / Setup win-arm64 171.7MB / 便携 zip 249.1MB / 轻量便携 zip
  249.1MB / macOS dmg 264.6MB / AppImage 306.4MB / deb 254.3MB），边车内容为 `<sha256>  <文件名>` 格式。
  核出**一个长期存在的交付缺口：两个便携包都不含内置 `vendor/node/node.exe`** —— 二者体积逐字节相同
  （261,149,074）、zip 中央目录条目数同为 39,097，包内 `DSH Desktop/resources/dsh-desktop/vendor/node/`
  只剩一条空目录条目（同层 `vendor/npm/`、`vendor/dsh-kernel/*.tgz` 都在位），所以「内置 Node 完整便携版」
  与「轻量 Lite 版」实为**同一份 payload**，lite 分支的 `Remove-Item node.exe` 无从生效。同一形状在
  v0.5.7 / 0.6.0 / 0.6.3 / 0.6.5 的便携包里同样成立（0.6.5 两包同为 179,115,706 字节）——**不是本版回归**，
  而是被 `build-portable` 的 N1 门禁长期吞掉（该步骤注释自写「降级为告警（非 exit 1）」）。影响面：便携版
  用户只剩三级解析链的「系统 Node ≥22」兜底，机器上无 node 者走清晰报错路径；安装包侧因 CI 日志匿名取不到
  （`/checks/<id>/logs/N` → 404）、本机又不能真装（NSIS PREINSTALL 会静默卸载现有版本）而**未能核验**。
  核对姿势记入 `AGENTS.md` 已知坑。本版按裁定**只改对外文案、不重发**；把 N1 改 fail-closed、
  「下载后断言 node.exe 体积」与「lite 必须显著小于 full」三道闸，以及吞文件环节的定位，留待后续版本。
- **发布时实测基线**：`scripts/test/` 189 个文件 / `npm test` **2033 例 / 0 fail**（9 条 skip 逐条
  是环境缺料）；`dsh-tauri/sidecar/cli.test.js` **21/21 / 0 fail**；`check-syntax`、`validate-pin`
  （✓ dsh-v0.2.0-rc.2）、`patch-surface verify` 全绿。Rust 面自余额遗留线拆除后本轮未再改动，
  现值 **689 passed / 0 failed / 4 ignored**（2026-10-08 实测；本版每个 build job 都会重跑一遍）。

### fix(balance)：flash 价目对齐官网 + 补上内核真实模型 id —— 「本轮费用 / 命中缓存算错」双缺陷根治（dsh-balance 0.1.3）

- **报障现场（用户实测）**：对话统计栏 dock 的「本轮消费」偏大、缓存命中像被算错了。查下来是**两处
  独立缺陷叠在同一条查表路径上**（`balance-core.js` 按会话模型名精确取价目档，`priceTable()` 逐名求值）：
  ① 内核真实下发的模型 id `deepseek-flash`（`dsh-llm-deepseek` 的 `DEFAULT_MODELS`）**不在价目表内**，
  未命中即静默落回 pro 档——命中价按 0.3 计，是官方 flash 档 0.04 的 **7.5 倍**（主因）；
  ② flash 档价目本身（3 / 0.1 / 9）从来是按 pro÷3 推导的，官方「高峰时段」列是未命中 2 / 命中 0.04 /
  输出 8，命中价高估 **2.5 倍**。两条都不抛错、只是数一直偏大，所以此前从没被抓到。
- **修法（纯数据层，客户端零改动）**：`PEAK_PRICES` 新增 `deepseek-flash` 键并把 flash 系三个 id
  （`deepseek-flash` / `deepseek-v4-flash` / `deepseek-chat`）统一改为官方值 {2, 0.04, 8}；
  `LEGACY_PRICES` 同步镜像 `deepseek-flash` 旧价 {1, 0.02, 2}（峰谷门槛 2026-08-17 之前的会话现在
  重算同样不得跳 pro 旧价）；`PRICING_MODELS` 补该 id。空闲=高峰一半、真正未知模型回退 pro 最高档
  （宁可多报不少报）两条既有口径原样保留；宿主侧 `priceTable` / `periodTables` 因遍历
  `PRICING_MODELS` 自动覆盖新键，插件页与 dock 无需改。
- **回归锁与文档随迁**：`unit-balance-pricing-key` 新增点名用例（真实 id 命中 flash 档 /
  `deepseek-flash-250610` 后缀变体归本档 / 空闲半价 {1, 0.02, 4} / 旧版期镜像 {1, 0.02, 2}），并把
  「flash 明显低于 pro」的比例前提从 3 倍改钉为 **4.5 倍**（pro 9 / flash 2）；`unit-balance`、
  `unit-balance-weekend` 与插件自带 `test/balance-core.test.js` 逐格改钉官方值。
  `docs/balance-architecture.md` 缺陷表补该 🟠 行，维护约定把「新增模型别名」升级为
  「新增 id 先核对 `DEFAULT_MODELS` 真实下发名，且 `PRICING_MODELS` + `PEAK_PRICES` + `LEGACY_PRICES`
  **三处同步**——只加名单漏价格键就是静默 pro 兜底（0.1.3 前的缺陷形态）」。
- **反证（变异必须判红，两次均已复原）**：各跑 `unit-balance` + `unit-balance-pricing-key`（27 例）——
  A 删 `deepseek-flash` 键 → 3 例红，红信直接显出 `{9, 0.3, 27}` 的 pro 回退形状（即历史事故本身）；
  B flash 改回 pro÷3 推导值 {3, 0.1, 9} → 6 例红，含比例前提 `3 !== 4.5`。
- **实测**：仓库侧余额链 10 套 **120 例 / 0 fail**；插件自带 2 套 **38 例 / 0 fail**；
  `verify-balance-dock.cjs` 全断言通过（它不被 `npm test` 收，须单独跑）；全量 `npm test`
  **2033 例 / 0 fail**。版本 0.1.2→0.1.3 随迁六处台账（插件 `package.json` 与插件 CHANGELOG、
  `README.md` / `README.en.md` 两张逐名表、`THIRD_PARTY_NOTICES.md` §4.1、inventory §一 与
  §版本对照各一行）。

### test(companion)：dsh-prompt-custom 回归套件重建（host 16 例 + client 10 例）+ 插件 CHANGELOG 补 0.2.0→0.3.5 脉络

- **是重建不是移植**：2026-10 的交接包只给了文档与证据输出，验证台脚本（`repro-*.mjs` /
  `harness-core.mjs` / `repro-client.mjs`）**没有随包交付**，本机也没有那台 F: 机器。两套新锁按
  「真实内核包 + 真实插件源码」的实测行为重造判据，断言集合对齐交接文档 01（HTTP 契约）/
  03（改动历史）/ 05（验证套件）里记录的现象——不冒充逐字移植，能力面差异写在文件头。
- **host 半边 `unit-prompt-custom-host`（16 例，含 3 条反证）**：真内核（pin 的
  `@deepseek-ai/cordis` / `dsh-system-prompt` / `dsh-scope`）+ 真 `lib/index.js`；复刻夹具只造
  插件真实消费过的面（FakeWebServer / FakeAgents），agent 作用域用内核自己的 `createScope` 铸造
  （不手搓层级模型）。锁住的是这条语义链：内核节注册表分层（`ScopedLayers`）、判重只在同层内发生、
  「替换官方人设」= 同名节注册到更近的 agent 作用域。
- **client 半边 `unit-prompt-custom-client`（10 例，含 1 条反证）**：本机没有 jsdom / happy-dom /
  react-test-renderer 也不凭空增设依赖，挂载改为「mini 钩子驱动」——用仓库真实 React 18 +
  `react/jsx-runtime`，经 React 内部 dispatcher 槽位手驱 useState/useRef/useCallback/useEffect
  把真实 `Card` 组件跑起来（fetch 走 mock）。覆盖模块加载契约 / `statusLine` 三态与「跨版本不谎报」/
  版本错配顶部告警与反例 / 旧宿主只有 `text` 时的预览退化 / 未保存编辑不被开关操作偷提交 /
  POST 失败回滚 / 变量告警入 UI。**未覆盖如实留档**：真事件冒泡、真滚动布局、真 fetch 网络栈。
- **反证常驻套件**（不是另跑的临时变异，将来判据退化成空转会立刻红）：删 `!Array.isArray` 守卫 →
  `unknownConfigKeys` 重现 `['0','1']` 误报；写盘变异回 `{ ...cfg }` → 陌生键被抹掉；注册变异回插件根
  ctx → `lastError` 捕获内核重名错且 replace 不生效（官方 persona 未被遮蔽）——三条正是历史事故形状；
  client 拿掉 `statusLine` 的「未知则沉默」守卫 → 「未知」被谎报成停用（`tone:'muted'`）。
- **文档半**：插件 `CHANGELOG.md` 补写 0.2.0→0.3.5 七节（0.2.0 独立移植起点、0.3.0 注入静默失效根治、
  0.3.1 预览语义与变量插值、0.3.2 宿主/client 版本错配、0.3.3 schema 演进警报、0.3.4 非破坏性合并、
  0.3.5 数组误报），并记进因果：「0.2.0 移植时丢了『按 agent 注册』，才埋下 0.3.0 的洞」。
  本轮只补测试与台账，插件代码面与版本号不动。
- **实测**：host 16 例 / 0 fail、client 10 例 / 0 fail；全量 `npm test` 基线 2006 → 2033 例 / 0 fail
  （本两套 +26，余 1 例为上一条价目锁新增用例）。

### feat(companion)：better-sidebar 文件体验迁移 PACK/VSCode 统一模型（常驻左文件栏 + 每文件去重标签）

- **改的是文件体验，不是标签面**：按用户点名从桌面版 `dsh-PACK` 迁移 VSCode 式文件系统——
  `EditorHost.tsx` 重写：编辑器标签体内常驻**左侧文件栏**（可收起 / 可拖宽 140–480 / 按会话记忆；
  `state.ts` 增 `explorerOpen/explorerWidth` 与 `toggleExplorer/setExplorerWidth`，新增
  `src/client/ExplorerRail.tsx`），点文件开成**每文件一个去重标签**（`editor:<path>`），不再原地替换；
  「合并/独立」的 `editorExplorer` 三选一选择器连同停靠树一并退役（选键 + 7 条文案 ×20 份字典摘除，
  新文案 `explorerCollapse/explorerExpand` 补齐 20 份）。栏画在每个编辑器标签体内——内核右栏没有
  pane 级插槽，所以非 editor 标签不显示栏（已知差异，记在 kernel-integration 文档）。
- **产物全量重建回填**（改 `src/` → 上游构建链 `rmSync lib && tsc -p tsconfig.build.json && tsdown`
  → 整目录替换 `lib/` → `diff -rq` 复算 `Only in assets` 0 命中）：7 个 JS 面 + 5 份 sourcemap 全更新；
  `lib/types` 177→180，新增 `ExplorerRail.d.ts`，并补齐 `editor-features.d.ts` / `chunk-availability.d.ts`
  两张此前未随包的类型面。
- **同轮修掉 tsc 门禁的 5 处存量错**（`editor-features.ts`，自研件 `f3634367c` 的括号配对/折叠/查找三特性）：
  `noUncheckedIndexedAccess` 下 `text[pos]` 判空 ×4（L66/68/79/81）与私有 `state` 跨类型转换 ×1
  （L647 改 `as unknown as`）——修复行为等价，全链首次 0 退出（边界记在 inventory §5.4）。
- **实测**：靶向 125 例 / 0 fail（better-sidebar 五组锁 76 例 + `unit-sidebar-md-code-guard` 7 例 +
  插件面余下 4 套 42 例）；全量 `npm test` **2006 例 / 1998 pass / 0 fail / 8 skip**；台账随改三处
  （inventory §一 #3 cell、§5.2 #3 判定列、§5.4 构建边界）+ `better-sidebar-kernel-integration.md`。

### fix(companion)：退役幽灵服务 settingsScope —— session-manager 摘名 + side-session 换 ctx.remote.settings

- **报障现场（用户实测）**：Tauri 壳启动后 web boot 半程报 `Failed to load plugins`，
  两条 `pending (waiting for service: settingsScope)`（dsh-session-manager 与
  @dsh-external/dsh-side-session）永不激活。机制：内核 rc.2 里**没有** settingsScope 这个服务
  （`@deepseek-ai/*` 全文 0 处命中），boot 审计（`assertEntriesActive`）对 inject 里解析不到的
  service 判 pending 即拒装；真实形状是 `ctx.remote.settings`（dotted 名，
  conversation-tweaks / subagent-lens / quest-ui 已实证）。
- **两半修**：session-manager 正文从未消费该名 → `exports.inject` 摘名即恢复激活；
  side-session 客户端改写为 `ctx.remote.settings` 适配器（`describe()`/`mutate()` + revision
  收成旧 scope 形状的 getSnapshot / subscribe / set，inject 改
  `["slots", "remote", "remote.settings", "commandUi"]`）；宿主半边把作废的
  `ctx.settings.register` 换成声明式 Config + settings-host 垫片：Config 六字段全 `.volatile()`
  （内核 `settings.describe()` 只收录含 volatile 字段的条目）、`settings/document-updated`
  触发重取、`configure({ auto: false })` 关内核自动设置页，避免同一设置两处可改；
  `handleAsk` 的 apiKey 合并优先级反转（页内远端 describe 对 secret 脱敏、apiKey 恒空串，
  不得反盖宿主本地读取的真值）；凭据源从裸 `schemastery` 换宿主分叉 `@deepseek-ai/schemastery`
  （`volatile()` 只有分叉有），声明同迁 `dependencies` → `peerDependencies`。
- **新锁 `unit-settings-scope-retire`（16 例三层）**：① 全插件清扫——注入名与正文去注释/字符串
  后不得再出现幽灵名（历史回归「`inject` 里留 settingsScope」正是靠这条抓）；② 受害两插件点名锁
  （session-manager 摘名 / side-session 适配器形状）；③ 宿主半锁（volatile 六字段、settings-host
  垫片行为、apiKey 合并优先级）。判据边界：本清扫只咬「名字回流」，设置功能面由适配器行为测承担。
- **实测**：新锁 16 例 / 0 fail；全量 `npm test` 2006 例 / 1998 pass / 0 fail / 8 skip
  （总量 1990→2006 = 本锁 +16；skip 条数随本机材料浮动，同 AGENTS.md 口径）。

### build(plugins)：交付口径反转 —— 28 条内置插件随安装包分发（内置线）

- **改的是口径不是插件**：2026-10-08 裁定「装进去：真内置 28 条」，推翻 v1.0.0 立项时的
  「插件留在仓库、不进安装包」。`assets/plugins` 整树进 payload，装完首次开机由 boot 的 sync 步
  镜像进 `<DSH_HOME>/profiles/<name>/node_modules/`，开箱可用。壳侧零改动。
- **Node 侧新增的判据**：`scripts/lib/payload-plugin-deps.js`（纯函数：`residueNodeModules` 按
  `shipsNodeModules` 声明决定哪个内层 `node_modules` 是正件、`overlongFiles` / `longestInstallPath`
  按最坏安装前缀算 NSIS 断点）+ `dsh-tauri/scripts/stage-plugin-gate.mjs`（编排 + 落盘剪枝 + FATAL 口径）。
  动机是插件进包后 dev 树的本机 install 残留（历史实测 433MB）会原样进安装包；同步面早有声明式标志
  （`scripts/lib/companion-plugins.js` 的 `shipsNodeModules`），交付面必须共用同一份声明而不是再看磁盘。
- **随迁的锁**：`unit-pure-bundle-line` → `unit-bundled-plugin-line`（git mv + 重写 5 例，钉住 bundle 件
  走 manifest 因而**不写 `cordis.patch.yml`**、非 bundle 有源件才补 insert 行且幂等）、
  新增 `unit-payload-plugin-deps`（7 例：240 边界 + 换更长前缀必须从不判变判红的防恒真夹具 + 两条变异反证）；
  `dsh-tauri/scripts/ta12-stage-payload-sentinel` 的 judge 整面翻向（10 例，6 条变异各命中一条）。
- **文档口径随迁**：本文件与 `dsh-tauri/CHANGELOG.md` 新条目、`AGENTS.md`、`CONTRIBUTING.md`、
  两份 README、`dsh-desktop/README.md`、`dsh-tauri/docs/development.md` §5、
  `docs/builtin-plugins-inventory.md`、`companion-plugins.js` 头注释与 `THIRD_PARTY_NOTICES.md`
  （§4 标题改为「随安装包分发的内置插件」，新增 §4.2 逐条列 dsh-pocket 26 个内层依赖的实测许可）。
  `scripts/sync-companion-plugins.js` 的「源目录不再随包到达」注释改成「已从仓库删除」——
  退役三件与在册 28 件是两回事，前者删源，后者现在真的进包。

### docs(companion)：README 门面换成逐名 28 行实测表并进机器锁；§一「一句话作用」列逐格审计修 5 处

- **门面无同源是这张表的历史形态**：`README.md` / `README.en.md` 里只有一张 5 行「主要增强项摘要」，
  与在册 28 条从不同源，换代与退役时它永远是滞后的一份（本轮逐格复核：它那 5 行里唯一带具体功能宣称的
  `dsh-side-session`「三档上下文」**实测成立**——`lib/client.js:1209-1211` 的 `contextLength` 三档
  = 120 条 / 600 条 / 5000 条，已把档位写进新表；真正的问题是**缺 23 行**，加上引言那句
  「随安装包分发」与下一句「不进安装包」自相矛盾）。
  现在两份 README 各出一张 **28 行**表，包名 / 版本 / 许可逐格取 `assets/plugins/<dir>/package.json` 实值，
  行序取 `COMPANION_PLUGINS` 顺序，来源列的 12 条上游链接全部是 §三 实测可达过的那批仓库路径（不新造 URL），
  并把 §三 3.5 的四条许可保留意见带进门面（#4 撞名、#7 仅 manifest 自标、#11 上游无 LICENSE、#23 借作用域）。
  引言那句「随安装包分发」一并改掉——v1.0.0 起插件源**不进安装包**，那句话与下一句自相矛盾。
  **（注记：这半句已被上方的内置线条目反转——README 引言现在重新写「随安装包分发」，
  与当时的判据相反但与本文件 `[Unreleased]` 顶部一致；两张 28 行表与机器锁不受影响。）**
- **收口第 8 层**（`scripts/test/unit-hub-registry.test.js` 新增 1 例，本文件 23 → 24）：
  README 两张表复用与 §4.1 / §一 同一条 `ledgerDiff`，另咬行序对 `COMPANION_PLUGINS`、中英两份逐格相等。
  `ledgerDiff` 顺带长出**许可列**（可选列，「未声明即不判」——inventory §一 没有独立许可列，硬判就成了假判据），
  §4.1 从此也咬许可。反证按惯例配足五种变异：版本滞后 / 漏最后一行 / 幽灵包 / 许可改标 / 前两行对调，
  各判恰好一条红；**并在仓库外真改一次**（把两份 README 的 `dsh-synapse` 改成 0.2.0 → 该用例真红，
  只把英文版前两行对调 → 行序断言真红），不是只在测试内部的合成 face 里自证。
- **§一「一句话作用」列的 5 处不符已就地更正**（逐格对包体实交付字节重放，命中行号随文记录）：
  #3 `better-sidebar` 的 `tasks` 是 subagent 标签的**标题**而不是第四个内置 id（`builtinTabs()` 实测
  editor/git/subagent/sidechat/diff 五个，全树 `id: "tasks"` 0 命中）；#7 `dsh-super-injector` 漏记 0.3.1 的
  设置页插件管理 UI（`lib/index.js:3375` 起 `settings.section` 半边后端 + `POST /ingest` 目录「内化」）；
  #12 `billion-context-dsh` 漏记 `compress`/`decompress`/`search_context`/`acp_status` 四工具与 `/acp-prune`
  （`dist/index.js:6338` 的 `tools.register` 循环、`:6352` 的 `ctx.get("commands")`）；#16 `dsh-easyrewrite`
  漏记版本翻页器与自带设置中心（`lib/client.js:2577/4324`、`lib/index.js:319`）；#25 `dsh-basics-panel` 的
  `FEATURES` 实测 **4 项**不是 3 项，多出的「归档会话」与 #4 `dsh-session-manager` 职责重叠。
  这一列不在机器锁里（名字 / 版本 / `nm` / §5.2 七数才是），所以它靠逐格对产物维护，改动必须附命中行号。

### feat(plugins)：内置插件更新通道落成机器判据，28 条判定表整表重算并配三把收口锁

- **为什么要单独一层**：§四/§5.2 的每条判定都要回答「远端有没有既**同源**又**更新**的版本」，
  而此前这个答案一半靠抄录。两个坑都被实测咬过：按包名比对 d-pack 会得出「重叠 0」的假结论
  （发布面包名全是 `@dsh-pack/<裸名>`）；npm 上「版本号更高」不等于「是上游」——
  #4 `dsh-session-manager@0.6.2`（`hkkz9522`）与 #15 `dsh-input-history@0.3.2`（`sunshaobei`）
  是撞名的第三方实现，按名更新会把别人的代码覆盖进本仓源目录。
- **新增纯函数面 `scripts/lib/plugin-channels.js` + 复算器 `scripts/compat/scan-plugin-channels.mjs`**：
  前者给 `versionBucket`（等版 / 我们更高 / 他们更高 / 无此件，版本比较复用全仓唯一实现
  `scripts/lib/versions.js`）、`identityVerdict`（`same` / `foreign` / `unverifiable` / `unknown`）、
  `channelRow.actionable`（**d-pack shipped 且更高** 或 **npm 更高且身份 `same`**）与 `summarize`；
  后者只做 IO（d-pack 走本机克隆的 `git ls-tree`/`git show`，离线可重放；npm 走 `/latest`，
  官方源失败自动退 npmmirror）。台账数字现在是它的输出，不再是抄录。
- **2026-10-08 重算结果**：d-pack 通道 28 条 = 等版 20（含 2 条置于 `not-shipped/`）/ 我们更高 5 /
  他们更高 1 / 无此件 2；`origin/main` 自上次对齐**零漂移**（`git rev-list --count a064e10..origin/main` = 0）。
  npm 通道命中 9 / 未发布 19，身份计数 `same 4 / foreign 1 / unverifiable 2 / unknown 2`。
  **两条通道合起来的机器候选只有 1 条 = `synapse`**（d-pack 0.3.1，按裁定只出差量报告不动产物，
  报告见 `docs/builtin-plugins-inventory.md` §5.5，其结论把本条与 §一/§3.1/§4.1 的旧判据都改了）；
  npm 侧零候选——三条「远端更高」里没有一条是同身份上游。上一轮点名吸纳的 `better-sidebar` 0.24.1
  这次由机器确认身份 `same`（`omdsh-dev/DSH-better-sidebar`），不再只是人工比对。
- **§3.5 的许可与命名风险升级为机器判定**：风险 4（撞名）现记 `unverifiable`，风险 5（同名仓）
  #24 记 `foreign`、#12/#22 记 `unknown`——「靠版本比对定原创」的措辞从推断改成了判据输出。
- **三把新锁（每条都带反证）**：`scripts/test/unit-plugin-channels.test.js`（11 例：四态/四值/双条件
  逐条翻面 + 真数据「本地 repository 自述面」+ d-pack 半边无克隆时按既有惯例 skip）；
  `unit-hub-registry` 的 §5.2 判定表收口（序号/loader id/源目录/本机版本 + `别名/成员/裸名/缺失/表外/声明/移除引用`
  七数全部本地重放，改一个数字必须恰红一条——上一版这张表有三行是手抄错的）；
  `unit-hub-registry` 的 loader id ↔ `cordis.patch.yml` insert 命中审计（27/28 命中，例外只能走
  **显式点名的目录名单**，并反证「名单里那条确实没有补丁层」）。
- **写锁时抓到判据自身的缺陷**：`parseRepoSlug` 对无 scheme 的 `github.com/o/r` 形态会把 owner
  读成 `github.com`（不同项目可能被并成同一条 slug）。今天 28 条的 repository 全是 `git+https://…`
  形态，台账数字未受影响，但用例已把「四种形态必须归一到同一 slug」钉住。
- **`synapse` 差量报告（#66，落 `docs/builtin-plugins-inventory.md` §5.5）把「分叉件不可直更」拆成了两个相反的事实**：
  d-pack `origin/main` 的那份 0.3.1 **就是本机 0.3.0 的换皮**——`app.js`/`styles.css`/`test/`(10 文件)/`docs/`/
  `LICENSE`/svg 归一后逐字节相同，真实差异只剩 `@dsh-pack/` scope 三处排版 + 13 行 `sessionEvents()` 兼容口；
  npm/upstream 0.4.2 才是另一条功能线（`app.js` +630/−439、33 个新符号：快捷词 CRUD 与持久化、选区追问、
  卡片详情面板、画布整理/定位/缩放、会话地图视图切换…）。上一版台账那句「d-pack 0.3.1 也会覆盖掉本仓
  `perf`/`fix`」是**行尾噪声喂出来的错账**：本机插件文件 CRLF、两个外部源 LF，不归一时对 npm 那份做 `diff -u`，
  8 个文本文件**全部**各报成一个「整文件重写」hunk（归一后 `LICENSE`/`deepseek-mark.svg`/`cordis.patch.yml`
  其实逐字节相等），人眼一看全红就放弃了
  逐条核对。§一 #22、§3.1 #22、§4.1、§五 intro 四处已同步更正；整包仍判不取，但理由换成实测的三笔账：
  0.4.2 要收我们 `index.js` 12 个 + `app.js` 37 个自有符号（`viewActive` 本机 14 处命中、0.4.2 侧 0 处）、
  `client.js` 的深色适配桥（`b9ca67a9e` 的 +18 行），以及**一整套 2645 行测试**（git 实测 `test/` 0 行来自上游，
  全部由 `c1e23447f`/`e9753ca6a`/`ae66ff534` 三次本仓提交写出，而 0.4.2 的 tarball 连 `test/` 都不发）。
- **同一份报告抓到本轮唯一一条真宿主断链**：本机 0.3.0 的 `projectSession` 回填读 `session.events`，而这个属性
  在 pin 的 `0.2.0-rc.2` 上已下线——`Session.prototype` 反射 own 名单实测无 `events`（只有 `snapshotEvents`/
  `ownEvents`），`dsh-session/lib/types/index.d.ts:452` 的 `list(): Session[]` 证真 `ctx.sessions` 给的就是这个类。
  行为面用同一段探针两面跑：喂旧夹具形状（字面 `events` 数组）得 `messages=2`，喂 rc.2 形状（只有
  `snapshotEvents`）得 **`messages=0` / 水位线 `null`**；d-pack 那份两种形状都得 2。影响面刻意收窄：`session/event`
  仍在发（`dsh-session/lib/index.js:1496`）、实时链走显式入参、`firstLiveSeq`/`header` 仍是实例字段，所以症状是
  **重启/切会话时历史回填空档**，不报错不崩溃——正是规程里「无报错是弱证据」那一类。为什么 1981 例全绿也抓不到：
  `test/replay-watermark.test.js:20` 的 `makeSession()` 造的正是宿主已经不再提供的形状（夹具替错契约作证），
  而 §5.2 这一行的七数是 `0 别名 / 0 成员 / 0 裸名 / 缺失 0 / 表外 0 / 声明 0 / 移除引用 0`——「宿主运行时对象上的
  属性下线」不在六条静态扫里（`kernel-pin.services.removed` 那 12 条全是服务 id，且 d-pack 的修复刻意把回退分支
  写成 `session["events"]`，扫字面量会两头漏）。盲区进 §5.4 末条（第七个），处置姿势与反证要求写在 §5.5 末段；
  本轮按裁定**不动产物**，插件版本仍为 0.3.0。
- **登记一条待核缺口**：`dsh-wsl-settings`（#10）盘上无 `cordis.patch.yml`、`package.json` 也无
  `dsh.bundle.patch`，boot 的 sync 对 `isBundle=false` 的件只镜像文件、不进 `dsh.profile.bundles`，
  profile 层也没有代写 `- insert:` 的机器——它靠什么挂进插件栈**尚未证实**，本轮只登记不处置。
- **文档随迁**：`docs/builtin-plugins-inventory.md` §四 重写为 4.1/4.2/4.3（含 npm 身份表与两条口径雷区），
  §5.1 的真产物变异反证改为「注入旧后缀取用必须逐名报红、带回落不许报红」的现形判据，
  §5.2 整表由脚本重生成并补 npm 身份列，§5.3 复算命令加扫描器三条 invocations，§5.4 补通道来源、
  身份自述天花板、第三通道不重放、挂载面缺口四条边界，**新增 §5.5 三源文件级差量报告**（差量矩阵 +
  三段证据链 + 复算命令），§5.4 补第七个盲区一条；§一 #22 / §3.1 #22 / §4.1 / §五 intro 的 synapse 判据按实测更正。
  `AGENTS.md` 同步 better-sidebar 产物拓扑
  （2 频道 bundle + 3 lazy chunk + Node 半边两文件）与测试基线现值（185 文件 / 1981 例 / 0 fail）。

### feat(better-sidebar)：吸纳上游 0.15.3 → 0.24.1 整包换代，三项自研能力实测已被上游吸收

- **取上游的裁定与代价**：按用户点名「对远端仓库吸纳性更新进来，新功能好功能吸收进来」，
  #3 直接镜像 npm `dsh-better-sidebar` **0.24.1** 全量重皮（含 9 个构建面文件）。上一轮
  「d-pack 0.15.4 / npm 0.24.1 均不取」的判据**作废** —— 当时忌的是上游同期引入的 ~28 项重依赖
  与第三方 peer `@huanlin/dsh-plugin-better-locale`，本轮按上游形态接受（插件不进 payload，
  代价只落在仓库体积与同步面，不落在安装包）。
- **上游把「查看变更」整面重做了，我们的手改物随之消失**：退役
  `diff-turns.ts` / `DiffTurnsPanel.tsx` / `file-changes-highlight.ts`（数据源
  `window.__dshFileChanges` 全局 store + CodeMirror 三色装饰 + `dsh-editor-diff-add/mod` class），
  换成共享 diff 栈 `src/client/diff/{rows,highlight,DiffRows,DiffFiles,use-git-diff}` +
  `src/client/changes/{ops,change-tree,ChangesTab,DiffPane,GitLens,SessionLens}` + `DiffTab.tsx`，
  经 `builtins/tabs.tsx` 的 `git`（ChangesTab + `opCountOf` 角标）与 `diff`（DiffTab，`hidden`、
  `order: -1`）两个描述符接线 —— 数据源改为**直接读会话事件日志**，不再依赖外部插件发布全局 store。
  顺带：文件与编辑器合并成单个 editor 标签，terminal/browser 交还宿主。
- **原判「我们侧只剩三项能力回吸」是错账，换代收尾已复算证伪**：① `chunk-availability.ts` 的
  lazy chunk 自动重试、② `editor-features.ts` 编辑器增强、③ #171 的 fsRead 退避 / 重新可见即重拉 /
  `<pre>` 只读预览兜底——**三项都已在 0.24.1 的 `src/` 与产物里在位**（对 0.15.3 备份用
  `diff -u --strip-trailing-cr` 复算 + 交付字节逐名核命中：`createChunkRetryLoop`/`ensureChunkAutoRetry`
  在 `chunk-loader.ts:56/305/321/346` 接线（`visibilitychange` 调 `loop.poke()` 立即重探）、`editor-features.ts` 与备份
  696 行逐字节相同、`failCountRef`+`reloadSeq` 在 `EditorHost.tsx:122-136`、`TextFallback` 在
  `builtins/viewers.tsx:53-75`）。本仓唯一被上游丢掉的是 `isChunkRegistered()`——全仓 0 调用者的
  死代码，不补。**所以本条的实质产物是台账更正，不是改 `src/` 重建**；能力锁本来就成对存在
  （`unit-better-sidebar-chunk-retry` 锁 ①③、`unit-better-sidebar-editor-features` 锁 ②），
  没有为「已作废的待办」新加恒红守卫。
  姿势条款保留：真要改行为仍是**改 `src/` 后本地重跑上游构建，零手改产物** —— 这是与上一轮
  「src 与 lib 同形双写」的姿态差别。
- **构建拓扑变了，核对姿势跟着变**：0.24.1 的 `tsconfig.build.json` 是 `emitDeclarationOnly`，
  不再产出逐文件 `lib/<name>.js` 镜像 —— **随包 bundle 就是唯一事实源**。tsdown 保留 tab 缩进的
  `//#region <src 路径>` 标记且不混淆，所以纯函数仍能从交付字节里切出来在 `vm` 实跑
  （夹具 `scripts/test/fixtures/better-sidebar-region.js`：多区段拼接 + `plain()` 归一 +
  `sameRealm` 模式，跨 realm 会多一个 microtask hop，曾咬坏一个 soak 用例）。
  本机 `npm run build` 实测可跑（`✔ Build complete in 2036ms`），上一轮「跑不了它的构建」不再成立。
- **机器锁随迁（替代，不是删除）**：`unit-better-sidebar-editor-diff.test.js` 与
  `unit-file-changes-highlight.test.js` 锁的名字在 src 与产物里 **0 命中**，已移入
  `.tmp-retired-tests/` 待随提交删除；新增 `unit-better-sidebar-diff-surface.test.js`（**21 例**）
  成对替代 —— ① 行为实跑交付字节（LCS 与 git unified 两个生产者、hunk/fold 折叠与可展性、
  行内着色、会话事件 → 文件操作的 0.1.6 wrapper / 0.1.7 上浮两形态）；② src ↔ 产物同源护栏
  （区段定界唯一 + 产物区段顶层名 ⊆ src 顶层名，产物缺的名字必须逐名解释为 tree-shake 或常量内联，
  `HUNK_CONTEXT`→`context = 3`、`MIN_FOLD`→`count >= 3` 的折叠字面量当场验在位）；
  ③ 接线锁 + 退役面反向锁（旧锚点复活即红）。侧栏组 2026-10-08 复跑实测 **70/70 绿**
  （`unit-better-sidebar-chunk-retry` 22 + `unit-better-sidebar-editor-features` 20 +
  `unit-better-sidebar-diff-surface` 21 + `unit-sidebar-md-code-guard` 7；先前记的 72 是滞后账）；
  连同换代新锚的两把锁 `unit-plugin-kernel-anchor` 8 + `unit-plugin-tab-host` 5 共 **76/76**。
- **上一轮两处 better-sidebar 兼容改动作废并撤除**：14 键 peer 放宽（上游已直接声明
  `^0.2.0-rc.1`，rc.2 上 **0 DENIED**；含 rc.2 已不存在的 `@deepseek-ai/dsh-client-runtime` 键
  也随上游表一并撤掉，`unit-plugin-peer-floor` 的该条豁免随之退役）、
  23 个旧图标成员 × 112 处两级回落（`primitives-icons.ts` 垫片整目录不存在，上游图标面换成
  `src/client/icons.tsx` + react-icons 后无此项，模块表 **0 断链**）。
- **账本随迁**：`THIRD_PARTY_NOTICES.md` §4.1、`docs/builtin-plugins-inventory.md` §一 #3 /
  §3.1 / §四 / §5.2 #3 / §5.4 全部改到 0.24.1 口径；`unit-hub-registry` 的两账本逐名逐版本
  收口用例 **21/21 绿**。

### fix(plugins)：在册 28 条内置插件逐条对 rc.2 宿主做更新判定与兼容修复（fleet sweep）

- **规程与总结论**：按 `github.com/oh-my-dsh/dsh-plugin-upgrade-skill` 的 fleet-sweep 五条 standing
  rules（在目标宿主上验证 / 先做廉价静态扫 / 无报错是弱证据 / 逐插件修复不做混合提交 / 跨代兼容优先）
  逐条实测，台账见 `docs/builtin-plugins-inventory.md` §五（含 28 行逐插件判定表与复算命令）。
  **「更新」半边零版本 bump**：d-pack 通道 等版 18 / 我们更高 4 / d-pack 更高但刻意不取 2
  （#3 better-sidebar 用户点名、#22 synapse 本仓分叉件）/ 在册而 d-pack 无 4；
  npm 侧 4 条候选逐条判不取（#3 引入 ~28 项重依赖与第三方 peer、#4 `hkkz9522` 与 #15 `sunshaobei`
  是**同名第三方**不是上游 —— 按名更新会装到别人的实现）。实质工作全在「兼容」半边。
  **（后记：#3 由上节反转为「取」—— 用户点名吸纳上游后 d-pack 高于我们的只剩 synapse 一条；
  #4/#15 撞名禁更判据不变。复扫口径见 inventory §四。）**
- **peer 下限放宽 2 条（DSH-0.2.0-RC1-01 静默拒挂）**：内核按 `peerDependencies` 硬判兼容，
  不满足的行被**静默** `disabled: true`，stderr 只有一行 `dsh: disabling profile plugin row`。
  `billion-context-dsh` 5 键上界 `<0.1.6-0` → `<0.3.0-0`；`dsh-better-sidebar` 14 键
  `^0.1.0-rc.8` → `^0.1.0-rc.8 || ^0.2.0-rc.1`。修后 28/28 可挂（11 条声明 dsh 族 peer，共 46 键）。
  锁：`scripts/test/unit-plugin-peer-floor.test.js`（4 用例，oracle 与 pin 同源交叉断言 + 反向捕获力）。
  **（后记：`dsh-better-sidebar` 那条已被上一节作废 —— 上游 0.24.1 自带 `^0.2.0-rc.1` 表。）**
- **better-sidebar 图标跨代回落（立项时判为「本轮唯一硬断链」）**：rc.2 的 primitives 只剩 94 `Icon*Regular`
  + 94 `Icon*Medium`，`*14/*16` 后缀全部不存在；产物里 23 个旧成员 × 4 个 bundle = **112 处未守卫取用**
  （症状是 React #130，整个 slot entry 静默消失）。按确定性规则 `name.replace(/\d+$/,'')+'Regular'`
  改成两级回落 `旧名 ?? Icon*Regular`，源侧同步 `src/client/primitives-icons.ts`（23 成员）
  + 18 个 `src` 文件把图标名从 primitives 拆到该垫片 —— src 与 lib 同形双写，本机跑不了它的构建。
  **（后记：整条已作废。上游 0.24.1 换用 `src/client/icons.tsx` + react-icons，垫片目录不存在，
  回落点与「跑不了构建」的前提都不成立；判据仍由 `unit-plugin-module-table` 守，实测 0 断链。）**
- **新机器锁 `scripts/test/unit-plugin-module-table.test.js`（13 用例）+ 纯函数面
  `scripts/lib/plugin-module-table.js`**：补的是 `unit-plugin-esm-link` 的盲区 —— 打包器把具名导入
  改写成 `var _p = require("<spec>")` + `_p.<member>`，源里有 import、产物里没有。六条静态扫现值：
  75 处别名改写 / 322 处成员取用 **0 未守卫断链、0 表外 require**；25 条有 `./client` 入口的插件
  浏览器模块图 46 处裸名取用 **0 表外**；56 条 `dsh.client` 声明 **0 落空**；
  `kernel-pin.services.removed` 12 条 id 的 `ctx.get` 引用 **0 命中**；56 条 manifest 入口
  **0 磁盘缺失、0 被 gitignore 遮蔽**。
- **判据扩面抓到的两个真实盲区（不是版本号游戏）**：
  ① `walkPluginFiles` 的 `SKIP_DIR` 整目录跳过 `dist/`，而 `dsh-prompt-optimizer` 的浏览器入口
  恰好在 `dist/client.js` —— 该插件此前对判据完全隐形。改成「manifest 入口及其相对闭包一定穿过目录
  白名单」后别名计数 70 → 75（新增 5 处全在这份 dist 产物里），并修掉白名单在**相对**插件根下
  按字符串前缀比对而静默失效的自写 bug（用例 2 现锁「相对根与绝对根扫描结果逐字段相等」）。
  ② 同一份 `dist/client.js` 被 `dsh-desktop/.gitignore` 的通用 `dist/` 规则挡住：本机有、库里没有，
  全新 clone 后这条插件的 UI 槽位静默消失（同 billion-context-dsh 的 issue #65 类）。本轮补
  `!assets/plugins/dsh-prompt-optimizer/dist{,/**}` 例外；`dsh-reasoning-effort` 0.8.1 把 `./client`
  换成目录形 `lib/client/index.js`，**新入口与旧入口的删除需在同一次提交里成对收**（本轮按裁定不提交）。
- **未动面**：任何插件的运行时行为语义、`COMPANION_PLUGINS` 清单、补丁注册表计数、壳侧契约与 Rust。

### refactor(balance)：Electron 余额遗留线整体拆除（六层链路 + 存量测试改指插件 ESM）

- **拆的是哪条链**：自制壳时代的 `dsh-desktop/balance.js` + `balance-scheduler.js`
  → sidecar `node cli.js balance-fetch` → Rust `start_balance_loop`
  → `app.emit("balance-changed")` → 垫片派发页面事件 `dsh-balance-changed`。
  `dsh-balance` 0.1.2 起页面零消费方，但这条链每 180s 仍**真发一次** DeepSeek
  `/user/balance`（网络与凭据读取都发生）。上一批只登记撤回账，本轮按自己写在
  `docs/balance-architecture.md` §1.2 的四步前置端到端拆除；壳侧同步面（Rust /
  sidecar / 桥命令 / 垫片 / 五契约）见 `dsh-tauri/CHANGELOG.md` 的同名条目。
- **Node 侧删除**：`balance.js` 与 `balance-scheduler.js` 整文件删除，
  `scripts/check-syntax.js` 的 `entryFiles` 同步摘除两条入口（留着会让语法门咬住
  不存在的文件）。
- **存量测试改指插件 ESM，不减覆盖**：`unit-balance` / `unit-balance-proxy` /
  `unit-balance-pricing-key` / `unit-balance-scheduler` / `unit-balance-scheduler-payload` /
  `unit-balance-weekend` / `unit-balance-ledger` / `integration-balance` /
  `ta10-time-window-matrix` 一律改 `require('../../assets/plugins/dsh-balance/lib/*.js')`
  （Node ≥22.12 的 `require(esm)`，两个模块无顶层 await，CJS 测试可直接驱动）。
  `unit-balance-weekend` 里专为「双拷贝不漂移」设的第 4 节随 `balance.js` 一同下线，
  现役价目/档位口径改由 1–3 节直接对 `balance-core.js` 求值把守，与 `dsh-offpeak`
  源码常量的交叉对拍保留；`unit-balance-ledger` 去掉
  `window.dshDesktop.refreshBalance` 桩（插件只走内核回环路由，桩留着就是把退役面
  当成在用面）。
- **新增反向守卫 `unit-balance-legacy-retire.test.js`（6 例）**：逐层断言遗留源文件 /
  语法门入口清单 / sidecar 子命令 / Rust 模块与命令注册与菜单与通知链挂点 /
  桥 `CHANNELS` / 权限真源 / 垫片面 / 五份契约行都不含余额链，并**反向核对现役唯一
  链路还活着**（插件四件套文件在位 + 两条路由字面量在位 + 插件不依赖
  `refreshBalance` / `dsh-balance-changed`）——否则「守卫把唯一活链路一起删了」这种
  事故测不出来。判据形态经过三轮收敛才不假绿：散文（契约说明、Rust 注释）里出现
  令牌是合法的，故代码侧按**登记形态**判（`m(...)` 条目行、`"balance_refresh",` 授权行、
  `REQUIRED_SURFACES` 数组字面量本体、垫片 `x: function (` 方法行），文档侧按**段落级**
  判（出现遗留令牌的段落必须含退役/裁撤/移出/已无/已随/零消费方之一）。
- **守卫可信性用人为复活反证**：一次性夹具跑六场景（重建 `dsh-desktop/balance.js`、
  垫片追加 `onEvent('balance-changed', …)`、`bridge-api.md` 复活 `refreshBalance` 行、
  `CHANNELS` 复活 `dsh:balance-refresh` 条目、`REQUIRED_SURFACES` 复活 `"refreshBalance"`、
  `balance-core.js` 把代理客户端选择压成 `http` 以咬 `unit-balance-proxy` 的字节级
  TLS 用例），每场景快照→注入→跑（tap，判红 + 样本量不得为 0）→**先还原再逐字节比对**
  ——六例全 PASS，收尾两守卫双绿，夹具已删。
- **文档随迁**：`docs/balance-architecture.md` §1.2 由「遗留线登记」改写为**拆除台账**
  （六行环节 → 处置 + 防复活说明，并明确 `menu_action` 的 `toggle-balance` 与设置项
  `showBalanceDock` 不在裁撤范围）、§1.3 表格列名改考古口径、§7「价目常量存两份」
  改为「只有一份真源」、§9 表头与 §10 维护约定删掉双拷贝指令、§10 测试命令去掉
  `balance-fetch` 与 `commands/balance.rs` 两项；`README.md` 目录结构把 `balance.js`
  标为【已删除】并注明现役落点；`docs/builtin-plugins-inventory.md` §二 第 6 行改
  「壳侧无命令」；`assets/plugins/dsh-side-session/lib/index.js` 的凭据注释改指
  `dsh-balance/lib/balance-core.js`（该插件只有 lib/，无 src/ 同源面）。
- **验证**：`npm test` → **1931 例 / 1923 pass / 0 fail / 8 skipped**（本轮净增的 6 例
  即反向守卫；skip 里 `example.com` 真实 socket 那条随本机网络浮动，与本轮无关）；
  `node scripts/check-syntax.js` 全部入口通过、`validate-pin.js` →
  `dsh-v0.2.0-rc.2（0.2.0-rc.2，offline-tarball）`、
  `patch-surface.js verify` → 67 文件无漂移、`verify-balance-dock.cjs` → 全部断言通过，
  四者退出码实测均为 0；`node --test sidecar/cli.test.js`（含新增的
  「`balance-fetch` 已退役：未知子命令 exit 2」反证）**21/21**、其余 sidecar 六文件
  （farm-repair / ta9-boot-disk-faults / ta9-data-corruption / ta9-patch-io-halfwrite /
  wsl-mode / wsl-paths）**69/69**，退出码均为 0
  ——跑法是把 `dsh-desktop/vendor/node` 临时换成指向仓库外 node 副本的 junction
  （机器级策略：仓库内 exe 不能写 `%TEMP%` 沙箱），跑完已按 sha1 核对还原。

### feat(plugins)：内置伴随插件远端批量更新（22 目录 / 20 条版本上跳）+ 余额投递契约换代随迁

- **通道与判据（两段式）**：先用 d-pack 私源（本地预览 registry 的 `@dsh-pack/*`）逐目录
  覆盖，再对同一批目录查外部上游（npm `dist-tags.latest` 与 GitHub 默认分支的
  `package.json`）；只有外部版本更高、且与 pin 的 `0.2.0-rc.2` 内核兼容时才二次覆盖。
  包名回灌保持在册名字（不把 `@dsh-pack/` 前缀落进源目录），`dsh-better-sidebar`
  按点名不更新（保持 0.15.3）。实测落点：`assets/plugins` 下 **22 个目录被改写、
  20 条 `version` 上跳**；`dsh-file-changes` / `dsh-workspace-anchor` 版本不变，
  但补齐 d-pack 的 `dsh.bundle.patch` 声明 + `files` 白名单 + `LICENSE`。
- **d-pack 批次 18 条**：`dsh-balance` 0.1.1→0.1.2、`dsh-openclaw-bridge`
  0.8.0→0.8.1、`dsh-conversation-tweaks` 0.1.0→0.1.1、`dsh-prompt-custom`
  0.1.1→0.3.5、`dsh-pocket` 2.10.6→2.10.7、`dsh-prompt-optimizer` 2.0.3→2.0.4、
  `dsh-offpeak` 1.0.0→1.0.1、`dsh-zcode-migrate` 0.1.1→0.1.2、`dsh-quest-ui`
  0.6.0→0.6.1、`dsh-auto-compact` / `dsh-change-review` / `dsh-input-fold` /
  `dsh-input-history` / `dsh-settings-groups` / `dsh-settings-nav-custom` /
  `dsh-subagent-lens` 各 0.1.0→0.1.1，外加上述两条规范化件。`dsh-pocket` 2.10.7 与
  `dsh-prompt-optimizer` 2.0.4 比 npm 侧（2.10.6 / 2.0.3）更新，属 d-pack 领先。
- **外部上游二次覆盖 4 条**：`billion-context-dsh` 0.2.1→**0.2.26**（npm）、
  `dsh-easyrewrite` 2.5.2→**2.6.0**（npm，高于 d-pack 的 2.5.3）、
  `dsh-reasoning-effort` 0.7.0→**0.8.1**（GitHub 默认分支；npm 侧只到 0.2.8）、
  `dsh-basics-panel` 0.1.0→**0.4.1**（npm 未收录，按点名「本地跑它的构建」：
  拉上游 `src/` 跑它自带的 tsdown 出 `lib/`，不手改产物）。
- **判定不更新（逐条实测，非默认保守）**：`dsh-synapse` 保持 0.3.0——上游 0.4.2 的
  `dsh.client.inject` 声明 4 个 `@deepseek-ai/dsh-api-*` remote 服务，而我们的版本已把它
  裁成 `inject: []`（多声明内核不存在的服务 = loader 永久 pending 隔离、全部路由静默缺失），
  `client.js` 另带本地「DSH Desktop 深色适配桥（0.6.3 第三案）」手改段；整目录覆盖会同时
  复活这两处（形状差异实测 `index.js` 48,688B↔39,242B、`app.js` 91,662B↔103,126B）。
  d-pack 未收录的 4 条按原样保留：`dsh-session-manager` 0.1.0、`dsh-super-injector` 0.3.1、
  `dsh-side-session` 0.3.1、`dsh-wsl-settings` 0.1.0。
- **页面可见的行为换代 4 条**：
  - `dsh-balance` 0.1.2——余额投递从「自制壳 push → 渲染进程 `dsh-balance-changed` 事件」
    换成插件宿主半边在内核 `webServer` 上注册的两条**只认回环**路由
    （`GET /api/dsh-balance/state` 读缓存载荷、`POST /api/dsh-balance/refresh` 只触发查询，
    其响应体被客户端忽略），客户端 60s 轮询；路由 404 时降级为「只显示本轮费用」。
    Electron 遗留线（`balance.js` → sidecar `balance-fetch` → Rust `start_balance_loop` →
    `app.emit("balance-changed")` → shim）**已无消费者但仍在跑**，代价是每 180s 仍真发一次
    `/user/balance` 查询；本轮只登记撤回账不拆（跨 `bridge-api.md` 契约），拆除前置见
    `docs/balance-architecture.md` §1.2。
  - `dsh-conversation-tweaks` 0.1.1 与 `dsh-openclaw-bridge` 0.8.1——内核没有
    `ctx.settings.register`（全内核 0 处命中），d-pack 用
    `tools/codemod/apply-settings-scope.mjs` 生成的 `settings-host` 垫片替换它
    （`settings.configure` + `describe/mutate` + `settings/document-updated` 订阅，
    openclaw 侧是 codegen 块，**勿单包手改**）；ns 语义随之变成 profile 条目 id。
  - `dsh-offpeak` 1.0.1——定时任务执行出口从内核根本不存在的 `apiProxy` 换成真实服务
    `sessionController.prompt`（旧写法每次到点落进 catch、任务标 failed，功能静默不可用）；
    `inject` 随之加 `sessionController`。
  - `billion-context-dsh` 0.2.26——上游 tsup 从 0.2.26 起把 `acp-kernel` 内联进
    `dist/index.js`（不再有 `from "acp-kernel"` 的运行时导入），内层 `node_modules` 副本与
    `COMPANION_PLUGINS` 上该条目的 `shipsNodeModules: true` 同批下线（判据注记留在
    `scripts/lib/companion-plugins.js:58-61`）；`dependencies` 清空、改走宿主闭包的
    dsh-session / dsh-settings / dsh-llm / dsh-tools / dsh-compaction / schemastery，
    其 peer 范围 `>=0.1.5-alpha.1 <0.1.6-0` 窄于我们 pin 的 `0.2.0-rc.2`，兼容性由
    `unit-plugin-esm-link` 的具名导入离线核对背书（该守卫正是为这类换代断裂而存在）。
- **测试随迁（更新造成的 18 条红全绿）**：`edge-client`（余额投递换代：假 fetch 走
  loading→ready、404 归 `absent`、`/refresh` 响应体不参与投递，21 例）、
  `unit-plugin-dom-contract`、`unit-companion-client-rc8`、`unit-openclaw-settings-inject`、
  `unit-sync-cli`、`unit-zcode-migrate-registration`、`unit-dsh-subagent-lens`、
  `unit-plugin-esm-link`、`unit-hub-registry`。事件通道退役属**正当换代**，不删旧用例、
  改配反向锁（不得复活 `dsh-balance-changed` 监听）。
- **新增机器锁 4 条**：`unit-hub-registry` 加「scoped 配套件必须 `private:true`」收口
  （防覆盖上游时丢标记 → 被当作用户自装件误清）与「`THIRD_PARTY_NOTICES.md` §4.1 ↔
  `docs/builtin-plugins-inventory.md` §一 ↔ 各 `package.json` 逐名逐版本一致」账本对账，
  `nm` 标记同时锁「磁盘实存 = `shipsNodeModules` 声明」（该文件 21 例）；
  `unit-balance-weekend` 加第 4 节「现役侧 `assets/plugins/dsh-balance/lib/balance-core.js`
  ↔ 遗留侧 `balance.js` 逐时刻对拍 + 对 dsh-offpeak 参考实现逐小时对拍」（14 例，含
  `peakHits > 0` / 周末样本 ≥24 的反空转锚）。锁可信性用人为漂移反证：价目 9→8.5、
  周末门槛 +1 天、高峰窗口 9:00→8:00 三例均判红。
- **CI 独立校验器随迁**：`scripts/test/verify-balance-dock.cjs` 场景4/4b 按新通道重写
  （假 fetch + 挂载计数，`ci.yml:42` 单独一步、`npm test` 不收 `.cjs`，属既往盲区）。
  过程中踩到并修掉一个假绿：`flush()` 用 unref 定时器会让进程在 `await` 中途退出、
  只打印到第一条断言仍 EXIT=0；场景5/6 与汇总/`process.exit` 一并移入 async 主块。
- **文档随迁**：`docs/balance-architecture.md` 按现役链路整体改写（四层图、通道形态与
  节流层次 60s/30s/180s/4s、SSE 否决理由、遗留线撤回账与拆除前置、双份价目常量与
  双拷贝锁、§8 登记插件自带 test 不在 `npm test` 内并给出可跑命令）；`README.md`
  「DeepSeek 余额小部件」一节重写并把 Electron 时代文件标注【已删除】；
  `docs/builtin-plugins-inventory.md` §二 与 `docs/security-telemetry.md` 的 `/user/balance`
  出口条目同步。
- **验证**：`npm test` → **1927 例 / 1920 pass / 0 fail / 7 skipped**（上一批基线
  1924/1917/0/7；本轮改动的守卫文件实测 `unit-balance-weekend` 14、`unit-hub-registry` 21、
  `edge-client` 21，全绿）；`node scripts/check-syntax.js`、`node scripts/compat/validate-pin.js`
  → `dsh-v0.2.0-rc.2（offline-tarball）`、`node scripts/compat/patch-surface.js verify` →
  67 文件无漂移、`node scripts/test/verify-balance-dock.cjs` → 全部断言通过，四者退出码实测
  均为 0。本批只动 `dsh-desktop/`，`dsh-tauri/` 源码零改动（Rust 面沿上一批基线）。

### refactor(plugins)：内置伴随插件批量退役（39 → 28）+ 专属补丁面与随包依赖收窄

- **点名退役 11 条**：`dsh-client-file-changes` / `dsh-terminal-tab` / `harness-pet` /
  `dsh-vision` / `graph-memory` / `dsh-community-market` / `dsh-market-desktop-bridge` /
  `dsh-hub` / `dsh-file-drop` / `dsh-image-paste` / `dsh-cardian` 从 `COMPANION_PLUGINS`
  摘清单并整体删除源目录。实测对账：`COMPANION_PLUGINS` 28、`assets/plugins` 28 个目录，
  一一对应；`RETIRED_COMPANIONS` / `RETIRED_COMPANION_DIRS` 各 12 条（含前一批
  `plugin-manager`）——退役＝「摘清单 + 进 RETIRED + 删源目录」三件事，缺一即阴影残留。
- **批量退役回收机器（新增，boot 与 CLI 双入口共用）**：`removeRetiredCompanionDirs`
  （目录 + profile manifest 撤账）与 `removeRetiredCompanionPatchRows`（patch 层按
  loader id + `legacyIds` 双认领）接进启动链「退役认领 → 登记撤账」两步
  （`scripts/integration/plugin-sync.js:410` → `:469`），CLI 侧同款接线在
  `scripts/sync-companion-plugins.js:297`。判据链：目录能证明是壳镜像副本
  （`package.json` 的 `private` + 描述含 DSH Desktop）才删目录并撤 manifest；证明不了则
  **保留目录与登记，只撤账**——不改用户意图（graph-memory / harness-pet / dsh-cardian
  三条正是这种：上游 `package.json` 与我们的镜像逐字段相同，无判别证据，而未登记目录
  是惰性的、loader 不挂载）；`dirsOnly` 条目（`plugin-manager`，包名撞官方内核包）
  不进手术面。历史「随包默认禁用」三条形状行
  （harness-pet / cardian / graph-memory）按形状继续认领，留着会每 boot 刷一次缺包栈。
  守卫：`scripts/test/unit-companion-bulk-retire.test.js`（表驱动 14 例，含「无镜像证据
  的同名目录既不删也不撤账」与 `dryRun` 零落盘的反证）。
- **补丁面收窄**：`image-send-fix` 从 `PATCH_SPECS` 摘除（59 → 58），`patch-adapters`
  里的 transform 与 `IMAGE_SEND_*` / `VISION_KEY_*` / `VISION_TOGGLE_*`（含从未登记的
  vision-key / vision-toggle 两个休眠变体）整体删除；`SETTINGS_NAMESPACES` 4 → 3
  （`dsh-vision` 出列）。判据是「只为已退役插件存在」，反例保留并在
  `patch-registry.js` 头注立档：`prompt-context-literal`、pi-ai / ds-tool 系工具名与
  schema 净化、`content-has-image-guard` 都是通用 wire/schema 守卫，graph-memory 与
  cardian 只是历史触发源。
- **随包文件/依赖瘦身**：`PLUGIN_FILES` 去掉 `lib/vlm.js`（唯一携带者 dsh-vision）与
  `lib/typert.host.*`（唯一携带者 dsh-hub / dsh-cardian）；`VENDOR_DEPS` 去掉
  `ajv` / `ajv-formats` / `semver`（dsh-community-market 独占）。两者对现存 28 件均
  实测零命中。三个只为退役件存在的脚本随之下线：`scripts/verify-vision-upgrade.js`、
  `scripts/patch-community-market-restart.js`、`scripts/test/unit-image-send-fix.test.js`。
- **测试随迁**：`unit-pure-bundle-line` 由单步升级为「按 boot 步序两步撤账」组合用例，
  并加夹具防腐断言（`terminal` 必已退役走按名字认领、`balance` 必仍在册走
  `missingNames` 认领），阈值 35 → 20；`unit-plugin-esm-link` 覆盖面哨兵同比例下调
  （插件 30 → 22、具名导入 150 → 100，实测 128），`PROTOCOL_PARITY_STRICT/SHAPE`
  清空（在册件里已无 `@deepseek-ai/*` 内嵌副本，档位保留为「待命中」）；
  `ta4` / `ta5` / `ta15` / `rv9` 中 `__DSH_PET__` 与拖放提示层的分支判据改为**退役反证**
  （不得复活），`ta15` B 档身份态提出循环并把哨兵改成精确计数（`200 × (态数−1)`）。
- **验证**：`node --test scripts/test/*.test.js` → 1902 例 / 1894 pass / 0 fail / 8 skip；
  `*.test.mjs` 18/18；`check-syntax.js` 通过；`validate-pin.js` →
  `dsh-v0.2.0-rc.2（offline-tarball）`；`patch-surface verify` → 67 文件无漂移。
  壳侧配套改动见 `dsh-tauri/CHANGELOG.md` 同名条目。

### feat(plugins)：内置 dsh-easyrewrite 取代 dsh-message-rewind；修 prompt-optimizer 伴随 id 失配

- **插件替换**：消息撤回/再编辑改用社区插件 `dsh-easyrewrite`（Renzic-Stone，MIT，
  npm 2.5.2）——原版体验、上游活跃、client inject（`slots/sessions/workspaces`）
  在 rc.2 全部在场（better-sidebar 同表实证）；自研 `dsh-message-rewind` 移除
  （功能同域，卸载即退役，无数据迁移面）。
- **修 id 失配**：`dsh-prompt-optimizer` 的伴随清单 id 误写为包名
  `dsh-prompt-optimizer`，与其 bundle 层 `cordis.patch.yml` 声明的 loader id
  （`prompt-optimizer`）不一致——同 super-injector 事故（#104）的前置形态：
  自愈 `dropBlocksByIds` 永不命中该插件的残留 insert 块。已对齐为
  `prompt-optimizer` 并在清单加注。
- **验证**：easyrewrite 全链 id 一致（patch yml = client bundle load id = 清单 id
  = `dsh-easyrewrite`）；包形单件零依赖；MIT 补入 THIRD_PARTY_NOTICES 2.1 表。

### fix(pi-ai)：配额耗尽（429 `insufficient_quota`）被当可重试，先白等多轮退避

- **症状**：线上报错
  `429: {"message":"Allocated quota exceeded, please increase your quota limit...","type":"insufficient_quota","code":"insufficient_quota"}`。
- **先澄清一点（实测，避免误修）**：**错误分类本来就是对的**。
  `@deepseek-ai/dsh-llm` 的 `isQuotaExceededError` 模式集已覆盖
  `insufficient[\s_-]+(quota|balance|credits)` 与 `quota exceeded/exhausted/reached`；
  `dsh-llm-pi-ai` 的分类顺序也把 `QUOTA_EXCEEDED_CODE` 排在 `429 → RATE_LIMIT` 之前。
  用该真实 payload 实测 `isQuotaExceededError` **返回 true**（反向对照：纯限流文案、`401
  invalid api key` 均为 false）。所以问题**不是**"被显示成限流"或"被误判成 key 无效"。
- **真正的缺陷**：`@earendil-works/pi-ai/dist/utils/provider-retry.js` 的
  `isRetryableProviderError` 把 **429 一律判定可重试**（镜像 OpenAI/Anthropic SDK 的退避
  策略，对**限流**是对的）。而配额耗尽在 OpenAI 兼容 API 里同样是 429 —— 但它是**终态**，
  不充值永远不会成功。于是每次请求都先白等若干轮退避（单轮上限 60s）才把错误交给上层分类。
- **修法**：新增补丁 `pi-ai-quota-not-retryable`（靶 `provider-retry.js`），在
  `x-should-retry` 显式头之后插入配额判定，命中即 `return false`；关键词集与 dsh-llm 的
  `isQuotaExceededError` **对齐**（单源对照便于维护）。显式头仍优先，运维可用它覆盖。
- **验证**：应用后幂等（二次 already）；功能 **8/8** —— 配额类三条
  （`429+insufficient_quota` / `quota exceeded` 无 code / `insufficient balance`）→ 不可重试；
  **反向控制四条**（纯限流 429、空正文 429、500、408）→ 仍可重试；`x-should-retry:false` → 仍优先。
- **副作用面**：只影响"重试与否"，不改分类、不改文案、不改任何错误码口径。

### fix(balance)：本轮费用算错——带日期后缀的模型名落回 pro 档（高估 3 倍）

- **症状**：每轮对话底部「本轮费用」金额不对（DeepSeek 渠道；账户余额本身正常）。
- **根因**：`balance.js` 的模型→价目表是**精确键查找**，而官方/聚合渠道常下发带日期或
  版本后缀的变体名（`deepseek-v4-pro-0813`、`deepseek-v4-flash-250610`、`deepseek-chat-V3`），
  价目表只有 4 个规范键 → 未命中即 `|| PEAK_PRICES[DEFAULT_MODEL]` 落回 **pro**。
  实测（本机活动模型正是 `deepseek-v4-pro-0813`，provider `jiyuan`）：
  `effectivePrice('deepseek-v4-flash-0813')` 返回 `{4.5, 0.15, 13.5}` —— 那是 **pro 空闲价**，
  flash 空闲应为 `{1.5, 0.05, 4.5}`，**高估 3 倍**。
- **修法**：新增 `pricingKeyOf(model)`（精确命中 → 剥尾随日期/版本段 → 最长前缀命中 → 原值），
  `effectivePrice` 改用它取键并导出。**保留**一条老行为：真正未知的模型名仍回退 pro 最高档
  （宁可多报不少报），由测试显式钉住不被改坏。
- **端到端核对**（不是只看单测）：把 widget 的纯函数（`normalizeUsage` / `costOfBuckets` /
  `tierOf` / `pricesForModel`）从 cordis 闭包里按源码文本抽出求值，喂壳侧同口径 payload
  （`priceTable` / `periodTables` / `pricingTier` / `prices` / `peak`），对 4 个模型名 × 峰/谷
  两档逐一比对「widget 显示金额 vs 手算应得」→ **8/8 一致**；修复前 flash 变体显示
  ¥0.41640（pro），现为 ¥0.13880（flash）。
- **顺带查清的两件事（都不是缺陷，但记录以免重复调查）**：
  ① `dsh-token-meter` 的 `tokenUsage` 投影 `projectionSchema` 是 strict 且**只有 4 个 token
  字段、没有 `model`** → widget 的 `u.model` 恒为 null，模型只能取壳推送的活动模型；
  但增量账本按「每次观测时的模型|档位」分桶入账（issue #168 设计），会话中途换模型已被
  正确分档，不构成错算。
  ② DeepSeek 适配器 `mapUsage` **只设 `cacheReadTokens`、不设 `cacheWriteTokens`**，
  而计价是 `miss = uncached + write` → 不存在缓存写入重复计费。
- **验证**：新增 `unit-balance-pricing-key.test.js` 5 例（规范键不改写、变体归本档、
  flash≠pro 且差 3 倍的回归锁、未知名仍回退 pro、最长前缀大小写稳健）；
  余额全套 **113/113 绿**；`balance.js` 属 payload 根级脚本，已重暂存并纳入安装包。

### fix(presets)：内置预设的 dsh-persona 键未跟随 rc.1 schema，人设静默失效

- **症状**：现场日志（`desktop.log`）报
  `[loader-isolation] entry persona (@deepseek-ai/dsh-persona) failed to apply:
  invalid config: - $.prefix missing required value (at prefix)` —— 启动照常，
  但该预设的 agent **静默丢掉自己的身份 system prompt**（异常被 loader-isolation 隔离成非致命）。
- **根因**：rc.1 起 `dsh-persona` 的 Config 是 `{ prefix: 必填, suffix?, complete? }`
  （随 `PERSONA_SECTION` 拆成 `PERSONA_PREFIX_SECTION`/`PERSONA_SUFFIX_SECTION` 一起改的），
  而我们 **8 个随包预设全都还在传旧键 `text:`**。属我方资产未跟随内核 schema，不是用户配置问题。
- **修法**：`assets/agent-presets/*/agent.cordis.yml` 中 dsh-persona 挂载块内的
  `text:` → `prefix:`，共 8 处（anchored-standard / zero-anchored-standard / whoami-standard /
  router-standard / minimal-win / v4-flash-godmode-opencode-go / warmupbetter /
  warmupbetter-replay）；`suffix` 省略即默认 `''`，与旧单节语义一致。
- **验证**：8/8 改到位、零 `text:` 残留；8 个 YAML 均可解析（`!!js` 自定义标签告警属正常）；
  预设 + better-sidebar 全套 **91/91 绿**。

### fix(better-sidebar)：右上角折叠按钮簇被内置侧栏遮罩盖住，点不到

- **症状**：dsh 自带侧栏与插件右上角的折叠按钮簇重叠，**两个按钮叠在一起、点不到**。
- **根因（活页面实测，非推断）**：官方前端的内置侧栏抽屉遮罩根节点是
  `position:fixed; z-index:1000`，且遮罩本体全屏 `602×652`、`pointer-events:auto`、
  `background:rgba(0,0,0,.24)`；而插件的 `[data-dsh-panel-host]` 只有 `z-index:40`。
  host 自身是层叠上下文，子元素（`.toggleCluster` 虽 `z-index:45`）**无法越出 host 与遮罩竞争**，
  于是 `document.elementFromPoint(簇中心)` 命中的是 `DIV._mask_w1urq_14` 而非按钮。
  同一遮罩还压住插件自带的 `mermaidModal`(1000) 与 `uploadDropZone`(1001)。
- **修法**：把 `[data-dsh-panel-host]` 的 `z-index` 由 40 抬到 **1001**（高于实测遮罩 1000）；
  `src/client/sidebar.module.css` 与 **四份 lib 产物**（client / client-registry /
  client-editor / client-mermaid）同步改，避免只改 src 而运行时入口拿不到修复。
- **验证**：隔离实例内 `sidecar boot` 重新 sync 后重载页面复测 —— 同坐标命中目标由
  `DIV._mask_w1urq_14` 变为插件自身的 `svg`，`clickable: true`；遮罩仍在位，
  内置抽屉的遮罩行为不受影响。插件版本 `0.15.2 → 0.15.3` 以触发 keep-newer 同步。

### fix(session)：旧对话「历史加载失败」——v0→v1 迁移整条拒载（0.6.4 在野）

- **症状**：升级后部分旧对话打不开，报
  `failed to observe session "…": @deepseek-ai/dsh-session-format-v0-to-v1 refuses this
  format v0 Session: compaction/summary 82013 data has unexpected member "tier";
  source v0 artifact remains unchanged`。现场一台机器 **54 个会话里 19 个读不回**。
- **根因**：换到的内核新增 `dsh-session-format-v0-to-v1`（frozen "released-v0" 编解码器），
  它**冻结了第一方 v0 构建当时写出的载荷成员清单**，清单外成员一律 `SessionFormatError`
  整条拒载 —— 不丢弃、不重写、也不降级，于是跨代留存的会话永久读不回。三类实测来源：
  1. `compaction/summary` 多 `tier`/`kernelBlockId`/`parentBlockIds`/`directMessageIds`/
     `effectiveMessageIds` —— 由**第三方压缩插件 `billion-context-dsh`(acp-kernel)** 自带的
     块账本写入（17 个会话）；
  2. `permission/preset` 多 `origin:"default"` —— 早期写入方的溯源信息（4 个）；
  3. `subagent/descriptor` 的 `version:2` —— 字段集与 v3 完全相同；上游只在 v0 分支拒它
     （v1 分支直接 `return` 容忍），而下游 v2→v3 又硬要求 3，属单纯过度收紧（14 个）。
- **修法**：新增补丁 `released-v0-history-recovery`（order 402，靶
  `dsh-session-format-v0-to-v1/lib/index.js`），三处**只扩准入清单、不放宽任何校验**：
  块账本字段与 `origin` 进 optional 且**原样保留到 v3**；描述符 `version:2` 盖章为 3 后
  **继续落到原有的严格形状校验**（不 `return`、不跳过），非 2 的未知版本仍照拒；
  v1 分支行为逐字不变。三处锚点缺一即整体 `anchor-missing` 不落地，避免半投造成
  准入与校验不一致。
- **被否决的方案（记下来防重犯）**：把 `assertReleasedV0Keys` 的未知成员改成一律 `delete`。
  错在两处 —— ① 会摧毁 `billion-context-dsh` 的块账本（`tier`/块身份是它的语义依赖）；
  ② 覆盖不到第 2、3 类（`origin` 与描述符版本压根不是同一失效形态）。
  准入只能按来源逐条白名单化，不能一刀切放宽。
- **验证**：`unit-released-v0-history-recovery.test.js` 9 例 —— 三态/幂等、部分锚点缺失
  不落地、产物 `node --check`，以及**功能级直跑打过补丁的真实 `assertReleasedEventPayload`**：
  块账本与 `origin` 原样保留、描述符盖章后仍受严格校验；三条反向控制钉住"没把校验关掉"
  （未知垃圾成员仍 `has unexpected member`、未知描述符版本仍 `unsupported descriptor version`、
  必填缺失仍 `lacks required member`）。基线矩阵实测两代 pristine 靶字节一致、
  形态均为 `changed`。
- **生效条件**：改的是已载入 ESM 缓存的模块，**需重启 DSH** 才消失；重启后这些会话首次加载
  完成 v0→v3 迁移并写出 `session.v3.jsonl.zstd` 代际文件（正常路径，与其它已迁移会话一致）。

### fix(shell)：0.6.3 起启动闪 CMD 窗口

- **症状**：自 0.6.3 起，每次启动 DSH Desktop 会闪一个控制台窗口（瞬间出现即消失）。
- **根因**：0.6.3 新增 dsh CLI shim（终端可直接敲 `dsh`）时引入
  `src/app/src/commands/dsh_cli.rs` 的 `append_user_path()`，它在 `setup` 期被
  `lib.rs:479 ensure_dsh_cli_shim()` 调用，以 `powershell ... .output()` 读写
  `HKCU\Environment` 的 Path —— **漏了本仓库统一的 `creation_flags_no_window()`**。
  GUI 进程起 console 子程序必然分配控制台窗口（同一纪律在 `run_sidecar`、
  `balance.fetch_once`、`acp`、`kill_tree`、`single_instance`、`node_resolve`、
  `wsl-backend` 处都已落实，唯独这个新 spawn 漏网）。
  且其提前返回条件是「**当前进程** PATH 已含 shim 目录」，而注册表写入不会刷新已运行
  进程的环变 —— 因此在重新登录前，**每次启动都会闪**，不是只闪一次。
- **修法**：补 `.creation_flags_no_window()`；trait 引入按 `#[cfg(windows)]` 门控
  （调用点在 windows-only 函数内，无条件引入会在非 Windows 构建产生 unused import 警告，
  本仓库执行 `cargo build --workspace` 零警告纪律）。
- **防回归**：按仓库「形态锚点测试」纪律加
  `append_user_path_suppresses_console_window_shape`，钉住 powershell 通道、
  `-NoProfile`、`DoNotExpandEnvironmentNames`（保留用户 PATH 的 `%VAR%` 原文形态）
  与 `.creation_flags_no_window()` 四项。
  **捕获力已反证**：移除该旗后此测试 FAILED 并点名"spawn 必须抑制终端窗"，还原即绿。
  （首次反证因 CRLF 行尾导致替换未生效而假绿，改用行尾容错匹配后才得出真结论。）
- **全量审计（确认这是唯一漏网点）**：逐一核过 Rust 侧全部 `Command::new` 点 ——
  supervisor 的 10 处 spawn 均走 `.creation_flags_win()`；`wsl.exe` 三处有
  `set_no_window()`；`node_resolve` 用 `no_window()` helper；`explorer` / `open` /
  `xdg-open` 是 GUI 程序不产生控制台窗；其余为 unix-only（`pbcopy`/`ps`/`lsof`/`sh`）
  或 `#[cfg(test)]` 内。故启动路径上仅 `dsh_cli.rs` 一处缺旗。

### feat(kernel)：内核换代 0.1.5-rc.1 → 0.1.5-rc.2（0.6.4）

- **版本落点**：客户端版本三处统一 `0.6.3 → 0.6.4` ——
  `dsh-tauri/src-tauri/src/app/tauri.conf.json`（发布权威，CI 版本闸门断言它 == tag）、
  `dsh-tauri/src-tauri/Cargo.toml`（workspace，各 crate 继承、无独立 version 声明）、
  `dsh-desktop/package.json`（此前从 0.5.2 起长期滞后，已一并归一）。推 `v0.6.4` tag 触发
  三平台发布属对外动作，留人工执行。
- **换版落点**：`kernel-pin.json` 定版 `dsh-v0.1.5-rc.2`；`vendor/dsh-kernel/` 换成 259 个 rc.2
  tarball（rc.1 全量移入仓库根备份目录，非删除，随时可回退）；`package.json` 260 处依赖版本行
  同步；锁由 `generate-kernel-lock.mjs` 重生成（259 个 `file:` 条目 + integrity 按真实 tarball
  字节重算）；`install-kernel.mjs` 装入 rc.2；`patch-deps` 收口 **写入 74 处 / 失配 0 / 失败 0 /
  告警 0**（60 条 spec）；pristine 基线树重建为 `.tmp-kernel/.consumer-0.1.5-rc.2`。
- **漂移面实测为零（不是假设）**：换代前先做预检 —— 把 rc.2 tarball 单独解成一棵树，对
  `PATCH_SPECS` 逐条跑 transform 三态判定：**44 条 file transform 全部 `changed`、
  0 `anchor-missing`、0 THROW**。全家族唯一的靶文件字节变动是
  `dsh-client-ui-chat/lib/client.js`（+15 字节），差异实为 `TurnTailNodeView.module.css` 里
  `.TS9iAW_actions` 多了一条 `margin-top:4px`，不触任何锚。
  7 项关键语义契约逐项比对计数完全一致（torn-tail 扁平字段、未知事件 fail-closed、`surfaceOp`
  必填、`PERSONA_*` 拆分、`isSeeded`/格式版本、typert 协议导出面、宿主布局类名）。
  包集合亦经 registry 探测确认 259/259 在架、零增删、抽样依赖面零变化 —— rc.2 是同源重打包。
- **fix(compat)：消除两处「第二版本源」硬编码**（本轮真正的换代隐患）。
  `scripts/generate-kernel-lock.mjs` 与 `scripts/install-kernel.mjs` 各自硬编码
  `KERNEL_VERSION = '0.1.5-rc.1'`，而**两个文件的头注释都写着**「内核版本唯一定义在
  kernel-pin.json」—— 代码与自身声明的不变量矛盾。实测后果不是报错而是**静默错判**：
  ① 锁生成对 259 个包全报 `WRONG version … 0.1.5-rc.2`（因为它拿旧常量比对新字节）而拒绝写锁；
  ② `install-kernel` 快速幂等路径把仍装着 rc.1 的 `node_modules` 判成「已就位」直接 skip，
  换代被无声跳过。两处改为从 `kernel-pin.json` 读 `kernel.packageVersion`，取不到即抛。
- **fix(dsh-hub)：内嵌协议副本随版到 rc.2**（`1.1.4 → 1.1.5`）。这条是上一轮新加的
  内嵌跨界副本平价守卫**在下一代内核上第一次兑现** —— 它当场报出
  `内嵌 dsh-typert-protocol = 0.1.5-rc.1，宿主 pin = 0.1.5-rc.2 → 旧协议对新宿主`，
  否则插件会继续拿旧协议对新宿主而无人察觉。副本已刷新、manifest pin 对齐。
- **验证（五路闸门在 rc.2 全绿）**：Node 全量 **2057 例 / 2050 通过 / 0 失败 / 7 跳过**；
  Rust `cargo test --workspace` **739 通过 / 0 失败**（38 个 `test result: ok`）；
  Tauri sidecar boot 六步链 **23/23**；`validate-pin` 通过 `dsh-v0.1.5-rc.2`；
  `patch-surface verify` 49 文件 / 84 标记一致；`stage-payload` + `[payload-patches] OK 核 50 靶
  / 滞后 0`；`smoke-installed` **PASS**（装配 resources 内核实为 0.1.5-rc.2，插件加载零致命、
  page-error 0）；CDP 移动视口复核宿主仍渲染 `pI_x6G_rightbarCol` / `wSkVaW_scrollBody`。

### feat(kernel)：内核换代 0.1.2-alpha.5 → 0.1.5-rc.1（0.6.4）

- **换版落点**：`scripts/compat/kernel-pin.json` 定版 `dsh-v0.1.5-rc.1`（`pinPolicy: exact`），
  `vendor/dsh-kernel/` 全量换成 259 个 rc.1 tarball（242 个 alpha.5 tgz 退役），
  `package-lock.json` 由 `generate-kernel-lock.mjs` 以真实 tarball sha512 重生成，
  `node_modules` 与 pristine 基线树（`.tmp-kernel/.consumer-0.1.5-rc.1/`，新增
  `scripts/install-pristine-kernel.mjs` 离线解包产出）同步到位。
- **fix(profile-bundle-heal)：注入调用点沿用旧签名 → 每次启动 ReferenceError**（本批唯一真实缺陷）。
  **症状**：真实启动在 `dsh-app-boot/lib/index.js` 抛 `ReferenceError: name is not defined`，
  由 `unit-profile-reconcile` 的「真实 dsh-app-boot」用例抓到。
  **根因**：rc.1 把「逐个 bundle 严格装配」的 `bundles.map(...)` 块从 `loadProfile` 移进了
  `loadProfileDirectory(binName, dir, installAnchor, options)`，而**该函数签名不再有 `name` 形参**
  （上游自己以 `name: basename(dir)` 派生 profile 名）；`applyAppBootBundleGuard` 注入的调用点
  仍写 `loadProfileLayers(binName, name, dir, installAnchor)`，落入无 `name` 的作用域即崩。
  **修法**：调用点改传 `basename(dir)`，与上游对 profile 名的派生口径逐字一致；
  注入的 `loadProfileLayers` / `loadProfileManifestSafe` / `loadBundleLayerSafe` 三个 helper 签名不变。
- **fix(dsh-mini)：手机端两处 CSS Module 哈希类换代失配**（`assets/plugins/dsh-mini` 1.4.2 → 1.4.3）。
  **症状**：手机端右栏不再被压成 0 宽（挤压正文），键盘弹起时输入框不跟随上移、也不自动滚到底。
  **根因**：rc.1 上游把布局右列局部类 `pI_x6G_detailsCol` 改名为 `pI_x6G_rightbarCol`
  （`pI_x6G_*` 家族现存 centerCol/sidebarCol/rightbarCol/frame/handle/overlayLayer）；
  聊天滚动容器整族换前缀（`Md3f7G_*` → `EvIC1a_*`，实证 `Md3f7G_flowItem`→`EvIC1a_flowItem`）。
  **修法**：CSS 规则与 `querySelector` 均改为「旧类 + 新类」并列的双代选择器（沿用
  `dsh-conversation-tweaks` 既有策略），旧内核副本仍命中、rc.1 恢复生效；升 `version` 使
  伴随插件 keep-newer 同步能替换存量用户机上的旧副本。
  **未决**：`.nL4_yW_sessionLogButton`（隐藏 session log 按钮）在 rc.1 全树零命中且上游无同名局部类，
  疑该按钮已下架，规则暂为空转，待实机确认后清理。
- **fix(session-persistence)：rc.1 torn-tail 契约换代使两个容错补丁「锚点命中但语义失效」**。
  **根因**：rc.1 把会话尾部恢复的返回契约从 alpha.5 的嵌套 `{tornMarker:{truncateTo,recoveredEvents}}`
  改成扁平 state 字段（消费端只读 `state.tornTruncateTo` 驱动 `truncateTornTail` 截盘、
  `state.recoveredTail` 驱动 `persistBatch` 回灌；rc.1 pristine 全文 `tornMarker` 出现 **0 次**）。
  K6「会话加载优雅降级」与同族「尾部撕裂恢复」两个补丁仍返回旧嵌套形态 → 降级只落在内存里，
  损坏尾**既不截盘也不回灌**；且 v2 注入体整个缺 rc.1 必填的 `inheritedEventCount`
  （缺失时 seeded 会话在 `toHeaderLine` 硬抛 `seeded session header requires an inherited event count`）。
  **这一类缺陷抓不住的原因**：锚点三态判定依旧返回 `changed`（锚点行本身没变），
  ta6 基线矩阵与 patch-surface 都只校验「补丁是否投上去」，不校验「注入体的产物形态是否还被消费端认」——
  只有读上游消费端函数体才能发现。**教训固化**：换代时凡注入体含「返回给上游消费」的对象字面量，
  必须比对该字段名集在 rc.1 消费端的出现次数，而不是只看锚点。
  **修法**：两补丁各引入世代标记（K6 → `(v3)`、torn-tail → `(v2: rc.1 flat tornTruncateTo)`），
  `spec.marker` 升到新世代；并新增**就地升级通道**——因为两者以 marker 短路做幂等，
  已带旧 marker 的副本（各 profile/overlay 常驻副本、本机 dev 树）进不了 fresh-apply 分支，
  不写升级通道就会被永久锁死在死代码形态。升级采用「整块历史字面量 → 整块新注入体」单次替换，
  使「升级产物与 pristine 全新应用逐字节相同」由构造保证（不依赖差异处清单保持同步）；
  同族 `transformPersistenceAll` 顺带修掉组合层丢掉 `note` 的可观测性断裂。
- **feat(compat)：patch-surface 防漂移门禁补采两族标记，覆盖面 41 → 49 文件 / 72 → 84 标记**。
  `scripts/compat/patch-surface.js` 的 `MARKER_RE` 原只识别 `patch ()` / `fix:` / `compat:`，
  漏采装配防护实际写入的 `guard:` 与 `isolation:` 两族——后果是 `dsh-app-boot/lib/index.js`
  这份承载 5 处补丁、boot 最关键的文件**整份不进快照**，其补丁字节漂移对 `verify` 完全隐形
  （本轮 `loadProfileDirectory` 注入引用未定义 `name` 的启动崩溃正是这样漏过门禁的）。
  已把两族纳入采集，`dsh-app-boot` 首次进入监控，快照随之重基线。
- **fix(dsh-hub)：内嵌 typert 协议副本停在 rc.6，与 rc.1 宿主协议面已分叉**（`1.1.3 → 1.1.4`）。
  **根因**：dsh-hub 以 `shipsNodeModules: true` 自带
  `node_modules/@deepseek-ai/dsh-typert-protocol`（manifest pin 死 `0.1.0-rc.6`），而
  `lib/index.js:39` 实际 import 的正是这份自带副本 —— 宿主升到 rc.1 后它仍在说旧协议。
  两代导出面实测已分叉：rc.1 **移除 `TypertLookupFailure`**、**新增 `RemoteError` / `remoteErrorOf`**。
  **修法**：先取证 dsh-hub 只用到 `Remote` / `TypertRemoteService`（两代均在位、未触碰被移除符号），
  再把内嵌副本刷新为宿主同版、manifest pin 对齐 `0.1.5-rc.1`、升 version 使 keep-newer 替换存量副本。
  顺带全库盘点插件内嵌内核包副本共 89 个，真正跨宿主协议边界的仅此一处与 better-sidebar 的 `dsh-tools`
  （`cordis@4.0.2` / `cosmokit@1.8.3` / `cordis-plugin-loader@1.0.3` 走各自独立版本线，不属落后）。
- **fix(dsh-prompt-custom)：rc.1 人设节拆分使插件在 loader 内整册加载失败**（`0.1.0 → 0.1.1`）。
  **来源**：安装态冒烟 `smoke-installed.sh` 的实机日志抓到，离线侧一律看不见 —— `diag-validate`
  只校验声明与 patch 文件在位，锚点扫描只看 CSS 类，二者都不执行 ESM 链接。
  **根因**：rc.1 把 `PERSONA_SECTION` 拆成 `PERSONA_PREFIX_SECTION` / `PERSONA_SUFFIX_SECTION`，
  顺序键 `DEPLOYMENT_PERSONA` 也改名 `DEPLOYMENT_PERSONA_PREFIX` / `_SUFFIX`。插件
  `lib/index.js:17` 硬 import 旧名 → ESM 具名导出缺失 → 整个 entry 加载抛错；该抛错被我们的
  `loader-isolation` 补丁隔离成非致命，于是**启动照常、症状却是「自定义提示词完全不生效」**
  （旧键取不到值还会让 `order` 变 NaN，是第二处隐性断点）。
  **修法**：import 换成两新节名、按新键取 order；`replace` 模式改为 prefix 挂自定义文本、
  suffix 置空 —— 空文本的合法性由官方自身注册该节时写作 `config.personaSuffix ?? ""` 直接佐证，
  语义与 alpha.5 的单节整段替换等价；`append` 模式挂在 suffix 序之后。全库扫无同类残留引用。
  **复验**：重跑 `stage-payload.sh` + `smoke-installed.sh` → **PASS**，且隔离日志中
  装配期加载失败 0 条、`warn` 0 条、bundle 被跳过 0 条（修前该 entry 每次启动稳定报失败）。
- **test(plugin-dom-contract)：新增 G11 宿主角锚在场守卫，补 G9 的结构性缺口**。
  **缺口**：G9 判据是 `[class*="X"]` 的**局部名**存活，而插件另有**整 token 直写**的锚
  （如 `.pI_x6G_rightbarCol`）。内核重打包会换掉哈希前缀而局部名可完全不变，G9 因此一路绿灯、
  选择器却命中 0 —— 本轮 dsh-mini 手机端两处失效全程无守卫报红，正是这个形状。
  **修法**：G11 采集内核编译产物里的 `<hash>_<local>` token 全集，逐条要求 watchlist 中的宿主角锚在场；
  带「清单防腐」断言（watchlist 条目必须真被插件源码引用，否则只是在检查空气 —— 首跑即抓出误记进
  dsh-mini 清单的 `uV2eYG_root`）与正反控制组（在位的 `pI_x6G_frame` 必判在场、
  已换代的 `Md3f7G_scroll` / `pI_x6G_detailsCol` 必判不在场），防「什么都没扫到」的假绿。
  **取舍**：只对点名 watchlist 生效而非全量扫描 —— better-sidebar 单文件即有 300+ 条自产哈希类，
  全量扫描会一律误报成漂移；代价是新增锚需手动登记，收益是零误报且下次改名立刻报红。
  判据注：哈希段不能要求含数字（`pXSMma` / `VOzbGW` 这类合法前缀就没有数字）。
  **判据收紧**：在场判定从「token 出现在内核任意 css/js」升级为「必须出现在内核 **JS**」——
  CSS Module 类名是在 JS 里作为 `className` 赋给节点的，只落在 `.css` 里可能是死样式。
  收紧后 20 条宿主角锚全部通过。
  **CDP 移动视口实测（390x844 + iPhone UA）与结论边界**：宿主确实把
  `pI_x6G_rightbarCol`、`wSkVaW_scrollBody` 渲染在真实元素上（DOM 探测直接读到这两个类名），
  即锚点指向的不是死样式而是实际挂载的类 —— 这是把 `detailsCol` 改到 `rightbarCol` 的实证依据。
  但**同一轮探测中「mobileCss 已注入」是假阳性**，需记清：dsh-mini 的 `mobileCss` 只经
  LAN 网关代理路径注入（代理为请求打 `x-dsh-mini-gateway: 1`，`lib/index.js:756`），
  而桌面 WebView 直连被 `:246` / `:1014` 的回环判据当作桌面、不走注入。故当时读到的
  `rightbarCol` 规则其实来自宿主自有 CSS，右列 0px 属宿主响应式布局，
  `.pXSMma_previewBadge{display:none}` 之所以不在页面里也是同一原因（不是规则冲突：
  命中该元素且设置 display 的规则实测 0 条）。
  **已证**＝锚点对应真实渲染类名；**未证**＝手机网关路径上的注入效果（该门控与内核换代无关，
  需手机实连或模拟 `x-dsh-mini-gateway: 1` 头另测）。
- **test(plugin-dom-contract)：新增 G12 宿主角锚自动全量校验，堵住「漏登记＝没守卫」**。
  G11 依赖手写 watchlist，结构性弱点是**只有登记过的锚才会被检查** —— 漏一条就等于没守卫。
  G12 改为从插件真实源码**自动提取**选择器位的 `<hash>_<local>` 宿主角锚，逐条要求在内核 JS 在场；
  刻意保留的旧代回退必须进白名单且**逐条带理由**（现三条：`pI_x6G_detailsCol`、`Md3f7G_scroll`
  属并列保留的旧内核回退；`nL4_yW_sessionLogButton` 属 rc.1 全树零命中、疑上游下架，规则暂空转待实机确认）。
  另要求 G11 的手写 watchlist 必须是自动提取集的**子集**，否则判红 —— 防清单与实现悄悄脱节。
  **捕获力已反证**：向 `dsh-mini` 注入一个内核里不存在的 `.ZZ9qKw_bogusFutureAnchor` 即刻报红并点名
  文件行号与「整棵树都没有」归因，还原后 13/13 绿。
  这条同时覆盖了**手机网关路径的锚点正确性**：`mobileCss` 只在经 LAN 网关代理的请求上注入
  （桌面 WebView 直连不走），本地渲染态无法验证该路径，但「锚指向的类是否还被内核挂到元素上」
  已由 G12 机器保证。
- **test(plugin-esm-link)：新增离线 ESM 具名导入链接守卫 `unit-plugin-esm-link.test.js`**。
  把上一条那类断链从「实机才发现」变成「换代当场报红」：逐册收集插件运行时 JS 里的
  `import { A } from '@deepseek-ai/*' | 'cordis*' | '.'`，解析到实际文件（插件自带
  `node_modules` 优先、其次宿主树），汇总目标模块导出名（`export {…}` / `export const|function|class`
  / `export default` / `export * from` 递归跟进）后逐条比对。覆盖面含 cordis bundle
  与 `dsh.client` 两半 —— 后者正是服务器 boot 冒烟照不到的部分。
  **捕获力已反证**：把 `dsh-prompt-custom` 的 import 退回 `PERSONA_SECTION` 即报红、还原即报绿；
  另含覆盖面断言（插件 ≥30 册、具名导入 ≥150 处、`unresolved` 必须为 0）与正反控制组
  （rc.1 已移除的 `PERSONA_SECTION` 必判缺失、在位的 `PERSONA_PREFIX_SECTION` / `renderPrompt`
  必判在场），防「什么都没扫到」的假绿。当前 38 册 / 227 处具名导入 **0 断链**。
  **第二档：内嵌跨界副本平价锁**。同一条测里再加一档，专防「插件自带一份旧内核包、拿它对上新宿主」
  —— 上一档按 ESM 就近语义解析到插件自带副本，因此对这类问题天然无感。分两档是为防噪声让守卫失去意义：
  `STRICT` 要求版本等于 `kernel-pin`（线协议契约，如 dsh-hub 的 typert-protocol）；
  `SHAPE` 允许版本落后、但导出名集合须与宿主同名包**全等**（better-sidebar 内嵌
  `dsh-tools@0.1.1-rc.1` 实测 `defineTool(options)` 签名一致、23 项导出零增删 → 版本落后而形状兼容）。
  **反证顺带抓出守卫自身的真缺陷**：`resolveSpec` 原先在向上遍历的每一层都顺带试宿主
  `node_modules`，于是第一轮即命中宿主副本、就近解析被彻底短路 —— 内嵌旧副本那条路径从来没被比对过，
  `SHAPE` 档实际空转（往内嵌副本加一个导出名都不报红）。改为「逐层只试当层 `node_modules`，
  宿主树仅作最后兜底」后，反证报红、还原报绿，且修正后基线仍为 0 断链 / 0 未解析。
  **教训**：新增守卫必须同时配一条反证，否则「全绿」完全可能只是判据没接上。
- **发版前置验收：真实 v0 会话在 rc.1 可读回，换代不丢历史**。
  本机现存会话日志全部是 `{"type":"session","version":0,...}`，而 rc.1 `SESSION_FORMAT_VERSION = 3`，
  且拒载文案写着「this build ships no upgrade path for it」—— 表面看像会锁死老历史。逐条取证：
  ① `sessionFormatLogFilename(0)` **保留无版本名 `session.jsonl`**（v1 起才带 `.v<N>` 段），
  故现存 `session.jsonl.zstd` 正是 v0 的规范代文件名、可被正常发现；
  ② 拒载分支条件是 `selected.sourceVersion > SESSION_FORMAT_VERSION`，**只对未来的更高版本触发**；
  ③ `v0→v1→v2→v3` 三级迁移包随内核闭包在位并由 `dsh-session-persistence-jsonl` 直接 import，
  旧代走 `decodeStreamingMigration` / `migrationPreparations` 迁移链。
  **遗留**：`DSH_HOME` 隔离未覆盖 dsh-cardian 的 vault 路径 —— 隔离 boot 仍改写了仓库内
  `cardian-vault/*/README.md` 的 `updated:` 时间戳（内容零变化，已还原），属壳侧隔离面缺口，另案处理。
- **验证（五路闸门全绿）**：
  ① `scripts/lib/patch-registry.js` 60 条 spec 中 44 条带 transform 者在 rc.1 pristine 基线树上
     **全部 `changed`、零 `anchor-missing`**（诊断脚本逐条实测）；
  ② Node 全量 `node --test scripts/test/*.test.*`：**2055 例 / 2048 通过 / 0 失败 / 7 跳过**
     （换版起点为 51 失败）；
  ③ Rust `cargo test --workspace`：38 个 `test result: ok`、**739 通过 / 4 忽略 / 0 失败**，
     零 `error[E]`；
  ④ Tauri sidecar boot 六步链（repair→sync→presets→patches→compat-pin→preflight）真机沙箱
     **23/23 绿**、`validate-pin` 通过、`patch-surface verify` 49 文件 / 84 标记一致；
  ⑤ `stage-payload.sh` 全程 OK：`[payload-patches] OK 核 50 个靶文件 / file 规格 43 项 /
     滞后 0 / 无靶 0 / 已退役 0`，client-compat 门禁在位；生产校验器 `diag-validate`
     对隔离 profile 装配出的插件集 **26 checked / errors 0 / warnings 0 / conflicts [] /
     contractViolations []**；17 个 `listed:true` bundle 插件 loader id 与 `patchOk` 全通过。

### fix(better-sidebar)：导航栏与文件目录巨隙 + 拖动左边框导航条阶梯跳变

- **症状一（间隙太大）**：对话导航栏与文件目录面板之间有一个约「explorer 宽 + 8px
  （可能叠加 56px）」的固定巨隙。**根因**：面板让位叠了三套机制——layout.css 的
  #root margin（正确）+ `.cHLsAW_frame` 的 `--dsh-official-push` padding 推挤
  + host 的 56px clearance；其中 push 的 syncPush 公式把 panel 内部的 explorer
  rail 再叠一份（双计），对话列被推离面板整整一条 explorer 宽。
- **症状二（拖动突变）**：拖面板左边框时导航条不恒等跟随。**根因**：push 由
  MutationObserver + **400ms 轮询**兑底同步，拖动中导航条呈 0.4s 阶梯跳变；
  且官方 AppFrame 根自带 `grid-template-columns 0.3s` 过渡，重排落在其上时
  导航条/列宽以缓动追赶指针。
- **修法**（src + lib 双轨）：删 push 整套（syncPush + MutationObserver +
  400ms 轮询 + `.cHLsAW_frame` padding 规则）与 host 的 56px clearance 实验
  规则，让位回归 #root margin 单一机制（面板左缘恒等于对话列右缘，零间隙）；
  `body[data-dsh-sidebar-dragging]` 时官方 AppFrame 根（cHLsAW_frame）也
  `transition: none !important`（hash 漂移时规则自然失配，无害）。导航条强显
  规则（`._9JjVLG_slot`，旧内核 hash）保留并注明依赖。
- **验证**：实机 CDP 探测（隔离 home + headless Edge）确认 #root margin 机制
  生效、frame 的 0.3s grid 过渡在位（修复目标明确）；lib 三处内联修补带计数
  断言落地，node --check 过；better-sidebar 系 48/48 测试绿。
- **补丁（同日第四案，CodeReview 三视角彻查）：修复从未到达运行时入口 +
  贴板值校准 + 四产物/payload 统一**。三份审查交叉实锤：①**运行时真正加载
  的入口是 `lib/client-registry.js`**（dsh.plugin.json `client.main`）——此前
  所有修复只打在 client.js 上，入口一份都没拿到，且它连 slot 强显规则都
  没有（HEAD 前已漂移）→ 面板挤压列宽 <900px 时内核容器查询隐藏 slot →
  **「导航栏彻底不见」**；②用户安装包的 payload 副本整体旧版（push+双计
  公式 630px 在跑）→ **「半个屏幕间隙」**（400+630−56≈574px@1280 视口 ≈
  44.8%）；③`client-editor.js`/`client-mermaid.js` chunk 残留 push 规则
  （css 注入先到先得，抢先时双计复活）；④`right:0` 压正文 28px 且距面板
  还差 32px 衬带。修：四份 lib 产物统一（删 push + slot 强显 + frame 贴板
  + 拖动规则，幂等脚本带计数断言）、src 同步校准为
  `right:calc(-16px - var(--dsh-composer-side-clearance,16px))`（28px 条
  整体进入 32px 右衬带、右缘贴列缘=面板左边框，贴板且不遮正文）、payload
  副本刷新。实机 CDP 终验：push 规则 0 注入、slot 强显+frame 贴板生效
  （面板开 right=-32px / 关恢复官方值）；chunk 重试测试 22/22 绿。

### feat(workspace)：侧栏工作区「置顶到列表顶部」（⋯ 菜单，可多选）

- **功能**：左侧栏工作区分组行的 ⋯ 菜单新增「置顶到列表顶部 / 取消置顶」：
  - 可多选：置顶的工作区恒排最前，按置顶时间降序（最近置顶最上；同毫秒
    连点由单调通涨时间戳保证顺序确定）；未置顶区保持宿主原序（手动排序 /
    拖拽 / 最近更新均不受影响）；未分组桶不显示置顶项；
  - 持久化：localStorage（键 `dsh-desktop.workspace-pins.v1`，按 workspaceId
    记账——重命名不丢；损坏内容整体忽略）；
  - 视觉：置顶行 folder 图标着主题色 + 标题前主题色小圆点（inline style，
    深浅主题自动跟随，零 CSS 注入）；
  - 响应式：模块级 store（版本号 + listeners）+ `useWorkspacePinVersion`
    hook；版本号进 SessionTree 的 groups useMemo deps——切置顶即时重排。
- **实现**：`scripts/patch-workspace-pin.js` root 应用器（靶
  `dsh-client-ui-workspace/lib/client.js`，11 个锚点：store/hook 区/菜单项/
  onSelect/folder 色/圆点/deriveGroups 排序/SessionTree/deps/zh/en）；
  注册 `workspace-pin`（order 215，锚点基于 open-project-dir 应用后文本，
  两者改动面互不重叠）。补丁注册数 60→61（ta3 / ta6 矩阵·哨兵计数同步）。
- **测试**：`unit-workspace-pin.test.js` 8 例——夹具应用/幂等/锚缺失不落盘 /
  真实 vendored 副本注入后语法合法 / CORE 行为（vm 隔离同源验证：切换、多选
  降序、取消恢复、未分组不参与、畸形存储容错）/ 现场锚点哨兵。
- **顺手清理**：摘除 rootAppliers 两个孤儿导出（`patchToolNameMojibake` /
  `patchSchemaBooleanRequired`——均已从 boot 编排退役但导出残留，ta6 B 哨兵
  长期存量红；实现与单测保留，需量时重登记 spec）。

### fix(flash)：选择工作文件夹时「跳闪」（chip 闪回「选择工作区」+ 输入框瞬时禁用）

- **现象**：选完工作文件夹后，对话区头部短暂闪回「选择工作区」（文件夹图标换成
  关闭态、宽度跳变），同时输入框瞬时变禁用、placeholder 闪成「选择一个工作区开始」。
- **历史补丁排查（A 线，未失配）**：0.2.4 时代的 `applyRuntimeFlashFix` /
  `mergeOrderedBaseline` 修复仍在位（`patch-registry` 的 `runtime-flash-fix`，order 40，
  靶点已随 0.1.2-alpha.1 内核分解迁至 `dsh-api-session-controller/lib/client.js`）；
  vendor alpha.5 pristine `:289` 与仓库 / profiles / 运行副本三处均已含 `?? value`，
  全仓也无第二处 `mergeOrderedBaseline` 同源实现 → 会话列表侧不复发。
- **壳层排查（B 线，排除）**：目录选择器走 `dsh-host-directory-picker-native`
  （koffi + 独立 node 子进程开 `IFileOpenDialog`），选完不触发 webview reload /
  窗口重建 / 尺寸变化；渲染恢复梯（EvalReload→NativeReload→NativeNavigate）仅在
  心跳停摆 4×10s 后介入，报障时段日志无换页记录。
- **根因（新向量，UI 派生层）**：`dsh-client-ui-conversation/lib/client.js:14405` 的
  `chipTitle` 把 `workspaces.phase === "ready"` 当作「投影已权威」而屏蔽 `cwd` 派生
  回退。选完文件夹的那一帧里，会话已 open、`useSessions.byId[id].cwd` 即时就位，
  而 `workspaces.items[].sessionIds` 要等宿主下一次 upsert 才回显该 sessionId ⇒
  `sessionWorkspace === undefined` 且 phase 已 ready ⇒ `chipTitle` 塌成 `undefined` ⇒
  WorkspaceChip 回落 `t("hero.chooseWorkspace")`，并因 `inert = hero && chipTitle === void 0`
  （:14436）连带 composer `disabled`。属 alpha 世代引入 Workspace 投影后的回归。
- **修复（兼容层补丁 `workspace-chip-label-hold`）**：删除该表达式里的
  `workspaces.phase === "ready" ||` 一项，让 `cwd` 派生标签（`workspaceLabel(cwd)`，与
  投影回显后的 workspace 标题同源）覆盖投影缺口帧；真正的「无工作目录」hero 仍由
  剩余 `cwd === void 0 || cwd === ""` 两项塌空，引导语义不变。纯显示面，不改状态机与数据流。
- **登记与护栏**：`patch-adapters.transformWorkspaceChipLabelHold`（marker
  `dsh-desktop fix: workspace chip keeps cwd label across projection gap`，OLD/NEW 常量对机械可逆）；
  `patch-registry` 新增 spec（order 350、layout runtime-local、wslLayout wsl、failPolicy warn、
  cli true，pkgRel 复用已导出的 `CONVERSATION_PKG_REL`）；spec 总数 50→51、cli:true 24→25，
  同步 `ta6-registry-invariants` / `ta6-transform-contract` / `ta6-heal-rollback-audit` /
  `ta6-baseline-matrix` / `ta3-boot-chain` / `unit-patch-registry` 计数与基线；`patch-surface`
  快照重跑（37 个被干预文件 / 54 个标记家族）后 verify 零漂移。
- **生效链路证据**：浏览器并非跑 `dsh-web-frontend/dist` 里的打包副本，而是由
  `dsh-client-modules` 的 `ClientModuleRegistry` 把各包 `exports["./client"]` 解析成磁盘
  绝对路径后 `readFileSync` 原样发给 `/plugins/<id>/client.js`（`index.js:526/635/734`）——
  因此改 `node_modules` 里的 `lib/client.js` 确实改变运行 UI；反之缓存按 bundle rev 建立，
  补丁需重启内核/应用后才对新开的页面生效。
- **已知相邻面（本次不改）**：配套插件 `dsh-mini`（DSH-Mobile 手机桥）自带一份 vendored
  `gui/bundles/@deepseek-ai/dsh-client-ui-conversation/client.js`（`:6827`）含同一 gate，
  手机浏览器面同症状；它是插件自身 `build.sh` 的产物、非内核 node_modules 树，现有
  LAYOUTS 全部只解析 `node_modules` 落点，改它属另一条链路（待上游/插件侧随版收）。
- **测试**：新增 `unit-workspace-chip-label-hold.test.js`（8 例：三态契约、注入体语法自洽、
  vm 实跑缺口帧不塌空 / 权威 title 仍优先 / 空 cwd 与无会话语义保持、上游退役形态失配、
  真实 alpha 内核产物锚点、registry 字段契约）。

### fix(balance)：「本轮 ¥」峰谷切换整段跳变 + `isPeakHour` 缺周末规则（issue #168）

- **根因 1（计价时刻错）**：`tokenUsage` 投影是会话**累计总量**，展示层每帧做
  「累计量 × 推送时刻价目」；主进程 `doRefresh()` 的 `prices`/`priceTable`/`peak`
  又全部按推送时刻单点求值——于是跨过整点（或周末零点）的那一次推送，会把之前
  时段已消耗的全部 token 按新价目重算，用户看到「本轮 ¥」突然翻倍/减半。
- **根因 2（两条同一规则的口径）**：官方 2026-08-23 起周六/周日全天空闲价，
  `assets/plugins/dsh-offpeak`（issue #158 产物）已实现，但 `balance.js`
  `isPeakHour()` 周末 9-12 / 14-18 仍返高峰 → 周末高峰时 chip 与计价都错。
- **修复（主进程只增字段）**：`balance.js` 新增 `pricingTier()` /
  `periodTables()`（peak·off·legacy 三张全模型表）/ `pricingSince()`；
  `balance-scheduler.js` 推送携带三字段，均为**可选注入 + 优雅降级**（旧宿主
  如 Tauri sidecar 不注入即退回旧载荷形态），且守
  `periodTables[pricingTier] === priceTable` 身份不变量，首帧金额与旧实现逐字一致。
- **修复（展示层增量账本）**：`dsh-balance` 插件新增 `observeSessionCost()`，
  每个用量增量按被观察时刻选档入账、分段锁定不追溯；高水位差量保证渲染期
  幂等（StrictMode 双渲染 / 无新 token 轮询 / 投影小幅回退均不叠加）；
  `localStorage["dsh-balance:cost-ledger:v1"]` 按 `sessionId` 持久化（上限 60 会话
  按 `updatedAt` 淘汰，损坏/超额/写失败一律静默重建）；老会话无账本时首帧按当前
  价目一次性入账（`backfilled` + `cost-ledger backfill` 日志），与旧行为金额等价。
- **修复（周末口径对齐）**：`isPeakHour()` 补周六/周日全天空闲，新增门槛常量
  `WEEKEND_OFFPEAK_SINCE_UTC`（北京 2026-08-23 00:00）并**不溯及既往**；与
  dsh-offpeak 采用「复制口径 + 注明来源 + 源码交叉对拍」（避开 CJS 要求 ESM 插件
  源的打包耦合）；tooltip 文案补「周六/周日全天空闲价」与分段明细。
- **测试 / 门**：新增 `unit-balance-weekend.test.js`（12）、
  `unit-balance-scheduler-payload.test.js`（10）、`unit-balance-ledger.test.js`（22），
  含门槛前后周末、与 dsh-offpeak 逐小时对拍、价目切换金额不变、老会话一次性入账
  兼容、双向 payload 兼容；`edge-client.test.js` 两个赖于旧「重定价」语义的用例
  拆为独立沙箱；`docs/balance-architecture.md` 同步 §1/§2.1/§7/§9/§10。

### fix(presets)：内置预设不出现在客户端（issue #174）

- **根因（写入路径 ≠ 发现路径）**：`6e38c3b5`（v0.5.6）把 `installBuiltinPresets()`
  的参数语义从「dsh 包目录」改成「DSH home」，安装器 / `sync-companion-plugins` /
  相应测试都跟了，唯独 sidecar boot 的 `presets` 步调用点没跟（仍传
  `installedDshPackageDir()`）——8 个内置预设被写进
  `<payload>/node_modules/@deepseek-ai/dsh/.agent-presets`，而内核只扫「出厂集 +
  `config.roots` + `<DSH_HOME>/.agent-presets`」三类根，模式列表因此只剩
  `standard`/`ptc`/`minimal`/`cordis`。写入本身成功（payload 可写）且日志报
  `boot 步骤 presets OK`，故障静默（0.6.2 安装副本实测：旧落点 56 个文件躺着，
  `~/.dsh/.agent-presets` 不存在）。
- **修复**：`dsh-tauri/sidecar/cli.js` 的 `presets` 步 local / WSL 两分支均改传
  effective DSH home（WSL 为 UNC home）；新增 boot `repair` 步的「只补缺、绝不动
  已有」幂等自愈 `scripts/lib/preset-heal.js`（原子写 + 备份 + mtime 对齐源 +
  全容忍不阻断，风格对齐 `pi-ai-settings-heal.js`），覆盖已经写歪的存量安装——
  升级后首次 boot 即在正确落点补齐，用户自定义预设与定制内容不受影响；旧落点
  残留由 `detectLegacyPresetCopy()` 记诊断行（不自动删）。
- **同源隐患收口**：预设槽/文件枚举收敛为 `scripts/lib/preset-files.js` 单一实现
  （递归到底 + 正斜杠相对路径），自愈与安装器共用；此前两份枚举各自只拷顶层，
  预设携带嵌套资源（如内核出厂 `cordis` 的 `skills/`）时会静默丢文件且不报错。
  `stage-payload.sh` 对整个 `assets/` 递归镜像（非白名单），打包面无此缺口；WSL 侧
  agent 经 `npm install` 安装（内核包 `files` 含 `presets` 整目录），预设由壳层写穿
  UNC home，与打包资源清单无关——本环无「缺目录」问题。
- **测试 / 门**：新增 `scripts/test/unit-preset-heal.test.js`（21 用例：缺失补写 /
  存在不覆盖 / 嵌套目录 / 源不可用与目标不可写容忍 / heal×installer 落地集合与
  时戳对账 / composition 相对引用命中）；`sidecar/cli.test.js` 加 boot 落点红线
  （预设必落 `<DSH_HOME>/.agent-presets`，并对 payload 包目录做反向断言）；
  `ta9-boot-disk-faults.test.js` 的 `install-minimal-win-preset` 桩与新契约对齐；
  `scripts/check-syntax.js` 入口清单纳入 `preset-files.js` / `preset-heal.js`；
  `docs/agent-presets.md` 补「分发链路（源 → 打包 → 落点 → UI）」与本案例留档。

### fix(boot)：profile 孤儿依赖致内核启动期退出，回滚也救不回（issue #177）

- **现象（v0.6.0 GA 生产事故）**：恢复页红字「回滚后仍失败：内核启动期退出
  code=Some(1)」+ `ERR_MODULE_NOT_FOUND: Cannot find package
  '@deepseek-ai/cordis-plugin-timer' imported from C:\Users\GC\.dsh\profiles\web\`，
  累计异常退出 3 次——回滚 / 重置都无效，因为脏数据在**用户 profile 的
  `package.json`** 里，不在程序侧。
- **根因（#156 / #170 欠账的爆点）**：v0.5.3 时代的写入器把内置件 / 宿主内核家族件
  按 npm 精确版本形状写进 profile `dependencies`（hub 识别登记 `6070d5ab`、dshmarket
  时代 `corePackageNames()` 把 cordis 家族含 `timer` 当「宿主核心件」传播、
  `profile-bundle-heal.recoverManifestBundles` 按包内版本补写）。这些包后来从内核
  移除 / 改名 / 退役（`@deepseek-ai/cordis-plugin-timer` 不在 vendor 的 242 个内核
  tarball 闭包里，离线分发也装不到），profile 留下**孤儿条目**；内核 boot 按 manifest
  声明装配即解析失败退出。而既有清理链 `hub-registry.cleanLegacyProfileDependencies`
  只按「当前配套件名单」对账，`if (!plugin) continue;` 恰恰把「名字已不在名单里」的
  孤儿永久跳过——#170 回复里承诺「另开跟进」的就是这一环。
- **修复（boot repair 步新增 `scripts/lib/profile-orphan-dep-heal.js`）**：先于内核
  拉起与 compat-pin 相关步骤，遍历 `profiles/` 下每个 profile，按**本地确定性证据**
  （全为只读，boot 期绝不联网）判定孤儿并移除：① 只碰 `@deepseek-ai/` scope；
  ② spec 不是 `link:` / `file:` / `workspace:` / `npm:` / git 等协议形态；③ 不在内核
  vendor 闭包（`kernel-pin.packageVersion` + `vendor/dsh-kernel/deepseek-ai-<name>-<ver>.tgz`
  名单还原）；④ 不是内置配套件（`COMPANION_PLUGINS`）、不在同 manifest 的
  `dsh.profile.bundles` 里、profile 自有 `node_modules` 与 `.dsh-module-fallback`
  都无实体，且安装闭包派生的共享 farm（`<home>/profiles/node_modules`）也提供不了它
  ——后者保护「不在 vendor tarball 名单里但随客户端 npm 闭包分发」的合法声明（
  `@deepseek-ai/schemastery` / `@deepseek-ai/cordis-plugin-*`），farm 有货而 profile 内
  是无 package.json 的坏 shadow 时仍按孤儿处理（它就是 NOT_FOUND 的根源）。
  任一证据读不到（pin / vendor 目录不可用或名单为空）即**整体放弃**，
  宁漏勿误；健康 profile 零写入 no-op；清理动作 = 备份原文件
  （`package.json.heal-orphan-<ts>`）+ 原子写 + 日志归因（已知退役件单独标注）。
- **与既有链协调**：`cleanLegacyProfileDependencies` 的 `if (!plugin) continue;` 保留
  （用户自装与孤儿在此无法区分），但模块头与其行注释收口「issue #177 分工」——两条链
  各自幂等、判定面不重叠；已核实不会与 `recoverManifestBundles` / dsh-hub /
  super-injector 的写入路径来回拉扯（它们只补「盘上有实体且校验通过」或 `link:` 源的
  条目，正是本步的保留判据）。
- **测试 / 门**：新增 `scripts/test/unit-profile-orphan-dep-heal.test.js`（16 用例：
  孤儿剪除 + 备份 / 闭包内不动 / 非内核 scope 不动 / 解析失败容忍 / 无孤儿零写入零日志 /
  多 profile 且单个坏 manifest 不牵连 / 协议 spec 与 bundles 仍登记与 profile 内实装
  三保护面 / 剪空移除 `dependencies` 键 / 证据不可用整体放弃 / tarball 名还原包名（含
  `-vlln` 形态与陈旧版本剔除）/ 幂等二次 no-op 不重复备份 / dryRun 零落盘 / 未初始化
  profile 不凭空建文件 / farm 可解析的 npm 闭包件不误剪 / 坏 shadow 仍剪）；
  `unit-plugin-integration.test.js` 加 boot 接线红线
  （`healBeforeServer()` 走真实闭包证据把孤儿剪掉且保留合法声明）；
  `scripts/check-syntax.js` 入口清单纳入新模块。

### 插件市场整体替换：dshmarket → dsh-community-market（F5）

- **内置市场切换为上游 DSH Desktop 同款社区市场**：`assets/plugins/dsh-community-market`（源码构建自 [anywhere-labs/deepseek-harness-desktop](https://github.com/anywhere-labs/deepseek-harness-desktop) 的 `dsh-community-market`，MIT）——开放目录源架构（内置 DSH 1024Store / dshfind 两个合作目录适配器 + 标准 HTTP 目录源，用户自行添加与启用）、契约 schema 校验的目录快照、npm registry 精确版本 + 完整性校验安装（禁装产品包/生命周期脚本防护、失败自动回滚）、安装回执与启停管理。宿主半边挂 `/api/community-market/*` 十条路由；客户端半边（`window.__ModuleLoader__` CJS bundle）注册设置页市场 tab + 侧栏入口 + 全屏 overlay。
- **新增配套桥接插件 `dsh-market-desktop-bridge`（本仓库内置）**：上游市场在其 DSH Plugin Desktop 壳层环境赖以工作的四个 cordis 服务（`desktopProfiles` / `desktopPnpm` / `desktopPlugins` / `desktopActions`）由桥提供——`desktopPnpm` 重新调起启动本 host 的 dsh CLI 跑 `dsh plugin add/remove`（`dshArgv` 锚点与 pnpm 兼容语义移植自原 dshmarket 的 dsh-cli）；`desktopPlugins` 的启停读写 web profile 的 `cordis.patch.yml`，文件格式与壳层 patch-surgery `togglePluginInPatch` 双向兼容（关闭 = insert 内层条目迁出为顶层 `disabled: true` 块；启用 = 移除禁用行，带 name 的块保留为激活登记）；`desktopActions.requestRestart` 在受监管环境下为 no-op，实际重启由市场客户端补丁转接壳层桥。
- **构建与适配（源码 → 产物）**：esbuild 直出宿主 ESM bundle（`@deepseek-ai/*` + ajv/semver/yaml 外部化，经 profile vendor 同步与运行时闭包解析）+ 客户端 CJS bundle（上游 tsdown banner/footer 同构包装）；契约 schema JSON 构建期内联（上游运行期相对读 `docs/schemas/` 在 bundle 布局下层级错位）；sharp 换惰性解析 shim（调用期先按常规解析、再锚定 dsh CLI 入口同级取运行时二进制，缺二进制时按单图降级、绝不在加载期崩插件）；客户端产物打 `[desktop-restart-fix]` 补丁（重启转接 `window.dshDesktop.restartService()` 壳层原地监管重启，等价原 patch-dshmarket-restart 方案，脚本化为 `scripts/patch-community-market-restart.js`，市场重构建后需重跑）。
- **dshmarket 退役**：删除 `assets/plugins/dshmarket/` 与 `scripts/patch-dshmarket-restart.js`；`COMPANION_PLUGINS` 换登记 `community-market` + `market-desktop-bridge`；同步链新增 `removeRetiredDshMarketDir`（profile node_modules 目录 + manifest bundles/dependencies 登记，内置装配特征门防误删用户自装同名包）与 `removeRetiredDshMarketPatchRows`（patch 层 `dsh-market` 行，锚定 `dropBlocksByIds`），三条同步面（壳层 boot / WSL·Linux CLI / 退役清理）共用同一实现；VENDOR_DEPS 增补市场纯 JS 运行时依赖（ajv / ajv-formats / semver / yaml / @deepseek-ai/schemastery / @deepseek-ai/dsh-settings）；dsh-hub 中枢页市场检测切到新包。hub-registry 登记面随 COMPANION_PLUGINS 自动适配。
- **测试**：新增 `unit-community-market.test.js`（产物加载 / settings 命名空间与十条路由注册 / state 骨架 / 同源守卫 / 客户端包装与注入清单对齐）与 `unit-market-desktop-bridge.test.js`（patch 手术解析与幂等往返 / CRLF 保真 / 与壳层 patch-surgery 双向兼容 / hub 元数据规则）；sync CLI E2E 5 用例全绿。

### Tauri 线同步（tauri/modular，2026-08-22 持续优化批次）
- 内核家族 @deepseek-ai/* 0.1.1-rc.1 → 0.1.1-rc.2（19 pin，纯重发布）；patch 家族扩至 36 项
- 新增 runtime 补丁：agent-preset-fallback / prompt-context-literal / session-orphans / fallback-heal-isolation / credentials-initial-retry / credentials-absent-guidance / device-auth-guidance（双形态锚点）
- 插件波次：dsh-subagent-lens（新）、better-sidebar chunk 自愈重试、dsh-balance 槽竞态修复、graph-memory 模板 defuse、synapse 滚动三层防御+锁修复、dsh-file-drop 📎 附件链、dsh-float-window mount-then-hide、dsh-plugin-manager 后端健康卡
- composition-integrity 探测 + compositionPreflight 自愈（credentials 偶发缺席根治）


### 重构：插件管理子系统（plugin-center，单一门面 + 统一数据流）

- **统一门面与分层**：新增 `scripts/plugin-core/`（errors / ids / text / fs-atomic /
  state-store / patch-surgery / manifest-store / inventory / lifecycle / updates /
  scan / quarantine / markers / capability / supervision + `createPluginCenter`
  组装根），main.js 的插件段只接线不持业务。公共接口与数据流规范见
  `docs/plugin-center-architecture.md`；`scripts/lib/patch-io.js`、
  `scripts/plugin-manager-patch.js`、`patch-row-heal.js`、`profile-patch-heal.js`
  收敛为兼容再导出（全仓唯一实现，消除历史三处漂移）。
- **插件错误自动隔离（新能力，四级）**：
  - L1 加载期隔离：`scripts/lib/loader-isolation.js` 对 vendored
    cordis-plugin-loader / dsh-app-boot 注入自动隔离——条目 apply / fiber 结算 /
    激活审计失败只跳过并打 `[loader-isolation]` 标记，其余插件照常组合；
    受保护核心（dsh-base / dsh-web-app）失败仍 fatal；
  - L2 运行时异常隔离：web-crash-shield 升级（武装标记 + 按肇事来源归因计数），
    installFailLoud 就绪后不再 exit(1)；
  - L3 自动隔离落盘：壳层观察标记 → quarantine（官方 disabled 覆盖行 + 状态存储
    `desktop-plugin-state.json` v2）→ 系统通知 + 守护重启；插件管理页可一键恢复
    （闭环、无死循环；启用/恢复清除本会话去重，会话内可重复触发）；
  - L4 挂死恢复：dsh web 存活探针（连续 3 次探活失败且非忙态 → 守护重启），
    补「进程存活但假死」盲区；同一 10 分钟窗口最多自动重启 2 次，耗尽后停止
    自动重启并提示排查（稳定落地后配额复位）。
- **安装/卸载自由面修复**：第三方 bundle 归入 community 组（可开关/可卸载）；
  卸载完整清理（bundles 登记 + dependencies 键 + 目录 + .pnpm store 无引用副本），
  决策落家级状态存储——patch 被自愈重置也不复活；第三方恢复返回
  `PLUGIN_RESTORE_NO_SOURCE`（不再假成功）；运行中目录操作 rename 语义。
- **更新链加固（fail-closed）**：npm integrity（sha512）/ GitHub digest 缺失一律
  拒绝；下载仅 https（重定向禁降级/环）；传输层字节上限（JSON 4MB 在传输层生效）；
  tar 归档条目预检（拒绝 `../`、绝对路径、ADS、保留设备名含 `CON .txt` 形态、
  symlink/hardlink/设备）与解压后链接复检；包名必须存在且与目标一致、版本严格
  高于当前安装版本（拒绝降级）；更新内容静态扫描门禁（高危需确认）；原子替换 +
  rename 回滚（与卸载共用 `profile-modules` 锁）。
- **IPC 与权限收紧**：插件管理 IPC 全量 frame-origin 精确校验（修复 list/set-enabled
  只查 sender 的不一致）；卸载/更新/备份恢复/重排等破坏性动作主进程二次确认（文案
  按 capability.CONFIRM_MESSAGES 单一数据源）；`setPermissionRequestHandler` 拒绝
  摄像头/麦克风/定位等媒体权限（白名单放行 fullscreen/pointerLock/notifications/
  clipboard 且请求 origin 与当前 webUrl 精确相等）。
- **对账/同步修复**：reconcile 隔离记录同 code+reason 去重、removedByPolicy 只报
  实际移除名、reset 仅表示「存在但损坏」、manifest 写失败仅告警、包名形状校验；
  companion 过期清理加白名单并覆盖非 scope 落点；loader id 字符集全仓统一（点号
  id 可写可愈）；removeBundledRowDuplicates 的 id 级去重接线；plugin-guard 扫描
  收口 scan.js。
- **测试**：新增 20 个测试文件、354 项单测（`unit-plugin-core-*` 14 个模块深测 +
  `unit-loader-isolation(-deep)` + `unit-web-crash-shield(-deep)` +
  `unit-compat-*` 回归钉死 + `unit-plugin-center` 组装根端到端），覆盖：状态存储写穿
  合并/回滚/readOnly、WriteGate TOCTOU/心跳/重入、卸载 I1 失败注入中止、更新链全
  拒绝路径 + 回滚、归档名 fuzz、扫描 5 模式、quarantine 闭环、标记跨 chunk 逐字节
  切割、capability 全矩阵、supervision 假时钟全窗口、隔离变换语法变体 + 子进程执行
  级行为、compat 修复逐项钉死；全量单测 1056 项全绿（2 项既有环境跳过）；
- **集成场景**（真实 Electron 隔离环境）：新增 `plugin-uninstall-restore-e2e`
  （卸载四层清理 → 完整重启不复活 → 恢复 → 完整重启重新装配）与
  `plugin-supervision-zombie-cap`（假活判定 → 守护重启 → 配额耗尽停止自动重启）；
  `plugin-auto-isolation` 扩展「会话内重新启用 → 热更新路径再次隔离」闭环断言。

### 修复
- **模型设置读取不到 opencode-go 的 DeepSeek V4 Flash Vision Exp（`deepseek-v4-flash-vision-exp`）**：设置页「模型」对该源「获取可用模型」与模型选择器都经 pi-ai 内置 catalog 作答（`dsh-llm-pi-ai` 的 discovery 对 catalog 命中源不访问端点），而 pi-ai 的 `opencode-go` catalog 落后于端点——线上 `https://opencode.ai/zen/go/v1/models` 实际返回该型号（唯一 vision/exp 变体，`opencode` zen/v1 源无此型号、`deepseek-official` 源本就内置），本地目录缺失 → 全链路看不到。修复（新增 `scripts/patch-pi-ai-opencode-go-models.js`，幂等、锚点失配自动跳过）：向 `@earendil-works/pi-ai/dist/providers/data/opencode-go.json` 的 openai-completions 分组克隆同族基型 `deepseek-v4-flash` 条目并追加 image 输入（容量/计费/compat/thinkingLevelMap 沿用基型，与 `dsh-llm-deepseek` 官方目录的登记方式一致；上游重新生成 catalog 收录后经「已存在即跳过」自然退役）；以 `pi-ai-opencode-go-models` 规格登记进 patch-registry（`nm-roots` 布局 + cli:true，桌面壳启动 / CLI 同步覆盖全部运行副本），并接入 patch-deps（postinstall dev node_modules）与 check-syntax 语法门。端点另有 glm-5.3 / qwen3.8-max / mimo-v2-omni 等目录缺失型号，因 /models 列表不含容量与计费、无法安全推导而有意不自动补齐（可在设置页手工录入）。新增 `unit-patch-pi-ai-opencode-go-models`（8 项：克隆形态/幂等/上游自然退役/锚点缺失与非法 JSON 字节级不损坏/目录缺失静默/dry-run/stats 计数），registry 计数断言同步 10→11。

## [0.4.1] — 2026-08-19

> 热修复版：插件市场装插件后「服务意外退出」崩溃事故根治（三层防线）+ 空 tool-call 存量会话打不开修复。

### 修复
- **空 tool-call 持久化导致存量会话打不开（SessionPersistenceCorruptionError）根治**：session writer 曾把 id/name 为空的 tool-call 写入持久化（assistant message 的 tool-call block、tool/call 事件的 callId/name 均为空串），随后生成 callId/toolCallId 为空的 tool/result；export 能导出该 JSONL，但 dsh-session restore 的 `assertMessageEventShape` 严格校验要求 tool/result 必须有非空 tool source，整个会话「历史加载失败」打不开（事故会话 seq 连续 0..515255、帧可解，仅此一条空链击穿）。双端修复（新增 `scripts/lib/tool-source-patch.js`，幂等、锚点失配自动跳过，接入 main.js 启动 / patch-deps / after-pack / sync-companion-plugins 四条布线，覆盖内置副本 / profile fallback / agent overlay / WSL）：
  - **读端容错（存量会话能打开）**：dsh-session 校验遇到空 callId/缺 kind 的 tool/result 时就地修复——优先采用 block.toolCallId 非空侧，否则合成 `recovered-seq-<seq>` 并拉齐两侧，告警落日志；修复写入失败（对象已冻结）保留原严格报错；两侧 callId 都非空且不一致仍是真损坏继续拒绝。
  - **写端防护（不再产生新坏数据）**：dsh-agent-loop `appendToolCall`/`appendToolResult` 遇空 block.id 时合成 `recovered-<turn>-<step>-call`（两函数同规则保证 tool/call 与 tool/result 一致）并告警，空 name 落 `invalid-tool-call`。
  - **测试**：新增 `unit-tool-source-compat`（7 项：双变换真实 vendored 文件锚点命中/幂等、空 callId 就地修复放行、缺失形态以非空侧为准、双非空不一致仍拒绝、正常事件不受影响）。
- **发布流水线修复（三平台五架构全绿）**：① Windows 两腿「Verify packaged app natives」失败——node-pty 1.2.0-beta.15 的 win32 预编译目录从 `pty.node` 改为 `conpty.node`/`conpty_console_list.node`，校验 glob 改为 `*.node` 通配；② Linux 腿 Publish 失败——electron-builder 把 AppImage 的 `${arch}` 渲染为 `x86_64`（非 `x64`），上传 glob 改为 `dist/*.AppImage`；③ ci workflow 余额渲染层验证——npm ci 不触发 electron 二进制下载，步骤内显式 `node node_modules/electron/install.js`；无 GPU runner 补强（harness `app.disableHardwareAcceleration()` + GPU 子进程消失容忍、驱动层禁 Windows 无头遮挡判定节流、integration-runner `--disable-gpu`）。
- **插件市场装插件后「DSH 服务意外退出」崩溃根治（三层防线）**：用户从插件市场安装插件后点「立即重启」，dshmarket 直连其服务端自重启端点 `scheduleRestart()`——SIGTERM 掉被壳层监管的 dsh web 进程，再由 detached 助手拉起替身。壳层把自杀当「服务意外退出」弹窗（即事故截图），且替身进程脱离监管：退出应用时杀不掉、日志不落 dsh-web.log、用户点弹窗「重新启动」会拉起第三个实例撞端口。dshmarket 原有桌面分支（`allowRestart: false`，注释写明 "The shell remains responsible for restart"）依赖壳层注册 `desktopProfiles` 服务，而壳层从未注册，永远落入普通 DSH 分支（自重启开启）。三层根治：
  - **L1 重启权收归壳层**：壳层 `childEnv` 注入 `DSH_DESKTOP_SUPERVISED=1` 监管标识；dshmarket 服务端见到标识默认禁用自重启端点（显式 `config.allowRestart` 仍优先）；dshmarket 客户端「立即重启」在壳层桥（`window.dshDesktop.restartService`，即 `chrome:restart-service` 监管重启）可用时优先走桥，boot-id 轮询重载逻辑原样复用——按钮可用、重启受监管、不弹窗、不产生游离进程（与 dsh-hub 同款桥接模式）；
  - **L2 壳层稳定性看管（任何环插件均受益）**：① 「最后良好」快照延迟落定——旧实现 dsh web 一达就绪横幅即 `markGood`，环插件「启动成功、几秒后拖死宿主」的形态会把含环插件的配置固化成回滚基线、回滚永久无效；现改为服务连续存活 30s 才 `confirmPendingGood` 落定并清零崩溃环计数；② 就绪后崩溃环自愈——进程达就绪后 30s 内意外退出不再直接弹窗，而是自动走守护重启（体检/修复/回滚到最后良好快照），上限 2 次，耗尽才降级弹窗；③ 「服务已停止」弹窗的「重新启动」按钮改走守护启动（旧为裸 `startAndShow`，环插件会导致「点一次崩一次」死循环）；④ `restartService`（插件市场/集成测试共用的原地重启）同样改走守护启动；⑤ 回滚 lift 修复：旧实现回滚后成功拉起时把 `listSnapshots()[0]`（= restore 前的 pre-restore 快照 = 坏状态）标为良好，现改为对回滚后的健康状态新拍快照待落定；⑥ 意外退出弹窗延迟 500ms 再读日志，给 stderr 尾部真实崩溃栈落盘窗口（exit 事件可能早于最后几个 stdio data 事件，立即读会丢现场）；
  - **L3 dsh web 进程崩溃屏蔽**：新增 `scripts/lib/web-crash-shield.js`（纯 Node 核心依赖，经 `--require` 注入 + `DSH_CRASH_SHIELD=1` 自装）：就绪横幅出现前保持 fail-fast（启动失败快速退出语义不变，既有启动自愈照常工作）；就绪后 uncaughtException/unhandledRejection 吞掉并打日志到 stderr（随管道落 dsh-web.log），环插件运行时错误不再击穿整个宿主；风暴断路——60s 窗口内错误超 20 次恢复抛出（进程退出 → 壳层崩溃环自愈接管回滚），避免僵尸态。`scripts/**/*` 已在四个打包配置的 files 清单，随包分发。
  - **测试**：新增 `unit-web-crash-shield`（8 项：启动期 fail-fast、就绪后吞错落日志、unhandledRejection 同语义、风暴断路与窗口清零、就绪横幅探测 arm、事件监听注册）与 `unit-plugin-guard`（5 项：成功不立即落定、confirm 后落定、崩溃环场景回滚目标为此前稳定快照而非环配置、setPendingGood(null) 安全、失败无快照落事故报告）。

## [0.4.0] — 2026-08-19

### 新增
- **Quest 模式界面（dsh-quest-ui，默认关闭）**：全新 Qoder Quest 风格视觉重设计——输入区与画布彻底融合（去白底、去圆角、下栏拉高）、底部一体化（去胶囊 CSS / 幽灵按钮 / 余额同层 / 聚焦顶线）、全开布局（去胶囊 / 卡占满下栏 / 部件贴缘压底）。设置页弹窗重设计，聚焦线加浓加粗 + 编辑钮隐藏 + 临时会话移右上角 + 面板降噪。左侧栏启动时强制展开。多轮迭代至 v0.5.4：synapse 会话地图适配双 UI 通用 + 输入区底部一体化
- **内置 dsh-synapse 会话地图插件（vendored，MIT）**：可视化会话关系图谱，快速跳转关联会话，随包分发并自动装配
- **内置 Agent 预设保护（更新不再覆盖用户改过的 `assets/agent-presets`）**：用户直接修改安装目录内置预设后，客户端更新（NSIS/portable 覆盖安装）会整体替换 `resources/app` 把改动冲掉。现更新安装前把「用户改过」的文件快照到 `userData/preset-guard/backup`（覆盖安装不触碰 userData），新版本首次启动自动恢复（官方改过同一文件时用户版优先）；基线按版本管理（`preset-guard/baseline.json` 记逐文件 sha256），官方改动与用户改动始终可区分，下一轮更新仍能正确检测。更新未实际发生时快照自动丢弃。新增 `scripts/lib/preset-guard.js` 纯函数模块 + 9 项单测
- **手机远程控制（DSH-Mobile v1.4.2）**：随包分发手机端 APK，「远程控制」按钮一键连接，支持外网穿透 + P0 同步修复 + 安全加固
- **macOS 无签名构建 Gatekeeper 指引与配置显式化**：未签名 / ad-hoc 签名构建首次启动若提示「已损坏，无法打开」，README 与 troubleshooting.md 提供修复指引（`sudo xattr -cr` → codesign 重签 → 右键打开 → 终端直启取证）；构建配置显式关闭 `gatekeeperAssess` 与 `hardenedRuntime`（无 Developer ID 的包无意义，消除误导性警告）

### 修复
- **自定义卸载器升级链路根治（2026-08 数据丢失事故修复）**：electron-builder 的 `uninstallOldVersion` 宏把注册表里旧的 `UninstallString` 指向的卸载器拷到临时目录执行 `old-uninstaller.exe /S /KEEP_APP_DATA --updated`，旧版自定义卸载器不识别这两个升级契约参数，静默模式下默认全删用户数据（sessions / settings / credentials 等全部丢失）。双层根治：① **卸载器侧**：识别 `/KEEP_APP_DATA`、`--updated`、`/updated`、`--upgrade` 等升级意图参数 → 等价 `/KeepAll` 保留全部用户数据；静默模式安全契约——无升级标记且无显式 `/FullWipe` 时拒绝删除用户数据直接退出；Roaming 目录（`%APPDATA%\DSH Desktop`，含 logs / settings.json / window-state）在保留应用设置或其他用户数据时不再删除；UAC 提权子进程在静默模式下 `WaitForExit` 等待完成，避免安装器与子进程并发删文件。② **安装器侧**（`installer.nsh` `customInit` 宏）：`.onInit` 阶段（早于 install section 的 `uninstallOldVersion`）抢先把旧安装目录里的 `Uninstall_DSH_Desktop.exe` 覆盖为本安装包自带的修复版——即使存量用户机器上仍是旧坏卸载器，升级安装时实际执行的也已是修复版。InstallLocation 缺失时回退解析 `UninstallString`（含引号剥离 + 文件名校验），覆盖路径万无一失。经实机演练验证：编译旧版坏卸载器 → 布置数据标记 → 静默覆盖安装新包 → 标记文件存活 / settings.yaml 完整 / Roaming 数据保留 / 卸载器被自动替换
- **余额显示链路整体加固（架构重构而非补丁）**：本轮费用计算、余额查询、编排推送全链路系统性修复 21 处缺陷（2 严重 / 3 高 / 8 中 / 8 低），全部按「整体架构改进」落地：
  - **本轮费用输入项恒为 0（严重，OpenAI 兼容端点）**：`sessionCost` 的 `uncachedInputTokens + cacheWriteTokens` 求和先于 `||0` 守卫求值，openai-compat 适配器产出 `inputTokens` 形态且不产出 `cacheWriteTokens`，两处契约不匹配 → `undefined+undefined=NaN→0`，所有 one-api/SiliconFlow/Ollama 端点本轮费用只剩 cacheRead+output 计费。根治：① 客户端新增 `normalizeUsage` 归一化（投影/透传两种形态统一四桶、每操作数独立守卫）；② `openai-compat.js` 的 `mapUsage` 对齐 harness DISJOINT 契约（`inputTokens = prompt − cacheRead − cacheWrite`，缓存写单列、兼容多种 provider 字段命名）并附带 `model` 字段。
  - **重定向无条件携带 Authorization 泄露 API Key（严重，安全）**：`fetchJson` 跟随 3xx 时把密钥原样转发到新 URL，跨主机或 https→http 降级时计费凭证被发往非预期主机。根治：首跳（用户显式配置的端点）始终携带密钥；重定向跳仅「同主机且全程 https」保留，其余剥离并经 `warning` 显式告警。
  - **refreshBalance 无并发去重（高）**：并发触发时慢失败覆盖快成功 / 旧数据覆盖新数据（last-writer-wins）。根治：新增 `balance-scheduler.js` 编排模块——in-flight 去重（并发共享一次请求）+ latest-sequence 守卫（只有最新请求结果写 cache/推送）。
  - **持久失败 30s 无限重试（高）**：密钥错误/断网时每 30s 两发 HTTP 永不停歇。根治：指数退避 30s→1m→2m→5m 封顶，成功清零，禁用状态不重试，退出前统一清理。
  - **默认模型价估实际会话费用，最大 3x 偏差（高）**：prices 取 settings 默认模型档套到会话全部 token。根治：主进程每次推送**全模型价目表 `priceTable`**（同一时刻求值），适配器 usage 携带 `model`，客户端按会话真实模型选档；会话模型不可知时明确标注「按默认模型 X 单价估算（会话实际模型未知）」，绝不假装精确。
  - **peak 与 prices 两次独立 `new Date()` + 切换点不检查（中）**：临界秒 chip 文案与计价档可能自相矛盾，且旧版期 `isPeakHour` 也返回 true。根治：编排层取单一 `now` 传入三个函数（签名支持 date 参数）；`isPeakHour` 在峰谷生效节点（2026-08-16 16:00 UTC）之前恒 false。
  - **pickUsageWindow 把 percent:null 转 0（中）**：`Number(null)=0` 使「未知用量」显示成「0%」。根治：`percent == null ? NaN : Number(...)`，非有限一律保持 null。
  - **超时为 socket 空闲超时、1MB 上限按字符计（中）**：slow-drip 服务器可长期保活绕过 15s；多字节内容实际可超 1MB。根治：跨重定向共享 deadline 的总超时 + socket 空闲双保险；按 `Buffer` 字节累计上限。
  - **readCredentialLine 逐行正则不区分 YAML 段（中）**：嵌套段同名键可能读到错误密钥。根治：只匹配列 0 顶层键，支持引号值/行尾注释/正则元字符键名。
  - **http 端点明文传输无提示（中）**：显式支持 http 代理但密钥明文过网。根治：结果携带 `warning`，主进程记日志，README 提示仅建议本地代理。
  - **格式化余额字符串静默清零（中）**：`Number("1,234.56")=NaN→0`。根治：`parseAmount` 剥离千分位/货币符号、负数钳 0、脏数据显式告警。
  - **sessionCost 无下限保护（中）**：负 token 产生负费用。根治：逐桶 `Math.max(0, …)`。
  - **OpenCode URL 硬编码无环境覆盖（中）**：代理场景必走公网。根治：`OPENCODE_USAGE_URL` 环境变量覆盖。
  - **低危项全部修复**：`money` 格式化边界（0→"0.00"、超大→本地化不出现 `1e+21`、非有限→"—"）；外链 `rel="noopener noreferrer"`；`goUsageText` 全空返回 null 不再渲染空白 chip；`readActiveModel` 逐行状态机锚定段（前缀相似段/深层嵌套同名键不误匹配）；refreshBalance 内 settings 双读合并为单读；IPC 双通道重复投递改为「处理器只触发不返回数据 + 客户端只消费事件 + 页面内已收推送不再重复触发」；数组子元素补稳定 key 消除 React dev 告警；价目表 `PRICING_MODELS` 统一维护。切换瞬间价格跳变（低）经评估为官方整点计费口径本身，保持整点切换并保证显示与计价档自洽（见 `docs/balance-architecture.md` §7）。
  - **测试体系**：新增/扩充 79 项 node:test 断言——`unit-balance`（21：峰谷临界点 ±1ms、顶层键锚定、段锚定、金额解析矩阵、端点覆盖、重定向端口归一）、`unit-balance-scheduler`（14：节流/去重/stop 守卫/退避重试/单一 now/设置单读/禁用短路）、`integration-balance`（16：真实回环 HTTP/HTTPS mock——重定向密钥剥离矩阵、slow-drip 总超时、字节体积上限、http 警告）、`edge-client`（19：vm 沙箱加载真实产物，token 归一化矩阵含 [BUG] 回归用例）、`unit-openai-compat`（9：适配器 DISJOINT 契约端到端 + 缓存字段规整）+ **真实环境验证 `verify-balance-renderer`**（16：仓库自带 Electron 在隐藏 BrowserWindow + 真实 React 18 + 真实 DOM 中加载 client.js 产物，全程零网络、userData 指向临时目录、绝不触碰真实 ~/.dsh）；存量 `verify-balance-dock` 17 项断言保持通过，合计 112 项全部通过。全量测试目录仅剩 2 项与本改动无关的既有环境前提失败（`unit-updater` 的 activeVersion 两项断言依赖「本机无 bundled agent」，在干净检出通过、带 node_modules 的开发检出受本机 dsh 版本影响）。
  - **文档与打包**：新增 `docs/balance-architecture.md`（数据流/载荷契约/token 契约/安全边界/编排语义/缺陷映射表）；README 余额段更新（3 分钟轮询、峰谷价目表、新环境变量、http 告警）；`balance-scheduler.js` 纳入四个 electron-builder 配置的 files 清单与 `check-syntax.js` 语法门。
- **余额显示链路加固——全量 review 修正**：
  - **`balancePrices.<model>` 覆盖现作用于价目表（修复功能回归）**：原实现把用户单价覆盖只并入 `prices`（默认模型档），而客户端按会话真实模型优先走 `priceTable`，导致「真实跑该模型的会话静默忽略覆盖」。现覆盖统一合并进 `priceTable`，`prices` 恒等于 `priceTable[默认模型]`，定价单一真源；`unit-balance-scheduler` 断言同步更新。
  - **`mapUsage` 缓存字段 Number 规整**：`cacheReadTokens`/`cacheWriteTokens` 原样透传，provider 返回字符串会破坏 DISJOINT 三桶不变量、垃圾串会产出 `inputTokens=NaN`。现经 `toFiniteTokenCount` 规整（仅接受非负有限数，其余忽略），并补「数字串/垃圾串」断言。
  - **OpenCode Go 告警可见性**：http 明文 / 重定向剥离密钥的 `warning` 原落在 `opencodeGo.warning` 但既不记日志也不展示，现 `apply` 补记日志，与余额侧一致。
  - **latest-sequence 守卫口径修正**：该守卫在当前 API 下恒真（in-flight 去重已杜绝并发多请求），属防御性兜底；补「stop() 期间在途请求不推送」单测覆盖其可达的 `!stopped` 分支，架构文档与测试头注释如实标注。
  - **低危收口**：纯浏览器兜底价 `FALLBACK_PRICES` 对齐默认模型 deepseek-v4-pro（原为 flash，低估 3x）；重定向同主机判定改为 hostname+port（默认端口归一化）；`disabled` 退化形态补齐契约字段；`queryBalance` 对非对象响应加守卫 + 去重 `parseAmount` 调用；fetchJson 重定向清理本跳 socket 空闲定时器；React 数组子元素 key 修正（消除残留 dev 告警）；`verify-balance-renderer` 防御性清除 `ELECTRON_RUN_AS_NODE` 并加 `--disable-gpu`（无 GPU 环境可复现）。
- **内置插件市场 zat-dsh-engine 默认移除（社区反馈：默认不要带旧引擎市场）**：`COMPANION_PLUGINS` 移除 `plugin-market`（`assets/plugins/zat-dsh-engine` 目录随包删除），内置市场统一为 dshmarket（设置页入口不变）。存量 profile 里已装配的旧市场副本由 `retireZatEngine` 一次性清理（profile node_modules 目录 + manifest bundles 登记），settings 标记 `zatEngineRetired` 保证只清一次——之后用户从 dshmarket 主动重装不受影响。
- **内置 Agent 预设保护（更新不再覆盖用户改过的 `assets/agent-presets`）**：用户直接修改安装目录内置预设后，客户端更新（NSIS/portable 覆盖安装）会整体替换 `resources/app` 把改动冲掉。现更新安装前把「用户改过」的文件快照到 `userData/preset-guard/backup`（覆盖安装不触碰 userData），新版本首次启动自动恢复（官方改过同一文件时用户版优先）；基线按版本管理（`preset-guard/baseline.json` 记逐文件 sha256），官方改动与用户改动始终可区分，下一轮更新仍能正确检测。更新未实际发生时快照自动丢弃。新增 `scripts/lib/preset-guard.js` 纯函数模块 + 9 项单测。
- **agent 更新回退失败后静默卡住**：overlay agent 启动失败弹窗的「回退到内置版本并重试」分支直接调用 `updater.rollback()` 且无异常保护——回退本身失败（overlay 目录被安全软件/句柄锁定）时异常成为 unhandledRejection，用户点击后应用无任何反应、静默卡在失败页。现回退包 try/catch，失败显式弹「回退失败」错误框（说明文件可能被占用）并给「重试回退 / 退出」两个出口。
- **profile bundle 装配链根治性重构（「declares no dsh.bundle」一类启动失败不再依赖锚点补丁）**：`dsh.profile.bundles` 中任何一条登记不满足 dsh 装配契约（包未安装 / 未声明 `dsh.bundle.patch` / 补丁层缺失或损坏 / 入口文件缺失），官方 `dsh-app-boot` 即 fail-loud 以退出码 1 启动失败。此前唯一防线是启动前对 dsh 构建产物做字符串锚点改写（跳过 + 诊断），锚点随 dsh 版本变化失配即静默失效——用户反馈的 `profile bundle "dsh-hub" declares no dsh.bundle`（纯客户端 bundle 被登记进 profile.bundles）正是该形状，且入口缺失形状（loader 激活期 `plugin tree failed to load`）在防护覆盖范围之外。本次重构把「启动前把 manifest 对账到可装配状态」收口为唯一实现 `scripts/lib/profile-reconcile.js`（main.js 与 `sync-companion-plugins.js` 共用），运行时防护保留为纵深防御：
  - **全量逐条校验**：每条 bundles 登记按与 dsh 装配契约一一对应的 11 种失败码校验（登记名非法 / 包未安装 / 未声明补丁层 / 补丁层越界·缺失·不可解析 / 入口越界·缺失·指向目录 / client 入口越界·缺失，补丁层用与 dsh 相同的 entry-list YAML 方言解析；client 入口校验与上游 `verifyBundleDir` 新增的 `exports["./client"]` 校验同语义、文案逐字一致，并在对账侧收口为结构化失败码）；无效且非核心的登记**从 manifest 移除**并写入隔离记录 `dsh-desktop.broken-bundles.json`（移除原因 + 时间，重装插件重新登记即恢复，恢复健康后记录自动清除）；核心 bundles（`@deepseek-ai/dsh-base` / `dsh-web-app`）校验失败绝不移除（核心缺失是安装损坏而非数据问题，保留并由启动防护兜底跳过 + 告警）；
  - **校验实现单一化**：`profile-bundle-heal.js` 提取 `inspectBundleDir` 为唯一结构化校验实现（`verifyBundleDir` 变为兼容包装，文案与契约不变），对账与同步侧防呆共用同一判定语义；
  - **家级补丁层启动前预检**（`healHomePatch`）：`$DSH_HOME/cordis.patch.yml` 损坏此前只由 profile-boot 锚点补丁兜底，现启动 dsh web 前用同一方言预检，损坏 → 备份 `.broken-<ts>` + 重置为最小合法文件；
  - **既有语义逐项保留**：损坏 manifest 备份重建（.broken-<ts>）、核心补齐（issue #16）、配套登记追加、源缺失/卸载标记移除、重置后用户 bundle 恢复（issue #48）与全部日志文案不变；健康 manifest 零写入（幂等），写入全部原子化；
  - **CLI 同步收口**：`sync-companion-plugins.js` 的 manifest 段改用同一对账实现（`initMissing=false` 保持「不凭空创建 manifest」历史契约；损坏 manifest 在核心可解析时同样备份重建，dry-run 输出计划）；
  - **测试**：新增 `unit-profile-reconcile` 25 项单测（含两个真实 `dsh-app-boot` 复现测试——无效登记在官方 `loadProfile` 下必崩、对账后正常装配）；集成场景 `heal-missing-bundle` / `heal-manifestless-bundle` / `heal-broken-bundle-patch` / `heal-broken-home-patch` 断言更新为「移除 + 隔离记录 + 正常启动」，新增 `heal-entry-missing-bundle`（防护覆盖不到的入口缺失形状）；`check-syntax.js` 纳入新模块。
- **全量 review 修正（装配对账判定与 dsh 官方契约逐字对齐）**：
  - **补丁层条目级校验**：dsh 官方 `parsePatchList` 要求补丁层「顶层数组且每项为映射」，原校验只查顶层数组——`- 42` / `- "x"` / `- [1,2]` / `- null` 等畸形文件会被判健康、dsh 装配时仍 fail-loud。`inspectBundleDir`、`healHomePatch` 与 `healProfilePatch` 现共用 `isPatchListValid`（与官方逐字同构）判定；
  - **包解析与官方同构**：`validateBundleEntry` / 核心可解析判定改用与 `resolveBundleDir` 相同的 `createRequire.resolve.paths` 探测（含 NODE_PATH 与全局 node_modules）——此前 `packageDirUpward` 探测不到 NODE_PATH/全局安装的包，会把官方实际能装配的健康登记误判 UNRESOLVABLE 而误删；
  - **配套登记与恢复登记复检**：`addNames` 追加与 issue #48 恢复的登记此前只经 `verifyBundleDir`（不查补丁层可解析性），YAML 损坏的配套/恢复 bundle 会留下一个「仅靠运行时防护兜底」的启动窗口；现追加前/恢复后统一过 `validateBundleEntry` 复检，失败 → 不登记/移除 + 隔离记录。
- **全量 review 第二轮修正（对账语义收口与记录生命周期）**：
  - **入口文件必须是普通文件**：`inspectBundleDir` 的入口校验由 `existsSync` 升级为 `statSync().isFile()`——入口路径指向目录时（`main: "./lib"` 等形状）存在性检查会放过，而 dsh Loader 用 ESM `import()` 激活入口必然 `ERR_UNSUPPORTED_DIR_IMPORT`（防护覆盖不到的崩溃形状），现判 `ENTRY_MISSING` 并在启动前移除登记；
  - **策略性移除不进隔离记录**：配套源缺失 / 插件管理「卸载」标记的登记由步骤 4/6 按「用户意图禁用」移除，不再被步骤 2 判 UNRESOLVABLE 写入隔离记录（卸载/源缺失是用户意图而非无效登记，避免记录误导；CLI 同步同步补上 `removedBundles` 与 `excludeFromRecover`，与 main.js 口径完全一致——此前 CLI 不会把已卸载配套从 manifest 移除，且重置恢复可能把用户已卸载的配套重新登记）；
  - **隔离记录同轮清除**：`addNames` 登记成功与重置恢复成功时，同名历史隔离记录当轮即清除（此前要等下一次启动的步骤 2）；
  - **记录写入去重**：同 code + reason 的既有隔离条目不重写（保留首次 `removedAt`，持续损坏状态不再每次启动重写记录文件）；`addNames` 校验失败不再对未改动的 manifest 做内容相同的重写；
  - **健康检查口径统一**：`logProfileBundleHealth` 改用与对账相同的 `resolveBundleDirLike` 双锚点解析，消除「对账判定可解析、健康检查误报缺失」的口径撕裂（诊断只读）；
  - **重复登记去重**：同一 bundle 名在 `dsh.profile.bundles` 中登记两次时，其补丁层条目会重复出现在组合 entry list 中，loader 装配期抛 `duplicate loader entry id`（fail-loud → 退出码 1），且启动防护覆盖不到（两层都能正常加载）——现对账保留首次出现、移除重复项（冗余而非无效登记，不进隔离记录），该形状此前从不清理；
  - **测试环境封闭**：`unit-sync-cli` 的 CLI 调用 PATH 收口到 System32——CLI 的 `findDshPackageDir` 会经 PATH 探测 `dsh` 命令，环境 PATH 上的真实 dsh（如 harness 安装）会被当作预设同步目标，把 `assets/agent-presets` 写进真实安装（内容相同、mtime 被改写）；测试必须封闭，绝不触碰真实环境。
- **防护层修复（issue #97/#98/#99/#100，另含 #75 补强）**：社区批量上报的「防护罩有洞」问题逐一修复——
  - **插件 GitHub Release 多资产选择（#97）**：原实现 `isWinAsset` 用子串匹配（`darwin` 含 `win` 会误判为 Windows 资产，选中 macOS 二进制）、无架构优先级（`win-ia32` 与 `win-x64` 乱序时选错）、无归档时可能选中 `.sha256` 校验和文本。现收口为纯函数 `selectReleaseAsset(assets)`：词边界平台判定（`win32-x64.tgz` ✓ / `darwin-x64.tgz` ✗）、架构优先级（x64/amd64 → arm64/aarch64 → ia32/x86 → arm → 无架构兜底，稳定排序）、任何阶段排除校验和/签名/说明等非二进制文件（含无扩展名 `SHA256SUMS`/`SHA512SUMS` 与 `.sha1`；全部被排除 → 明确拒绝更新并提示），10 项单测；
  - **语法门禁剥离器支持正则字面量（#98）**：`check-syntax.js` 的字符串/注释剥离器不识别 JS 正则字面量——含引号的正则（如 `/[&<>"']/g`）会把引号当字符串起始，与后方引号配对将中间真实代码整段涂白，门禁对「孤立 async」失明（实测 preload.js 77.2% 被涂白、19 个 function 被吞）。现新增 `scanRegexLiteral`（跳过转义与字符类、拒绝跨行伪正则、闭 `/` 后按 flags/除法链判定）整体涂白正则字面量；补除法链识别（`a / /re/g` 第一个 `/` 按除法跳过，`return /re/` 等关键字后接正则按白名单放行）、flags 白名单含 ES2022 `d`/ES2024 `v`；并给门禁加 preload.js 失明硬断言（保留率 <23% 或 function 被吞 >5 即 FAIL 且报错注明触发项，正常基线 ~29%/吞 1 字符串内文本），26 项单测（含 mid 注入回归，防 EOF 特判假绿）；
  - **防砖体检 manifest 读取失败假绿（#99）**：`desktop-validity.js` 的 `validatePlugins` 用 `catch {}` 静默吞掉 profile `package.json` 读取/解析失败——启动清单读不到时清单内缺陷全部降级为 warning，体检返回「未发现问题」（假绿）。现显式记录 `manifestError`、总结论判定失败（含 `dsh.profile.bundles` 字段存在但非数组的结构损坏变体；字段缺失仍视为合法空清单），设置页体检区红字提示「无法读取启动清单，体检结果不可信」，4 种情形回归测试（缺失/损坏 JSON/bundles 非数组/正常）；
  - **补丁条目 id 负向断言漏掉行内空白（#100）**：`togglePluginInPatch` 的条目定位负向断言 `(?![A-Za-z0-9_.-])` 对行内空格放行——非标 id `- id: foo bar` 会被 `toggle('foo')` 命中误加 disabled（insert 内层更会被整条误删）。负向断言加入空格/tab（只排除行内空白，不排除 `\n`——排除换行会让所有既有条目匹配不上退化为重复新建），3 项回归测试；
  - **行注释内引号吞代码（#75 补强）**：剥离器此前不处理 `//` 行注释，注释内的引号会被当字符串起始吞掉后续代码（漏报比误报更危险）。现行注释整体涂白到行尾（保留换行），8 场景探测全过。
- **主窗口位置记忆（重启后回到用户放置的位置）**：主窗口关闭时持久化屏幕坐标与尺寸，下次启动恢复到用户上次放置的位置（跨屏校验 + 钳制回可视区），不再每次居中
- **会话删除守卫改为实时查询运行状态**：删除非当前会话后补回输入框焦点（修复光标消失仍可输入的边界问题），修复删除后输入锁死与误弹失败提示
- **清单 id 对齐 loader id 修复双登记崩溃（#104）**：插件清单 id 与 cordis loader id 不一致导致 `duplicate loader entry id` 启动失败，现统一对齐；side-session 升级 v0.3.0
- **卸载器清理加固（P0-P8）**：自定义卸载器全面加固——进程关闭重试策略、目录删除重试、注册表清理完整性、快捷方式清理全覆盖；dist 脚本自动构建卸载器（`predist` 钩子）；卸载二次确认弹窗防误操作
- **侧边临时会话透传服务端 error 字段**：模式 1 默认配置报错时正确展示服务端返回的错误信息，而非只显示「HTTP 502」；`deepseek-official` 供应商解析修复
- **WSL 清理命令双重登录 shell 嵌套与失败清理超时**：WSL 后端清理命令不再嵌套多余的 `cmd /c`，失败清理流程超时兜底
- **会话持久化容错增强**：进程中断留下的 zstd frame 尾部半截 JSONL 容错处理——只允许最后一个 frame 进入 torn-tail 截断/重放流程，中段损坏继续拒绝，覆盖内置 / profile / agent overlay 三份运行副本
- **自动更新 null 版本兜底 + keyed slot 注册错误隔离**：版本比较对 null/undefined 安全兜底；keyed slot 注册缺少 key/id 时容忍而非崩溃
- **打包白名单补齐 plugin-guard 依赖链**：`profile-module-heal.js`、`patch-row-heal.js`、`plugin-guard.js` 纳入四个 electron-builder 配置的 files 清单，防止启动期自愈链路因文件缺失而崩溃

### 优化
- **启动与运行性能系统性优化**：① 启动冒烟门禁与打包 `require` 完整性校验（`boot:ready` 时序标记 + `bench-baseline.json`）；② 补丁代际签名——签名命中跳过 18 个文件补充；③ koffi 预检异步化——boot 不等待，`startAndShow` 有界等待 3s 决定 overlay；④ SessionWatcher 句柄收敛——仅活跃会话 watch，冷会话复活才 scan；⑤ 会话根索引头部读取替代全目录扫描（TTL 失效增量重扫）；⑥ 非关键功能延后启动——会话监视器/余额轮询延至首屏稳定后 500ms；⑦ 长时内存观测——10 分钟采样后端/渲染 RSS 环形落盘；⑧ 崩溃转储清理增加数量上限（保留最近 5 个 + 最新豁免）；⑨ 无运行中会话时兜底扫描降为 0s；⑩ M3 设置页 observer 导航门控——离开设置页即断开；⑪ settings.yaml 写后校验与自动回写防损坏；⑫ NSIS 显式 lzma 压缩并关闭 solid 字典共享
- **agent 更新检查去 npm CLI 化**：纯 HTTPS dist-tags/版本探测，不再 spawn npm 子进程，启动更快
- **客户端更新检查双源并行 + 1h 窗口缓存 + 失败退避**：GitHub + Gitee 同时查询取最高版本，1 小时内不重复检查，失败后指数退避
- **余额轮询最小化暂停 + 凭证 mtime 缓存 + HTTPS_PROXY 支持**：窗口不可见时暂停轮询，凭证文件未变化时跳过重读，支持系统代理
- **自更新 SHA256SUMS 强制校验（fail-closed）**：下载完整性校验不通过即拒绝安装，不再静默放行
- **统一日志轮转（5MB 双代滚动）**：覆盖 desktop/web/watchdog 日志，不再无限增长
- **LLM 错误落盘与透出**：`llm-errors.jsonl`（5MB 环形缓冲），诊断模型小节可在设置页查看
- **replayState 降级补丁**：legacy 会话续聊失败回落 foreignAssistant 模式，不再直接报错
- **页面错误节流 + 图标 memo + 启动超时单常量**：减少渲染进程无效工作

## [0.3.10] — 2026-08-17
### 新增
- **插件中枢 dsh-hub v1.1.3 + 内置 graph-memory 与 dshmarket（知识图谱记忆 + 可视化插件市场）**：dsh-hub 对齐上游 ARFCON/dsh-hub-DSH v1.1.3（卸载 entry-id 顺序修复 1.1.2 内置时已同步，本次仅版本对齐 + 内置装配适配）；内置并随壳自动装配两个挂载目标——**graph-memory v1.6.0-beta.1**（adoresever/graph-memory 作者为 DSH 重新发布的原生适配版：跨会话知识图谱记忆，自动抽取三元组、PageRank/社区检测、向量去重与召回注入，SQLite 存储 `~/.dsh/graph-memory/graph-memory.db`；依赖 `@photostructure/sqlite` 原生模块随包分发全平台 prebuild，`dist/dsh.js` 入口 + `cordis.patch.yml` 完整声明）与 **dshmarket v1.11.1**（dsh-market/dsh-market 可视化插件市场：浏览/搜索/一键安装社区插件，`js-yaml` 依赖随包 vendored）。两者走配套插件通道（`COMPANION_PLUGINS` + 同步器）注册进 profile bundles；dsh-hub 中枢页适配内置装配——源码检测新增「随壳内置」分支、装配判定放宽（companion 同步是真实目录而非 link junction），设置页显示「内置 vX」与已装配状态，无需手动 clone plugin-src 源码
- **工作区锚点（workspace-anchor）**：新增 `@deepseek-ai/dsh-workspace-anchor` 配套插件，在每个 agent 的稳定 system prompt 中注入约 70 token 的 `{{cwd}}` 工作区偏好（默认在 cwd 内编辑/构建/交付、优先相对路径、允许读取/搜索任何位置但不得把搜索命中的外部目录当作新项目根、仅当用户显式指定或确有必要时才离开 cwd 并随后返回）。纯提示词偏好，不改变任何权限/沙箱行为。`minimal-win`、`anchored-standard`、`zero-anchored-standard`、`whoami-standard`、`warmupbetter`、`warmupbetter-replay` 六个 complete-persona 预设因会丢弃插件注入节，已在各自的 `agent.cordis.yml` persona 文本中直接写入同一锚点；`standard` / `code` / `router-standard` / `v4-flash-godmode-opencode-go` 等非 complete 预设由插件节覆盖
- **macOS 版客户端自动更新（多操作系统支持）**：此前客户端自更新仅 Windows（安装版/便携版），macOS 入口降级为手动下载。现 macOS 走独立链路——资产选择支持 `DSH-Desktop-<版本>-macos-<arch>.zip`（优先，免挂载自更新）/ `.dmg`（兜底，hdiutil 挂载）及 Gitee 分片（`.partN` 按序拼接）；更新脚本（bash，纯 ASCII，系统自带工具零依赖）等待旧进程退出 → `ditto` 解压 → 备份 `.bak` → 同卷 `mv` 原子替换 `/Applications/DSH Desktop.app`（`ditto` 复制兜底）→ `xattr -dr com.apple.quarantine` 解除隔离（未签名构建首次启动不被 Gatekeeper 拦截）→ `open` 重启；替换失败自动还原旧版并启动，应用绝不消失。平台判定支持 `DSH_DESKTOP_PLATFORM` 强制（仅资产选择等纯函数），新增 5 个 macOS 单测（zip/dmg 直选、arm64 架构、分片排序、模板 ASCII 结构、平台判定）
- **设置页「插件」页融合为单一「管理」标签（`dsh-plugin-manager`）**：启动时幂等隐藏官方只读「全部」清单（`applyPluginInventoryTabMergeFix` 过滤 `settings.plugins.tab` 中 id 为 `all` 的条目），管理标签成为唯一插件入口——**搜索框**（按名称/包名/描述过滤）+ **可点击分类标签**（配套插件可开关 / 其他插件可开关 / 核心组件只读，点击过滤、再点取消，各组显示启用/关闭计数）+ **双视图**（简洁：卡片网格——标题+状态圆点+迷你开关，窄屏自动单列；详情：+状态徽章+中文描述）+ 全量 live 清单与本地清单融合（描述取自各插件 package.json）+ **乐观 UI 开关**（点击立即翻转并标记「重启后生效」，写盘失败自动回滚；反复开关不堆积标记注释）。关闭/重新打开写入 web profile `cordis.patch.yml` 的用户层 `disabled` 条目（与 `llm-deepseek` 同款覆盖机制，同一 id 只保留一处，避免 loader 双登记崩溃），完全退出并重启 DSH Desktop 生效。解决「插件看不懂作用、默认启用无法关闭」的社区反馈
- **插件卸载/恢复**：详情视图每行「卸载」按钮（两步确认防误删）。内置配套插件 = 标记卸载（patch 写入 `removed: true`，启动同步器据此跳过文件复制与 manifest 装配，列表「已卸载（可恢复）」分组一键恢复）；第三方插件 = 标记 + 删除 profile 安装目录（不可恢复）；核心组件与带 config 的系统条目（`web`）禁止卸载
- **插件更新检查与手动更新（双下载源）**：工具栏「检查更新」→ 有独立发布源的插件显示「可更新 vX → vY」与「更新」按钮，点击后 下载 → sha512 校验（npm 源）→ 备份旧版 → 解压替换 → 重启生效，失败自动回滚。下载源：npm 官方 `registry.npmjs.org` + 镜像 `registry.npmmirror.com`（自动切换）、GitHub Releases 官方直链 + 加速镜像（`gh-proxy` 系列）；暂列 `dsh-better-sidebar`、`billion-context-dsh`（npm）与 `dsh-side-session`（GitHub）三个有公开发布源的插件，其余第一方插件随应用整体更新（应用更新本身已是 GitHub + Gitee 双源）。启动同步器新增「profile 版本高于安装包版本则保留」，更新后的插件不会被下次启动覆盖回安装包版本
- **插件管理界面打磨**：「可更新」分类标签仅在有可更新项时出现（全部更新完后自动回到「全部」）；工具栏按钮组重排（简洁/详情切换高亮、检查更新为主操作样式、刷新按钮统一）；操作结果提示条、分组标题（组名+说明+计数）与空态框统一样式；修复「已卸载（可恢复）」分类切换导致页面空白的问题（分组标题映射补全 `removed` 键，并对缺失映射做兜底防崩溃）
- **余额栏峰谷计价提醒（dsh-balance）**：对话底部统计栏左侧新增峰谷状态可见提示——高峰时段显示橙色「⛰ 高峰价」，空闲时段显示绿色「🌙 空闲价」，hover 完整说明（高峰价 = 北京时间 9:00-12:00 / 14:00-18:00 全价；空闲价 = 高峰价的一半）。主进程推送的 `peak` 字段按当前时刻实时判定（`isPeakHour`），本轮费用随时段自动切换单价（高峰全价 / 空闲半价），无需用户手动换算
- **识图插件多模态体感：直接发图/发文件、后台自动识别、识别结果不进对话（dsh-vision）**：输入框工具行新增「📎 添加图片或文件」按钮（外观与官方「/」命令按钮完全一致，也可粘贴/拖放图片），图片按官方附件链路进入草稿并随消息发送；**文本类文件（60+ 扩展名：md/json/csv/ts/日志/配置/脚本…含 Dockerfile/LICENSE 等无扩展名约定名）选入即读取内容、截断后追加进草稿**，发送前可见可编辑，二进制/超限文件明确提示。宿主半边在 `llm/stream` 边界拦截请求中的图片块（比 `agent/pre-step` 更靠后：只改写**送进模型的消息副本**，会话里持久化的仍是原始图片消息），调 VLM 识别后替换为「[图片] 识别结果」文本（多图自动编号 1/N；用户消息文本自动作为识别问题；识别失败/超限/附件异常一律降级为说明文本，绝不阻断对话）——**用户界面始终显示图片卡片，识别文本永不回流对话**，纯文本模型全程只见文本，发图体验与多模态模型一致。识别结果按附件 id 缓存（同图跨轮不重复请求）；`view_image` 工具与自动识别共用同一模型/备用链/超时/降档配置

### 修复
- **内置插件市场 dshmarket 客户端 bundle 未同步 → dsh web 启动失败（MissingClientBundleError）**：配套插件同步的目录清单此前只有 lib/assets/src/dist/node_modules，dshmarket 的客户端构建产物在 `client/`、运行时数据在 `data/`（`exports["../client"]` 声明入口），落盘缺失让 client-modules 装配 fail-loud 直接启动失败。现目录清单补 `client` 与 `data`；`verifyBundleDir` 增加 client 入口校验（声明了 client 入口的 bundle 必须落盘对应文件，缺失按「源缺失」处理不登记），下次启动自动补齐。新增 3 个单测（client 入口存在/缺失/未声明）。

- **dsh web 启动失败（exit 1）：healProfilesModuleFallback 未捕获 ENOENT 崩溃根治**：官方 profile-boot 装配每次 boot 无条件调用 healProfilesModuleFallback(INSTALL_ANCHOR)（BFS 依赖闭包逐包 readFileSync package.json），客户机器上（便携版解压不完整 / 杀软锁定 / 云同步抽风）会 ENOENT 且无保护——main.js 的 repairProfileFallback 只护壳自己的那次调用，挡不住引擎 boot 内部这次 → 启动失败页。profile-boot 防护补丁新增独立 heal 调用防护：调用包 try/catch，失败仅 stderr 告警「continuing boot without fallback healing」，绝不 brick 启动；幂等标记独立于补丁层自愈标记，已打过旧补丁的安装也会补上。新增 3 个单测，unit-profile-bundle-heal 16/16。
- **图片字节信任补丁（修复「仅支持 PNG、JPG、WebP、GIF」却发不出 png）**：官方 attachment-local 严格比对「浏览器声明的 MIME」与「字节解码出的格式」，声明跟随文件扩展名不可信（webp/jpeg 改名 .png 后 file.type 仍是 image/png，字节却是 webp），不一致直接拒发整条消息。本补丁把声明为 image/* 时的媒体类型改为以字节实际格式为准记录，不再拒绝发送；幂等，覆盖内置/profile fallback/agent overlay 三份运行副本，WSL --with-patches 同步生效。新增 2 个变换单测（真实 vendored 文件幂等 + 锚点缺失跳过）。

- **桌面宠物小窗拖动触发主进程半崩溃（启动崩溃日志 `Error processing argument at index 1, conversion failure from`）**：小窗拖拽过程中 pointermove 在捕获/窗口边缘会给出 NaN 屏幕坐标，渲染端直接相加后经 IPC（structured clone 保留 NaN）送达主进程，旧版主进程仅校验入参 `x/y` 为有限数，`getDisplayMatching` 异常/钳制计算产生 NaN 后直接 `petWindow.setPosition(NaN, NaN)`，触发 Electron native 参数转换 TypeError 把 uncaughtException 冒泡到主进程（IPC 处理中断 → 状态损坏 = 半崩溃）。双层根治：① 主进程 `pet:move-to` 全防线（显示器匹配 try/catch + workArea 逐字段有限数校验 + 钳制结果最终校验 + 整体 try/catch 记录警告，任何非法输入静默忽略，绝不再触发 native 参数转换）；② 渲染端 harness-pet 发送前 `Number.isFinite` 四重校验（screenX/screenY/grabOffsetX/grabOffsetY），NaN 直接跳过本次移动等下一个合法事件
- **识图插件升级后重启被回滚（dsh-vision 0.1.0 → 0.2.0）**：启动同步器按「profile 版本 > 安装包版本则保留」判断是否覆盖 profile 副本，此前 dsh-vision 三处（仓库/安装包/profile）版本同为 0.1.0，每次重启都会用安装包内置旧副本覆盖 profile 上的新部署，服务端修复（llm 服务实例 wrap）因此从不生效。版本升为 0.2.0 后 profile 更新版得以保留；仓库、安装副本、profile 三处已同步为同一新版本
- **识图插件发图修复升级：wrap 改挂 llm 服务实例方法（修复「重启后发图仍失败/图片丢失」）**：此前在适配器层 wrap，但 `llm/adapters-updated` 监听缺 `{global:true}`（cordis 事件只沿作用域祖先链冒泡，插件作用域不在 llm 服务祖先链上）+ 初始调用早于 DeepSeek 适配器注册 → wrap 实际从未生效，发图仍被 prompt 入口拦截。现改为 wrap **llm 服务实例的 `resolveModelInfo` 方法**（host prompt 图片门槛的唯一调用点；llm 服务已在 `inject` 中装配，apply 时必然可 wrap，不依赖适配器注册时序；绑定原方法保留 `this`；幂等标记 + 插件卸载时恢复原方法）。同时消除双重污染：adapter wrap 的 `resolveModel` 改为**只记录原生能力、原样返回**（加 `image` 的唯一入口是服务实例 wrap，两处都加会互相污染原生能力判断，误把文本模型当原生多模态透传原图）；`listModels` 仍加 image（仅 UI 一致性）；`llm/adapters-updated` 监听补 `{global:true}` 覆盖热装配。wrap 生效后 host 侧「图片自动转述」兜底自动跳过（inputModalities 已含 image）——界面显示原图卡片、识别文本只进模型。单测更新：服务实例 wrap 7 项（text-only 放行+原生缓存 / 原生多模态透传 / 未声明原样 / `this` 绑定 / 幂等 / restore 恢复 own+原型两种形态 / 无方法安全返回）+ wrapAdapter 语义更新，dsh-vision 单测 40/40
- **客户端自动更新「下载完成后不弹安装 / 更新脚本终端闪一下」**：① 更新脚本启动全程无窗口（`spawn` detached + `stdio: ignore` + `windowsHide`，覆盖安装版 cmd→powershell 与便携版 cmd）；② 残留安装包清理——已处理（安装成功 / 当前版本已不低于待安装版本 / 文件丢失）的待安装标记现在会**连带删除 updates 目录里的过时安装包与 .part 分片**（每包 120+MB），不再让「下载了却从不安装」的旧包永久占用磁盘、误导用户；③ 手动「检查客户端更新」时**优先处理已下载的待安装包**（弹「立即重启」按钮），不再被 24h 静默期挡住——用户主动检查即表明更新意图；④ 端到端脚本级验证：`buildNsisCmd` + `buildNsisPs1` 生成的更新脚本在真实 `cmd /c` 下秒级走完「启动→等待退出→拉起安装器（失败 catch）→兜底恢复」全部分支并逐行写日志，无静默退出（历史「点安装没反应」根因是无控制台进程下控制台程序输出丢失，PR #46 起已用 PowerShell/.NET 流规避）
- **客户端更新 Gitee v0.3.9 旧命名分片无法选择**：`selectAsset` 的分片兜底此前只按 v0.3.9+ 新命名（`win-portable` / `win-setup`）拼 base，而 Gitee 已发布的 v0.3.9 分片仍为旧命名（`DSH-Desktop-<版本>-portable-<arch>.exe.partN` / `DSH-Desktop-Setup-<版本>-<arch>.exe.partN`），导致 GitHub 不可用回退到 Gitee 时，检查成功但下载报「未找到匹配的安装包资产」。现按 新命名 → 旧命名 顺序尝试，安装版与便携版均能正确排序并拼接 Gitee v0.3.9 分片；新增两个旧命名分片单测，并用真实 Gitee release 验证安装版/便携版均选中 3 分片。
- **工具调用兼容修复（code 模式）**：`PTC 模式`（code preset）下 DeepSeek 模型常直接调用 `read`/`grep`/`todo_write` 等原生工具而收到 `UNKNOWN_TOOL`，且 `run_code` 生成的程序调用 `pwsh`/`bash` 时频繁省略仅用于 UI 展示的 `description` 而收到 `INVALID_ARGS`。现启动时幂等补丁：① 官方 `code` preset 的 tool-presentation 由 `code` 改为 `both`——`run_code` 仍可用，原生工具调用也可直接通过；② `dsh-tool-pwsh` / `dsh-tool-bash` 的 `description` 改为可选，缺失时用 command 首行自动生成。补丁覆盖内置副本 / profile fallback / agent overlay（WSL 同步脚本 `--with-patches` 同步生效），锚点失配自动跳过，不修改用户数据。新增 4 个变换单测与真实 vendored 文件幂等验证。

- **工具调用兼容修复 schema 部分撤销（修复「模型操作失败：unsupported JSON schema: parameters.description.required must be true when present」）**：上一轮把 dsh-tool-pwsh / dsh-tool-bash 的 description schema 改为 required: false，但引擎 schema 校验器拒绝非必填 description——preset 挂载直接失败，选模型/发消息报「模型操作失败」。现撤销 schema 改动（恢复 required: true），只保留运行时兜底（缺省 description 时用 command 首行自动生成，该部分不受 schema 校验约束）；transform 会自动回滚已写入的 required: false（幂等标记识别），并导出 OLD/NEW 常量供单测做「还原后断言」；新增回滚单测，unit-patch-engine 22/22。

- **识图插件发图降级「附件存储服务不可用」（dsh-vision 0.2.1）**：cordis 上下文的服务属性访问有 inject 检查（Proxy trap：cannot get property `attachments` without inject），此前 dsh-vision 未声明该 inject，用 try/catch 可选访问把错误吞成 undefined——每次发图都降级为「附件存储服务不可用（已跳过该图片）」文本进模型，图片识别从不生效。现 inject 显式声明 attachments（宿主 prompt 入口的 saveImage 依赖同一服务，装配时必然可用），apply 直接访问 ctx.attachments；发图识别恢复正常。版本升 0.2.1（仓库/安装副本/web profile 三处同步），重启 DSH Desktop 生效。
- **侧边临时会话大日志解析风暴 → 聊天响应偶发延迟**（dsh-side-session v0.2.4）：面板展开时每 2s 轮询会对整个会话日志做全量 zstd 解压+逐行解析（实测 7MB 压缩 ≈ 20MB 文本 ≈ **600ms 同步阻塞**），会话进行中 mtime 持续变化导致反复全量解析，与聊天请求同进程排队。改为**增量解析**（只解自上次帧边界以来的新帧并累计，结果与全量解析逐字节等价；文件整体替换自动回退全量）+ 客户端**全量拉取 4s 节流**（切换会话立即拉取）。新增 6 个增量/全量等价性单测
- **侧边临时会话升级 v0.2.5（合入上游更新）**：左侧栏图标对齐、浮窗展开/收起动画档位（0/300/500/800/1200ms，默认 500）、输入框与发送按钮样式与主会话同款、移除「停止回答」按钮；服务端**热重载自愈**（`settings.registrations.delete(NS)` + 路由重注册，开发热重载后不再残留重复注册）。保留本地增量解析与 4s 拉取节流。版本号定为 0.2.5 与上游 0.2.4 区分
- **桌面宠物默认关闭（插件级）**：harness-pet 常驻 canvas 逐帧绘制在软渲染/流式输出下持续占用主进程，且旧版保存的开关值会覆盖客户端默认关闭。现启动同步时幂等写入 profile patch `- id: harness-pet\n  disabled: true`（一票否决任何已保存状态），需要时在 设置 → 插件 → 管理 一键开启
- **更新后桌面快捷方式消失**：安装版（NSIS）此前依赖安装器创建桌面快捷方式，壳层只在便携版下补建——安装版更新（向导取消勾选创建 / 旧版卸载清理 / 手动覆盖安装目录）后桌面快捷方式缺失且永远不会自愈。现壳层对**安装版与便携版一致**地「缺失即补建」规范名 `DSH Desktop.lnk`（去重逻辑先行，桌面上至多保留一个，不会复现旧版「每次启动生成多个快捷方式」），并修复快捷方式指向被移动/更新后的 exe。另给 `maintainShortcuts` 加 `DSH_DESKTOP_TEST=1` 显式守卫：集成测试（dev electron 以文件路径启动时 `app.isPackaged` 也为 true）不再把用户真实快捷方式改指向测试用 electron.exe
- **profile bundle 缺失 / 损坏导致 dsh web 启动失败（退出码 1）根治 + 重启丢插件数据恢复（issue #48）**：dsh 官方装配对 `dsh.profile.bundles` fail-loud——登记了未安装的插件抛 `cannot resolve profile bundle`、普通库或仅客户端 bundle 被登记抛 `declares no dsh.bundle`、bundle 的 `cordis.patch.yml` 损坏抛 `failed to parse overlay`、profile `package.json` 损坏直接抛 JSON 错误、家级 `cordis.patch.yml` 损坏抛 `failed to parse patches`——任一命中桌面端永久无法启动。四层修复：
  - **启动防护**（`applyProfileBundleGuard`，幂等运行时补丁，dsh 更新后自动重打）：改写 `@deepseek-ai/dsh-app-boot` 的 `loadProfile`——bundle 层逐个跳过并写带修复指引的 stderr 诊断；profile manifest 损坏则备份 `.broken-<ts>` 后按出厂模板重建；改写 dsh `profile-boot` 装配——家级补丁层与 profile 补丁层损坏时备份 + 重置为空列表（同时覆盖启动与 HMR 热重载路径）。用户数据只备份不删除，重装插件即恢复。
  - **写盘侧防呆**：配套插件同步在 bundle 落盘后校验「补丁层 + 入口文件」存在才登记进 manifest（`billion-context-dsh` 上游缺 `dist` 构建产物时不再登记，杜绝整棵插件树加载失败）；profile manifest 损坏时先备份原文再重建；manifest 写入全部原子化（消除写盘撕裂这一损坏来源）。
  - **用户插件数据恢复**（issue #48）：manifest 损坏被重置后，用户手动安装的第三方 bundle 仍实际落在 profile node_modules 里——启动自愈会扫描、校验并把它们合并回 manifest（`bundles` + `dependencies`），用户插件照常装配；普通依赖与损坏包不恢复登记。同时弹「配置自愈」系统通知（集成测试态抑制），不再静默。
  - **启动前健康检查**：`dsh web` 启动前把每个 bundles 条目的装配状态落到 `desktop.log`（缺失 / 未声明 / 补丁层缺失一目了然），`dsh-web.log` 保留完整 stderr 诊断。
  变换与恢复逻辑收口为纯模块 `profile-bundle-heal.js`（`node --test` 单测 13 项 + 7 个新集成场景：heal-missing-bundle / heal-manifestless-bundle / heal-broken-manifest / heal-broken-manifest-recovers / heal-broken-home-patch / heal-broken-bundle-patch / companion-bundle-invariant）。
- **宠物插件流式输出期间界面卡死（「半崩溃」）根治**：dsh 客户端运行时对会话快照按帧合并推送（`Notifier.markFrameDirty` 每帧至多一次，长回复/工具调用期间持续触发），harness-pet 每次快照都跑完整状态映射 + 6 处 DOM 写入 + 320×320 canvas 整幅重绘 + 强制 reflow（`offsetWidth/offsetHeight`），软渲染/低配机上渲染进程主线程饱和。三处修复：① 快照 listener 120ms 节流 + trailing 合并（流式期间每 ~120ms 处理一次最新快照，60Hz 输入实测降到 ~8Hz，不丢尾）；② `setStatus` 内容相等早退（状态/标题/回复都没变时跳过全部 DOM 写与重绘，静态期零开销）；③ `updateStatus` 的同步 `render()` 改为仅在动画循环未运行（关闭/减少动态效果）时绘制，消除 rAF 动画与快照重绘的双绘制源
- **运行时补丁引擎与配套插件同步统一收口（PR #51）**：12 个运行时补丁（闪跳修复 / 设置暴露 / 识图密钥 / profile bundle 防护 / workspace 搜索栏 / 插件页标签合并 / web-search baseURL / menu 视口 / 会话管理）与配套插件同步（清理 / 复制 / bundle 登记 / patch 条目注册 / 默认禁用）收口为 `scripts/lib/` 单一实现（patch-io / patch-engine / companion-plugins / companion-profile / runtime-patches），main.js 与 `sync-companion-plugins.js` 共用同一数据源，杜绝两处实现逐步漂移；WSL·overlay 覆盖缺口补齐（识图 / web-search / menu / 会话删除 / 插件页标签在 WSL 更新分支同样应用）；`dshDesktop.appVersion` 回填与菜单 IPC 防未处理拒绝；补丁候选路径构造器新增单测逐项断言；同步收口时保留插件卸载标记（removedIds）与「profile 版本高于安装包则保留」的更新版本防覆盖。
- **壳层技术债清理（PR #55）**：版本比较收口为 `scripts/lib/versions.js` 全仓唯一实现（消除双实现语义漂移）；补丁引擎与原子写加固——并发临时名（pid+时间戳+序号）、`readFileCached` TOCTOU（读前读后 stat）、CRLF 锚点兼容、`transformExposeFix` 尾逗号不重复、卸载标记正则转义契约；WSL 托管后端探测异步化 + 输出解码修复 + 配置错误自动回落本地后端（issue #54，新增 `wsl-broken-fallback` 集成场景）；自更新链路（下载完整性校验 / 失败清理分片 / 整体截止时间 / 首刻挂 error 监听）、恢复链路（nextAction 注入 / attach 幂等 / 窗口销毁清定时器）与看门狗（spawn 失败不计额度 / run-state.json 原子写）缺陷根治；会话监视 / 档案自愈 / 余额模块收口（`scanZstdFrames` 三副本统一到 session-watcher、`bundleEntryOf` 只返回字符串、`readActiveModel` 锚定 agent-default-model 段）；移除 M3 主题过时部署链（4 个安装脚本 + 3 个资产 + 设计稿）与 preload 死 API；IPC 鉴权按 origin 精确比较、启动竞态与通知引用治理。新增 unit-wsl-backend(11) / unit-patch-io(5) / unit-balance(4) 单测。
- **插件中枢 dsh-hub（ARFCON/dsh-hub-DSH v1.1.2，内置）**：设置页新增「插件中枢」页签，整合四块能力——① **插件更新引擎**：已装插件版本对比（npm registry / GitHub release/tag）、一键更新与批量更新、sha512 校验 + 备份回滚、启动自检自动修复（损坏的 package.json / cordis.patch.yml 原子写恢复）；② **全局记忆**：5 个 `memory_*` 工具（save / search / list / get / delete），JSONL 存储 `~/.dsh/memory/memories.jsonl`；③ **graph-memory 挂载**：检测到 `plugin-src/graph-memory` 源码自动装配（profile bundles + link + junction，幂等），设置页展示记忆库统计（节点/边/社区）；④ **dsh-market 联动**与**自身更新检查**（raw.githubusercontent + jsDelivr + ghfast.top 多源）。原生适配 Gitee 版 DSH Desktop：客户端最新版本对比走 GitHub + Gitee 双源（与客户端同款「取最高版本」语义），国内用户可直接打开 Gitee 发布页下载。
- **内置 dsh-hub 插件两处修复**（对齐 ARFCON/dsh-hub-DSH 生态）：插件卸载时先解析 entry id 再删 insert 行（此前先删行后查 id 永远查不到），避免 disable 块残留孤儿条目；客户端安装目录候选增加常见自定义路径（`D:\app\dsh\DSH Desktop`），使「DSH Desktop 客户端」检查与客户端插件更新在自定义安装位置生效。
- **余额栏消失（ReferenceError: parts is not defined）**：dsh-balance 客户端在对话底部统计栏渲染余额/费用 dock 时引用了已不存在的 `parts` 变量（组件重写把列表变量改名为 `items`/`joined` 时漏改一处）——组件渲染即抛异常，整个余额 dock 静默消失。已改回 `joined.join(" · ")` 并同步到安装副本与 web profile，重启应用即恢复。
- **余额 dock 左侧显示「Object」**：修复上一处后 dock 恢复显示，但峰谷提示 chip（`peakChip`，React 元素）与文本一起经 `joined.join(" · ")` 拼接——数组 `join` 会把 React 元素 `toString` 成 `[object Object]`，于是 dock 最左侧出现一个「Object」。现 dock 的 `children` 直接传数组（React 原生渲染元素 + 字符串分隔符），高峰/空闲提示正常显示「⛰ 高峰价 / 🌙 空闲价」。
- **本轮费用估算：未知模型按低价档计费**：`effectivePrice` 对价格表外的模型名（如 `deepseek-v4-max`）此前回退到 `deepseek-v4-flash`（低价档），与「未知模型按高单价估算、避免少报费用」的注释意图相反——现回退到 `deepseek-v4-pro`（最高档）。同时核对计费口径与官方公告一致：输入未命中（含缓存写入）按未命中价、输入缓存命中按命中价、输出按输出价；高峰价 = 北京时间 9:00-12:00 / 14:00-18:00 全价（v4-flash 未命中 3.0 / 命中 0.10 / 输出 9.0，v4-pro 未命中 9.0 / 命中 0.30 / 输出 27.0，¥/百万 token），空闲 = 高峰一半，2026-08-17 00:00（北京时间）起生效。
- **点击系统通知回到应用前台**：所有系统通知（任务完成 / 崩溃自愈恢复 / 安全模式 / 配置自愈 / 渲染进程恢复）统一支持点击回到应用——`showNotification` 默认给通知挂 `onClick → showMainWindow()`（覆盖最小化、隐藏、关闭到托盘、窗口销毁后重建等全部恢复路径），调用方无需各自实现；任务完成通知的旧实现（仅 restore+show+focus，窗口销毁场景会失效）改为走统一默认。Windows toast 点击激活依赖的 `AppUserModelID`（`com.deepseek.dsh.desktop`）与开始菜单/桌面快捷方式同 id 创建已就绪，点击 toast 即恢复窗口到前台。
- **核心运行时健壮性加固（PR #56）**：① 更新流程守卫竞态根治——`runUpdateFlow` / `runClientUpdateFlow` 的 busy 标志改为入口同步置位 + 全程 try/finally 复位（此前在 checkLatest 网络请求与版本对话框之后才置位，自动更新定时器与手动触发可并发通过守卫，双 npm 安装互踩 staging 会损坏 agent）；② 预览路径围栏本地 DoS 根治——`isUnderFileRoots` 缓存 miss 强制失效改为冷却窗口（至多每 5s 一次强制刷新），浏览器恶意页面无法再通过无效预览请求放大为 sessions 全目录遍历 + 逐文件 zstd 解压的 CPU/IO 攻击；③ 服务启动写流泄漏——`watchServerProc` 的 dsh-web.log 写流 spawn error 路径不再泄漏 fd（幂等 `endOut` 在 error/exit 统一收口，stderr 写入包 try，不再冒泡 uncaughtException）；④ 服务就绪行处理提前退出——`onData` settle 后立即 return，同 chunk 第二行 URL 不再 killTree 刚就绪的服务；⑤ `killTree` 的 taskkill spawn 挂 error 监听并收敛到幂等 finish；⑥ 余额估算回退档位统一——`effectivePrice` 峰谷期与旧版固定价期均回退 `deepseek-v4-pro`，移除死代码 `FALLBACK_PRICES`，补齐旧版期未知模型断言。
- **客户端更新分片选择与合并校验加固（自动更新 review）**：① `selectAsset` 分片集增加**序号连续性校验**（必须从 `.part1` 连续到 `.partN`）——此前缺失中间分片（如只有 part1+part3）仍会照常选择并拼接，产出损坏安装包；单靠下载后 64MB 下限兜底存在漏网窗口（仅缺尾部小块时拼接结果仍超下限被放行，安装器失败后用户会看到「下载了却从不弹安装」）。现不连续的分片集直接拒绝，宁可用下一个命名候选或报错，也不拼坏包；② 分片合并后**大小与上游声明严格一致校验**（每片已按 content-length 完整性校验，不一致只可能是分片集不完整）——不一致即删除并抛错，下一轮自动更新会重试，不再把残缺包标记为「已下载待安装」。新增 2 个分片连续性单测。
- **设置页「插件」分区新增「诊断与管理」标签页**：原插件管理页内嵌的诊断/备份恢复面板整体迁入该标签，并新增三项维护能力——① **一键导出诊断日志包**：诊断报告 + 桌面/Web 日志尾部聚合 + 崩溃转储元信息 + 环境信息，打码 home/userData 路径后存为单个 JSON（本地操作不上传）；② **防砖体检**：逐个检查已装配插件的 dsh 清单、补丁入口可解析性与跨包 loader 条目 id 冲突（重复 id 会在下次启动触发 `duplicate loader entry id` 失败，提前标红）；③ **Bundle 顺序检测与重排**：读取声明规则（`dsh.bundle.order.before/after`）与插件依赖，LOOT 式拓扑排序给出建议顺序，一键写回 profile `package.json`（官方内置 bundle 保持原位、原子写），重启生效
- **诊断与管理安全加固**（专业测试流程产出）：恢复路径拒绝含 `node_modules` 段（junction/symlink 装配点）与符号链接逃逸（realpath 包含性校验，恶意备份无法经 junction 写穿到根外）；诊断日志包脱敏移至序列化前深度掩码（Windows 反斜杠转义导致的静默失效修复，掩码集含 userData/home/安装目录）；IPC 鉴权改 origin 相等比较（防 userinfo 技巧绕过前缀匹配）；恢复/顺序写回加主进程互斥；非 UTF-8 文本按 base64 原字节备份还原（GBK 等不再乱码损坏）；恢复输入 >4MB 拒绝；备份元数据不再记录本机绝对路径
- **启动自愈：bundle 契约缺失自动修复 + 防砖体系升级**（针对 `Error: dsh: profile bundle "X" declares no dsh.bundle in its package.json` 启动崩溃，loadProfile fail-loud）：① **启动自愈**——boot 失败时识别 `dsh-web.log` 的第四种 loader 失败形态（`profile bundle "X" declares no dsh.bundle`，`parseFailedLoaderIds` 扩展），经文件系统二次确认（须在 `dsh.profile.bundles` 清单内、包目录存在但缺 `dsh.bundle.patch` 声明，绝不触碰 `@deepseek-ai/*`）后备份 manifest 并移出启动栈，依赖包仍保留以兼容纯客户端插件，随后自动重试启动并弹窗通知；② **防砖体检升级**——启动清单内缺 `dsh.bundle.patch` 声明的包由 warning 升级为 error（真实 fail-loud 必挂，提前标红），新增「一键移除失效条目」按钮（两步确认，备份后原子写回 bundles，重启生效）；覆盖条目（`disabled`/config/定向 insert）不再误计为 loader 注册，消除「默认禁用条目 vs 包注册」的假跨包冲突；③ **启用前契约校验**——zat-dsh-engine 启用插件（setEnabled）前检查包是否声明 `dsh.bundle.patch`，缺声明或不可读直接拒绝并给出修复指引，杜绝「启用即踩雷」。**自愈主路径升级为不依赖日志的 manifest 直扫**（`scanBundleContracts`：直接遍历 `dsh.profile.bundles` 二次确认声明，日志轮转/截断/编码异常时仍能发现坏条目，日志形态保留为兜底）；**启用校验补 patch 文件存在检查**（声明存在但补丁文件缺失同样阻止启用）。
- **启动自愈链路修复与提示增强**：修复安全 overlay / 自愈重试必败的根因——`web` 子命令遇到 `--host` 等应用参数后会透传剩余参数，此前 `--patch` 拼在这些参数之后而未被启动器解析；现将 overlay 参数放在 `web` 之后、应用参数之前。自愈成功后追加模态提示框（系统通知之外的双保险），明确说明已移出启动栈/禁用哪些插件、配置已备份、无需操作。
- **诊断报告展示「最近启动自愈」记录**：每次自愈动作（自动移除/禁用坏插件）写入 `userData/self-heal-history.json`（保留最近 5 条），随诊断报告带回并在「诊断与管理」报告顶部以蓝色信息条持久展示（模态框/通知是一次性的，这里提供事后回看）；进入「诊断与管理」标签页自动运行一次诊断，报告立即可见；修复前端取值层级错误（自愈数据在 `report.sections.selfHeal`，此前误读 `report.selfHeal` 导致蓝条永不显示）

## [0.3.9] — 2026-08-16

### 新增
- **对话删除与归档管理（dsh-session-manager 内置插件）**：dsh 官方只有归档没有删除，现补齐：
  - 会话行 ⋯ 菜单「归档会话」下方新增「删除对话」（**所有会话行均显示**，含当前会话）：确认后经宿主 RPC 删除会话日志与附件（**正在运行**的会话被拒绝），列表经官方 host 帧实时移除；
  - 设置 →「归档对话管理」面板：列出全部已归档对话（标题/项目/更新时间），每条提供「恢复」（回到原工作区与顺序，经 `workspace.unarchiveSession` 持久化并实时广播）与「删除」；
  - 实现：`scripts/patch-session-manage.js` 对官方包做幂等运行时/打包补丁（`dsh-workspace` WorkspaceRegistry.unarchiveSession；`dsh-session` Sessions.remove——从 live 注册表摘除、优雅 flush 后释放并广播 session/disposed；`dsh-host-apiproxy` 新增 workspace.unarchiveSession / workspace.deleteSession RPC——删除先查 agent 运行状态表（agent/status 事件维护，仅拒绝真正运行中的会话），再按 jsonl 布局移除 `<DSH_HOME>/sessions/<project>/<id>/`、摘除 live 会话、清理归档集并广播；`dsh-client-connection` API 面与 unary 响应 schema；`dsh-client-ui-workspace` 菜单项与中英文案）；`assets/plugins/dsh-session-manager`（bundle，设置面板 + `window.__dshSessionManager` 桥），启动/打包三路覆盖（dev / afterPack / 运行时），dev node_modules 已实测应用
  - 端到端集成场景 `session-delete-flow`：真实 RPC 链路验证 创建→归档→恢复→再归档→删除（目录消失 + 归档集清理）→空闲 live 会话摘除删除
- **对话节点导航条（dsh-navbar，vlln/dsh-navbar，MIT）内置**：对话区右缘节点串快速跳转 user 消息（悬停预览 6 行截断 / 点击平滑跳转 + 品牌蓝高亮 / 连续悬停与滚轮切换 / >11 节点自动滑动窗口 / <2 条 user 消息自动隐藏 / 消息精选 pin 按会话持久化），实现 dsh-external/issues#144 规格，纯浏览器端 bundle（`assets/plugins/dsh-navbar`，含 LICENSE 与预编译 lib）。**取代** `dsh-conversation-tweaks` 内置的会话右侧导航滑轨（dct-rail 已移除），conversation-tweaks 保留「隐藏对话输出」；`sync-companion-plugins.js` 的插件清单与 `lib/index.mjs` 复制规则同步补齐（该清单此前与 main.js 漂移，缺 better-sidebar / harness-pet，已对齐）
- **侧边临时会话（dsh-side-session，hzhz314159/dsh-side-session，MIT）内置**：基于当前主会话上下文在独立浮窗发起临时追问（答案不写入主会话）；💬 图标 / `Ctrl+Shift+S` 唤起；三种回答引擎（全局 Key / 插件 Key / 宿主 LLM）；zstd 帧扫描自动捕获上下文（含截断护栏）；bundle 随桌面端分发并自动同步。**内置版本升级至 v0.2.3**：纯浮窗形态（头部拖拽移动 + 右下角缩放）、上下文长度三档（标准/加长/完整，设置面板「确定」应用）、meta 指纹轻量轮询（2s 心跳仅对比计数指纹，变化才拉全量）、`/side-session` 斜杠命令、mode3 走宿主 `ctx.llm.stream`（不读任何 key）
- **主动上下文压缩（billion-context-dsh，Tyan66666/billion-context-dsh，MIT）内置**：模型驱动的上下文压缩后端（ACP，内核 acp-kernel 复用）——由模型决定何时压缩、压缩什么，替代自动摘要式压缩；`compress`/`decompress`/`search_context`/`acp_status` 四工具 + `/acp` 命令，自动策略只 nudge 不强制。bundle 随桌面端分发（含 dist 与私有依赖 acp-kernel，同步逻辑补齐 `dist`/`node_modules` 目录），启动时自动同步进 web profile 并幂等写入 `compaction-basic` 禁用条目（同一 realm 仅保留一个压缩后端）
- **余额面板并行展示 OpenCode Go 订阅额度**：5 小时滚动 / 每周 / 每月用量百分比（percent=已用比例），查询失败不影响主余额展示

### 修复
- **客户端更新「能下载但无法更新」闭环修复**：① 点击「立即重启」后不再提前清掉 `pendingClientUpdate`，只写入含下载包路径的 `clientUpdateAttempt`；安装器失败/被取消时，下次启动会真正进入「客户端更新未完成」重试流程（旧实现把待安装标记清掉，重试对话框永远不出现，用户只能重新下载）；② NSIS 更新脚本只在安装成功且新版本已启动后删除安装包，失败/取消时保留安装包供重试，并以退出码 0 判定成功（取消不再被误判为成功）；③ 便携版替换脚本对 `NEW→OLD` 复制失败增加 12 次退避重试（吸收杀软扫描锁定），等待/替换失败时用写入探针区分「目录只读」与「文件仍被占用」：只读目录直接降级为启动新 exe，可写目录用 `.bak` 还原当前版本；④ `downloadFile` 监听 `aborted/error`，服务器中途断开时立即报错而非无限转圈。新增 `scripts/test/unit-client-updater.test.js`（纯函数单测，无需网络）
- **更新进度窗口阻塞整个应用**：`showUpdateWindow` 去掉 `modal/parent` 并改为 `minimizable: true`，下载期间主窗口可继续点击、最小化，进度窗自身也可最小化或关闭（关闭不取消后台更新/下载）；「更新完成/下载完成」对话框弹出前先关闭进度窗，避免窗口叠层导致确认框无法显示。`assets/updating.html` 文案同步说明后台继续
- **集成测试模式抑制对话框弹窗**：`showBox` 在 `DSH_DESKTOP_TEST=1` 时不再弹真实对话框（测试实例与正在使用的桌面端并存时，失败的测试会在用户屏幕上弹出「启动失败」窗），改为记录日志并按取消键处理（boot 失败 → 快速退出让场景明确失败）
- **存量坏 profile manifest 不自愈 → 启动必失败**（issue #16，PR #21）：旧版本（0.3.3/0.3.4）写坏的 `profiles/web/package.json` 中 `dsh.profile.bundles` 只有配套 bundle、缺少核心 bundles（`@deepseek-ai/dsh-base` / `@deepseek-ai/dsh-web-app`），核心服务无人提供，插件树永久 `N entries did not activate`。`syncCompanionPlugins` 现在对已存在的 manifest 做「校验 + 补齐」：把缺失且实测可解析的核心 bundles 补到列表最前，其余条目（含用户添加的）原样保留；健康 manifest 零写入（幂等）。核心逻辑抽为 `profile-manifest.js`（纯函数，含 `node --test` 单测 + 集成场景 `heal-stale-manifest`）
- **profile patch 同 id 重复注册 → 插件树崩溃**（issue #17，PR #24）：旧版本插件安装向 `cordis.patch.yml` 写入重复的 `- insert: - id: X` 块（或插件升级为 bundle 后 patch 残留行），cordis loader 抛 `duplicate loader entry id: X` 且永远无法自愈。新增 `profile-patch-heal.js`：启动时块级按 id 去重（保留首个、备份原文件）、把已升级为 bundle 的插件残留注册从 patch 层移除（`dropBlocksByIds`），并支持从 `dsh-web.log` 解析三种 loader 失败形态（hash / duplicate-id / 括号包名）映射回 patch 条目。含 `node --test` 单测 + 集成场景 `heal-dup-patch` / `heal-bundle-patch`
- **web-search「接口地址」填第三方地址仍被拼 `/messages` 按 Anthropic 协议请求 → 404**（issue #20，PR #22）：`dsh-web-search-deepseek` 的 baseURL 拼接归一化（尾斜杠不产生双斜杠；基址已含 `/messages` 不再重复拼接），HTTP 失败信息附上实际请求地址与协议契约指引（裸 404 变可自解的提示），设置页中英文文案明确「POST <基址>/messages」契约。补丁本体在 `scripts/patch-web-search-baseurl.js`（打包补丁与运行时补丁共用同一实现，覆盖内置副本 / profile fallback / agent overlay），含 `node --test` 单测（含本地 mock 服务的真实 HTTP 回归）与集成场景 `web-search-patch`
- **客户端自更新在中文 Windows 上解析失败**（`apply-update.ps1` 报 `Unexpected token '}'`，issue #23，PR #25）：更新脚本改为带 UTF-8 BOM 写出，Windows PowerShell 5.1 不再按系统 ANSI 代码页（GBK）误读中文注释导致换行符被吞、语法乱码；`buildNsisPs1()` 模板注释同步 ASCII 化，脚本在任何代码页与换行风格下均安全
- **桌面版默认启用硬件加速，修复软件渲染掉帧**（issue #26，PR #28）：移除无条件 `app.disableHardwareAcceleration()`（软件渲染导致 GPU 进程空转 ~40-60% 单核、设置页等整页重绘明显掉帧）。改为：默认硬件加速；仅当 `settings.json` 标记 `hardwareAcceleration:'off'` 时禁用；GPU 进程 60 秒内连续崩溃 3 次（`gpu-process-crashed` / `child-process-gone` 双事件去重）自动持久化降级标记并重启应用，保留崩溃日志与自恢复兜底。降级逻辑抽为 `scripts/gpu-crash-guard.js`（含 `node --test` 单测）
- **M3 主题管理器设置观察器防抖**（issue #26 附加项）：`assets/themes/m3-theme-manager.js` 的 `MutationObserver` 不再每批 DOM 变更都执行全文档 `querySelector`，改为 300ms 防抖（与 preload.js 中同功能实现对齐）
- **M3 主题全局过渡拖慢整页**（issue #26 附加项）：`body[data-m3-theme="m3"] * { transition-duration }` 默认 `transition-property: all`，每个元素的所有属性变化（含布局开销最高的 width/height/transform）都被动画化，M3 模式下掉帧显著。收窄为颜色类属性（背景/文字/边框/阴影/透明度/transform），保留主题切换的平滑变色意图，几何变化不再动画
- **WSL 模式「模式列表」比 local 少**（PR #29）：WSL 托管后端经 npm 安装的 dsh 是干净包，不含壳内置的 8 个 Agent 预设。`main.js` 在 WSL bootstrap 与更新后会经 UNC 把 `assets/agent-presets` 写入 WSL agent 包的 `config/agent-presets`；`scripts/sync-companion-plugins.js` 也自动同步预设（可 `--dsh-package <目录>` 显式指定）
- **本地模式 agent 更新后丢失壳内置 Agent 预设**：`updater.applyUpdate` 全新安装的 overlay 也是干净 npm 包，8 个壳内置预设同样缺失（WSL 同族问题的 local 半边）。新增 `syncLocalAgentPresets()`：启动与更新后把预设幂等补进「当前生效」的 dsh 包（overlay 优先，否则内置），三种布局（内置 / 更新 overlay / WSL）模式列表一致
- **识图 view_image 三个根因修复**（issue #33，PR #31 + #32）：① 旧模型（`glm-4v-flash` / `glm-4.1v-thinking-flash`）钳制 `maxTokens ≤ 1024` 并对 400 自动降档 1024 重试一次，400 code 1210 不再直接失败且 fallback 链持续生效；② 设置页保存不再把「等于插件默认值」的字段写进 `settings.yaml`（避免旧模型 maxTokens 2048 被写死固化）；③ `role('secret')` 的 apiKey 永不回显，留空 = 保持已存密钥，仅非空输入才写入（修复「改模型/地址后保存会静默清空密钥」）。新增 `scripts/verify-vision-upgrade.js` 交付前识图链路验证（插件完整性 / patch 唯一性 / 配置与模型上限兼容）
- **余额欠费误报「API key is invalid」**：第三方 provider（opencode 等）余额不足返回 401 + CreditsError 时被 `dsh-llm-pi-ai` 一律判 AUTH。新增 `scripts/patch-pi-ai-credits.js` 把余额判定前置到 401-AUTH 之前：欠费 → QUOTA（客户端显示真实原因），真 key 无效仍判 AUTH
- **便携版「有进程无窗口 / 双击无反应」**（issue #30）：① 便携版数据目录重定向提前到单实例锁校验之前——Electron 实例锁以 userData 为键，旧实现与安装版共用 `%APPDATA%\DSH Desktop` 锁，安装版在跑时双击便携版会静默退出；② 主进程启动期兜底：任何模块级 / 启动早期未捕获异常落盘 `<userData>/logs/startup-crash.log` 并在启动完成前弹可见错误框，杜绝静默失败
- **桌面版关闭到托盘后无法重新打开 / 桌面重复快捷方式**（用户反馈）：① `showMainWindow()` 防御性强化——窗口被销毁/未创建时重建主窗并加载 Web UI，隐藏/最小化时 restore+show+置顶聚焦；托盘左键/双击、`second-instance`（再次双击桌面图标）统一走该恢复路径并记录日志（此前托盘左键采用「可见则隐藏」双态逻辑，隐藏态误判会导致点按无反应；second-instance 对异常窗口状态无兜底）；② `maintainShortcuts()` 增加**快捷方式去重**——每次启动清理桌面与开始菜单中规范名（`DSH Desktop.lnk`）之外的同族快捷方式（Windows 自动重命名副本 `(1)`、手动“发送到桌面”副本、旧版残留），只保留一个；**安装版不再由壳层自动创建桌面快捷方式**（由 NSIS 安装器负责），仅便携版维护桌面快捷方式，消除「每次启动自动生成多个快捷方式」；标题栏 ⋯ 菜单与托盘菜单原有的「退出」「关闭时最小化到托盘」开关保持可用
- **打包前语法门覆盖补丁/自愈模块**：`scripts/check-syntax.js` 的入口清单并入 `profile-manifest.js` / `profile-patch-heal.js` / `patch-web-search-baseurl.js` / `gpu-crash-guard.js` / `install-minimal-win-preset.js` / `patch-deps.js` / `patch-pi-ai-credits.js` / `sync-companion-plugins.js` / `after-pack.js` / `patch-portable-template.js`，此类模块的语法/「async 与声明被拆开」问题在打包前即可拦截
- **启动提速**（PR #39）：① `repairProfileFallback` 增加健康快照（`profile-fallback-cache.json`，含 dsh 包签名）——依赖闭包未变、链接逐项校验通过时跳过耗时的 `import('dsh-app-boot')` + BFS + heal；dsh 升级后签名失效自动重算；② 配套插件同步（vendor 依赖与 lib/assets/src 递归目录、固定文件清单）逐文件比对 size+mtime，一致跳过写盘（复制改用 `preserveTimestamps`，确保二次启动命中跳过）；③ loading 窗口提前到启动最前段创建，用户第一时间看到「正在启动」，并同步提前装配渲染进程自恢复与挂起心跳（loading 阶段崩溃/挂起也有兜底）
- **router flash 等重负载场景掉帧 / 周期性假死**（issue #34）：① `harness-pet` 默认改为关闭（opt-in，设置卡可开启），且关闭时完全停掉 rAF 动画循环（此前隐藏状态下仍逐帧绘制 320x320 canvas）；② `dsh-conversation-tweaks` 会话滑轨的 MutationObserver 不再每 250ms 全量 `querySelectorAll + getBoundingClientRect`，改为仅在内容尺寸真实变化时重算标记位置；③ 修复 `syncCompanionPlugins` 自愈死循环——bundle 插件源缺失时不再被当普通插件写回 `cordis.patch.yml`（此前会注册不存在的包导致 dsh web 启动崩溃），并从 manifest bundles 移除（视为用户禁用）、清理 patch 残留注册（用户手写 config/disabled 覆盖条目保留）
- **Agent 预设很多时「上面的不显示」**（issue #36）：`dsh-client-ui-primitives` 的 Menu portal 弹层在条目超过视口时没有高度上限，`place()` 把整列推到视口上方、顶部条目被裁掉且无法触达。新增 `scripts/patch-menu-viewport.js`：portal 列表加 `max-height: min(calc(100vh - 24px), 560px)` + `overflow-y: auto`，y 夹紧按封顶后高度计算，任何视口高度下完整可用（打包 afterPack / 启动运行时 / dev node_modules 三路覆盖，含 `node --test` 单测）
- **第三方模型思考强度**（issue #37）：功能已就绪（`dsh-third-party-thinking` 默认关闭、可对支持的 provider 开启并把档位注入请求体）；设置页「请求字段名」提示补充 opencode-go 套餐内 DeepSeek Flash/Pro 的开启说明
- **桌面宠物原生置顶小窗**（harness-pet「主窗最小化后宠物消失」根治）：插件自带 Document PiP 独立窗口在 Electron 中不可用（`requestWindow` 抛 `Internal error: no window`）。改为主进程原生方案：  - `main.js`：新增 360×420 无边框透明置顶（screen-saver）不进任务栏的宠物小窗（与主窗共享分区/localStorage），位置经 `userData/pet-window.json` 持久化（跨屏校验 + 钳制回可视区，拖动 400ms 防抖保存）；IPC 双端契约：`chrome:pet-window`（open/toggle/state，校验主窗来源）、`pet:close`、`pet:move-to`（绝对目标位置，至少露出 80px）、`pet:set-auto-open`；主窗最小化且插件开启「最小化自动显示小窗」时自动弹出；before-quit 清理；复用 `guardWebContents` 与 `recovery.attach`
  - `preload.js`：`--dsh-pet=1` 模式检测 → 注入 `window.__DSH_PET__`、隐藏除宠物根节点外的全部界面、跳过自绘标题栏；桥接 `dshDesktop.petWindow`（open/toggle/isOpen/close/moveTo/setAutoOpen）；主进程 `pet:state` 转发为页面事件 `dsh-pet-state`
  - `harness-pet` 插件：原生桥优先（浏览器仍回退 PiP）；小窗布局（宠物贴底居中、气泡锚定鲸鱼正上方随大小自适应、齿轮右下角、面板内嵌）；双宠物互斥（小窗打开时主窗宠物/气泡/齿轮隐藏，含刷新后状态查询恢复，`applySettings`/`setDialogVisible` 共用可见性表达式）；拖动（小窗 = 绝对定位搬窗无抖动、主窗 = 取整落位）；朝向只越水平中线才调转（主窗视口中线 / 小窗屏幕中线）；会话跟随（共享 localStorage + storage 事件 + `sessions.open`）；新设置项 `autoDesktop`（最小化自动显示小窗，默认开）/ `sound`（状态跃迁 Web Audio 合成提示音：等待输入/任务完成，仅主窗、仅跃迁响一声、首状态不响）/ `labelSize`（提示文本字号 10–26px 默认 15px，四语言文案齐全）；提示文本 9 种状态前景/背景配色

## [0.3.8] — 2026-08-15

### 修复
- **安装后启动即报 `ReferenceError: async is not defined`**：`main.js` 中 `async` 关键字与 `probeOverlayAgent` 函数声明被注释行拆开，导致主进程模块加载失败。已重接 `async function`；新增 `scripts/check-syntax.js` 并接入 `prepack` / `predist`，打包前强制做入口 JS 语法检查与「async/await 关键字与声明被拆开」模式扫描，此类坏包无法再打包。
- **安装后启动即弹「应用初始化失败：home is not defined」**：`main.js` 的 `applySettingsSectionGuard()` 构造候选补丁路径时引用了未声明的 `home` 变量（相邻的 `applyProfilePatchGuard` / `applyWorkspaceSearchRailFix` 均有声明，唯独此处遗漏），`boot()` 无条件调用该函数导致每次启动必现初始化失败弹窗。已在该函数内补齐 `const home = effectiveDshHome() || path.join(os.homedir(), '.dsh')`，与相邻防护函数保持一致。

## [0.3.6] — 2026-08-15

> 注意：Zat-DSH Engine 市场替换与客户端更新闭环修复已合入 main，但本版本尚未发布；
> Gitee 分片合并脚本（merge.bat）已重写为 CRLF + ASCII 提示，修复换行符丢失导致
> `set FAILED` / `pause` 失效的问题。发布前请重新执行打包并核验全部文档链接。

### 新增
- **内置 Agent 预设扩充至 8 个**：按上游最新版本同步 `router-standard`（yjh051108/dsh-routing-suite）、`anchored-standard` / `zero-anchored-standard`（xiaobright/dsh-anchored-standard），并新增 `whoami-standard`、`v4-flash-godmode-opencode-go`（SheberDavid）、`warmupbetter` / `warmupbetter-replay`（0liveiraaa/myDshPresets）；每个预设目录附带上游 LICENSE/NOTICE，详见 `docs/agent-presets.md`
- **Gitee 分片合并脚本重写**：`scripts/fix-merge-bat.cjs` 生成 CRLF + ASCII 提示的 merge.bat，修复 `set FAILED` / `pause` 被 echo 吞掉的问题；README 下载说明同步修正
- **插件市场整体替换为 [Zat-DSH Engine](https://github.com/mishibeikejie/zat-dsh-engine)（MIT）**：移除旧 `@deepseek-ai/dsh-plugin-marketplace` 的同步副本与 patch 条目，新增 `zat-dsh-engine` bundle（社区目录 / 双语简介 / 一键安装更新卸载启停 / 网络自适应 / 自更新）；`zod` 转为显式依赖随包分发
- **新增内置 bundle 插件**：`dsh-better-sidebar`（[omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)，MIT，VSCode 式侧边栏工作台）与 `harness-pet`（[cakeni/harness-pet](https://github.com/cakeni/harness-pet)，MIT，桌面宠物）；`syncCompanionPlugins` 支持递归同步 `lib/assets/src` 目录，并为 profile 补齐 `schemastery / cosmokit / @standard-schema/spec` 内置依赖
- **文本模型自动识图**：`dsh-host-apiproxy` 发送入口在模型不支持图片输入时，自动复用已安装 `dsh-vision` 的 VLM 配置把图片转述为文字（含 OCR）后再发送；支持图片的模型仍走原生通道
- **第三方许可文档**：新增 `docs/attributions.md` 与 README「第三方组件与许可」，明确 Zat-DSH Engine、dsh、koffi、Electron、React、zod 等 MIT 组件来源

### 修复
- **客户端更新「点了立即重启仍弹出有待安装的更新」**：待安装标记原子写盘 + 回读校验；每次重启安装记录 `clientUpdateAttempt`，启动识别「客户端更新未完成」并支持重试 / 打开日志 / 24h 稍后；NSIS 更新脚本在安装器失败或被取消时自动拉起旧版本

## [0.3.4] — 2026-08-15（BUG 修复版）

### 修复
- **koffi 3.1.3/3.1.4 win32-x64 预编译二进制损坏**（目录选择器 worker 无消息退出、部分客户机器启动即崩）：`package.json` overrides 锁定 `koffi@3.1.5`（上游已回退 Windows 原生编译）；新增 `scripts/koffi-preflight.cjs`，启动前用内置 Node 做 FFI 冒烟，失败自动注入 browse 目录选择器 overlay
- **目录选择器 worker 崩溃后报错无任何诊断信息**：新增 `scripts/patch-deps.js`（postinstall / pack / dist 幂等补丁），worker 无消息退出时把真实 exit code / signal 带进错误文案
- **启动项配置生成错误导致整体打不开**：`dsh web` 退出码 1 时自动解析 `dsh-web.log` 中加载失败的 patch 插件 id，写入 `safe-boot.overlay.yml`（`dsh web --patch`）禁用后自动重试，不修改用户 patch 文件，并弹系统通知
- **EPERM: operation not permitted, symlink 导致退出码 1**：检测到 `profiles/node_modules` 目录联接创建被拒时，自动改名备份半成品缓存、重跑官方 `healProfilesModuleFallback` 重建联接并重试启动，不再需要客户手动按手册操作
- **部分用户设置页看不到插件设置（视图/识图/思考强度等）**：`dsh-host-apiproxy` 设置命名空间白名单补丁改为同时覆盖内置 app、profile fallback 与**更新后的 agent overlay** 三处副本，并锚定 `WEB_SETTINGS_NAMESPACES` 数组自身收尾插入；启动顺序调整为先修复 profile 联接再应用补丁
- **启动失败弹窗缺少日志内容**：失败对话框与「服务已停止」对话框附带 `dsh-web.log` 最近日志，客户截图即可定位
- **syncCompanionPlugins 覆盖用户禁用**：patch 中 id 已存在（含用户手写 disabled 条目）时不再自动重插，避免重复 id 与「禁用后又被加回来」
- **全新 DSH_HOME 首次启动必失败（退出码 1，插件树无法激活）**：`syncCompanionPlugins` 在 dsh 初始化 profile 之前预写 manifest 时，只写入 bundle 插件导致核心 bundles（dsh-base / dsh-web-app）缺失。现改为以实际将运行的 dsh 包为锚点实测可解析后，先写核心 bundles 再追加 bundle 插件；解析不到则不写 manifest，交由 dsh 自行初始化（PR #14）
- **客户端更新「点了立即重启仍弹出有待安装的更新」**：待安装标记改为原子写盘 + 回读校验；每次重启安装都记录 `clientUpdateAttempt`，下次启动若仍是旧版本则识别为「客户端更新未完成」，提供重试安装 / 打开 `apply-update.log` / 稍后（24h 不再打扰）；NSIS 更新脚本在安装器失败或被取消时自动拉起旧版本，避免“重启后应用消失”
- **渲染进程崩溃后永久黑屏/白屏（0xC0000005）**：新增 `renderer-recovery.js` 自恢复状态机，主窗与会话浮窗统一接管：
  - `render-process-gone`（crashed/killed/oom）→ 指数退避自动重载（首次 0.8s，上限 15s + 抖动）
  - 连续失败第 3 次 → 主窗销毁重建 BrowserWindow（保持隐藏/托盘状态）；浮窗直接关闭
  - 失败超过上限 → 主窗切到本地恢复页（重新加载/重启客户端/打开日志），并弹系统通知；绝不无限循环
  - 页面加载成功后需「稳定存活 30 秒」才清零故障计数，杜绝「加载即崩溃」型循环
  - `clean-exit`、退出中、窗口已销毁一律不触发恢复；服务进程退出时交由既有重启对话框，不双弹窗
- **界面挂起（AppHangB1）无恢复**：监听 `unresponsive`，20s 宽限后强制终结 renderer 复用恢复路径；preload 每 5s 心跳兜底「挂起但无 unresponsive 事件」的场景（以 show/hide 事件追踪可见性，隐藏/最小化不误判）
- **加载失败白屏**：新增 `did-fail-load` 处理，服务健在时退避重试（覆盖插件市场重启间隙），`ERR_ABORTED` 忽略
- **崩溃无法取证**：固定 `crashDumps` 到数据目录并启用本地 Crashpad（`uploadToServer:false`），minidump 可离线分析 0xC0000005 底层来源；恢复状态写入 `run-state.json`
- **dsh web / 预览服务随机命中 Chromium 受限端口导致页面永远无法加载**：命中即自动重启服务换端口（上限 4 次）；本地稳定端口选择也会避开受限端口

### 开发
- 新增 `scripts/test/unit-recovery.test.js`（node:test 状态机单元测试，17 例）与 `scripts/test/integration-runner.js`（真实 Electron 集成测试，10 场景）
- 集成测试通道：`DSH_DESKTOP_TEST=1` 时经文件轮询下达命令（crash/kill/hang/quit…），renderer 崩溃时仍可用

## [0.3.3] — 2026-08-15

### 新增
- **内置「极简模式_win」Agent 预设**：把官方极简模式的 bash/PTY 工具替换为 Windows PowerShell（`@deepseek-ai/dsh-tool-pwsh`），开发模式 `npm start` 自动安装，打包流程 `afterPack` 自动写入内置 dsh CLI。
- **内置 dsh-routing-suite**：`dsh-super-injector`（dev_* 注入器/自愈工具）作为 bundle 插件随包同步进 web profile；`router-standard` 预设随包写入内置 dsh CLI。
- **内置 dsh-anchored-standard**：`anchored-standard` 与 `zero-anchored-standard` 两个实验性预设随包写入内置 dsh CLI。
- **识图插件设置页**：`dsh-vision` 新增设置页，可直接填写 API 地址、密钥、模型、备用模型与请求限制；设置保存后热生效。
- **余额/本轮费用开关**：自绘菜单新增「显示余额/本轮费用」，第三方中转/不需要余额提示的用户可一键关闭整个统计 dock。
- **会话导航滑轨输入位置圆点**：每条用户消息在右侧滑轨上以圆点标出位置，内容或尺寸变化时才重算，滚动时不额外读取布局。

### 修复
- **客户端更新多源选择错误**：GitHub 与 Gitee 双源现在取版本最高的 release，而不是返回第一个可用源；修复 GitHub latest 落后时“内置在线更新失效、只能手动覆盖安装”。
- **插件市场安装报 `args fields do not match`**：`installPlugin` 的 Typert 描述符参数名从 `packageName` 对齐为宿主方法的 `spec`。
- **识图插件无法配置/加载**：修正 `dsh-vision` 的 peer 依赖（`@deepseek-ai/cordis`），补齐 `dsh.client` 清单与设置 UI，配置不再依赖手工写文件。
- **第三方模型思考强度默认不再破坏 API**：`reasoning_effort` 注入默认关闭，仅 provider 确认支持时启用；字段名留空表示只显示档位、不注入参数，避免百炼等严格接口报错。
- **会话导航滑轨**：滑轨固定到会话内容区右侧，并在滑轨上以圆点标出每条用户输入的位置；不再因 `position:fixed` 缺省位置偏到窗口左侧。
- **设置页出现两个「插件」栏**：移除 `dsh-super-injector` 重复注册的同名空白设置栏，设置导航只保留官方「插件」页（插件市场为其标签页）。
- **余额/本轮费用开关失效导致金额不显示**：`balanceDockEnabled` / `setBalanceDock` 曾被误放进通知点击回调的作用域，余额刷新与菜单开关运行时抛出 `ReferenceError`；现提升为模块级函数，dock 恢复显示且开关真正生效。
- **README 下载链接**：根 README 中英文下载链接从 0.3.1 同步为 0.3.3，并补充手动安装第三方插件说明。
- **服务启动失败弹窗叠加**：主进程对话框串行化，启动失败/更新/错误弹窗不会同时叠成多个。
- **「隐藏对话输出」按预期工作**：`dsh-conversation-tweaks` 设置命名空间加入浏览器设置白名单，开关保存后真正写入；开启时隐藏大量工具调用、工具结果与思考过程，每一轮最终总结输出仍然显示。
- **桌面端卡顿优化**：会话日志目录枚举改为 5 秒缓存并降低轮询频率；会话导航滑轨滚动事件合并到 requestAnimationFrame 并限频；M3 设置观察器防抖；高频重复的页面 warning/error 日志按签名节流，减少同步磁盘写入。
- **左侧会话分组偏好丢失**：`dsh web` 不再每次随机换端口，改为复用上次保存的 `127.0.0.1` 端口（占用时自动选新端口）。Web UI 的 localStorage 偏好（如会话分组方式）不再因 origin 变化而每次重置。
- **客户端更新“重启后不自动安装/重复弹窗”**：启动更新脚本前清除待安装标记，失败后不会再反复弹同一个更新框；安装版安装完成后会检测新版本是否启动，未启动则从卸载注册表定位并显式拉起；NSIS 明确开启 `runAfterFinish`。
- **插件事件导致会话历史无法加载**：打包时对内置 `@deepseek-ai/dsh-session` 事件词汇表打补丁（`afterPack` 自动执行；开发模式 `npm start` 同样幂等补丁），接受 dsh-agent-teams / dsh-message-edit / dsh-web-search-exa 写入的自定义会话事件，修复 `SessionFormatUnsupportedError: ... unknown to this harness and not marked ignorable`。
- **0.3.2 实际未随包携带「极简模式_win」**：该预设此前只写进了 changelog，本次补齐源文件与安装流程。


## [0.3.2] — 2026-08-15

### 新增
- **内置识图插件 `dsh-vision`**（`assets/plugins/dsh-vision`）：为纯文本 DeepSeek 注册 `view_image` 工具，把图片与问题转发给任意 OpenAI 兼容 VLM 端点（默认智谱免费 `glm-4.6v-flash`，可换通义 qwen3-vl / Ollama 本地 / 未来 DeepSeek 官方识图 API），答案以文本返回；无需 API key 时按插件配置或 `DSH_VISION_API_KEY` 等环境变量取用。

### 修复
- **客户端自更新“点击重启后无任何反应”**：安装版/便携版更新脚本原来以含空格的完整路径作为 `cmd /c` 的第一个参数，会被 cmd 剥掉引号而静默失败；现在把工作目录切到 `updates` 并只传脚本文件名，更新安装器可正常拉起。
## [0.3.1] — 2026-08-15

### 新增
- **设置-通用「隐藏对话输出」**：一键隐藏模型长篇文字输出，仅保留工具调用、文件操作与结果等重要信息（`assets/plugins/dsh-conversation-tweaks`）。
- **会话右侧导航滑轨**：对话区右侧提供一条跟随会话长度的虚化滑轨；鼠标悬停时在鼠标位置显示垂直短横线预览目标位置，仅点击才跳转（同插件）。
- **便携版解压缓存**：portable 版首次启动后保留 `%TEMP%\dsh-desktop-portable` 解压缓存，后续同版本启动直接复用，避免 Defender 扫描 2.4 万文件造成的分钟级冷启动。
- **异常退出看门狗与恢复提醒**：安装版内置轻量看门狗；主进程异常消失时自动拉起应用，并在下次启动时发系统通知。

### 修复
- **会话浮窗空白**：修复 `display:none` 导致 CSS Grid 自动前移、会话列宽度为 0 的根因。
- **同一会话拖出两个浮窗**：主进程按 sessionId 去重复用已有浮窗；客户端拖拽增加节流。
- **后台完成不提醒**：仅主窗口可见且聚焦时抑制通知，最小化/隐藏/失焦时正常弹通知。
- **终端路由冲突残留**：清理旧 `@deepseek-ai/dsh-terminal` 私有包，启动时自动移除过期配套插件。
- **profile 链接损坏导致启动失败（退出码 1）**：启动前调用官方 `healProfilesModuleFallback` 自愈，自动移除被复制/同步还原成真实目录的 fallback 链接。
- **托盘偶发丢失**：每 30 秒检测并在不可用时重建托盘。

### 开发
- 新增 `scripts/patch-portable-template.js`、`watchdog.js`、浮窗诊断脚本 `_float-diag.js`。
- `npm run dist` 已内置便携版缓存模板补丁，直接打包即可。

## [0.3.0] — 2026-08-15

### 新增
- **第三方模型思考强度**（`assets/plugins/dsh-third-party-thinking`）：让接入的第三方
  OpenAI 兼容模型（pi-ai 自定义 provider / openclaw-bridge 等）也能在模型选择器右下角
  调整思考强度（off / high / max），与官方 DeepSeek 模型同一位置、同一交互。官方
  DeepSeek 模型行为不受影响，已声明 reasoning 的第三方模型保留原生元数据。
- **极简模式_win Agent 预设**：基于官方极简模式，将 bash 工具替换为 Windows PowerShell
  （`@deepseek-ai/dsh-tool-pwsh`），Windows 用户可直接使用。
- **自定义提示词「预览官方提示词」**：设置页自定义提示词区域新增按钮，点击显示官方
  默认系统提示词的渲染结果（只读），方便对比修改。

### 修复
- **插件市场搜索崩溃**：非 npm 来源（GitHub / deepseekdocs）的搜索结果会触发
  `Cannot read properties of null (reading 'version')`，已修复空值判断。
- **会话浮窗内容空白**：拖出会话到独立窗口后，若服务端会话列表尚未同步目标会话，
  会因 `unknown session` 导致浮窗空内容。现增加快照内会话存在性校验，确保目标会话
  已在列表中再执行选中。

### 优化
- **会话完成通知去重**：主窗口在前台时不再弹通知，同一会话 30 秒内最多弹 1 次，
  全局 15 秒内最多弹 1 次，避免连续刷屏。
- **安装包继续瘦身**：在 0.2.3 语言包裁剪 + 冗余文件清理的基础上，进一步优化
  after-pack 清理范围。

## [0.2.0] — 2026-08-14

### 新增
- **伴侣插件体系（一切插件化）**：新增 `assets/plugins/` 机制——宿主启动时把
  配套插件同步进 web profile（`~/.dsh/profiles/web`）并幂等打 `cordis.patch.yml`
  补丁启用。本版随客户端分发的插件：
  - `dsh-terminal`：会话内终端标签页（与 对话/轨迹/文件 并列）。在当前会话项目目录
    启动持久 PowerShell（SSE 流式，非 PTY），命令历史/清屏/重启/断线重连（保留
    512KB 回放）；显式 UTF-8 mini-REPL 规避 PS 5.1 重定向 stdin 的代码页问题；
  - `dsh-file-changes` + `dsh-client-file-changes`：会话文件修改追踪与一键还原。
    「文件」标签页聚合当前会话 agent 修改过的全部文件（新建/修改/删除 + 行级 diff），
    支持逐文件/全部还原（桌面壳做内容精确匹配后替换，冲突安全提示）。数据只读复用
    会话日志已持久化的 `tool/result.meta.diffs`（fs 写前锁内全文 diff），零写入、
    零格式变更；另提供项目文件树（`/api/dsh-files/list`）、站内 HTML/端口预览
    （`/dsh-files/static/*`、`ports`、`check`），全部仅回环；
  - `dsh-balance`：对话底部统计栏内联「本轮 ¥X.XX · 余额 ¥Y.YY」小部件
    （桌面壳读 `~/.dsh/.credentials.yaml` 调 `api.deepseek.com/user/balance`，
    15 分钟刷新，可配置价格档）；
  - `dsh-plugin-marketplace`：插件市场入口。
- **客户端自更新**（`client-updater.js`）：GitHub Releases → Gitee Releases 双源回退
  （`DSH_DESKTOP_RELEASE_API` 可自定义镜像），Gitee 100MB 分片自动下载合并；
  便携版原地替换 + 自动重启，安装版引导新安装包；失败自动保留当前版本。
- **跟随官方更新**（`updater.js`）：检测 `@deepseek-ai/dsh` 新版本，经用户同意后
  用内置 node+npm 安装到数据目录 overlay，staging 原子切换、失败回退、
  启动失败一键回退内置版本；尊重 `NPM_CONFIG_REGISTRY`。
- **会话完成系统通知**：agent 任务跑完弹 Windows 通知，点击回到窗口。
- **快捷键自动维护**：便携版自动创建/重建桌面+开始菜单快捷方式（exe 移动后自愈）。

### 说明
- 便携版数据目录跟随 exe（`data\`）；安装版在 `%APPDATA%\DSH Desktop\`。
- 与 dsh CLI 共享 `DSH_HOME`（默认 `~/.dsh`），已有会话/凭据直接生效。

## [0.2.1] — 2026-08-14

### 新增
- **会话分屏独立窗口**（`assets/plugins/dsh-float-window`）：会话头「弹出独立窗口」
  图标，或把侧栏会话拖出窗口边界，即可创建浮动窗口独立查看/操作该会话（同源镜像 +
  沉浸折叠，自动选中目标会话、折叠侧栏、隐藏标题栏）。最多 8 个浮动窗口，经 IPC
  `too-many` 校验防资源过载；全部浮动窗口共享同一会话数据源、各自独立选中态。
- **自定义注入提示词**（`assets/plugins/dsh-prompt-custom`）：设置页可自定义官方内核
  每次为会话注入的系统提示词，支持「替换整体 / 追加到末尾」两种方式（应用到
  standard 完整 Agent 基准预设），新会话即刻生效。配置持久化到 web profile 的
  `settings.yaml`（`dsh-prompt` 命名空间）。
- **插件市场多源聚合**（`assets/plugins/dsh-plugin-marketplace`）：搜索聚合
  npm registry、GitHub（`topic:dsh-plugin`）与 deepseekdocs 生态三源，各源独立熔断；
  结果展示来源徽标 / stars / GitHub 链接 / 版本；支持 npm 包名与 git spec
  （`github:owner/repo#branch`、`git+https`、`https`）安装。
- **请作者喝咖啡**：chrome 栏 ⋯ 菜单新增「请作者喝咖啡」，弹层展示支付宝/微信收款码
  （`assets/sponsor/`），对照 README「支持作者」小节。
- **官方峰谷计价**：`balance.js` 加入官方峰谷计价引擎（`PEAK_PRICES` /
  `LEGACY_PRICES` / `isPeakHour()` / `effectivePrice()`），余额小部件显示当前模型与
  峰/谷价格，v4-flash 底价同步至峰时费率。

### 变更
- **终端插件更名**：`dsh-terminal` → `dsh-terminal-tab`，修复与官方
  `@deepseek-ai/dsh-terminal` 同名导致的重复路由注册与预设加载失败。

### 修复
- **会话列表刷新闪跳**：选择工作区 / 切换模式 / 开启新对话后，UI 会瞬时闪回
  「选择工作区 / 无会话」状态。根因是官方 `dsh-client-runtime` 的
  `mergeOrderedBaseline` 在会话列表刷新时会丢弃「本地已创建、宿主全量列表尚未
  回显」的新会话，使 `current` 瞬时变 `undefined`。桌面启动时
  （`applyRuntimeFlashFix`）幂等地对运行时打补丁——保留 baseline 缺席的本地会话，
  下一次 baseline 带上该会话后自动收敛为官方值。dsh 包更新后会在下次启动重新应用。

## [0.2.3] — 2026-08-14

### 优化（缩小安装体积、缩短安装时长）
- **语言包裁剪**：`electron-builder.yml` 新增 `electronLanguages: [en-US, zh-CN]`，
  移除 Electron 其余 53 个语言包（.pak，约 80MB）。不影响功能与体验——右键菜单、
  DevTools 等界面语言随系统 locale 自动取 en-US/zh-CN。
- **冗余文件清理**：`scripts/after-pack.js` 在打包后递归清理纯冗余文件
  （源码映射 `*.map`、文档与许可 `README*/CHANGELOG*/LICENSE*/*.md`、TS 构建产物
  `*.tsbuildinfo/*.d.ts` 等），覆盖 `resources/app/` 与自带 npm CLI
  `resources/npm/`。绝不触碰任何运行时文件（`.js/.json/.node/.exe/.dll`），
  功能与体验完整保留。

### 说明
- 0.2.3 为安装优化版，功能与 0.2.2 完全一致（含浮窗会话、自定义提示词、
  咖啡二维码长条三项修复），仅体积与安装时长得到改善。

## [0.2.2] — 2026-08-14

### 修复
- **自定义提示词设置不可用 / 无法输入**：官方 `dsh-host-apiproxy` 只把白名单里的
  settings 命名空间暴露给浏览器端，`dsh-prompt` 默认不在白名单，导致设置页该栏只读
  （显示「设置不可用」，无输入框）。新增 `applyPromptExposeFix()`，启动时幂等地把
  `dsh-prompt` 追加进 `WEB_SETTINGS_NAMESPACES` 暴露白名单，使输入框可正常编辑保存；
  dsh 包更新后会在下次启动重新应用。
- **会话分屏浮窗内容为空 / 按键不响应**：浮窗早期会话服务未就绪时 `sessions.open()`
  会抛 `unknown session`，首屏未选中任何会话导致内容空白。改为浮窗 preload 在页面
  JS 运行前把目标会话预置进 `localStorage['dsh.sessions.current']`，应用一启动即带
  目标会话首屏渲染（与正常恢复会话同一机制）；`sessions.open()` 保留作兜底。
- **「请作者喝咖啡」展示优化**：由全屏遮罩 + 居中卡片改为点击 ⋯ 菜单后从右上角
  （标题栏下方）展开的一条可关闭长条，两个收款码并排显示，支持 × 按钮与 Esc 关闭，
  不再把二维码平铺到页面下方。

# Changelog — DSH Desktop

DeepSeek Harness（dsh）的 Windows 桌面客户端：内置独立 Node 运行时与 dsh CLI，
一键启动 Web UI。

## [Unreleased]

> 内核升级：内置 DeepSeek Harness 从 0.1.0-rc.7 升至 **0.1.0-rc.8**（npm `next` tag，2026-08-19 发布）。含行为适配与补丁体系全量重锚定审查。**同时修复存量 rc.8 overlay 用户的补丁失配**（更新器按 dist-tags 最大值推荐版本，rc.8 发布当天起线上用户已可装到 rc.8 overlay，而既有补丁锚定 rc.7 形态）。

### 修复（0.4.1 用户反馈）
- **设置页左侧导航无法滚动**：装的插件多或展开「高级」分组后，导航行数超出设置面板高度，官方 navList 无 overflow，下方条目被裁掉看不清也点不到。dsh-settings-groups 就地把 navList 容器化（overflow-y:auto + min-height:0/max-height:100% 允许在 flex 布局正确收缩 + overscroll-behavior:contain 防滚动穿透），未超出时零影响。
- **「操作失败： signal timed out」弹窗友好化**：该错误是连接层 AbortSignal.timeout 的裸 DOMException（后端正忙/假死时所有带超时的请求都报它），直接 alert 用户无法理解。dsh-session-manager 的会话操作超时改为：人话说明（后端响应超时，输入不显示/内容刷不出通常同因）+ 「是否立即重启 DSH 服务」一键走壳层受监管重启（window.dshDesktop.restartService，不产生游离进程）。后端假死的根治（存活探针 + 受控自动重启）由 #121 插件中心重构的 supervision 层承载。

### 升级与适配
- **依赖平移**：`@deepseek-ai/dsh` 与 19 个 `@deepseek-ai/dsh-*` 兄弟包从 `0.1.0-rc.7` 精确锁版整体升至 `0.1.0-rc.8`（54 包全家桶齐发；cordis 系 1.x/4.x 版本线冻结不变；新增传递依赖 `dsh-tool-pwsh-persistent` 随 minimal preset 的 win32 pwsh 栈引入）。
- **禁止内核自动开浏览器（关键行为适配）**：rc.8 `dsh web` 新增 `openBrowser` 默认 `true`（非 SSH 环境经 `open` 模块拉起系统浏览器；WSL 内经 `wslview` 弹 Windows 浏览器）。桌面内嵌场景由壳层 spawn 时显式传 `--no-open`（main.js `startServer()` 与 wsl-backend.js `spawnServer()`），**按内核版本门控**（≥ 0.1.0-rc.8 才传；rc.7 的 web 命令无此选项，commander 遇未知选项直接报错）。
- **补丁锚点 rc.8 审查结果**（postinstall 链 + 22 项注册表 applyAll 实测）：session-manage（5 文件）、open-project-dir、session-persistence、tool-source 双端、keyed slot runner 侧、识图链路、settings/patch/bundle 三重防护、web-search、pi-ai-credits、picker-native 等 **17 组补丁在 rc.8 上原样命中，无需改动**。真实回归仅 2 处，已修复（双形态兼容，rc.7 overlay 副本仍走原锚点路径）：
  - `profile-boot` 存根识别：rc.8 把两个 `profile-boot-*.js` 之一变成纯 re-export 存根（85 字节，真身在另一 bundle 且已注入防护），存根无装配面，按已处理跳过，不再计为失配；
  - workspace 搜索栏修复：rc.8 **上游原生合入同款守卫**（`|| searchOnExpand` 无 marker 裸形态），命中即视为已修复。
- **菜单视口封顶改为 CSS 注入（issue #36 的 rc.8 形态）**：rc.8 菜单组件移入压缩前端 dist 产物（`dsh-web-frontend`，mangled 标识符），文本手术锚点不再可用，且其放置夹紧在列表高于视口时仍裁顶部条目（与 rc.7 bug 同源）。改由 preload 以语义选择器注入 `[role="menu"]{max-height:min(calc(100vh - 24px),560px);overflow-y:auto}`——不依赖 CSS-module 哈希类名，对后续版本漂移稳健；rc.7 树仍由原文本补丁覆盖。
- **keyed slot 兼容的 rc.8 布局**：rc.8 移除 `dsh-client-ui-slots` 独立包（slot core 并入前端 dist），core 侧两个补丁（legacy-key 提升、注册错误隔离）在 rc.8 布局下无目标可打（文件不存在即静默跳过，不计失配；`fault-isolation` 预检同为"文件不存在即跳过"，不误报）。注册链路防护由 **runner 侧** unkeyed 兼容补丁承载（rc.8 实测命中）：显式 key 优先、legacy `id` 提升、全无时按包身份派生——所有经 cordis-client-runner 的注册（含全部第三方客户端插件）均受覆盖。相关单测在 rc.8 布局下跳过对已不存在文件的真实锚点校验。
- **已知后续项（fail-soft，不阻断）**：M3 主题按钮的设置页外观区锚（rc.6 CSS 哈希类 + `[class*="appearance"]` 回退链）在 rc.8 前端中已无 "appearance" 命名，注入静默失效，待运行时 DOM 侦察后重锚；`dsh-mini` 手机端 gui 快照（38 包自洽 rc7 副本）与桌面内核独立，重新采集列为后续任务。

### 验证
- `npm ci`（postinstall patch-deps 对 rc.8 实装）：17 组补丁全部命中，0 失配。
- 注册表 applyAll：写入 16 处 / 失配 3 项（均为 rc.7 时代即存在的 slot 交叉失配基线，与升级前一致，零新增）/ 降级 1 项（同基线）。
- 全量单测 633 项：630 过 / 0 挂 / 3 跳过（2 项既有环境跳过 + 1 项 rc.8 布局跳过）。
- 真实 Electron 集成测试：31 场景 30 过（boot/heal 全家/补丁链/会话删除/识图/崩溃恢复/WSL 回退等，实际 spawn rc.8 内核，含 `--no-open` 门控链路）；`preview-fence` 为升级前即存在的开发环境性失败（rc.7 基线同败，与内核版本无关）。
- 集成断言双形态化（`runtime-patches-suite`）：menu-viewport 前缀日志/primitives 落盘仅 rc.7 树要求，rc.8 树改为断言 preload 封顶 CSS 存在；workspace 搜索栏接受 marker 或 rc.8 原生守卫；提示词暴露接受 marker 或 rc.7+ 动态 settings 原生形态。

## [0.4.1] — 2026-08-19

> 热修复版：插件市场装插件后「服务意外退出」崩溃事故根治（三层防线）+ 空 tool-call 存量会话打不开修复。

### 修复
- **空 tool-call 持久化导致存量会话打不开（SessionPersistenceCorruptionError）根治**：session writer 曾把 id/name 为空的 tool-call 写入持久化（assistant message 的 tool-call block、tool/call 事件的 callId/name 均为空串），随后生成 callId/toolCallId 为空的 tool/result；export 能导出该 JSONL，但 dsh-session restore 的 `assertMessageEventShape` 严格校验要求 tool/result 必须有非空 tool source，整个会话「历史加载失败」打不开（事故会话 seq 连续 0..515255、帧可解，仅此一条空链击穿）。双端修复（新增 `scripts/lib/tool-source-patch.js`，幂等、锚点失配自动跳过，接入 main.js 启动 / patch-deps / after-pack / sync-companion-plugins 四条布线，覆盖内置副本 / profile fallback / agent overlay / WSL）：
  - **读端容错（存量会话能打开）**：dsh-session 校验遇到空 callId/缺 kind 的 tool/result 时就地修复——优先采用 block.toolCallId 非空侧，否则合成 `recovered-seq-<seq>` 并拉齐两侧，告警落日志；修复写入失败（对象已冻结）保留原严格报错；两侧 callId 都非空且不一致仍是真损坏继续拒绝。
  - **写端防护（不再产生新坏数据）**：dsh-agent-loop `appendToolCall`/`appendToolResult` 遇空 block.id 时合成 `recovered-<turn>-<step>-call`（两函数同规则保证 tool/call 与 tool/result 一致）并告警，空 name 落 `invalid-tool-call`。
  - **测试**：新增 `unit-tool-source-compat`（7 项：双变换真实 vendored 文件锚点命中/幂等、空 callId 就地修复放行、缺失形态以非空侧为准、双非空不一致仍拒绝、正常事件不受影响）。
- **发布流水线修复（三平台五架构全绿）**：① Windows 两腿「Verify packaged app natives」失败——node-pty 1.2.0-beta.15 的 win32 预编译目录从 `pty.node` 改为 `conpty.node`/`conpty_console_list.node`，校验 glob 改为 `*.node` 通配；② Linux 腿 Publish 失败——electron-builder 把 AppImage 的 `${arch}` 渲染为 `x86_64`（非 `x64`），上传 glob 改为 `dist/*.AppImage`；③ ci workflow 余额渲染层验证——npm ci 不触发 electron 二进制下载，步骤内显式 `node node_modules/electron/install.js`；无 GPU runner 补强（harness `app.disableHardwareAcceleration()` + GPU 子进程消失容忍、驱动层禁 Windows 无头遮挡判定节流、integration-runner `--disable-gpu`）。
- **插件市场装插件后「DSH 服务意外退出」崩溃根治（三层防线）**：用户从插件市场安装插件后点「立即重启」，dshmarket 直连其服务端自重启端点 `scheduleRestart()`——SIGTERM 掉被壳层监管的 dsh web 进程，再由 detached 助手拉起替身。壳层把自杀当「服务意外退出」弹窗（即事故截图），且替身进程脱离监管：退出应用时杀不掉、日志不落 dsh-web.log、用户点弹窗「重新启动」会拉起第三个实例撞端口。dshmarket 原有桌面分支（`allowRestart: false`，注释写明 "The shell remains responsible for restart"）依赖壳层注册 `desktopProfiles` 服务，而壳层从未注册，永远落入普通 DSH 分支（自重启开启）。三层根治：
  - **L1 重启权收归壳层**：壳层 `childEnv` 注入 `DSH_DESKTOP_SUPERVISED=1` 监管标识；dshmarket 服务端见到标识默认禁用自重启端点（显式 `config.allowRestart` 仍优先）；dshmarket 客户端「立即重启」在壳层桥（`window.dshDesktop.restartService`，即 `chrome:restart-service` 监管重启）可用时优先走桥，boot-id 轮询重载逻辑原样复用——按钮可用、重启受监管、不弹窗、不产生游离进程（与 dsh-hub 同款桥接模式）；
  - **L2 壳层稳定性看管（任何环插件均受益）**：① 「最后良好」快照延迟落定——旧实现 dsh web 一达就绪横幅即 `markGood`，环插件「启动成功、几秒后拖死宿主」的形态会把含环插件的配置固化成回滚基线、回滚永久无效；现改为服务连续存活 30s 才 `confirmPendingGood` 落定并清零崩溃环计数；② 就绪后崩溃环自愈——进程达就绪后 30s 内意外退出不再直接弹窗，而是自动走守护重启（体检/修复/回滚到最后良好快照），上限 2 次，耗尽才降级弹窗；③ 「服务已停止」弹窗的「重新启动」按钮改走守护启动（旧为裸 `startAndShow`，环插件会导致「点一次崩一次」死循环）；④ `restartService`（插件市场/集成测试共用的原地重启）同样改走守护启动；⑤ 回滚 lift 修复：旧实现回滚后成功拉起时把 `listSnapshots()[0]`（= restore 前的 pre-restore 快照 = 坏状态）标为良好，现改为对回滚后的健康状态新拍快照待落定；⑥ 意外退出弹窗延迟 500ms 再读日志，给 stderr 尾部真实崩溃栈落盘窗口（exit 事件可能早于最后几个 stdio data 事件，立即读会丢现场）；
  - **L3 dsh web 进程崩溃屏蔽**：新增 `scripts/lib/web-crash-shield.js`（纯 Node 核心依赖，经 `--require` 注入 + `DSH_CRASH_SHIELD=1` 自装）：就绪横幅出现前保持 fail-fast（启动失败快速退出语义不变，既有启动自愈照常工作）；就绪后 uncaughtException/unhandledRejection 吞掉并打日志到 stderr（随管道落 dsh-web.log），环插件运行时错误不再击穿整个宿主；风暴断路——60s 窗口内错误超 20 次恢复抛出（进程退出 → 壳层崩溃环自愈接管回滚），避免僵尸态。`scripts/**/*` 已在四个打包配置的 files 清单，随包分发。
  - **测试**：新增 `unit-web-crash-shield`（8 项：启动期 fail-fast、就绪后吞错落日志、unhandledRejection 同语义、风暴断路与窗口清零、就绪横幅探测 arm、事件监听注册）与 `unit-plugin-guard`（5 项：成功不立即落定、confirm 后落定、崩溃环场景回滚目标为此前稳定快照而非环配置、setPendingGood(null) 安全、失败无快照落事故报告）。

## [0.4.0] — 2026-08-19

### 新增
- **Quest 模式界面（dsh-quest-ui，默认关闭）**：全新 Qoder Quest 风格视觉重设计——输入区与画布彻底融合（去白底、去圆角、下栏拉高）、底部一体化（去胶囊 CSS / 幽灵按钮 / 余额同层 / 聚焦顶线）、全开布局（去胶囊 / 卡占满下栏 / 部件贴缘压底）。设置页弹窗重设计，聚焦线加浓加粗 + 编辑钮隐藏 + 临时会话移右上角 + 面板降噪。左侧栏启动时强制展开。多轮迭代至 v0.5.4：synapse 会话地图适配双 UI 通用 + 输入区底部一体化
- **内置 dsh-synapse 会话地图插件（vendored，MIT）**：可视化会话关系图谱，快速跳转关联会话，随包分发并自动装配
- **内置 Agent 预设保护（更新不再覆盖用户改过的 `assets/agent-presets`）**：用户直接修改安装目录内置预设后，客户端更新（NSIS/portable 覆盖安装）会整体替换 `resources/app` 把改动冲掉。现更新安装前把「用户改过」的文件快照到 `userData/preset-guard/backup`（覆盖安装不触碰 userData），新版本首次启动自动恢复（官方改过同一文件时用户版优先）；基线按版本管理（`preset-guard/baseline.json` 记逐文件 sha256），官方改动与用户改动始终可区分，下一轮更新仍能正确检测。更新未实际发生时快照自动丢弃。新增 `scripts/lib/preset-guard.js` 纯函数模块 + 9 项单测
- **手机远程控制（DSH-Mobile v1.4.2）**：随包分发手机端 APK，「远程控制」按钮一键连接，支持外网穿透 + P0 同步修复 + 安全加固
- **macOS 无签名构建 Gatekeeper 指引与配置显式化**：未签名 / ad-hoc 签名构建首次启动若提示「已损坏，无法打开」，README 与 troubleshooting.md 提供修复指引（`sudo xattr -cr` → codesign 重签 → 右键打开 → 终端直启取证）；构建配置显式关闭 `gatekeeperAssess` 与 `hardenedRuntime`（无 Developer ID 的包无意义，消除误导性警告）

### 修复
- **自定义卸载器升级链路根治（2026-08 数据丢失事故修复）**：electron-builder 的 `uninstallOldVersion` 宏把注册表里旧的 `UninstallString` 指向的卸载器拷到临时目录执行 `old-uninstaller.exe /S /KEEP_APP_DATA --updated`，旧版自定义卸载器不识别这两个升级契约参数，静默模式下默认全删用户数据（sessions / settings / credentials 等全部丢失）。双层根治：① **卸载器侧**：识别 `/KEEP_APP_DATA`、`--updated`、`/updated`、`--upgrade` 等升级意图参数 → 等价 `/KeepAll` 保留全部用户数据；静默模式安全契约——无升级标记且无显式 `/FullWipe` 时拒绝删除用户数据直接退出；Roaming 目录（`%APPDATA%\DSH Desktop`，含 logs / settings.json / window-state）在保留应用设置或其他用户数据时不再删除；UAC 提权子进程在静默模式下 `WaitForExit` 等待完成，避免安装器与子进程并发删文件。② **安装器侧**（`installer.nsh` `customInit` 宏）：`.onInit` 阶段（早于 install section 的 `uninstallOldVersion`）抢先把旧安装目录里的 `Uninstall_DSH_Desktop.exe` 覆盖为本安装包自带的修复版——即使存量用户机器上仍是旧坏卸载器，升级安装时实际执行的也已是修复版。InstallLocation 缺失时回退解析 `UninstallString`（含引号剥离 + 文件名校验），覆盖路径万无一失。经实机演练验证：编译旧版坏卸载器 → 布置数据标记 → 静默覆盖安装新包 → 标记文件存活 / settings.yaml 完整 / Roaming 数据保留 / 卸载器被自动替换
- **余额显示链路整体加固（架构重构而非补丁）**：本轮费用计算、余额查询、编排推送全链路系统性修复 21 处缺陷（2 严重 / 3 高 / 8 中 / 8 低），全部按「整体架构改进」落地：
  - **本轮费用输入项恒为 0（严重，OpenAI 兼容端点）**：`sessionCost` 的 `uncachedInputTokens + cacheWriteTokens` 求和先于 `||0` 守卫求值，openai-compat 适配器产出 `inputTokens` 形态且不产出 `cacheWriteTokens`，两处契约不匹配 → `undefined+undefined=NaN→0`，所有 one-api/SiliconFlow/Ollama 端点本轮费用只剩 cacheRead+output 计费。根治：① 客户端新增 `normalizeUsage` 归一化（投影/透传两种形态统一四桶、每操作数独立守卫）；② `openai-compat.js` 的 `mapUsage` 对齐 harness DISJOINT 契约（`inputTokens = prompt − cacheRead − cacheWrite`，缓存写单列、兼容多种 provider 字段命名）并附带 `model` 字段。
  - **重定向无条件携带 Authorization 泄露 API Key（严重，安全）**：`fetchJson` 跟随 3xx 时把密钥原样转发到新 URL，跨主机或 https→http 降级时计费凭证被发往非预期主机。根治：首跳（用户显式配置的端点）始终携带密钥；重定向跳仅「同主机且全程 https」保留，其余剥离并经 `warning` 显式告警。
  - **refreshBalance 无并发去重（高）**：并发触发时慢失败覆盖快成功 / 旧数据覆盖新数据（last-writer-wins）。根治：新增 `balance-scheduler.js` 编排模块——in-flight 去重（并发共享一次请求）+ latest-sequence 守卫（只有最新请求结果写 cache/推送）。
  - **持久失败 30s 无限重试（高）**：密钥错误/断网时每 30s 两发 HTTP 永不停歇。根治：指数退避 30s→1m→2m→5m 封顶，成功清零，禁用状态不重试，退出前统一清理。
  - **默认模型价估实际会话费用，最大 3x 偏差（高）**：prices 取 settings 默认模型档套到会话全部 token。根治：主进程每次推送**全模型价目表 `priceTable`**（同一时刻求值），适配器 usage 携带 `model`，客户端按会话真实模型选档；会话模型不可知时明确标注「按默认模型 X 单价估算（会话实际模型未知）」，绝不假装精确。
  - **peak 与 prices 两次独立 `new Date()` + 切换点不检查（中）**：临界秒 chip 文案与计价档可能自相矛盾，且旧版期 `isPeakHour` 也返回 true。根治：编排层取单一 `now` 传入三个函数（签名支持 date 参数）；`isPeakHour` 在峰谷生效节点（2026-08-16 16:00 UTC）之前恒 false。
  - **pickUsageWindow 把 percent:null 转 0（中）**：`Number(null)=0` 使「未知用量」显示成「0%」。根治：`percent == null ? NaN : Number(...)`，非有限一律保持 null。
  - **超时为 socket 空闲超时、1MB 上限按字符计（中）**：slow-drip 服务器可长期保活绕过 15s；多字节内容实际可超 1MB。根治：跨重定向共享 deadline 的总超时 + socket 空闲双保险；按 `Buffer` 字节累计上限。
  - **readCredentialLine 逐行正则不区分 YAML 段（中）**：嵌套段同名键可能读到错误密钥。根治：只匹配列 0 顶层键，支持引号值/行尾注释/正则元字符键名。
  - **http 端点明文传输无提示（中）**：显式支持 http 代理但密钥明文过网。根治：结果携带 `warning`，主进程记日志，README 提示仅建议本地代理。
  - **格式化余额字符串静默清零（中）**：`Number("1,234.56")=NaN→0`。根治：`parseAmount` 剥离千分位/货币符号、负数钳 0、脏数据显式告警。
  - **sessionCost 无下限保护（中）**：负 token 产生负费用。根治：逐桶 `Math.max(0, …)`。
  - **OpenCode URL 硬编码无环境覆盖（中）**：代理场景必走公网。根治：`OPENCODE_USAGE_URL` 环境变量覆盖。
  - **低危项全部修复**：`money` 格式化边界（0→"0.00"、超大→本地化不出现 `1e+21`、非有限→"—"）；外链 `rel="noopener noreferrer"`；`goUsageText` 全空返回 null 不再渲染空白 chip；`readActiveModel` 逐行状态机锚定段（前缀相似段/深层嵌套同名键不误匹配）；refreshBalance 内 settings 双读合并为单读；IPC 双通道重复投递改为「处理器只触发不返回数据 + 客户端只消费事件 + 页面内已收推送不再重复触发」；数组子元素补稳定 key 消除 React dev 告警；价目表 `PRICING_MODELS` 统一维护。切换瞬间价格跳变（低）经评估为官方整点计费口径本身，保持整点切换并保证显示与计价档自洽（见 `docs/balance-architecture.md` §7）。
  - **测试体系**：新增/扩充 79 项 node:test 断言——`unit-balance`（21：峰谷临界点 ±1ms、顶层键锚定、段锚定、金额解析矩阵、端点覆盖、重定向端口归一）、`unit-balance-scheduler`（14：节流/去重/stop 守卫/退避重试/单一 now/设置单读/禁用短路）、`integration-balance`（16：真实回环 HTTP/HTTPS mock——重定向密钥剥离矩阵、slow-drip 总超时、字节体积上限、http 警告）、`edge-client`（19：vm 沙箱加载真实产物，token 归一化矩阵含 [BUG] 回归用例）、`unit-openai-compat`（9：适配器 DISJOINT 契约端到端 + 缓存字段规整）+ **真实环境验证 `verify-balance-renderer`**（16：仓库自带 Electron 在隐藏 BrowserWindow + 真实 React 18 + 真实 DOM 中加载 client.js 产物，全程零网络、userData 指向临时目录、绝不触碰真实 ~/.dsh）；存量 `verify-balance-dock` 17 项断言保持通过，合计 112 项全部通过。全量测试目录仅剩 2 项与本改动无关的既有环境前提失败（`unit-updater` 的 activeVersion 两项断言依赖「本机无 bundled agent」，在干净检出通过、带 node_modules 的开发检出受本机 dsh 版本影响）。
  - **文档与打包**：新增 `docs/balance-architecture.md`（数据流/载荷契约/token 契约/安全边界/编排语义/缺陷映射表）；README 余额段更新（3 分钟轮询、峰谷价目表、新环境变量、http 告警）；`balance-scheduler.js` 纳入四个 electron-builder 配置的 files 清单与 `check-syntax.js` 语法门。
- **余额显示链路加固——全量 review 修正**：
  - **`balancePrices.<model>` 覆盖现作用于价目表（修复功能回归）**：原实现把用户单价覆盖只并入 `prices`（默认模型档），而客户端按会话真实模型优先走 `priceTable`，导致「真实跑该模型的会话静默忽略覆盖」。现覆盖统一合并进 `priceTable`，`prices` 恒等于 `priceTable[默认模型]`，定价单一真源；`unit-balance-scheduler` 断言同步更新。
  - **`mapUsage` 缓存字段 Number 规整**：`cacheReadTokens`/`cacheWriteTokens` 原样透传，provider 返回字符串会破坏 DISJOINT 三桶不变量、垃圾串会产出 `inputTokens=NaN`。现经 `toFiniteTokenCount` 规整（仅接受非负有限数，其余忽略），并补「数字串/垃圾串」断言。
  - **OpenCode Go 告警可见性**：http 明文 / 重定向剥离密钥的 `warning` 原落在 `opencodeGo.warning` 但既不记日志也不展示，现 `apply` 补记日志，与余额侧一致。
  - **latest-sequence 守卫口径修正**：该守卫在当前 API 下恒真（in-flight 去重已杜绝并发多请求），属防御性兜底；补「stop() 期间在途请求不推送」单测覆盖其可达的 `!stopped` 分支，架构文档与测试头注释如实标注。
  - **低危收口**：纯浏览器兜底价 `FALLBACK_PRICES` 对齐默认模型 deepseek-v4-pro（原为 flash，低估 3x）；重定向同主机判定改为 hostname+port（默认端口归一化）；`disabled` 退化形态补齐契约字段；`queryBalance` 对非对象响应加守卫 + 去重 `parseAmount` 调用；fetchJson 重定向清理本跳 socket 空闲定时器；React 数组子元素 key 修正（消除残留 dev 告警）；`verify-balance-renderer` 防御性清除 `ELECTRON_RUN_AS_NODE` 并加 `--disable-gpu`（无 GPU 环境可复现）。
- **内置插件市场 zat-dsh-engine 默认移除（社区反馈：默认不要带旧引擎市场）**：`COMPANION_PLUGINS` 移除 `plugin-market`（`assets/plugins/zat-dsh-engine` 目录随包删除），内置市场统一为 dshmarket（设置页入口不变）。存量 profile 里已装配的旧市场副本由 `retireZatEngine` 一次性清理（profile node_modules 目录 + manifest bundles 登记），settings 标记 `zatEngineRetired` 保证只清一次——之后用户从 dshmarket 主动重装不受影响。
- **内置 Agent 预设保护（更新不再覆盖用户改过的 `assets/agent-presets`）**：用户直接修改安装目录内置预设后，客户端更新（NSIS/portable 覆盖安装）会整体替换 `resources/app` 把改动冲掉。现更新安装前把「用户改过」的文件快照到 `userData/preset-guard/backup`（覆盖安装不触碰 userData），新版本首次启动自动恢复（官方改过同一文件时用户版优先）；基线按版本管理（`preset-guard/baseline.json` 记逐文件 sha256），官方改动与用户改动始终可区分，下一轮更新仍能正确检测。更新未实际发生时快照自动丢弃。新增 `scripts/lib/preset-guard.js` 纯函数模块 + 9 项单测。
- **agent 更新回退失败后静默卡住**：overlay agent 启动失败弹窗的「回退到内置版本并重试」分支直接调用 `updater.rollback()` 且无异常保护——回退本身失败（overlay 目录被安全软件/句柄锁定）时异常成为 unhandledRejection，用户点击后应用无任何反应、静默卡在失败页。现回退包 try/catch，失败显式弹「回退失败」错误框（说明文件可能被占用）并给「重试回退 / 退出」两个出口。
- **profile bundle 装配链根治性重构（「declares no dsh.bundle」一类启动失败不再依赖锚点补丁）**：`dsh.profile.bundles` 中任何一条登记不满足 dsh 装配契约（包未安装 / 未声明 `dsh.bundle.patch` / 补丁层缺失或损坏 / 入口文件缺失），官方 `dsh-app-boot` 即 fail-loud 以退出码 1 启动失败。此前唯一防线是启动前对 dsh 构建产物做字符串锚点改写（跳过 + 诊断），锚点随 dsh 版本变化失配即静默失效——用户反馈的 `profile bundle "dsh-hub" declares no dsh.bundle`（纯客户端 bundle 被登记进 profile.bundles）正是该形状，且入口缺失形状（loader 激活期 `plugin tree failed to load`）在防护覆盖范围之外。本次重构把「启动前把 manifest 对账到可装配状态」收口为唯一实现 `scripts/lib/profile-reconcile.js`（main.js 与 `sync-companion-plugins.js` 共用），运行时防护保留为纵深防御：
  - **全量逐条校验**：每条 bundles 登记按与 dsh 装配契约一一对应的 11 种失败码校验（登记名非法 / 包未安装 / 未声明补丁层 / 补丁层越界·缺失·不可解析 / 入口越界·缺失·指向目录 / client 入口越界·缺失，补丁层用与 dsh 相同的 entry-list YAML 方言解析；client 入口校验与上游 `verifyBundleDir` 新增的 `exports["./client"]` 校验同语义、文案逐字一致，并在对账侧收口为结构化失败码）；无效且非核心的登记**从 manifest 移除**并写入隔离记录 `dsh-desktop.broken-bundles.json`（移除原因 + 时间，重装插件重新登记即恢复，恢复健康后记录自动清除）；核心 bundles（`@deepseek-ai/dsh-base` / `dsh-web-app`）校验失败绝不移除（核心缺失是安装损坏而非数据问题，保留并由启动防护兜底跳过 + 告警）；
  - **校验实现单一化**：`profile-bundle-heal.js` 提取 `inspectBundleDir` 为唯一结构化校验实现（`verifyBundleDir` 变为兼容包装，文案与契约不变），对账与同步侧防呆共用同一判定语义；
  - **家级补丁层启动前预检**（`healHomePatch`）：`$DSH_HOME/cordis.patch.yml` 损坏此前只由 profile-boot 锚点补丁兜底，现启动 dsh web 前用同一方言预检，损坏 → 备份 `.broken-<ts>` + 重置为最小合法文件；
  - **既有语义逐项保留**：损坏 manifest 备份重建（.broken-<ts>）、核心补齐（issue #16）、配套登记追加、源缺失/卸载标记移除、重置后用户 bundle 恢复（issue #48）与全部日志文案不变；健康 manifest 零写入（幂等），写入全部原子化；
  - **CLI 同步收口**：`sync-companion-plugins.js` 的 manifest 段改用同一对账实现（`initMissing=false` 保持「不凭空创建 manifest」历史契约；损坏 manifest 在核心可解析时同样备份重建，dry-run 输出计划）；
  - **测试**：新增 `unit-profile-reconcile` 25 项单测（含两个真实 `dsh-app-boot` 复现测试——无效登记在官方 `loadProfile` 下必崩、对账后正常装配）；集成场景 `heal-missing-bundle` / `heal-manifestless-bundle` / `heal-broken-bundle-patch` / `heal-broken-home-patch` 断言更新为「移除 + 隔离记录 + 正常启动」，新增 `heal-entry-missing-bundle`（防护覆盖不到的入口缺失形状）；`check-syntax.js` 纳入新模块。
- **全量 review 修正（装配对账判定与 dsh 官方契约逐字对齐）**：
  - **补丁层条目级校验**：dsh 官方 `parsePatchList` 要求补丁层「顶层数组且每项为映射」，原校验只查顶层数组——`- 42` / `- "x"` / `- [1,2]` / `- null` 等畸形文件会被判健康、dsh 装配时仍 fail-loud。`inspectBundleDir`、`healHomePatch` 与 `healProfilePatch` 现共用 `isPatchListValid`（与官方逐字同构）判定；
  - **包解析与官方同构**：`validateBundleEntry` / 核心可解析判定改用与 `resolveBundleDir` 相同的 `createRequire.resolve.paths` 探测（含 NODE_PATH 与全局 node_modules）——此前 `packageDirUpward` 探测不到 NODE_PATH/全局安装的包，会把官方实际能装配的健康登记误判 UNRESOLVABLE 而误删；
  - **配套登记与恢复登记复检**：`addNames` 追加与 issue #48 恢复的登记此前只经 `verifyBundleDir`（不查补丁层可解析性），YAML 损坏的配套/恢复 bundle 会留下一个「仅靠运行时防护兜底」的启动窗口；现追加前/恢复后统一过 `validateBundleEntry` 复检，失败 → 不登记/移除 + 隔离记录。
- **全量 review 第二轮修正（对账语义收口与记录生命周期）**：
  - **入口文件必须是普通文件**：`inspectBundleDir` 的入口校验由 `existsSync` 升级为 `statSync().isFile()`——入口路径指向目录时（`main: "./lib"` 等形状）存在性检查会放过，而 dsh Loader 用 ESM `import()` 激活入口必然 `ERR_UNSUPPORTED_DIR_IMPORT`（防护覆盖不到的崩溃形状），现判 `ENTRY_MISSING` 并在启动前移除登记；
  - **策略性移除不进隔离记录**：配套源缺失 / 插件管理「卸载」标记的登记由步骤 4/6 按「用户意图禁用」移除，不再被步骤 2 判 UNRESOLVABLE 写入隔离记录（卸载/源缺失是用户意图而非无效登记，避免记录误导；CLI 同步同步补上 `removedBundles` 与 `excludeFromRecover`，与 main.js 口径完全一致——此前 CLI 不会把已卸载配套从 manifest 移除，且重置恢复可能把用户已卸载的配套重新登记）；
  - **隔离记录同轮清除**：`addNames` 登记成功与重置恢复成功时，同名历史隔离记录当轮即清除（此前要等下一次启动的步骤 2）；
  - **记录写入去重**：同 code + reason 的既有隔离条目不重写（保留首次 `removedAt`，持续损坏状态不再每次启动重写记录文件）；`addNames` 校验失败不再对未改动的 manifest 做内容相同的重写；
  - **健康检查口径统一**：`logProfileBundleHealth` 改用与对账相同的 `resolveBundleDirLike` 双锚点解析，消除「对账判定可解析、健康检查误报缺失」的口径撕裂（诊断只读）；
  - **重复登记去重**：同一 bundle 名在 `dsh.profile.bundles` 中登记两次时，其补丁层条目会重复出现在组合 entry list 中，loader 装配期抛 `duplicate loader entry id`（fail-loud → 退出码 1），且启动防护覆盖不到（两层都能正常加载）——现对账保留首次出现、移除重复项（冗余而非无效登记，不进隔离记录），该形状此前从不清理；
  - **测试环境封闭**：`unit-sync-cli` 的 CLI 调用 PATH 收口到 System32——CLI 的 `findDshPackageDir` 会经 PATH 探测 `dsh` 命令，环境 PATH 上的真实 dsh（如 harness 安装）会被当作预设同步目标，把 `assets/agent-presets` 写进真实安装（内容相同、mtime 被改写）；测试必须封闭，绝不触碰真实环境。
- **防护层修复（issue #97/#98/#99/#100，另含 #75 补强）**：社区批量上报的「防护罩有洞」问题逐一修复——
  - **插件 GitHub Release 多资产选择（#97）**：原实现 `isWinAsset` 用子串匹配（`darwin` 含 `win` 会误判为 Windows 资产，选中 macOS 二进制）、无架构优先级（`win-ia32` 与 `win-x64` 乱序时选错）、无归档时可能选中 `.sha256` 校验和文本。现收口为纯函数 `selectReleaseAsset(assets)`：词边界平台判定（`win32-x64.tgz` ✓ / `darwin-x64.tgz` ✗）、架构优先级（x64/amd64 → arm64/aarch64 → ia32/x86 → arm → 无架构兜底，稳定排序）、任何阶段排除校验和/签名/说明等非二进制文件（含无扩展名 `SHA256SUMS`/`SHA512SUMS` 与 `.sha1`；全部被排除 → 明确拒绝更新并提示），10 项单测；
  - **语法门禁剥离器支持正则字面量（#98）**：`check-syntax.js` 的字符串/注释剥离器不识别 JS 正则字面量——含引号的正则（如 `/[&<>"']/g`）会把引号当字符串起始，与后方引号配对将中间真实代码整段涂白，门禁对「孤立 async」失明（实测 preload.js 77.2% 被涂白、19 个 function 被吞）。现新增 `scanRegexLiteral`（跳过转义与字符类、拒绝跨行伪正则、闭 `/` 后按 flags/除法链判定）整体涂白正则字面量；补除法链识别（`a / /re/g` 第一个 `/` 按除法跳过，`return /re/` 等关键字后接正则按白名单放行）、flags 白名单含 ES2022 `d`/ES2024 `v`；并给门禁加 preload.js 失明硬断言（保留率 <23% 或 function 被吞 >5 即 FAIL 且报错注明触发项，正常基线 ~29%/吞 1 字符串内文本），26 项单测（含 mid 注入回归，防 EOF 特判假绿）；
  - **防砖体检 manifest 读取失败假绿（#99）**：`desktop-validity.js` 的 `validatePlugins` 用 `catch {}` 静默吞掉 profile `package.json` 读取/解析失败——启动清单读不到时清单内缺陷全部降级为 warning，体检返回「未发现问题」（假绿）。现显式记录 `manifestError`、总结论判定失败（含 `dsh.profile.bundles` 字段存在但非数组的结构损坏变体；字段缺失仍视为合法空清单），设置页体检区红字提示「无法读取启动清单，体检结果不可信」，4 种情形回归测试（缺失/损坏 JSON/bundles 非数组/正常）；
  - **补丁条目 id 负向断言漏掉行内空白（#100）**：`togglePluginInPatch` 的条目定位负向断言 `(?![A-Za-z0-9_.-])` 对行内空格放行——非标 id `- id: foo bar` 会被 `toggle('foo')` 命中误加 disabled（insert 内层更会被整条误删）。负向断言加入空格/tab（只排除行内空白，不排除 `\n`——排除换行会让所有既有条目匹配不上退化为重复新建），3 项回归测试；
  - **行注释内引号吞代码（#75 补强）**：剥离器此前不处理 `//` 行注释，注释内的引号会被当字符串起始吞掉后续代码（漏报比误报更危险）。现行注释整体涂白到行尾（保留换行），8 场景探测全过。
- **主窗口位置记忆（重启后回到用户放置的位置）**：主窗口关闭时持久化屏幕坐标与尺寸，下次启动恢复到用户上次放置的位置（跨屏校验 + 钳制回可视区），不再每次居中
- **会话删除守卫改为实时查询运行状态**：删除非当前会话后补回输入框焦点（修复光标消失仍可输入的边界问题），修复删除后输入锁死与误弹失败提示
- **清单 id 对齐 loader id 修复双登记崩溃（#104）**：插件清单 id 与 cordis loader id 不一致导致 `duplicate loader entry id` 启动失败，现统一对齐；side-session 升级 v0.3.0
- **卸载器清理加固（P0-P8）**：自定义卸载器全面加固——进程关闭重试策略、目录删除重试、注册表清理完整性、快捷方式清理全覆盖；dist 脚本自动构建卸载器（`predist` 钩子）；卸载二次确认弹窗防误操作
- **侧边临时会话透传服务端 error 字段**：模式 1 默认配置报错时正确展示服务端返回的错误信息，而非只显示「HTTP 502」；`deepseek-official` 供应商解析修复
- **WSL 清理命令双重登录 shell 嵌套与失败清理超时**：WSL 后端清理命令不再嵌套多余的 `cmd /c`，失败清理流程超时兜底
- **会话持久化容错增强**：进程中断留下的 zstd frame 尾部半截 JSONL 容错处理——只允许最后一个 frame 进入 torn-tail 截断/重放流程，中段损坏继续拒绝，覆盖内置 / profile / agent overlay 三份运行副本
- **自动更新 null 版本兜底 + keyed slot 注册错误隔离**：版本比较对 null/undefined 安全兜底；keyed slot 注册缺少 key/id 时容忍而非崩溃
- **打包白名单补齐 plugin-guard 依赖链**：`profile-module-heal.js`、`patch-row-heal.js`、`plugin-guard.js` 纳入四个 electron-builder 配置的 files 清单，防止启动期自愈链路因文件缺失而崩溃

### 优化
- **启动与运行性能系统性优化**：① 启动冒烟门禁与打包 `require` 完整性校验（`boot:ready` 时序标记 + `bench-baseline.json`）；② 补丁代际签名——签名命中跳过 18 个文件补充；③ koffi 预检异步化——boot 不等待，`startAndShow` 有界等待 3s 决定 overlay；④ SessionWatcher 句柄收敛——仅活跃会话 watch，冷会话复活才 scan；⑤ 会话根索引头部读取替代全目录扫描（TTL 失效增量重扫）；⑥ 非关键功能延后启动——会话监视器/余额轮询延至首屏稳定后 500ms；⑦ 长时内存观测——10 分钟采样后端/渲染 RSS 环形落盘；⑧ 崩溃转储清理增加数量上限（保留最近 5 个 + 最新豁免）；⑨ 无运行中会话时兜底扫描降为 0s；⑩ M3 设置页 observer 导航门控——离开设置页即断开；⑪ settings.yaml 写后校验与自动回写防损坏；⑫ NSIS 显式 lzma 压缩并关闭 solid 字典共享
- **agent 更新检查去 npm CLI 化**：纯 HTTPS dist-tags/版本探测，不再 spawn npm 子进程，启动更快
- **客户端更新检查双源并行 + 1h 窗口缓存 + 失败退避**：GitHub + Gitee 同时查询取最高版本，1 小时内不重复检查，失败后指数退避
- **余额轮询最小化暂停 + 凭证 mtime 缓存 + HTTPS_PROXY 支持**：窗口不可见时暂停轮询，凭证文件未变化时跳过重读，支持系统代理
- **自更新 SHA256SUMS 强制校验（fail-closed）**：下载完整性校验不通过即拒绝安装，不再静默放行
- **统一日志轮转（5MB 双代滚动）**：覆盖 desktop/web/watchdog 日志，不再无限增长
- **LLM 错误落盘与透出**：`llm-errors.jsonl`（5MB 环形缓冲），诊断模型小节可在设置页查看
- **replayState 降级补丁**：legacy 会话续聊失败回落 foreignAssistant 模式，不再直接报错
- **页面错误节流 + 图标 memo + 启动超时单常量**：减少渲染进程无效工作

## [0.3.10] — 2026-08-17
### 新增
- **插件中枢 dsh-hub v1.1.3 + 内置 graph-memory 与 dshmarket（知识图谱记忆 + 可视化插件市场）**：dsh-hub 对齐上游 ARFCON/dsh-hub-DSH v1.1.3（卸载 entry-id 顺序修复 1.1.2 内置时已同步，本次仅版本对齐 + 内置装配适配）；内置并随壳自动装配两个挂载目标——**graph-memory v1.6.0-beta.1**（adoresever/graph-memory 作者为 DSH 重新发布的原生适配版：跨会话知识图谱记忆，自动抽取三元组、PageRank/社区检测、向量去重与召回注入，SQLite 存储 `~/.dsh/graph-memory/graph-memory.db`；依赖 `@photostructure/sqlite` 原生模块随包分发全平台 prebuild，`dist/dsh.js` 入口 + `cordis.patch.yml` 完整声明）与 **dshmarket v1.11.1**（dsh-market/dsh-market 可视化插件市场：浏览/搜索/一键安装社区插件，`js-yaml` 依赖随包 vendored）。两者走配套插件通道（`COMPANION_PLUGINS` + 同步器）注册进 profile bundles；dsh-hub 中枢页适配内置装配——源码检测新增「随壳内置」分支、装配判定放宽（companion 同步是真实目录而非 link junction），设置页显示「内置 vX」与已装配状态，无需手动 clone plugin-src 源码
- **工作区锚点（workspace-anchor）**：新增 `@deepseek-ai/dsh-workspace-anchor` 配套插件，在每个 agent 的稳定 system prompt 中注入约 70 token 的 `{{cwd}}` 工作区偏好（默认在 cwd 内编辑/构建/交付、优先相对路径、允许读取/搜索任何位置但不得把搜索命中的外部目录当作新项目根、仅当用户显式指定或确有必要时才离开 cwd 并随后返回）。纯提示词偏好，不改变任何权限/沙箱行为。`minimal-win`、`anchored-standard`、`zero-anchored-standard`、`whoami-standard`、`warmupbetter`、`warmupbetter-replay` 六个 complete-persona 预设因会丢弃插件注入节，已在各自的 `agent.cordis.yml` persona 文本中直接写入同一锚点；`standard` / `code` / `router-standard` / `v4-flash-godmode-opencode-go` 等非 complete 预设由插件节覆盖
- **macOS 版客户端自动更新（多操作系统支持）**：此前客户端自更新仅 Windows（安装版/便携版），macOS 入口降级为手动下载。现 macOS 走独立链路——资产选择支持 `DSH-Desktop-<版本>-macos-<arch>.zip`（优先，免挂载自更新）/ `.dmg`（兜底，hdiutil 挂载）及 Gitee 分片（`.partN` 按序拼接）；更新脚本（bash，纯 ASCII，系统自带工具零依赖）等待旧进程退出 → `ditto` 解压 → 备份 `.bak` → 同卷 `mv` 原子替换 `/Applications/DSH Desktop.app`（`ditto` 复制兜底）→ `xattr -dr com.apple.quarantine` 解除隔离（未签名构建首次启动不被 Gatekeeper 拦截）→ `open` 重启；替换失败自动还原旧版并启动，应用绝不消失。平台判定支持 `DSH_DESKTOP_PLATFORM` 强制（仅资产选择等纯函数），新增 5 个 macOS 单测（zip/dmg 直选、arm64 架构、分片排序、模板 ASCII 结构、平台判定）
- **设置页「插件」页融合为单一「管理」标签（`dsh-plugin-manager`）**：启动时幂等隐藏官方只读「全部」清单（`applyPluginInventoryTabMergeFix` 过滤 `settings.plugins.tab` 中 id 为 `all` 的条目），管理标签成为唯一插件入口——**搜索框**（按名称/包名/描述过滤）+ **可点击分类标签**（配套插件可开关 / 其他插件可开关 / 核心组件只读，点击过滤、再点取消，各组显示启用/关闭计数）+ **双视图**（简洁：卡片网格——标题+状态圆点+迷你开关，窄屏自动单列；详情：+状态徽章+中文描述）+ 全量 live 清单与本地清单融合（描述取自各插件 package.json）+ **乐观 UI 开关**（点击立即翻转并标记「重启后生效」，写盘失败自动回滚；反复开关不堆积标记注释）。关闭/重新打开写入 web profile `cordis.patch.yml` 的用户层 `disabled` 条目（与 `llm-deepseek` 同款覆盖机制，同一 id 只保留一处，避免 loader 双登记崩溃），完全退出并重启 DSH Desktop 生效。解决「插件看不懂作用、默认启用无法关闭」的社区反馈
- **插件卸载/恢复**：详情视图每行「卸载」按钮（两步确认防误删）。内置配套插件 = 标记卸载（patch 写入 `removed: true`，启动同步器据此跳过文件复制与 manifest 装配，列表「已卸载（可恢复）」分组一键恢复）；第三方插件 = 标记 + 删除 profile 安装目录（不可恢复）；核心组件与带 config 的系统条目（`web`）禁止卸载
- **插件更新检查与手动更新（双下载源）**：工具栏「检查更新」→ 有独立发布源的插件显示「可更新 vX → vY」与「更新」按钮，点击后 下载 → sha512 校验（npm 源）→ 备份旧版 → 解压替换 → 重启生效，失败自动回滚。下载源：npm 官方 `registry.npmjs.org` + 镜像 `registry.npmmirror.com`（自动切换）、GitHub Releases 官方直链 + 加速镜像（`gh-proxy` 系列）；暂列 `dsh-better-sidebar`、`billion-context-dsh`（npm）与 `dsh-side-session`（GitHub）三个有公开发布源的插件，其余第一方插件随应用整体更新（应用更新本身已是 GitHub + Gitee 双源）。启动同步器新增「profile 版本高于安装包版本则保留」，更新后的插件不会被下次启动覆盖回安装包版本
- **插件管理界面打磨**：「可更新」分类标签仅在有可更新项时出现（全部更新完后自动回到「全部」）；工具栏按钮组重排（简洁/详情切换高亮、检查更新为主操作样式、刷新按钮统一）；操作结果提示条、分组标题（组名+说明+计数）与空态框统一样式；修复「已卸载（可恢复）」分类切换导致页面空白的问题（分组标题映射补全 `removed` 键，并对缺失映射做兜底防崩溃）
- **余额栏峰谷计价提醒（dsh-balance）**：对话底部统计栏左侧新增峰谷状态可见提示——高峰时段显示橙色「⛰ 高峰价」，空闲时段显示绿色「🌙 空闲价」，hover 完整说明（高峰价 = 北京时间 9:00-12:00 / 14:00-18:00 全价；空闲价 = 高峰价的一半）。主进程推送的 `peak` 字段按当前时刻实时判定（`isPeakHour`），本轮费用随时段自动切换单价（高峰全价 / 空闲半价），无需用户手动换算
- **识图插件多模态体感：直接发图/发文件、后台自动识别、识别结果不进对话（dsh-vision）**：输入框工具行新增「📎 添加图片或文件」按钮（外观与官方「/」命令按钮完全一致，也可粘贴/拖放图片），图片按官方附件链路进入草稿并随消息发送；**文本类文件（60+ 扩展名：md/json/csv/ts/日志/配置/脚本…含 Dockerfile/LICENSE 等无扩展名约定名）选入即读取内容、截断后追加进草稿**，发送前可见可编辑，二进制/超限文件明确提示。宿主半边在 `llm/stream` 边界拦截请求中的图片块（比 `agent/pre-step` 更靠后：只改写**送进模型的消息副本**，会话里持久化的仍是原始图片消息），调 VLM 识别后替换为「[图片] 识别结果」文本（多图自动编号 1/N；用户消息文本自动作为识别问题；识别失败/超限/附件异常一律降级为说明文本，绝不阻断对话）——**用户界面始终显示图片卡片，识别文本永不回流对话**，纯文本模型全程只见文本，发图体验与多模态模型一致。识别结果按附件 id 缓存（同图跨轮不重复请求）；`view_image` 工具与自动识别共用同一模型/备用链/超时/降档配置

### 修复
- **内置插件市场 dshmarket 客户端 bundle 未同步 → dsh web 启动失败（MissingClientBundleError）**：配套插件同步的目录清单此前只有 lib/assets/src/dist/node_modules，dshmarket 的客户端构建产物在 `client/`、运行时数据在 `data/`（`exports["../client"]` 声明入口），落盘缺失让 client-modules 装配 fail-loud 直接启动失败。现目录清单补 `client` 与 `data`；`verifyBundleDir` 增加 client 入口校验（声明了 client 入口的 bundle 必须落盘对应文件，缺失按「源缺失」处理不登记），下次启动自动补齐。新增 3 个单测（client 入口存在/缺失/未声明）。

- **dsh web 启动失败（exit 1）：healProfilesModuleFallback 未捕获 ENOENT 崩溃根治**：官方 profile-boot 装配每次 boot 无条件调用 healProfilesModuleFallback(INSTALL_ANCHOR)（BFS 依赖闭包逐包 readFileSync package.json），客户机器上（便携版解压不完整 / 杀软锁定 / 云同步抽风）会 ENOENT 且无保护——main.js 的 repairProfileFallback 只护壳自己的那次调用，挡不住引擎 boot 内部这次 → 启动失败页。profile-boot 防护补丁新增独立 heal 调用防护：调用包 try/catch，失败仅 stderr 告警「continuing boot without fallback healing」，绝不 brick 启动；幂等标记独立于补丁层自愈标记，已打过旧补丁的安装也会补上。新增 3 个单测，unit-profile-bundle-heal 16/16。
- **图片字节信任补丁（修复「仅支持 PNG、JPG、WebP、GIF」却发不出 png）**：官方 attachment-local 严格比对「浏览器声明的 MIME」与「字节解码出的格式」，声明跟随文件扩展名不可信（webp/jpeg 改名 .png 后 file.type 仍是 image/png，字节却是 webp），不一致直接拒发整条消息。本补丁把声明为 image/* 时的媒体类型改为以字节实际格式为准记录，不再拒绝发送；幂等，覆盖内置/profile fallback/agent overlay 三份运行副本，WSL --with-patches 同步生效。新增 2 个变换单测（真实 vendored 文件幂等 + 锚点缺失跳过）。

- **桌面宠物小窗拖动触发主进程半崩溃（启动崩溃日志 `Error processing argument at index 1, conversion failure from`）**：小窗拖拽过程中 pointermove 在捕获/窗口边缘会给出 NaN 屏幕坐标，渲染端直接相加后经 IPC（structured clone 保留 NaN）送达主进程，旧版主进程仅校验入参 `x/y` 为有限数，`getDisplayMatching` 异常/钳制计算产生 NaN 后直接 `petWindow.setPosition(NaN, NaN)`，触发 Electron native 参数转换 TypeError 把 uncaughtException 冒泡到主进程（IPC 处理中断 → 状态损坏 = 半崩溃）。双层根治：① 主进程 `pet:move-to` 全防线（显示器匹配 try/catch + workArea 逐字段有限数校验 + 钳制结果最终校验 + 整体 try/catch 记录警告，任何非法输入静默忽略，绝不再触发 native 参数转换）；② 渲染端 harness-pet 发送前 `Number.isFinite` 四重校验（screenX/screenY/grabOffsetX/grabOffsetY），NaN 直接跳过本次移动等下一个合法事件
- **识图插件升级后重启被回滚（dsh-vision 0.1.0 → 0.2.0）**：启动同步器按「profile 版本 > 安装包版本则保留」判断是否覆盖 profile 副本，此前 dsh-vision 三处（仓库/安装包/profile）版本同为 0.1.0，每次重启都会用安装包内置旧副本覆盖 profile 上的新部署，服务端修复（llm 服务实例 wrap）因此从不生效。版本升为 0.2.0 后 profile 更新版得以保留；仓库、安装副本、profile 三处已同步为同一新版本
- **识图插件发图修复升级：wrap 改挂 llm 服务实例方法（修复「重启后发图仍失败/图片丢失」）**：此前在适配器层 wrap，但 `llm/adapters-updated` 监听缺 `{global:true}`（cordis 事件只沿作用域祖先链冒泡，插件作用域不在 llm 服务祖先链上）+ 初始调用早于 DeepSeek 适配器注册 → wrap 实际从未生效，发图仍被 prompt 入口拦截。现改为 wrap **llm 服务实例的 `resolveModelInfo` 方法**（host prompt 图片门槛的唯一调用点；llm 服务已在 `inject` 中装配，apply 时必然可 wrap，不依赖适配器注册时序；绑定原方法保留 `this`；幂等标记 + 插件卸载时恢复原方法）。同时消除双重污染：adapter wrap 的 `resolveModel` 改为**只记录原生能力、原样返回**（加 `image` 的唯一入口是服务实例 wrap，两处都加会互相污染原生能力判断，误把文本模型当原生多模态透传原图）；`listModels` 仍加 image（仅 UI 一致性）；`llm/adapters-updated` 监听补 `{global:true}` 覆盖热装配。wrap 生效后 host 侧「图片自动转述」兜底自动跳过（inputModalities 已含 image）——界面显示原图卡片、识别文本只进模型。单测更新：服务实例 wrap 7 项（text-only 放行+原生缓存 / 原生多模态透传 / 未声明原样 / `this` 绑定 / 幂等 / restore 恢复 own+原型两种形态 / 无方法安全返回）+ wrapAdapter 语义更新，dsh-vision 单测 40/40
- **客户端自动更新「下载完成后不弹安装 / 更新脚本终端闪一下」**：① 更新脚本启动全程无窗口（`spawn` detached + `stdio: ignore` + `windowsHide`，覆盖安装版 cmd→powershell 与便携版 cmd）；② 残留安装包清理——已处理（安装成功 / 当前版本已不低于待安装版本 / 文件丢失）的待安装标记现在会**连带删除 updates 目录里的过时安装包与 .part 分片**（每包 120+MB），不再让「下载了却从不安装」的旧包永久占用磁盘、误导用户；③ 手动「检查客户端更新」时**优先处理已下载的待安装包**（弹「立即重启」按钮），不再被 24h 静默期挡住——用户主动检查即表明更新意图；④ 端到端脚本级验证：`buildNsisCmd` + `buildNsisPs1` 生成的更新脚本在真实 `cmd /c` 下秒级走完「启动→等待退出→拉起安装器（失败 catch）→兜底恢复」全部分支并逐行写日志，无静默退出（历史「点安装没反应」根因是无控制台进程下控制台程序输出丢失，PR #46 起已用 PowerShell/.NET 流规避）
- **客户端更新 Gitee v0.3.9 旧命名分片无法选择**：`selectAsset` 的分片兜底此前只按 v0.3.9+ 新命名（`win-portable` / `win-setup`）拼 base，而 Gitee 已发布的 v0.3.9 分片仍为旧命名（`DSH-Desktop-<版本>-portable-<arch>.exe.partN` / `DSH-Desktop-Setup-<版本>-<arch>.exe.partN`），导致 GitHub 不可用回退到 Gitee 时，检查成功但下载报「未找到匹配的安装包资产」。现按 新命名 → 旧命名 顺序尝试，安装版与便携版均能正确排序并拼接 Gitee v0.3.9 分片；新增两个旧命名分片单测，并用真实 Gitee release 验证安装版/便携版均选中 3 分片。
- **工具调用兼容修复（code 模式）**：`PTC 模式`（code preset）下 DeepSeek 模型常直接调用 `read`/`grep`/`todo_write` 等原生工具而收到 `UNKNOWN_TOOL`，且 `run_code` 生成的程序调用 `pwsh`/`bash` 时频繁省略仅用于 UI 展示的 `description` 而收到 `INVALID_ARGS`。现启动时幂等补丁：① 官方 `code` preset 的 tool-presentation 由 `code` 改为 `both`——`run_code` 仍可用，原生工具调用也可直接通过；② `dsh-tool-pwsh` / `dsh-tool-bash` 的 `description` 改为可选，缺失时用 command 首行自动生成。补丁覆盖内置副本 / profile fallback / agent overlay（WSL 同步脚本 `--with-patches` 同步生效），锚点失配自动跳过，不修改用户数据。新增 4 个变换单测与真实 vendored 文件幂等验证。

- **工具调用兼容修复 schema 部分撤销（修复「模型操作失败：unsupported JSON schema: parameters.description.required must be true when present」）**：上一轮把 dsh-tool-pwsh / dsh-tool-bash 的 description schema 改为 required: false，但引擎 schema 校验器拒绝非必填 description——preset 挂载直接失败，选模型/发消息报「模型操作失败」。现撤销 schema 改动（恢复 required: true），只保留运行时兜底（缺省 description 时用 command 首行自动生成，该部分不受 schema 校验约束）；transform 会自动回滚已写入的 required: false（幂等标记识别），并导出 OLD/NEW 常量供单测做「还原后断言」；新增回滚单测，unit-patch-engine 22/22。

- **识图插件发图降级「附件存储服务不可用」（dsh-vision 0.2.1）**：cordis 上下文的服务属性访问有 inject 检查（Proxy trap：cannot get property `attachments` without inject），此前 dsh-vision 未声明该 inject，用 try/catch 可选访问把错误吞成 undefined——每次发图都降级为「附件存储服务不可用（已跳过该图片）」文本进模型，图片识别从不生效。现 inject 显式声明 attachments（宿主 prompt 入口的 saveImage 依赖同一服务，装配时必然可用），apply 直接访问 ctx.attachments；发图识别恢复正常。版本升 0.2.1（仓库/安装副本/web profile 三处同步），重启 DSH Desktop 生效。
- **侧边临时会话大日志解析风暴 → 聊天响应偶发延迟**（dsh-side-session v0.2.4）：面板展开时每 2s 轮询会对整个会话日志做全量 zstd 解压+逐行解析（实测 7MB 压缩 ≈ 20MB 文本 ≈ **600ms 同步阻塞**），会话进行中 mtime 持续变化导致反复全量解析，与聊天请求同进程排队。改为**增量解析**（只解自上次帧边界以来的新帧并累计，结果与全量解析逐字节等价；文件整体替换自动回退全量）+ 客户端**全量拉取 4s 节流**（切换会话立即拉取）。新增 6 个增量/全量等价性单测
- **侧边临时会话升级 v0.2.5（合入上游更新）**：左侧栏图标对齐、浮窗展开/收起动画档位（0/300/500/800/1200ms，默认 500）、输入框与发送按钮样式与主会话同款、移除「停止回答」按钮；服务端**热重载自愈**（`settings.registrations.delete(NS)` + 路由重注册，开发热重载后不再残留重复注册）。保留本地增量解析与 4s 拉取节流。版本号定为 0.2.5 与上游 0.2.4 区分
- **桌面宠物默认关闭（插件级）**：harness-pet 常驻 canvas 逐帧绘制在软渲染/流式输出下持续占用主进程，且旧版保存的开关值会覆盖客户端默认关闭。现启动同步时幂等写入 profile patch `- id: harness-pet\n  disabled: true`（一票否决任何已保存状态），需要时在 设置 → 插件 → 管理 一键开启
- **更新后桌面快捷方式消失**：安装版（NSIS）此前依赖安装器创建桌面快捷方式，壳层只在便携版下补建——安装版更新（向导取消勾选创建 / 旧版卸载清理 / 手动覆盖安装目录）后桌面快捷方式缺失且永远不会自愈。现壳层对**安装版与便携版一致**地「缺失即补建」规范名 `DSH Desktop.lnk`（去重逻辑先行，桌面上至多保留一个，不会复现旧版「每次启动生成多个快捷方式」），并修复快捷方式指向被移动/更新后的 exe。另给 `maintainShortcuts` 加 `DSH_DESKTOP_TEST=1` 显式守卫：集成测试（dev electron 以文件路径启动时 `app.isPackaged` 也为 true）不再把用户真实快捷方式改指向测试用 electron.exe
- **profile bundle 缺失 / 损坏导致 dsh web 启动失败（退出码 1）根治 + 重启丢插件数据恢复（issue #48）**：dsh 官方装配对 `dsh.profile.bundles` fail-loud——登记了未安装的插件抛 `cannot resolve profile bundle`、普通库或仅客户端 bundle 被登记抛 `declares no dsh.bundle`、bundle 的 `cordis.patch.yml` 损坏抛 `failed to parse overlay`、profile `package.json` 损坏直接抛 JSON 错误、家级 `cordis.patch.yml` 损坏抛 `failed to parse patches`——任一命中桌面端永久无法启动。四层修复：
  - **启动防护**（`applyProfileBundleGuard`，幂等运行时补丁，dsh 更新后自动重打）：改写 `@deepseek-ai/dsh-app-boot` 的 `loadProfile`——bundle 层逐个跳过并写带修复指引的 stderr 诊断；profile manifest 损坏则备份 `.broken-<ts>` 后按出厂模板重建；改写 dsh `profile-boot` 装配——家级补丁层与 profile 补丁层损坏时备份 + 重置为空列表（同时覆盖启动与 HMR 热重载路径）。用户数据只备份不删除，重装插件即恢复。
  - **写盘侧防呆**：配套插件同步在 bundle 落盘后校验「补丁层 + 入口文件」存在才登记进 manifest（`billion-context-dsh` 上游缺 `dist` 构建产物时不再登记，杜绝整棵插件树加载失败）；profile manifest 损坏时先备份原文再重建；manifest 写入全部原子化（消除写盘撕裂这一损坏来源）。
  - **用户插件数据恢复**（issue #48）：manifest 损坏被重置后，用户手动安装的第三方 bundle 仍实际落在 profile node_modules 里——启动自愈会扫描、校验并把它们合并回 manifest（`bundles` + `dependencies`），用户插件照常装配；普通依赖与损坏包不恢复登记。同时弹「配置自愈」系统通知（集成测试态抑制），不再静默。
  - **启动前健康检查**：`dsh web` 启动前把每个 bundles 条目的装配状态落到 `desktop.log`（缺失 / 未声明 / 补丁层缺失一目了然），`dsh-web.log` 保留完整 stderr 诊断。
  变换与恢复逻辑收口为纯模块 `profile-bundle-heal.js`（`node --test` 单测 13 项 + 7 个新集成场景：heal-missing-bundle / heal-manifestless-bundle / heal-broken-manifest / heal-broken-manifest-recovers / heal-broken-home-patch / heal-broken-bundle-patch / companion-bundle-invariant）。
- **宠物插件流式输出期间界面卡死（「半崩溃」）根治**：dsh 客户端运行时对会话快照按帧合并推送（`Notifier.markFrameDirty` 每帧至多一次，长回复/工具调用期间持续触发），harness-pet 每次快照都跑完整状态映射 + 6 处 DOM 写入 + 320×320 canvas 整幅重绘 + 强制 reflow（`offsetWidth/offsetHeight`），软渲染/低配机上渲染进程主线程饱和。三处修复：① 快照 listener 120ms 节流 + trailing 合并（流式期间每 ~120ms 处理一次最新快照，60Hz 输入实测降到 ~8Hz，不丢尾）；② `setStatus` 内容相等早退（状态/标题/回复都没变时跳过全部 DOM 写与重绘，静态期零开销）；③ `updateStatus` 的同步 `render()` 改为仅在动画循环未运行（关闭/减少动态效果）时绘制，消除 rAF 动画与快照重绘的双绘制源
- **运行时补丁引擎与配套插件同步统一收口（PR #51）**：12 个运行时补丁（闪跳修复 / 设置暴露 / 识图密钥 / profile bundle 防护 / workspace 搜索栏 / 插件页标签合并 / web-search baseURL / menu 视口 / 会话管理）与配套插件同步（清理 / 复制 / bundle 登记 / patch 条目注册 / 默认禁用）收口为 `scripts/lib/` 单一实现（patch-io / patch-engine / companion-plugins / companion-profile / runtime-patches），main.js 与 `sync-companion-plugins.js` 共用同一数据源，杜绝两处实现逐步漂移；WSL·overlay 覆盖缺口补齐（识图 / web-search / menu / 会话删除 / 插件页标签在 WSL 更新分支同样应用）；`dshDesktop.appVersion` 回填与菜单 IPC 防未处理拒绝；补丁候选路径构造器新增单测逐项断言；同步收口时保留插件卸载标记（removedIds）与「profile 版本高于安装包则保留」的更新版本防覆盖。
- **壳层技术债清理（PR #55）**：版本比较收口为 `scripts/lib/versions.js` 全仓唯一实现（消除双实现语义漂移）；补丁引擎与原子写加固——并发临时名（pid+时间戳+序号）、`readFileCached` TOCTOU（读前读后 stat）、CRLF 锚点兼容、`transformExposeFix` 尾逗号不重复、卸载标记正则转义契约；WSL 托管后端探测异步化 + 输出解码修复 + 配置错误自动回落本地后端（issue #54，新增 `wsl-broken-fallback` 集成场景）；自更新链路（下载完整性校验 / 失败清理分片 / 整体截止时间 / 首刻挂 error 监听）、恢复链路（nextAction 注入 / attach 幂等 / 窗口销毁清定时器）与看门狗（spawn 失败不计额度 / run-state.json 原子写）缺陷根治；会话监视 / 档案自愈 / 余额模块收口（`scanZstdFrames` 三副本统一到 session-watcher、`bundleEntryOf` 只返回字符串、`readActiveModel` 锚定 agent-default-model 段）；移除 M3 主题过时部署链（4 个安装脚本 + 3 个资产 + 设计稿）与 preload 死 API；IPC 鉴权按 origin 精确比较、启动竞态与通知引用治理。新增 unit-wsl-backend(11) / unit-patch-io(5) / unit-balance(4) 单测。
- **插件中枢 dsh-hub（ARFCON/dsh-hub-DSH v1.1.2，内置）**：设置页新增「插件中枢」页签，整合四块能力——① **插件更新引擎**：已装插件版本对比（npm registry / GitHub release/tag）、一键更新与批量更新、sha512 校验 + 备份回滚、启动自检自动修复（损坏的 package.json / cordis.patch.yml 原子写恢复）；② **全局记忆**：5 个 `memory_*` 工具（save / search / list / get / delete），JSONL 存储 `~/.dsh/memory/memories.jsonl`；③ **graph-memory 挂载**：检测到 `plugin-src/graph-memory` 源码自动装配（profile bundles + link + junction，幂等），设置页展示记忆库统计（节点/边/社区）；④ **dsh-market 联动**与**自身更新检查**（raw.githubusercontent + jsDelivr + ghfast.top 多源）。原生适配 Gitee 版 DSH Desktop：客户端最新版本对比走 GitHub + Gitee 双源（与客户端同款「取最高版本」语义），国内用户可直接打开 Gitee 发布页下载。
- **内置 dsh-hub 插件两处修复**（对齐 ARFCON/dsh-hub-DSH 生态）：插件卸载时先解析 entry id 再删 insert 行（此前先删行后查 id 永远查不到），避免 disable 块残留孤儿条目；客户端安装目录候选增加常见自定义路径（`D:\app\dsh\DSH Desktop`），使「DSH Desktop 客户端」检查与客户端插件更新在自定义安装位置生效。
- **余额栏消失（ReferenceError: parts is not defined）**：dsh-balance 客户端在对话底部统计栏渲染余额/费用 dock 时引用了已不存在的 `parts` 变量（组件重写把列表变量改名为 `items`/`joined` 时漏改一处）——组件渲染即抛异常，整个余额 dock 静默消失。已改回 `joined.join(" · ")` 并同步到安装副本与 web profile，重启应用即恢复。
- **余额 dock 左侧显示「Object」**：修复上一处后 dock 恢复显示，但峰谷提示 chip（`peakChip`，React 元素）与文本一起经 `joined.join(" · ")` 拼接——数组 `join` 会把 React 元素 `toString` 成 `[object Object]`，于是 dock 最左侧出现一个「Object」。现 dock 的 `children` 直接传数组（React 原生渲染元素 + 字符串分隔符），高峰/空闲提示正常显示「⛰ 高峰价 / 🌙 空闲价」。
- **本轮费用估算：未知模型按低价档计费**：`effectivePrice` 对价格表外的模型名（如 `deepseek-v4-max`）此前回退到 `deepseek-v4-flash`（低价档），与「未知模型按高单价估算、避免少报费用」的注释意图相反——现回退到 `deepseek-v4-pro`（最高档）。同时核对计费口径与官方公告一致：输入未命中（含缓存写入）按未命中价、输入缓存命中按命中价、输出按输出价；高峰价 = 北京时间 9:00-12:00 / 14:00-18:00 全价（v4-flash 未命中 3.0 / 命中 0.10 / 输出 9.0，v4-pro 未命中 9.0 / 命中 0.30 / 输出 27.0，¥/百万 token），空闲 = 高峰一半，2026-08-17 00:00（北京时间）起生效。
- **点击系统通知回到应用前台**：所有系统通知（任务完成 / 崩溃自愈恢复 / 安全模式 / 配置自愈 / 渲染进程恢复）统一支持点击回到应用——`showNotification` 默认给通知挂 `onClick → showMainWindow()`（覆盖最小化、隐藏、关闭到托盘、窗口销毁后重建等全部恢复路径），调用方无需各自实现；任务完成通知的旧实现（仅 restore+show+focus，窗口销毁场景会失效）改为走统一默认。Windows toast 点击激活依赖的 `AppUserModelID`（`com.deepseek.dsh.desktop`）与开始菜单/桌面快捷方式同 id 创建已就绪，点击 toast 即恢复窗口到前台。
- **核心运行时健壮性加固（PR #56）**：① 更新流程守卫竞态根治——`runUpdateFlow` / `runClientUpdateFlow` 的 busy 标志改为入口同步置位 + 全程 try/finally 复位（此前在 checkLatest 网络请求与版本对话框之后才置位，自动更新定时器与手动触发可并发通过守卫，双 npm 安装互踩 staging 会损坏 agent）；② 预览路径围栏本地 DoS 根治——`isUnderFileRoots` 缓存 miss 强制失效改为冷却窗口（至多每 5s 一次强制刷新），浏览器恶意页面无法再通过无效预览请求放大为 sessions 全目录遍历 + 逐文件 zstd 解压的 CPU/IO 攻击；③ 服务启动写流泄漏——`watchServerProc` 的 dsh-web.log 写流 spawn error 路径不再泄漏 fd（幂等 `endOut` 在 error/exit 统一收口，stderr 写入包 try，不再冒泡 uncaughtException）；④ 服务就绪行处理提前退出——`onData` settle 后立即 return，同 chunk 第二行 URL 不再 killTree 刚就绪的服务；⑤ `killTree` 的 taskkill spawn 挂 error 监听并收敛到幂等 finish；⑥ 余额估算回退档位统一——`effectivePrice` 峰谷期与旧版固定价期均回退 `deepseek-v4-pro`，移除死代码 `FALLBACK_PRICES`，补齐旧版期未知模型断言。
- **客户端更新分片选择与合并校验加固（自动更新 review）**：① `selectAsset` 分片集增加**序号连续性校验**（必须从 `.part1` 连续到 `.partN`）——此前缺失中间分片（如只有 part1+part3）仍会照常选择并拼接，产出损坏安装包；单靠下载后 64MB 下限兜底存在漏网窗口（仅缺尾部小块时拼接结果仍超下限被放行，安装器失败后用户会看到「下载了却从不弹安装」）。现不连续的分片集直接拒绝，宁可用下一个命名候选或报错，也不拼坏包；② 分片合并后**大小与上游声明严格一致校验**（每片已按 content-length 完整性校验，不一致只可能是分片集不完整）——不一致即删除并抛错，下一轮自动更新会重试，不再把残缺包标记为「已下载待安装」。新增 2 个分片连续性单测。
- **设置页「插件」分区新增「诊断与管理」标签页**：原插件管理页内嵌的诊断/备份恢复面板整体迁入该标签，并新增三项维护能力——① **一键导出诊断日志包**：诊断报告 + 桌面/Web 日志尾部聚合 + 崩溃转储元信息 + 环境信息，打码 home/userData 路径后存为单个 JSON（本地操作不上传）；② **防砖体检**：逐个检查已装配插件的 dsh 清单、补丁入口可解析性与跨包 loader 条目 id 冲突（重复 id 会在下次启动触发 `duplicate loader entry id` 失败，提前标红）；③ **Bundle 顺序检测与重排**：读取声明规则（`dsh.bundle.order.before/after`）与插件依赖，LOOT 式拓扑排序给出建议顺序，一键写回 profile `package.json`（官方内置 bundle 保持原位、原子写），重启生效
- **诊断与管理安全加固**（专业测试流程产出）：恢复路径拒绝含 `node_modules` 段（junction/symlink 装配点）与符号链接逃逸（realpath 包含性校验，恶意备份无法经 junction 写穿到根外）；诊断日志包脱敏移至序列化前深度掩码（Windows 反斜杠转义导致的静默失效修复，掩码集含 userData/home/安装目录）；IPC 鉴权改 origin 相等比较（防 userinfo 技巧绕过前缀匹配）；恢复/顺序写回加主进程互斥；非 UTF-8 文本按 base64 原字节备份还原（GBK 等不再乱码损坏）；恢复输入 >4MB 拒绝；备份元数据不再记录本机绝对路径
- **启动自愈：bundle 契约缺失自动修复 + 防砖体系升级**（针对 `Error: dsh: profile bundle "X" declares no dsh.bundle in its package.json` 启动崩溃，loadProfile fail-loud）：① **启动自愈**——boot 失败时识别 `dsh-web.log` 的第四种 loader 失败形态（`profile bundle "X" declares no dsh.bundle`，`parseFailedLoaderIds` 扩展），经文件系统二次确认（须在 `dsh.profile.bundles` 清单内、包目录存在但缺 `dsh.bundle.patch` 声明，绝不触碰 `@deepseek-ai/*`）后备份 manifest 并移出启动栈，依赖包仍保留以兼容纯客户端插件，随后自动重试启动并弹窗通知；② **防砖体检升级**——启动清单内缺 `dsh.bundle.patch` 声明的包由 warning 升级为 error（真实 fail-loud 必挂，提前标红），新增「一键移除失效条目」按钮（两步确认，备份后原子写回 bundles，重启生效）；覆盖条目（`disabled`/config/定向 insert）不再误计为 loader 注册，消除「默认禁用条目 vs 包注册」的假跨包冲突；③ **启用前契约校验**——zat-dsh-engine 启用插件（setEnabled）前检查包是否声明 `dsh.bundle.patch`，缺声明或不可读直接拒绝并给出修复指引，杜绝「启用即踩雷」。**自愈主路径升级为不依赖日志的 manifest 直扫**（`scanBundleContracts`：直接遍历 `dsh.profile.bundles` 二次确认声明，日志轮转/截断/编码异常时仍能发现坏条目，日志形态保留为兜底）；**启用校验补 patch 文件存在检查**（声明存在但补丁文件缺失同样阻止启用）。
- **启动自愈链路修复与提示增强**：修复安全 overlay / 自愈重试必败的根因——`web` 子命令遇到 `--host` 等应用参数后会透传剩余参数，此前 `--patch` 拼在这些参数之后而未被启动器解析；现将 overlay 参数放在 `web` 之后、应用参数之前。自愈成功后追加模态提示框（系统通知之外的双保险），明确说明已移出启动栈/禁用哪些插件、配置已备份、无需操作。
- **诊断报告展示「最近启动自愈」记录**：每次自愈动作（自动移除/禁用坏插件）写入 `userData/self-heal-history.json`（保留最近 5 条），随诊断报告带回并在「诊断与管理」报告顶部以蓝色信息条持久展示（模态框/通知是一次性的，这里提供事后回看）；进入「诊断与管理」标签页自动运行一次诊断，报告立即可见；修复前端取值层级错误（自愈数据在 `report.sections.selfHeal`，此前误读 `report.selfHeal` 导致蓝条永不显示）

## [0.3.9] — 2026-08-16

### 新增
- **对话删除与归档管理（dsh-session-manager 内置插件）**：dsh 官方只有归档没有删除，现补齐：
  - 会话行 ⋯ 菜单「归档会话」下方新增「删除对话」（**所有会话行均显示**，含当前会话）：确认后经宿主 RPC 删除会话日志与附件（**正在运行**的会话被拒绝），列表经官方 host 帧实时移除；
  - 设置 →「归档对话管理」面板：列出全部已归档对话（标题/项目/更新时间），每条提供「恢复」（回到原工作区与顺序，经 `workspace.unarchiveSession` 持久化并实时广播）与「删除」；
  - 实现：`scripts/patch-session-manage.js` 对官方包做幂等运行时/打包补丁（`dsh-workspace` WorkspaceRegistry.unarchiveSession；`dsh-session` Sessions.remove——从 live 注册表摘除、优雅 flush 后释放并广播 session/disposed；`dsh-host-apiproxy` 新增 workspace.unarchiveSession / workspace.deleteSession RPC——删除先查 agent 运行状态表（agent/status 事件维护，仅拒绝真正运行中的会话），再按 jsonl 布局移除 `<DSH_HOME>/sessions/<project>/<id>/`、摘除 live 会话、清理归档集并广播；`dsh-client-connection` API 面与 unary 响应 schema；`dsh-client-ui-workspace` 菜单项与中英文案）；`assets/plugins/dsh-session-manager`（bundle，设置面板 + `window.__dshSessionManager` 桥），启动/打包三路覆盖（dev / afterPack / 运行时），dev node_modules 已实测应用
  - 端到端集成场景 `session-delete-flow`：真实 RPC 链路验证 创建→归档→恢复→再归档→删除（目录消失 + 归档集清理）→空闲 live 会话摘除删除
- **对话节点导航条（dsh-navbar，vlln/dsh-navbar，MIT）内置**：对话区右缘节点串快速跳转 user 消息（悬停预览 6 行截断 / 点击平滑跳转 + 品牌蓝高亮 / 连续悬停与滚轮切换 / >11 节点自动滑动窗口 / <2 条 user 消息自动隐藏 / 消息精选 pin 按会话持久化），实现 dsh-external/issues#144 规格，纯浏览器端 bundle（`assets/plugins/dsh-navbar`，含 LICENSE 与预编译 lib）。**取代** `dsh-conversation-tweaks` 内置的会话右侧导航滑轨（dct-rail 已移除），conversation-tweaks 保留「隐藏对话输出」；`sync-companion-plugins.js` 的插件清单与 `lib/index.mjs` 复制规则同步补齐（该清单此前与 main.js 漂移，缺 better-sidebar / harness-pet，已对齐）
- **侧边临时会话（dsh-side-session，hzhz314159/dsh-side-session，MIT）内置**：基于当前主会话上下文在独立浮窗发起临时追问（答案不写入主会话）；💬 图标 / `Ctrl+Shift+S` 唤起；三种回答引擎（全局 Key / 插件 Key / 宿主 LLM）；zstd 帧扫描自动捕获上下文（含截断护栏）；bundle 随桌面端分发并自动同步。**内置版本升级至 v0.2.3**：纯浮窗形态（头部拖拽移动 + 右下角缩放）、上下文长度三档（标准/加长/完整，设置面板「确定」应用）、meta 指纹轻量轮询（2s 心跳仅对比计数指纹，变化才拉全量）、`/side-session` 斜杠命令、mode3 走宿主 `ctx.llm.stream`（不读任何 key）
- **主动上下文压缩（billion-context-dsh，Tyan66666/billion-context-dsh，MIT）内置**：模型驱动的上下文压缩后端（ACP，内核 acp-kernel 复用）——由模型决定何时压缩、压缩什么，替代自动摘要式压缩；`compress`/`decompress`/`search_context`/`acp_status` 四工具 + `/acp` 命令，自动策略只 nudge 不强制。bundle 随桌面端分发（含 dist 与私有依赖 acp-kernel，同步逻辑补齐 `dist`/`node_modules` 目录），启动时自动同步进 web profile 并幂等写入 `compaction-basic` 禁用条目（同一 realm 仅保留一个压缩后端）
- **余额面板并行展示 OpenCode Go 订阅额度**：5 小时滚动 / 每周 / 每月用量百分比（percent=已用比例），查询失败不影响主余额展示

### 修复
- **客户端更新「能下载但无法更新」闭环修复**：① 点击「立即重启」后不再提前清掉 `pendingClientUpdate`，只写入含下载包路径的 `clientUpdateAttempt`；安装器失败/被取消时，下次启动会真正进入「客户端更新未完成」重试流程（旧实现把待安装标记清掉，重试对话框永远不出现，用户只能重新下载）；② NSIS 更新脚本只在安装成功且新版本已启动后删除安装包，失败/取消时保留安装包供重试，并以退出码 0 判定成功（取消不再被误判为成功）；③ 便携版替换脚本对 `NEW→OLD` 复制失败增加 12 次退避重试（吸收杀软扫描锁定），等待/替换失败时用写入探针区分「目录只读」与「文件仍被占用」：只读目录直接降级为启动新 exe，可写目录用 `.bak` 还原当前版本；④ `downloadFile` 监听 `aborted/error`，服务器中途断开时立即报错而非无限转圈。新增 `scripts/test/unit-client-updater.test.js`（纯函数单测，无需网络）
- **更新进度窗口阻塞整个应用**：`showUpdateWindow` 去掉 `modal/parent` 并改为 `minimizable: true`，下载期间主窗口可继续点击、最小化，进度窗自身也可最小化或关闭（关闭不取消后台更新/下载）；「更新完成/下载完成」对话框弹出前先关闭进度窗，避免窗口叠层导致确认框无法显示。`assets/updating.html` 文案同步说明后台继续
- **集成测试模式抑制对话框弹窗**：`showBox` 在 `DSH_DESKTOP_TEST=1` 时不再弹真实对话框（测试实例与正在使用的桌面端并存时，失败的测试会在用户屏幕上弹出「启动失败」窗），改为记录日志并按取消键处理（boot 失败 → 快速退出让场景明确失败）
- **存量坏 profile manifest 不自愈 → 启动必失败**（issue #16，PR #21）：旧版本（0.3.3/0.3.4）写坏的 `profiles/web/package.json` 中 `dsh.profile.bundles` 只有配套 bundle、缺少核心 bundles（`@deepseek-ai/dsh-base` / `@deepseek-ai/dsh-web-app`），核心服务无人提供，插件树永久 `N entries did not activate`。`syncCompanionPlugins` 现在对已存在的 manifest 做「校验 + 补齐」：把缺失且实测可解析的核心 bundles 补到列表最前，其余条目（含用户添加的）原样保留；健康 manifest 零写入（幂等）。核心逻辑抽为 `profile-manifest.js`（纯函数，含 `node --test` 单测 + 集成场景 `heal-stale-manifest`）
- **profile patch 同 id 重复注册 → 插件树崩溃**（issue #17，PR #24）：旧版本插件安装向 `cordis.patch.yml` 写入重复的 `- insert: - id: X` 块（或插件升级为 bundle 后 patch 残留行），cordis loader 抛 `duplicate loader entry id: X` 且永远无法自愈。新增 `profile-patch-heal.js`：启动时块级按 id 去重（保留首个、备份原文件）、把已升级为 bundle 的插件残留注册从 patch 层移除（`dropBlocksByIds`），并支持从 `dsh-web.log` 解析三种 loader 失败形态（hash / duplicate-id / 括号包名）映射回 patch 条目。含 `node --test` 单测 + 集成场景 `heal-dup-patch` / `heal-bundle-patch`
- **web-search「接口地址」填第三方地址仍被拼 `/messages` 按 Anthropic 协议请求 → 404**（issue #20，PR #22）：`dsh-web-search-deepseek` 的 baseURL 拼接归一化（尾斜杠不产生双斜杠；基址已含 `/messages` 不再重复拼接），HTTP 失败信息附上实际请求地址与协议契约指引（裸 404 变可自解的提示），设置页中英文文案明确「POST <基址>/messages」契约。补丁本体在 `scripts/patch-web-search-baseurl.js`（打包补丁与运行时补丁共用同一实现，覆盖内置副本 / profile fallback / agent overlay），含 `node --test` 单测（含本地 mock 服务的真实 HTTP 回归）与集成场景 `web-search-patch`
- **客户端自更新在中文 Windows 上解析失败**（`apply-update.ps1` 报 `Unexpected token '}'`，issue #23，PR #25）：更新脚本改为带 UTF-8 BOM 写出，Windows PowerShell 5.1 不再按系统 ANSI 代码页（GBK）误读中文注释导致换行符被吞、语法乱码；`buildNsisPs1()` 模板注释同步 ASCII 化，脚本在任何代码页与换行风格下均安全
- **桌面版默认启用硬件加速，修复软件渲染掉帧**（issue #26，PR #28）：移除无条件 `app.disableHardwareAcceleration()`（软件渲染导致 GPU 进程空转 ~40-60% 单核、设置页等整页重绘明显掉帧）。改为：默认硬件加速；仅当 `settings.json` 标记 `hardwareAcceleration:'off'` 时禁用；GPU 进程 60 秒内连续崩溃 3 次（`gpu-process-crashed` / `child-process-gone` 双事件去重）自动持久化降级标记并重启应用，保留崩溃日志与自恢复兜底。降级逻辑抽为 `scripts/gpu-crash-guard.js`（含 `node --test` 单测）
- **M3 主题管理器设置观察器防抖**（issue #26 附加项）：`assets/themes/m3-theme-manager.js` 的 `MutationObserver` 不再每批 DOM 变更都执行全文档 `querySelector`，改为 300ms 防抖（与 preload.js 中同功能实现对齐）
- **M3 主题全局过渡拖慢整页**（issue #26 附加项）：`body[data-m3-theme="m3"] * { transition-duration }` 默认 `transition-property: all`，每个元素的所有属性变化（含布局开销最高的 width/height/transform）都被动画化，M3 模式下掉帧显著。收窄为颜色类属性（背景/文字/边框/阴影/透明度/transform），保留主题切换的平滑变色意图，几何变化不再动画
- **WSL 模式「模式列表」比 local 少**（PR #29）：WSL 托管后端经 npm 安装的 dsh 是干净包，不含壳内置的 8 个 Agent 预设。`main.js` 在 WSL bootstrap 与更新后会经 UNC 把 `assets/agent-presets` 写入 WSL agent 包的 `config/agent-presets`；`scripts/sync-companion-plugins.js` 也自动同步预设（可 `--dsh-package <目录>` 显式指定）
- **本地模式 agent 更新后丢失壳内置 Agent 预设**：`updater.applyUpdate` 全新安装的 overlay 也是干净 npm 包，8 个壳内置预设同样缺失（WSL 同族问题的 local 半边）。新增 `syncLocalAgentPresets()`：启动与更新后把预设幂等补进「当前生效」的 dsh 包（overlay 优先，否则内置），三种布局（内置 / 更新 overlay / WSL）模式列表一致
- **识图 view_image 三个根因修复**（issue #33，PR #31 + #32）：① 旧模型（`glm-4v-flash` / `glm-4.1v-thinking-flash`）钳制 `maxTokens ≤ 1024` 并对 400 自动降档 1024 重试一次，400 code 1210 不再直接失败且 fallback 链持续生效；② 设置页保存不再把「等于插件默认值」的字段写进 `settings.yaml`（避免旧模型 maxTokens 2048 被写死固化）；③ `role('secret')` 的 apiKey 永不回显，留空 = 保持已存密钥，仅非空输入才写入（修复「改模型/地址后保存会静默清空密钥」）。新增 `scripts/verify-vision-upgrade.js` 交付前识图链路验证（插件完整性 / patch 唯一性 / 配置与模型上限兼容）
- **余额欠费误报「API key is invalid」**：第三方 provider（opencode 等）余额不足返回 401 + CreditsError 时被 `dsh-llm-pi-ai` 一律判 AUTH。新增 `scripts/patch-pi-ai-credits.js` 把余额判定前置到 401-AUTH 之前：欠费 → QUOTA（客户端显示真实原因），真 key 无效仍判 AUTH
- **便携版「有进程无窗口 / 双击无反应」**（issue #30）：① 便携版数据目录重定向提前到单实例锁校验之前——Electron 实例锁以 userData 为键，旧实现与安装版共用 `%APPDATA%\DSH Desktop` 锁，安装版在跑时双击便携版会静默退出；② 主进程启动期兜底：任何模块级 / 启动早期未捕获异常落盘 `<userData>/logs/startup-crash.log` 并在启动完成前弹可见错误框，杜绝静默失败
- **桌面版关闭到托盘后无法重新打开 / 桌面重复快捷方式**（用户反馈）：① `showMainWindow()` 防御性强化——窗口被销毁/未创建时重建主窗并加载 Web UI，隐藏/最小化时 restore+show+置顶聚焦；托盘左键/双击、`second-instance`（再次双击桌面图标）统一走该恢复路径并记录日志（此前托盘左键采用「可见则隐藏」双态逻辑，隐藏态误判会导致点按无反应；second-instance 对异常窗口状态无兜底）；② `maintainShortcuts()` 增加**快捷方式去重**——每次启动清理桌面与开始菜单中规范名（`DSH Desktop.lnk`）之外的同族快捷方式（Windows 自动重命名副本 `(1)`、手动“发送到桌面”副本、旧版残留），只保留一个；**安装版不再由壳层自动创建桌面快捷方式**（由 NSIS 安装器负责），仅便携版维护桌面快捷方式，消除「每次启动自动生成多个快捷方式」；标题栏 ⋯ 菜单与托盘菜单原有的「退出」「关闭时最小化到托盘」开关保持可用
- **打包前语法门覆盖补丁/自愈模块**：`scripts/check-syntax.js` 的入口清单并入 `profile-manifest.js` / `profile-patch-heal.js` / `patch-web-search-baseurl.js` / `gpu-crash-guard.js` / `install-minimal-win-preset.js` / `patch-deps.js` / `patch-pi-ai-credits.js` / `sync-companion-plugins.js` / `after-pack.js` / `patch-portable-template.js`，此类模块的语法/「async 与声明被拆开」问题在打包前即可拦截
- **启动提速**（PR #39）：① `repairProfileFallback` 增加健康快照（`profile-fallback-cache.json`，含 dsh 包签名）——依赖闭包未变、链接逐项校验通过时跳过耗时的 `import('dsh-app-boot')` + BFS + heal；dsh 升级后签名失效自动重算；② 配套插件同步（vendor 依赖与 lib/assets/src 递归目录、固定文件清单）逐文件比对 size+mtime，一致跳过写盘（复制改用 `preserveTimestamps`，确保二次启动命中跳过）；③ loading 窗口提前到启动最前段创建，用户第一时间看到「正在启动」，并同步提前装配渲染进程自恢复与挂起心跳（loading 阶段崩溃/挂起也有兜底）
- **router flash 等重负载场景掉帧 / 周期性假死**（issue #34）：① `harness-pet` 默认改为关闭（opt-in，设置卡可开启），且关闭时完全停掉 rAF 动画循环（此前隐藏状态下仍逐帧绘制 320x320 canvas）；② `dsh-conversation-tweaks` 会话滑轨的 MutationObserver 不再每 250ms 全量 `querySelectorAll + getBoundingClientRect`，改为仅在内容尺寸真实变化时重算标记位置；③ 修复 `syncCompanionPlugins` 自愈死循环——bundle 插件源缺失时不再被当普通插件写回 `cordis.patch.yml`（此前会注册不存在的包导致 dsh web 启动崩溃），并从 manifest bundles 移除（视为用户禁用）、清理 patch 残留注册（用户手写 config/disabled 覆盖条目保留）
- **Agent 预设很多时「上面的不显示」**（issue #36）：`dsh-client-ui-primitives` 的 Menu portal 弹层在条目超过视口时没有高度上限，`place()` 把整列推到视口上方、顶部条目被裁掉且无法触达。新增 `scripts/patch-menu-viewport.js`：portal 列表加 `max-height: min(calc(100vh - 24px), 560px)` + `overflow-y: auto`，y 夹紧按封顶后高度计算，任何视口高度下完整可用（打包 afterPack / 启动运行时 / dev node_modules 三路覆盖，含 `node --test` 单测）
- **第三方模型思考强度**（issue #37）：功能已就绪（`dsh-third-party-thinking` 默认关闭、可对支持的 provider 开启并把档位注入请求体）；设置页「请求字段名」提示补充 opencode-go 套餐内 DeepSeek Flash/Pro 的开启说明
- **桌面宠物原生置顶小窗**（harness-pet「主窗最小化后宠物消失」根治）：插件自带 Document PiP 独立窗口在 Electron 中不可用（`requestWindow` 抛 `Internal error: no window`）。改为主进程原生方案：  - `main.js`：新增 360×420 无边框透明置顶（screen-saver）不进任务栏的宠物小窗（与主窗共享分区/localStorage），位置经 `userData/pet-window.json` 持久化（跨屏校验 + 钳制回可视区，拖动 400ms 防抖保存）；IPC 双端契约：`chrome:pet-window`（open/toggle/state，校验主窗来源）、`pet:close`、`pet:move-to`（绝对目标位置，至少露出 80px）、`pet:set-auto-open`；主窗最小化且插件开启「最小化自动显示小窗」时自动弹出；before-quit 清理；复用 `guardWebContents` 与 `recovery.attach`
  - `preload.js`：`--dsh-pet=1` 模式检测 → 注入 `window.__DSH_PET__`、隐藏除宠物根节点外的全部界面、跳过自绘标题栏；桥接 `dshDesktop.petWindow`（open/toggle/isOpen/close/moveTo/setAutoOpen）；主进程 `pet:state` 转发为页面事件 `dsh-pet-state`
  - `harness-pet` 插件：原生桥优先（浏览器仍回退 PiP）；小窗布局（宠物贴底居中、气泡锚定鲸鱼正上方随大小自适应、齿轮右下角、面板内嵌）；双宠物互斥（小窗打开时主窗宠物/气泡/齿轮隐藏，含刷新后状态查询恢复，`applySettings`/`setDialogVisible` 共用可见性表达式）；拖动（小窗 = 绝对定位搬窗无抖动、主窗 = 取整落位）；朝向只越水平中线才调转（主窗视口中线 / 小窗屏幕中线）；会话跟随（共享 localStorage + storage 事件 + `sessions.open`）；新设置项 `autoDesktop`（最小化自动显示小窗，默认开）/ `sound`（状态跃迁 Web Audio 合成提示音：等待输入/任务完成，仅主窗、仅跃迁响一声、首状态不响）/ `labelSize`（提示文本字号 10–26px 默认 15px，四语言文案齐全）；提示文本 9 种状态前景/背景配色

## [0.3.8] — 2026-08-15

### 修复
- **安装后启动即报 `ReferenceError: async is not defined`**：`main.js` 中 `async` 关键字与 `probeOverlayAgent` 函数声明被注释行拆开，导致主进程模块加载失败。已重接 `async function`；新增 `scripts/check-syntax.js` 并接入 `prepack` / `predist`，打包前强制做入口 JS 语法检查与「async/await 关键字与声明被拆开」模式扫描，此类坏包无法再打包。
- **安装后启动即弹「应用初始化失败：home is not defined」**：`main.js` 的 `applySettingsSectionGuard()` 构造候选补丁路径时引用了未声明的 `home` 变量（相邻的 `applyProfilePatchGuard` / `applyWorkspaceSearchRailFix` 均有声明，唯独此处遗漏），`boot()` 无条件调用该函数导致每次启动必现初始化失败弹窗。已在该函数内补齐 `const home = effectiveDshHome() || path.join(os.homedir(), '.dsh')`，与相邻防护函数保持一致。

## [0.3.6] — 2026-08-15

> 注意：Zat-DSH Engine 市场替换与客户端更新闭环修复已合入 main，但本版本尚未发布；
> Gitee 分片合并脚本（merge.bat）已重写为 CRLF + ASCII 提示，修复换行符丢失导致
> `set FAILED` / `pause` 失效的问题。发布前请重新执行打包并核验全部文档链接。

### 新增
- **内置 Agent 预设扩充至 8 个**：按上游最新版本同步 `router-standard`（yjh051108/dsh-routing-suite）、`anchored-standard` / `zero-anchored-standard`（xiaobright/dsh-anchored-standard），并新增 `whoami-standard`、`v4-flash-godmode-opencode-go`（SheberDavid）、`warmupbetter` / `warmupbetter-replay`（0liveiraaa/myDshPresets）；每个预设目录附带上游 LICENSE/NOTICE，详见 `docs/agent-presets.md`
- **Gitee 分片合并脚本重写**：`scripts/fix-merge-bat.cjs` 生成 CRLF + ASCII 提示的 merge.bat，修复 `set FAILED` / `pause` 被 echo 吞掉的问题；README 下载说明同步修正
- **插件市场整体替换为 [Zat-DSH Engine](https://github.com/mishibeikejie/zat-dsh-engine)（MIT）**：移除旧 `@deepseek-ai/dsh-plugin-marketplace` 的同步副本与 patch 条目，新增 `zat-dsh-engine` bundle（社区目录 / 双语简介 / 一键安装更新卸载启停 / 网络自适应 / 自更新）；`zod` 转为显式依赖随包分发
- **新增内置 bundle 插件**：`dsh-better-sidebar`（[omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)，MIT，VSCode 式侧边栏工作台）与 `harness-pet`（[cakeni/harness-pet](https://github.com/cakeni/harness-pet)，MIT，桌面宠物）；`syncCompanionPlugins` 支持递归同步 `lib/assets/src` 目录，并为 profile 补齐 `schemastery / cosmokit / @standard-schema/spec` 内置依赖
- **文本模型自动识图**：`dsh-host-apiproxy` 发送入口在模型不支持图片输入时，自动复用已安装 `dsh-vision` 的 VLM 配置把图片转述为文字（含 OCR）后再发送；支持图片的模型仍走原生通道
- **第三方许可文档**：新增 `docs/attributions.md` 与 README「第三方组件与许可」，明确 Zat-DSH Engine、dsh、koffi、Electron、React、zod 等 MIT 组件来源

### 修复
- **客户端更新「点了立即重启仍弹出有待安装的更新」**：待安装标记原子写盘 + 回读校验；每次重启安装记录 `clientUpdateAttempt`，启动识别「客户端更新未完成」并支持重试 / 打开日志 / 24h 稍后；NSIS 更新脚本在安装器失败或被取消时自动拉起旧版本

## [0.3.4] — 2026-08-15（BUG 修复版）

### 修复
- **koffi 3.1.3/3.1.4 win32-x64 预编译二进制损坏**（目录选择器 worker 无消息退出、部分客户机器启动即崩）：`package.json` overrides 锁定 `koffi@3.1.5`（上游已回退 Windows 原生编译）；新增 `scripts/koffi-preflight.cjs`，启动前用内置 Node 做 FFI 冒烟，失败自动注入 browse 目录选择器 overlay
- **目录选择器 worker 崩溃后报错无任何诊断信息**：新增 `scripts/patch-deps.js`（postinstall / pack / dist 幂等补丁），worker 无消息退出时把真实 exit code / signal 带进错误文案
- **启动项配置生成错误导致整体打不开**：`dsh web` 退出码 1 时自动解析 `dsh-web.log` 中加载失败的 patch 插件 id，写入 `safe-boot.overlay.yml`（`dsh web --patch`）禁用后自动重试，不修改用户 patch 文件，并弹系统通知
- **EPERM: operation not permitted, symlink 导致退出码 1**：检测到 `profiles/node_modules` 目录联接创建被拒时，自动改名备份半成品缓存、重跑官方 `healProfilesModuleFallback` 重建联接并重试启动，不再需要客户手动按手册操作
- **部分用户设置页看不到插件设置（视图/识图/思考强度等）**：`dsh-host-apiproxy` 设置命名空间白名单补丁改为同时覆盖内置 app、profile fallback 与**更新后的 agent overlay** 三处副本，并锚定 `WEB_SETTINGS_NAMESPACES` 数组自身收尾插入；启动顺序调整为先修复 profile 联接再应用补丁
- **启动失败弹窗缺少日志内容**：失败对话框与「服务已停止」对话框附带 `dsh-web.log` 最近日志，客户截图即可定位
- **syncCompanionPlugins 覆盖用户禁用**：patch 中 id 已存在（含用户手写 disabled 条目）时不再自动重插，避免重复 id 与「禁用后又被加回来」
- **全新 DSH_HOME 首次启动必失败（退出码 1，插件树无法激活）**：`syncCompanionPlugins` 在 dsh 初始化 profile 之前预写 manifest 时，只写入 bundle 插件导致核心 bundles（dsh-base / dsh-web-app）缺失。现改为以实际将运行的 dsh 包为锚点实测可解析后，先写核心 bundles 再追加 bundle 插件；解析不到则不写 manifest，交由 dsh 自行初始化（PR #14）
- **客户端更新「点了立即重启仍弹出有待安装的更新」**：待安装标记改为原子写盘 + 回读校验；每次重启安装都记录 `clientUpdateAttempt`，下次启动若仍是旧版本则识别为「客户端更新未完成」，提供重试安装 / 打开 `apply-update.log` / 稍后（24h 不再打扰）；NSIS 更新脚本在安装器失败或被取消时自动拉起旧版本，避免“重启后应用消失”
- **渲染进程崩溃后永久黑屏/白屏（0xC0000005）**：新增 `renderer-recovery.js` 自恢复状态机，主窗与会话浮窗统一接管：
  - `render-process-gone`（crashed/killed/oom）→ 指数退避自动重载（首次 0.8s，上限 15s + 抖动）
  - 连续失败第 3 次 → 主窗销毁重建 BrowserWindow（保持隐藏/托盘状态）；浮窗直接关闭
  - 失败超过上限 → 主窗切到本地恢复页（重新加载/重启客户端/打开日志），并弹系统通知；绝不无限循环
  - 页面加载成功后需「稳定存活 30 秒」才清零故障计数，杜绝「加载即崩溃」型循环
  - `clean-exit`、退出中、窗口已销毁一律不触发恢复；服务进程退出时交由既有重启对话框，不双弹窗
- **界面挂起（AppHangB1）无恢复**：监听 `unresponsive`，20s 宽限后强制终结 renderer 复用恢复路径；preload 每 5s 心跳兜底「挂起但无 unresponsive 事件」的场景（以 show/hide 事件追踪可见性，隐藏/最小化不误判）
- **加载失败白屏**：新增 `did-fail-load` 处理，服务健在时退避重试（覆盖插件市场重启间隙），`ERR_ABORTED` 忽略
- **崩溃无法取证**：固定 `crashDumps` 到数据目录并启用本地 Crashpad（`uploadToServer:false`），minidump 可离线分析 0xC0000005 底层来源；恢复状态写入 `run-state.json`
- **dsh web / 预览服务随机命中 Chromium 受限端口导致页面永远无法加载**：命中即自动重启服务换端口（上限 4 次）；本地稳定端口选择也会避开受限端口

### 开发
- 新增 `scripts/test/unit-recovery.test.js`（node:test 状态机单元测试，17 例）与 `scripts/test/integration-runner.js`（真实 Electron 集成测试，10 场景）
- 集成测试通道：`DSH_DESKTOP_TEST=1` 时经文件轮询下达命令（crash/kill/hang/quit…），renderer 崩溃时仍可用

## [0.3.3] — 2026-08-15

### 新增
- **内置「极简模式_win」Agent 预设**：把官方极简模式的 bash/PTY 工具替换为 Windows PowerShell（`@deepseek-ai/dsh-tool-pwsh`），开发模式 `npm start` 自动安装，打包流程 `afterPack` 自动写入内置 dsh CLI。
- **内置 dsh-routing-suite**：`dsh-super-injector`（dev_* 注入器/自愈工具）作为 bundle 插件随包同步进 web profile；`router-standard` 预设随包写入内置 dsh CLI。
- **内置 dsh-anchored-standard**：`anchored-standard` 与 `zero-anchored-standard` 两个实验性预设随包写入内置 dsh CLI。
- **识图插件设置页**：`dsh-vision` 新增设置页，可直接填写 API 地址、密钥、模型、备用模型与请求限制；设置保存后热生效。
- **余额/本轮费用开关**：自绘菜单新增「显示余额/本轮费用」，第三方中转/不需要余额提示的用户可一键关闭整个统计 dock。
- **会话导航滑轨输入位置圆点**：每条用户消息在右侧滑轨上以圆点标出位置，内容或尺寸变化时才重算，滚动时不额外读取布局。

### 修复
- **客户端更新多源选择错误**：GitHub 与 Gitee 双源现在取版本最高的 release，而不是返回第一个可用源；修复 GitHub latest 落后时“内置在线更新失效、只能手动覆盖安装”。
- **插件市场安装报 `args fields do not match`**：`installPlugin` 的 Typert 描述符参数名从 `packageName` 对齐为宿主方法的 `spec`。
- **识图插件无法配置/加载**：修正 `dsh-vision` 的 peer 依赖（`@deepseek-ai/cordis`），补齐 `dsh.client` 清单与设置 UI，配置不再依赖手工写文件。
- **第三方模型思考强度默认不再破坏 API**：`reasoning_effort` 注入默认关闭，仅 provider 确认支持时启用；字段名留空表示只显示档位、不注入参数，避免百炼等严格接口报错。
- **会话导航滑轨**：滑轨固定到会话内容区右侧，并在滑轨上以圆点标出每条用户输入的位置；不再因 `position:fixed` 缺省位置偏到窗口左侧。
- **设置页出现两个「插件」栏**：移除 `dsh-super-injector` 重复注册的同名空白设置栏，设置导航只保留官方「插件」页（插件市场为其标签页）。
- **余额/本轮费用开关失效导致金额不显示**：`balanceDockEnabled` / `setBalanceDock` 曾被误放进通知点击回调的作用域，余额刷新与菜单开关运行时抛出 `ReferenceError`；现提升为模块级函数，dock 恢复显示且开关真正生效。
- **README 下载链接**：根 README 中英文下载链接从 0.3.1 同步为 0.3.3，并补充手动安装第三方插件说明。
- **服务启动失败弹窗叠加**：主进程对话框串行化，启动失败/更新/错误弹窗不会同时叠成多个。
- **「隐藏对话输出」按预期工作**：`dsh-conversation-tweaks` 设置命名空间加入浏览器设置白名单，开关保存后真正写入；开启时隐藏大量工具调用、工具结果与思考过程，每一轮最终总结输出仍然显示。
- **桌面端卡顿优化**：会话日志目录枚举改为 5 秒缓存并降低轮询频率；会话导航滑轨滚动事件合并到 requestAnimationFrame 并限频；M3 设置观察器防抖；高频重复的页面 warning/error 日志按签名节流，减少同步磁盘写入。
- **左侧会话分组偏好丢失**：`dsh web` 不再每次随机换端口，改为复用上次保存的 `127.0.0.1` 端口（占用时自动选新端口）。Web UI 的 localStorage 偏好（如会话分组方式）不再因 origin 变化而每次重置。
- **客户端更新“重启后不自动安装/重复弹窗”**：启动更新脚本前清除待安装标记，失败后不会再反复弹同一个更新框；安装版安装完成后会检测新版本是否启动，未启动则从卸载注册表定位并显式拉起；NSIS 明确开启 `runAfterFinish`。
- **插件事件导致会话历史无法加载**：打包时对内置 `@deepseek-ai/dsh-session` 事件词汇表打补丁（`afterPack` 自动执行；开发模式 `npm start` 同样幂等补丁），接受 dsh-agent-teams / dsh-message-edit / dsh-web-search-exa 写入的自定义会话事件，修复 `SessionFormatUnsupportedError: ... unknown to this harness and not marked ignorable`。
- **0.3.2 实际未随包携带「极简模式_win」**：该预设此前只写进了 changelog，本次补齐源文件与安装流程。


## [0.3.2] — 2026-08-15

### 新增
- **内置识图插件 `dsh-vision`**（`assets/plugins/dsh-vision`）：为纯文本 DeepSeek 注册 `view_image` 工具，把图片与问题转发给任意 OpenAI 兼容 VLM 端点（默认智谱免费 `glm-4.6v-flash`，可换通义 qwen3-vl / Ollama 本地 / 未来 DeepSeek 官方识图 API），答案以文本返回；无需 API key 时按插件配置或 `DSH_VISION_API_KEY` 等环境变量取用。

### 修复
- **客户端自更新“点击重启后无任何反应”**：安装版/便携版更新脚本原来以含空格的完整路径作为 `cmd /c` 的第一个参数，会被 cmd 剥掉引号而静默失败；现在把工作目录切到 `updates` 并只传脚本文件名，更新安装器可正常拉起。
## [0.3.1] — 2026-08-15

### 新增
- **设置-通用「隐藏对话输出」**：一键隐藏模型长篇文字输出，仅保留工具调用、文件操作与结果等重要信息（`assets/plugins/dsh-conversation-tweaks`）。
- **会话右侧导航滑轨**：对话区右侧提供一条跟随会话长度的虚化滑轨；鼠标悬停时在鼠标位置显示垂直短横线预览目标位置，仅点击才跳转（同插件）。
- **便携版解压缓存**：portable 版首次启动后保留 `%TEMP%\dsh-desktop-portable` 解压缓存，后续同版本启动直接复用，避免 Defender 扫描 2.4 万文件造成的分钟级冷启动。
- **异常退出看门狗与恢复提醒**：安装版内置轻量看门狗；主进程异常消失时自动拉起应用，并在下次启动时发系统通知。

### 修复
- **会话浮窗空白**：修复 `display:none` 导致 CSS Grid 自动前移、会话列宽度为 0 的根因。
- **同一会话拖出两个浮窗**：主进程按 sessionId 去重复用已有浮窗；客户端拖拽增加节流。
- **后台完成不提醒**：仅主窗口可见且聚焦时抑制通知，最小化/隐藏/失焦时正常弹通知。
- **终端路由冲突残留**：清理旧 `@deepseek-ai/dsh-terminal` 私有包，启动时自动移除过期配套插件。
- **profile 链接损坏导致启动失败（退出码 1）**：启动前调用官方 `healProfilesModuleFallback` 自愈，自动移除被复制/同步还原成真实目录的 fallback 链接。
- **托盘偶发丢失**：每 30 秒检测并在不可用时重建托盘。

### 开发
- 新增 `scripts/patch-portable-template.js`、`watchdog.js`、浮窗诊断脚本 `_float-diag.js`。
- `npm run dist` 已内置便携版缓存模板补丁，直接打包即可。

## [0.3.0] — 2026-08-15

### 新增
- **第三方模型思考强度**（`assets/plugins/dsh-third-party-thinking`）：让接入的第三方
  OpenAI 兼容模型（pi-ai 自定义 provider / openclaw-bridge 等）也能在模型选择器右下角
  调整思考强度（off / high / max），与官方 DeepSeek 模型同一位置、同一交互。官方
  DeepSeek 模型行为不受影响，已声明 reasoning 的第三方模型保留原生元数据。
- **极简模式_win Agent 预设**：基于官方极简模式，将 bash 工具替换为 Windows PowerShell
  （`@deepseek-ai/dsh-tool-pwsh`），Windows 用户可直接使用。
- **自定义提示词「预览官方提示词」**：设置页自定义提示词区域新增按钮，点击显示官方
  默认系统提示词的渲染结果（只读），方便对比修改。

### 修复
- **插件市场搜索崩溃**：非 npm 来源（GitHub / deepseekdocs）的搜索结果会触发
  `Cannot read properties of null (reading 'version')`，已修复空值判断。
- **会话浮窗内容空白**：拖出会话到独立窗口后，若服务端会话列表尚未同步目标会话，
  会因 `unknown session` 导致浮窗空内容。现增加快照内会话存在性校验，确保目标会话
  已在列表中再执行选中。

### 优化
- **会话完成通知去重**：主窗口在前台时不再弹通知，同一会话 30 秒内最多弹 1 次，
  全局 15 秒内最多弹 1 次，避免连续刷屏。
- **安装包继续瘦身**：在 0.2.3 语言包裁剪 + 冗余文件清理的基础上，进一步优化
  after-pack 清理范围。

## [0.2.0] — 2026-08-14

### 新增
- **伴侣插件体系（一切插件化）**：新增 `assets/plugins/` 机制——宿主启动时把
  配套插件同步进 web profile（`~/.dsh/profiles/web`）并幂等打 `cordis.patch.yml`
  补丁启用。本版随客户端分发的插件：
  - `dsh-terminal`：会话内终端标签页（与 对话/轨迹/文件 并列）。在当前会话项目目录
    启动持久 PowerShell（SSE 流式，非 PTY），命令历史/清屏/重启/断线重连（保留
    512KB 回放）；显式 UTF-8 mini-REPL 规避 PS 5.1 重定向 stdin 的代码页问题；
  - `dsh-file-changes` + `dsh-client-file-changes`：会话文件修改追踪与一键还原。
    「文件」标签页聚合当前会话 agent 修改过的全部文件（新建/修改/删除 + 行级 diff），
    支持逐文件/全部还原（桌面壳做内容精确匹配后替换，冲突安全提示）。数据只读复用
    会话日志已持久化的 `tool/result.meta.diffs`（fs 写前锁内全文 diff），零写入、
    零格式变更；另提供项目文件树（`/api/dsh-files/list`）、站内 HTML/端口预览
    （`/dsh-files/static/*`、`ports`、`check`），全部仅回环；
  - `dsh-balance`：对话底部统计栏内联「本轮 ¥X.XX · 余额 ¥Y.YY」小部件
    （桌面壳读 `~/.dsh/.credentials.yaml` 调 `api.deepseek.com/user/balance`，
    15 分钟刷新，可配置价格档）；
  - `dsh-plugin-marketplace`：插件市场入口。
- **客户端自更新**（`client-updater.js`）：GitHub Releases → Gitee Releases 双源回退
  （`DSH_DESKTOP_RELEASE_API` 可自定义镜像），Gitee 100MB 分片自动下载合并；
  便携版原地替换 + 自动重启，安装版引导新安装包；失败自动保留当前版本。
- **跟随官方更新**（`updater.js`）：检测 `@deepseek-ai/dsh` 新版本，经用户同意后
  用内置 node+npm 安装到数据目录 overlay，staging 原子切换、失败回退、
  启动失败一键回退内置版本；尊重 `NPM_CONFIG_REGISTRY`。
- **会话完成系统通知**：agent 任务跑完弹 Windows 通知，点击回到窗口。
- **快捷键自动维护**：便携版自动创建/重建桌面+开始菜单快捷方式（exe 移动后自愈）。

### 说明
- 便携版数据目录跟随 exe（`data\`）；安装版在 `%APPDATA%\DSH Desktop\`。
- 与 dsh CLI 共享 `DSH_HOME`（默认 `~/.dsh`），已有会话/凭据直接生效。

## [0.2.1] — 2026-08-14

### 新增
- **会话分屏独立窗口**（`assets/plugins/dsh-float-window`）：会话头「弹出独立窗口」
  图标，或把侧栏会话拖出窗口边界，即可创建浮动窗口独立查看/操作该会话（同源镜像 +
  沉浸折叠，自动选中目标会话、折叠侧栏、隐藏标题栏）。最多 8 个浮动窗口，经 IPC
  `too-many` 校验防资源过载；全部浮动窗口共享同一会话数据源、各自独立选中态。
- **自定义注入提示词**（`assets/plugins/dsh-prompt-custom`）：设置页可自定义官方内核
  每次为会话注入的系统提示词，支持「替换整体 / 追加到末尾」两种方式（应用到
  standard 完整 Agent 基准预设），新会话即刻生效。配置持久化到 web profile 的
  `settings.yaml`（`dsh-prompt` 命名空间）。
- **插件市场多源聚合**（`assets/plugins/dsh-plugin-marketplace`）：搜索聚合
  npm registry、GitHub（`topic:dsh-plugin`）与 deepseekdocs 生态三源，各源独立熔断；
  结果展示来源徽标 / stars / GitHub 链接 / 版本；支持 npm 包名与 git spec
  （`github:owner/repo#branch`、`git+https`、`https`）安装。
- **请作者喝咖啡**：chrome 栏 ⋯ 菜单新增「请作者喝咖啡」，弹层展示支付宝/微信收款码
  （`assets/sponsor/`），对照 README「支持作者」小节。
- **官方峰谷计价**：`balance.js` 加入官方峰谷计价引擎（`PEAK_PRICES` /
  `LEGACY_PRICES` / `isPeakHour()` / `effectivePrice()`），余额小部件显示当前模型与
  峰/谷价格，v4-flash 底价同步至峰时费率。

### 变更
- **终端插件更名**：`dsh-terminal` → `dsh-terminal-tab`，修复与官方
  `@deepseek-ai/dsh-terminal` 同名导致的重复路由注册与预设加载失败。

### 修复
- **会话列表刷新闪跳**：选择工作区 / 切换模式 / 开启新对话后，UI 会瞬时闪回
  「选择工作区 / 无会话」状态。根因是官方 `dsh-client-runtime` 的
  `mergeOrderedBaseline` 在会话列表刷新时会丢弃「本地已创建、宿主全量列表尚未
  回显」的新会话，使 `current` 瞬时变 `undefined`。桌面启动时
  （`applyRuntimeFlashFix`）幂等地对运行时打补丁——保留 baseline 缺席的本地会话，
  下一次 baseline 带上该会话后自动收敛为官方值。dsh 包更新后会在下次启动重新应用。

## [0.2.3] — 2026-08-14

### 优化（缩小安装体积、缩短安装时长）
- **语言包裁剪**：`electron-builder.yml` 新增 `electronLanguages: [en-US, zh-CN]`，
  移除 Electron 其余 53 个语言包（.pak，约 80MB）。不影响功能与体验——右键菜单、
  DevTools 等界面语言随系统 locale 自动取 en-US/zh-CN。
- **冗余文件清理**：`scripts/after-pack.js` 在打包后递归清理纯冗余文件
  （源码映射 `*.map`、文档与许可 `README*/CHANGELOG*/LICENSE*/*.md`、TS 构建产物
  `*.tsbuildinfo/*.d.ts` 等），覆盖 `resources/app/` 与自带 npm CLI
  `resources/npm/`。绝不触碰任何运行时文件（`.js/.json/.node/.exe/.dll`），
  功能与体验完整保留。

### 说明
- 0.2.3 为安装优化版，功能与 0.2.2 完全一致（含浮窗会话、自定义提示词、
  咖啡二维码长条三项修复），仅体积与安装时长得到改善。

## [0.2.2] — 2026-08-14

### 修复
- **自定义提示词设置不可用 / 无法输入**：官方 `dsh-host-apiproxy` 只把白名单里的
  settings 命名空间暴露给浏览器端，`dsh-prompt` 默认不在白名单，导致设置页该栏只读
  （显示「设置不可用」，无输入框）。新增 `applyPromptExposeFix()`，启动时幂等地把
  `dsh-prompt` 追加进 `WEB_SETTINGS_NAMESPACES` 暴露白名单，使输入框可正常编辑保存；
  dsh 包更新后会在下次启动重新应用。
- **会话分屏浮窗内容为空 / 按键不响应**：浮窗早期会话服务未就绪时 `sessions.open()`
  会抛 `unknown session`，首屏未选中任何会话导致内容空白。改为浮窗 preload 在页面
  JS 运行前把目标会话预置进 `localStorage['dsh.sessions.current']`，应用一启动即带
  目标会话首屏渲染（与正常恢复会话同一机制）；`sessions.open()` 保留作兜底。
- **「请作者喝咖啡」展示优化**：由全屏遮罩 + 居中卡片改为点击 ⋯ 菜单后从右上角
  （标题栏下方）展开的一条可关闭长条，两个收款码并排显示，支持 × 按钮与 Esc 关闭，
  不再把二维码平铺到页面下方。kernel/dsh-rc8

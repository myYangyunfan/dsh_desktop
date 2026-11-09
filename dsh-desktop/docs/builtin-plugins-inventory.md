# 内置插件清单

> 数据源与生成口径（2026-10-07 逐条实测对齐；v1.0.0 批量退役 11 条后由 39 收缩为 28）：
> **在册名单与序号** = `dsh-desktop/scripts/lib/companion-plugins.js` 的 `COMPANION_PLUGINS` 数组顺序（这份顺序被
> `scripts/test/unit-patch-engine.test.js:398` 的 `ids.slice(0, 18)`「前 18 条不得漂移」锁钉住，新增只能追加在末尾）；
> **版本号** = 各插件 `dsh-desktop/assets/plugins/<目录>/package.json` 的 `version`（按 `name` 字段与清单配对，不靠目录名猜）；
> **`nm` 标记** = 该目录实际存在 `node_modules`，须与条目的 `shipsNodeModules` 声明一致（不一致就是分发面漂移）。
> **上游 / 许可** = 各插件 `package.json` 的 `repository` + `license`；包体无 `repository` 时退到包内
> `README` / `description` 里的 upstream 声明（如 `dsh-basics-panel`），无 `license` 字段时看包内
> `LICENSE`。**注意这一列只到「包内自己怎么说」这一层**：它不能回答「那个上游仓库今天还在不在、许可原文有没有、
> 是不是同名的另一个项目」。逐条**原仓库路径 + 可达性 + 许可原文**的实测见 §三
> （分类计数：外部 vendored 12 / EAC 移植 1 / 自研 15 = 28——这是 28 条时代的口径；2026-10-22 新增 5 条上游件、2026-11-08 退役 3 条自研件、2026-11-09 新增 2 条上游件（dsh-context / ds-harness-remote，均 vendored 整包）后的现值见 §一 表与 §5.2 尾两行；退役的 11 条按原分类在 §一末「已退役」表里保留结论）。
> 复算口径：`require('./scripts/lib/companion-plugins.js').COMPANION_PLUGINS` 逐条查 `assets/plugins/*/package.json`
> 的 `name`/`version`，再列出「源目录存在但清单不引用」的余集——**这个余集必须为空**
> （机器锁：`scripts/test/unit-hub-registry.test.js` 的收口用例；退役三件事 = 摘清单 + 进 `RETIRED_COMPANION_DIRS` + 删源）。
> 另一条对账线：`THIRD_PARTY_NOTICES.md` §4.1 的行集与本清单**必须逐名 1:1**（2026-10-16 实测 30 行，2026-10-17 随 `dsh-reasoning-effort` 退役为 29 行）。
> **门面也在同一条线上**（2026-10-08 起）：`README.md` / `README.en.md` 各有一张 34 行插件表，包名 / 版本 / 许可
> 三列与顺序由同一个 `ledgerDiff` 对 `package.json` 与 `COMPANION_PLUGINS` 咬住，中英两份还互相对一次——
> 此前门面上的是一张 5 行「主要增强项摘要」，与在册清单从不同源，换代时永远是滞后的一份
> （锁：`scripts/test/unit-hub-registry.test.js` 的「收口：README 中英插件表…」，含版本滞后 / 漏行 / 幽灵包 /
> 许可改标 / 行序对调五种变异反证）。
> **本文所有行号锚点都是退役后复测的现值**（壳侧 `lib.rs` / `commands.rs` 本轮大改过，旧行号一律不可信）：
> `lib.rs:268-309` = `generate_handler!` 39 条、`lib.rs:1157` = POC 白名单、`commands.rs:26-70` = `CHANNELS` 38 条、
> `commands.rs:103` = `assert_eq!(CHANNELS.len(), 38)`、`shim.rs:15` = `REQUIRED_SURFACES`（同文件 `:92` 锁 46）、
> `companion-plugins.js:68-71` = openclaw-bridge 出处注释。
>
> **v1.0.0 内置线口径**（2026-10-08 裁定，反转此前的「官方形状 / 插件不进包」）：本清单里的 28 条插件
> **整树进安装包**——`dsh-tauri/scripts/stage-payload.sh` 与 `.github/workflows/tauri-release.yml`
> 的五个架构 staging 都镜像 `assets/plugins`，并以「源目录数 = payload 目录数」门禁把守
> （交付面门禁只认这一条，`ta12-stage-payload-sentinel` 逐条变异反证）。装机后首次开机由 boot 的
> sync 步把它镜像进 `<DSH_HOME>/profiles/<name>/node_modules/`，开箱可用。
> 同一份清单还承担反方向职责：源缺失时把「历史上装过的配套件」计入 `missingNames` 并撤回它们的
> `cordis.patch` 条目与 bundle 注册——所以清单**不能清空**，它是撤回依据。
> （随包 agent 预设不在此列：v1.0.0 已把源树、写入器与 boot 的 `presets` 步整体拆除，boot 链现为
> repair→sync→patches→compat-pin→preflight **五步**，见 `dsh-tauri/contracts/data-flow.md §3`。）
>
> 标记说明：`nm` = 源目录带内层 `node_modules`（`shipsNodeModules: true`，随同步分发）；
> **loader id 同源核验**：28 条里 14 条自带 `cordis.patch.yml`，其 `insert` 条目的 `id` 与清单 `id` 逐条相等
> （本次实测零偏差）；其余 14 条是自研 client 件（无 `cordis.patch.yml`，登记走清单单一来源，由
> `scripts/integration/plugin-sync.js`、`scripts/lib/hub-registry.js`、`scripts/plugin-core/lib/inventory.js`
> 按 `p.id` 消费）。新增条目的 `id` 必须与插件 `cordis.patch.yml` 的 loader id 一致（`dsh-tauri/docs/development.md` §5）。
> 作用域 `@deepseek-ai/*` 与官方内核包同名作用域，**新增条目不得撞内核闭包里的真实包名**
> （守卫：`scripts/test/unit-companion-shadow-reclaim.test.js`，遮蔽事故见第一节末的「已退役」表）。
>
> **逐插件的「更新判定 + 兼容判定」见 §五**（2026-10-08 按 `oh-my-dsh/dsh-plugin-upgrade-skill` 的
> fleet-sweep 规程对在册 28 条逐条实测的台账）。两条新机器锁在
> `scripts/test/unit-plugin-peer-floor.test.js`（4 用例）与
> `scripts/test/unit-plugin-module-table.test.js`（13 用例，六条静态扫：peer / 模块表成员链接 A/B /
> 浏览器模块图 C / `dsh.client` 声明可解析性 / 已移除服务引用 / manifest 入口可见性），纯函数面收敛在
> `scripts/lib/plugin-module-table.js`。§一～§四 回答「是谁、从哪来、什么版本」，§五 回答
> 「能不能挂上宿主（现 pin `0.2.1-rc.2`）、挂了会不会静默失效、全新 clone 拿不拿得到入口」。

## 一、内置插件（在册 33 条，`assets/plugins` 实存 33 个源目录，与清单 1:1）

> 下表逐条与 `COMPANION_PLUGINS` 顺序、各 `package.json` 的 `name`/`version`/`license`/`repository`、`node_modules`
> 实存情况对齐过（2026-10-07 远端批量更新后复测），序号 / loader id / 包名 / 版本 / `nm` 五列零偏差；
> `nm` 一条（#12 `dsh-pocket`）与 `shipsNodeModules` 声明一致；#11 `compaction-acp` 的 `nm` 已随 0.2.26 下线
> （上游 tsup 把 `acp-kernel` 内联进 `dist/index.js`，改用宿主闭包，见 `companion-plugins.js:57-61` 注记），
> `assets/plugins` 目录数同为 28、清单外余集为空。
> 这 33 条**整树进安装包**（内置线，交付面有「源数 = payload 数」门禁），同一份清单还是 boot 的 sync 步
> 做「历史配套件撤回」的依据——两个职责共用一份名单，别把「随包分发」误读成「清单只是分发清单」。
> **「一句话作用」列的 2026-10-08 逐格审计**：五格与包体实交付字节不符，已就地更正——#3 `better-sidebar`
> 的 `tasks` 是 subagent 标签的标题不是第四个 id（`builtinTabs()` 实测 5 个 id）、#6 `dsh-super-injector` 漏记
> 设置页插件管理 UI、#11 `billion-context-dsh` 漏记四个模型工具与 `/acp-prune`、#15 `dsh-easyrewrite` 漏记版本翻页器
> 与自带设置中心、#22 `dsh-basics-panel` 的 `FEATURES` 实测是 4 项不是 3 项（多出「归档会话」，与 #4 职责重叠）。
> 这一列**不在机器锁里**（名字 / 版本 / `nm` / §5.2 七数才是），所以它靠逐格对产物重放维护，改动要附命中行号。
> **2026-10-09 复算（#3）**：better-sidebar 的文件体验换成 PACK/VSCode 统一模型——常驻左侧文件栏 +
> 每文件一个去重标签（点文件不再原地替换），cell 已同步；证据：产物 `lib/client.js` 里 `explorerRail`
> 11 命中、`editorExplorer` 在 `src/` 与两份频道产物 0 命中。

| # | loader id | 包名 | 版本 | 一句话作用 | 上游 / 许可 |
| --- | --- | --- | --- | --- | --- |
| 1 | `balance` | `@deepseek-ai/dsh-balance` | 0.2.0 | 账户余额 + 本轮会话费用估算，注册到对话统计栏 dock | 自研（0.1.2 起余额投递改走宿主 HTTP 路由，见 `docs/balance-architecture.md`；0.2.0 起导出 Config 三条 volatile 设置条目 `showBalanceDock` / `showOpenCodeGoUsage` / `balancePrices`，开关由客户端半自注册到「设置 → 通用」（内核**不**按 Config 自动生成页面），壳层 ⋯ 菜单 toggle-balance 同批退役 2026-10-16） |
| 2 | `file-changes` | `@deepseek-ai/dsh-file-changes` | 0.1.0 | 会话文件更改投影（折叠 tool/result 的 meta.diffs） | 自研 |
| 3 | `better-sidebar` | `dsh-better-sidebar` | 0.24.2 | VSCode 式右栏：文件/编辑器合并成一个 editor 标签（2026-10-09 起：常驻左侧文件栏 + 每文件一个去重标签，点文件不再原地替换）+ 统一变更页（git 与会话双镜头共用一套 diff 栈）+ subagent（标题「任务管理」）/ sidechat / diff，共 5 个内置标签（`builtinTabs()` 实测 id 集 = editor / git / subagent / sidechat / diff；先前多记的 `tasks` 是 subagent 标签的**标题**而非第四个 id，全树 `id: "tasks"` 0 命中），按会话隔离，并向其他插件开放标签注册服务；terminal/browser 交还宿主 | vendored 社区包 `omdsh-dev/DSH-better-sidebar`，MIT（**本轮按用户点名吸纳上游**：镜像 npm 0.24.1 全量重皮 + 9 个构建面文件，旧「d-pack 0.15.4 / npm 0.24.1 均不取」判据作废；**三项自研能力实测已随 0.24.1 在位、本仓无待回吸差量**（chunk 自动重试、editor-features、#171 文件查看兜底；逐条判定与丢掉的死代码见 §五 5.2 #3），跨代兼容改动见 §五 5.2 #3） |
| 4 | `dsh-session-manager` | `dsh-session-manager` | 0.1.0 | 会话行删除按钮 + 设置内「归档对话管理」面板（恢复/删除） | 自研（**但包名撞社区已发布包** `hkkz9522/dsh-session-manager`，npm 0.6.2；非其衍生，见 §三 3.5 风险 4） |
| 5 | `conversation-tweaks` | `@deepseek-ai/dsh-conversation-tweaks` | 0.1.1 | 隐藏长篇对话输出 + 会话右侧导航滑轨 | 自研（0.1.1 设置通道迁 `ctx.remote.settings`） |
| 6 | `dsh-super-injector` | `@dsh-external/dsh-super-injector` | 0.3.1 | 运行时注入任意本地插件包（junction + loader.create，不重启）、热重载、一键卸载、路由自愈，**外加设置页的插件管理 UI**（列表 / 卸载 / 拖入目录「内化」成新插件 / 挂区转正，`lib/index.js:3375` 起 `settings.section` 半边后端 + `POST /ingest`；「内化」是 0.3.1 新增，先前本格漏记） | 外部插件，manifest 标 BSD-3-Clause，但**既无唯一原仓库、也无许可原文可引**（见 §三 3.1 与 3.5 风险 2） |
| 7 | `prompt-custom` | `@deepseek-ai/dsh-prompt-custom` | 0.5.0 | 在设置页自定义官方注入的系统提示词（整体替换 / 追加），含提示词卡：卡片即提示词（点芯片一键切换、正文写回当前卡），全套内核设计系统原语 | 自研（0.1.1→0.3.5 由 d-pack 覆盖跨 minor——那一轮共 4 条跨 minor、另 3 条来自外部上游，见 §五；**0.4.0 为本仓本地升级线**：提示词卡 host/client 双半 + 回归套件随迁，API_PROTO 2→3；**0.5.0 = 交互与视觉重做**：卡片即提示词（芯片切换 / 写回当前卡 / dirty 三选面板）+ 内核原语界面，宿主与协议零改动） |
| 8 | `workspace-anchor` | `@deepseek-ai/dsh-workspace-anchor` | 0.1.1 | 把当前工作目录写进稳定系统提示的锚点块，防 agent 目录漂移（不碰权限）。0.2.1-rc.1 起内核不再注册 `{{cwd}}` 变量，锚点改由插件自填实路径 + `interpolate: false`，并自己把 `cwd` 变量按 rc.2 原形状补回去 | 自研 |
| 9 | `wsl-settings` | `@deepseek-ai/dsh-wsl-settings` | 0.1.0 | 设置页「WSL 后端」栏：local↔wsl 切换、发行版与安装目录、状态探活 | 自研 |
| 10 | `bot` | `ds-bot` | 0.2.0 | Bot 团队：主 Bot + 长期 Bot + 群聊，Bot 间 @ 转交、群共享记忆、能力库与用量页（loader id `bot`；vendored patch 不接管 web.searchProvider，搜索仍走 dsh-free-search） | Fei2411/DeepSeek-Bot，**Apache-2.0**（上游 README 标 DSH 0.2.1-rc.2；npm 0.2.0） |
| 11 | `compaction-acp` | `billion-context-dsh` | 0.2.27 | Active Context Pruning，作为 CompactionEngine 后端的模型驱动上下文管理，**并注册 `compress` / `decompress` / `search_context` / `acp_status` 四个模型工具 + `/acp-prune` 斜杠命令**（`dist/index.js:6338` 的 `tools.register` 循环与 `:6352` 的 `ctx.get("commands")` 实测；先前本格只记了引擎半边） | `Tyan66666/billion-context-dsh`，MIT（0.2.27 = npm latest，高于 d-pack 0.2.2；内层 `node_modules` 随本版下线；peer 上界放宽与 dist 入口纳入判据见 §五 5.2 #12） |
| 12 | `dsh-pocket` | `dsh-pocket` `nm` | 2.12.0 | 手机扫码实时同屏操控桌面 web（WebSocket 透传 + cloudflared 公网隧道 + 二维码配对） | shaobeichen/dsh-pocket，**GPL-2.0**（2.12.0 = npm latest；2026-11-09 由 d-pack 线 2.10.7 切到 npm 线） |
| 13 | `openclaw-bridge` | `@deepseek-ai/dsh-openclaw-bridge` | 0.8.1 | 微信 / 飞书官方频道桥接入 DSH agent 会话（分片回写、去重限流） | `hzhz314159/openclaw-dsh-bridge`，MIT（0.8.1 起设置面换成 codegen `settings-host` 垫片，`ctx.settings.register` 形态作废，锚点见 `scripts/test/unit-openclaw-settings-inject.test.js`） |
| 14 | `input-history` | `dsh-input-history` | 0.1.1 | 输入框 ↑/↓ 终端式已发送消息回溯（空草稿才触发、编辑即复位、按会话隔离） | 自研 |
| 15 | `dsh-easyrewrite` | `dsh-easyrewrite` | 3.0.1 | 消息撤回 / 重编辑 + 版本翻页器 `< X >`（撤回/重发产生的版本家族切换）+ 自带设置中心与草稿自动备份（0.6.4 起取代自研 dsh-message-rewind；后三项是 2.6.0 的自带面，`lib/client.js:2577/4324` 与 `lib/index.js:319` 的 `ctx.settings.register` 实测，先前本格只记了撤回半边） | Renzic-Stone/DSH-EasyRewrite，MIT（3.0.1 = npm latest，2026-11-09 由 2.6.0 升级；2.6.0 起 `data-time-hover-root` 由它自写自收窄，不再是宿主锚） |
| 16 | `change-review` | `dsh-change-review` | 0.1.2 | AI 变更审核：让模型复查自己刚做的改动（正确性 / 安全性 / 目标一致性） | 自研 |
| 17 | `offpeak` | `dsh-offpeak` | 1.0.1 | 峰谷价格卫士：高峰时段拦截发送提醒，可定时到低价时段自动执行 | `christophersmith2737-commits/OffPeak`，MIT（vendored，非自研；上游 main 仍 1.0.0，1.0.1 取自 d-pack） |
| 18 | `settings-nav-custom` | `dsh-settings-nav-custom` | 0.1.1 | 设置页左侧导航项显示 / 隐藏与排序（localStorage 持久化） | **EAC 移植**（`DSH-EAC/EAC-Desktop`，`LICENSE` 署 Deepseek Harness EAC contributors，MIT） |
| 19 | `settings-groups` | `dsh-settings-groups` | 0.1.1 | 把设置「常规」页低频选项收进底部可折叠「高级选项」组 | 自研（README 自称「EAC 配套插件」不构成来源证据，见 §三 3.2 末的反例说明） |
| 20 | `synapse` | `dsh-synapse` | 0.3.1 | 非线性对话画布：同工作区的会话 / 追问 / 分支可视化拖拽 | liangmianya/dsh-synapse，MIT（**分叉件，两条通道都不取整包**，逐文件实测见 §五 5.5：npm/upstream 0.4.2 是另一条功能线，取它会覆盖我们的深色适配桥（`client.js`）与水位线增量重放 + 存储上限（`index.js` 13 个符号）并且不带任何测试；**本仓 0.3.1 已吸收 d-pack 0.3.1 的 `sessionEvents()` 兼容口**——`app.js`/`styles.css`/`test/` 与 d-pack 逐字节相同，回填路径改走 `snapshotEvents()`，不再读已下线的 `session.events`；测试夹具同步改成真实宿主形状（无反证：旧 0.3.0 代码在 25 例中 7 例红）） |
| 21 | `dsh-subagent-lens` | `@dsh-external/dsh-subagent-lens` | 0.1.1 | Task/subagent 展开式活动视图 + 会话头部命令/文件聚合条（零额外后端请求） | 自研（**却借了 `@dsh-external` 作用域**：npm 与 GitHub 上该名下无任何仓库，见 §三 3.5 风险 3；0.1.1 起页内 bundle 注册名 = 包名，设置通道迁 `ctx.remote.settings`） |
| 22 | `basics-panel` | `dsh-basics-panel` | 0.4.2 | 设置页可视化并管理 MCP 服务器 / 技能 / 规则 / **归档会话**（空态带「新建」入口；`FEATURES` 实测 4 项，「归档会话」是 0.4.1 新增 tab，先前本格只记了三 tab，且它与 #4 `dsh-session-manager` 的归档管理面板职责重叠） | yxsj245/dsh-Basics-Panel，MIT（0.4.1 = 上游 main/master 同版，npm 未发布；d-pack 只有 0.1.1，故走外部上游并**本地跑它的构建**） |
| 23 | `input-fold` | `dsh-input-fold` | 0.1.1 | 超长用户提示词默认折叠为前几行 + 「展开」遮罩（>400 字或 8 行才生效） | 自研 |
| 24 | `prompt-optimizer` | `dsh-prompt-optimizer` | 3.0.0 | 输入框旁一键分析并优化草稿（SSE 流式上屏；默认实时复用当前会话模型；无上下文走结构模板、有上下文提炼目的顺势润色；保真自检、斜杠命令前缀保护；结果可替换/撤回/复制；设置页可配模型、调用参数与上下文） | `Y1X1n/dsh-prompt-optimizer`，MIT（**2026-10-19 起为 vendored 上游 0.6.1**，本地版本线 3.0.0——沿用包名与 loader id 以便老 profile 原地覆盖。上游 npm 包名是 `@y1x1n/dsh-prompt-optimizer`；**勿按 npm 裸名 `dsh-prompt-optimizer` 更新**，那是 `winditer` 的另一实现。旧 2.4.0 自研升级线已整体退役，历史见 §5.2 #26） |
| 25 | `dsh-builtin-manager` | `dsh-builtin-manager` | 0.2.0 | 「设置 → 插件」里的内置插件页：搜索 / 状态筛选 + 单列表逐条查看随包内置件并启停（行内反馈与「已改动」标记；启停下次启动生效，写入走桌面壳 `dsh:plugin-set-enabled`） | 自研（**0.2.0 = 交互与视觉重做**：工具栏搜索 + 全部/已启用/已停用筛选（计数与列表同源）+ 单列表行内反馈，全套内核设计系统原语；宿主与写入链零改动） |
| 26 | `goal-completion` | `@deepseek-ai/dsh-goal-completion` | 0.1.0 | 内核右栏「目标收尾」标签页：当前会话目标的状态机（phase 四态 + activation + 轮次/修订 + 受阻原因），并补上官方 GoalBar 没有的 `complete` 动词（两次点击确认，CAS 由内核判） | 自研（2026-10-16 新增；界面走 sanctioned 面——`ctx.locale.register/bind` 字典命名空间 + 槽位 `locale: NS` 由 renderer 注 `t`，控件用内核原语 `Tag`（八档语义色）/ `Button`（四档 variant），不覆盖原品配色） |
| 27 | `web-search-free` | `dsh-free-search` | 0.9.39 | 免费多引擎搜索：注册 `ctx.web` 搜索 provider，内置 `web_search` 自动选用（loader id 是 `web-search-free`，不是包名） | `DDDMUC/dsh-free-search`，MIT |
| 28 | `shop` | `dsh-plugin-shop` | 0.9.3 | 插件商店：浏览 / 安装 / 启停 / 更新 dsh 插件（loader id 是 `shop`，客户端 bundle id 才是包名） | `LivXue/dsh-plugin-shop`，**Apache-2.0** |
| 29 | `network-proxy` | `@local/dsh-network-proxy` | 1.0.4 | 运行时代理：设置「通用」里的 HTTP 代理行，读系统代理并热切换 fetch dispatcher；包名保留上游 `@local/*`（改名会让 GitHub 更新回来的行对不上） | `baizhizzl/dsh-network-proxy`，MIT |
| 30 | `mcp-manager-ui` | `dsh-toolbox-ui` | 1.10.1 | MCP / 技能工具箱：右下悬浮面板，MCP 市场与技能管理；宿主半边静态导入 `smol-toml`（BSD-3-Clause，见 `THIRD_PARTY_NOTICES.md` §1.1） | `Imzl-zl/dsh-toolbox-ui`，MIT |
| 31 | `dsh-notify` | `@bittersmilezzz/dsh-notify` | 0.4.5 | 桌面通知：渲染进程 Web Notification 六类事件 + 点击回会话，v1.0.6 起取代壳层「回合完成」通知 | `bitterSmilezzz/dsh-notify`，MIT |
| 32 | `dsh-context` | `dsh-context` | 0.83.0 | 上下文透视：右栏上下文看板 + `/context` 命令，拆解当前上下文由什么构成、如何随轮次演变（bundle 层 loader id 与包名同形；宿主半边只依赖 zod / `dsh-session` / schemastery，无内层依赖树） | `bowenliang123/dsh-context`，**Apache-2.0** |
| 33 | `ds-harness-remote` | `ds-harness-remote` `nm` | 0.6.4 | 端到端加密远程访问：桌面 / Web / 安卓远控本机 DSH，含 dsh-TUI Host 支持；内层 `node_modules` 随包正件分发（`shipsNodeModules`），WebRTC 走纯 JS `werift`（不装 optional 的 `@roamhq/wrtc`） | `liguobao/ds-harness-remote`，MIT |

### 已退役（源目录已删除；`RETIRED_COMPANIONS` 只留「名字」给 profile 回收用）

> v1.0.0 分两批退役：`plugin-manager`（遮蔽官方内核包，单独退役）与 2026-10-07 的**批量 11 条**。
> 「退役」= 摘清单 + 进 `RETIRED_COMPANIONS` + 删源目录三件事一起做（机器锁：`scripts/test/unit-hub-registry.test.js` 的收口用例）。
> 存量机器的回收由表驱动机器完成：`scripts/lib/companion-profile.js` 的 `removeRetiredCompanionDirs`（目录 + profile manifest 撤账）
> 与 `removeRetiredCompanionPatchRows`（`cordis.patch.yml` 登记行 + 历史「随包默认禁用」行），boot 与 CLI 双入口都已接线；
> 判据与反证用例见 `scripts/test/unit-companion-bulk-retire.test.js`。
> **两条铁律**：撤账必做（摘出清单就失去「源缺失 → missingNames → 通用撤账」那条路）；删目录要有镜像证据
> （`private:true` 或描述含「DSH Desktop」——npm 拒发 private 包，所以它是本地副本的强证据）。
> `graph-memory` / `harness-pet` / `dsh-cardian` 的上游 `package.json` 与我们的镜像逐字段相同、**无法区分**，
> 所以**回收机器在用户 profile 里对这三类既不删目录也不撤账**（登记一并保留——撤了等于改用户意图；未注册的
> 目录是惰性的，不会被 loader 挂载），用户数据一个字节都不动（反证用例：`unit-companion-bulk-retire.test.js`
> 的「无镜像证据的同名目录」）。**这一条只管用户机器，不管仓库**：仓库里的 12 个源目录是手工整树删除的——
> `assets/plugins` 不存在「用户自装」歧义，2026-10-08 实测目录数 28 = 清单条数，这三条一个都不在盘上
> （由收口用例的「磁盘有 X 但账本漏行 / 账本里的 X 找不到对应包」两侧共同钉死）。

| # | loader id | 包名 | 末版 | 退役原因与残留面 |
| --- | --- | --- | --- | --- |
| — | ~~`plugin-manager`~~ | `@deepseek-ai/dsh-plugin-manager` | 0.1.2 | v1.0.0 退役：包名与官方内核包**同名**，镜像进 `profiles/web/node_modules` 后按 Node 解析顺序遮蔽安装锚点里的官方 `pluginManager` 服务，内核插件页因此报「本部署没有可管理的 profile」。退役三件事一起做：摘清单（`COMPANION_PLUGINS`）+ 进 `RETIRED_COMPANION_DIRS`（存量遮蔽由 `companion-profile.js` 的过期配套清理按名字回收）+ 删源目录 `assets/plugins/dsh-plugin-manager`（全文见 git 历史）。原挂在它健康卡上的 issue #175 网关键防漂移锁已迁到 `scripts/test/unit-composition-integrity.test.js`，`rv9-hotpath-smoke.test.js` 相应下线一节。**批量回收机器对这条只认领目录、绝不做 manifest/patch 手术**（`dirsOnly`）——官方实现合法的登记行会被误撤 |
| — | ~~`client-file-changes`~~ | `@deepseek-ai/dsh-client-file-changes` | 0.1.0 | 自研。「文件」视图（更改列表 + 一键还原，还原动作由壳执行）。壳侧专属能力 `file_revert` 命令与 `commands/file.rs` 的还原实现随之拆除；文件更改投影仍在册（#2 `file-changes`） |
| — | ~~`terminal`~~ | `@deepseek-ai/dsh-terminal-tab` | 0.1.0 | 自研。会话内交互式命令行标签（SSE 流式，非 PTY），会话内终端由内核官方能力承担。patch 面同时认领历史 loader id `dsh-terminal`（issue #87 的 `\b` 边界事故就出在这对名字上） |
| — | ~~`harness-pet`~~ | `harness-pet` | 0.2.0 | `cakeni/harness-pet`，MIT（社区项目，非官方；root 200 / LICENSE main 200，npm 未发布 404）。桌宠悬浮窗。壳侧 `pet_window` / `pet_close` / `pet_move_to` / `pet_set_auto_open` 等 pet_* 命令与 `windows.rs` 的宠物窗实现整体拆除；原「随包默认禁用」块（issue #34 的 rAF 逐帧 canvas 阻塞）连同 #183 的「默认禁用只交付一次」快照探测一起下线，老 profile 里写过的禁用行按形状回收 |
| — | ~~`dsh-vision`~~ | `@dsh-external/dsh-vision` | 0.3.0 | `william-jin-cmu/dsh-vision`（旧址 `dsh-external/dsh-vision` 已 301 更名），BSD-3-Clause。给纯文本模型加 `view_image`。专属内核补丁 `image-send-fix` 与 `patch-adapters.js` 的 `IMAGE_SEND_*` 注入面一并退役，`SETTINGS_NAMESPACES` 去 `'dsh-vision'`（4→3），`scripts/verify-vision-upgrade.js` 删除；`content-has-image-guard` 是内核通用守卫，**保留** |
| — | ~~`graph-memory`~~ | `graph-memory` `nm` | 1.6.0-beta.1 | `adoresever/graph-memory`，MIT（包内 `LICENSE`；`package.json` 无 `license` 字段）。跨会话图记忆 + PageRank / 社区检测 / 向量去重。`prompt-context-literal` 补丁的立论从「graph-memory 的非法变量名模板」改写为「任何插件写入的非法变量名模板」，守卫本体**保留**（退役它会把崩溃面放大）。带内层 `node_modules` 的镜像无法与用户自装区分 → **回收机器在用户机上对它不删不撤**（仓库源目录照删，见本节首的「只管用户机器」条款） |
| — | ~~`community-market`~~ | `dsh-community-market` | 0.1.1 | `anywhere-labs/dsh-desktop`（旧址 `anywhere-labs/deepseek-harness-desktop` 已 301 更名），MIT。可视化插件市场（开放目录源 / 搜索 / npm 校验安装 / 启停回执）。`scripts/patch-community-market-restart.js` 一并删除 |
| — | ~~`market-desktop-bridge`~~ | `dsh-market-desktop-bridge` | 0.1.1 | 自研。给上条市场供 `desktopProfiles` / `desktopPnpm` / `desktopPlugins` / `desktopActions` 四个 host 服务，与市场本体同装卸载；无客户端半边，故无界面残留 |
| — | ~~`dsh-hub`~~ | `dsh-hub` `nm` | 1.1.5 | `ARFCON/dsh-hub-DSH`，MIT（**npm 同名包 `dsh-hub@0.0.1` 是另一个项目**，按名安装会装错）。插件中枢（版本对比 / 一键更新 / 启停 / 卸载 / 启动自检修复 + 全局记忆）。注意别与仍保留的 `scripts/lib/hub-registry.js` 混淆——那是 **dsh-hotplug-hub** 的识别面（issue #156 止血后的口径），与本条同名不同物 |
| — | ~~`file-drop`~~ | `dsh-file-drop` | 0.3.0 | **EAC 移植**（`DSH-EAC/EAC-Desktop`，旧址 `zouyuxuan122/Deepseek-Harness-EAC` 已 301 更名；包内 `LICENSE` 署 `2026 Deepseek Harness EAC contributors`，MIT；该仓 `SOURCES.json` 里没有 `dsh-file-drop` 条目，所以「EAC 内部哪个目录」未能定位）。多选附件 + 拖入 + 粘贴三路统一。壳侧专属能力随之拆除：拖放预处理整段本来住在 `src/app/src/lib.rs` **末段**（`CLIENT_FILE_DROP_EVENT` / `DROP_*` 常量 / `drop_ext` / `drop_kind` / `DropPrecheck` / `precheck_drop_paths` / `route_drag_drop`），另有两个消费它的测试件 `src/app/tests/file_drop.rs` 与 `dsh-desktop/scripts/test/ta2-file-drop.test.js` 系——**不是独立模块文件**，现役树上只剩 `lib.rs:2332-2336` 的裁撤注记；`drag_drop_enabled` 未仓内显式配置（保持 tauri-utils `WindowConfig` 默认）。图片仍走内核官方附件管道 |
| — | ~~`image-paste`~~ | `dsh-image-paste` | 0.1.0 | 自研（README 自称「EAC 配套插件」，但 EAC 的 `SOURCES.json` 反向记源为我们的 monorepo——EAC 是下游，见 §三 3.2）。剪贴板图片存临时目录并注入路径提示。壳侧专属命令 `image_paste_save` 一并拆除 |
| — | ~~`cardian`~~ | `dsh-cardian` | 0.14.0 | `myYangyunfan/dsh_cardian`，MIT（我们自己的独立发布仓）。知识中心：RepoWiki / 知识卡片 / 记忆三区。其为「带点号工具名」清洗过的 `pi-ai-tool-schema-sanitize` / `pi-ai-responses-tool-name-sanitize` / `pi-ai-tool-name-wire` 三件补丁按 wire/schema 形状**保留**（cardian 降为历史现场），原「随包默认禁用」块下线、老 profile 的禁用行按形状回收 |

## 二、壳层小功能（Tauri 侧，命令面 = `dsh-tauri/src-tauri/src/app/src/lib.rs:269-314` 的 `generate_handler!` 全表，实测 40 条）

| # | 能力 | 入口 / 命令 |
| --- | --- | --- |
| 0 | 渲染层初始化 | `app_init`（`contracts/ipc-commands.md` 的 `chrome:init` 半边，回填版本/内核状态/平台） |
| 1 | 窗口与托盘 | `window_control`、`menu_action`、`closeToTray`（关窗≠退出，内核 node 继续跑）、单实例守卫、loading 页 |
| 2 | 装配失败自恢复 | `page_error`、`renderer_heartbeat`、`recovery_state` / `recovery_reload` / `recovery_restart` / `recovery_open_logs`（终态是恢复页，不是退出） |
| 3 | 内核服务监管 | `restart_service`、`current_session` |
| 4 | 壳侧插件管理页 | `plugin_list`、`plugin_set_enabled`、`plugin_uninstall`、`plugin_restore`、`plugin_check_updates`、`plugin_update`、`plugin_list_dead_entries`、`plugin_remove_dead_entries` |
| 5 | 文件与剪贴板 | `file_open`、`copy_text`、`open_external`（`file_revert` 与 `image_paste_save` 已于 2026-10 随 dsh-client-file-changes / dsh-image-paste 退役移除） |
| 6 | 余额与费用 | 壳侧无命令：`balance_refresh` / `dsh:balance-refresh` 与「Rust 轮询环 + sidecar `balance-fetch` + 垫片 `balance-changed`」那条零消费方遗留线已于 2026-10 整体拆除（通道号 3173 不复用）。页面余额只读内置插件 `dsh-balance` 宿主半边在内核 webServer 注册的两条回环路由（`GET /api/dsh-balance/state` + `POST /api/dsh-balance/refresh`），见 `docs/balance-architecture.md` §1.2 |
| 6 | 诊断 | `diag_run` / `diag_export` / `diag_validate` / `diag_order` / `diag_order_apply` / `diag_remove_bundle`，加 `DSH_TAURI_DIAG=1` 页面探针、`DSH_TAURI_DEVTOOLS=1` |
| 7 | 配置备份 | `backup_export`、`backup_restore` |
| 8 | WSL 后端 | `wsl_config_get`、`wsl_config_save`、`wsl_recheck` |
|  9 | 悬浮窗 | `float_window` / `float_close`（桌宠四命令 `pet_window` / `pet_close` / `pet_move_to` / `pet_set_auto_open` 已随 harness-pet 退役移除） |
| 10 | 赞助与守卫 | `sponsor_window` / `sponsor_qr`、`guard_action`（plugin-guard） |
| 11 | 更新链 | GitHub / Gitee 双源检查（`dsh-tauri/scripts/verify-update-sources.mjs` 校验，用例 `ta12-verify-update-sources.test.mjs`） |

> 复算命令面：`sed -n '268,309p' dsh-tauri/src-tauri/src/app/src/lib.rs` 抽 `commands::name` 去重，实测 39 条
> （区间就是 `generate_handler![` 到 `])`，268-309 逐行实测；39 条全部在 §二 表里点名过，实测缺名 0 条）。
> 其中 **`poc_echo_json` 是唯一「注册但非契约」的命令**（桥 POC 回声，留在 `lib.rs:1157`
> `contract_audit::no_extra_commands_beyond_contract_and_poc` 的显式白名单里）；其余 38 条与
> `crates/bridge/src/commands.rs:26-70` 的 `CHANNELS` 表 1:1（实测条目同为 38 条，`m()`/`mp()`/`mp3()` 三种
> phase 构造函数，`cut` 全 false、fire-and-forget 4 条），机器锁就在同文件 `:103`
> （`assert_eq!(CHANNELS.len(), 38)` 与 `cut` 计数 0）。`CHANNELS` 即 `contracts/ipc-commands.md` 的机器侧同义表——
> **加桥命令不改契约 = 契约审计三项测试直接红**。
> 页面侧对偶面：`contracts/bridge-api.md` §2 方法表 46 项 ↔ 垫片 `dshDesktop` 实际挂载（双向锁在
> `ta7-contract-audit.test.js` 的 TA7-7a/7b），锚点集在 `crates/bridge/src/shim.rs` 的 `REQUIRED_SURFACES`
> （同为 46）。2026-10 随插件退役移出 8 个方法面（`revertFiles` / `imagePaste.save` / `petWindow.*` 六面），
> 同月拆 Electron 余额遗留线再移出 `refreshBalance`（原编号 3，断号不复用）。

## 三、外部插件的原仓库路径（2026-10-07 逐条实测）

> §一 的「上游 / 许可」列只到**包内元数据**这一层（`package.json` 的 `repository` + `license`）。
> 本节回答的是另一问：**这些代码真正来自哪个仓库、那个仓库今天还在不在、许可原文有没有**。
> 分类计数（2026-10-07 快照口径）：**外部 vendored 12 + EAC 移植 1 + 自研 15 = 28**；2026-11-08 再退役 3 条自研件
> （`dsh-quest-ui` / `dsh-auto-compact` / `dsh-zcode-migrate`），本节三张表已按新编号重映射。退役件的原判据并入 §一末的「已退役」表。
> 在册条数以 §一（33 条）为准。

### 取证通道（三层，全部今天复跑）

1. **包内元数据**：`assets/plugins/*/package.json` 的 `name`/`version`/`license`/`repository`/`homepage`/`author`
   + 包内 `LICENSE` 的版权行 + `README`/`*.md` 里的 `github.com/<owner>/<repo>` 链接。
2. **姊妹发布面的审计结论**：本地 remote `origin` = `https://github.com/myYangyunfan/dsh-pack.git`
   （已 fetch，`origin/main` = `a064e1005`），读它的 `THIRD_PARTY_NOTICES.md`（由 `tools/codemod/scan-licenses.mjs`
   从磁盘实扫生成）、`not-shipped/README.md`（两个「不可再分发」包的完整调查过程）与 `packages/*/package.json`。
   这一层的价值在于它**已经替我们做过一次许可核查**，且结论比我们的清单更严格。
3. **可达性直探**：`https://github.com/<owner>/<repo>` 的状态码与 301 目标、
   `https://raw.githubusercontent.com/<owner>/<repo>/{main,master}/LICENSE`、
   `https://registry.npmmirror.com/<包名>` 的 `dist-tags.latest` + `repository`，
   以及 EAC 母项目自己维护的**来源账本** `DSH-EAC/EAC-Desktop` 的 `dsh-desktop/assets/SOURCES.json`
   （108,111 B，实测 200）与 `.sync/plugin-distribution.json`（10,970 B）。

本机 **GitHub API 被封锁、HTML 与 raw 通道可达**，所以判据只用「状态码 + 原文文本」，不用 API 字段；
npm 侧统一走 `registry.npmmirror.com`。表里 `root=` 是仓库页状态码，`LICENSE=` 是 raw 通道命中的分支与状态码。

### 3.1 外部 vendored（11 条）—— 有明确上游仓库

> 原 17 条里的 5 条外部件（`dsh-vision`、`graph-memory`、`community-market`、`harness-pet`、`dsh-hub`）
> 已随 v1.0.0 批量退役下线，它们的上游仓 / 可达性 / 许可实测结论保留在 §一末「已退役」表，不再重复登记。

| # | loader id | 包名 | 原仓库（owner/repo） | 实测 | 判据出处 |
| --- | --- | --- | --- | --- | --- |
| 3 | `better-sidebar` | `dsh-better-sidebar` | `omdsh-dev/DSH-better-sidebar` | root 200 / LICENSE main 200 | `package.json#repository` 明确声明；npm latest 0.24.1（= 我们 0.24.2 的上游基线，0.24.2 是本地跨代修复版：宿主半边 `inject` 由已下线的 `webRuntime` 改 `connection`，见 §五 5.2 #3）；社区目录条目 `awesome-dsh-plugin/awesome-dsh-plugin@44ae0afa:data/plugins/omdsh-dev__DSH-better-sidebar.yml` 200 |
| 6 | `dsh-super-injector` | `@dsh-external/dsh-super-injector` | **未判定**（见 3.5 风险 2） | `dsh-external/dsh-super-injector` root **404** / LICENSE 无 | 包体无 `repository`/`homepage`/`author`；npm 两个候选名均 404；同名仓 5 个（`gongyijie85`/`lanbaolu`/`lileikeji`/`wendou-chen`/`yjh051108` 的 `dsh-super-injector`）无一可判为原创 |
| 10 | `bot` | `ds-bot` | `Fei2411/DeepSeek-Bot` | root 200 / LICENSE 200（Apache-2.0） | `package.json#repository` 明确声明并带 `directory: ds-bot`；npm 0.2.0 与上游 README 的 v0.2 预览线同版，上游明标兼容 DSH 0.2.1-rc.2（与本仓 pin 相同）。本仓 vendored patch 只保留 `bot` 注册，不复制上游的 `web-search-auto` / `web.searchProvider: auto` 覆盖（避免与 dsh-free-search 抢 provider） |
| 11 | `compaction-acp` | `billion-context-dsh` | `Tyan66666/billion-context-dsh`（谱系上游 `ranxianglei/billion-context-pi`） | 两者 root 200 / LICENSE 200（前者 main、后者 master） | `README` 同时链到两个仓；上游 `main` 与 npm latest 同为 0.2.26，**与我们逐版相同**（本轮由外部上游通道更新；d-pack 只有 0.2.2）。0.2.26 起 dist 内联 `acp-kernel`，内层 `node_modules` 与 `shipsNodeModules` 同批下线 |
| 12 | `dsh-pocket` | `dsh-pocket` | `shaobeichen/dsh-pocket` | root 200 / LICENSE main 200 | `repository` + `homepage`；npm latest 2.10.6，**我们 2.10.7 取自 d-pack 发布面**（高于 npm）；`LICENSE` 是标准 GPL-2.0 文本（FSF 版权头） |
| 13 | `openclaw-bridge` | `@deepseek-ai/dsh-openclaw-bridge` | `hzhz314159/openclaw-dsh-bridge` | root 200 / LICENSE main 200 | `package.json#name` 与我们的完全一致，上游 `main`/`master` 实测 `@deepseek-ai/dsh-openclaw-bridge@0.8.0`/MIT —— 同名同仓，最强判据；**我们 0.8.1 取自 d-pack 发布面**（高于上游）。我们侧出处在 `companion-plugins.js:68-71` 注释 |
| 15 | `dsh-easyrewrite` | `dsh-easyrewrite` | `Renzic-Stone/DSH-EasyRewrite` | root 200 / LICENSE main 200 | `repository` + `LICENSE` 版权行 `2026 Renzic-Stone`；上游 `main` 与 npm latest 同为 2.6.0，**与我们逐版相同**（本轮由外部上游通道更新；d-pack 只有 2.5.3） |
| 17 | `offpeak` | `dsh-offpeak` | `christophersmith2737-commits/OffPeak` | root 200 / LICENSE main 200 | `repository` + `homepage`；上游 `main` 实测仍 `dsh-offpeak@1.0.0`，**我们 1.0.1 取自 d-pack 发布面**（高于上游）；npm 未发布（404） |
| 20 | `synapse` | `dsh-synapse` | `liangmianya/dsh-synapse` | root 200 / LICENSE main 200 | README 署名；上游 `main` 实测 `dsh-synapse@0.4.2`/MIT（d-pack 0.3.1），**两条通道都不取整包**（逐文件差量见 §五 5.5）：npm/upstream 0.4.2 会覆盖掉我们的深色适配桥（`client.js` 的 `dsw-` 桥 1 处）与 `perf(synapse)` 水位线增量重放 / 存储上限（`index.js` 13 个 ours-only 符号），且 tarball 不带 `test/`；**本仓 0.3.1 即 d-pack 0.3.1**（`app.js`/`styles.css`/`test/`/`LICENSE`/svg 逐字节相同，唯一代码差量是 `index.js` 的 `sessionEvents()` 兼容口，已于 2026-10-19 吸收）。注意包内 `LICENSE` 版权行是**空署名**（`2026 `） |
| 22 | `basics-panel` | `dsh-basics-panel` | `yxsj245/dsh-Basics-Panel` | root 200 / LICENSE main 200 | `package.json` 无 `repository`，判据走 README + `LICENSE` 版权行 `2026 又菜又爱玩的小猪`（对应上游账号名）；上游 `main`/`master` 实测 `dsh-basics-panel@0.4.1`（= 我们 0.4.2 的上游基线，0.4.2 是本地跨代修复版：同一条 `webRuntime` → `connection` 改动）（npm 未发布；d-pack 只有 0.1.1，故走外部上游并按用户裁定**本地跑它的构建**） |
| 24 | `prompt-optimizer` | `dsh-prompt-optimizer` | `Y1X1n/dsh-prompt-optimizer` | root 200 / LICENSE main 200 | `repository` + `LICENSE` 版权行 `2026 Y1X1n`；**vendored 上游 0.6.1**（本地版本线 3.0.0）。**npm 裸名 `dsh-prompt-optimizer` 是 `winditer` 的另一实现（latest 2.0.3），本地 repository 指向 Y1X1n → 身份判 `foreign`，禁止按裸名更新**；真正的上游 npm 包是 `@y1x1n/dsh-prompt-optimizer` |

### 3.2 EAC 移植（1 条）—— 来自姊妹项目 Deepseek Harness EAC

判据是**包内 `LICENSE` 的版权行署名**（不是 README 的自我描述，见本节末的反例）：

| # | loader id | 包名 | 来源仓库 | 实测 | 判据 |
| --- | --- | --- | --- | --- | --- |
| 18 | `settings-nav-custom` | `dsh-settings-nav-custom` | `DSH-EAC/EAC-Desktop`（旧址 `zouyuxuan122/Deepseek-Harness-EAC`） | 旧址 root **301** / 新址 root **200** / `SOURCES.json` raw **200** | 包内 `LICENSE` 版权行逐字 `Copyright (c) 2026 Deepseek Harness EAC contributors`（MIT）；`package.json` 无 `repository`；EAC 账本 `dsh-desktop/assets/SOURCES.json`（updatedAt 2026-09-27）**无该包条目**，所以「EAC 里哪个目录」仍未定位 |

> 原第 2 条 EAC 移植 `dsh-file-drop` 已随 v1.0.0 批量退役（判据同形：`LICENSE` 署 EAC contributors、
> `SOURCES.json` 无条目），结论见 §一末「已退役」表。

> **README 自称「Deepseek Harness EAC 配套插件」却判为自研**：在册的 `dsh-settings-groups`(#19)
> 与已退役的 `dsh-image-paste` 同形——它们的 `LICENSE` 没有 EAC 署名（实测**根本没有 `LICENSE` 文件**），
> 而 EAC 自己那份 `SOURCES.json` 把这两个包的 `upstream.repository` 记成
> `https://github.com/myYangyunfan/dsh_desktop`（`pinnedHead` = `ee052c6b`，provenance 写
> 「dsh_desktop monorepo（2026-09-06 排查确认）」）——**方向是反的：EAC 是我们的下游，不是上游**。
> README 里那句「EAC 配套插件」是当年同源调试留下的描述残留，不构成来源证据。
> 对照：#18 `settings-nav-custom` 有 EAC 署名的 `LICENSE` 原文，才判为移植。

### 3.3 自研（12 条）

`dsh-balance`、`dsh-file-changes`、`dsh-session-manager`、`dsh-conversation-tweaks`、
`dsh-prompt-custom`、`dsh-workspace-anchor`、`dsh-wsl-settings`、`dsh-input-history`、`dsh-change-review`、
`dsh-settings-groups`、`dsh-subagent-lens`、`dsh-input-fold`。

> **2026-11-08 再退役 3 条自研件（按用户要求）**：`dsh-quest-ui`（Quest 沉浸式界面）、
> `dsh-auto-compact`（contextPressure 达阈值自动发 `/compact`）、`dsh-zcode-migrate`（zcode 历史会话 →
> dsh 原生会话日志）。源目录已从 `assets/plugins/` 删除，条目已进 `RETIRED_COMPANIONS`，§一 / §5.2 同步回落到 31 条；2026-11-09 新增 `dsh-context` / `ds-harness-remote` 两件，回落到 33 条。
> 本节是 2026-10-07 的分类快照：2026-10-16 起的 `dsh-builtin-manager` / `dsh-goal-completion` 与
> 2026-10-22 的五个上游件未列入本节，按 §一「上游 / 许可」列分类。


> 原 20 条里的 5 条（`dsh-client-file-changes`、`dsh-terminal-tab`、`dsh-market-desktop-bridge`、
> `dsh-image-paste`、`dsh-cardian`）已随 v1.0.0 批量退役，见 §一末「已退役」表。

判据：`package.json` 无 `repository`/`homepage`/`author`，`LICENSE` 若存在则署 `DSH Desktop contributors`，
且 EAC 账本对这些包记的正是 `origin=upstream / upstream.repository=myYangyunfan/dsh_desktop`
（语义是「从我们的 monorepo 拿走」，本次实测 `SOURCES.json` 里 `dsh-settings-groups` 与已退役的
`dsh-image-paste` 两条正是这个形态）。唯一历史例外是已退役的 `dsh-cardian`——它的 repository 是
`myYangyunfan/dsh_cardian`，即我们自己的独立发布仓。

### 3.4 生态周边仓（不是插件本体，但清单/README 的链接指向它们）

| 仓库 | 实测 | 作用 |
| --- | --- | --- |
| `imsai-sh/awesome-deepseek-harness-plugins` | root 200 / LICENSE main 200 | 社区插件目录；已退役的 `dsh-community-market` README 引用它 |
| `awesome-dsh-plugin/awesome-dsh-plugin` | 目录条目 raw 200（锚 commit `44ae0afa`） | 另一份社区目录，条目按 `data/plugins/<owner>__<repo>.yml` 取名；EAC 账本大量条目的 `catalogEntry` 指向这里，可作交叉验证通道 |
| `vlln/plugin-registry`（旧址 `dsh-external/plugin-registry` **301**） | 旧址 301 / 新址 200 | 插件注册表；`dsh-better-sidebar`(#3) README 链的是旧址 |
| `DSH-EAC/EAC-Desktop`（旧址 `zouyuxuan122/Deepseek-Harness-EAC` **301**） | 旧址 301 / 新址 200 / LICENSE 200（MIT） | EAC 母项目；带 `dsh-desktop/assets/SOURCES.json` 来源账本 |
| `mexiaosqwq/dsh-web-mobile` | root 200 / LICENSE main 200 | 同类手机侧插件，`dsh-pocket`(#12) README 提及 |
| `yanggenjie/zcode-data-archive` | root 200 / **LICENSE 无** | 已退役的 `dsh-zcode-migrate` README 曾引用它说明 zcode 历史会话格式，**不含其代码**（该件已于 2026-11-08 退役，此条仅存档） |

### 3.5 许可与命名风险（4 处 + 1 处已解除）

1. **（已解除，2026-10-22）原 #11 `dsh-side-session` 的 MIT 标注不实。** 上游 `hzhz314159/dsh-side-session`
   存在（200）但 `main`/`master` 都没有 `LICENSE`（404）——无许可证默认是**保留所有权利**。
   该件已按用户要求从内置清单移除、源目录删除，不再随包分发；此条留作历史记录，风险随交付面消失而解除。
   `fix(super-injector): 六处写穿 DSH_HOME 的 homedir() 硬编码改为跟随内核 home`）那次改动是我们自己动过
   它的源码（dsh-pack `not-shipped/README.md` 记录）；此时由我们补一份 BSD-3 文本填署名 = **伪造许可来源**。
   同样已移出发布面。
   §一 第 7 行只标到「未唯一判定，见 §三」，处置口径以此条为准。
3. **`@dsh-external/*` 是个空头的第三方作用域**：在册 2 条用它起名（#6 `dsh-super-injector`、#21 `dsh-subagent-lens`；已移除的 `dsh-side-session` 与已退役的 `dsh-vision` 是另外两条），但它不对应任何可解析实体——
   npm 上 `@dsh-external/dsh-vision`、`@dsh-external/dsh-side-session`、`@dsh-external/dsh-super-injector`、
   `@dsh-external/dsh-subagent-lens` **全部 404**，`github.com/dsh-external/dsh-subagent-lens` 也是 **404**。
   其中 **#21 `dsh-subagent-lens` 根本是自研**却借该作用域起名，属命名卫生问题
   （与 §一 顶部 `@deepseek-ai/*` 撞内核闭包作用域那条禁令同源）。
4. **包名撞社区已发布包，按名安装会装到别人**：
   #4 `dsh-session-manager` —— npm 已发布 `dsh-session-manager@0.6.2`（发布者 `lesterq`，repository 写
   `hkkz9522/dsh-session-manager`，root 200 / MIT），而我们的是 `0.1.0` 独立小实现（入口 `lib/index.mjs`，`LICENSE` 署 DSH Desktop contributors），
   **不是它的衍生**，但同名；机器判定已把它钉下来——我们的 `package.json` 不声明 `repository` 而远端声明了，
   §4.2 的 `identityVerdict` 因此落在 **`unverifiable`**（「无法证明同源」），「它版本更高」就永远不构成更新理由；
   #14 `dsh-input-history` 同形（npm 0.3.2 发布者 `sunshaobei` / repository `sunshaobei/dsh-input-history`，
   本地 0.1.1 无 `repository`）也是 **`unverifiable`**。
   ~~`dsh-hub`~~ —— npm 上 `dsh-hub` latest 是 `0.0.1`（repository 写 `dushaobindoudou/dsh-hub`，该仓现 **404**），
   与我们当时的 `1.1.5`（`ARFCON/dsh-hub-DSH`）是两条线；**该条已随 v1.0.0 批量退役，风险在本仓库侧自然消解**。
5. **两处「同名仓」的原创判定已由机器给出，不再靠人比版本**：`dsh-reasoning-effort`（原 #24，2026-10-17 随内核 0.2.1 换代退役，判定与机器锁都留着备查）两边**都**声明
   repository 且不同（我们 `HanaAyane/dsh-reasoning-effort` / npm latest 0.2.8 `Mu-scorpio/dsh-reasoning-effort`）
   → `identityVerdict` = **`foreign`**（同名不同项目，npm 那条就是 §三 说的旧线）；
   #11 `compaction-acp` 的包名是 `billion-context-dsh`，两边都没声明 repository → **`unknown`**，
   此时仍只能靠 §三 的 git-over-https 人证（`Tyan66666/billion-context-dsh` 与谱系仓
   `ranxianglei/billion-context-pi` 都在、均 200，前者才是直接上游）。
   #20 `dsh-synapse` 同样是 `unknown`（npm 0.4.2 不自报 repository）——这正是它两条通道都「版本更高」
   却只出差量报告、不吸纳的机器依据。

> 处置边界：本节只是**取证与登记**，不改任何插件源码、清单条目、`THIRD_PARTY_NOTICES.md` 或交付面。
> 风险 1/2 的「不可再分发」结论目前只落在 dsh-pack 的发布面上；本仓库侧它们仍在 `COMPANION_PLUGINS` 在册
> （28 条），而在册的意义本就是给 boot 的 sync 步做「历史配套件撤回」依据——**在册 ≠ 随包分发**。

## 四、与外部更新通道的版本对照（2026-10-17 复算）

> **2026-10-17 本轮复算（内核 0.2.1-rc.1 换代 + `dsh-reasoning-effort` 退役，在册 30 → 29）**：
> 数字全部是 `node scripts/compat/scan-plugin-channels.mjs --npm` 当轮**输出**（判据面在
> `scripts/lib/plugin-channels.js`，纯函数、`unit-plugin-channels` 单测覆盖），不是抄录上次结论。
> 4.1 是 d-pack 发布面通道，4.2 是 npm 通道 + 身份判定，4.3 是两条通道的口径雷区。
> **诚实记录一条复算缺口**：d-pack 通道本轮**没能重放**——本机 `D:\workspace\dsh-pack` 不是 git 仓库
> （扫描器直接报「跳过」），所以 4.1 保留的是 2026-10-08 那轮的账，其中涉及
> `dsh-reasoning-effort` 的两处（「我们高于 d-pack 5 条」与「minor 级跳变 4 条」）自本轮起
> **各减一条**（该件已退役，不再计数），其余结论未经复核、照旧引用请注明日期。
> npm 通道本轮已全量重放，见 4.2。

### 4.1 d-pack 发布面通道

数据源：`git ls-tree --name-only origin/main:packages`（34 个目录，逐目录 `git show
origin/main:packages/<dir>/package.json` 全部命中，无空目录）；版本比较走全仓唯一实现
`scripts/lib/versions.js#compareVersions`（数值分段、缺段按 0、忽略前导 v、预发布后缀低于正式版）。
`origin/main` = `a064e1005`（`feat: 升级 prompt-custom 到 0.3.5，摘除官方已内置插件，修复 v4 source kind 兼容性`）。
**该 ref 自上次对齐（2026-10-07）以来零漂移**：`git rev-list --count a064e10..origin/main` = **0**，
所以 d-pack 通道的数字与上一轮逐字相等是**预期**结果（不相等才说明发布面动了）。
dsh-pack 的 `packages/` 实存 **34 个**目录，扣掉 `host-capabilities` 与聚合元包
`@dsh-pack/all`（`packages/meta-all`），插件包 **32 个**。
**匹配按目录名，不按包 `name`**——d-pack 把发布面包名统一改成了 `@dsh-pack/<裸名>`，与我们的
`@deepseek-ai/*` / `@dsh-external/*` 不同形，按名比对会得到「重叠 0」的假结论。

通道裁定是「**先走 d-pack，再看外部上游；上游功能/版本更好就兼容性更新进来**」。
复算后 d-pack 侧**命中 26 条**（shipped 24 + `not-shipped/` 收录 2），分布：

- **等版 18 条（shipped）**：`auto-compact`、`balance`、`change-review`、`conversation-tweaks`、`file-changes`、`input-fold`、
  `input-history`、`offpeak`、`openclaw-bridge`、`pocket`、`prompt-custom`、`prompt-optimizer`、`quest-ui`、
  `settings-groups`、`settings-nav-custom`、`subagent-lens`、`workspace-anchor`、`zcode-migrate`
  ——**2026-11-08 起其中 3 条已退役**（`auto-compact` / `quest-ui` / `zcode-migrate`），本段是 2026-10-17 的通道快照，
  现役等版收敛为 15 条；退役件不参与后续更新对账
  ——其中 **16 条由上一轮 d-pack 版本对齐上来**（`file-changes`、`workspace-anchor` 更新前就同为 0.1.0）。
  另有 **1 条等版但发布面置于 `not-shipped/`**：`dsh-super-injector`（见 3.5 风险 2；`dsh-side-session` 已于 2026-10-22 移除），
  扫描器把这条记成 `present && !shipped`，**不构成更新目标**。
- **我们高于 d-pack 5 条**：`dsh-better-sidebar` 0.24.1（d-pack 0.15.4，**本轮点名吸纳上游后反超**）、
  `billion-context-dsh` 0.2.26（d-pack 0.2.2）、`dsh-basics-panel` 0.4.1（0.1.1）、
  `dsh-easyrewrite` 2.6.0（2.5.3）、`dsh-reasoning-effort` 0.8.1（0.7.1）——五条都取的是**外部上游 main / npm latest**，
  即「上游比发布面新」的那一侧；`basics-panel` 另按裁定本地跑它的构建。
- **d-pack 高于我们 1 条**：`dsh-synapse` 0.3.1 —— 这是扫描器 `actionable` 集合里**唯一的机器候选**
  （命中判据：shipped 且版本更高）。人工判定**不取整包**，但理由与立项时写的不同，已按 §五 5.5 的逐文件实测更正：
  **d-pack 0.3.1 就是本仓 0.3.0 的换皮**（`app.js`/`styles.css`/`test/`/`LICENSE`/svg 逐字节相同，差异只剩
  `@dsh-pack/` scope 三处排版 + 一段 `sessionEvents()` 兼容口 `+13/−1`），所以「取了会覆盖本仓 `perf`/`fix`」这句
  对 d-pack 侧**不成立**；真正会被覆盖的是 npm/upstream 0.4.2 那条功能线。于是本条的裁定改为：
  **整包不取（版本仍是 0.3.0，不动产物），但那段 `sessionEvents()` 兼容口是一条已证实的真缺陷修复**
  ——本机 0.3.0 在 pin 的 rc.2 上回填路径静默产出 0 条消息，登记为待处置项（处置姿势见 §五 5.5 末段）。
- **minor 级跳变 4 条**（上一轮的账，本轮新增的第 5 条跳变是 `dsh-better-sidebar` 0.15.3→0.24.1，见 §五 5.2 #3）：
  `prompt-custom` 0.1.1→0.3.5（来自 d-pack）、`dsh-basics-panel` 0.1.0→0.4.1、
  `dsh-easyrewrite` 2.5.2→2.6.0、`dsh-reasoning-effort` 0.7.0→0.8.1（后三条来自外部上游）；
  `billion-context-dsh` 0.2.1→0.2.26 是补丁号跳位，其余 15 条都是 +0.0.1。
  上一轮 28 条里 **20 条版本号变化、8 条维持原值**（8 条 = 上面 2 条刻意不取 + `file-changes`/`workspace-anchor`/
  `wsl-settings`/`session-manager`/`side-session`/`super-injector` 6 条发布面本就同版或无源）。
- **在册而 d-pack 无此件 2 条**：`dsh-session-manager`、`dsh-wsl-settings`（`packages/` 与 `not-shipped/` 都没有），
  两条都维持原版本。
- **反向差集 = 本轮退役的 8 条**：d-pack 发布面里 `dsh-cardian`、`dsh-client-file-changes`、
  `dsh-community-market`、`dsh-file-drop`、`dsh-image-paste`、`dsh-vision`、`graph-memory`、`harness-pet`
  我们已不再在册（批量退役 11 条里另 3 条 `dsh-terminal-tab`、`dsh-market-desktop-bridge`、`dsh-hub`
  d-pack 本来就没收）。**若将来再以 d-pack 作同步源，这 8 条要显式跳过**，否则退役会被同步拉回。
- 覆盖带来的**契约换代**（不是版本号游戏，是上一轮 18 条测试红的成因）：`balance` 0.1.2 余额投递由自制壳桥改宿主
  HTTP 路由（`docs/balance-architecture.md`）、`conversation-tweaks` 0.1.1 与 `subagent-lens` 0.1.1 设置通道迁
  `ctx.remote.settings`（幽灵服务 `ctx.settingsScope` 缺席即静默降级）、`openclaw-bridge` 0.8.1 的
  `ctx.settings.register` 换成 codegen `settings-host` 垫片、`easyrewrite` 2.6.0 起 `data-time-hover-root` 变自名锚、
  bundle 型插件自声明 `dsh.bundle.patch` 后 sync CLI 不再代写 profile 层 `insert` 行。各自的锚点都已在
  `scripts/test/` 里随迁并配反证。

### 4.2 npm 通道与身份判定（2026-10-17 复算）

数据源：`npmLatestUrl(<包名>, mirror)`（`scripts/plugin-manager-update.js`，官方 `registry.npmjs.org`
失败自动退 `registry.npmmirror.com`）取 `/latest`，该端点自带 `version` + `repository` + `maintainers`，
够判「是不是同一个项目」。**这一步是必须的**：只看版本号会犯两类错——把撞名的第三方实现当上游（#4、#14、#17），
或把旧分叉线当 latest（`dsh-reasoning-effort`，原 #24，2026-10-17 已退役）。

29 条分布：**命中 9 条 / 未发布 20 条**。逐条（本轮 `--npm --json` 原样转录，`bucket` 即版本位）：

| loader id | 本机 | npm latest | 版本位 | 身份判定 | 远端维护者 / 仓库 |
| --- | --- | --- | --- | --- | --- |
| `better-sidebar` | 0.24.1 | **0.28.0** | 远端更高 | **same** | `huanlin` / `omdsh-dev/DSH-better-sidebar` —— **可取**（`actionable`） |
| `dsh-pocket` | 2.10.7 | **2.11.0** | 远端更高 | **same** | `leachzhou` / `shaobeichen/dsh-pocket` —— **可取**（`actionable`） |
| `dsh-easyrewrite` | 2.6.0 | 2.6.0 | 等版 | **same** | `renzic-stone` / `Renzic-Stone/DSH-EasyRewrite` |
| `prompt-optimizer` | 3.0.0 | 2.0.3 | 我们更高 | **foreign** | `y1x1n` / `Y1X1n/dsh-prompt-optimizer` —— npm 裸名 `dsh-prompt-optimizer` 是 `winditer` 的另一实现，**禁止按名更新**；上游真包是 `@y1x1n/dsh-prompt-optimizer` 0.6.1 |
| `compaction-acp` | 0.2.26 | 0.2.27 | 远端更高 | **unknown**（远端无 `repository`） | `tyanyin` / — |
| `synapse` | 0.3.1 | 0.4.2 | 远端更高 | **unknown**（远端无 `repository`，无法证明同源） | `liangmianya` / — |
| `dsh-session-manager` | 0.1.0 | 0.7.1 | 远端更高 | **unverifiable**（本地无 `repository`） | `lesterq` / **`hkkz9522/dsh-session-manager`** —— 撞名第三方，**禁止按名更新** |
| `input-history` | 0.1.1 | 0.3.2 | 远端更高 | **unverifiable** | `sunshaobei` / **`sunshaobei/dsh-input-history`** —— 同上型撞名 |
| `offpeak` | 1.0.1 | 3.3.0 | 远端更高 | **foreign** | `lizilong1993` / **`lizilong1993/dsh-offpeak`** —— **本轮新增的撞名件**（我们 1.0.1 是自研，npm 上这条 3.3.0 是另一个项目；版本号差 2 个大版本、`identity` 机器判 `foreign`，正是 `actionable` 双条件要挡住的那一类） |

身份四值（`scripts/lib/plugin-channels.js#identityVerdict`）：
`same` = 两侧 `repository` slug 逐字相等；`foreign` = 两侧都有 slug 但不等（**同名不同项目**）；
`unverifiable` = 本地 package.json 没自述上游、远端有仓库（自研件与分叉件都落这里，机器只能说到「无法确认同源」）；
`unknown` = 远端自己也没 `repository`。计数 `same 4 / foreign 1 / unverifiable 2 / unknown 2 / absent 20`。

**可取判据**（`channelRow().actionable`）：`d-pack shipped 且更高` **或** `npm 更高且身份 same`。
本轮机器候选 **2 条 = `better-sidebar` 0.28.0 与 `dsh-pocket` 2.11.0**（都是 `same` 且远端更高）。
两条都**只登记为候选、未执行更新**——`better-sidebar` 上一轮（2026-10-08）刚做过 0.15.3→0.24.1 的
整包换代与 34 例回归锁（§5.2 #3），再跳 0.24.1→0.28.0 是同一件事的第二次换代，要单独立项跑构建沙箱
与产物对账，不能塞进内核换代的提交里；`dsh-pocket` 我们本机 2.10.7 高于 npm 2.10.6 已有一轮，
2.11.0 需要先看它是否含我们本地补丁。
换句话说 —— **本轮的「更新列表」实测产物仍是这张表本身**，`offpeak` / `dsh-session-manager` /
`input-history` 三条「远端更高」全部被身份判据挡在门外。

### 4.3 两条通道的口径雷区

- dsh-pack 的 `THIRD_PARTY_NOTICES.md` 表是 `scan-licenses.mjs` 生成的**快照**，本次实测它已与
  `packages/` 磁盘不一致（notices 记 `prompt-custom 0.1.1`，磁盘是 `0.3.5`）；聚合元包 `packages/meta-all/package.json` 自述「29 个插件」，磁盘同为 32。
  **若将来以 dsh-pack 作同步源，读 `packages/*/package.json`，不要读它的 notices 表或元包自述。**
- **npm 版本号高低不是身份**。2026-10-17 这轮 9 条命中里「远端更高」有 7 条，其中只有 2 条身份 `same`
  （`better-sidebar` 0.28.0、`dsh-pocket` 2.11.0，二者构成 `actionable`）；其余 5 条全是身份挡住了：
  2 条 `unknown`（`compaction-acp` 0.2.27、`synapse` 0.4.2 —— 远端自己没 `repository`，无法证明同源）、
  2 条 `unverifiable` 撞名（`hkkz9522/dsh-session-manager` 0.7.1、`sunshaobei/dsh-input-history` 0.3.2）、
  1 条 `foreign` 撞名（**本轮新增**：`lizilong1993/dsh-offpeak` 3.3.0 vs 我们自研 1.0.1）。
  已退役的 `dsh-reasoning-effort` 是同一判据抓出来的第一条（npm latest 0.2.8 属 `Mu-scorpio` 另一条线）。
  判据面把这件事收敛成 `identityVerdict` 四值 + `actionable` 双条件，不再靠人记名单——
  `offpeak` 这条正是「如果只比版本号就会把别人的项目当上游拉进来」的现行样本。
- **`repository` 字段的形态会吃掉 slug 解析**：本轮写 `unit-plugin-channels` 时抓到判据自身一个缺陷——
  无 scheme 的 `github.com/o/r` 形态会把 owner 读成 `github.com`（两条不同项目因此可能被判成同一条 slug）。
  2026-10-17 复算的 9 条命中里出现的形态是 `https://github.com/…`（仅 `better-sidebar`）与
  `git+https://…`（其余），归一后 slug 一致，台账未受影响，
  但这条已经作为「四种形态必须归一到同一 slug」的用例钉进单测，下次遇到裸主机名形态不会静默误判。
- **`@deepseek-ai/*` 与官方内核包同名作用域**，但作用域伴随件在 npm 上全部 404（未发布）——
  所以「npm 未发布 20 条」里含全部作用域条目；不要因为它们 404 就推断官方 registry 被墙，
  同一批请求里 9 条裸名件是通的。

### 4.4 2026-11-09 更新轮次：8 件已落盘（按用户「有没有可以更新的，更新一下」）

扫描口径：33 条在册件逐条 `npm view <包名> version repository.url maintainers`，与本地
`package.json` 的 `repository` 归一后比 slug（`identityVerdict` 同源判据）。结果：
**16 条有 npm 发布面 / 8 条「身份 same 且远端更高」/ 8 条 `unverifiable` 或 `foreign`（撞名自研件）/
1 条等版（`@bittersmilezzz/dsh-notify` 0.4.5）/ 9 条 npm 无此件**。

落盘 8 件（全部取 npm tarball 整包，版本列已同步 §一 / §5.2 / README 两表 / `THIRD_PARTY_NOTICES` §4.1）：

| 包名 | 旧 → 新 | 本地形态 | 本轮的额外动作 |
| --- | --- | --- | --- |
| `dsh-plugin-shop` | 0.9.0 → **0.9.3** | 纯 vendored（同版本 tarball 逐字节相同） | — |
| `dsh-toolbox-ui` | 1.8.2 → **1.10.1** | 纯 vendored | 新增 `lib/tool-search-*.js` 一族（工具搜索接入） |
| `dsh-context` | 0.82.1 → **0.83.0** | 纯 vendored | 新增 `locale/de.json` / `locale/ru.json` |
| `billion-context-dsh` | 0.2.26 → **0.2.27** | **fork（仅 package.json）** | 重放 peer 收口：5 条 dsh 族上界 `<0.3.0-0` + 去掉上游钉死 `0.2.0-rc.2` 的 6 条 peer |
| `dsh-free-search` | 0.9.11 → **0.9.39** | **fork（`lib/cache.js`）** | 重放 `DSH_HOME` 优先的缓存落点（11 行，`RESEARCH_CACHE_DIR` 覆盖口保留）；新增 `lib/engines/*` 42 个文件 |
| `dsh-pocket` | 2.10.7 → **2.12.0** | 纯 vendored（旧 2.10.7 来自 d-pack，本轮切到 npm 线） | deps 未变（`qrcode` / `qrcode-terminal`），内层 `node_modules` 沿用 |
| `dsh-easyrewrite` | 2.6.0 → **3.0.1** | 纯 vendored | 主版本跳：新增 `assets/*.png` 与 `locales/{bubble,bundle}` 多语言面 |
| `ds-harness-remote` | 0.5.19 → **0.6.4** | 纯 vendored（内层树自装） | `node_modules` 按新 deps 重装（47 顶层包 / 3413 文件 / 34.9MB）：**`werift` 不再进依赖树**（0.6.4 把它收进 dist），仍不装 optional 的 `@roamhq/wrtc` |

「纯 vendored」的判据不是猜的：把**同版本**的 npm tarball 拉下来与 `assets/plugins/<dir>` 逐文件比
sha256——`differ=0 & onlyLocal=0 & onlyRemote=0` 才叫纯 vendored；`billion`（只差 `package.json`）、
`free-search`（差 `lib/cache.js`）、`ds-bot`（差 `client.js` + `cordis.patch.yml`）、
`better-sidebar`（0.24.2 未在 npm 发布）都是 fork 形态，换版必须重放。

**未动的 5 类及原因**（下次别重复研究）：

- `better-sidebar` 0.24.2 → npm 0.30.1（身份 same）：**策略排除**（`UPDATE_EXCLUSIONS`）——它是本地
  重建件，npm 版没有本仓对资源管理器栏头折叠 / 「在本地打开」的修复，升级只能走 `.tmp-bs-build`
  沙箱重建 + `unit-better-sidebar-*` 对账，不能整包覆盖。
- `bot`（`ds-bot` 0.2.0 → npm 0.3.1）：**策略排除**——本地 vendored patch 只挂 Bot 本体、不接管
  `web.searchProvider`，npm 版会整包覆盖 `cordis.patch.yml` 与 client 的 dsh-compat 标记。
- `synapse` 0.3.1 → npm 0.5.7（`unknown`）：npm 侧仍不自报 `repository`，无法证明同源；且 0.4.2+
  会覆盖我们的深色适配桥（`client.js` 的 `dsw-` 桥）与 `perf(synapse)` 水位线 / 存储上限增量
  （差量见 §5.5），仍只登记差量、不吸纳。
- `offpeak`（npm 3.3.11，`foreign`）／`dsh-session-manager`（0.7.5，`unverifiable`）／
  `dsh-input-history`（1.1.3，`unverifiable`）：**同名不同项目 / 撞名第三方**，按名更新会把别人的
  实现装进来；`prompt-optimizer` 的裸名同样 `foreign`（`winditer` 的另一实现），真上游
  `@y1x1n/dsh-prompt-optimizer` npm 最新 **0.5.0 < 我们的 vendored 0.6.1**，本来也无事可做。

### 4.5 2026-11-09 GitHub 通道复核：1 件落盘（按用户「看看 github 方面有没有需要更新的插件」）

扫描口径：以各件 `package.json` 的 `repository` 与本章 §3.1 的上游登记为 repo 来源（共 18 个仓库），
取 Github `repos/{r}` 的 default branch + `releases/latest` + 近 5 个 tag，再读该分支根 `package.json` 的
`version` 与本地比对。结论：**1 件有真实可落地更新 / 1 件产物等价 / 4 件本地领先或已分叉 / 其余等版**。

| 仓库 | 本地 | 上游 | 结论 |
| --- | --- | --- | --- |
| `baizhizzl/dsh-network-proxy` | 1.0.0 | release `v1.0.4`（无资产，archive 模式） | **已落盘 1.0.4**，两处 fork 改动上游同款吸收 |
| `Y1X1n/dsh-prompt-optimizer` | 3.0.0（vendored 自 0.6.1） | release `v0.6.3` | 0.6.3 与 0.6.1 的 `lib/` 逐字节相同，只动 README/版本号 → 无需动作 |
| `yxsj245/dsh-Basics-Panel` | 0.4.2 分叉 | main 0.4.3 | 本地已分叉（`McpSection.tsx` 516 vs 387 行、`trust-fence.ts` 本地独有）→ 需单独重建，不做机械换版 |
| `omdsh-dev/DSH-better-sidebar` | 0.24.2（本仓重建件） | release `v0.30.1` | 策略排除（`UPDATE_EXCLUSIONS`），升级走 `.tmp-bs-build` 重建链 |
| `liangmianya/dsh-synapse` | 0.3.1 | tag `v0.5.7` | 会覆盖 `dsw-` 深色适配桥，需手工重放 |
| `Fei2411/DeepSeek-Bot` | 0.2.0（vendored patch） | release `v0.3.1`（18 资产，桌面安装包为主） | 策略排除：上游 patch 会接管 `web.searchProvider` |
| `hzhz314159/openclaw-dsh-bridge` | 0.8.1 | main 0.8.0 | 本地领先，无动作 |
| `Tyan66666/billion-context-dsh` | 0.2.27 | main 0.2.27 | 等版 |
| `shaobeichen/dsh-pocket` | 2.12.0 | release `v2.12.0` | 等版 |
| `Renzic-Stone/DSH-EasyRewrite` | 3.0.1 | release `v3.0.1` | 等版 |
| `DDDMUC/dsh-free-search` | 0.9.39 | release `v0.9.39` | 等版 |
| `Imzl-zl/dsh-toolbox-ui` | 1.10.1 | release `v1.10.1` | 等版 |
| `bowenliang123/dsh-context` | 0.83.0 | release `v0.83.0` | 等版 |
| `liguobao/ds-harness-remote` | 0.6.4 | release `v0.6.4` | 等版 |
| `bitterSmilezzz/dsh-notify` | 0.4.5 | tag `v0.4.5` | 等版 |
| `LivXue/dsh-plugin-shop` | 0.9.3 | tag `v0.9.3` | 等版 |
| `christophersmith2737-commits/OffPeak` | 1.0.1 | 无 release/tag 面 | 无法比对 |
| `DSH-EAC/EAC-Desktop` | 0.1.1（EAC 移植） | 应用 `v6.0.0` / launcher | 不同发布面，不比 |

落盘细节：`network-proxy` 的 8 个根文件（`index.js` / `client.js` / `package.json` / `cordis.patch.yml` /
`LICENSE` / `README.md` / `icon.svg`）与 `locale/{en,zh}.json` 与上游 `v1.0.4` 逐字节一致；`index.js`
40KB→61KB、`client.js` 28KB→32KB。`unit-vendored-upstream-plugins` 的版本表同步 1.0.4，两条 fork 反证
（`mode: 0o600` 凭据落盘、`snapshot.active` locale 读法）在 1.0.4 上仍然成立、继续咬住。

## 五、舰队更新与兼容 sweep（2026-10-08 立项 · 目标宿主 `0.2.0-rc.2`；**2026-10-17 六条静态扫按 `0.2.1-rc.1` 全量复算**；**2026-10-18 按 `0.2.1-rc.2` 复核，判据值逐项不变、全绿**；**2026-10-27 按 `0.2.2-rc.1` 复核自动化面，判据值逐项不变、全绿**）

> **2026-10-27 换代复核口径（rc.2 → rc.4）**：这一代上游只增不破，复核走机器判据而非逐件手测——
> 62 项补丁 `patch-deps` 实况「写入 75 处 / 失配 0 / 失败 0」，`patch-surface` 85 文件干预面零漂移，
> `ta6-baseline-matrix` 判定矩阵与 rc.2 **逐 id 相同**（43 changed / 14 root / 5 target-absent），
> 家族唯一新包 `@deepseek-ai/dsh-client-ui-entry-customization`（rc.3 的「更多」菜单）随 vendor 入库、
> 家族零撤包（340 个候选中选名全部有 rc.4 版本）。下表逐件结论沿用，无需逐行重录。
>

> **2026-10-17 换代复算口径**：内核 pin 由 `0.2.0-rc.2` 换到 **`0.2.1-rc.1`**、`dsh-reasoning-effort`
> 退役，在册 **30 → 29**。下表「修后实测」列已全部换成 0.2.1-rc.1 上的现跑输出（复算命令见 5.3，
> 逐条可重放）：peer 判据 **0 DENIED / 29**（12 条声明 dsh 族 peer、共 **38** 键，rc.2 那轮是 13 条 / 48 键，
> 差值即退役件）；判据 A/B **73 别名 / 434 成员全判**；判据 C **26 条 client 入口 / 26 图文件 / 51 处裸名**
> → 0 表外、0 断链；入口可见性 **58 条入口** → 0 磁盘缺失、0 被遮蔽；`dsh.client` 声明 **50 条**
> （inject 42 + external 8）→ 0 落空；已移除服务 **0 真实引用**。
> 两条判据源的换代实值：`getDshRuntimeVersion()` = `0.2.1-rc.1`；`PLATFORM_MODULES` 由 9 项涨到
> **11 项**（新增 `zod`、`@tanstack/react-virtual`），`PRELOADED_CLIENT_EXTERNALS` 仍为 `[]`。
> **六条静态扫全绿并不代表舰队可用**——换代当天在隔离内核真机抓到两条静态扫摸不到的坏，
> 两条都是「插件面自己坏」而不是补丁面坏：① 补丁注入体自造的 SyntaxError 让整束浏览器
> bundle 被跳过，页面 `Failed to load plugins` 铺满 80 条（门禁补 `unit-patch-output-parsable`，
> 逐产物 109 个编译过）；② 内核 `dsh-agent-loop` **撤掉了 rc.2 的 `cwd` 提示词变量注册**
> （新版只剩 provider / model），于是 `dsh-workspace-anchor`（§5.2 #8）带 `{{cwd}}` 的节让
> **每一条消息**装配期抛 `unknown prompt variable`，界面只剩「处理失败 UNKNOWN」——
> 已按「节文本自填实路径 + `interpolate: false` + 自己补注册 `cwd` 变量」修到 0.1.1，
> 回归锁 `unit-workspace-anchor-cwd` 用真渲染函数 `renderPrompt` 打反证。
> 结论写进规程：**换代后的隔离实机必须包含「发一条消息」**，看到 `MISSING_CREDENTIAL`
> 才算装配期过了；这条不在任何静态扫里。
> 「兼容」半边另有 4 处内核形状变化打进补丁层（gateway client 拆分、typert 描述符键控化、
> `evaluatePluginCompatibility` 的 `peers`→`requirements`、双半边缩进不同），逐条见
> [`CHANGELOG.md`](../CHANGELOG.md) 的 `[Unreleased]` 内核换代条目与 AGENTS.md 已知坑。

> **2026-10-18 内核再换代复核（`0.2.1-rc.1` → `0.2.1-rc.2`）**：在册仍 **29**、插件面零改动，
> 六条静态扫按 5.3 的命令逐条重放，判据值与上一轮**逐项相同**：peer **0 DENIED / 29**
> （12 条声明 dsh 族 peer、共 **38** 键）；判据 A/B **73 别名 / 434 成员**；
> 判据 C **26 条 client 入口 / 26 图文件 / 51 处裸名** → 0 表外、0 断链；
> 入口可见性 **58 条入口** → 0 磁盘缺失、0 被遮蔽；`dsh.client` 声明 **50 条**
> （inject 42 + external 8）→ 0 落空。判据源换代实值：`getDshRuntimeVersion()` = `0.2.1-rc.2`，
> `PLATFORM_MODULES` 仍 **11 项**、`PRELOADED_CLIENT_EXTERNALS` 仍 `[]`。
> 两条哨兵套件 17 例全绿；补丁层仅 1 处按 rc.2 新字节重锚（web-search client），
> 矩阵 43 changed / 14 root / 5 target-absent 与 rc.1 相同。隔离实机复验（boot 3.8s / 29 条在册 /
> 真发一条消息到无密钥止步 / 零 `failed to load`）见 `CHANGELOG.md` 的 `[Unreleased]` 条目。

> 规程出处：`github.com/oh-my-dsh/dsh-plugin-upgrade-skill` 的 fleet-sweep，五条 standing rules 里对本轮
> 起决定作用的是三条 —— **先做廉价静态扫**、**无报错是弱证据**（静默失效比崩溃更危险）、
> **跨代兼容优先**（重命名导出走运行时回落链，而不是等上游）。逐插件判定见 5.2 表；
> 卡片走廊（corridor）覆盖到 `0.2.0-rc.1`，**`rc.1 → rc.2` 官方未成卡**，我们的等价走廊判据就是
> `scripts/compat/kernel-pin.json`（`services.required` 14 / `services.removed` 12）。
> **本轮总结论（2026-10-08 复算后修订）**：「更新」半边**有一条落地**——用户点名的
> `dsh-better-sidebar` 0.15.3 → **0.24.1** 整包换代（npm 通道、身份判定 `same`，见 §4.2），其余 27 条零版本变化；
> 两条通道合起来的机器候选只有 `synapse` 一条，**整包不取**，但理由在 §5.5 的逐文件实测里被更正过一次：
> d-pack 0.3.1 就是我们本机 0.3.0 的换皮（不是「会覆盖我们改动的别人实现」），不取整包的原因是
> npm/upstream 0.4.2 那条功能线要收我们 49 个自有符号 + 深色适配桥 + 2645 行测试的账。
> **本轮唯一抓到的一条真宿主断链也出在 `synapse`**（`session.events` 在 rc.2 已下线，回填静默归零），
> 而它落在六条静态扫之外——盲区登记在 §5.4 末条，报告与复算命令在 §5.5。
> 「兼容」半边的实质工作是把换代后的锁定面重锚并退役掉两处已作废的手改：
> better-sidebar 的 14 条 peer 放宽与 112 处图标跨代回落**都随上游换代作废**（上游自己声明 `^0.2.0-rc.1`、
> 图标体系换成 `react-icons`），只保留 `compaction-acp` 的 5 条 peer 上界放宽；
> 新增机器锁三组——`unit-plugin-channels`（通道与身份判据）、`unit-hub-registry` 的 §5.2 判定表收口 +
> loader id↔`cordis.patch.yml` 逐条命中、以及 better-sidebar 换代后重写的 34 个用例
> （`unit-better-sidebar-diff-surface` 21 + `unit-plugin-kernel-anchor` 8 + `unit-plugin-tab-host` 5）。
> §5.1 的六条静态扫仍有效，其中「浏览器模块图」与「manifest 入口可见性」是收尾阶段自查时补出来的两条，各自抓到一个真实盲区。

### 5.1 判据面：七条静态扫与两条新机器锁（17 用例 + 2026-10-17 新增判据 G 5 用例）

| 扫 | 判据源（全部实文件，不硬编码名单） | 机器锁 | 修前实测 | 修后实测 |
| --- | --- | --- | --- | --- |
| peer 下限（DSH-0.2.0-RC1-01） | `require('@deepseek-ai/dsh-app-boot').evaluatePluginCompatibility(manifest, exemptions, runtimeVersion)` —— 只读 `peerDependencies`，只判 `@deepseek-ai/dsh` 与 `@deepseek-ai/dsh-*` 两族键，`semver.satisfies(runtime, range, {includePrerelease:true})`；`runtimeVersion` 取装机树 `getDshRuntimeVersion()`，并与 `kernel-pin.packageVersion` 交叉断言 | `scripts/test/unit-plugin-peer-floor.test.js`（4 用例） | **2 条 DENIED**：`billion-context-dsh`（5 键 `>=0.1.5-alpha.1 <0.1.6-0`）、`dsh-better-sidebar`（14 键 `^0.1.0-rc.8`） | **0 DENIED / 29**（**2026-10-17 对 0.2.1-rc.1 复算**：29 条里 12 条声明 dsh 族 peer，共 38 个键；上一轮 0.2.0-rc.2 是 13 条 / 48 键，差的那 1 条 10 键是 `dsh-reasoning-effort`，本轮退役。better-sidebar 那条**不是我们放宽的结果**：0.24.1 上游自带 14 键 `^0.2.0-rc.1`，我们的改写作废；剩下的实质改动只有 `billion-context-dsh` 一处。判据字段本身换代改名 `peers`→`requirements`，哨兵随迁） |
| 浏览器模块表 × 命名空间成员链接（判据 A/B） | `node_modules/@deepseek-ai/dsh-client-web/lib/index.js` 的 `PLATFORM_MODULES`（**0.2.1-rc.1 实值 11 项**：react、react/jsx-runtime、react-dom、react-dom/client、`@deepseek-ai/cordis`、**`zod`**、**`@tanstack/react-virtual`**、`dsh-client-store`、`dsh-client-ui-slots`、`dsh-client-ui-primitives`、`dsh-client-ui-dockkit`；0.2.0-rc.2 是 9 项，两条新增是宿主开始向插件下发的浏览器依赖；`PRELOADED_CLIENT_EXTERNALS = []` 不变）↔ 插件产物里 `var _pkg = require("<spec>")` 的 `<spec>` 与 `_pkg.<member>` 取用 ↔ pin 内核各包导出面 | `scripts/test/unit-plugin-module-table.test.js` 用例 1-5、8、13 | **1 条硬断链**：`dsh-better-sidebar`（0.15.3 旧皮）23 个旧图标成员（`Icon*14/16`）× 4 个产物 = 112 处未守卫取用 | **0**（**2026-10-17 复算 73 处 require 别名改写、434 处成员取用全判（在册 29 条 / 29 个目录）**；5 种正当守卫形态逐一验证）。先前的 75/322 是 0.15.3 旧皮口径：换 0.24.1 后 better-sidebar 自身变成 **19 别名 / 413 成员**，
产物里 8 个 `Icon*16` 形态名字（自有 `src/client/icons.tsx` 共导出 10 个）全部是**插件自有符号**，
**0 处从 primitives 具名取用**（实测 `grep -o '_primitives…Icon*14/16'` 零命中）；112 处两级回落改写连同 `primitives-icons.ts` 垫片**整层作废** |
| 浏览器模块图（判据 C，A 的另半边） | 各插件 `exports['./client']` 入口 → 沿**相对 require** 走可达闭包 → 闭包内每个裸名 `require("<spec>")` 必须 ∈ `PLATFORM_MODULES` ∪ 该插件 `dsh.client.external`（`stripClientSuffix` 归一） | 同文件用例 9-10 | 判据本轮新建；建前盲区 = 裸第三方名（A 只判 `@deepseek-ai/*`）+ 入口落在 `dist/` 的产物被整目录跳过 | **26 条有 client 入口 / 26 个图文件 / 51 处裸名取用 → 0 表外、0 入口缺失、0 相对依赖断链**（2026-10-17 对 0.2.1-rc.1 复算；上一轮 0.2.0-rc.2 是 27/27/53，减少的 1 条入口与 2 处裸名取自退役件 `dsh-reasoning-effort`）。裸名全集恰为 `react×20, react/jsx-runtime×14, primitives×10, renderer×4, react-dom/client×2, react-dom×1` |
| manifest 入口可见性（全新环境判据） | 各插件 `main`/`exports` 指向的每个 JS 文件 ↔ 磁盘实存 ↔ `git check-ignore`（**引擎就是 git 自己**，不重写 ignore 语义；默认相对索引判定，正合「fresh clone 拿不拿得到」） | 同文件用例 11-12 | **1 条被遮蔽**：`dsh-prompt-optimizer` 的 `./client` → `dist/client.js` 落在通用 `dist/` 规则里，本机有、库里没有 | **58 条入口：0 磁盘缺失、0 被忽略遮蔽**（2026-10-17 对 0.2.1-rc.1 复算，比上一轮 60 少 2 条 = 退役件 `dsh-reasoning-effort` 的 `.` 与 `./client`；2026-10-19 `dsh-prompt-optimizer` 入口改回 `lib/client.js` 后其 `dist/` 例外已撤除，dist 例外只剩 `billion-context-dsh`） |
| `dsh.client` 声明可解析性 | 各插件 `package.json` 的 `dsh.client.inject` / `external` ↔ `node_modules/@deepseek-ai/*` 实存（`stripClientSuffix` 按内核 `dsh-client-modules` 同形归一 `<id>/client`→`<id>`） | 同文件用例 6 | — | **50 条声明（inject 42 + external 8）0 落空**（2026-10-17 对 0.2.1-rc.1 复算；上一轮 57 = inject 49 + external 8，少的 7 条 inject 全属退役件 `dsh-reasoning-effort`。再上一轮记的 56 = inject 46 + external 10，差 1 条来自 better-sidebar 换代：它的 `inject` 涨到 5 条、两条 primitives 图标 `external` 扩表随垫片一起撤掉。落空的后果是整个 client bundle 在浏览器里静默不加载，与 peer 拒挂同族） |
| 宿主半边 `inject` 服务名可解析性（判据 G，2026-10-17 第七条） | 按各件 `package.json` 的 `exports['.']`/`main` 解析**实际挂载**的宿主入口 → 抽顶层 `const inject` → 逐个服务名核对 pin 内核闭包扫出的提供集（`super(ctx,"NAME")` / `.provide("NAME")` / 局部字符串常量间接三形） | `scripts/test/unit-plugin-inject-services.test.js`（5 用例，纯函数 `scripts/lib/plugin-inject-services.js`） | **2 条违规**：`dsh-better-sidebar` 与 `dsh-basics-panel` 的宿主 inject 仍声明 `webRuntime`（判据写下时先跑真值，抓出的正是这两条；rc.2 时代它们只在无头跑里 pending，0.2.1 起恒 pending） | **0 违规 / 29 条全解析得到**（17 件声明非空 inject；提供集 159 名，含 connection/webServer/sessions/tools/settings，不含 webRuntime。事故形状回灌必判红、入口缺失必判 `entry-missing`） |
| 已移除服务引用 | `kernel-pin.json` 的 `services.removed` 13 条 id ↔ 插件正文的 `ctx.get("<id>")` | 同文件用例 7 | — | **0 真实引用**（判据只用 `ctx.get` 形态：裸 id 做子串匹配会在 base64 载荷里疯狂误报，0.2.0-rc.2 实测 `e2b` 命中 easyrewrite 的字体数据 —— 那种判据常红等于没有判据） |

每条守卫都带**反向捕获力**用例，不是「扫一遍求全绿」：
`unit-plugin-peer-floor` 用内存合成 manifest 证明收紧区间必判拒（`^0.1.0`、`>=0.1.5-alpha.1 <0.1.6-0`），
再把 `billion-context-dsh` / `dsh-better-sidebar` 的**真实 peer** 收回旧上界，断言判据转红；
`unit-plugin-module-table` 除合成夹具（未守卫必须报、5 种守卫形态必须不报、表外 spec 必须报、
扩表指向不存在的包必须记 unresolved）外，另有一条**真产物变异反证**（2026-10-08 随换代改形）：拿
`better-sidebar/lib/client.js`（522 KB 实产物）做宿主，往尾部接一段 `require("@deepseek-ai/dsh-client-ui-primitives")`
+ **未守卫**取用 rc.2 已移除的 `IconCloseFill14` / `IconChevronDown16`，同一套 `scanPlugin` 必须逐名报红且
只报这两个形态；同段落加回 `?? Icon*Regular` 守卫后必须 0 红（防「守卫常红」）；未变异的原始产物同判据必须
0 缺失（红点只来自变异段落）。**旧写法的「剥掉全部回落段后重扫」已作废**——0.24.1 产物里本就没有回落链可剥。
判据 C 与入口可见性两条新扫同样配了反证，且都刻意避开「样本量为 0 的绿」：
夹具是一个入口落在 `dist/client.js`、又 `require("some-ui-kit")` + `require("./chunk-1.js")` 的合成插件，
必须①报浏览器侧表外裸名、②把相对 chunk 里的 `react-native` 也抓进来、③不把 `require("${拼接}")` 误报、
④同一份 dist 产物在 A/B 半边也必须可见（白名单真起作用）；入口可见性用例另有**判据源反证**
（`some-plugin/dist/client.js` 必须判「被忽略」，`dsh-desktop/scripts/**` 必须判「未被忽略」），
证明 git 引擎那一侧不是恒 false 的摆设；同时断言「至少 1 条在册入口落在被整目录跳过的目录名下」，
否则白名单判据就是空转。

### 5.2 逐插件判定表（33 行，顺序 = `COMPANION_PLUGINS`，与 §一 同号）

「更新判定」按裁定分两列记账：**先 d-pack 发布面，再外部上游 / npm**。
两列的取值口径 = 4.1/4.2 的扫描器输出（`等版 / 我们更高 / 他们更高 / 无此件（未发布）`），
npm 列额外带 `身份 <same|foreign|unverifiable|unknown>／维护者`——**版本号高不等于可取**，
只有身份 `same` 的 npm 更高版本才构成更新目标（`actionable` 判据，见 4.2）。

「兼容实测」列写 **2026-10-08 复算**的 `别名 / 成员 / 裸名 → 缺失 · 表外 · 声明 · 移除引用`：
别名 = 产物里 `require("@deepseek-ai/…")` 改写点数，成员 = `_pkg.<member>` 取用点数（判据 A/B），
裸名 = `./client` 浏览器闭包里的裸 require 取用点数（判据 C），
声明 = 该插件 `dsh.client.inject + external` 条数，移除引用 = `ctx.get("<kernel-pin.services.removed id>")` 命中数。
全列的四个尾计数今天实测都是 **0**（缺失/表外/落空/移除引用），非零即 §5.1 的判据转红。
本表的**结构四列（序号/loader id/源目录/本机版本）与这七个数由 `scripts/test/unit-hub-registry.test.js`
逐行本地重放**（通道两列要网络，CI 上不可重放，所以锁只咬离线可算的面）——手抄错在这里是测试红，不是运气。

| # | loader id | 源目录 | 本机 | dsh 族 peer | d-pack | npm（版本｜身份／维护者） | 兼容实测 | 判定与本轮动作 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  1 | `balance` | `dsh-balance` | 0.2.0 | 1 peer `^3.18.0` | 0.1.2（我们更高） | 未发布 | 2 别名 / 0 成员 / 2 裸名 → 缺失 0 · 表外 0 · 声明 1 · 移除引用 0 | 维持；无需兼容动作（0.1.3 = flash 价目对齐官网 + 补 `deepseek-flash` 真实 id，纯数据层修复；0.2.0 = 导出 Config 声明三条 volatile 设置条目（`showBalanceDock`/`showOpenCodeGoUsage`/`balancePrices`），设置页两行由客户端自注册 `settings.general.item`——实测内核**不**按 Config 自动生成页面（autoGenerate 无客户端消费方），壳层 ⋯ 菜单 toggle-balance 同批退役；见 `docs/balance-architecture.md`）  |
|  2 | `file-changes` | `dsh-file-changes` | 0.1.0 | 0 peer | 0.1.0（等版） | 未发布 | 0 别名 / 0 成员 / 0 裸名 → 缺失 0 · 表外 0 · 声明 0 · 移除引用 0 | 维持；无需兼容动作  |
|  3 | `better-sidebar` | `dsh-better-sidebar` | 0.24.2 | 14 peer `^0.2.0-rc.1` | 0.15.4（我们更高） | 0.24.1（远端等版于上游基线｜我们 0.24.2 是本地跨代修复｜身份 same／huanlin） | 19 别名 / 419 成员 / 5 裸名 → 缺失 0 · 表外 0 · 声明 5 · 移除引用 0 | **三项自研能力实测已全部在位，本仓无待回吸差量——本轮改的是台账不是 `src/`**（复算基准是 0.15.3 备份 `dsh-desktop/.tmp-bs-0.15.3-backup/`（`src/` 与 `lib/` 两侧都在）：npm 侧 **没有发布过 0.15.3**（0.15.0/0.15.1/0.15.2 之后直接跳 0.16.0，2026-10-08 取 packument 29 个版本实测），d-pack 侧是 0.15.4，**所以这份 gitignore 的备份是旧面唯一存世副本，别当临时垃圾清掉**（实证：备份 `lib/client-editor.js` 里 `DiffTurnsPanel` 3 / `diffRows` 2 / `formatHistTime` 2 处命中，正是上一轮手改进产物的那张「按变更查看 diff」面板，0.24.1 的 `src/`+`lib/` 全树 **0 命中**——上游用 `src/client/diff/` 整面重做了它）；比法是用 `diff -u --strip-trailing-cr` 对 `src/`，再在交付字节里逐名核命中）：① `chunk-availability.ts` 的 lazy chunk 自动重试——新 src 完整保留 `nextDelayMs`、`isModuleSystemAvailable`、`moduleSystemUnavailableMessage`、`createChunkRetryLoop`，接线在 `chunk-loader.ts:56/305/321/346`（`visibilitychange` 调 `loop.poke()` 立即重探），**唯一被上游丢掉的是 `isChunkRegistered()`，全仓 0 调用者的死代码**；② `editor-features.ts` 与备份逐字节相同（696 行）；③ #171 三半全在：`EditorHost.tsx:122-136` 的 `failCountRef` 走 `nextDelayMs` 退避 + `reloadSeq`（error 态 tab 重新可见即重拉），`builtins/viewers.tsx:53-75` 的 `TextFallback` 用 `<pre>` 只读兜底。产物侧命中数（`lib/client.js` 与 `lib/client-registry.js` 同一份 src 编两遍，两列相同）：`reloadSeq` 2、`failCountRef` 6、`TextFallback` 2、`ensureChunkAutoRetry` 3；`editorFeatures` 2 在 lazy chunk `lib/client-editor.js`。**先前两处兼容改动作废**：14 条 peer 放宽（上游已直接声明 rc.1 线，含已消失的 `dsh-client-runtime` 键也随上游表撤掉）、23 个旧图标成员×112 处两级回落（`primitives-icons.ts` 垫片整目录不存在，上游换图标体系后无此项）。**换代是重建出来的**：仓库外临时目录 `npm ci --legacy-peer-deps` + `tsc -p tsconfig.build.json` + `tsdown` 跑通（`Build complete in 2036ms`），两个频道产物由同一份 `src/client/index.tsx` 编两遍；锁随迁共 **34 例**（`unit-better-sidebar-diff-surface` 21 + `unit-plugin-kernel-anchor` 8 + `unit-plugin-tab-host` 5）；加上本就存在、随换代复跑的两把能力锁（`unit-better-sidebar-chunk-retry` 22 锁 ①与③、`unit-better-sidebar-editor-features` 20 锁 ②），better-sidebar 五组锁 2026-10-08 实测 **76 例 / 0 fail**，详见 §5.4 首条。**2026-10-09 文件体验统一模型**（用户点名 `dsh-PACK` 迁移 VSCode 式文件系统）：`src/` 真改一轮——`EditorHost.tsx` 重写为「常驻左文件栏 + 每文件一个去重标签」（停靠树、原地切换、`editorExplorer` 三选一全退役，选键与 7 条文案 ×20 份字典同步摘除）、新增 `ExplorerRail.tsx`（栏画在**编辑器标签体内**，内核右栏无 pane 级插槽）、`state.ts` 增 `explorerOpen/explorerWidth`（140–480 夹取）与 `toggleExplorer/setExplorerWidth`；产物全量重建回填（同一 7 文件 JS 面，`invariant.js` 未变；`lib/types` 177→180，新增 `ExplorerRail.d.ts` 并补齐 `editor-features.d.ts`/`chunk-availability.d.ts` 两张此前未随包的类型面）。同轮修掉 tsc 门禁的 5 处存量错：`editor-features.ts` 在 `noUncheckedIndexedAccess` 下 `text[pos]` 判空 ×4（L66/68/79/81）与私有 `state` 跨类型转换 ×1（L647，改 `as unknown as`）——该文件是自研件（`f3634367c` 括号配对/折叠/查找三特性），修复行为等价。靶向复跑 125 例 / 0 fail（含五组锁 76 例 + `unit-sidebar-md-code-guard` 7 例 + 插件面余下 4 套）；全量 `npm test` 2006 例 / 1998 pass / 0 fail / 8 skip（2026-10-09）  |
|  4 | `dsh-session-manager` | `dsh-session-manager` | 0.1.0 | 0 peer | 无此件 | 0.6.2（他们更高｜身份 unverifiable／lesterq） | 1 别名 / 0 成员 / 2 裸名 → 缺失 0 · 表外 0 · 声明 2 · 移除引用 0 | 维持；**禁止按名更新**——npm 那条是 `hkkz9522/dsh-session-manager`（维护者 `lesterq`）的同名第三方实现，我们这份是自研件且 `package.json` 无 `repository` 自述，机器判 `unverifiable`（§4.2）  |
|  5 | `conversation-tweaks` | `dsh-conversation-tweaks` | 0.1.1 | 0 peer | 0.1.1（等版） | 未发布 | 2 别名 / 2 成员 / 3 裸名 → 缺失 0 · 表外 0 · 声明 2 · 移除引用 0 | 维持；`dsh.client.external` 扩 `dsh-client-ui-renderer` 已由内核解析，成员取用带 typeof 守卫  |
|  6 | `dsh-super-injector` | `dsh-super-injector` | 0.3.1 | 1 peer `>=0.0.1-rc <2` | 0.3.1（等版，not-shipped） | 未发布 | 8 别名 / 0 成员 / 0 裸名 → 缺失 0 · 表外 0 · 声明 1 · 移除引用 0 | 维持；无更新通道  |
|  7 | `prompt-custom` | `dsh-prompt-custom` | 0.5.0 | 2 peer `>=0.1.0-rc.6 <2` | 0.3.5（我们更高｜0.4.0/0.5.0 为本地升级线） | 未发布 | 1 别名 / 0 成员 / 3 裸名 → 缺失 0 · 表外 0 · 声明 0 · 移除引用 0 | **本地升级线 0.5.0（交互与视觉重做）**：宿主与协议零改动（proto 3 / 文件格式不变），只重写 client——卡片即提示词（芯片即切换，正文「保存」写回当前卡并写明目标；dirty 时三选面板：保存到当前卡并切换 / 另存为卡片并切换 / 丢弃改动并切换）+ 全套内核原语（Button/Switch/SegmentedControl/Input/Pill/Tag/DisclosureRow，预览折叠整行可点）；回归套件 client 19→**25 例**（含反证 2 条）。0.4.0 提示词卡的 host 侧（cards 净化 / 部分更新 / API_PROTO 2→3）原样继承；裸名 2→3 即新增的内核原语包引入（`@deepseek-ai/dsh-client-ui-primitives`，在内核模块表内、表外 0）。跨 minor 覆盖的随迁已在 §四 末条记账  |
|  8 | `workspace-anchor` | `dsh-workspace-anchor` | 0.1.1 | 0 peer | 0.1.0（我们更高｜0.1.1 为本仓库兼容修复线） | 未发布 | 0 别名 / 0 成员 / 0 裸名 → 缺失 0 · 表外 0 · 声明 0 · 移除引用 0 | **0.2.1-rc.1 真机坏（隔离内核发消息实测抓到）**：内核 `dsh-agent-loop` 撤掉了 rc.2 的 `systemPrompt.variable("cwd", …)`（新版只剩 provider / model），带 `{{cwd}}` 的节在装配期直接抛 `unknown prompt variable` → **每一条消息都「处理失败 UNKNOWN」**。修法：锚点文本由插件自己填成 `agent.session.header.cwd` 实路径并标 `interpolate: false`（不再依赖内核变量表），同时按 rc.2 原形状把 `cwd` 变量补注册回去，让别的节与用户自写文本里的 `{{cwd}}` 继续可解析。实机复验：人轮正常落盘、错误退到预期的 `MISSING_CREDENTIAL`（隔离 home 无密钥），变量报错零命中  |
|  9 | `wsl-settings` | `dsh-wsl-settings` | 0.1.0 | 2 peer `*` | 无此件 | 未发布 | 1 别名 / 0 成员 / 3 裸名 → 缺失 0 · 表外 0 · 声明 1 · 移除引用 0 | 维持  |
| 10 | `bot` | `ds-bot` | 0.2.0 | 4 peer `*` | 0.2.0（等版） | 未发布 | 49 别名 / 7 成员 / 3 裸名 → 缺失 0 · 表外 0 · 声明 0 · 移除引用 0 | 维持；Bot 团队本体；vendored patch 不接管 `web.searchProvider`（搜索仍由 dsh-free-search 运行时接管） |
| 11 | `compaction-acp` | `billion-context-dsh` | 0.2.27 | 7 peer `>=0.1.5-alpha.1 <0.3.0-0` | 0.2.2（我们更高） | 0.2.27（等版｜身份 unknown／tyanyin） | 0 别名 / 0 成员 / 0 裸名 → 缺失 0 · 表外 0 · 声明 0 · 移除引用 0 | **随包改动**：5 条 dsh 族 peer 上界放宽到 `<0.3.0-0`（`dsh-compaction`/`dsh-session`/`dsh-llm`/`dsh-tools`/`dsh-settings`），并去掉上游钉死 `0.2.0-rc.2` 的 brand / session-format* / timeout / typert-protocol / util-* 六条 peer（0.2.2-rc.1 下会被兼容性预检判失败）；`cordis`、`schemastery` 两键保留  |
| 12 | `dsh-pocket` | `dsh-pocket` | 2.12.0 | 0 peer | 2.12.0（等版） | 2.12.0（等版｜身份 same／leachzhou） | 8 别名 / 0 成员 / 2 裸名 → 缺失 0 · 表外 0 · 声明 5 · 移除引用 0 | **随包改动 1 处（2.12.0）**：hero 输入卡的两条 `:has(textarea)` 补并代锚 `[data-composer-input]`——Lexical 代没有 textarea，不改就是恒不命中的死规则；GPL-2.0 分发面见 §3.1 #13  |
| 13 | `openclaw-bridge` | `dsh-openclaw-bridge` | 0.8.1 | 6 peer `>=0.1.0-rc.6 <2` | 0.8.1（等版） | 未发布 | 3 别名 / 2 成员 / 4 裸名 → 缺失 0 · 表外 0 · 声明 4 · 移除引用 0 | 维持；设置面已是 codegen `settings-host` 垫片形态  |
| 14 | `input-history` | `dsh-input-history` | 0.1.1 | 1 peer `>=0.1.0-rc.6 <2` | 0.1.1（等版） | 0.3.2（他们更高｜身份 unverifiable／sunshaobei） | 0 别名 / 0 成员 / 1 裸名 → 缺失 0 · 表外 0 · 声明 1 · 移除引用 0 | 维持；**禁止按名更新**（同 #4 型撞名：npm 那条是 `sunshaobei/dsh-input-history`）  |
| 15 | `dsh-easyrewrite` | `dsh-easyrewrite` | 3.0.1 | 0 peer | 2.5.3（我们更高） | 3.0.1（等版｜身份 same／renzic-stone） | 0 别名 / 0 成员 / 2 裸名 → 缺失 0 · 表外 0 · 声明 7 · 移除引用 0 | 维持；它的 `pickIcon(旧名, 新名)` 就是本轮图标守卫认下来的正当回落形态来源。3.0.1 的文件卡 CSS 仍留旧哈希类 `gSkjMW_card`，已在 `unit-plugin-dom-contract` 的 G9 惰性名单登记（同一选择器链上另有自有锚）  |
| 16 | `change-review` | `dsh-change-review` | 0.1.2 | 0 peer | 0.1.2（等版） | 未发布 | 1 别名 / 0 成员 / 1 裸名 → 缺失 0 · 表外 0 · 声明 2 · 移除引用 0 | 维持  |
| 17 | `offpeak` | `dsh-offpeak` | 1.0.1 | 0 peer | 1.0.1（等版） | 未发布 | 0 别名 / 0 成员 / 0 裸名 → 缺失 0 · 表外 0 · 声明 0 · 移除引用 0 | 维持  |
| 18 | `settings-nav-custom` | `dsh-settings-nav-custom` | 0.1.1 | 0 peer | 0.1.1（等版） | 未发布 | 0 别名 / 0 成员 / 0 裸名 → 缺失 0 · 表外 0 · 声明 1 · 移除引用 0 | 维持（EAC 移植件走 EAC 账本通道，非 npm）  |
| 19 | `settings-groups` | `dsh-settings-groups` | 0.1.1 | 0 peer | 0.1.1（等版） | 未发布 | 0 别名 / 0 成员 / 0 裸名 → 缺失 0 · 表外 0 · 声明 1 · 移除引用 0 | 维持  |
| 20 | `synapse` | `dsh-synapse` | 0.3.1 | 0 peer | 0.3.1（已对齐） | 0.4.2（他们更高｜身份 unknown／liangmianya） | 0 别名 / 0 成员 / 0 裸名 → 缺失 0 · 表外 0 · 声明 0 · 移除引用 0 | **2026-10-19 已吸收 d-pack 0.3.1 的 `sessionEvents()` 兼容口并升到 0.3.1**：回填路径改走 `snapshotEvents()`，不再读 rc.2 已下线的 `session.events`（旧 0.3.0 会静默产出 0 条消息）。npm/upstream 0.4.2 仍不取（会覆盖深色适配桥与水位线增量重放，且 tarball 不带测试）。`snapshotEvents()` 优先、`session["events"]` 下标回退的兼容口保留给老宿主。 |
| 21 | `dsh-subagent-lens` | `dsh-subagent-lens` | 0.1.1 | 3 peer `>=0.1.0-rc.6 <2` | 0.1.1（等版） | 未发布 | 2 别名 / 2 成员 / 4 裸名 → 缺失 0 · 表外 0 · 声明 4 · 移除引用 0 | 维持；带 `bindSnapshotSelector` 三级回落链  |
| 22 | `basics-panel` | `dsh-basics-panel` | 0.4.2 | 1 peer `^0.1.2-rc.1 或 >=0.2.0-rc.1 <0.3.0` | 0.1.1（我们更高） | 未发布 | 4 别名 / 0 成员 / 2 裸名 → 缺失 0 · 表外 0 · 声明 2 · 移除引用 0 | 维持；按裁定本地跑它的构建  |
| 23 | `input-fold` | `dsh-input-fold` | 0.1.1 | 1 peer `>=0.1.0-rc.6 <2` | 0.1.1（等版） | 未发布 | 0 别名 / 0 成员 / 0 裸名 → 缺失 0 · 表外 0 · 声明 1 · 移除引用 0 | 维持  |
| 24 | `prompt-optimizer` | `dsh-prompt-optimizer` | 3.0.0 | 0 peer | 2.0.4（我们更高） | 2.0.3（我们更高｜身份 foreign／npm 裸名 winditer；真上游 @y1x1n/dsh-prompt-optimizer 0.6.1） | 9 别名 / 0 成员 / 2 裸名 → 缺失 0 · 表外 0 · 声明 4 · 移除引用 0 | **2026-10-19 换为 vendored 上游 `Y1X1n/dsh-prompt-optimizer` 0.6.1**（本地版本线 3.0.0，包名与 loader id 不变以便老 profile 原地覆盖）：host 半边 `inject=['llm']`，注册 `POST /dsh-prompt-optimizer/optimize`（SSE 流式）与 `POST /dsh-prompt-optimizer/test-model`（连通性探活）；client 半边注册输入框右侧按钮、`conversation.input.dock` 结果面板与 `settings.plugins.tab` 插件页标签（设置读写走内核 `configForms`；设置卡含「优化用模型 / 回退模型」下拉、`session/modelCatalog` 目录拉取与连通性测试，上游 0.1.x 的 `settingsScope` / `settings.plugin.item` 兼容面已摘除）；产物为 `lib/{index,client,prompt,controller}.js`，由随包 `scripts/build.mjs` 重建，`src/` 与上游 `test/` 同源保留；依赖仅 `@deepseek-ai/schemastery`。旧 2.4.0 自研升级线（`dist/client.js` 入口、项目目标/上下文/意图/撤销等）已整体退役，其 `.gitignore` 例外与四个专属测试同批移除，历史见 CHANGELOG 2.1–2.4 段。 |
| 25 | `dsh-builtin-manager` | `dsh-builtin-manager` | 0.2.0 | 2 peer `>=0.1.0-rc.6 <2` | 0.1.0（我们更高｜0.2.0 为本地升级线） | 未发布 | 1 别名 / 0 成员 / 3 裸名 → 缺失 0 · 表外 0 · 声明 0 · 移除引用 0 | 维持（本仓库自研新增，2026-10-11；**本地升级线 0.2.0（交互与视觉重做）**：宿主与写入链零改动，只重写 client——工具栏（搜索 + 重新读取）+ 状态筛选（全部/已启用/已停用，计数与列表同源）+ 单列表行内反馈（在途门控，成功与失败落在本行）+ 「已改动 · 下次启动生效」徽标 + 全套内核原语（Button/Switch/SegmentedControl/Input/Tag）；回归套件 client 10→**12 例**（含反证 4 条）。裸名 2→3 即新增的内核原语包引入（`@deepseek-ai/dsh-client-ui-primitives`，在内核模块表内、表外 0））  |
| 26 | `goal-completion` | `dsh-goal-completion` | 0.1.0 | 2 peer `>=0.1.0-rc.6 <2` | 无此件 | 未发布 | 2 别名 / 0 成员 / 3 裸名 → 缺失 0 · 表外 0 · 声明 0 · 移除引用 0 | **新增（本仓库自研，2026-10-16）**：只做官方 GoalBar 没暴露的那一个动词 `remote.goals.complete` + 状态机可见性（`phase` 四态里官方字典连 `complete` 档都没有，`blocked` 的 code/message 也不显眼）。宿主面全部实测在位：`sidebarRightTabs.register` + `sidebar.right.pane.tab`（0.1.6 起的公开标签 API，同款接线见 `docs/better-sidebar-kernel-integration.md`）、`ctx.locale.register/bind`（renderer 按槽位 `locale: NS` 注 `t`，切语言整体重渲染）、原语 `Tag`/`Button`（rc.2 导出面逐一核过）。裸名 3 = `react` / `react/jsx-runtime` / `@deepseek-ai/dsh-client-ui-primitives`（在模块表内、表外 0）；成员 0 是解构式引入（无命名空间取用，判据无从判——与 #29 同形）。**两条只有真内核才能撞出来的宿主契约（2026-10-16 隔离安装布局 + 页面探针实测）**：① `ctx.remote.goals.get(sessionId)` 回的是**信封** `{ok:true, value:view}`，不是裸 view——按裸 view 解析时 `view.id` 恒 undefined，界面把有目标的会话显示成「还没有目标」，而同一时刻官方 GoalBar 正常显示；② 投影快照是 `{goal:{id,revision,objective,phase,maxGoalRounds}, roundsStarted, createdAt, updatedAt}`，**`activation` 不在投影里**（只在远端那份 value 里），官方 GoalBar 也是「goal 取投影、activation 另走观测线」的两条线组合，所以本插件按 id+revision 对齐后合并，两者都缺才落空态。回归锁 `unit-goal-completion-client` 27 例（含 5 条反证），夹具的 `get` 默认回信封形状 |
| 27 | `web-search-free` | `dsh-free-search` | 0.9.39 | 5 peer `^0.1.7-rc.1 或 ^0.2.0-rc.1` | 无此件 | 0.9.39（等版｜身份 same｜DDDMUC） | 3 别名 / 0 成员 / 3 裸名 → 缺失 0 · 表外 0 · 声明 3 · 移除引用 0 | **新增（2026-10-22 用户点名内置，MIT）**：注册 `ctx.web` 搜索 provider（id `ddg` / `fs-quality-fetch`），首启在 provider 未显式选中时接管；宿主 8 条 `/api/dsh-free-search-settings/*` 路由 + settings + systemPrompt 节 + 6 个工具，0.2.1-rc.2 兼容 oracle 实测 0 拒挂。**随包改动 1 处**：`lib/cache.js` 的 research 缓存落点由写死 `~/.cache` 改为 `DSH_HOME` 优先（保留 `RESEARCH_CACHE_DIR` 覆盖口，隔离测试不再写真实用户缓存）。更新源 `web-search-free` → npm `dsh-free-search`。 |
| 28 | `shop` | `dsh-plugin-shop` | 0.9.3 | 3 peer `>=0.1.1-rc.2 <0.3.0-0` | 无此件 | 0.9.3（等版｜身份 same｜LivXue） | 2 别名 / 0 成员 / 2 裸名 → 缺失 0 · 表外 0 · 声明 0 · 移除引用 0 | **新增（2026-10-22 用户点名内置，Apache-2.0）**：插件商店（浏览/安装/启停/更新第三方插件）；`exports["./client"]` + `lib/typert.host.js` 是加载期硬依赖，故取 npm tarball 全量产物随包。**Desktop 限制**：安装/更新最终都走 pnpm，而 payload 只带 npm → 统一 `pnpm-missing`（浏览、详情、启停可用）；内置件的查看/更新由 `dsh-builtin-manager` 承担（B 案）。更新源 `shop` → npm `dsh-plugin-shop`。 |
| 29 | `network-proxy` | `dsh-network-proxy` | 1.0.4 | 0 peer | 无此件 | 未发布（`@local` 私有 scope） | 1 别名 / 0 成员 / 1 裸名 → 缺失 0 · 表外 0 · 声明 2 · 移除引用 0 | **新增（2026-10-22 用户点名内置，MIT）**：设置-通用「HTTP 代理」行（直连/跟随系统/自定义），`ctx.connection.fetch.register` 挂 `/api/network-proxy`（未认证 401、owner principal 403）；Windows 读 WinINET、macOS `scutil`，WSL/Linux 降级为 system-unreadable。**随包改动 2 处**：凭据文件 `network-proxy.json` 写 0600（POSIX）；客户端 locale 快照改读 `snapshot.active`（rc.2 幽灵字段）。更新源 `network-proxy` → GitHub release 无资产时取 zipball（无 digest 明示跳过校验）。 |
| 30 | `mcp-manager-ui` | `dsh-toolbox-ui` | 1.10.1 | 9 peer `>=0.2.1-rc.5 <0.3.0` | 无此件 | 1.10.1（等版｜身份 same｜Imzl-zl） | 1 别名 / 0 成员 / 1 裸名 → 缺失 0 · 表外 0 · 声明 1 · 移除引用 0 | **新增（2026-10-22 用户点名内置，MIT）**：右下悬浮「工具箱」+ 侧栏底部入口（MCP 市场 / 技能管理，typert 37 个 Remote）；`mcp-import-sources` 静态导入 `smol-toml`（BSD-3-Clause），已加入 `dsh-desktop/package.json` 依赖与 `VENDOR_DEPS`。更新源 `mcp-manager-ui` → npm `dsh-toolbox-ui`。 |
| 31 | `dsh-notify` | `dsh-notify` | 0.4.5 | 12 peer `^0.2.1-rc.2` | 无此件 | 0.4.5（等版｜身份 same｜bitterSmilezzz） | 3 别名 / 3 成员 / 3 裸名 → 缺失 0 · 表外 0 · 声明 7 · 移除引用 0 | **新增（2026-10-22 用户点名内置，MIT）**：渲染进程 Web Notification 六类事件（审批/提问/轮次/会话结束/出错/子代理）+ 点击回会话；宿主半边是空 apply + volatile Config，零副作用。**接入后壳层「回合完成」通知下线**（保留 session watcher 的 `active_turns` 假死判定与 ACP/崩溃通知）。更新源 `dsh-notify` → npm `@bittersmilezzz/dsh-notify`。 |
| 32 | `dsh-context` | `dsh-context` | 0.83.0 | 2 peer `>=0.2.0-rc.2 或 >=0.2.1-rc.2 或 >=0.2.2-rc.1` | 无此件 | 0.83.0（等版｜身份 same／bowenliang123） | 0 别名 / 0 成员 / 0 裸名 → 缺失 0 · 表外 0 · 声明 6 · 移除引用 0 | **2026-11-09 新增（上游整包 vendored 0.82.1）**：右栏上下文看板 + `/context` 命令；宿主半边只用宿主闭包的 `dsh-session`/`schemastery` 与 VENDOR_DEPS 的 `zod`，自身不带依赖树。0.83.0 于 2026-11-09 由 0.82.1 升级（先前按用户点名落的是 0.82.1） |
| 33 | `ds-harness-remote` | `ds-harness-remote` | 0.6.4 | 11 peer `>=0.2.0-rc.1 <0.3.0-0 或 >=0.2.1-0 <0.2.2-0 或 >=0.2.2-0 <0.2.3-0` | 无此件 | 0.6.4（等版｜身份 same／liguobao） | 4 别名 / 0 成员 / 0 裸名 → 缺失 0 · 表外 0 · 声明 9 · 移除引用 0 | **2026-11-09 新增（上游整包 vendored，当日 0.5.19 → 0.6.4）**：内层 `node_modules` 随包正件分发（34.9MB / 3413 文件，缺 optional 的 `@roamhq/wrtc` 原生件；0.6.4 起 `werift` 不再进依赖树，WebRTC 走 dist 内联的纯 JS 回退）；bundle patch 有桌面 / TUI 两条 insert 行，桌面行 id 即清单 id |

计数对账（**2026-10-17 按 `scan-plugin-channels.mjs --npm` 现跑输出重述**，当时在册 34 条——2026-11-08 退役 3 件后在册 31 条，本节数字为快照口径；
§5.2 表内的 d-pack / npm 两列是 2026-10-08 那轮抄录、`unit-hub-registry` 不锁网络通道，**以本段为准**）：
**npm 通道** 等版 1（`dsh-easyrewrite`）/ 我们更高 1（`prompt-optimizer` 3.0.0 vs 2.0.3）/
他们更高 7（`better-sidebar` 0.28.0、`dsh-pocket` 2.11.0、`compaction-acp` 0.2.27、`synapse` 0.4.2、
`dsh-session-manager` 0.7.1、`input-history` 0.3.2、**`offpeak` 3.3.0 本轮新增**）/ 未发布 20；
**身份分布** `same 3（better-sidebar、dsh-pocket、dsh-easyrewrite）/
foreign 2（offpeak、prompt-optimizer——后者 2026-10-19 换为 Y1X1n 上游后，npm 裸名对应的是 winditer 的旧实现）/
unverifiable 2（dsh-session-manager、input-history）/ unknown 2（compaction-acp、synapse）/ absent 20`；
**可取候选 2 条**（`better-sidebar` 0.28.0、`dsh-pocket` 2.11.0，都是 `same` 且更高）——
**均只登记、本轮未执行更新**，理由见 4.2 末段。
**d-pack 通道本轮不可重放**（本机 `D:\workspace\dsh-pack` 不是 git 仓库，扫描器直接报跳过），
2026-10-08 那轮的账是：等版 20（18 shipped + `side-session`/`super-injector` 收录于 `not-shipped/`）/
我们更高 4（`better-sidebar`、`billion-context-dsh`、`dsh-easyrewrite`、`basics-panel`——原记 5 条，
第 5 条 `dsh-reasoning-effort` 本轮退役不再计数）/ 他们更高 1（`synapse`）/ 无此件 2（`dsh-session-manager`、`wsl-settings`）。
**兼容通道**（2026-10-22 对 0.2.1-rc.2 复算，当时 34 条在册；2026-11-08 退役 3 件后在册 31 条）34/34 peer 可挂（0 DENIED，16 条声明 / 73 键）、
A/B 83 处别名 + 437 处成员取用 0 缺失 0 表外、C 31 个图文件 61 处裸名 0 表外 0 相对依赖断链、
55 条 `dsh.client` 声明 0 落空、12 条已移除服务 0 引用、63 条 manifest 入口 0 缺失 / 0 被 gitignore 遮蔽；
本轮换代对插件面的实质改动 **0 处**（补丁层随迁不等于插件层随迁：在册插件的产物与 `src/` 一字未动，
它们与 0.2.1 的兼容判据由上面这六条静态扫 + §5.4 的隔离内核实机共同作证）。

**第三条通道（外部上游 main）的取证值不重放**，它来自 §三 的逐条仓库核验（`api.github.com` 在本机被封，
走 git-over-https 拿 `package.json`），仍改变或支撑判定的 7 条（**编号按 2026-11-08 重编号后的 §一 序号**；
`dsh-reasoning-effort` 那条随该件 2026-10-17 退役撤账，判定留档在 §3.5 风险 5）：
`billion-context-dsh`(#11) main **0.2.26**（与 npm 等版，已在最高通道）、
`dsh-pocket`(#12) main 2.10.6（**我们 2.10.7 更高**，2.10.7 取自 d-pack）、
`dsh-easyrewrite`(#15) main **2.6.0**（等版）、
`dsh-offpeak`(#17) main 1.0.0（我们 1.0.1 更高）、
`dsh-synapse`(#20) main 0.4.2（与 npm 同版，两条通道都不取）、
`dsh-basics-panel`(#22) main 0.4.1（同版，按裁定本地跑它的构建）、
`dsh-prompt-optimizer`(#24) main 0.6.1（2026-10-19 换为 vendored 基线；本地版本线 3.0.0。npm 裸名 `dsh-prompt-optimizer` 2.0.3 属 `winditer` 的另一实现，身份 `foreign`，**不按裸名更新**）。
其余在册件的上游 main 不改变判定：**12 条自研件**（`balance` #1、`file-changes` #2、`conversation-tweaks` #5、
`prompt-custom` #7、`workspace-anchor` #8、`wsl-settings` #9、`change-review` #16、`settings-groups` #19、
`subagent-lens` #21、`input-fold` #23、`builtin-manager` #25、`goal-completion` #26；与 §3.3 的自研计数逐字相等）
与 1 条 EAC 移植件（`settings-nav-custom` #18）**没有公开上游仓**，d-pack 发布面就是它们唯一的外部镜像；
`dsh-session-manager`(#4) 与 `dsh-input-history`(#14) 是自研件撞上别人的 npm 包（判定在 4.2）；
`dsh-better-sidebar`(#3) 已由 npm `same` 通道取到上游最新版；
`dsh-super-injector`(#6) 无唯一原仓库（3.5 风险 2）、`ds-bot`(#10) 上游有仓但许可为 Apache-2.0（3.5 风险 1 那条已随 `dsh-side-session` 退役解除）；
`openclaw-bridge`(#13) 的上游 `hzhz314159/openclaw-dsh-bridge` main 是 0.8.0，我们 0.8.1 取自 d-pack，已在更高侧。

### 5.3 复算命令（台账任一数字都可当场重放）

```bash
cd dsh-desktop
node --test scripts/test/unit-plugin-peer-floor.test.js scripts/test/unit-plugin-module-table.test.js
# 通道判据（纯函数 + 本地真数据）与两张收口锁（§5.2 七数重放、loader id ↔ 补丁层命中）：
node --test scripts/test/unit-plugin-channels.test.js scripts/test/unit-hub-registry.test.js
# 两条外部通道（§4.1/§4.2 与 §5.2 的通道、身份、可取列都由它现算，台账数字就是它的输出）：
node scripts/compat/scan-plugin-channels.mjs                # 离线：d-pack 目录树 + 本地 package.json
node scripts/compat/scan-plugin-channels.mjs --npm          # 再加 npm /latest 切片（要网络/代理）
node scripts/compat/scan-plugin-channels.mjs --npm --json   # 机器可读，刷台账时吃这份
# d-pack 侧的「零漂移」前置：a064e10 就是本地 vendor 换装那次对齐的 commit
git -C ../../dsh-pack rev-list --count a064e10..origin/main  # 必须为 0，否则 §4.1 的账要重算
# 判据源实值（别信本文抄录，直接看）：
node -e "console.log(require('@deepseek-ai/dsh-app-boot').getDshRuntimeVersion())"
node -e "const t=require('fs').readFileSync('node_modules/@deepseek-ai/dsh-client-web/lib/index.js','utf8');
  const i=t.indexOf('const PLATFORM_MODULES = [');console.log(t.slice(i,t.indexOf(']',i)))"
# 逐插件计数（fleet 台账的 5 列数字来源）：
node -e "const l=require('./scripts/lib/plugin-module-table'),p=require('path');
  const c=l.makeContext({root:__dirname});
  for(const d of require('fs').readdirSync('assets/plugins')){
    const r=l.scanPlugin(p.join('assets/plugins',d),c);
    console.log(d,r.aliasCount,r.memberCount,r.missing.size,r.offTable.size)}}"
# 判据 C + 入口可见性汇总（§5.1 后三行数字来源）：
node -e "const l=require('./scripts/lib/plugin-module-table'),P='assets/plugins';
  const c=l.makeContext({root:__dirname}),g=l.scanFleetBrowser(P,c),rows=l.auditEntryVisibility(P);
  console.log('C  插件/图文件/裸名/表外/断链:',g.withClient,g.files,g.bareHits,g.report.length,g.broken.length);
  console.log('入口 总数/磁盘缺失/被忽略:',rows.length,rows.filter(r=>!r.exists).length,rows.filter(r=>r.ignored).length)"
# 判据 C 的逐插件视图（应全程无输出；有输出即「浏览器侧 missed the module table」）：
node -e "const l=require('./scripts/lib/plugin-module-table'),p=require('path'),fs=require('fs');
  const c=l.makeContext({root:__dirname});
  for(const d of fs.readdirSync('assets/plugins')){const g=l.scanBrowserGraph(p.join('assets/plugins',d),c);
    if(g&&g.entries.length)for(const s of g.offTable.keys())console.log('[浏览器侧表外]',d,s)}"
```

> 判据 C 的判据边界（为何不扩到 node 侧）：rc.2 实测全舰队 13 处「表外裸名 require」100% 落在
> `./client` 闭包之外 —— `dsh-super-injector/lib/index.js` 的 `fs`/`path`、`dsh-pocket` 的
> `node:fs`/`node:net` 与自带 `node_modules/qrcode{,-terminal}`（392 个文件已入库）、
> `dsh-openclaw-bridge/lib/core/qrcode.js` 的相对 vendored `./qrcode-vendor.cjs`。
> 这些在 Node 的 require 下都正当可解析，把它们判红等于把 Cordis bundle 半边的正常依赖全报成断链；
> 所以 A 只咬宿主作用域、C 只咬浏览器闭包，两半合起来才是完整的「missed the module table」覆盖面。

### 5.4 本轮改动的边界（如实记录，别当成已闭环）

- **better-sidebar 的重皮是重建出来的**（先前一条「本机跑不了它的构建」的判定已被实测推翻）：
  工作树内的 gitignore 目录 `dsh-desktop/.tmp-bs-build/` 里 `npm ci --legacy-peer-deps` + `tsc -p tsconfig.build.json` + `tsdown`
  全链跑通（`Build complete in 2036ms`），改动姿势一律**改 `src/` 再重跑上游构建**，产物
  `lib/client.js` / `lib/client-registry.js` 由同一份 `src/client/index.tsx` 编两遍得到，不再手改进物。
  **但换代收尾复算后，原本判为「我们侧独有」的三项能力已随 0.24.1 全部在位，本轮没有要回吸的
  差量**（逐条命中数与被丢的那段死代码见 §5.2 #3）——这条边界记的是「核对姿势」，不是「待办」。
  src↔产物 的同源关系由 `scripts/test/unit-better-sidebar-diff-surface.test.js` 咬住：区段定界唯一 +
  产物区段顶层名 ⊆ src 顶层名，缺席者必须逐名解释为 tree-shake 或常量内联（白名单写死在用例里，
  并当场验证 `context = 3`、`count >= 3` 两处折叠后的字面量在位）。
  0.24.1 的 `tsconfig.build.json` 是 `emitDeclarationOnly`，**不再产出逐文件 `lib/<name>.js` 镜像**，
  所以纯函数的可执行事实源只有 bundle 本体——夹具 `scripts/test/fixtures/better-sidebar-region.js`
  按 `//#region <源路径>` 切段在 vm 里实跑，测的就是交付的那份字节。
  **2026-10-09 首轮功能改动实测**：沙箱包（`.tmp-bs-build/`）的 `build` 脚本
  （`rmSync lib && tsc -p tsconfig.build.json && tsdown`）全链 0 退出——此前的 `tsc` 步实测因
  `editor-features.ts` 的 5 处存量错非零退出（改法与证据见 §5.2 #3）；
  台账里的 `lib/types`（177 张）比 `src/` 缺 `editor-features.d.ts` 与 `chunk-availability.d.ts` 两张
  （本次重建补齐到 180，emit 面与 `src/` 对齐）。回填用整目录替换 + `diff -rq` 复算
  （`Only in assets` 0 命中，无丢件，7 个 JS 面 + 5 份 sourcemap 全更新）。
- `dsh-better-sidebar` 上游 0.24.1 的 peer 表已**自带** `^0.2.0-rc.1` 全线（14 键），先前那条
  「含 rc.2 已不存在的 `@deepseek-ai/dsh-client-runtime`，靠内核 oracle 只判区间不判存在」的豁免
  随上游撤键而失效——现在没有任何一条 peer 键指向不存在的包（`unit-plugin-peer-floor` 实测 0 DENIED / 28）。
- rc.2 图标面（4 个 `Icon*Medium` + 94 个 `Icon*Regular`）与 `name.replace(/\d+$/,'') + 'Regular'`
  的确定性回落规则**本轮不再被使用**：上游换成自己的 `src/client/icons.tsx`（`react-icons` 依赖），
  产物里 0 处旧 `Icon*14/16` 取用，先前那 112 处回落改写连同 `primitives-icons.ts` 垫片一起作废。
  图标尺寸语义丢失的问题因此不存在了，但代价是图标体系与宿主脱钩（属上游形态，随包接受）。
- **通道扫描器不是无源的**：d-pack 半边读的是**本机 `../dsh-pack` 克隆**的 `origin/main` 树
  （`git ls-tree` + `git show`，不发网络请求），所以那个克隆陈旧或不存在时，判据只会得到「无此件」而不是报错——
  `--ref` 可显式指定，缺树时 `dpack.available=false` 并打警告。`unit-plugin-channels` 的 d-pack 用例按既有惯例
  （同 `unit-updater` 的两个 fallback）在无该目录时 `skip`，**这条 skip 是预期**，但它也意味着「d-pack 侧账目」的
  机器覆盖只在装了 d-pack 的开发机上生效。npm 半边是真网络源，失败即整行 `absent`（不误判成等版）。
- **身份判据的天花板是「自述」**：`identityVerdict` 只比两侧 `package.json` 的 `repository` slug，
  一个抄了上游 repository 字段的分叉件会判成 `same`。所以 `same` 只是**必要条件**——本轮 `same` 的 4 条里
  真正动手的只有 better-sidebar 一条，且落地前还核过 npm tarball 的字节与上游 tag 一致。
  反过来 `unverifiable`/`unknown` 永远不构成更新理由，这是刻意保守：撞名的第三方实现按名更新会直接覆盖本仓源码。
- **第三条通道（外部上游 main）不在机器覆盖面里**：§三 的 git-over-https 取证值（8 行版本号）是人证，
  扫描器不重放；下次换代仍要先做那一步，只看 `scan-plugin-channels.mjs` 会漏掉「上游比 npm 和 d-pack 都新」的那一侧。
- **挂载面收口把 `dsh-wsl-settings`（#10）登记成一条待核缺口**（本轮实测）：28 条在册件里 27 条自带
  `cordis.patch.yml` 的 `- insert:` 行、id 与清单一致、且声明 `dsh.bundle.patch`；只有它在**盘上**
  （`assets/plugins/dsh-wsl-settings/` 只有 `lib/` 与 `package.json`，没有补丁层文件）和**清单里**
  （`package.json` 的 `dsh` 只有 `client`，没有 `bundle.patch`）两头都没有自挂载声明。
  `unit-hub-registry` 的挂载审计把这类件收进**显式点名的目录例外名单**而不是静默放过，并同时断言
  「名单里那条确实没有补丁层」与「命中数必须是 27」——将来它被补上挂载声明时这条测试会先红一次，
  提醒撤掉名单。**它到底靠什么挂进 cordis 插件栈尚未证实**：boot 的 sync 步对 `isBundle=false` 的件只把
  `SYNC_SUBDIRS` 镜像进 `<profile>/node_modules/<name>`，既不进 `bundleNames`（`dsh.profile.bundles` 少一行），
  profile 层也没有代写 `- insert:` 的机器；而 `@deepseek-ai/*` 作用域件本就不可能由官方 `dsh plugin add` 装配。
  属 §5.1 静态扫之外的装配面问题，本轮只登记不处置。
- `dsh-super-injector`（#7）的 1 个 dsh 族 peer 与 8 处 require 别名改写来自它「运行时注入任意本地插件包」
  的本职，本轮只判「能挂上宿主」，未判它的注入面在新宿主上的行为（要进页面才暴露，属 §5.1 之外）。
- **判据 A/B 一度对 `dist/` 形态的入口完全失明**：`walkPluginFiles` 的 `SKIP_DIR` 整目录跳过 `dist/`，
  当时两条插件的运行入口恰好在里面（`dsh-prompt-optimizer/dist/client.js` 223 KB、
  `billion-context-dsh/dist/index.js` 274 KB）。改成「manifest 入口及其相对闭包一定穿过目录白名单」后
  别名计数 70 → 75，新增的 5 处**全部**来自 prompt-optimizer 的 dist 产物（billion 那份是纯 Node 侧，
  0 宿主别名）；成员取用仍 322 —— 即**扩面没带来新断链，但盲区确实存在过**，同类产物下次能被抓到。
  同一次修复里还抓到自己写的 bug：白名单按字符串前缀比对，传**相对**插件根时整条静默失效
  （计数退回 70），现已改为绝对路径比对，并在用例 2 里加了「相对根与绝对根扫描结果必须逐字段相等」的不变量。
  2026-10-19 `dsh-prompt-optimizer` 整体换为上游 vendored 版（入口 `lib/client.js`），这条 dist 形状
  现在只剩 `billion-context-dsh/dist/index.js` 一例。
- **历史上曾有两条插件的运行入口只在本机存在、不在库里**（2026-10-17 记录，现已无残留）：
  `dsh-prompt-optimizer/dist/client.js`（§5.2 #24）与 `dsh-reasoning-effort/lib/client/`（原 §5.2 #24）。
  前者随 2026-10-19 换为 `lib/` 入口而消失（`.gitignore` 的 dist 例外同批撤除，入口可见性现为
  58 条 / 0 磁盘缺失 / 0 被忽略遮蔽）；后者随该件退役整树删除。
  入口可见性用例（用例 11）咬的是「被 ignore」这一半，「未 add」那一半只有提交能闭合。
- 判据 C 的浏览器图闭包实测每条插件只有 1 个文件（上游 bundle 全内联，没有 chunk），
  所以**相对 chunk 分支目前只被合成夹具咬到**（用例 10 的 `./chunk-1.js`）；
  真出现拆 chunk 的产物时判据已在位，不需要再补一层。
- **第七个盲区：宿主运行时对象的「属性下线」不在任何一条静态扫里**（2026-10-08 由 §5.5 实测抓到，
  案例是 `dsh-synapse` 0.3.0 的 `session.events`）。六条判据咬的是宿主**模块表**成员取用（A/B/C）、
  `dsh.client` 声明落空、`ctx.get` 的**移除服务 id**（`kernel-pin.services.removed` 13 条全是服务）、
  以及 peer 区间；`session.events` 这类「拿到宿主实例后读它的一个字段」四处都不落地，于是 §5.2 那行
  七数全 0 却藏着一条真断链。补它的正确姿势不是再加一条字符串扫（`session.events` 的字面量在 d-pack
  那份里被刻意写成 `session["events"]`，扫字面量会两头漏），而是**把夹具钉成宿主真形状**——
  §5.5 待处置 ② 就是这条：夹具只能由 `Session.prototype` 反射出来的 own 名单生成，且新守卫必须配
  「反向夹具判红」的反证，否则它会像现有 10 个测试一样，为已经不存在的契约作证。


### 5.5 `dsh-synapse` 三源文件级差量报告（任务 #66，2026-10-08；**只做差量，不动产物**）

> 三个源都当场抽出来比过：本机 `assets/plugins/dsh-synapse` **0.3.0**、
> d-pack `origin/main`（`a064e10`）的 `packages/dsh-synapse` **0.3.1**（`git archive` 抽取，不发网络）、
> npm `dsh-synapse@0.4.2` 官方 tarball（`registry.npmjs.org`，787,860 B）。
> **规范化是第一步，不是可选步骤**：本仓插件文件是 CRLF，两个外部源是 LF。不归一时对 npm 那份做 `diff -u`，
> 8 个文本文件**全部**各报成一个「整文件重写」hunk（`index/client/app/styles/cordis.patch.yml/package.json/README/LICENSE`
> 各 1 hunk），真实差量（`app.js` 44 处、`index.js` 23 处）在这种视图下完全读不出来；归一到 LF 后
> `LICENSE`、`deepseek-mark.svg`、`cordis.patch.yml` 其实**逐字节相同**。上一轮 #43 对 24 条重叠件踩过同一个坑，
> 这次的代价更实在：行尾噪声把「1 行真实差异」淹成「全文件差异」，人眼一旦放弃逐条核对就会退回
> 「两条通道都会覆盖我们的改动」这种想当然的判定，
> 而 §一 #20 / §3.1 #20 / §4.1 里那条错账正是这么写进去的（本轮已逐处更正）。
> **现成解法是一个 flag**：`diff -u --strip-trailing-cr`（GNU diff，Git Bash 自带）——本节矩阵里的每个数字
> 现在都是用它重跑出来的，不需要先落一份归一化副本再比。

**文件级矩阵**（`+a/-b` 为对侧相对本机的行数，括号内是 hunk 数；「相同」= 归一后逐字节相等）

| 文件 | d-pack 0.3.1 | npm/upstream 0.4.2 | 差量性质 |
| --- | --- | --- | --- |
| `index.js` | +13/−1（2） | +87/−263（23） | d-pack 只加一段 `sessionEvents()` 兼容口；npm 是**另一条实现线** |
| `client.js` | 1 行（1） | +156/−169（8） | d-pack 只差 loader `id` 的 scope 前缀；深色适配桥两侧都在 |
| `app.js` | 相同 | +630/−439（44） | npm 独有 33 个符号（下表），同时**丢掉我们 37 个** |
| `styles.css` | 相同 | +120/−10（10） | 随 npm 新 UI 走 |
| `package.json` | 3 处（scope/版本/删 `prepare`/`inject` 排版） | 3 处（版本、`files` 收整个 `docs`、`dsh.client.inject` 多 4 个官方件、删 `prepare`） | 两侧都不是功能 |
| `cordis.patch.yml` | 1 行（`name:` 的 scope） | 相同 | repack 噪声 |
| `LICENSE` / `deepseek-mark.svg` / `README.md` | 三者相同 | LICENSE、svg 相同；README +54/−55 | — |
| `test/`（10 个文件、2645 行） | 逐字节相同 | **整目录不存在** | npm tarball 不发货，而 `scripts.test` 仍写 `node --test test/*.test.js` |
| `docs/` | 相同 | 多 `architecture.md`/`development.md`/`en/`/`zh-CN/` + 2 张 jpg | — |

**结论一：d-pack 0.3.1 不是「别人的实现」，就是我们这份 0.3.0 的换皮。**
`app.js`/`styles.css`/`test/`/`docs/`/`LICENSE`/svg 逐字节相同；四处真实差异里三处是 scope 命名与排版
（`@dsh-pack/dsh-synapse` 出现在 `package.json`、`cordis.patch.yml` 的 `name:`、`client.js` 的 loader `id`），
唯一的功能增量是那 13 行 `sessionEvents()`。**「取了会覆盖本仓 `perf`/`fix`」这句话对 d-pack 侧不成立**——
我们的两改（水位线增量重放、画布三态按需激活）本来就在 d-pack 那份里。

**结论二：本轮唯一抓到的一条真断链——本机 0.3.0 在 pin 的 rc.2 上回填静默归零。**
证据链三段，全部当场可重放（复算命令见本节末）：
1. **宿主面**：rc.2 `Session.prototype` 反射实测 own = `surface, id, eventAt, snapshotEvents, ownEvents,
   isOwnSeq, seq, append, requestHeader, requestContext, toolHistory, deriveMessages, deriveEventMessage`，
   **没有 `events`**；而 `ctx.sessions` 就是 `SessionStore`（`dsh-session/lib/types/index.d.ts:452` 写死
   `list(): Session[]`），所以本插件拿到的正是这个类的实例。
2. **行为面**（复算命令在本节末 ④，无需落盘脚本）：把两种形状的 session 喂给三份实现各自的
   `WorkspaceStore.projectSession`，实测矩阵是——

   | 喂入形状 | 本机 0.3.0 | d-pack 0.3.1 | npm/upstream 0.4.2 |
   | --- | --- | --- | --- |
   | 旧夹具形状（字面 `events` 数组） | messages=2 | messages=2 | **抛错**（`snapshotEvents is not a function…`） |
   | rc.2 形状（只有 `snapshotEvents`） | **messages=0 / 水位线 `null`** | messages=2 | messages=2 / 水位线 `undefined` |

   三行读得出三件事：本机那份在新宿主上**静默归零**；d-pack 那份两种形状都吃得下（它就是为这个写的兼容口）；
   npm 0.4.2 只吃新形状（旧宿主直接抛错），且**根本没有水位线字段**——它的回填每次都从事件 0 全量重放。
3. **影响面（刻意收窄，不夸大）**：`session/event` 在 rc.2 仍在发（`dsh-session/lib/index.js:1496`），
   实时链路走 `projectEvents(session, events)` 的显式入参不受累；`firstLiveSeq`（:1312/:1366）与 `header`
   仍是实例字段。所以症状是**重启/切会话时的历史回填不出消息**（画布上老会话空档、fork 子会话的尾巴缺失），
   而不是整卡崩溃、更不是报错——正是 fleet-sweep 规程里「无报错是弱证据」那一类。
4. **反向排查过「是不是我们的运行期补丁替它兜住了」**：`scripts/lib/patch-adapters.js` 里唯一写
   `this.events` 的那族补丁（`SESSION_EVENT_BOUND_*`，锚点 `var Session = class {` + `dispose() {}`）
   命中的是 **`dsh-api-session-controller/lib/client.js` 的浏览器侧 Session 视图**（实测 15 处 `this.events`），
   不是 `ctx.sessions` 的 Node 侧类；而本插件的 `client.js` 里 `.events` 取用 **0 处**。
   即补丁面既没有、也不可能替 `index.js:257` 这条读法兜底——断链结论不依赖「补丁没跑」这种巧合。

**结论三：npm/upstream 0.4.2 是另一条功能线，取整包要付三笔账。**
它的 `index.js:207` 已用 `session.snapshotEvents()`（注释点名「replaces the removed `session.events` getter」），
**兼容面比我们干净**；新增的 33 个 `app.js` 符号是一条实打实的 UI 功能线——快捷词（常用补充词）增删改与
localStorage 持久化、基于选区创建追问、卡片详情面板（查看完整会话 / 轮次 / 失败标记）、画布控制
（整理节点 / 定位到当前会话 / 缩放百分比）、会话地图视图切换、侧边栏折叠、归档此会话、拖拽把手。
代价是三笔：① **我们的 perf/fix 全丢**——`index.js` 12 个 ours-only 符号（`lastProjectedSeq` 6 处、
`projectionCursor`、`trimProjectedHistory`、`trimProcessEntries`、`PROJECTION_THREAD_MESSAGE_LIMIT`、
`PROCESS_ENTRY_LIMIT`、`MAX_PROCESS_TEXT_LENGTH`、`capProcessText`、`IDLE_SAVE_DEBOUNCE_MS`、
`PROCESS_TRUNCATED_SUFFIX`、`appliedSeqs`、`foldTarget`）+ `app.js` 37 个（`viewActive` 本机 14 处、
`detailScrollObserver` 8 处 `safeSessionStorage`、`shouldDeferDetailRender`、`projectionPollTimer`……
0.4.2 里**逐一 0 命中**）；② **client.js 的深色适配桥（`b9ca67a9e` 的 +18 行）为 0**；
③ **10 个测试文件、2645 行全部不在 tarball 里**（git 实测：`45f6ddae7` 首次 vendoring 不带测试，
`c1e23447f`/`e9753ca6a`/`ae66ff534` 三次提交才是这 2645 行——即整套测试是本仓资产，不是上游资产）。

**结论四：为什么 1981 例全绿、这条插件自带的 10 个测试也全绿，却抓不到它。**
`test/replay-watermark.test.js:20` 的 `makeSession()` 造的正是「有 `events` 数组」这个 rc.2 已不存在的形状——
**夹具替被测代码作证了一个宿主已经不提供的契约**，用例越绿越是坐实错账。判据面这一条也确实覆盖不到：
§5.2 里 #22 那行的七数是 `0 别名 / 0 成员 / 0 裸名 / 缺失 0 / 表外 0 / 声明 0 / 移除引用 0`，
因为本插件不 require 任何宿主模块（`inject: ['webServer','sessions']` 拿 `ctx`），
而 `kernel-pin.services.removed` 那 12 条全是**服务 id**——「宿主运行时对象上的属性下线」这一类不在任何一条
静态扫里。这是 §5.1 六条判据之外的**第七个盲区**，已登记进 §5.4。

**待处置（下一轮，本轮按裁定不动产物）**：
① 把 d-pack 那 13 行的 `sessionEvents()` 兼容口 cherry-pick 进本机 `index.js`（**与是否换版无关**，
它是一条独立的宿主兼容修复，本仓自己写也一样）；② 把 `makeSession()` 夹具改成 rc.2 形状（只有
`snapshotEvents`），补一条「两种形状都必须得 2 条消息」的守卫，并按惯例配反证——
反向夹具（只给 `events`）应当让新增用例判红，否则这条锁是恒真的；③ 若要吸收 0.4.2 的功能线，
路线只能是**逐符号回吸**（像 better-sidebar 那样改 `src/` 或按区段并 `app.js`），
不能整包覆盖，否则三笔账一起付。

**复算命令**（三个数都别信本文抄录）：

```bash
# 以下每条都在 2026-10-08 实跑过，注释里是期望输出（别信本文抄录，直接看）
cd dsh-desktop

# ① 三个源就位。d-pack 走本机克隆（`../dsh-pack`，不发网络）；npm 走官方 registry（787,860 B）。
git -C ../dsh-pack archive origin/main packages/dsh-synapse | tar -x -C <scratch>/dpack --strip-components=2
curl -sSL --ssl-no-revoke -o <scratch>/dsh-synapse-0.4.2.tgz \
  https://registry.npmjs.org/dsh-synapse/-/dsh-synapse-0.4.2.tgz && tar -xzf <scratch>/dsh-synapse-0.4.2.tgz -C <scratch>/npm

# ② 文件级矩阵：一个 flag 解决行尾（无 flag 时 npm 那份 8 个文本文件全报整文件重写）
diff -rq --strip-trailing-cr assets/plugins/dsh-synapse <scratch>/dpack
#   期望恰好 4 差异 + 1 独有：Only in dpack: CHANGELOG.md / client.js / cordis.patch.yml / index.js / package.json
diff -u  --strip-trailing-cr assets/plugins/dsh-synapse/index.js <scratch>/dpack/index.js   # +13/−1，2 hunk
for f in index.js client.js app.js styles.css README.md package.json; do
  printf '%-14s %s\n' $f "$(diff -u --strip-trailing-cr assets/plugins/dsh-synapse/$f <scratch>/npm/package/$f | grep -c '^@@')"
done   # 期望 23 / 8 / 44 / 10 / 1 / 3；同一条命令对 LICENSE 与 deepseek-mark.svg 必须是 0

# ③ 宿主面：rc.2 的 Session 到底还有没有 events（期望 has events? false / has snapshotEvents? true）
node -e "import('node:url').then(async u=>{const m=await import(u.pathToFileURL('node_modules/@deepseek-ai/dsh-session/lib/index.js').href);
  const own=Object.getOwnPropertyNames(m.Session.prototype);
  console.log(own.join(', '),'| has events?',own.includes('events'),'| has snapshotEvents?',own.includes('snapshotEvents'))})"

# ④ 行为面：两种形状喂本机 WorkspaceStore（期望 legacy messages=2 watermark=1 / rc2 messages=0 watermark=null）
node --input-type=module -e "
import {mkdtemp} from 'node:fs/promises'; import {tmpdir} from 'node:os'; import {join} from 'node:path';
const {WorkspaceStore}=await import('./assets/plugins/dsh-synapse/index.js');
const ev=[{type:'user/message',seq:0,time:0,data:{content:[{type:'text',text:'A'}]}},
          {type:'assistant/message',seq:1,time:1,data:{turn:1,step:1,message:{content:[{type:'text',text:'B'}]}}}];
for(const [k,s] of Object.entries({legacy:{id:'s1',header:{meta:{cwd:'/w'}},firstLiveSeq:0,events:ev},
                                   rc2:{id:'s2',header:{meta:{cwd:'/w'}},firstLiveSeq:0,snapshotEvents:()=>ev}})){
  const st=new WorkspaceStore(join(await mkdtemp(join(tmpdir(),'syn-')),'state.json'));
  await st.projectSession(s); await st.flush();
  const [w]=await st.list(); const g=await st.get(w.id);
  console.log('SHAPE',k,'messages='+(g.threads[0]?.messages.length ?? 'NA'),'watermark='+(g.threads[0]?.lastProjectedSeq ?? 'null'));
}"
#   同一份脚本改 import 路径喂 dpack 那份应得 legacy=2 / rc2=2；喂 npm 0.4.2 应得 legacy 抛错 / rc2=2 且 watermark=null
```

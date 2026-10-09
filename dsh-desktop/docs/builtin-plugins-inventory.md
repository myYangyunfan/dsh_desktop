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
> （分类计数：外部 vendored 12 / EAC 移植 1 / 自研 15 = 28；退役的 11 条按原分类在 §一末「已退役」表里保留结论）。
> 复算口径：`require('./scripts/lib/companion-plugins.js').COMPANION_PLUGINS` 逐条查 `assets/plugins/*/package.json`
> 的 `name`/`version`，再列出「源目录存在但清单不引用」的余集——**这个余集必须为空**
> （机器锁：`scripts/test/unit-hub-registry.test.js` 的收口用例；退役三件事 = 摘清单 + 进 `RETIRED_COMPANION_DIRS` + 删源）。
> 另一条对账线：`THIRD_PARTY_NOTICES.md` §4.1 的行集与本清单**必须逐名 1:1**（本次实测同为 28 行）。
> **门面也在同一条线上**（2026-10-08 起）：`README.md` / `README.en.md` 各有一张 28 行插件表，包名 / 版本 / 许可
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
> 「能不能挂上 rc.2 宿主、挂了会不会静默失效、全新 clone 拿不拿得到入口」。

## 一、内置插件（在册 28 条，`assets/plugins` 实存 28 个源目录，与清单 1:1）

> 下表逐条与 `COMPANION_PLUGINS` 顺序、各 `package.json` 的 `name`/`version`/`license`/`repository`、`node_modules`
> 实存情况对齐过（2026-10-07 远端批量更新后复测），序号 / loader id / 包名 / 版本 / `nm` 五列零偏差；
> `nm` 一条（#13 `dsh-pocket`）与 `shipsNodeModules` 声明一致；#12 `compaction-acp` 的 `nm` 已随 0.2.26 下线
> （上游 tsup 把 `acp-kernel` 内联进 `dist/index.js`，改用宿主闭包，见 `companion-plugins.js:57-61` 注记），
> `assets/plugins` 目录数同为 28、清单外余集为空。
> 这 28 条**整树进安装包**（内置线，交付面有「源数 = payload 数」门禁），同一份清单还是 boot 的 sync 步
> 做「历史配套件撤回」的依据——两个职责共用一份名单，别把「随包分发」误读成「清单只是分发清单」。
> **「一句话作用」列的 2026-10-08 逐格审计**：五格与包体实交付字节不符，已就地更正——#3 `better-sidebar`
> 的 `tasks` 是 subagent 标签的标题不是第四个 id（`builtinTabs()` 实测 5 个 id）、#7 `dsh-super-injector` 漏记
> 设置页插件管理 UI、#12 `billion-context-dsh` 漏记四个模型工具与 `/acp-prune`、#16 `dsh-easyrewrite` 漏记版本翻页器
> 与自带设置中心、#25 `dsh-basics-panel` 的 `FEATURES` 实测是 4 项不是 3 项（多出「归档会话」，与 #4 职责重叠）。
> 这一列**不在机器锁里**（名字 / 版本 / `nm` / §5.2 七数才是），所以它靠逐格对产物重放维护，改动要附命中行号。
> **2026-10-09 复算（#3）**：better-sidebar 的文件体验换成 PACK/VSCode 统一模型——常驻左侧文件栏 +
> 每文件一个去重标签（点文件不再原地替换），cell 已同步；证据：产物 `lib/client.js` 里 `explorerRail`
> 11 命中、`editorExplorer` 在 `src/` 与两份频道产物 0 命中。

| # | loader id | 包名 | 版本 | 一句话作用 | 上游 / 许可 |
| --- | --- | --- | --- | --- | --- |
| 1 | `balance` | `@deepseek-ai/dsh-balance` | 0.1.3 | 账户余额 + 本轮会话费用估算，注册到对话统计栏 dock | 自研（0.1.2 起余额投递改走宿主 HTTP 路由，见 `docs/balance-architecture.md`） |
| 2 | `file-changes` | `@deepseek-ai/dsh-file-changes` | 0.1.0 | 会话文件更改投影（折叠 tool/result 的 meta.diffs） | 自研 |
| 3 | `better-sidebar` | `dsh-better-sidebar` | 0.24.1 | VSCode 式右栏：文件/编辑器合并成一个 editor 标签（2026-10-09 起：常驻左侧文件栏 + 每文件一个去重标签，点文件不再原地替换）+ 统一变更页（git 与会话双镜头共用一套 diff 栈）+ subagent（标题「任务管理」）/ sidechat / diff，共 5 个内置标签（`builtinTabs()` 实测 id 集 = editor / git / subagent / sidechat / diff；先前多记的 `tasks` 是 subagent 标签的**标题**而非第四个 id，全树 `id: "tasks"` 0 命中），按会话隔离，并向其他插件开放标签注册服务；terminal/browser 交还宿主 | vendored 社区包 `omdsh-dev/DSH-better-sidebar`，MIT（**本轮按用户点名吸纳上游**：镜像 npm 0.24.1 全量重皮 + 9 个构建面文件，旧「d-pack 0.15.4 / npm 0.24.1 均不取」判据作废；**三项自研能力实测已随 0.24.1 在位、本仓无待回吸差量**（chunk 自动重试、editor-features、#171 文件查看兜底；逐条判定与丢掉的死代码见 §五 5.2 #3），跨代兼容改动见 §五 5.2 #3） |
| 4 | `dsh-session-manager` | `dsh-session-manager` | 0.1.0 | 会话行删除按钮 + 设置内「归档对话管理」面板（恢复/删除） | 自研（**但包名撞社区已发布包** `hkkz9522/dsh-session-manager`，npm 0.6.2；非其衍生，见 §三 3.5 风险 4） |
| 5 | `conversation-tweaks` | `@deepseek-ai/dsh-conversation-tweaks` | 0.1.1 | 隐藏长篇对话输出 + 会话右侧导航滑轨 | 自研（0.1.1 设置通道迁 `ctx.remote.settings`） |
| 6 | `quest-ui` | `@deepseek-ai/dsh-quest-ui` | 0.6.1 | Quest 模式界面一键开关（分组会话栏 + 卡片输入区 + 药丸元数据条），默认关闭 | 自研 |
| 7 | `dsh-super-injector` | `@dsh-external/dsh-super-injector` | 0.3.1 | 运行时注入任意本地插件包（junction + loader.create，不重启）、热重载、一键卸载、路由自愈，**外加设置页的插件管理 UI**（列表 / 卸载 / 拖入目录「内化」成新插件 / 挂区转正，`lib/index.js:3375` 起 `settings.section` 半边后端 + `POST /ingest`；「内化」是 0.3.1 新增，先前本格漏记） | 外部插件，manifest 标 BSD-3-Clause，但**既无唯一原仓库、也无许可原文可引**（见 §三 3.1 与 3.5 风险 2） |
| 8 | `prompt-custom` | `@deepseek-ai/dsh-prompt-custom` | 0.3.5 | 在设置页自定义官方注入的系统提示词（整体替换 / 追加） | 自研（本轮由 d-pack 覆盖，0.1.1→0.3.5 跨 minor；本轮共 4 条跨 minor，另 3 条来自外部上游，见 §五） |
| 9 | `workspace-anchor` | `@deepseek-ai/dsh-workspace-anchor` | 0.1.0 | 往稳定系统提示注入 `{{cwd}}` 偏好块，防 agent 目录漂移（不碰权限） | 自研 |
| 10 | `wsl-settings` | `@deepseek-ai/dsh-wsl-settings` | 0.1.0 | 设置页「WSL 后端」栏：local↔wsl 切换、发行版与安装目录、状态探活 | 自研 |
| 11 | `side-session` | `@dsh-external/dsh-side-session` | 0.3.1 | 临时会话悬浮窗：自动导入主对话上下文（`contextLength` 三档 = 120 / 600 / 5000 条，`lib/client.js:1209-1211` 实测），追问不污染主会话 | `hzhz314159/dsh-side-session`（**上游无 LICENSE 文件**；清单里的 MIT 是我们自标的不实标注，见 §三 3.5 风险 1） |
| 12 | `compaction-acp` | `billion-context-dsh` | 0.2.26 | Active Context Pruning，作为 CompactionEngine 后端的模型驱动上下文管理，**并注册 `compress` / `decompress` / `search_context` / `acp_status` 四个模型工具 + `/acp-prune` 斜杠命令**（`dist/index.js:6338` 的 `tools.register` 循环与 `:6352` 的 `ctx.get("commands")` 实测；先前本格只记了引擎半边） | `Tyan66666/billion-context-dsh`，MIT（0.2.26 = npm latest，高于 d-pack 0.2.2；内层 `node_modules` 随本版下线；peer 上界放宽与 dist 入口纳入判据见 §五 5.2 #12） |
| 13 | `dsh-pocket` | `dsh-pocket` `nm` | 2.10.7 | 手机扫码实时同屏操控桌面 web（WebSocket 透传 + cloudflared 公网隧道 + 二维码配对） | shaobeichen/dsh-pocket，**GPL-2.0**（2.10.7 取自 d-pack，npm latest 仍是 2.10.6） |
| 14 | `openclaw-bridge` | `@deepseek-ai/dsh-openclaw-bridge` | 0.8.1 | 微信 / 飞书官方频道桥接入 DSH agent 会话（分片回写、去重限流） | `hzhz314159/openclaw-dsh-bridge`，MIT（0.8.1 起设置面换成 codegen `settings-host` 垫片，`ctx.settings.register` 形态作废，锚点见 `scripts/test/unit-openclaw-settings-inject.test.js`） |
| 15 | `input-history` | `dsh-input-history` | 0.1.1 | 输入框 ↑/↓ 终端式已发送消息回溯（空草稿才触发、编辑即复位、按会话隔离） | 自研 |
| 16 | `dsh-easyrewrite` | `dsh-easyrewrite` | 2.6.0 | 消息撤回 / 重编辑 + 版本翻页器 `< X >`（撤回/重发产生的版本家族切换）+ 自带设置中心与草稿自动备份（0.6.4 起取代自研 dsh-message-rewind；后三项是 2.6.0 的自带面，`lib/client.js:2577/4324` 与 `lib/index.js:319` 的 `ctx.settings.register` 实测，先前本格只记了撤回半边） | Renzic-Stone/DSH-EasyRewrite，MIT（2.6.0 = 上游 main 与 npm latest 同版；本版起 `data-time-hover-root` 由它自写自收窄，不再是宿主锚） |
| 17 | `change-review` | `dsh-change-review` | 0.1.1 | AI 变更审核：让模型复查自己刚做的改动（正确性 / 安全性 / 目标一致性） | 自研 |
| 18 | `auto-compact` | `dsh-auto-compact` | 0.1.1 | contextPressure 达阈值（默认 80%，可调）自动发送 `/compact` | 自研 |
| 19 | `offpeak` | `dsh-offpeak` | 1.0.1 | 峰谷价格卫士：高峰时段拦截发送提醒，可定时到低价时段自动执行 | `christophersmith2737-commits/OffPeak`，MIT（vendored，非自研；上游 main 仍 1.0.0，1.0.1 取自 d-pack） |
| 20 | `settings-nav-custom` | `dsh-settings-nav-custom` | 0.1.1 | 设置页左侧导航项显示 / 隐藏与排序（localStorage 持久化） | **EAC 移植**（`DSH-EAC/EAC-Desktop`，`LICENSE` 署 Deepseek Harness EAC contributors，MIT） |
| 21 | `settings-groups` | `dsh-settings-groups` | 0.1.1 | 把设置「常规」页低频选项收进底部可折叠「高级选项」组 | 自研（README 自称「EAC 配套插件」不构成来源证据，见 §三 3.2 末的反例说明） |
| 22 | `synapse` | `dsh-synapse` | 0.3.0 | 非线性对话画布：同工作区的会话 / 追问 / 分支可视化拖拽 | liangmianya/dsh-synapse，MIT（**分叉件，两条通道都不取整包**，逐文件实测见 §五 5.5：npm/upstream 0.4.2 是另一条功能线，取它会覆盖我们的深色适配桥（`client.js`）与水位线增量重放 + 存储上限（`index.js` 13 个符号）并且不带任何测试；**但 d-pack 0.3.1 就是我们这份 0.3.0 换皮**——`app.js`/`styles.css`/`test/` 逐字节相同，只差 3 处 scope 排版与一段 `sessionEvents()` 兼容口，先前那句「d-pack 0.3.1 也会覆盖掉」是错账，本轮已改） |
| 23 | `dsh-subagent-lens` | `@dsh-external/dsh-subagent-lens` | 0.1.1 | Task/subagent 展开式活动视图 + 会话头部命令/文件聚合条（零额外后端请求） | 自研（**却借了 `@dsh-external` 作用域**：npm 与 GitHub 上该名下无任何仓库，见 §三 3.5 风险 3；0.1.1 起页内 bundle 注册名 = 包名，设置通道迁 `ctx.remote.settings`） |
| 24 | `reasoning-effort` | `dsh-reasoning-effort` | 0.8.1 | Codex 式「模型 + 推理强度」选择器，含自定义 provider 的 copy-ready 指引 | `HanaAyane/dsh-reasoning-effort`，MIT（0.8.1 = 上游 main/master 同版；d-pack 停在 0.7.1、npm latest 0.2.8 是 `Mu-scorpio` 旧线，见 3.5 风险 5。0.8.1 的 `./client` 入口改为目录形 `lib/client/index.js`，**新入口待入库**，见 §五 5.2 #24） |
| 25 | `basics-panel` | `dsh-basics-panel` | 0.4.1 | 设置页可视化并管理 MCP 服务器 / 技能 / 规则 / **归档会话**（空态带「新建」入口；`FEATURES` 实测 4 项，「归档会话」是 0.4.1 新增 tab，先前本格只记了三 tab，且它与 #4 `dsh-session-manager` 的归档管理面板职责重叠） | yxsj245/dsh-Basics-Panel，MIT（0.4.1 = 上游 main/master 同版，npm 未发布；d-pack 只有 0.1.1，故走外部上游并**本地跑它的构建**） |
| 26 | `input-fold` | `dsh-input-fold` | 0.1.1 | 超长用户提示词默认折叠为前几行 + 「展开」遮罩（>400 字或 8 行才生效） | 自研 |
| 27 | `prompt-optimizer` | `dsh-prompt-optimizer` | 2.0.4 | 输入框一键润色草稿（默认当前会话模型，零配置 SSE 流式；亦可自配 OpenAI 兼容 API） | `winditer/dsh-prompt-optimizer`，MIT（上游 main 与 npm latest 同为 2.0.3，2.0.4 取自 d-pack）。§一 曾误记为 `WestFox-AwA`，已更正。`./client` 入口是 `dist/client.js`，曾被通用 `dist/` 忽略规则遮蔽，本轮补库内例外，见 §五 5.2 #27） |
| 28 | `zcode-migrate` | `dsh-zcode-migrate` | 0.1.2 | zcode CLI 历史会话 → dsh 原生会话日志（inspect / migrate / verify 三工具 + `/zcode` 命令） | 自研 |

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
| 7 | 诊断 | `diag_run` / `diag_export` / `diag_validate` / `diag_order` / `diag_order_apply` / `diag_remove_bundle`，加 `DSH_TAURI_DIAG=1` 页面探针、`DSH_TAURI_DEVTOOLS=1` |
| 8 | 配置备份 | `backup_export`、`backup_restore` |
| 9 | WSL 后端 | `wsl_config_get`、`wsl_config_save`、`wsl_recheck` |
| 10 | 悬浮窗 | `float_window` / `float_close`（桌宠四命令 `pet_window` / `pet_close` / `pet_move_to` / `pet_set_auto_open` 已随 harness-pet 退役移除） |
| 11 | 赞助与守卫 | `sponsor_window` / `sponsor_qr`、`guard_action`（plugin-guard） |
| 12 | 更新链 | GitHub / Gitee 双源检查（`dsh-tauri/scripts/verify-update-sources.mjs` 校验，用例 `ta12-verify-update-sources.test.mjs`） |

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
> 分类计数（在册）：**外部 vendored 12 + EAC 移植 1 + 自研 15 = 28**。退役的 11 条原判据已并入 §一末的「已退役」表。

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

### 3.1 外部 vendored（12 条）—— 有明确上游仓库

> 原 17 条里的 5 条外部件（`dsh-vision`、`graph-memory`、`community-market`、`harness-pet`、`dsh-hub`）
> 已随 v1.0.0 批量退役下线，它们的上游仓 / 可达性 / 许可实测结论保留在 §一末「已退役」表，不再重复登记。

| # | loader id | 包名 | 原仓库（owner/repo） | 实测 | 判据出处 |
| --- | --- | --- | --- | --- | --- |
| 3 | `better-sidebar` | `dsh-better-sidebar` | `omdsh-dev/DSH-better-sidebar` | root 200 / LICENSE main 200 | `package.json#repository` 明确声明；npm latest 0.24.1 **与我们同版本**（本轮按用户点名取上游）；社区目录条目 `awesome-dsh-plugin/awesome-dsh-plugin@44ae0afa:data/plugins/omdsh-dev__DSH-better-sidebar.yml` 200 |
| 7 | `dsh-super-injector` | `@dsh-external/dsh-super-injector` | **未判定**（见 3.5 风险 2） | `dsh-external/dsh-super-injector` root **404** / LICENSE 无 | 包体无 `repository`/`homepage`/`author`；npm 两个候选名均 404；同名仓 5 个（`gongyijie85`/`lanbaolu`/`lileikeji`/`wendou-chen`/`yjh051108` 的 `dsh-super-injector`）无一可判为原创 |
| 11 | `side-session` | `@dsh-external/dsh-side-session` | `hzhz314159/dsh-side-session` | root 200 / **LICENSE main 与 master 均 404** | 上游仓库描述与我们的内置件描述逐字吻合（`not-shipped/README.md` 以此定案）；**上游没有许可证文件** |
| 12 | `compaction-acp` | `billion-context-dsh` | `Tyan66666/billion-context-dsh`（谱系上游 `ranxianglei/billion-context-pi`） | 两者 root 200 / LICENSE 200（前者 main、后者 master） | `README` 同时链到两个仓；上游 `main` 与 npm latest 同为 0.2.26，**与我们逐版相同**（本轮由外部上游通道更新；d-pack 只有 0.2.2）。0.2.26 起 dist 内联 `acp-kernel`，内层 `node_modules` 与 `shipsNodeModules` 同批下线 |
| 13 | `dsh-pocket` | `dsh-pocket` | `shaobeichen/dsh-pocket` | root 200 / LICENSE main 200 | `repository` + `homepage`；npm latest 2.10.6，**我们 2.10.7 取自 d-pack 发布面**（高于 npm）；`LICENSE` 是标准 GPL-2.0 文本（FSF 版权头） |
| 14 | `openclaw-bridge` | `@deepseek-ai/dsh-openclaw-bridge` | `hzhz314159/openclaw-dsh-bridge` | root 200 / LICENSE main 200 | `package.json#name` 与我们的完全一致，上游 `main`/`master` 实测 `@deepseek-ai/dsh-openclaw-bridge@0.8.0`/MIT —— 同名同仓，最强判据；**我们 0.8.1 取自 d-pack 发布面**（高于上游）。我们侧出处在 `companion-plugins.js:68-71` 注释 |
| 16 | `dsh-easyrewrite` | `dsh-easyrewrite` | `Renzic-Stone/DSH-EasyRewrite` | root 200 / LICENSE main 200 | `repository` + `LICENSE` 版权行 `2026 Renzic-Stone`；上游 `main` 与 npm latest 同为 2.6.0，**与我们逐版相同**（本轮由外部上游通道更新；d-pack 只有 2.5.3） |
| 19 | `offpeak` | `dsh-offpeak` | `christophersmith2737-commits/OffPeak` | root 200 / LICENSE main 200 | `repository` + `homepage`；上游 `main` 实测仍 `dsh-offpeak@1.0.0`，**我们 1.0.1 取自 d-pack 发布面**（高于上游）；npm 未发布（404） |
| 22 | `synapse` | `dsh-synapse` | `liangmianya/dsh-synapse` | root 200 / LICENSE main 200 | README 署名；上游 `main` 实测 `dsh-synapse@0.4.2`/MIT（d-pack 0.3.1），**两条通道都不取整包**（逐文件差量见 §五 5.5）：npm/upstream 0.4.2 会覆盖掉我们的深色适配桥（`client.js` 的 `dsw-` 桥 1 处）与 `perf(synapse)` 水位线增量重放 / 存储上限（`index.js` 13 个 ours-only 符号），且 tarball 不带 `test/`；**d-pack 0.3.1 反之——它就是本仓 0.3.0 的换皮**（`app.js`/`styles.css`/`test/`/`LICENSE`/svg 逐字节相同）。注意包内 `LICENSE` 版权行是**空署名**（`2026 `） |
| 24 | `reasoning-effort` | `dsh-reasoning-effort` | `HanaAyane/dsh-reasoning-effort` | root 200 / LICENSE main 200 | `repository` + `homepage` + `author: HanaAyane`；上游 `main`/`master` 实测 **0.8.1 与我们逐字相等**（本轮由外部上游通道更新；d-pack 停在 0.7.1，npm latest 0.2.8 那条是 `Mu-scorpio` 的旧线，见 3.5 风险 5） |
| 25 | `basics-panel` | `dsh-basics-panel` | `yxsj245/dsh-Basics-Panel` | root 200 / LICENSE main 200 | `package.json` 无 `repository`，判据走 README + `LICENSE` 版权行 `2026 又菜又爱玩的小猪`（对应上游账号名）；上游 `main`/`master` 实测 `dsh-basics-panel@0.4.1`，**与我们同版**（npm 未发布；d-pack 只有 0.1.1，故走外部上游并按用户裁定**本地跑它的构建**） |
| 27 | `prompt-optimizer` | `dsh-prompt-optimizer` | `winditer/dsh-prompt-optimizer` | root 200 / LICENSE main 200 | `repository` + `LICENSE` 版权行 `2026 winditer`；上游 `main`/`master` 与 npm latest 同为 2.0.3，**我们 2.0.4 取自 d-pack 发布面**（高于上游）。§一 曾误记为 `WestFox-AwA`，已更正 |

### 3.2 EAC 移植（1 条）—— 来自姊妹项目 Deepseek Harness EAC

判据是**包内 `LICENSE` 的版权行署名**（不是 README 的自我描述，见本节末的反例）：

| # | loader id | 包名 | 来源仓库 | 实测 | 判据 |
| --- | --- | --- | --- | --- | --- |
| 20 | `settings-nav-custom` | `dsh-settings-nav-custom` | `DSH-EAC/EAC-Desktop`（旧址 `zouyuxuan122/Deepseek-Harness-EAC`） | 旧址 root **301** / 新址 root **200** / `SOURCES.json` raw **200** | 包内 `LICENSE` 版权行逐字 `Copyright (c) 2026 Deepseek Harness EAC contributors`（MIT）；`package.json` 无 `repository`；EAC 账本 `dsh-desktop/assets/SOURCES.json`（updatedAt 2026-09-27）**无该包条目**，所以「EAC 里哪个目录」仍未定位 |

> 原第 2 条 EAC 移植 `dsh-file-drop` 已随 v1.0.0 批量退役（判据同形：`LICENSE` 署 EAC contributors、
> `SOURCES.json` 无条目），结论见 §一末「已退役」表。

> **README 自称「Deepseek Harness EAC 配套插件」却判为自研**：在册的 `dsh-settings-groups`(#21)
> 与已退役的 `dsh-image-paste` 同形——它们的 `LICENSE` 没有 EAC 署名（实测**根本没有 `LICENSE` 文件**），
> 而 EAC 自己那份 `SOURCES.json` 把这两个包的 `upstream.repository` 记成
> `https://github.com/myYangyunfan/dsh_desktop`（`pinnedHead` = `ee052c6b`，provenance 写
> 「dsh_desktop monorepo（2026-09-06 排查确认）」）——**方向是反的：EAC 是我们的下游，不是上游**。
> README 里那句「EAC 配套插件」是当年同源调试留下的描述残留，不构成来源证据。
> 对照：#20 `settings-nav-custom` 有 EAC 署名的 `LICENSE` 原文，才判为移植。

### 3.3 自研（15 条）

`dsh-balance`、`dsh-file-changes`、`dsh-session-manager`、`dsh-conversation-tweaks`、`dsh-quest-ui`、
`dsh-prompt-custom`、`dsh-workspace-anchor`、`dsh-wsl-settings`、`dsh-input-history`、`dsh-change-review`、
`dsh-auto-compact`、`dsh-settings-groups`、`dsh-subagent-lens`、`dsh-input-fold`、`dsh-zcode-migrate`。

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
| `mexiaosqwq/dsh-web-mobile` | root 200 / LICENSE main 200 | 同类手机侧插件，`dsh-pocket`(#13) README 提及 |
| `yanggenjie/zcode-data-archive` | root 200 / **LICENSE 无** | `dsh-zcode-migrate`(#28) README 引用它说明 zcode 历史会话格式，**不含其代码**，故无需 LICENSE |

### 3.5 许可与命名风险（5 处）

1. **#11 `dsh-side-session`：我们的 MIT 标注不实。** 上游 `hzhz314159/dsh-side-session` 存在（200）但
   `main`/`master` 都没有 `LICENSE`（404）——无许可证默认是**保留所有权利**，无权以 MIT 再分发。
   `dsh-pack` 已把它移出发布面（`not-shipped/dsh-side-session/`——注意这个 `not-shipped/` 在 d-pack
   **仓根**而非 `packages/` 下，源码留着作对照但不进发布目录树）。
2. **#7 `dsh-super-injector`：无唯一原仓库，许可无原文可引。** `dsh-external/dsh-super-injector` 404、
   npm 无包、包体无 author/repository/homepage，而 `9c5d91c6c`（2026-08-20，
   `fix(super-injector): 六处写穿 DSH_HOME 的 homedir() 硬编码改为跟随内核 home`）那次改动是我们自己动过
   它的源码（dsh-pack `not-shipped/README.md` 记录）；此时由我们补一份 BSD-3 文本填署名 = **伪造许可来源**。
   同样已移出发布面。
   §一 第 7 行只标到「未唯一判定，见 §三」，处置口径以此条为准。
3. **`@dsh-external/*` 是个空头的第三方作用域**：在册 3 条用它起名（#7 `dsh-super-injector`、
   #11 `dsh-side-session`、#23 `dsh-subagent-lens`；已退役的 `dsh-vision` 是第 4 条），但它不对应任何可解析实体——
   npm 上 `@dsh-external/dsh-vision`、`@dsh-external/dsh-side-session`、`@dsh-external/dsh-super-injector`、
   `@dsh-external/dsh-subagent-lens` **全部 404**，`github.com/dsh-external/dsh-subagent-lens` 也是 **404**。
   其中 **#23 `dsh-subagent-lens` 根本是自研**却借该作用域起名，属命名卫生问题
   （与 §一 顶部 `@deepseek-ai/*` 撞内核闭包作用域那条禁令同源）。
4. **包名撞社区已发布包，按名安装会装到别人**：
   #4 `dsh-session-manager` —— npm 已发布 `dsh-session-manager@0.6.2`（发布者 `lesterq`，repository 写
   `hkkz9522/dsh-session-manager`，root 200 / MIT），而我们的是 `0.1.0` 独立小实现（入口 `lib/index.mjs`，`LICENSE` 署 DSH Desktop contributors），
   **不是它的衍生**，但同名；机器判定已把它钉下来——我们的 `package.json` 不声明 `repository` 而远端声明了，
   §4.2 的 `identityVerdict` 因此落在 **`unverifiable`**（「无法证明同源」），「它版本更高」就永远不构成更新理由；
   #15 `dsh-input-history` 同形（npm 0.3.2 发布者 `sunshaobei` / repository `sunshaobei/dsh-input-history`，
   本地 0.1.1 无 `repository`）也是 **`unverifiable`**。
   ~~`dsh-hub`~~ —— npm 上 `dsh-hub` latest 是 `0.0.1`（repository 写 `dushaobindoudou/dsh-hub`，该仓现 **404**），
   与我们当时的 `1.1.5`（`ARFCON/dsh-hub-DSH`）是两条线；**该条已随 v1.0.0 批量退役，风险在本仓库侧自然消解**。
5. **两处「同名仓」的原创判定已由机器给出，不再靠人比版本**：#24 `dsh-reasoning-effort` 两边**都**声明
   repository 且不同（我们 `HanaAyane/dsh-reasoning-effort` / npm latest 0.2.8 `Mu-scorpio/dsh-reasoning-effort`）
   → `identityVerdict` = **`foreign`**（同名不同项目，npm 那条就是 §三 说的旧线）；
   #12 `compaction-acp` 的包名是 `billion-context-dsh`，两边都没声明 repository → **`unknown`**，
   此时仍只能靠 §三 的 git-over-https 人证（`Tyan66666/billion-context-dsh` 与谱系仓
   `ranxianglei/billion-context-pi` 都在、均 200，前者才是直接上游）。
   #22 `dsh-synapse` 同样是 `unknown`（npm 0.4.2 不自报 repository）——这正是它两条通道都「版本更高」
   却只出差量报告、不吸纳的机器依据。

> 处置边界：本节只是**取证与登记**，不改任何插件源码、清单条目、`THIRD_PARTY_NOTICES.md` 或交付面。
> 风险 1/2 的「不可再分发」结论目前只落在 dsh-pack 的发布面上；本仓库侧它们仍在 `COMPANION_PLUGINS` 在册
> （28 条），而在册的意义本就是给 boot 的 sync 步做「历史配套件撤回」依据——**在册 ≠ 随包分发**。

## 四、与外部更新通道的版本对照（2026-10-08 复算）

> 本节的全部数字是 `node scripts/compat/scan-plugin-channels.mjs --npm` 的**输出**（判据面在
> `scripts/lib/plugin-channels.js`，纯函数、`unit-plugin-channels` 单测覆盖），不是抄录上次结论。
> 4.1 是 d-pack 发布面通道，4.2 是 npm 通道 + 身份判定，4.3 是两条通道的口径雷区。

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
  ——其中 **16 条由上一轮 d-pack 版本对齐上来**（`file-changes`、`workspace-anchor` 更新前就同为 0.1.0）。
  另有 **2 条等版但发布面置于 `not-shipped/`**：`dsh-side-session`、`dsh-super-injector`（见 3.5 风险 1/2），
  扫描器把这两条记成 `present && !shipped`，**不构成更新目标**。
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

### 4.2 npm 通道与身份判定（2026-10-08 首次逐条机器化）

数据源：`npmLatestUrl(<包名>, mirror)`（`scripts/plugin-manager-update.js`，官方 `registry.npmjs.org`
失败自动退 `registry.npmmirror.com`）取 `/latest`，该端点自带 `version` + `repository` + `maintainers`，
够判「是不是同一个项目」。**这一步是必须的**：只看版本号会犯两类错——把撞名的第三方实现当上游（#4、#15），
或把旧分叉线当 latest（#24）。

28 条分布：**命中 9 条 / 未发布 19 条**（19 条 = 全部 11 个 `@deepseek-ai/*`+`@dsh-external/*` 作用域条目
再加 8 个未上 npm 的自研裸名件）。逐条：

| loader id | 本机 | npm latest | 版本位 | 身份判定 | 远端维护者 / 仓库 |
| --- | --- | --- | --- | --- | --- |
| `better-sidebar` | 0.24.1 | 0.24.1 | 等版 | **same** | `huanlin` / `omdsh-dev/DSH-better-sidebar` |
| `compaction-acp` | 0.2.26 | 0.2.26 | 等版 | **unknown**（远端无 `repository`） | `tyanyin` / — |
| `dsh-easyrewrite` | 2.6.0 | 2.6.0 | 等版 | **same** | `renzic-stone` / `Renzic-Stone/DSH-EasyRewrite` |
| `dsh-pocket` | 2.10.7 | 2.10.6 | 我们更高 | **same** | `leachzhou` / `shaobeichen/dsh-pocket`（2.10.7 取自 d-pack 发布面） |
| `reasoning-effort` | 0.8.1 | 0.2.8 | 我们更高 | **foreign** | `andrew3767` / **`Mu-scorpio/dsh-reasoning-effort`**（≠ 我们的 `HanaAyane` 线，§3.5 风险 5 由此从「版本比对推断」升级为机器确认） |
| `prompt-optimizer` | 2.0.4 | 2.0.3 | 我们更高 | **same** | `winditer` / `winditer/dsh-prompt-optimizer`（2.0.4 取自 d-pack） |
| `dsh-session-manager` | 0.1.0 | 0.6.2 | 远端更高 | **unverifiable**（本地无 `repository`） | `lesterq` / **`hkkz9522/dsh-session-manager`** —— 撞名第三方，**禁止按名更新** |
| `input-history` | 0.1.1 | 0.3.2 | 远端更高 | **unverifiable** | `sunshaobei` / **`sunshaobei/dsh-input-history`** —— 同上型撞名 |
| `synapse` | 0.3.0 | 0.4.2 | 远端更高 | **unknown**（远端无 `repository`，无法证明同源） | `liangmianya` / — |

身份四值（`scripts/lib/plugin-channels.js#identityVerdict`）：
`same` = 两侧 `repository` slug 逐字相等；`foreign` = 两侧都有 slug 但不等（**同名不同项目**）；
`unverifiable` = 本地 package.json 没自述上游、远端有仓库（自研件与分叉件都落这里，机器只能说到「无法确认同源」）；
`unknown` = 远端自己也没 `repository`。计数 `same 4 / foreign 1 / unverifiable 2 / unknown 2 / absent 19`。

**可取判据**（`channelRow().actionable`）：`d-pack shipped 且更高` **或** `npm 更高且身份 same`。
两条通道合起来今天的实测结果是 **1 条候选 = `synapse`**（来自 d-pack 0.3.1，人工判不取，见 4.1）。
npm 侧**一条都不构成目标**：9 条命中里 3 条等版、3 条我们更高、3 条远端更高但身份都不是 `same`。
换句话说 —— **本轮没有任何一条存在「同身份且更新」的远端版本**，
「更新列表」这件事的实测产物是**这张表本身**，而不是任何一次版本 bump。

### 4.3 两条通道的口径雷区

- dsh-pack 的 `THIRD_PARTY_NOTICES.md` 表是 `scan-licenses.mjs` 生成的**快照**，本次实测它已与
  `packages/` 磁盘不一致（notices 记 `prompt-custom 0.1.1`，磁盘是 `0.3.5`）；聚合元包 `packages/meta-all/package.json` 自述「29 个插件」，磁盘同为 32。
  **若将来以 dsh-pack 作同步源，读 `packages/*/package.json`，不要读它的 notices 表或元包自述。**
- **npm 版本号高低不是身份**。今天实测的 3 条「远端更高」里，两条是撞名（`hkkz9522/dsh-session-manager`、
  `sunshaobei/dsh-input-history`），一条是拿不到仓库自述的分叉件（`liangmianya` 的 `dsh-synapse` 0.4.2）；
  另有 `dsh-reasoning-effort` 的 npm latest 0.2.8 属于**另一条线**（`Mu-scorpio`），我们本机 0.8.1 反而更高。
  判据面把这件事收敛成 `identityVerdict` 四值 + `actionable` 双条件，不再靠人记名单。
- **`repository` 字段的形态会吃掉 slug 解析**：本轮写 `unit-plugin-channels` 时抓到判据自身一个缺陷——
  无 scheme 的 `github.com/o/r` 形态会把 owner 读成 `github.com`（两条不同项目因此可能被判成同一条 slug）。
  今天 28 条里出现的形态全是 `git+https://…`（含对象形 `{url, directory}`），所以台账未受影响，
  但这条已经作为「四种形态必须归一到同一 slug」的用例钉进单测，下次遇到裸主机名形态不会静默误判。
- **`@deepseek-ai/*` 与官方内核包同名作用域**，但 11 个作用域伴随件在 npm 上全部 404（未发布）——
  所以「npm 未发布 19 条」里含全部作用域条目；不要因为它们 404 就推断官方 registry 被墙，
  同一批请求里 9 条裸名件是通的。

## 五、舰队更新与兼容 sweep（2026-10-08，目标宿主 `0.2.0-rc.2`）

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

### 5.1 判据面：六条静态扫与两条新机器锁（17 个用例）

| 扫 | 判据源（全部实文件，不硬编码名单） | 机器锁 | 修前实测 | 修后实测 |
| --- | --- | --- | --- | --- |
| peer 下限（DSH-0.2.0-RC1-01） | `require('@deepseek-ai/dsh-app-boot').evaluatePluginCompatibility(manifest, exemptions, runtimeVersion)` —— 只读 `peerDependencies`，只判 `@deepseek-ai/dsh` 与 `@deepseek-ai/dsh-*` 两族键，`semver.satisfies(runtime, range, {includePrerelease:true})`；`runtimeVersion` 取装机树 `getDshRuntimeVersion()`，并与 `kernel-pin.packageVersion` 交叉断言 | `scripts/test/unit-plugin-peer-floor.test.js`（4 用例） | **2 条 DENIED**：`billion-context-dsh`（5 键 `>=0.1.5-alpha.1 <0.1.6-0`）、`dsh-better-sidebar`（14 键 `^0.1.0-rc.8`） | **0 DENIED / 28**（28 条里 11 条声明 dsh 族 peer，共 46 个键。better-sidebar 那条已**不是我们放宽的结果**：0.24.1 上游自带 14 键 `^0.2.0-rc.1`，我们的改写作废；剩下的实质改动只有 `billion-context-dsh` 一处） |
| 浏览器模块表 × 命名空间成员链接（判据 A/B） | `node_modules/@deepseek-ai/dsh-client-web/lib/index.js` 的 `PLATFORM_MODULES`（rc.2 实值 9 项：react、react/jsx-runtime、react-dom、react-dom/client、`@deepseek-ai/cordis`、`dsh-client-store`、`dsh-client-ui-slots`、`dsh-client-ui-primitives`、`dsh-client-ui-dockkit`；`PRELOADED_CLIENT_EXTERNALS = []`）↔ 插件产物里 `var _pkg = require("<spec>")` 的 `<spec>` 与 `_pkg.<member>` 取用 ↔ pin 内核各包导出面 | `scripts/test/unit-plugin-module-table.test.js` 用例 1-5、8、13 | **1 条硬断链**：`dsh-better-sidebar`（0.15.3 旧皮）23 个旧图标成员（`Icon*14/16`）× 4 个产物 = 112 处未守卫取用 | **0**（**2026-10-08 复算 72 处 require 别名改写、434 处成员取用全判**；5 种正当守卫形态逐一验证）。先前的 75/322 是 0.15.3 旧皮口径：换 0.24.1 后 better-sidebar 自身变成 **19 别名 / 413 成员**，
产物里 8 个 `Icon*16` 形态名字（自有 `src/client/icons.tsx` 共导出 10 个）全部是**插件自有符号**，
**0 处从 primitives 具名取用**（实测 `grep -o '_primitives…Icon*14/16'` 零命中）；112 处两级回落改写连同 `primitives-icons.ts` 垫片**整层作废** |
| 浏览器模块图（判据 C，A 的另半边） | 各插件 `exports['./client']` 入口 → 沿**相对 require** 走可达闭包 → 闭包内每个裸名 `require("<spec>")` 必须 ∈ `PLATFORM_MODULES` ∪ 该插件 `dsh.client.external`（`stripClientSuffix` 归一） | 同文件用例 9-10 | 判据本轮新建；建前盲区 = 裸第三方名（A 只判 `@deepseek-ai/*`）+ 入口落在 `dist/` 的产物被整目录跳过 | **25 条有 client 入口 / 25 个图文件 / 46 处裸名取用 → 0 表外、0 入口缺失、0 相对依赖断链**。裸名全集恰为 `react×19, react/jsx-runtime×13, primitives×7, react-dom/client×2, renderer×4, react-dom×1` |
| manifest 入口可见性（全新环境判据） | 各插件 `main`/`exports` 指向的每个 JS 文件 ↔ 磁盘实存 ↔ `git check-ignore`（**引擎就是 git 自己**，不重写 ignore 语义；默认相对索引判定，正合「fresh clone 拿不拿得到」） | 同文件用例 11-12 | **1 条被遮蔽**：`dsh-prompt-optimizer` 的 `./client` → `dist/client.js` 落在通用 `dist/` 规则里，本机有、库里没有 | **56 条入口：0 磁盘缺失、0 被忽略遮蔽**（补 `!assets/plugins/dsh-prompt-optimizer/dist/**` 例外后） |
| `dsh.client` 声明可解析性 | 各插件 `package.json` 的 `dsh.client.inject` / `external` ↔ `node_modules/@deepseek-ai/*` 实存（`stripClientSuffix` 按内核 `dsh-client-modules` 同形归一 `<id>/client`→`<id>`） | 同文件用例 6 | — | **57 条声明（inject 49 + external 8）0 落空**（2026-10-08 复算；上一轮记的 56 = inject 46 + external 10，差 1 条来自 better-sidebar 换代：它的 `inject` 涨到 5 条、两条 primitives 图标 `external` 扩表随垫片一起撤掉。落空的后果是整个 client bundle 在浏览器里静默不加载，与 peer 拒挂同族） |
| 已移除服务引用 | `kernel-pin.json` 的 `services.removed` 12 条 id ↔ 插件正文的 `ctx.get("<id>")` | 同文件用例 7 | — | **0 真实引用**（判据只用 `ctx.get` 形态：裸 id 做子串匹配会在 base64 载荷里疯狂误报，rc.2 实测 `e2b` 命中 easyrewrite 的字体数据 —— 那种判据常红等于没有判据） |

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

### 5.2 逐插件判定表（28 行，顺序 = `COMPANION_PLUGINS`，与 §一 同号）

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
|  1 | `balance` | `dsh-balance` | 0.1.3 | 0 peer | 0.1.2（我们更高） | 未发布 | 2 别名 / 0 成员 / 2 裸名 → 缺失 0 · 表外 0 · 声明 1 · 移除引用 0 | 维持；无需兼容动作（0.1.3 = flash 价目对齐官网 + 补 `deepseek-flash` 真实 id，纯数据层修复）  |
|  2 | `file-changes` | `dsh-file-changes` | 0.1.0 | 0 peer | 0.1.0（等版） | 未发布 | 0 别名 / 0 成员 / 0 裸名 → 缺失 0 · 表外 0 · 声明 0 · 移除引用 0 | 维持；无需兼容动作  |
|  3 | `better-sidebar` | `dsh-better-sidebar` | 0.24.1 | 14 peer `^0.2.0-rc.1` | 0.15.4（我们更高） | 0.24.1（等版｜身份 same／huanlin） | 19 别名 / 413 成员 / 5 裸名 → 缺失 0 · 表外 0 · 声明 5 · 移除引用 0 | **三项自研能力实测已全部在位，本仓无待回吸差量——本轮改的是台账不是 `src/`**（复算基准是 0.15.3 备份 `dsh-desktop/.tmp-bs-0.15.3-backup/`（`src/` 与 `lib/` 两侧都在）：npm 侧 **没有发布过 0.15.3**（0.15.0/0.15.1/0.15.2 之后直接跳 0.16.0，2026-10-08 取 packument 29 个版本实测），d-pack 侧是 0.15.4，**所以这份 gitignore 的备份是旧面唯一存世副本，别当临时垃圾清掉**（实证：备份 `lib/client-editor.js` 里 `DiffTurnsPanel` 3 / `diffRows` 2 / `formatHistTime` 2 处命中，正是上一轮手改进产物的那张「按变更查看 diff」面板，0.24.1 的 `src/`+`lib/` 全树 **0 命中**——上游用 `src/client/diff/` 整面重做了它）；比法是用 `diff -u --strip-trailing-cr` 对 `src/`，再在交付字节里逐名核命中）：① `chunk-availability.ts` 的 lazy chunk 自动重试——新 src 完整保留 `nextDelayMs`、`isModuleSystemAvailable`、`moduleSystemUnavailableMessage`、`createChunkRetryLoop`，接线在 `chunk-loader.ts:56/305/321/346`（`visibilitychange` 调 `loop.poke()` 立即重探），**唯一被上游丢掉的是 `isChunkRegistered()`，全仓 0 调用者的死代码**；② `editor-features.ts` 与备份逐字节相同（696 行）；③ #171 三半全在：`EditorHost.tsx:122-136` 的 `failCountRef` 走 `nextDelayMs` 退避 + `reloadSeq`（error 态 tab 重新可见即重拉），`builtins/viewers.tsx:53-75` 的 `TextFallback` 用 `<pre>` 只读兜底。产物侧命中数（`lib/client.js` 与 `lib/client-registry.js` 同一份 src 编两遍，两列相同）：`reloadSeq` 2、`failCountRef` 6、`TextFallback` 2、`ensureChunkAutoRetry` 3；`editorFeatures` 2 在 lazy chunk `lib/client-editor.js`。**先前两处兼容改动作废**：14 条 peer 放宽（上游已直接声明 rc.1 线，含已消失的 `dsh-client-runtime` 键也随上游表撤掉）、23 个旧图标成员×112 处两级回落（`primitives-icons.ts` 垫片整目录不存在，上游换图标体系后无此项）。**换代是重建出来的**：仓库外临时目录 `npm ci --legacy-peer-deps` + `tsc -p tsconfig.build.json` + `tsdown` 跑通（`Build complete in 2036ms`），两个频道产物由同一份 `src/client/index.tsx` 编两遍；锁随迁共 **34 例**（`unit-better-sidebar-diff-surface` 21 + `unit-plugin-kernel-anchor` 8 + `unit-plugin-tab-host` 5）；加上本就存在、随换代复跑的两把能力锁（`unit-better-sidebar-chunk-retry` 22 锁 ①与③、`unit-better-sidebar-editor-features` 20 锁 ②），better-sidebar 五组锁 2026-10-08 实测 **76 例 / 0 fail**，详见 §5.4 首条。**2026-10-09 文件体验统一模型**（用户点名 `dsh-PACK` 迁移 VSCode 式文件系统）：`src/` 真改一轮——`EditorHost.tsx` 重写为「常驻左文件栏 + 每文件一个去重标签」（停靠树、原地切换、`editorExplorer` 三选一全退役，选键与 7 条文案 ×20 份字典同步摘除）、新增 `ExplorerRail.tsx`（栏画在**编辑器标签体内**，内核右栏无 pane 级插槽）、`state.ts` 增 `explorerOpen/explorerWidth`（140–480 夹取）与 `toggleExplorer/setExplorerWidth`；产物全量重建回填（同一 7 文件 JS 面，`invariant.js` 未变；`lib/types` 177→180，新增 `ExplorerRail.d.ts` 并补齐 `editor-features.d.ts`/`chunk-availability.d.ts` 两张此前未随包的类型面）。同轮修掉 tsc 门禁的 5 处存量错：`editor-features.ts` 在 `noUncheckedIndexedAccess` 下 `text[pos]` 判空 ×4（L66/68/79/81）与私有 `state` 跨类型转换 ×1（L647，改 `as unknown as`）——该文件是自研件（`f3634367c` 括号配对/折叠/查找三特性），修复行为等价。靶向复跑 125 例 / 0 fail（含五组锁 76 例 + `unit-sidebar-md-code-guard` 7 例 + 插件面余下 4 套）；全量 `npm test` 2006 例 / 1998 pass / 0 fail / 8 skip（2026-10-09）  |
|  4 | `dsh-session-manager` | `dsh-session-manager` | 0.1.0 | 0 peer | 无此件 | 0.6.2（他们更高｜身份 unverifiable／lesterq） | 1 别名 / 0 成员 / 2 裸名 → 缺失 0 · 表外 0 · 声明 2 · 移除引用 0 | 维持；**禁止按名更新**——npm 那条是 `hkkz9522/dsh-session-manager`（维护者 `lesterq`）的同名第三方实现，我们这份是自研件且 `package.json` 无 `repository` 自述，机器判 `unverifiable`（§4.2）  |
|  5 | `conversation-tweaks` | `dsh-conversation-tweaks` | 0.1.1 | 0 peer | 0.1.1（等版） | 未发布 | 2 别名 / 2 成员 / 3 裸名 → 缺失 0 · 表外 0 · 声明 2 · 移除引用 0 | 维持；`dsh.client.external` 扩 `dsh-client-ui-renderer` 已由内核解析，成员取用带 typeof 守卫  |
|  6 | `quest-ui` | `dsh-quest-ui` | 0.6.1 | 0 peer | 0.6.1（等版） | 未发布 | 2 别名 / 2 成员 / 3 裸名 → 缺失 0 · 表外 0 · 声明 2 · 移除引用 0 | 维持；同上（renderer 扩表 + `bindSnapshotSelector` 三级回落链）  |
|  7 | `dsh-super-injector` | `dsh-super-injector` | 0.3.1 | 1 peer `>=0.0.1-rc <2` | 0.3.1（等版，not-shipped） | 未发布 | 8 别名 / 0 成员 / 0 裸名 → 缺失 0 · 表外 0 · 声明 1 · 移除引用 0 | 维持；无更新通道  |
|  8 | `prompt-custom` | `dsh-prompt-custom` | 0.3.5 | 2 peer `>=0.1.0-rc.6 <2` | 0.3.5（等版） | 未发布 | 1 别名 / 0 成员 / 2 裸名 → 缺失 0 · 表外 0 · 声明 0 · 移除引用 0 | 维持；跨 minor 覆盖的随迁已在 §四 末条记账  |
|  9 | `workspace-anchor` | `dsh-workspace-anchor` | 0.1.0 | 0 peer | 0.1.0（等版） | 未发布 | 0 别名 / 0 成员 / 0 裸名 → 缺失 0 · 表外 0 · 声明 0 · 移除引用 0 | 维持  |
|  10 | `wsl-settings` | `dsh-wsl-settings` | 0.1.0 | 2 peer `*` | 无此件 | 未发布 | 1 别名 / 0 成员 / 3 裸名 → 缺失 0 · 表外 0 · 声明 1 · 移除引用 0 | 维持  |
|  11 | `side-session` | `dsh-side-session` | 0.3.1 | 0 peer | 0.3.1（等版，not-shipped） | 未发布 | 3 别名 / 0 成员 / 3 裸名 → 缺失 0 · 表外 0 · 声明 2 · 移除引用 0 | 维持  |
|  12 | `compaction-acp` | `billion-context-dsh` | 0.2.26 | 5 peer `>=0.1.5-alpha.1 <0.3.0-0` | 0.2.2（我们更高） | 0.2.26（等版｜身份 unknown／tyanyin） | 0 别名 / 0 成员 / 0 裸名 → 缺失 0 · 表外 0 · 声明 0 · 移除引用 0 | **本轮一处兼容改动**：5 条 dsh 族 peer 上界 `<0.1.6-0` → `<0.3.0-0`（`dsh-compaction`/`dsh-session`/`dsh-llm`/`dsh-tools`/`dsh-settings`；`@deepseek-ai/cordis`、`schemastery` 两键不参与判定，未动）  |
|  13 | `dsh-pocket` | `dsh-pocket` | 2.10.7 | 0 peer | 2.10.7（等版） | 2.10.6（我们更高｜身份 same／leachzhou） | 12 别名 / 5 成员 / 2 裸名 → 缺失 0 · 表外 0 · 声明 7 · 移除引用 0 | 维持；GPL-2.0 分发面见 §3.1 #13  |
|  14 | `openclaw-bridge` | `dsh-openclaw-bridge` | 0.8.1 | 6 peer `>=0.1.0-rc.6 <2` | 0.8.1（等版） | 未发布 | 3 别名 / 2 成员 / 4 裸名 → 缺失 0 · 表外 0 · 声明 4 · 移除引用 0 | 维持；设置面已是 codegen `settings-host` 垫片形态  |
|  15 | `input-history` | `dsh-input-history` | 0.1.1 | 1 peer `>=0.1.0-rc.6 <2` | 0.1.1（等版） | 0.3.2（他们更高｜身份 unverifiable／sunshaobei） | 0 别名 / 0 成员 / 1 裸名 → 缺失 0 · 表外 0 · 声明 1 · 移除引用 0 | 维持；**禁止按名更新**（同 #4 型撞名：npm 那条是 `sunshaobei/dsh-input-history`）  |
|  16 | `dsh-easyrewrite` | `dsh-easyrewrite` | 2.6.0 | 0 peer | 2.5.3（我们更高） | 2.6.0（等版｜身份 same／renzic-stone） | 2 别名 / 8 成员 / 2 裸名 → 缺失 0 · 表外 0 · 声明 3 · 移除引用 0 | 维持；它的 `pickIcon(旧名, 新名)` 就是本轮图标守卫认下来的正当回落形态来源  |
|  17 | `change-review` | `dsh-change-review` | 0.1.1 | 0 peer | 0.1.1（等版） | 未发布 | 1 别名 / 0 成员 / 1 裸名 → 缺失 0 · 表外 0 · 声明 2 · 移除引用 0 | 维持  |
|  18 | `auto-compact` | `dsh-auto-compact` | 0.1.1 | 0 peer | 0.1.1（等版） | 未发布 | 1 别名 / 0 成员 / 1 裸名 → 缺失 0 · 表外 0 · 声明 2 · 移除引用 0 | 维持  |
|  19 | `offpeak` | `dsh-offpeak` | 1.0.1 | 0 peer | 1.0.1（等版） | 未发布 | 0 别名 / 0 成员 / 0 裸名 → 缺失 0 · 表外 0 · 声明 0 · 移除引用 0 | 维持  |
|  20 | `settings-nav-custom` | `dsh-settings-nav-custom` | 0.1.1 | 0 peer | 0.1.1（等版） | 未发布 | 0 别名 / 0 成员 / 0 裸名 → 缺失 0 · 表外 0 · 声明 1 · 移除引用 0 | 维持（EAC 移植件走 EAC 账本通道，非 npm）  |
|  21 | `settings-groups` | `dsh-settings-groups` | 0.1.1 | 0 peer | 0.1.1（等版） | 未发布 | 0 别名 / 0 成员 / 0 裸名 → 缺失 0 · 表外 0 · 声明 1 · 移除引用 0 | 维持  |
|  22 | `synapse` | `dsh-synapse` | 0.3.0 | 0 peer | 0.3.1（他们更高） | 0.4.2（他们更高｜身份 unknown／liangmianya） | 0 别名 / 0 成员 / 0 裸名 → 缺失 0 · 表外 0 · 声明 0 · 移除引用 0 | **整包维持 0.3.0，但本行下方那串七数全 0 不代表它兼容**——§5.5 的逐文件实测抓到本轮唯一一条真断链：本机 0.3.0 的回填路径读 `session.events`，而这个属性在 pin 的 rc.2 上已下线（`Session.prototype` 反射实测无 `events`），静默产出 0 条消息。d-pack 0.3.1 = 本仓 0.3.0 换皮 + 一段 `sessionEvents()` 兼容口（`app.js`/`styles.css`/`test/` 逐字节相同），先前那句「两条通道都会覆盖本仓 `perf`/`fix`」只对 npm/upstream 0.4.2 成立、对 d-pack 侧是错账，已更正（§一 #22、§3.1 #22、§4.1）。npm 侧身份判 `unknown`（远端 packument 没有 `repository` 自述，无法证明同源）。本轮按裁定「只做差量报告，不动产物」，处置项与复算命令见 §5.5  |
|  23 | `dsh-subagent-lens` | `dsh-subagent-lens` | 0.1.1 | 3 peer `>=0.1.0-rc.6 <2` | 0.1.1（等版） | 未发布 | 2 别名 / 2 成员 / 4 裸名 → 缺失 0 · 表外 0 · 声明 4 · 移除引用 0 | 维持；带 `bindSnapshotSelector` 三级回落链  |
|  24 | `reasoning-effort` | `dsh-reasoning-effort` | 0.8.1 | 10 peer `^0.2.0-rc.1` | 0.7.1（我们更高） | 0.2.8（我们更高｜身份 foreign／andrew3767） | 2 别名 / 0 成员 / 2 裸名 → 缺失 0 · 表外 0 · 声明 7 · 移除引用 0 | 维持；已在最高通道。**入口形态换代**：0.8.1 的 `./client` 是目录形 `lib/client/index.js`（旧库内是 `lib/client.js`），覆盖式同步后新入口未入库、旧入口处于删除态 —— 提交时必须成对收（`git add` 新目录 + 记删除），否则全新 clone 的浏览器入口为空  |
|  25 | `basics-panel` | `dsh-basics-panel` | 0.4.1 | 1 peer `^0.1.2-rc.1 或 >=0.2.0-rc.1 <0.3.0` | 0.1.1（我们更高） | 未发布 | 4 别名 / 0 成员 / 2 裸名 → 缺失 0 · 表外 0 · 声明 2 · 移除引用 0 | 维持；按裁定本地跑它的构建  |
|  26 | `input-fold` | `dsh-input-fold` | 0.1.1 | 1 peer `>=0.1.0-rc.6 <2` | 0.1.1（等版） | 未发布 | 0 别名 / 0 成员 / 0 裸名 → 缺失 0 · 表外 0 · 声明 1 · 移除引用 0 | 维持  |
|  27 | `prompt-optimizer` | `dsh-prompt-optimizer` | 2.0.4 | 0 peer | 2.0.4（等版） | 2.0.3（我们更高｜身份 same／winditer） | 5 别名 / 0 成员 / 2 裸名 → 缺失 0 · 表外 0 · 声明 3 · 移除引用 0 | 维持。**入口曾被 gitignore 遮蔽**：`./client` → `dist/client.js`（223 KB 上游产物，无 src 不可本地重建）落在通用 `dist/` 规则里 → 本轮补 `!assets/plugins/dsh-prompt-optimizer/dist{,/**}` 例外，产物本身待入库  |
|  28 | `zcode-migrate` | `dsh-zcode-migrate` | 0.1.2 | 0 peer | 0.1.2（等版） | 未发布 | 1 别名 / 0 成员 / 2 裸名 → 缺失 0 · 表外 0 · 声明 3 · 移除引用 0 | 维持  |

计数对账（与 4.1/4.2 的扫描器输出逐字一致）：
**d-pack 通道** 等版 20（其中 18 条 shipped + #7/#11 两条收录于 `not-shipped/`）/ 我们更高 5（#3、#12、#16、#24、#25）/
他们更高 1（#22，唯一 `actionable` 候选，人工判不取）/ 无此件 2（#4、#10）；
**npm 通道** 等版 3（#3、#12、#16）/ 我们更高 3（#13、#24、#27）/ 他们更高 3（#4、#15、#22 —— 三条身份分别是
`unverifiable`、`unverifiable`、`unknown`，**没有一条是 `same`**，故都不构成目标）/ 未发布 19；
**身份分布** `same 4 / foreign 1（#24）/ unverifiable 2 / unknown 2 / absent 19`；
**两条通道的可取候选合计 1 条**（#22），已被人工裁定覆盖。
**兼容通道** 28/28 peer 可挂（0 DENIED）、A/B 72 处别名 + 434 处成员取用 0 缺失 0 表外、
C 25 个图文件 46 处裸名 0 表外 0 相对依赖断链、57 条 `dsh.client` 声明 0 落空、
12 条已移除服务 0 引用、56 条 manifest 入口 0 缺失 / 0 被 gitignore 遮蔽；
本轮实质改动 2 处（#3 整包换代、#12 peer 上界放宽）都带反证，**未动任何插件的运行时行为语义**。

**第三条通道（外部上游 main）的取证值不重放**，它来自 §三 的逐条仓库核验（`api.github.com` 在本机被封，
走 git-over-https 拿 `package.json`），本轮仍改变或支撑判定的 8 条：
#12 `Tyan66666/billion-context-dsh` main **0.2.26**（与 npm 等版，已在最高通道）、
#13 `shaobeichen/dsh-pocket` main 2.10.6（**我们 2.10.7 更高**，2.10.7 取自 d-pack）、
#16 `Renzic-Stone/DSH-EasyRewrite` main **2.6.0**（等版）、
#19 `christophersmith2737-commits/OffPeak` main 1.0.0（我们 1.0.1 更高）、
#22 `liangmianya/dsh-synapse` main 0.4.2（与 npm 同版，两条通道都不取）、
#24 `HanaAyane/dsh-reasoning-effort` main **0.8.1 与本机逐字相等**、
#25 `yxsj245/dsh-Basics-Panel` main 0.4.1（同版，按裁定本地跑它的构建）、
#27 `winditer/dsh-prompt-optimizer` main 2.0.3（我们 2.0.4 更高）。
其余 20 条的上游 main 不改变判定：13 条自研件（#1、#2、#5、#6、#8、#9、#10、#17、#18、#21、#23、#26、#28）
与 1 条 EAC 移植件（#20）**没有公开上游仓**，d-pack 发布面就是它们唯一的外部镜像；
#4、#15 是自研件撞上别人的 npm 包（判定在 4.2）；#3 已由 npm `same` 通道取到上游最新版；
#7 无唯一原仓库（3.5 风险 2）、#11 上游有仓但没有许可原文（3.5 风险 1）；
#14 的上游 `hzhz314159/openclaw-dsh-bridge` main 是 0.8.0，我们 0.8.1 取自 d-pack，已在更高侧。

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
  而两条插件的运行入口恰好在里面（`dsh-prompt-optimizer/dist/client.js` 223 KB、
  `billion-context-dsh/dist/index.js` 274 KB）。改成「manifest 入口及其相对闭包一定穿过目录白名单」后
  别名计数 70 → 75，新增的 5 处**全部**来自 prompt-optimizer 的 dist 产物（billion 那份是纯 Node 侧，
  0 宿主别名）；成员取用仍 322 —— 即**扩面没带来新断链，但盲区确实存在过**，同类产物下次能被抓到。
  同一次修复里还抓到自己写的 bug：白名单按字符串前缀比对，传**相对**插件根时整条静默失效
  （计数退回 70），现已改为绝对路径比对，并在用例 2 里加了「相对根与绝对根扫描结果必须逐字段相等」的不变量。
- **两条插件的运行入口目前只在本机存在、不在库里**（本轮按裁定不提交，这是留给下次提交的硬缺口，
  不是可以忽略的差量）：`dsh-prompt-optimizer/dist/client.js`（§5.2 #27，已补 `.gitignore` 例外，
  现在 `git status` 可见）、`dsh-reasoning-effort/lib/client/`（§5.2 #24，未被忽略、纯未 add，
  同时库里旧的 `lib/client.js` 处于删除态）。全新 clone 在这两条上会装出空入口 ——
  入口可见性用例（用例 11）咬的是「被 ignore」这一半，「未 add」那一半只有提交能闭合。
- 判据 C 的浏览器图闭包实测每条插件只有 1 个文件（上游 bundle 全内联，没有 chunk），
  所以**相对 chunk 分支目前只被合成夹具咬到**（用例 10 的 `./chunk-1.js`）；
  真出现拆 chunk 的产物时判据已在位，不需要再补一层。
- **第七个盲区：宿主运行时对象的「属性下线」不在任何一条静态扫里**（2026-10-08 由 §5.5 实测抓到，
  案例是 `dsh-synapse` 0.3.0 的 `session.events`）。六条判据咬的是宿主**模块表**成员取用（A/B/C）、
  `dsh.client` 声明落空、`ctx.get` 的**移除服务 id**（`kernel-pin.services.removed` 12 条全是服务）、
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
> 而 §一 #22 / §3.1 #22 / §4.1 里那条错账正是这么写进去的（本轮已逐处更正）。
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

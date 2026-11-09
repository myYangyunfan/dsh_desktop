'use strict';

// ---------------------------------------------------------------------------
// 配套 dsh 插件的唯一数据源。
//
// main.js 的 syncCompanionPlugins 与 scripts/sync-companion-plugins.js 曾
// 各自维护一份 COMPANION_PLUGINS 清单，历史上已发生过一次漂移（同步脚本
// 缺 better-sidebar / harness-pet）。新增或改名配套插件只改这里，两个同步
// 入口（桌面壳运行时 / WSL·Linux CLI）自动保持一致。
//
// 条目字段约定：
//   id    cordis.patch.yml 注册条目与插件管理页使用的 loader id；
//   name  profile node_modules 下的包名（含 scope）。
//   shipsNodeModules  源目录的 node_modules 是 git 跟踪的正件依赖树，随同步分发；
//                     缺省 false：源里的 node_modules 视为本机安装残留，绝不同步
//                     （dev 树上一次 pnpm install 就能产出 1.3 万文件的残留树）。
//
// v1.0.0 内置线（2026-10-08 裁定，反转此前的「官方形状 / 插件不进包」口径）：这份清单
// 里的 33 条插件**随安装包分发**——`dsh-desktop/assets/plugins` 整树由 stage-payload.sh
// 与 tauri-release.yml 的五个架构 staging 镜像进 payload，装机后首次开机由 boot 的 sync 步
// 镜像进 profile，开箱可用。
//
// 无论分发与否，清单本身都必须保持完整、不得清空 —— 交付门禁万一破了（剔除行被加回来 /
// 手工裁包 / payload 指向不存在的 assets），boot 的 sync 步正是按这份名单把「历史上装过的
// 配套件」计入 missingNames，进而撤回它们的 cordis.patch 条目与 bundle 注册。清空名单等于
// 放弃撤回：老用户升级后 profile 里会留着指向缺失目录的注册行，装配失败表现为
// "entries did not activate"，而一次致命启动会把 profile 的补丁层整体改名抹掉。
//
// 交付面的两道防线判据不在这里，在 `scripts/lib/payload-plugin-deps.js`（残留依赖树 ⇔
// shipsNodeModules、安装态超长路径）与 `dsh-tauri/scripts/ta12-stage-payload-sentinel`。
//
// 但「退役」与「源缺失」是两条不同的回收路径：仍在清单里的条目走 missingNames
// 通用撤账；**摘出清单的条目立刻失去这条路径**，必须由同文件 RETIRED_COMPANIONS
// 的专属回收机器接管（patch 行撤回 + profile manifest 撤账 + 目录认领）。
// 所以摘清单从来不是单点动作 —— 见下方 RETIRED_COMPANIONS。
// ---------------------------------------------------------------------------

const COMPANION_PLUGINS = [
  { id: 'balance', name: '@deepseek-ai/dsh-balance' },
  { id: 'file-changes', name: '@deepseek-ai/dsh-file-changes' },
  // v1.0.0 批量退役 11 条（client-file-changes / terminal / harness-pet / dsh-vision /
  // graph-memory / community-market / market-desktop-bridge / dsh-hub / file-drop /
  // image-paste / cardian）：条目已摘出本清单、源目录 assets/plugins/<dir> 已删除，
  // 存量登记与镜像副本的回收见同文件 RETIRED_COMPANIONS（三件事一起做）。
  { id: 'better-sidebar', name: 'dsh-better-sidebar' },
// @vlln/dsh-navbar（对话节点导航条）已按用户要求移除（0.6.3-beta.3）；
	// 恢复方式：git 历史取回本清单条目 + assets/plugins/dsh-navbar。
  // 对话删除与归档管理（本仓库内置）：会话行菜单删除按钮 + 设置内归档管理
  // 面板（恢复/删除）。依赖 patch-session-manage.js 的官方包运行时补丁。
  { id: 'dsh-session-manager', name: 'dsh-session-manager' },
  { id: 'conversation-tweaks', name: '@deepseek-ai/dsh-conversation-tweaks' },
  // 2026-11-08 按用户要求退役 quest-ui（Quest 沉浸式界面）：条目摘出本清单，源目录
  // assets/plugins/dsh-quest-ui 已删除，存量机器的 patch 行与 profile 镜像由
  // RETIRED_COMPANIONS 的专属回收机器接管（见该表）。
  // id 必须与该插件 bundle 层 cordis.patch.yml 声明的 loader id 一致
  // （dsh-super-injector）。曾声明为 super-injector 导致 bundle 迁移自愈的
  // dropBlocksByIds 永不命中残留 insert 块 → 双登记启动崩溃（issue #104）。
  { id: 'dsh-super-injector', name: '@dsh-external/dsh-super-injector' },
  { id: 'prompt-custom', name: '@deepseek-ai/dsh-prompt-custom' },
  { id: 'workspace-anchor', name: '@deepseek-ai/dsh-workspace-anchor' },
  { id: 'wsl-settings', name: '@deepseek-ai/dsh-wsl-settings' },
  // Bot 团队（Fei2411/DeepSeek-Bot，Apache-2.0）：把 DSH 变成主 Bot + 长期 Bot +
  // 群聊的协作客户端；loader id 是 bundle 层 cordis.patch.yml 的 `bot`。
  // 上游 patch 还会注册 web-search-auto 并把 web.searchProvider 改成 auto；作为
  // 随包内置件与 dsh-free-search 的运行时接管冲突，故 vendored patch 只保留 bot
  // 本体（见 assets/plugins/ds-bot/cordis.patch.yml 顶部注释）。
  { id: 'bot', name: 'ds-bot' },
  // 上下文压缩（ranxianglei/billion-context，MIT，5422★）：2026-11-09 按用户要求从已停止
  // 维护的 billion-context-dsh 0.2.27 整体换成上游统一版 0.1.213。两处与上游发行包的差异写在
  // inventory §5.2 #11：① 只留 DSH 半边（dist/agent/dsh-native.js + dsh-compaction-gate.js +
  // dsh-native-client.js + dist/index.js），其它 harness 适配器与 paper/website 不入包，
  // 因此 package.json 的 mysql2 / zod 依赖（只有 bili CLI 用）一并摘掉，交付 3.3MB 而非 48MB；
  // ② 上游把 bundle 层命名为 dsh.bundle.patch.yml，这里改名 cordis.patch.yml 以符合本仓
  // 「每条在册件自带 cordis.patch.yml」的挂载判据（unit-hub-registry 的 auditMountPatch）。
  // 主机半边自带 preset 级 compaction gate（bili-compaction-gate），这是 0.2.x 预设各自
  // isolate compaction 之后唯一能真正接管自动压缩的姿势——旧 0.2.27 只能在宿主面插入
  // compaction-acp，预设里的 compaction-basic 根本看不见它。
  { id: 'bili-native', name: 'billion-context' },
  // 手机同屏（shaobeichen/dsh-pocket，GPL-2.0）：手机扫码实时同屏操控桌面 web
  // （WebSocket 全透传 + cloudflared 公网隧道内置 + 二维码配对）。
  // 0.6.4 摘除 dsh-mini 改用本插件：dsh-mini 自建移动 UI 的 CSS Module 哈希锚
  // 随内核换代反复静默失配（0.1.5-rc.1 实测 detailsCol→rightbarCol 等三处），
  // 且自建 UI 功能面窄；dsh-pocket 同屏路线功能即桌面全集，无换代失配问题。
  { id: 'dsh-pocket', name: 'dsh-pocket', shipsNodeModules: true },
  // IM 桥（hzhz314159/openclaw-dsh-bridge，MIT）：微信/飞书官方频道桥接入 DSH
  // agent 会话（消息分片回写、通道适配器、去重限流）；QQ 由官方插件
  // @tencent-connect/dsh-qqbot 提供，不在本插件范围。
  { id: 'openclaw-bridge', name: '@deepseek-ai/dsh-openclaw-bridge' },
  // —— 效率插件包（借鉴 EAC 移植，纯客户端） ——
  // 终端式上下键命令历史回溯：↑ 回溯上一条已发送用户消息、↓ 往前翻回较新，
  // 空草稿才触发、越界回到空、编辑即复位、按会话隔离。
  { id: 'input-history', name: 'dsh-input-history' },
  // 消息撤回/重编辑（Renzic-Stone/DSH-EasyRewrite，MIT）：消息 hover 撤回与
  // 再编辑，原版体验。0.6.4 起取代本仓库自带的 dsh-message-rewind（功能同域，
  // 上游维护更活跃、rc.2 适配无漂移）。
  { id: 'dsh-easyrewrite', name: 'dsh-easyrewrite' },
  // AI 变更审核：审查模型刚做的改动（正确性/安全性/一致性）。
  { id: 'change-review', name: 'dsh-change-review' },
  // 2026-11-08 按用户要求退役 auto-compact（contextPressure 到阈值自动发 /compact）。
  // 峰谷价格卫士：高峰时段发送前拦截提醒，可定时到闲时价自动执行。
  { id: 'offpeak', name: 'dsh-offpeak' },
  // 设置页左侧边栏自定义：显示/隐藏与排序设置导航项。
  { id: 'settings-nav-custom', name: 'dsh-settings-nav-custom' },
  // 设置页高级选项折叠：把低频选项行收进「高级选项」折叠组。
  { id: 'settings-groups', name: 'dsh-settings-groups' },
  // 会话地图（liangmianya/dsh-synapse，MIT）：可视化非线性对话工作区，
  // 把同一工作区内的会话/追问/分支呈现为可拖拽缩放的对话画布；bundle 插件，
  // 零依赖、复用现有 dsh web 服务。上游：https://github.com/liangmianya/dsh-synapse
  { id: 'synapse', name: 'dsh-synapse' },
  // 子代理活动快视（本仓库内置）：Task/subagent 委派调用的展开式活动视图
  // （内联命令/文件明细 + 打开子会话）+ 会话头部命令/文件聚合条；明细全部
  // 来自客户端已加载的会话事件流（零后端请求）。宿主半边仅注册 settings
  // 命名空间，UI 全在客户端半边（toolview 按 key 注册）。
  { id: 'dsh-subagent-lens', name: '@dsh-external/dsh-subagent-lens' },
  // 推理强度选择器 dsh-reasoning-effort 已于 2026-10-17 随内核 0.2.1 换代退役，条目移入
  // 下方 RETIRED_COMPANIONS（F4 后端默认字典面 patch-pi-ai-reasoning-defaults 不随退役下线）。
  // 基础能力面板（yxsj245/dsh-Basics-Panel，MIT）：设置页可视化并管理 MCP
  // 服务器 / 技能 / 规则，模块化 feature 注册表；MCP 空态带「新建」入口
  // （零 MCP 已添加时也显示「新建」按钮）。id 与 bundle 层 cordis.patch.yml
  // 声明的 loader id（basics-panel）一致。
  { id: 'basics-panel', name: 'dsh-basics-panel' },
  // 用户提示词折叠（本仓库内置）：对用户发出去的超长提示词（user 消息）默认
  // 折叠为前几行 + 「展开」遮罩，点击展开全文、再点「收起」收回；短消息零
  // 侵入、不碰代码块/图片/表格。纯客户端（DOM 定位 + CSS 折叠 + 事件委托）。
  { id: 'input-fold', name: 'dsh-input-fold' },
  // prompt 润色优化（winditer/dsh-prompt-optimizer，MIT）：输入框一键把草稿润色为
  // 更清晰、更结构化的高质量 prompt；默认用当前会话模型（零配置 SSE 流式），
  // 也支持自配 OpenAI 兼容 API。零外部运行时依赖，纯客户端。
  // id 必须与其 bundle 层 cordis.patch.yml 声明的 loader id（prompt-optimizer）
  // 一致——写成包名会步 super-injector 的后尘（自愈 dropBlocksByIds 永不命中）。
  { id: 'prompt-optimizer', name: 'dsh-prompt-optimizer' },
  // 2026-11-08 按用户要求退役 zcode-migrate（zcode 历史会话 → dsh 原生会话日志，
  // 曾贡献 zcode_inspect / zcode_migrate / zcode_verify 三工具与 /zcode 命令）：
  // 条目摘出本清单，源目录 assets/plugins/dsh-zcode-migrate 已删除，存量机器的
  // patch 行与 profile 镜像由 RETIRED_COMPANIONS 接管。
  // 内置插件管理页（本仓库自研）：在「设置 → 插件」里逐条查看与启停随包内置件。
  // 清单数据与启停写入都走**已接线好**的那条链（dsh:plugin-list / dsh:plugin-set-enabled
  // → sidecar createPluginManager → profile cordis.patch.yml 的 disabled 覆盖），插件本身
  // 不碰文件——「两个写者改同一份用户文件」是本仓库付过两次学费的形态。
  // 为什么不复用内核那份插件页：它的包级开关把名字从 dsh.profile.bundles 摘掉后，
  // listBundles 的行名单（bundles ∪ dependencies ∪ 安装锚点）三处都不含内置件，一关就
  // 从页面上消失且开不回来；条目级开关的解锁条件又只认「当前活着的条目」。
  // id 必须与其 bundle 层 cordis.patch.yml 的 loader id 一致（issue #104 同款坑）。
  { id: 'dsh-builtin-manager', name: 'dsh-builtin-manager' },
  // 目标收尾（本仓库自研）：内核右栏里的一个标签页，显示当前会话目标的状态机
  // （phase 四态 + activation + 轮次/修订），并提供官方 GoalBar 没暴露的 complete
  // 动词——远端有 Remote("complete")，界面上只有 save/cancel/pause/resume/edit/clear，
  // 目标过去只能等 agent 自己收尾。纯界面件：宿主半边是空 apply（对齐官方
  // dsh-client-ui-plan 的形），写状态走内核 CAS，插件自己不落任何文件。
  // 追加在清单末尾：前 18 条的顺序被 unit-patch-engine 的漂移防线钉住。
  { id: 'goal-completion', name: '@deepseek-ai/dsh-goal-completion' },
  // —— 2026-10-22 用户点名的五个上游插件（随安装包内置） ——
  // 免费多引擎搜索（DDDMUC/dsh-free-search，MIT，0.9.39）：注册 ctx.web 搜索
  // provider，内置 web_search 自动选用；loader id 是 `web-search-free`（不是包名）。
  { id: 'web-search-free', name: 'dsh-free-search' },
  // 插件商店（LivXue/dsh-plugin-shop，Apache-2.0，0.9.3）：浏览/安装/启停/更新
  // dsh 插件；loader id 是 `shop`，客户端 bundle id 才是包名。随包条目本身不
  // 参与「内置件更新」的 better-sidebar 排除策略（见 sidecar UPDATE_SOURCES）。
  { id: 'shop', name: 'dsh-plugin-shop' },
  // 运行时代理（baizhizzl/dsh-network-proxy，MIT，1.0.0）：设置-通用里的
  // HTTP 代理行，读系统代理并热切换 fetch dispatcher。包名保留上游的
  // `@local/dsh-network-proxy`——改名会让 GitHub 更新回来的包名/loader 行对不上。
  { id: 'network-proxy', name: '@local/dsh-network-proxy' },
  // MCP / 技能工具箱（Imzl-zl/dsh-toolbox-ui，MIT，1.10.1）：右下悬浮面板，
  // MCP 市场与技能管理；loader id 是 `mcp-manager-ui`。它静态导入 smol-toml
  // （BSD-3-Clause）——该包不在内核闭包内，改由 dsh-desktop/package.json 显式
  // 依赖 + VENDOR_DEPS 同步，避免用 shipsNodeModules 再开一条依赖分发面。
  { id: 'mcp-manager-ui', name: 'dsh-toolbox-ui' },
  // 桌面通知（bitterSmilezzz/dsh-notify，MIT，0.4.5）：渲染进程 Web Notification
  // 六类事件 + 点击回会话；v1.0.6 起取代壳层「回合完成」通知（壳只保留 watcher
  // 的 active_turns 与 ACP/崩溃通知）。
  { id: 'dsh-notify', name: '@bittersmilezzz/dsh-notify' },
  // —— 2026-11-09 用户点名的两件（随安装包内置，在册 31 → 33） ——
  // 上下文透视（bowenliang123/dsh-context，Apache-2.0，0.83.0）：右栏上下文看板 +
  // `/context` 命令，拆解当前上下文由什么构成、如何随轮次演变。loader id 是
  // bundle 层 cordis.patch.yml 的 `dsh-context`（与包名同形）。宿主半边只依赖
  // zod / @deepseek-ai/dsh-session / @deepseek-ai/schemastery——前两者由宿主闭包
  // 与 VENDOR_DEPS 提供，自身无内层依赖树（不设 shipsNodeModules）。
  { id: 'dsh-context', name: 'dsh-context' },
  // 端到端加密远程访问（liguobao/ds-harness-remote，MIT，0.6.4）：桌面 / Web / 安卓
  // 远控本机 DSH，含 dsh-TUI Host 支持。它的 dist 是 esbuild 产物，运行时真依赖
  // ws / qrcode / zod@3 / @xterm/* 等（宿主闭包与 VENDOR_DEPS 都不提供），故内层
  // node_modules 随包正件分发（shipsNodeModules）。
  // 与上游整包的唯一差别：不装 optionalDependencies 的 @roamhq/wrtc（单平台原生
  // .node）；0.6.4 起上游把 werift 收进 dist，依赖树不再需要它。
  // bundle 层 cordis.patch.yml 有两条 insert 行（`ds-harness-remote` 桌面行 +
  // `ds-harness-remote-tui` TUI 行），本清单登记的是桌面行的 id；TUI 行靠自己的
  // `!!js` 条件在无 dsh-tui 时禁用。
  { id: 'ds-harness-remote', name: 'ds-harness-remote', shipsNodeModules: true },
];

/** 包名 → assets/plugins 下的目录名（去 scope 前缀）。 */
function companionDirName(p) {
  const slash = p.name.indexOf('/');
  return slash >= 0 ? p.name.slice(slash + 1) : p.name;
}

// 已退役伴随件的登记表——**源目录 assets/plugins/<dir> 本身已删除**，这份名单留的是
// 「名字」而不是「源」：companion-profile 据此回收历史上镜像进
// profiles/<name>/node_modules 的副本，并撤回它们在 cordis.patch.yml / profile
// manifest 里的登记（老装机机器上的遮蔽与死注册行只能靠名字认领）。
// 退役即三个动作一起做：从 COMPANION_PLUGINS 摘出 + 进这份名单 + 删源目录
// （机器锁见 scripts/test/unit-hub-registry.test.js 的收口用例，含 sourceLeftBehind 反证）。
const RETIRED_COMPANIONS = [
  // v1.0.0 退役 `plugin-manager`（原读该源做健康卡断言的 rv9 一节随之下线，
  // #175 的网关键防漂移锁迁到 scripts/test/unit-composition-integrity.test.js
  // 直接锁清单本身）：该伴随件的包名与官方内核包 @deepseek-ai/dsh-plugin-manager
  // **同名**，而它的 host 半边是 Electron 时代的空壳（插件管理曾由壳主进程经 preload 桥
  // window.dshDesktop.pluginManager 提供，Tauri 线没有这座桥）。镜像进
  // profiles/web/node_modules 后按 Node 解析顺序它会遮蔽安装锚点里的官方包 →
  // 官方 pluginManager 服务不再挂载 → 内核插件页判「本部署没有可管理的 profile」。
  // 要复活：包名与 loader id 都得换 —— id 'plugin-manager' 同样撞
  // dsh-base/cordis.patch.yml 的官方行 id，补丁层「按 id 整行替换」会劫持官方那一行。
  // 补丁层不做手术：本机实测 profiles/web 的 cordis.yml / cordis.patch.yml 及其
  // .bak-* 备份都没有 plugin-manager 行，遮蔽纯由目录造成。若哪天遇到历史机器上
  // 残留 `- id: plugin-manager … disabled: true`，它会连带禁用官方实现，届时按
  // 「行内必须含 disabled: true」窄判据回收（宽判据会误删官方的 config 覆盖行）。
  // dirsOnly：批量回收机器对这条**只认领目录、绝不做 manifest/patch 手术**——
  // 包名与官方内核包同名，profile manifest 里合法的官方 dependency 行会被误撤，
  // 目录回收由 companion-profile 的三重判定过期清理完成（private + 描述含 DSH Desktop）。
  { id: 'plugin-manager', name: '@deepseek-ai/dsh-plugin-manager', dirsOnly: true },
  // v1.0.0 批量退役 11 条（用户点名 3/4/6/14/17/18/19/20/23/25/37）：
  // 官方内核包的同名/近名件（client-file-changes、terminal-tab）由内核自带，
  // 我们那份是重复装配面；其余为功能面收窄或上游许可/来源不明
  // （见 docs/builtin-plugins-inventory.md §三 3.5 的风险清单）。
  // 这 11 条的内核补丁面（dsh-vision 图片转述三补丁、graph-memory 模板、
  // cardian 工具名清洗）与壳侧专属能力（pet_* 五命令 + 宠物窗口、
  // image_paste_save、file_revert、file_drop.rs）一并退役。
  { id: 'client-file-changes', name: '@deepseek-ai/dsh-client-file-changes' },
  // legacyIds：老装机机器 patch 层用过的 loader id（issue #87 就是 dsh-terminal 与
  // dsh-terminal-tab 的 \b 边界事故）。回收必须把这些别名行一并撤掉，否则每 boot
  // 都会以「Cannot find package」重刷一遍。
  { id: 'terminal', name: '@deepseek-ai/dsh-terminal-tab', legacyIds: ['dsh-terminal'] },
  { id: 'harness-pet', name: 'harness-pet' },
  { id: 'dsh-vision', name: '@dsh-external/dsh-vision' },
  // 知识图谱记忆（adoresever/graph-memory，MIT）：跨会话图记忆 + PageRank /
  // 社区检测 + 向量去重。曾随壳分发并由 dsh-hub 中枢页显示装配状态。
  { id: 'graph-memory', name: 'graph-memory' },
  // 可视化插件市场（anywhere-labs/dsh-desktop，MIT）+ 它的桌面服务桥
  // （本仓库内置，提供 desktopProfiles/desktopPnpm/desktopPlugins/desktopActions
  // 四个 host 服务）。市场能力整体下线后桥也失去唯一消费者，同装卸载。
  { id: 'community-market', name: 'dsh-community-market' },
  { id: 'market-desktop-bridge', name: 'dsh-market-desktop-bridge' },
  // 插件中枢（ARFCON/dsh-hub-DSH，MIT）：插件更新引擎 + 全局记忆 +
  // graph-memory / dsh-market 挂载。它依赖的两个挂载对象同批退役。
  { id: 'dsh-hub', name: 'dsh-hub' },
  // 拖入文件到对话、图片粘贴发送（EAC 移植 + 本仓库内置）：两者的宿主半边
  // 是壳侧 file_revert / image_paste_save 命令，随壳侧能力一起拆。
  { id: 'file-drop', name: 'dsh-file-drop' },
  { id: 'image-paste', name: 'dsh-image-paste' },
  // 知识中心（myYangyunfan/dsh_cardian，MIT）：RepoWiki / 知识卡片 / 记忆三区知识库。
  { id: 'cardian', name: 'dsh-cardian' },
  // 2026-10-17 随内核 0.2.1 换代退役（在册 30→29）：推理强度选择器
  // （HanaAyane/dsh-reasoning-effort，MIT）。退役判据是对 0.2.0-rc.2 / 0.2.1-rc.1 两份
  // pristine 树实测的**覆盖关系**，不是版本号：
  //   · 它自称的独立面「自定义 provider 缺 reasoningEfforts 声明 → 给 copy-ready 指引」，
  //     0.2.1 的 @deepseek-ai/dsh-client-ui-settings-models 已整块接走——新增
  //     ModelReasoningEfforts 编辑器（同一份 Config 校验 validateReasoningEfforts），
  //     档位声明面在设置里直接改，不再需要手改配置文件（reasoningEffort 命中 0 → 21）。
  //   · 它的 Codex 风格「模型 + 强度」滑块与官方 composer 的选择器重复，且这条**在
  //     0.2.0-rc.2 就成立**：dsh-client-ui-model-selection 的 effort / effortLabel /
  //     effortChoices / advertised 计数两版逐字相同。
  // 不随退役下线的是 F4 后端补丁 patch-pi-ai-reasoning-defaults（默认强度字典在服务端半边，
  // 与这份 UI 件无关）。要复活：git 历史取回本清单条目 + assets/plugins/dsh-reasoning-effort。
  { id: 'reasoning-effort', name: 'dsh-reasoning-effort' },
  // 2026-10-22 按用户要求移除「临时对话」（侧边临时会话悬浮窗，
  // @dsh-external/dsh-side-session 0.3.1）。源目录从 assets/plugins 删除；
  // 存量机器的 patch 行与 profile 镜像目录由两个同步入口共用的
  // removeRetiredCompanionPatchRows / syncCompanionFiles 回收。
  // 上游本身没有 LICENSE 文件（见 docs/builtin-plugins-inventory.md §三 3.5），
  // 移除后也不再承担该再分发风险。
  { id: 'side-session', name: '@dsh-external/dsh-side-session' },
  // 2026-11-08 按用户要求退役三件（在册 34→31）：
  //   · quest-ui（@deepseek-ai/dsh-quest-ui 0.6.1）：Quest 沉浸式界面——分组会话栏 +
  //     卡片输入区 + 药丸元数据条，默认关闭。它靠给 <body> 打 data-dsh-quest-ui 属性
  //     做整站 reskin，退役后设置-通用里那一行随之消失。
  //   · auto-compact（dsh-auto-compact 0.1.2）：contextPressure 达阈值（默认 80%）自动
  //     向当前会话发 /compact。用户不再要自动压缩（2026-10-18 那轮「清掉半篇草稿」
  //     的提交闸门 composerGate 因此失去 compose 侧主体；同套件的 change-review 半边
  //     仍在位，回归锁改名为 unit-change-review-gate）。
  //   · zcode-migrate（dsh-zcode-migrate 0.1.2）：zcode CLI 历史会话 → dsh 原生会话
  //     日志迁移，贡献 zcode_inspect / zcode_migrate / zcode_verify 三工具 + /zcode 命令；
  //     退役后这三个工具与命令**从宿主工具面消失**，已迁移过的会话日志不受影响（它们
  //     早已是 dsh 原生格式）。
  // 三件都走通用撤回路径（removeRetiredCompanionPatchRows + syncCompanionFiles），
  // 无需 dirsOnly。
  { id: 'quest-ui', name: '@deepseek-ai/dsh-quest-ui' },
  { id: 'auto-compact', name: 'dsh-auto-compact' },
  { id: 'zcode-migrate', name: 'dsh-zcode-migrate' },
  // 2026-11-09 由上游统一版 billion-context（bili-native）整体取代：旧的 compaction-acp
  // 是宿主面 ACP 引擎，在 0.2.x 预设各自 isolate compaction 之后看不见预设里的
  // compaction-basic，等于「开了只多四个工具、自动压缩还是 basic」。撤账同时清掉 profile 里
  // 由旧件默认禁用逻辑写入的 compaction-acp 禁用行。
  { id: 'compaction-acp', name: 'billion-context-dsh' },
];

/** 退役登记表 → assets/plugins 目录名（去 scope 前缀），供过期清理认领。 */
const RETIRED_COMPANION_DIRS = RETIRED_COMPANIONS.map((p) => companionDirName(p));

module.exports = { COMPANION_PLUGINS, companionDirName, RETIRED_COMPANIONS, RETIRED_COMPANION_DIRS };

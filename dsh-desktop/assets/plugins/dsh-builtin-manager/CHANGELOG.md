# Changelog — dsh-builtin-manager

DSH Desktop 自研内置插件管理页（随安装包分发，登记在 `scripts/lib/companion-plugins.js`）。

## [0.2.1] - 2026-11-09

### fix：接管类内置件在行内直说「功能不见了是接管生效」

- **缘起**：用户报「有人说上下文压缩插件有问题」。实查结论是**没坏**——`billion-context`
  0.1.213 的 `bili-compaction-gate` 会把四个出厂预设里的 `compaction-basic` 与
  `command-compact` 两行改成 `disabled: true`（压缩迁到它的代理侧），于是会话里的
  `/compact` 命令消失、内核那套自动压缩也不再跑。这正说明接管成功了，但界面上一个字
  都没说，用户只能靠猜。
- **改法**：`TAKEOVER_NOTES`（id → 字典键）+ 纯函数 `takeoverNote(row, L)`，命中才在
  该行描述下画一行 muted 说明；目前只有 `bili-native` 一条，中英双字典各一句。
  文案指名用户实际看到消失的 `/compact`，并说清它把哪两行改成了停用，收尾一句
  「这是接管生效的样子，不是装坏了」。
- **不动的面**：宿主半边（仍不写文件）、启停写入链（仍只有 sidecar 一个写者）、
  自锁行语义、无桥兜底、生效时机两层措辞。
- **回归证据**：`scripts/test/unit-builtin-manager-client.test.js` 新增 2 例——
  渲染用例（`bili-native` 行含「接管期说明」「/compact」「compaction-basic」，且
  `easyrewrite` 行**不含**，阳性对照钉住「按 id 精确命中」；另核对中英字典各一份）
  与反证 8（把渲染色块摘掉后那句话必须消失，证明渲染断言真在咬）。
  接管机制本体由 `scripts/test/unit-billion-context-gate.test.js` 咬死。

## [0.2.0] - 2026-10-15

### feat：交互与视觉重做 —— 搜索 + 状态筛选 + 单列表行内反馈

- **缘起**：用户原话「优化一下我们的内置插件管理页面，使得其能够更正式和好用」。
  方案按裁定 =「搜索 + 筛选 + 单列表（推荐）」：29 条同质条目用单列表承载，
  顶部工具栏 + 状态筛选段，不再让全页提示与列表互相盖。
- **工具栏**：搜索框（`搜索名称、标识或描述`，按 id / 名称 / 说明三分支、大小写不敏感过滤）
  +「重新读取」按钮；筛选段「全部 N / 已启用 N / 已停用 N」，**计数与列表同源**（同一份
  rows 现算），筛选后另给「共 N 条内置插件 · 当前显示 M 条」——两处数字不会互相说谎。
  无命中给出路（「换个关键词，或把筛选切回『全部』」），不藏行数事实。
- **行内反馈取代页面级单条提示**（0.1.0 的「已保存」是页面级一行，多行操作时对不上是谁）：
  开关在途时本行置灰并显示「正在保存…」；成功时该行落「已保存「×」为启用/停用。」并挂
  「已改动 · 下次启动生效」徽标；失败时把桥返回的原因原文落在本行且**不翻转行状态**。
- **单列表卡片行**：名称 + 状态 Tag + 描述（两行截断，悬停看全文）+ 行尾开关；
  锁定原因（自锁 / 带配置 / 已卸载 / 清单管理）与原措辞保留，与状态 Tag 并存。
- **视觉接入内核设计系统**：Button / Switch / SegmentedControl / Input / Tag + 官方图标
  （IconSearchOutlineRegular / IconRefreshOutlineRegular），颜色与圆角走 `--dsw-*` 变量，
  与「内置插件」等既有设置页同一视觉语言，不再自绘 checkbox；中英双字典随语言切换。
- **不动的面**（与 0.1.0 逐条一致）：宿主半边（不写文件，有断言钉住）、
  `window.dshDesktop.pluginManager.list / setEnabled` → `dsh:plugin-list` /
  `dsh:plugin-set-enabled` 单一写入链、自锁行语义、无桥兜底（可读不可写）、
  生效时机两层措辞（本页与界面插件视图刷新页面即更新，插件的内核半边下次启动生效）。
- **回归证据**：`scripts/test/unit-builtin-manager-client.test.js` 10 → **12 例**——
  8 条正面（模块契约与宿主不写文件 / normalize 两形状 + 阳性对照 / 渲染与锁定原因 /
  搜索与筛选计数随动 / 开关三态与行内反馈 / 自锁与生效时机 / 无桥兜底 / 包面 id 同源）
  + 4 条反证（摘 group 过滤 / 摘 `ok===false` 分支 / 摘自锁分支 / 摘搜索过滤，行为按序变形）。
- **实机验证**：隔离内核（真 Chromium + mock 桥 29 条真实数据，注入数据 SHA-256 逐字节
  对账）+ 内核 served-bytes 核验（rev 随文件更新、无需内核重启）。搜索（「提示词」→ 2 条）、
  筛选（已停用 → 仅 compaction-acp）、组合搜索 × 筛选无命中、开关往返成功（徽标 + 计数随动）、
  失败路径（EPERM 原文上屏、状态不翻、无徽标）、在途门控（开关置灰、checked 不动）、
  自锁行与无桥兜底逐条闭环。
- **版本**：0.1.0 → 0.2.0（插件 `package.json`、`THIRD_PARTY_NOTICES.md` §4.1、
  `README.md` / `README.en.md` 双表、`docs/builtin-plugins-inventory.md` §一与 §5.2、插件 CHANGELOG）。

## [0.1.0] - 2026-10-11

### feat：首版 —— 内置插件在界面里第一次可管

- **形态**：在「设置 → 插件」的 tab 槽（`settings.plugins.tab`，id `builtin`）里加一页
  「内置插件」，逐条列出随安装包内置的插件（名称 / 说明 / 启用态），行上给一个复选开关。
- **数据来源与写入都只有一条路**：`window.dshDesktop.pluginManager.list / setEnabled`
  → Tauri 命令 `dsh:plugin-list` / `dsh:plugin-set-enabled`（契约表 `ipc-commands.md`）
  → sidecar `createPluginManager`（`dsh-tauri/sidecar/cli.js`）
  → profile 的 `cordis.patch.yml` 里那条 `- id / name / disabled: true`。
  **插件自身不写任何文件**（host 半边是空的，且有回归锁禁止它写），避免出现第二个写者——
  本仓库为「两个写者改同一份用户文件」付过两次学费（别名链接劫持 scoped 解析、
  「同步确保全部在位」覆写用户停用）。
- **生效时机如实写明（2026-10-12 在真内核页面上实测后校正）**：改动**立刻写入** patch 层；
  界面这一侧**重载页面即更新**（客户端半边由「当前活动的 loader 条目」门控——实测停用本页自己之后
  重载页面就读不到这条 tab 了），插件的内核半边才等下次启动。页面按这两层分别措辞，
  不写一刀切的「下次启动生效」。
- **自己那一行锁成不可停用**：既然关掉本页会连开关面一起收掉，而它是唯一能改回来的界面，
  放它停用等于一次性销毁自己。`lib/client.js` 以 `SELF` 常量识别本行并给出原因（`selfLock` 文案）；
  `SELF` ↔ bundle 层 loader id ↔ 在册清单行 id 三方同源由测试咬住，守卫摘掉后的变形由「反证 3」锁住。
- **无桥兜底**：浏览器直连内核页面（或 WSL 后端）时 `window.dshDesktop` 不存在，
  本页只说明原因、不渲染任何可写开关——可读不可写。
- **为什么不复用内核那份插件中心页**（实测结论，见 `docs/plugin-center-architecture.md` §4.7）：
  内核的两个开关都只认「当前活着的条目/选中的 bundle」。包级 `setBundleEnabled(false)` 把名字从
  `dsh.profile.bundles` 摘掉后，`listBundles` 的行名单 = `bundles ∪ dependencies ∪ 安装锚点`，
  内置件三处都不在（实测 profile `dependencies` 里内置件命中 0 条）→ 一关就从页面上消失、开不回来；
  条目级开关的解锁条件 `row.entryId !== void 0` 同样只认活条目 → 一关就锁死。
  内置件要「关得掉且开得回来」，清单来源就不能依赖运行态——所以用交付清单 `COMPANION_PLUGINS`。
- **验证**：`scripts/test/unit-builtin-manager-client.test.js` 10 例（模块契约 / normalize
  形状与剔除 + 阳性对照 / 渲染与置灰 / 成功与失败两条写路径 / 自锁与生效时机 / 无桥兜底 /
  包面 id 与 `SELF` 三方同源 / 三条反证）；
  `scripts/test/unit-companion-disable-override.test.js` 4 例（停用块活过 boot 登记
  逐条全量 / 纯登记块必须被删的反证 / toggle→登记→再 toggle 串测 / 卸载行为停用行超集）；
  真沙箱端到端：`sidecar boot` 五步全绿 → 插件镜像进 profile 并进 `bundles` →
  `plugin-set-enabled … 0` → **再 boot 一次 `disabled: true` 原样在位**（拉锯消失）。
  2026-10-12 补真机一轮：`stage-payload` → `smoke-installed`（PASS，29 个插件目录进包、
  内置件镜像进 profile、page-error 0）→ 手动续跑壳不杀 → 浏览器开内核页，
  「设置 → 内置插件」里本页真实挂载并渲染；桩桥下逐条行状态、置灰原因、
  `setEnabled(id, enabled)` 调用参数与「已保存」提示全部按预期；写路径用同一条
  `plugin-set-enabled … 0/1` 在隔离 profile 上往返核对（写入块与回收块逐字对齐）。

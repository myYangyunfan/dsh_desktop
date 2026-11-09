// 「这次更新了什么」——应用内更新提示的**唯一真源**。
//
// 为什么写成本地常量而不是去抓 GitHub Releases：这条提示要在「升级后第一次打开」就出现，
// 而网络、限流、离线不该决定它出不出现（已有的 updateHint 是「纯增值、失败静默」的设计，
// 不能把一条用户点名要的关键提示叠在同一条链路上）。本地常量还顺带满足了确定性：
// 同一版本在任何机器上提示的内容完全一致。
//
// **顺序就是语义**：客户端按数组顺序算「上次看到的版本之后还有哪些」，所以只能从旧到新
// 追加，不要按版本号大小或字母重排。
//
// 维护约定（由 test/whats-new.test.mjs 钉住）：`package.json` 的版本必须是这里的最后一条。
// 也就是说——bump 了版本却没写更新内容，本地就会红。这正是「新功能没人发现」的根治点：
// 发布前不写清楚「变了什么、在哪找」，就发不出去。
//
// 条目形状：`{ version, items: [{ text, where? }] }`。`where` 用来回答「在哪儿能找到它」，
// 是这次加这个提示的直接原因（新开关藏在面板头部，不主动指路等于没加）。
//
// **双语**（1.7.0 起）：text / where 用 DSH 的 LocalizedText 形状——`string | { en, ...locale }`
// （见 deepseek-harness 的 `@deepseek-ai/dsh-package-manifest`，宿主拿它配 resolveText 的
// 回落链解析包文案）。这里每一卷都是 `{ zh, en }`：中文是基准，英文是并排的第二份，
// 客户端按当前语言挑（lib/client.js 的 localized()），英文缺席时回落中文——
// 与市场文案的「中文基准 + 可选英文副本」同一把尺。1.7.0 之前的历史条目已全部补齐英文。
export const WHATS_NEW = [
  {
    version: '1.3.0',
    items: [
      {
        text: {
          zh: '新增「入口显示」开关：悬浮按钮与侧栏入口可以只留一个',
          en: 'New "Entry points" switch: keep only the floating button or only the sidebar entry',
        },
        where: { zh: '面板右上角「入口」', en: 'The "Entry points" control at the panel\'s top right' },
      },
      {
        text: {
          zh: '修复 DSH 0.1.6-alpha.2 上因 typert codec 契约变更导致面板整个打不开的问题',
          en: 'Fixed the panel failing to open at all on DSH 0.1.6-alpha.2 due to a typert codec contract change',
        },
      },
    ],
  },
  {
    version: '1.4.0',
    items: [
      {
        text: {
          zh: '新增「从本机客户端导入」：自动检出 Claude Code、Codex、OpenCode（含 .jsonc）、pi、Claude Desktop、Cursor、Windsurf、VS Code、Gemini CLI、Roo Code 与跨工具共享配置，点一条即可导入；只读、且来源里的密钥不会被送到浏览器',
          en: 'New "import from local clients": auto-detects Claude Code, Codex, OpenCode (including .jsonc), pi, Claude Desktop, Cursor, Windsurf, VS Code, Gemini CLI, Roo Code and cross-tool shared config — one click imports; read-only, and secrets from the source never reach the browser',
        },
        where: { zh: '面板「导入 MCP」', en: 'The panel\'s "Import MCP"' },
      },
      {
        text: {
          zh: '修掉一个能让宿主起不来的导入缺陷：`${VAR}` 变量未设置时不再求值成 undefined（那会让整棵插件树加载失败、面板打不开）',
          en: 'Fixed an import defect that could stop the Host from starting: an unset `${VAR}` variable no longer evaluates to undefined (which failed the whole plugin tree\'s load and kept the panel from opening)',
        },
      },
      {
        text: {
          zh: '同名 MCP 不再让整批导入失败：只跳过冲突的那一条，并在预览与结果里说明跳过了谁（此前还会写出宿主加载不了的配置，或在项目文件里静默少一条）',
          en: 'A same-named MCP no longer fails the whole import batch: only the conflicting entry is skipped, and the preview and result name who was skipped (previously it could write config the Host could not load, or silently drop an entry from the project file)',
        },
        where: { zh: '导入预览的「提示」', en: 'The "Notes" in the import preview' },
      },
      {
        text: {
          zh: 'Codex 的 http_headers / env_http_headers / bearer_token_env_var 放在不匹配的传输方式上时会逐条提示，不再静默丢弃',
          en: 'Codex\'s http_headers / env_http_headers / bearer_token_env_var on a mismatched transport are now reported one by one instead of being silently dropped',
        },
      },
    ],
  },
  {
    version: '1.4.1',
    items: [
      {
        text: {
          zh: '修掉项目标签溢出成「…N」后点不开、选不了的问题：弹层以前挂在横向滚动的标签条内部，会被整块裁掉（可见高度为 0），被折叠的项目物理上点不到；现在弹层挂在标签条外侧',
          en: 'Fixed project tabs overflowing into "…N" becoming unclickable and unselectable: the popover used to live inside the horizontally scrolling tab strip, so it was clipped away entirely (visible height 0) and the folded projects were physically unreachable; it now hangs outside the strip',
        },
        where: { zh: '面板顶部的项目标签', en: 'The project tabs at the panel\'s top' },
      },
      {
        text: {
          zh: '兼容性验证推进到 DSH `0.2.0-rc.2`（含真机复核：面板渲染、项目作用域写入、内置 MCP 安装）',
          en: 'Compatibility verification advanced to DSH `0.2.0-rc.2` (with real-hardware re-check: panel rendering, project-scope writes, built-in MCP install)',
        },
      },
    ],
  },
  {
    version: '1.4.2',
    items: [
      {
        text: {
          zh: '修掉 1.4.1 里被折叠项目「看得见但溢出」的问题：弹层里的行复用了标签 chip 的盒模型（content-box + 自带内外边距），整行比弹层宽出一圈、被挤出右边界；现在改用 border-box',
          en: 'Fixed the 1.4.1 follow-up where folded projects were "visible but overflowing": rows inside the popover reused the tab chip\'s box model (content-box plus its own padding/margin), making each row wider than the popover and pushing it past the right edge; now border-box',
        },
        where: { zh: '面板顶部的项目标签 →「…N」', en: 'The project tabs at the panel\'s top → "…N"' },
      },
    ],
  },
  {
    version: '1.5.0',
    items: [
      {
        text: {
          zh: '「内置 MCP」升级成 **MCP 市场**：47 个服务、10 个分类，逐条一手核实（包真实存在且能启动）。搜索是主操作，配分类筛选 + 排序 + 「只要免密钥」，卡片直接可装，不用再先勾选再确认',
          en: 'The "built-in MCP" list is now the **MCP market**: 47 services in 10 categories, each verified first-hand (the package really exists and starts). Search is the primary action, with category filter + sort + "keyless only", and cards install directly — no more select-then-confirm',
        },
        where: { zh: '面板顶部的「市场」', en: 'The "Market" at the panel\'s top' },
      },
      {
        text: {
          zh: '新增「安全与逆向」分类：JS Hook、IDA Pro、Frida 这类逆向与动态插桩工具以前混在「开发工具」里，想找的人得翻遍整个开发分类',
          en: 'New "Security & reversing" category: reversing and dynamic-instrumentation tools like JS Hook, IDA Pro and Frida used to be mixed into "Dev tools", so finding them meant scrolling the whole category',
        },
        where: { zh: '市场的「安全与逆向」', en: 'The market\'s "Security & reversing"' },
      },
      {
        text: {
          zh: '每张卡片先说清这条要准备什么：需密钥、需填连接信息（Redis / ClickHouse 的 HOST/PORT 不算密钥）、装完还得改参数（含 `<占位符>` 的条目），并如实标注免费额度',
          en: 'Every card now states up front what it needs: a key, connection info (Redis / ClickHouse HOST/PORT are not keys), parameters to edit after install (entries containing `<placeholders>`), and the free tier is labelled honestly',
        },
        where: { zh: '市场卡片上的徽章', en: 'The badges on market cards' },
      },
      {
        text: {
          zh: '凭据不进浏览器：市场只带「需要哪些变量名」，值始终留在宿主的配置里',
          en: 'Credentials never enter the browser: the market only carries "which variable names are needed" — values always stay in the Host\'s config',
        },
      },
      {
        text: {
          zh: '**一键升级**：面板顶部提示有新版本时，直接点「升级」就能装到最新版，不用再去敲 `dsh plugin update`。升级由 DSH 官方的 pluginManager 执行（失败会还原配置），装完提示你重启宿主生效——不重启等于没升',
          en: '**One-click upgrade**: when the panel\'s top bar reports a new version, click "Upgrade" to install it — no more typing `dsh plugin update`. The upgrade runs through DSH\'s official pluginManager (config is restored on failure), and it tells you to restart the Host afterwards — without a restart nothing changed',
        },
        where: { zh: '面板顶部的更新提示条', en: 'The update hint bar at the panel\'s top' },
      },
      {
        text: {
          zh: '**项目级 MCP 现在改完就生效**：新增立刻挂到运行中的会话、删除立刻撤掉工具、改配置就地重载连接，不用重开会话也不用重启宿主（以前要等所有会话结束，面板会标「配置待生效」）',
          en: '**Project-level MCP now takes effect immediately**: adding mounts into running sessions at once, removing withdraws tools at once, and config changes reload the connection in place — no reopening sessions, no Host restart (previously you waited for all sessions to end and the panel showed "config pending")',
        },
        where: { zh: '「本项目」标签页', en: 'The "This project" tab' },
      },
      {
        text: {
          zh: '项目连接不再随会话结束而拆：最后一个会话关掉后连接保留 5 分钟（`idleTimeoutMs` 可调，`0` = 永不回收），下次会话直接用；新会话**第一轮**就能看到项目工具，不用等第二轮',
          en: 'Project connections no longer tear down when a session ends: after the last session closes the connection is kept for 5 minutes (`idleTimeoutMs` is adjustable, `0` = never reclaim), so the next session reuses it; a new session sees project tools in its **first turn** instead of the second',
        },
        where: { zh: '「本项目」标签页的行状态', en: 'The row status in the "This project" tab' },
      },
      {
        text: {
          zh: '项目 MCP 多了「重连」按钮：mcp-client 重连次数耗尽后会注销工具并停止，以前只能重载配置或重启宿主才能恢复，现在点一下就拆旧建新（不点也会在下一次会话挂载时自动重建）',
          en: 'Project MCP gained a "Reconnect" button: mcp-client unregisters tools and stops once its reconnect attempts run out, which previously needed a config reload or Host restart; one click now tears down and rebuilds (and it auto-rebuilds on the next session mount anyway)',
        },
        where: { zh: '项目 MCP 详情页', en: 'The project MCP detail pane' },
      },
      {
        text: {
          zh: '项目行的状态不再把「连接在不在」和「几个会话在用」压成一句：`已连接 · 当前无会话使用（连接保留，下次直接用）` 与 `已连接 · N 个会话在用` 分开展示；「待会话挂载」「配置待生效」两个容易误读的文案已删除',
          en: 'Project row status no longer mashes "is the connection up" and "how many sessions use it" into one line: "Connected · no session using it right now (kept for next time)" and "Connected · in use by N session(s)" are now separate; the two easy-to-misread strings "awaiting session mount" and "config pending" are gone',
        },
        where: { zh: '「本项目」标签页的行副文案', en: 'The row sub-caption in the "This project" tab' },
      },
    ],
  },
  {
    version: '1.5.1',
    items: [
      {
        text: {
          zh: '**跨工作区搬运**：把本项目的 MCP 一次勾选复制到另一个已注册的工作区。复制在宿主内完成，配置与凭据不经过浏览器；写之前会先把「新增 / 覆盖 / 跳过」哪些条目算给你看，目标已有同名时**默认跳过**（保留目标那份），也可以显式切「覆盖」。目标项目屏蔽了哪些全局 MCP 不跟着搬——那是那个项目自己的决定',
          en: '**Cross-workspace copy**: tick this project\'s MCP entries and copy them to another registered workspace in one go. The copy happens inside the Host — config and credentials never pass through the browser; before writing it shows which entries would be added / overwritten / skipped, and same-named targets **skip by default** (keeping the target\'s copy), with an explicit "overwrite" switch. Which global MCPs the target project blocks does not come along — that is that project\'s own decision',
        },
        where: { zh: '项目标签页「此项目的 MCP」标题右侧的「复制到…」', en: '"Copy to…" at the right of the project tab\'s "This project\'s MCP" heading' },
      },
      {
        text: {
          zh: '**导出项目配置**：把本项目配置导出成 JSON（与 `.dsh/mcp.json` 同格式），可复制或下载文件，用于备份、跨机器迁移或分享；也能直接用「导入 MCP」粘贴回来。注意这是唯一一处让**完整配置**经过浏览器的路径：字面写死的凭据（URL 里的 token、字面 header / env 值）会原样出现在结果里，请按密钥对待；用 `${VAR}` 引用的位置保持引用写法，不会被解析成明文',
          en: '**Export project config**: export this project\'s config as JSON (same format as `.dsh/mcp.json`) — copy it or download the file, for backup, cross-machine migration or sharing; you can also paste it straight back via "Import MCP". Note this is the only path where the **full config** passes through the browser: literal credentials (a token in the URL, literal header / env values) appear verbatim in the result — treat it as a secret; positions referenced via `${VAR}` stay references and are never resolved to plaintext',
        },
        where: { zh: '项目标签页「此项目的 MCP」标题右侧的「导出」', en: '"Export" at the right of the project tab\'s "This project\'s MCP" heading' },
      },
      {
        text: {
          zh: '修掉一个新对话框不吸焦点的问题：焦点留在面板里时按一次 Esc 会把面板连对话框一起关掉（侧栏入口形态下则是按了没反应）。现在所有弹框的焦点与 Esc 契约只有一份实现',
          en: 'Fixed a new dialog not taking focus: with focus inside the panel, one Esc press closed the panel together with the dialog (in the sidebar-entry form it did nothing at all). All dialogs now share one implementation of the focus and Esc contract',
        },
        where: { zh: '所有弹框', en: 'All dialogs' },
      },
      {
        text: {
          zh: '修掉名字叫 `__proto__` 的条目前会被静默丢掉的问题——复制会报「新增 1 条」而目标文件里没有它；这类服务器在面板里还会永远显示「未连接」，日志脱敏也会丢掉这个键',
          en: 'Fixed entries named `__proto__` being silently dropped — copy reported "1 added" while the target file did not contain it; such servers also showed "not connected" forever in the panel, and log redaction dropped the key too',
        },
      },
      {
        text: {
          zh: '写项目配置的入口统一要求目标工作区已在 DSH 注册过（以前只有复制这一条路径校验）。正常操作看不出区别：界面里的目标本来就来自工作区列表；直接用接口往任意目录写会被拒',
          en: 'Every project-config write path now requires the target workspace to be registered in DSH (previously only the copy path checked). Normal use sees no difference — targets in the UI always come from the workspace list; writing to an arbitrary directory directly through the API is refused',
        },
      },
      {
        text: {
          zh: '「没有选中任何条目」与「源项目本来没有可复制的 MCP」不再报同一句话',
          en: '"Nothing selected" and "the source project has no copyable MCP" no longer report the same sentence',
        },
      },
    ],
  },
  {
    version: '1.5.2',
    items: [
      {
        text: {
          zh: '修掉复制弹框里勾选列表挤成一团的问题：字段标题的样式漏进了列表行，把行的 `display:flex` 压成 `block`，「复选框 · MCP 名字 · 传输类型」之间因此没有间距、类型也不靠右对齐。现在名字左对齐、传输类型右对齐、行与行分开',
          en: 'Fixed the tick list in the copy dialog being squeezed together: field-heading styles leaked into list rows, squashing the row\'s `display:flex` into `block`, so "checkbox · MCP name · transport" had no gaps and the type was not right-aligned. Names are now left-aligned, transports right-aligned, rows separated',
        },
        where: { zh: '「复制到…」弹框的「要复制的 MCP」列表', en: 'The "MCP to copy" list in the "Copy to…" dialog' },
      },
      {
        text: {
          zh: '「复制」现在要求当前选择已经算出结果才可按：换目标、改勾选或切「跳过 / 覆盖」之后旧结果立即失效，重算完成前按钮保持不可按——不会再出现「按着旧预览点了确认」；预览失败时同样不可按并显示原因',
          en: '"Copy" now requires the current selection to have a computed result: changing the target, the ticks or the "skip / overwrite" switch invalidates the old result immediately, and the button stays disabled until the recompute finishes — no more "confirming against a stale preview"; on preview failure it is likewise disabled with the reason shown',
        },
        where: { zh: '「复制到…」弹框的「写入结果预览」与「复制」按钮', en: 'The "write-result preview" and the "Copy" button in the "Copy to…" dialog' },
      },
      {
        text: {
          zh: '修掉 `env` / `headers` 里名字叫 `__proto__` 的键会被原型吃掉的问题（上一版只修了 MCP 名字本身）：这类键现在从内部配置到落盘文件、再到下发给 mcp-client 全程保留',
          en: 'Fixed keys named `__proto__` in `env` / `headers` being eaten by the prototype (the previous release only fixed the MCP name itself): such keys now survive from internal config to the on-disk file all the way to mcp-client',
        },
      },
    ],
  },
  {
    version: '1.6.0',
    items: [
      {
        text: {
          zh: '**新增技能管理**：面板顶部多了能力层枚举（MCP / 技能）。技能面能看本机每个技能的**真实作用域**与根目录、读正文、启停与删除。同名技能跨作用域是合法配置（DSH 按优先级裁决谁生效）：面板按作用域逐条列出**它能看到的每一份**并标出哪一份生效——宿主只报告生效的那份，所以落选副本以**已停用**形态留在别的根里时才看得见',
          en: '**New skills management**: the panel\'s top gained an ability-layer enum (MCP / Skills). The skills pane shows every local skill\'s **real scope** and root, reads its body, and enables/disables/deletes it. Same-named skills across scopes are a legal configuration (DSH decides the winner by priority): the pane lists **every copy it can see** per scope and marks which one takes effect — the Host only reports the effective one, so losing copies are visible only when they sit in another root as **disabled**',
        },
        where: { zh: '面板顶部的「技能」', en: '"Skills" at the panel\'s top' },
      },
      {
        text: {
          zh: '**导入前先挡非法 frontmatter**：判定逐字照抄宿主（缺 name/description、名字不是 kebab-case、误用了驼峰式 `disableModelInvocation`、把 `whenToUse` 写成外部规范的 `when_to_use`），不合格就拒绝导入并说出第一条原因——否则装进去只会得到一条宿主 warn+skip 的「看不见的技能」',
          en: '**Illegal frontmatter is now blocked before import**: the check copies the Host verbatim (missing name/description, a name that is not kebab-case, the camelCase `disableModelInvocation` used by mistake, `whenToUse` written as the external spec\'s `when_to_use`); anything failing is refused with the first reason stated — otherwise you would install an "invisible skill" the Host warns about and skips',
        },
        where: { zh: '从本机导入技能时的报错', en: 'The error when importing skills from local sources' },
      },
      {
        text: {
          zh: '**已停用的技能现在看得见也能恢复**：DSH 的技能没有 disabled 字段，停用只能把 `SKILL.md` 改名——代价是它从宿主目录里彻底消失。本面板自己扫描这些改名后的文件，所以停用的技能仍会列出并可一键启用',
          en: '**Disabled skills are now visible and restorable**: DSH skills have no disabled field, so disabling could only rename `SKILL.md` — at the cost of vanishing from the Host\'s directory entirely. This pane scans those renamed files itself, so disabled skills still list and re-enable in one click',
        },
        where: { zh: '技能管理', en: 'Skills management' },
      },
      {
        text: {
          zh: '**新增技能市场**：接 **skillhub.cn** 的上游技能库，按分类浏览、按关键字搜索（搜索是**显式触发**的，不随打随搜）。请求一律由**宿主侧**发出、面板自己不联网；上游不可用时只影响这一页，不会让面板打不开',
          en: '**New skill market**: the **skillhub.cn** upstream library — browse by category, search by keyword (search is **explicitly triggered**, not as-you-type). All requests are made by the **Host side**; the panel itself never touches the network, and an upstream outage affects only this page — the panel still opens',
        },
        where: { zh: '技能 →「市场」', en: 'Skills → "Market"' },
      },
      {
        text: {
          zh: '**外部源不做许可判定，也不假装做过**：上游条目**没有 license 字段**，所以本插件不替它编一个判定出来——只披露上游唯二可信的东西（发布方企业认证、腾讯安全扫描结论）并明写「本插件未核验」，装之前要你**亲口确认**。这条确认由**服务端**校验，不是界面上的装饰',
          en: '**No license verdict for external sources, and no pretending otherwise**: upstream entries have **no license field**, so this plugin does not invent one — it only discloses the two things upstream can be trusted for (publisher enterprise verification, Tencent security scan result), states plainly "not verified by this plugin", and requires your **explicit confirmation** before install. That confirmation is checked **server-side**, not a UI decoration',
        },
        where: { zh: '市场卡片的「安装」', en: '"Install" on market cards' },
      },
      {
        text: {
          zh: '**技能正文会作为指令进入模型上下文**：安装弹框会说明是否含 `scripts/` 可执行脚本、作者声明了哪些工具权限（DSH 并不强制这个字段，所以更要如实披露）。落盘走的是宿主那条 `importSkill`——解压、挑技能根、校验 frontmatter、按 `name` 落盘，同名已存在时**拒绝而不是覆盖**',
          en: '**A skill\'s body enters the model context as instructions**: the install dialog states whether it contains `scripts/` executables and which tool permissions the author declared (DSH does not enforce that field, which is exactly why it is disclosed honestly). Installation goes through the Host\'s own `importSkill` — unpack, pick the skill root, validate frontmatter, write by `name`; a same-named existing skill is **refused, not overwritten**',
        },
        where: { zh: '安装后的落点', en: 'Where an install lands' },
      },
      {
        text: {
          zh: '技能能力面是**独立子服务**：宿主没启用内置插件 `dsh-skill` 时只有技能面显示「服务未连接」，**MCP 面板完全不受影响**',
          en: 'The skills pane is an **independent sub-service**: when the Host has not enabled the built-in `dsh-skill` plugin, only the skills pane shows "service not connected" — the **MCP panel is completely unaffected**',
        },
      },
      {
        text: {
          zh: '检测到**另一个 MCP 管理插件**已挂载时主动让位（只显示一条说明、不注册入口），避免两个面板互相遮挡、同时改写同一份配置；检测失败一律照常注册——宁可两个按钮并存，也不要让你打不开面板',
          en: 'When **another MCP management plugin** is detected as mounted, this one yields (a single notice, no entry registered) so two panels cannot overlap or rewrite the same config; if the detection itself fails it registers anyway — better two buttons side by side than a panel you cannot open',
        },
      },
    ],
  },
  {
    version: '1.6.1',
    items: [
      {
        text: {
          zh: '**入口改名「工具箱」**：侧栏入口与悬浮按钮原来说「MCP」，可点开是 MCP **加**技能两个能力面——名字对不上东西。现在统一叫「工具箱」，能力层枚举里的「MCP / 技能」保持不动（那说的是能力，不是产品名）',
          en: '**The entry is renamed "Toolbox"**: the sidebar entry and floating button used to say "MCP", yet they open MCP **plus** skills — two ability panes under a name that matched neither. Both now say "Toolbox"; the ability-layer enum keeps "MCP / Skills" as-is (that names the capability, not the product)',
        },
        where: { zh: '侧栏入口与右下角悬浮按钮', en: 'The sidebar entry and the bottom-right floating button' },
      },
      {
        text: {
          zh: '**安装失败时说清原因**：以前只显示一个错误码（在 Windows 上还可能是个崩溃码），现在把 pnpm 自己的那句话带出来——例如「No matching version found … The latest release is 1.5.3」，装不上时你直接知道是版本、网络还是权限的问题',
          en: '**Install failures now say why**: previously only an error code (on Windows possibly a crash code); now pnpm\'s own sentence comes through — e.g. "No matching version found … The latest release is 1.5.3" — so when an install fails you know directly whether it is a version, network or permission problem',
        },
        where: { zh: '升级/安装失败的那条提示', en: 'The message on an upgrade/install failure' },
      },
    ],
  },
  {
    version: '1.6.2',
    items: [
      {
        text: {
          zh: '**技能能一键改成「只在你手动点名时可用」**：详情页新增「模型自动调用」开关，直接改 `SKILL.md` 的 `disable-model-invocation`，不必再手工翻文件。关闭时它把那**一行**删掉（缺省即允许，所以不留痕迹）、只在需要时于 frontmatter 末尾追加一行——字段顺序与正文都不动；形状读不准（值跨行，或要在带行尾注释的那一行上打开它）时它会**拒绝**并说明原因，而不是猜一个改法',
          en: '**One click makes a skill "only when you invoke it by name"**: the detail pane gained a "model auto-invocation" switch that edits `SKILL.md`\'s `disable-model-invocation` directly — no more hand-editing files. Turning it off deletes **that line** (absence means allowed, so no trace is left) and appends one line at the end of frontmatter only when needed — field order and body untouched; when the shape cannot be read reliably (a multi-line value, or the line carries a trailing comment) it **refuses** and says why instead of guessing an edit',
        },
        where: { zh: '技能 → 选中一条技能 → 概览', en: 'Skills → select a skill → Overview' },
      },
      {
        text: {
          zh: '**调用权限现在如实显示**：以前已停用的技能一律被显示成「模型不可调用 / 用户不可调用」——那是凭空的断言（它的权限只有那份 `.disabled` 文件能回答）。现在按技能文件里真正写着的内容显示，读不出来（frontmatter 非法、宿主会整条跳过它）就显示「未知」而不猜一个值',
          en: '**Invocation permissions are now shown honestly**: disabled skills used to be shown as "not model-invocable / not user-invocable" — a claim from nowhere (only that `.disabled` file could answer it). They now show what the skill file actually says, and when it cannot be read (illegal frontmatter the Host skips entirely) they show "unknown" rather than a guessed value',
        },
        where: { zh: '技能列表的徽章与详情里的属性', en: 'The badges in the skill list and the properties in the detail pane' },
      },
      {
        text: {
          zh: '**修好「有新版本却从不提示」**：更新检查原先读仓库的 release feed，而那里唯一的 latest 被另一条线的 pre-release 规则占着，于是本线的提示恒为「已是最新」——1.6.2 发出来你也看不到它。现在问的是本包在 npm 上的最新版。⚠️ 这条修复装在**这一版**里，所以 1.6.1 及更早的用户请手动 `dsh plugin --profile web update dsh-toolbox-ui` 升一次；从这一版起提示恢复正常',
          en: '**Fixed "a new version exists but is never reported"**: the update check used to read the repository\'s release feed, whose only `latest` was occupied by another line\'s pre-release rule, so this line\'s hint was permanently "already latest" — 1.6.2 shipped and you would never see it. It now asks npm for this package\'s latest version. ⚠️ This fix ships **in this very release**, so users on 1.6.1 or earlier should upgrade once manually with `dsh plugin --profile web update dsh-toolbox-ui`; from this release on the hint works again',
        },
        where: { zh: '面板顶部的更新提示条', en: 'The update hint bar at the panel\'s top' },
      },
    ],
  },
  {
    version: '1.6.3',
    items: [
      {
        text: {
          zh: '**这一版没有功能改动**：改的是门面与发布资产——README 重写（更短、只留两张关键截图）、换上新图标，仓库也从旧名改成了 `dsh-toolbox-ui`，与包名终于对上。旧地址 GitHub 会自动跳转，已有的安装、书签与 `github:` 链接都不受影响',
          en: '**No functional changes in this release**: it is the storefront and release assets — the README rewritten (shorter, only two key screenshots), a new icon, and the repository renamed from its old name to `dsh-toolbox-ui`, finally matching the package name. GitHub redirects the old address, so existing installs, bookmarks and `github:` links are unaffected',
        },
        where: { zh: '仓库主页', en: 'The repository home page' },
      },
    ],
  },
  {
    version: '1.6.4',
    items: [
      {
        text: {
          zh: '**技能目录是符号链接时不再「整行不可用」**：这种情况下面板以前显示「位置（未报告）／调用权限未知」，点开还读不出正文——悬浮提示把它说成 frontmatter 有问题，其实是面板没能定位到那个目录（文件一直是好的）。现在链接目录照常定位，位置与调用权限都正常显示，读正文与「模型自动调用」开关也可用。⚠️ 同一形态下的**停用/删除**当时还没修好，见 1.6.5',
          en: '**A symlinked skill directory is no longer "entirely unusable"**: the panel used to show "location (unreported) / invocation permission unknown" and could not read the body — the tooltip blamed frontmatter, but the real cause was the panel failing to locate that directory (the file was fine all along). Linked directories now resolve normally: location and invocation permission display correctly, and reading the body plus the "model auto-invocation" switch both work. ⚠️ **Disable/delete** in the same shape were not yet fixed at the time — see 1.6.5',
        },
        where: { zh: '技能列表与详情', en: 'The skill list and the detail pane' },
      },
      {
        text: {
          zh: '**同一个目录被两处指到时不再重复列出**：当 `DSH_HOME` 就在工作区里（例如 `DSH_HOME=D:\\DSH\\.dsh` 而工作区是 `D:\\DSH`），项目级与全局的技能目录其实是同一个。以前同一个技能会被列成好几行、还互相标「被遮蔽」，安装位置里同一个目录也出现两次。现在同一个文件只占一行（留优先级更高的那份，也就是模型实际收到的那份）；**不同目录**里的同名技能仍然各占一行——那是真实的遮蔽，不是重复',
          en: '**No more duplicate rows when one directory is pointed at from two places**: when `DSH_HOME` sits inside the workspace (e.g. `DSH_HOME=D:\\DSH\\.dsh` with workspace `D:\\DSH`), the project-level and global skill directories are the same one. The same skill used to list as several rows, each marked "shadowed" by the others, and the same directory appeared twice under install location. One file now occupies one row (keeping the higher-priority copy — the one the model actually receives); same-named skills in **different directories** still each get a row — that is real shadowing, not duplication',
        },
        where: { zh: '技能列表、安装到', en: 'The skill list, "install into"' },
      },
      {
        text: {
          zh: '**「哪一份生效」以前说反了**：同名技能里，面板指着的其实是**模型收不到**的那份，于是你可能照着提示去操作了另一份。现在按 DSH 的优先级如实判定（项目级优先于全局），并说明生效的那份在哪',
          en: '**"Which copy takes effect" used to be backwards**: among same-named skills the pane pointed at the copy the **model never receives**, so you could end up operating on the wrong one. It now judges by DSH\'s actual priority (project-level over global) and says where the effective copy lives',
        },
        where: { zh: '技能列表的「被遮蔽」徽章与诊断页', en: 'The "shadowed" badge in the skill list and the diagnostics page' },
      },
    ],
  },
  {
    version: '1.6.5',
    items: [
      {
        text: {
          zh: '**修好「停用一条技能后它就从面板消失」**：技能目录是指向外部同步库的符号链接时，停用后那条技能既不在「已启用」也不在「已停用」里——磁盘上其实改名成功了，但面板再也看不到它、也点不到「启用」把它恢复。现在停用后照常列在「已停用」里，一键就能启用回来',
          en: '**Fixed "a skill vanishes from the panel once disabled"**: with a skill directory symlinked to an external sync library, a disabled skill appeared in neither "enabled" nor "disabled" — the rename had actually succeeded on disk, but the panel could no longer see it or click "enable" to bring it back. Disabled skills now list normally under "disabled" and re-enable in one click',
        },
        where: { zh: '技能列表（停用/启用）', en: 'The skill list (disable/enable)' },
      },
      {
        text: {
          zh: '**链接技能的「删除」不再报错**：同样的链接形态下，删除以前会失败并报一个目标引用错误，用户以为技能删不掉。现在删除正常工作，而且**只删掉那个链接**——技能本体在外部同步库里的内容一个字都不会动',
          en: '**"Delete" on a linked skill no longer errors**: in the same linked shape, deleting used to fail with a target-reference error, leaving users thinking skills could not be deleted. Delete now works, and it removes **only that link** — not one byte of the skill\'s real content in the external sync library is touched',
        },
        where: { zh: '技能详情的「删除技能」', en: '"Delete skill" in the skill detail pane' },
      },
      {
        text: {
          zh: '**补齐「扁平技能的文件本身是链接」这种形态**：技能可以是 `<名字>.md` 单文件（而不是目录），这个文件同样可能是指向外部库的链接；上一版只修好了「目录是链接」，这一种仍会定位不到。现在四种形态（目录／单文件 × 普通／链接）都能正确定位，位置、调用权限、启停、删除、读正文全部可用',
          en: '**Covered the "the flat skill\'s own file is a link" shape**: a skill can be a single `<name>.md` file (not a directory), and that file can likewise be a link to an external library; the previous release only fixed "the directory is a link" and this shape still failed to resolve. All four shapes (directory/file × plain/linked) now resolve correctly — location, invocation permission, enable/disable, delete and body reading all work',
        },
        where: { zh: '技能列表与详情', en: 'The skill list and the detail pane' },
      },
    ],
  },
  {
    version: '1.6.6',
    items: [
      {
        text: {
          zh: '**「启停」不再改你的文件名**：以前停用是把 `SKILL.md` 改名成 `SKILL.md.disabled`。那个后缀不是任何工具认识的形态——而技能常放在 `~/.agents/skills`，VS Code / Copilot、Codex 也读那里，改名会让它们以为你的技能坏了。现在停用写的是**宿主原生的两个字段**（`disable-model-invocation: true` + `user-invocable: false`，也就是 VS Code 官方文档里叫 “Disabled skills” 的那一档）：模型不会自动用它、你也不能手动调用它，而文件仍在原处、别的工具照常认得。旧版本留下的 `.disabled` 文件仍会列出来并支持一键恢复',
          en: '**Enable/disable no longer renames your files**: disabling used to rename `SKILL.md` to `SKILL.md.disabled` — a suffix no tool recognises, and since skills often live in `~/.agents/skills`, which VS Code / Copilot and Codex also read, the rename made them think your skill was broken. Disabling now writes the **Host\'s own two fields** (`disable-model-invocation: true` + `user-invocable: false` — the tier VS Code\'s official docs call “Disabled skills”): the model will not auto-use it and you cannot invoke it manually, while the file stays put and other tools still recognise it. `.disabled` files left by older versions still list and restore in one click',
        },
        where: { zh: '技能列表（停用/启用）', en: 'The skill list (disable/enable)' },
      },
      {
        text: {
          zh: '**文件名与技能名不一致的技能，以前在面板里一个都用不了**：DSH 的技能名取自文件里的 `name`，而磁盘上的文件/目录名允许与它不同。面板以前按**技能名**去拼磁盘路径，于是这类技能虽然模型能正常使用，面板里点什么都报「找不到技能」——读正文、启停、删除全废。现在一律按**宿主报告的真实位置**定位（根 + 那个根下的磁盘条目），与名字无关。实测六种形态里有四种曾经完全不可操作',
          en: '**Skills whose file name differs from the skill name used to be entirely unusable in the panel**: DSH takes the skill name from the file\'s `name`, while the on-disk file/directory name may differ. The panel used to build disk paths from the **skill name**, so such skills — perfectly usable by the model — reported "skill not found" for every action: reading the body, enable/disable and delete were all dead. It now locates by the **real position the Host reports** (root + the disk entry under that root), independent of the name. Of six tested shapes, four used to be completely inoperable',
        },
        where: { zh: '技能列表与详情（所有操作）', en: 'The skill list and the detail pane (all actions)' },
      },
      {
        text: {
          zh: '**已停用的技能不再需要面板自己扫盘**：以前停用后技能会从宿主目录里消失，面板只好自己去翻 `.disabled` 文件——那是第二份真值来源，也是「同一行重复出现」「链接技能停用后消失」这些问题的根源。现在停用不改文件、宿主照样报告它，面板看到的与宿主报告的是同一份东西，那类缺陷在结构上不再可能',
          en: '**Disabled skills no longer need the panel to scan the disk itself**: disabling used to make the skill vanish from the Host\'s directory, forcing the panel to hunt `.disabled` files on its own — a second source of truth, and the root of "the same row appears twice" and "a linked skill vanishes when disabled". Disabling now leaves the file alone and the Host still reports it, so what the panel sees and what the Host reports are the same thing, and that class of defect is structurally impossible',
        },
        where: { zh: '技能列表', en: 'The skill list' },
      },
      {
        text: {
          zh: '**改完不用重启了（以前面板让你重启，其实是白重启）**：宿主用文件监听盯住技能根，你改完技能约 **0.25 秒**就生效（实测 8 次，中位数 246ms）——旧提示写「重启 DSH 最稳妥」会让你白重启一次。面板本身照旧在动作后与切回标签页时重取（宿主有个 `skills/change` 事件，但不在它转发的白名单里，第三方插件收不到，所以做不到实时推送）',
          en: '**No restart needed after a change (the panel used to tell you to restart — a wasted one)**: the Host watches the skill roots with a file watcher, so your change takes effect in about **0.25 seconds** (measured 8 times, median 246ms) — the old hint "restarting DSH is safest" made you restart for nothing. The panel itself still re-fetches after an action and when switching back to the tab (the Host has a `skills/change` event, but it is not in its forwarding whitelist, so third-party plugins cannot receive it — real-time push is not possible)',
        },
        where: { zh: '技能详情的开关提示、docs/skills.md', en: 'The switch hint in the skill detail pane, docs/skills.md' },
      },
      {
        text: {
          zh: '**「用户可调用」现在也能就地开关**：以前详情页只有「模型自动调用」一个开关，「用户可调用」只能看——于是你要是原本只想要「仅我手动可调用」那一档（模型别自动用），点过「停用→启用」之后它会被重置，而**面板上没有开关能拨回来**，只能去编辑技能文件。现在两个调用面各有一个开关，四种组合（都能用 / 仅手动 / 仅模型 / 停用）都能在面板里拨',
          en: '**"User-invocable" is now switchable in place too**: the detail pane used to have only the "model auto-invocation" switch, with "user-invocable" read-only — so if you wanted the "manual invocation only" tier (no model auto-use), a disable→enable cycle reset it and **no switch in the panel could set it back**; you had to edit the skill file. Both invocation faces now have a switch, and all four combinations (both / manual only / model only / disabled) are reachable in the panel',
        },
        where: { zh: '技能详情（调用权限）', en: 'The skill detail pane (invocation permissions)' },
      },
    ],
  },
  {
    version: '1.6.7',
    items: [
      {
        text: {
          zh: '**技能市场终于能翻页了**：以前滚到没有任何反应——上游其实有 19 万个技能（实测 19.3 万），面板却只取第一页，计数还写着「19 万条结果」，数字和屏幕上的卡片永远对不上。现在**滚到底自动加载下一页**（底部也有「加载更多」按钮兜底），计数改成「已显示 X / 共 Y 条」；换关键字或分类会重置回第一页并整体替换',
          en: '**The skill market finally paginates**: scrolling used to do nothing — upstream actually holds 190k skills (measured 193k), yet the panel fetched only the first page while the counter read "190k results", so the number never matched the cards on screen. Scrolling to the bottom now **loads the next page automatically** (with a "load more" button as backup), the counter reads "showing X / Y total", and changing keyword or category resets to page one and replaces the results',
        },
        where: { zh: '技能 →「发现市场」', en: 'Skills → "Discover market"' },
      },
      {
        text: {
          zh: '**修掉市场卡片重复、越滚越乱**：上游同一页里就会返回重复条目——同一个技能被不同发布者多次发布（实测第一页 100 条只有 88 个不同技能），重复的卡片会让页面渲染错乱、搜索结果像叠在一起。现在按技能标识**全局去重**（跨页与页内一起去），屏幕上有的每一张都不一样，计数与实物一致',
          en: '**Fixed duplicate market cards piling up as you scroll**: upstream returns duplicates within a single page — the same skill published repeatedly by different publishers (measured: the first page\'s 100 entries held only 88 distinct skills), and duplicates made rendering glitch and search results look stacked. Entries are now **globally deduplicated** by skill identity (across pages and within a page), so every card on screen is distinct and the count matches reality',
        },
        where: { zh: '技能 →「发现市场」', en: 'Skills → "Discover market"' },
      },
      {
        text: {
          zh: '**加载更多失败不再清空你已经翻到的卡片**：上游偶尔抖一下时，以前的摆法会把整个结果区换成一条错误提示，已加载的几百张卡片全部消失。现在错误与重试放在结果区上方，你翻到的东西原地留着',
          en: '**A failed "load more" no longer wipes the cards you already paged to**: when upstream hiccupped, the old layout replaced the whole result area with one error message and the hundreds of loaded cards all vanished. Errors and retry now sit above the result area, and what you had paged to stays in place',
        },
        where: { zh: '技能 →「发现市场」的结果区', en: 'The result area of Skills → "Discover market"' },
      },
    ],
  },
  {
    version: '1.7.0',
    items: [
      {
        text: {
          zh: '**面板会跟着 DSH 的界面语言走**：宿主切成英文，面板的全部文案（按钮、页签、状态、提示、升级说明）即时变英文，不用重开面板；中文仍是默认——没有语言服务的宿主上照常纯中文，一个字节都没变',
          en: '**The panel now follows DSH\'s interface language**: switch the Host to English and every label in the panel (buttons, tabs, statuses, hints, upgrade notes) turns English immediately — no panel restart; Chinese stays the default — on a Host with no locale service the panel is pure Chinese, byte for byte unchanged',
        },
        where: { zh: '面板全部文案', en: 'All panel copy' },
      },
      {
        text: {
          zh: '**五份文档有了英文版**：安装、技能、JSON 导入、项目 MCP 生命周期、设计与限制各一份 `.en.md`，README 中英互链；代码块与字段名逐字节未动',
          en: '**Five docs now have English versions**: installation, skills, JSON import, project-MCP lifecycle and design each gained a `.en.md`, with the README cross-linked in both languages; code blocks and field names are byte-for-byte unchanged',
        },
        where: { zh: '仓库 README 与 docs/', en: 'The repository README and docs/' },
      },
      {
        text: {
          zh: '**MCP 市场文案英文化**：分类、说明、凭据要求、「装完先改这里」的占位符提示全是英文，按中文名或英文名都搜得到；中文那份核实记录一个字没动',
          en: '**MCP market copy is now English-aware**: categories, summaries, credential requirements and the "edit this after install" placeholder hints are all in English, searchable by either the Chinese or the English name; the Chinese verification record is untouched',
        },
        where: { zh: '面板「市场」', en: 'The panel\'s "Market"' },
      },
      {
        text: {
          zh: '**技能市场按语言挑文案**：上游本来就给中英两份（发布方原文 + 平台中文版），以前一律取中文，英文那半永远用不上；现在英文界面取原文，中文界面行为与以前完全一致',
          en: '**The skill market now picks copy by language**: upstream provides two versions per entry (the publisher\'s original + the platform\'s Chinese), which the panel used to always resolve to Chinese — the English half was unreachable; the English UI now takes the original, and the Chinese UI behaves exactly as before',
        },
        where: { zh: '技能 →「市场」', en: 'Skills → "Market"' },
      },
      {
        text: {
          zh: '**「这次变了什么」提示也有了英文**：从 1.3.0 到当前版本的历史条目全部补齐双语，英文用户升级后看到的不再是整段中文',
          en: '**The "what changed this time" notice is bilingual too**: every entry from 1.3.0 to the current release now has both languages, so English users no longer see a wall of Chinese after upgrading',
        },
        where: { zh: '升级后首次打开面板', en: 'The first panel open after an upgrade' },
      },
      {
        text: {
          zh: '**英文界面收尾**：预设模板下拉、市场分类行不再漏中文；侧栏「工具箱」入口标签随语言切换即时更新（以前停在插件加载时的语言）；`en_US` 这类下划线语言标记也认得了',
          en: '**English UI finishing touches**: the preset-template dropdown and market category rows no longer leak Chinese; the sidebar "Toolbox" entry label now follows language switches immediately (it used to freeze at the language active when the plugin loaded); underscore locale tags like `en_US` are recognised too',
        },
      },
    ],
  },
  {
    version: '1.7.1',
    items: [
      {
        text: {
          zh: '**修掉「DSH 是中文、面板却显示英文」**：宿主按「当前语言 → 回落链」查各插件登记的词典，而英文是每条链的终点——此前只登记了英文一份，中文模式下会落到英文上，于是除了走数据的分类标签，整片面板变英文。现在中英两份都登记，中文模式恒中文，英文模式不受影响',
          en: '**Fixed "DSH is Chinese but the panel shows English"**: the Host resolves each plugin\'s registered dictionaries along the active-language fallback chain, and English terminates every chain — with only the English dictionary registered, Chinese fell through to English and the whole panel (everything except the data-driven category labels) turned English. Both dictionaries are now registered: Chinese mode stays Chinese, English mode is unaffected',
        },
      },
      {
        text: {
          zh: '**修掉桌面版「切换语言后面板不跟随」**：桌面壳让宿主的语言服务**迟到**提供（它的启动要等原生语言桥，是异步的），而面板只在启动时接一次线，于是桌面版恒中文、在设置里切语言也没反应（web 没有这座桥，一直正常）。现在侧栏入口与面板挂载时都会补接，切语言即时生效',
          en: '**Fixed "the panel does not follow a language switch on Desktop"**: the Desktop shell makes the Host\'s locale service arrive **late** (its startup awaits the native language bridge, asynchronously), and the panel wired itself only once at startup — so on Desktop it stayed Chinese forever and the language setting did nothing (web has no such bridge and always worked). The wiring is now retried when the sidebar entry and the panel mount, so a language switch takes effect immediately',
        },
      },
      {
        text: {
          zh: '已知限制（1.7.2 已修）：技能市场的分类名一度显示为上游中文——后查明上游每个分类本来就给中英两份（name/nameEn），是我们的映射只读了一份、且分类接口的响应形状也解析错了；1.7.2 起分类名按语言显示。技能描述文案不受影响',
          en: 'Known limitation (fixed in 1.7.2): the skill market\'s category names briefly showed as upstream Chinese — it later turned out upstream provides both `name` and `nameEn` per category, and our mapping read only one field while also parsing the categories response shape wrong; from 1.7.2 the category names follow the language. Skill description copy was never affected',
        },
      },
    ],
  },
  {
    version: '1.7.2',
    items: [
      {
        text: {
          zh: '**修掉技能市场「没有分类」**：上游分类接口的真实形状是 `{count, items}`，我们的代码读的却是 `data`——形状从没对上过，分类标签**整个没拉到**，市场只剩「全部」一个按钮（这个 bug 从技能市场上线就在）。测试夹具也一直照抄着错的形状，所以没被发现。现在按真实形状解析，且形状不符时**报错而不是静默返回空**',
          en: '**Fixed the skill market having no categories**: the upstream categories endpoint really returns `{count, items}`, but our code read `data` — the shape never matched, so the category labels were **never fetched at all** and the market showed only an "All" button (this bug had been there since the skill market launched). The test fixture had copied the wrong shape all along, which is why it went unnoticed. It now parses the real shape and **errors instead of silently returning empty** on a mismatch',
        },
      },
      {
        text: {
          zh: '**技能市场分类名有英文了**：上游每个分类本来就给中英两份（`name` / `nameEn`），我们的映射只读了中文那份——和描述文案是同一类错。现在按界面语言挑，切语言时市场会按新语言重拉（分类与描述一起），中文界面行为不变',
          en: '**The skill market\'s category names are now localized**: upstream provides both `name` and `nameEn` per category, and our mapping only read the Chinese one — the same class of mistake as the description copy. It now picks by the interface language, and switching language re-fetches the market (categories and descriptions together) in the new language; the Chinese UI is unchanged',
        },
      },
    ],
  },
  {
    version: '1.8.0',
    items: [
      {
        text: {
          zh: '**工具延迟加载（ToolSearch）上线**：某个 MCP 服务器的工具可以不再每轮常驻上下文——模型先看到一份只列工具名的目录，用内置的 `tool_search` 搜到（关键词或 `select:<确切名字>`）之后，完整参数 schema 才进入它的工具列表。默认不开：逐台勾选，或列表顶部一键「全部延迟」；要把机制整体退回全量注入，设环境变量 `DSH_MCP_TOOL_SEARCH=off`',
          en: '**Deferred tool loading (ToolSearch) is here**: a server\'s tools no longer have to stay resident in context every turn — the model first sees a name-only catalog, and only after `tool_search` finds one (by keyword, or `select:<exact name>`) does its full parameter schema enter the tool list. Off by default: tick it per server, or use "Defer all" above the list; set `DSH_MCP_TOOL_SEARCH=off` to fall back to full injection everywhere',
        },
        where: { zh: '面板 MCP → 服务器行的「延迟」开关 / 列表顶部「全部延迟」', en: 'The panel\'s MCP tab → the "Deferred" switch per server, or "Defer all" above the list' },
      },
      {
        text: {
          zh: '**三个上限可以调了**：一次搜索返回几个工具（默认 10）、目录最多列多少行（默认 300）、已发现集能多大（默认 20）——在「延迟参数」里改，写进 profile patch 的 `config.toolSearch`，**当前会话立即生效**（不需要重启）；与默认相同的值不写盘，所以将来默认值调整时你会跟着走',
          en: '**The three limits are adjustable now**: tools returned per search (default 10), catalog lines (default 300) and discovered-set size (default 20) — change them under "Deferral settings"; they are written into `config.toolSearch` of the profile patch and take effect **in the current session immediately** (no restart). Values equal to the defaults are not written, so a future default change reaches you',
        },
        where: { zh: '面板 MCP → 顶部「延迟参数」', en: 'The panel\'s MCP tab → "Deferral settings" at the top' },
      },
      {
        text: {
          zh: '**目录里只有工具名**：最初的方案是每行附一段用途、在 110 字符处截断；实测 27 个真实工具里 56% 的描述会被切，被切掉的尾巴里 80% 带 `only` / `not` / `when` 这类约束词——`read_file` 与 `read_text_file` 恰恰靠尾巴区分。同一份样本的目录体积从 3401 字符降到 954。没有可调旋钮：`descriptionChars` / `threshold` / `minServerTools` 这些键写进配置会明确报错，不是静默忽略',
          en: '**The catalog lists names only**: the first design appended one line of purpose per row and cut it at 110 characters; of 27 real tools, 56% had their description cut, and 80% of those cut tails carried constraint words like `only` / `not` / `when` — which is exactly how `read_file` and `read_text_file` differ. On that same sample the catalog shrank from 3401 to 954 characters. There are no knobs: `descriptionChars` / `threshold` / `minServerTools` error explicitly if configured instead of being silently ignored',
        },
      },
      {
        text: {
          zh: '**勾了就生效，没有暗门槛**：曾有过两道自动豁免（工具数 ≤10 的服务器不参与延迟、会话里可延迟工具 <15 整套不开，两道都过才生效），实际效果是工具少的服务器勾了也不生效、面板却显示已开启——已去掉。工具少时面板会直说「省下的空间可能不多」，判断权在你手里',
          en: '**Ticking it is enough — no hidden thresholds**: there used to be two automatic exemptions (servers with ≤10 tools skipped, and fewer than 15 deferrable tools switching the whole mechanism off; both had to pass), whose real effect was that low-tool servers stayed resident while the panel said enabled — both are gone. For small servers the panel states plainly that little space is saved, and leaves the choice to you',
        },
      },
      {
        text: {
          zh: '**PTC 会话不再倒贴**：agent 被 preset 设成 ptc 时，宿主的 `tools:sdk` 手册仍列全部 schema，装插件反而多花 3181 字符/请求。现在装配时按已加载集裁那份手册（自检不过就沿用原文）：同一场景 12184 → 5315 字符，真省 3688',
          en: '**PTC sessions no longer lose ground**: when a preset sets an agent to ptc, the host\'s `tools:sdk` manual still listed every schema, so installing the plugin cost 3181 extra characters per request. It is now trimmed to the loaded set at assembly time (falling back to the original text if the self-check fails): 12184 → 5315 characters in the same scenario, a real saving of 3688',
        },
      },
      {
        text: {
          zh: '**支持 DSH 0.2.1 宿主**：两条线之间宿主换了两代 loader（1.0.3 → 1.0.6），启动错误传播与 dispose 写盘行为都变了，插件对两处做了显式适配，两个宿主各跑过一次全量用例',
          en: '**DSH 0.2.1 host support**: the two host lines ship different loader generations (1.0.3 → 1.0.6), whose startup error propagation and dispose write behavior both changed; the plugin adapts to each explicitly, and the full suite runs green on both hosts',
        },
      },
    ],
  },
  {
    version: '1.8.1',
    items: [
      {
        text: {
          zh: '**延迟开关不用再进编辑框了**：列表每一行上都有一颗可直接点的标签——显示「全量」= 这台的工具有常驻上下文，显示「延迟」= 已按需加载，点一下就切，当前会话立即生效。想一次全开/全关仍用顶部的「全部延迟」；只读条目（别的 bundle、项目视图里的全局条目）那颗标签只展示不可点',
          en: '**No need to open the edit dialog to flip deferral any more**: every row now carries a clickable chip — "Resident" means that server\'s tools stay in context, "Deferred" means they load on demand, and one click flips it for the current session immediately. "Defer all" at the top still flips everything at once; read-only rows (other bundles, global entries seen inside a project tab) show the chip without allowing edits',
        },
        where: { zh: '面板 MCP → 服务器行上的「延迟 / 全量」标签', en: 'The panel\'s MCP tab → the "Deferred / Resident" chip on each row' },
      },
    ],
  },
  {
    version: '1.8.2',
    items: [
      {
        text: {
          zh: '**市场页点「移除」不再永远失败**：它把参数包成对象发给宿主，而 `removeServer` 要的是标量，于是每次都被网关拦成 `wire field "name" failed boundary validation`，卡片还把这条错误显示成「读取目录失败」——看着像目录坏了。现在真的会删掉；失败时标题也改成「移除失败」',
          en: '**"Remove" in the market no longer fails every time**: it wrapped the argument in an object while `removeServer` takes a scalar, so the gateway rejected every attempt with `wire field "name" failed boundary validation` — and the card rendered it as "failed to read catalog", as if the catalog were broken. Removal now actually happens, and a failure is titled "failed to remove"',
        },
        where: { zh: '面板 MCP → 发现市场 → 已配置卡片上的「移除」', en: 'The panel MCP tab → Discover → "Remove" on an installed card' },
      },
      {
        text: {
          zh: '**同名条目不再把整行锁死**：一个 serverName 在 loader 里出现多条（别的 bundle 提供、或更早的配置写重复了）时，编辑、停用、重连、移除以前全部灰掉、只留一句「冲突，只读」。现在写操作按条目 id 只落到属于当前 profile 的那条，详情里点名另一条的 id 与状态；移除之后还会说明「另一条没动、要重启宿主才会重新连接」',
          en: '**Same-named entries no longer lock the whole row**: when one serverName shows up as several loader entries (another bundle provides one, or an older config left a duplicate), edit/disable/reconnect/remove used to be greyed out with a bare "conflict, read-only". Writes now target only the entry owned by the current profile, matched by id; the detail pane names the other entry and its state, and after a removal it says the other one was left untouched and only retries after a host restart',
        },
        where: { zh: '面板 MCP → 全局 → 服务器详情', en: 'The panel MCP tab → Global → server detail' },
      },
      {
        text: {
          zh: '**技能市场的分类名跟着界面语言走**：分类接口的契约少声明了一个参数，`locale` 在发出之前就被客户端按实参个数拦下、错误又被提示层吞掉，于是英文界面里分类名一直是中文',
          en: '**Skill-market category names follow the UI language**: the category endpoint declared one parameter too few, so `locale` was rejected client-side on argument count before the call went out and the error was swallowed — English UIs kept showing Chinese category names',
        },
        where: { zh: '技能 → 市场 → 顶部分类', en: 'Skills → Market → the category strip' },
      },
      {
        text: {
          zh: '**仓库的 latest 回到本线**：旧包 `dsh-mcp-manager-ui` 已冻结在 1.5.5，而 DSH 0.2.1 对它是硬不兼容（两条线的 peer 窗口互斥），继续把 Release 标成 pre-release 只会让仓库首页指向一个装不上的包；从这一版起 `releases/latest` 指向 dsh-toolbox-ui',
          en: '**The repository latest is back on this line**: the legacy package `dsh-mcp-manager-ui` is frozen at 1.5.5 and DSH 0.2.1 is hard-incompatible with it (the two peer windows are disjoint), so keeping releases marked pre-release only pointed the repo home page at a package nobody can install; from this version on `releases/latest` means dsh-toolbox-ui',
        },
      },
    ],
  },
  {
    version: '1.8.3',
    items: [
      {
        text: {
          zh: '**有项目 MCP 的工作区，新建会话不再卡顿**：项目工具要在每个会话自己的层里再登记一遍，而以前的实现把「工具表变了」当成「每次事件都重读全表」——207 个工具的服务器上一次重算要 27 ms，而且是每个事件、每个存活会话各算一遍，所以新建一个会话十几秒都回不来。现在按连接「换代」缓存：定义没换就一次读取都不付，实测 8 个会话下一次工具变化从 33–42 ms 降到 1 ms 以内',
          en: '**New sessions no longer stall in workspaces with a project MCP**: project tools have to be re-registered in each session\'s own layer, and the old implementation treated every "tool table changed" event as "re-read the whole table" — 27 ms per recompute on a 207-tool server, once per event and once per live session, which is why creating a session could hang for many seconds. It is now cached per connection generation: nothing is read while the definitions are unchanged, and one tool change across 8 live sessions went from 33–42 ms to under 1 ms in our measurements',
        },
        where: { zh: '面板 MCP → 项目 → 装了项目级 MCP 的工作区里新建会话', en: 'The panel MCP tab → Projects → creating a session in a workspace that has project-level MCP servers' },
      },
      {
        text: {
          zh: '**重连 / 改完配置之后，会话里的工具不再是「死的」**：旧实现只按工具名字对账，连接换代后会话里留着的是指向**已经关掉的连接**的旧定义，调用直接失败、而且看不出哪里不对。现在按定义对象本身对账，连接换了就换成新的那一版',
          en: '**Tools in a session are no longer dead after a reconnect or a config change**: the old implementation reconciled by tool name only, so after a connection was rebuilt the session kept definitions pointing at the closed connection — calls just failed, with nothing to point at. Reconciliation is now by the definition object itself, so a new connection means new definitions',
        },
        where: { zh: '面板 MCP → 项目 → 「重连」或改完配置之后', en: 'The panel MCP tab → Projects → after "Reconnect" or after editing the config' },
      },
      {
        text: {
          zh: '**工具不会再有「时灵时不灵」的整批消失**：读不到作用域工具视图时，以前会被当成「这台服务器现在一个工具都没有」，于是把会话里已装的工具全部卸掉，等下一次变化再装回来。现在读不到就保持原状，只在面板上记下原因',
          en: '**Project tools no longer vanish in batches**: when the scoped tool view failed to read, it used to be treated as "this server now has zero tools", which unregistered everything the session had and put it back on the next change. A failed read now leaves the current tools alone and only records the reason in the panel',
        },
        where: { zh: '面板 MCP → 项目（作用域读取失败时的提示）', en: 'The panel MCP tab → Projects (the notice shown when the scoped read fails)' },
      },
    ],
  },
  {
    version: '1.9.0',
    items: [
      {
        text: {
          zh: '**延迟工具目录默认不再自己设上限**：以前目录最多列固定长度的工具名，超出部分只留一句「另有 N 个」——工具特别多时，模型可能拿着一张半截地图就去回答「没有这个能力」。现在默认**全部列出**（目录只放工具名，本身很小），「延迟参数」里新增一个**默认关闭**的「限制目录大小」开关，真要压上下文时再自己给数',
          en: '**The deferred tool catalog no longer caps itself by default**: it used to list a fixed amount of tool names and reduce the rest to "N more", so with very many tools the model could answer "that capability does not exist" from half a map. It now lists **every** tool (names only, so it stays small), and the deferral settings gain a "Limit catalog size" switch that is **off by default** for when you do want to trim context',
        },
        where: { zh: '面板 MCP → 顶部「延迟参数」', en: 'Panel → MCP → "Deferral settings" at the top' },
      },
      {
        text: {
          zh: '**搜索落空时不再指错方向**：`select:` 写了个不存在的名字时，以前会把「未命中」说成「schema 都齐了，直接调」，改口之后又说成「换个关键词」——两种都不对。现在按查询形态分开回执：名字不对就说名字不对，并讲明只能逐字复制、这个名字不在目录里；用点或空格把服务器和工具连起来写的（如 `browser.capture_network`），只要真能对上现有工具就直接认',
          en: '**A failed search no longer points the wrong way**: when `select:` named a tool that does not exist, the reply used to claim "these schemas are complete, call it directly", and after that fix it told the model to rephrase keywords — both wrong. The reply now depends on the query form: a bad name is reported as a bad name, with the note that names are matched character for character and that this one is not in the catalog; a name written as server-dot-tool (or with a space) is resolved directly when it maps to an existing tool',
        },
        where: { zh: '`tool_search` 搜空时的回执', en: 'The reply when `tool_search` finds nothing' },
      },
    ],
  },
  {
    version: '1.10.0',
    items: [
      {
        text: {
          zh: '**没有可搜的工具时，`tool_search` 不再出现**：以前即使把所有 MCP 都停用、或把工具全设成常驻，搜索入口照样发给模型——它看见就搜一次空目录，白花一轮。现在只有真有工具被延迟时它才出现，一旦全部常驻/停用就随之消失',
          en: '**`tool_search` no longer appears when there is nothing to search**: previously the search entry was sent to the model even with every MCP disabled or every tool resident, so it would search an empty catalog and waste a round. It now appears only while at least one tool is actually deferred, and disappears as soon as everything is resident or disabled',
        },
        where: { zh: '面板 MCP / 「工具」页：全部常驻或全部停用时', en: 'Panel MCP / "Tools" page: with everything resident or disabled' },
      },
      {
        text: {
          zh: '**改配置不再"看着成功、其实没生效"**：保存一条 MCP 之后，面板现在会分开告诉你两件事——**写进配置了吗**、**运行中的连接真按新配置起来了吗**。以前这两件事共用一句「已更新」，于是宿主的更高层配置压着同一个条目时，你会看到保存成功的提示而行为没变',
          en: '**Saving a config no longer "looks successful" while nothing changed**: after saving an MCP entry the panel now tells you two separate facts — **was it persisted** and **did the running connection actually restart with it**. The two used to share one "updated" message, so when a higher configuration layer overrode the same entry you got a success message with unchanged behavior',
        },
        where: { zh: '面板保存后的回执；行内延迟/启用开关同样适用', en: 'The reply after saving in the panel; the per-row deferral and enable switches behave the same' },
      },
      {
        text: {
          zh: '**写盘与应用走同一条路**：改动不再由插件自己拼一套 loader 条目，而是把整份 profile 组合交给宿主官方入口应用一次。代价是多了一次「最终有效配置」的判定，收益是不再出现"盘上写的是 A、运行中是 B"——这一轮面板里那种"看起来正常、策略是反的"问题就是这条链路上漂出来的',
          en: '**One path from disk to runtime**: changes are no longer assembled into loader entries by the plugin; the whole profile composition is applied once through the host\'s official entry point. The cost is one extra "final effective configuration" check; the payoff is no more "disk says A, runtime does B" — the "looks fine, policy is inverted" class of bugs in the panel came from exactly that drift',
        },
      },
      {
        text: {
          zh: '**两代宿主同一份包**：`0.2.1-rc.5`（旧 Include / Loader 1.0.6）与 `0.2.2-rc.1`（新 Include journal / Loader 1.1.0）都用这一版，工具延迟加载、MCP 管理、技能管理在三者上行为一致；文档里写的是实际跑过的组合，不是推测',
          en: '**One package for two host generations**: `0.2.1-rc.5` (legacy Include / Loader 1.0.6) and `0.2.2-rc.1` (journaling Include / Loader 1.1.0) both run this release, with identical deferred-loading, MCP and skills behavior. The docs state combinations that were actually exercised, not guesses',
        },
      },
    ],
  },
  {
    version: '1.10.1',
    items: [
      {
        text: {
          zh: '**上层只改了 `env` 也会被发现**：保存 MCP 时的覆盖判定从"条目在不在、`disabled` 对不对"升级为整份 `config` 深比较。以前更高层只改了一个字段，条目仍在、开关也对，面板就判"算数"并提示保存成功，而你拿到的是被覆盖后的配置',
          en: '**An override that only changes `env` is now caught**: the override check on save compares the whole `config` instead of just "is the entry there and is `disabled` right". Previously a higher layer changing a single field left the entry present and the switch correct, so the panel reported success while you got the overridden configuration',
        },
        where: { zh: '面板保存 MCP 之后；带表达式的行仍只验存在与开关', en: 'After saving an MCP in the panel; rows with expressions still verify only presence and the switch' },
      },
      {
        text: {
          zh: '**保存回执以宿主的话为准**：写盘成功、运行中没生效时，面板显示宿主给的原因，而不是一句固定的「已保存」；`live: failed` 按错误样式显示',
          en: '**The save reply now uses the host own words**: when the write succeeded but did not take effect at runtime, the panel shows the reason the host gives instead of a fixed "saved", and `live: failed` is rendered as an error',
        },
        where: { zh: '面板保存后的回执；行内延迟/启用开关同样适用', en: 'The reply after saving in the panel; the per-row deferral and enable switches behave the same' },
      },
      {
        text: {
          zh: '**PTC 会话的搜索结果重新带上返回类型**：呈现模式改为装配时判定并按 agent 记录，执行时读回。此前现代宿主上恒判 native，模型在 `run_code` 里调用工具时拿不到返回类型签名，能力面却仍报 ready',
          en: '**Search results in PTC sessions carry the return type again**: the presentation mode is decided once at assembly time, recorded per agent, and read back when executing. On modern hosts it used to fall back to native, so tools called from `run_code` had no return-type signature while the capability surface still reported ready',
        },
        where: { zh: 'PTC（`run_code`）会话里的 `tool_search` 结果', en: '`tool_search` results inside PTC (`run_code`) sessions' },
      },
      {
        text: {
          zh: '**「目录上限」输入框不再消失**：关闭限制时置灰保留，并显示建议起点 12,500。卸载会让表单跳一下，你也看不出这一项原本是什么',
          en: '**The catalog-size input no longer disappears**: turning the limit off now greys it out instead of unmounting it, with the suggested 12,500 shown. Unmounting made the form jump and hid what the field used to be',
        },
        where: { zh: '面板「工具加载」页的搜索参数', en: 'The search parameters on the panel "Tool loading" page' },
      },
      {
        text: {
          zh: '**延迟芯片、切换方向与概览计数读同一个值**：三处统一读"统一策略下的实际状态"。以前芯片显示实际状态、切换方向读旧字段，点一颗写着「延迟」的芯片，方向却是"再打开一次延迟"——没反应却提示成功；`setDefer` 现在也会在策略压过服务器开关时如实报告',
          en: '**The deferral chip, the toggle direction and the overview count read one value**: all three use the effective state under the unified policy. The chip used to show the effective state while the toggle read the older field, so clicking a chip labelled "deferred" asked to defer it again — no change, yet a success message. `setDefer` also reports honestly when policy overrides the per-server switch',
        },
        where: { zh: '面板 MCP 列表的延迟芯片与「全部延迟」', en: 'The deferral chips and "defer all" in the MCP list' },
      },
    ],
  },
]

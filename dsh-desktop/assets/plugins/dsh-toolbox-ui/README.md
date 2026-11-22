<p align="center">
  <img src="docs/images/logo.svg" width="104" height="104" alt="dsh-toolbox-ui">
</p>

<h1 align="center">dsh-toolbox-ui</h1>

<p align="center">DeepSeek Harness Web 的 <b>MCP</b>、<b>技能</b>与<b>工具加载</b>管理面板</p>

<p align="center">
  <a href="https://www.npmjs.com/package/dsh-toolbox-ui"><img src="https://img.shields.io/npm/v/dsh-toolbox-ui" alt="npm"></a>
  <a href="https://www.npmjs.com/package/dsh-toolbox-ui"><img src="https://img.shields.io/npm/dm/dsh-toolbox-ui" alt="downloads"></a>
  <a href="https://github.com/Imzl-zl/dsh-toolbox-ui/actions/workflows/ci.yml"><img src="https://github.com/Imzl-zl/dsh-toolbox-ui/actions/workflows/ci.yml/badge.svg" alt="ci"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/dsh-toolbox-ui" alt="license"></a>
  <img src="https://img.shields.io/badge/DSH-%E2%89%A50.2.1--rc.5-blue" alt="DSH >= 0.2.1-rc.5">
</p>

<p align="center"><b>中文</b> | <a href="README.en.md">English</a></p>

点右下角悬浮按钮或侧栏「工具箱」打开，面板浮在会话之上——改配置、看技能，都不打断正在进行的对话。三个能力面在同一个面板里切换：**MCP**、**技能**与**工具**。

> 面板本身跟随 DSH 的界面语言：DSH 设成 English 时，面板里的文案、按钮与状态一律是英文（词典在 `lib/client.js` 的 `EN_DICT`）；设成中文或宿主没有语言服务时，显示中文原文。**语言开关在 DSH 里，不在面板里**：设置 → 通用 → 语言。面板刻意不设自己的开关——语言只有宿主一个真相源，两套开关必然对不上。没手动选过语言时，宿主按**浏览器语言**推断（浏览器是英文，面板就是英文；这时去设置里选一次中文即可，之后记住该选择）。

## 界面预览

### MCP 市场

![MCP 市场](docs/images/mcp-market.png)

47 个逐条一手核实过的服务，分 10 类；搜索为主操作，配「只要免密钥」筛选与排序。每条如实标注免费额度、要准备什么（密钥 / 连接信息 / 装完还得改的参数），卡片直接安装；已配置的只识别并跳过。

### 工具页

![工具页](docs/images/tools-overview.png)

内置工具按用途分组排在前面，MCP 按服务器分组排在后面；搜索设置固定在页面顶部，所有组默认收起，顶部可按类型与加载方式筛选。

### 技能面板

![技能面板](docs/images/skills-overview.png)

看本机每个技能的**真实作用域**与同名遮蔽，启停、删除、读正文与诊断，并一键切换「模型自动调用」——它直接改 `SKILL.md` 的 `disable-model-invocation`，只动那一行。

## ToolSearch 效果

同一套 MCP，只切换 ToolSearch：

<p align="center">
  <img src="docs/images/toolsearch-off.png" alt="未启用 ToolSearch：工具定义 89.9K，上下文已用 115K" width="440">
  <img src="docs/images/toolsearch-on.png" alt="启用 ToolSearch：工具定义 9.4K，上下文已用 21.3K" width="440">
</p>

工具定义从 **89.9K** 降到 **9.4K**：少 **80.5K（-89.5%）**，约 **9.6×**；整段上下文占用从 **115K** 降到 **21.3K**，少 **93.7K（-81.5%）**。工具多的时候，省下来的是每一轮都要付的钱。

## 特性

**MCP 面**

- 逐条看状态、传输方式、连接参数与**已注册的工具**；展开工具可看完整输入 JSON Schema（必填/可选、类型、枚举、默认值）
- 启停、重连、添加、编辑、移除；凭据类字段默认掩码，点眼睛临时揭示有效运行值并一键复制
- **全局 + 项目双作用域**：全局写 Web profile（所有项目可用），项目写该项目 `.dsh/mcp.json`（只该项目会话可见）；项目里还能「屏蔽」某个全局 MCP
- 从本机其他客户端**导入**：Claude Code、Codex、OpenCode、pi、Claude Desktop、Cursor、Windsurf、VS Code、Gemini CLI、Roo Code 与跨工具共享配置，也能直接粘贴 JSON；写入前预览，支持「合并」与「替换」
- **跨工作区搬运**：把本项目的 MCP 复制到另一个已注册工作区（在宿主内完成，凭据不经过浏览器），或导出成 JSON 备份 / 分享
- **工具分组与批量**：「工具」页全页可多选（内置 / MCP / 其他）；动作条对勾选集合或当前筛选结果一键设常驻/按需/跟随，可一步撤销；「存为分组」把这一批保存成自定义分组（组级默认 + 逐工具例外，新成员自动继承）。分组写在 profile patch 的 `config.customGroups`，是全局配置，项目作用域只读
- **工具延迟加载（ToolSearch）**：让某个服务器的工具不再每轮常驻上下文——模型先看到一份**只列工具名**的目录，用内置的 `tool_search` 搜到（关键词或 `select:<确切名字>`）之后，完整参数 schema 才进它的工具列表并可直接调用。默认不开：行上的「延迟 / 全量」芯片改的是**整台默认**（写组级策略），模型实际看到多少还要看工具页里的逐工具覆盖；环境变量 `DSH_MCP_TOOL_SEARCH=off` 整体退回全量注入。选成「按需」的工具，模型要先经 `tool_search` 拿到 schema 才能用；没有可搜的工具时搜索入口本身不出现。机制的三个上限在工具页**顶部**的「搜索设置」里调，写进 profile patch 的 `config.toolSearch`

**工具面**

- **内置工具在前，按用途分组**：文件 / 命令与终端 / 网络 / MCP 资源 / 任务与后台 / 子代理与团队 / 技能与交互 / 定时 / 代码与工作区 / 宿主与插件；MCP 工具按服务器分组排在后面，未知名字单列「其他插件与未识别」。所有组默认收起，顶部可按**类型**（全部 / 内置 / MCP / 其他）与**加载方式**（全部 / 常驻 / 按需 / 有覆盖）筛选
- **每行三态，跟随谁写清楚**：MCP 行是「跟随服务器 / 常驻 / 按需」，内置行是「宿主默认 / 常驻 / 按需」，项目覆盖是「跟随全局（当前值）」。选「跟随 / 默认」就删掉覆盖键，任何时候都能退回上一级；整台默认只在 MCP 列表的芯片（`groups`）上改，本页只写逐工具（`tools`）
- **搜索设置固定在顶部**：`maxResults`、`maxDiscovered` 与默认关着的「限制目录大小」（`maxCatalogChars`）都在页面顶部常驻可见，保存写进 profile patch 的 `config.toolSearch`，当前会话立即生效。`mode` 只由配置文件决定；被它压住时页面给横幅，不提供第二个开关

**技能面**

- 真实作用域与同名遮蔽：同名技能跨作用域是合法配置，面板逐条列出并标出哪一份生效
- 启停（写技能文件里的两个调用面字段，**不动文件本身**）、删除、读正文与诊断——「技能不生效」的原因直接摆在面板里
- **「模型自动调用」开关**：直接改 `SKILL.md` 的 `disable-model-invocation`，关掉=删掉那一行（开→关能逐字节还原原文）；状态一律取自技能文件本身，读不出来就说「未知」而不是猜一个值
- **定位按磁盘上的真实位置**（不按技能名）：文件/目录名与 frontmatter 的 `name` 不一致的技能照样能读、能启停、能删
- 市场接 [skillhub.cn](https://skillhub.cn)：安装前披露发布方认证与安全扫描结论，并要一次**显式确认**（该确认在服务端校验）

**上下文面**

- **一块面板回答"下一轮请求里上下文被谁占着"**：总量取模型报的真值（已用 / 上限 / 还剩多少 / 占比 / 大约还能发几条 / 缓存命中与新增），构成分五类——系统提示词、工具定义、工具结果、附件、会话内容
- **按轮与按工具合计**：会话内容按轮合并，工具结果按工具名合并（`pwsh ×341`、`read ×67`），所以"哪个工具最费上下文"一眼能看出来；明细可按分类筛选，另有"每轮用掉多少"的小柱图
- **两种视图**：块图按**固定分类顺序分列**、剩余空间固定在最右（列宽就是值的占比，小到看不见的类只留一条可见的边）；网格视图把同一份构成长成一格格等量方块，回答"一共多少格、填了多少"
- **工具卡**：这次请求带上了多少个工具、它们占多少上下文、本会话搜了几次工具（按名 / 关键词分开）
- **只看正在运行的会话**：不做历史会话列表（那是侧栏的职责）；有多个会话同时在跑时可切换，选择器带**工作区名**；没有会话在跑时说清"为什么空着、怎么让它有数字"
- **估算与真值分开**：构成是估算、总量是真值，两者本来就不相等——面板用等比换算把构成缩放到真实总量（构成内比例不变，数字加起来与上面的一致），且只在这一类有价时换算；数字还会标明是哪一刻的（"上一轮"还是"最近一轮"）

**公共**

- 入口三选一：右下角悬浮按钮（可拖拽、记忆位置）+ 侧栏「工具箱」；可以只留一个，不能都关
- 跟随 DSH 深色/浅色主题，适配窄屏与移动宽度
- 更新提示与一键升级：每天最多查一次 npm、可关闭、**绝不自动升级**；升级后弹一次「本次更新内容」，不联网

## 安装

```sh
# 推荐：npm 安装 —— 之后 `dsh plugin update` 在 ^1.x 内自动升小版本
dsh plugin --profile web add dsh-toolbox-ui@^1.13.2

# 或固定 GitHub release tag（不自动跨版本，升级要换 tag 重新 add）
dsh plugin --profile web add github:Imzl-zl/dsh-toolbox-ui#v1.13.2
```

装完**重启 `dsh web`**。卸载（不会删除 profile 里已有的 MCP 条目）：

```sh
dsh plugin --profile web remove dsh-toolbox-ui
```

> 不要把 `mcp-manager-ui` 手工插进 profile 的 `cordis.patch.yml`、Agent preset 或额外的 `--patch` 文件——插件命令已经完成这件事，重复装配会明确报错。

## 升级

```sh
dsh plugin --profile web update dsh-toolbox-ui
```

面板顶部有新版时会显示可关闭的提示条，点「升级」走 DSH 官方的 pluginManager。

> ⚠️ **1.6.1 及更早的版本不会提示 1.6.2 及之后的新版。** 它们的更新检查读的是本仓库的 release feed，而那段时间该 feed 的 latest 被另一条产品线（已冻结在 1.5.5 的旧包）占着，于是永远显示「已是最新」。这个缺陷在 1.6.2 修掉了（改成查**本包在 npm 上的 latest**），修复只能装在新版里——所以请**手动升一次**，之后就恢复正常：
>
> ```sh
> dsh plugin --profile web update dsh-toolbox-ui
> ```
>
> 仍装着旧包 `dsh-mcp-manager-ui`（≤1.5.5）的话走**迁移**：1.5.5 面板顶部有一条常驻提示，点「迁移」即装本包、卸掉旧包。若面板里的「升级」按钮报 `ERR_PNPM_NO_MATCHING_VERSION`，那是旧线的升级源已停用（本仓库的 latest 自 v1.8.2 起指向本包），直接用两条命令：
>
> ```sh
> dsh plugin --profile web remove dsh-mcp-manager-ui
> dsh plugin --profile web add dsh-toolbox-ui
> ```
>
> 详见[安装与升级](docs/installation.md)。

## 快速上手

**打开面板**：右下角悬浮按钮，或侧栏底部「工具箱」。面板浮在会话之上，按 Esc 或点「关闭」收起，不影响会话。

**两个作用域**：

| 标签页 | 存哪 | 谁可见 | 改动何时生效 |
|---|---|---|---|
| 全局 | Web profile 的 `cordis.patch.yml` | 所有项目 | DSH 热加载，通常立即生效 |
| 某项目 | 该项目 `.dsh/mcp.json` | 只该项目会话 | **写盘即生效**，不需重开会话或重启 Host |

`serverName` 按作用域判重：不同项目之间、全局与项目之间**可以同名**，各自独立连接；同一作用域内不能重名。

**加 MCP**：面板顶部「添加 MCP」填表单，「导入 MCP」粘贴其他客户端的配置（先预览再写入）。常用服务器有预设模板。

## 常见问题

**项目里的改动什么时候生效？** 保存的那一刻就对齐到正在运行的会话：新增立刻挂上存活会话、删除立刻撤掉工具、改动就地重载连接——不需要重开会话，也不需要重启 Host。手工编辑 `.dsh/mcp.json` 则在**下一次会话挂载**时被采纳。

**连接跟配置走，不跟会话走。** 最后一个会话结束不会拆掉连接，它只进入空闲等待，下一次会话直接复用——「要用的时候」它已经就绪。两个旋钮写在 server 条目里：`idleTimeoutMs`（空闲保留多久，默认 5 分钟，`0` = 永不回收）与 `readyTimeoutMs`（挂载时等就绪的总预算，默认 5s，`0` = 不等）。字段速查见[设计与限制](docs/design.md#项目级专有字段dshmcpjson-里每个-server-可写)。

**项目行那些状态文案是什么意思？** 它们把两件独立的事分开说：**连接在不在**（`已连接 · 当前无会话使用（连接保留，下次直接用）` / `已连接 · N 个会话在用` / `连接中…` / `连接失败` / `尚未建立连接（新会话自动挂载）`）与**几个会话在用**——不再有「待会话挂载」那种把两者压成一句、容易被读成「还没连上」的合成状态。

**面板显示「已禁用」，模型却报 `unknown tool "mcp__xxx__…"`？** 那个 MCP 被禁用了，所以它没有注册任何工具。在面板里点「启用」即可。

**「延迟」打开后，模型还找得到那些工具吗？** 找得到，但不是靠全量可见：提示词里只有一份**只列工具名**的目录加一句引导（没有描述、也没有参数 schema），模型用 `tool_search` 按关键词或 `select:<确切名字>` 命中后，完整 schema 才进工具列表、之后可直接调用；凭记忆直调尚未加载的工具会被拒绝，拒绝里给出**确切的那条查询串**，照抄即可。工具只有两三个的服务器开了省不下什么（每轮仍要付一段引导语），工具多的才划算。要整体退回全量注入：环境变量 `DSH_MCP_TOOL_SEARCH=off`。注意行上那颗「延迟 / 全量」芯片显示的是**整台默认**（组级策略；没有组级值时回落到旧 `defer` 或方案）。点它只改这一层；逐工具覆盖在「工具」页里，芯片旁会标出「N 单独设置」。

**单台怎么开，在哪儿开？** 列表每一行都有一颗芯片：显示「全量」/「延迟」= 这台服务器的**默认**加载方式，**点它就切**（写的是组级策略，不是旧 `defer`）。芯片旁若有「N 单独设置」，说明工具页给其中 N 个工具设了例外，那些工具不跟随整台默认——去「工具」页那台服务器的组里改。想一次全开/全关用列表顶部的 ⚡「全部延迟」，它同样只改整台默认。

**三个上限在哪儿调？** 面板 → 工具 → **页面顶部**的「搜索设置」：`maxResults`（一次搜索最多返回几个工具，默认 10）、`maxDiscovered`（已发现集上限，默认 20）；另外有一个**默认关着**的「限制目录大小」开关（`maxCatalogChars`）——关着就是全部工具都列进目录，只有工具特别多、又想压上下文时才需要打开它（打开时预填 12500，那只是建议起点）。保存后写进 profile patch 的 `config.toolSearch`，**当前会话立即生效**（不需要重启）；与默认相同的值不写盘，所以将来默认值调整时你会跟着走。也可以直接手写这段配置，改完重启 `dsh web` 生效——⚠️ 拼错键会让插件**加载失败并报出具体路径**（不是静默忽略），改对再重启即可。

**「挂载失败」「连接失败」「作用域隔离失败」怎么区分？** 三件不同的事：**挂载失败**=会话挂载阶段就没挂上；**连接失败**=`mcp-client` 连不上或重连耗尽；**作用域隔离失败**=连接正常但工具不在共享作用域层。详情页会给具体原因，排查见[设计与限制](docs/design.md#连接状态语义)。

**会碰到我的其他配置吗？** 不会。全局改动只动由 `@deepseek-ai/dsh-mcp-client` 声明、且由本插件管理的条目，保留其他插件条目、注释与 `!!js` 表达式；卸载也不会删除你已有的 MCP 条目与项目的 `.dsh/mcp.json`。

## 兼容性

| 项目 | 已验证 |
|---|---|
| DeepSeek Harness | 支持准入从 `0.2.1-rc.5` 起；已验证 `0.2.1-rc.5`（Cordis 4.0.5 / Loader 1.0.6）、`0.2.2-rc.3` 与 `0.2.2-rc.5`（两者同为 Cordis 4.1.0 / Loader 1.1.0）。旧宿主仅保留历史回归，不属于当前发布支持面。 |
| Node.js | DSH 自带/支持的运行时 |
| 平台 | Windows；Linux/macOS 使用同一 DSH Web 契约 |

当前发布支持从 **0.2.1-rc.5** 起：ToolSearch 的 0.2.1 兼容适配与 0.2.2 的 step-owned toolSet / 独立 executor 路径均已覆盖。更早宿主只保留历史 loader 回归，不再作为发布准入；新版 Loader/Include 生命周期按目标宿主整套验证。0.2.2 的每个候选版本（rc.3、rc.5）各按该版宿主自己声明的 Cordis/Loader 组合在独立安装树上跑一腿全量，任一腿红都不发版。

## 开发

```sh
npm test        # 全部测试（含真机集成用例：真 cordis / dsh-tools / dsh-scope / dsh-mcp-client + 真 stdio MCP 子进程）
dsh web         # 起 Web 做真实操作验证
```

## 文档

中文版与英文版内容一致，`.en.md` 是英文版。两份在开头互链；文内目录锚点**各按自己语言的标题生成**（中文锚点在英文文档里解析不到，反之亦然），跨文档链接指向对应语言的那一份。

- [安装与升级](docs/installation.md) —— 三种安装方式、发布流程、故障排查（[English](docs/installation.en.md)）
- [技能管理](docs/skills.md) —— 作用域与遮蔽、启停、调用权限、技能市场（[English](docs/skills.en.md)）
- [JSON 导入](docs/json-import.md) —— 字段映射与限制（[English](docs/json-import.en.md)）
- [项目级 MCP 生命周期](docs/project-mcp-lifecycle.md) —— 挂载、共享连接与作用域对齐（[English](docs/project-mcp-lifecycle.en.md)）
- [设计与限制](docs/design.md) —— 共享连接模型、连接状态语义、已知限制、依赖细节（[English](docs/design.en.md)）
- [DeepSeek Harness 官方插件发布指南](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)

## 友情链接

<p align="center">
  <a href="https://linux.do/" title="LINUX DO"><img src="docs/images/linux-do-logo.svg" alt="LINUX DO" width="44" height="44"></a><br>
  <a href="https://linux.do/">LINUX DO</a>
</p>

## License

MIT

# dsh-zcode-migrate

把 **zcode CLI 的历史会话**迁移成 **dsh（DeepSeek Harness）原生会话日志**。迁移产物直接落在 dsh 的会话目录里，dsh 无需任何适配就能识别、浏览、恢复（resume）它们。

参考实现：[yanggenjie/zcode-data-archive](https://github.com/yanggenjie/zcode-data-archive)（把 zcode 导出为 pi 格式 / HTML 预览站 / 归档报表）。本项目是同一件事的 **dsh 版本**，并且做成了 dsh 插件。

本仓库是该插件的独立主页；它同时被内置在 [DSH Desktop](https://github.com/myYangyunfan/dsh_desktop)（桌面客户端）里作为伴随插件开箱可用——两处的代码同源，独立仓库便于单独安装与跟踪改动。

**零第三方依赖**，只用 Node 内置模块（`node:sqlite`、`node:zlib`），`npm ci` 不需要装任何东西。

**先看这个** → [快速上手（三步）](#快速上手在-dsh-里三步) · [排障](#排障)

---

## 目录

- [它做了什么](#它做了什么) —— zcode 与 dsh 的数据模型差异、产物为什么能被直接读到
- [安装](#安装) · [配置项](#配置项)
- [用法](#用法)
  - [快速上手（在 dsh 里，三步）](#快速上手在-dsh-里三步)
  - [页面上每个按钮](#页面上每个按钮)
  - [迁移后会话去哪了：工作区归组](#迁移后会话去哪了工作区归组)
  - [排障](#排障)
  - [模型可调用工具](#在-dsh-里模型可调用工具) · [斜杠命令](#斜杠命令) · [命令行](#命令行不启动-dsh-也能用)
- [映射规则](#映射规则) —— zcode 消息模型 → dsh 事件流的逐条对应
- [验证](#验证) —— 怎么证明产物真的能被 dsh 读
- [设计说明](#设计说明) · [已知边界](#已知边界) · [License](#license)

---

## 它做了什么

zcode 和 dsh 都用 SQLite/文件记录会话，但两边的**数据模型根本不同**：

| | zcode | dsh |
|---|---|---|
| 存储 | `~/.zcode/cli/db/db.sqlite`（session / message / part 三张表） | `~/.dsh/sessions/<项目>/<会话>/session.jsonl.zstd` |
| 模型 | **物化转录**：一串消息，每条自带内容片段 | **事件溯源日志**：追加式事件流，历史由回放推导 |
| 工具结果 | 挂在发起它的 assistant 消息里（`part.state.output`） | 独立的 user 角色 surface 事件（`tool/result`） |
| 轮次/步骤 | 隐含在消息顺序里 | 显式的 `turn/start`、`step/start`、`step/end`、`turn/end` 边界 |

所以迁移不是改个后缀，而是**换模型**。本项目做的就是把前者翻译成后者，并且翻译到 dsh 自己的读取器完全认不出来的程度。

### 为什么产物能被 dsh 直接读到

dsh 的 JSONL 持久化后端把每个会话存成：

```
<root>/--<归一化 cwd>--/<编码后的会话 id>/session.jsonl.zstd
```

文件内容是**拼接的带校验和 zstd 帧，每帧一条 JSONL 记录**，首帧第一条是 v0 会话头。

`core/paths.js` 与 `core/zstdlog.js` **逐字节复刻**了这套规则（`projectKey` / `encodeSegment` 直接移植自 `@deepseek-ai/dsh-session-persistence-jsonl`），因此产物与 dsh 自己写出的文件在磁盘上同构——包括 zstd 帧描述符位（`singleSegment=false`、`checksum=true`）、CJK 路径的 `~XXXX` 转义、以及 Windows 路径长度处理。

---

## 安装

```bash
git clone https://github.com/myYangyunfan/zcode22dsh.git
dsh plugin --profile web add ./zcode22dsh     # 装进某个 profile（web / tui / …）
```

也可以直接用本地路径（开发时更顺手）：

```bash
dsh plugin --profile web add /path/to/dsh-zcode-migrate
```

装完**重启 dsh**，然后确认两半都到货：

- 宿主半（工具/路由）：在会话里说「用 zcode 工具侦察一下」，模型应该能调 `zcode_inspect`；
- 客户端半（设置页）：**设置 → zcode 迁移** 里能看到这个页面。

只出现设置页、没有工具/命令，通常说明插件被当成「bundle 类」加载了 —— 见文末
[内置注意事项](#内置注意事项改这个插件前必读) 第 1 条。

用 DSH Desktop 的话不用手动装：该插件已内置，开箱即用。

**零第三方依赖**：只用 Node 内置的 `node:sqlite`（≥22.5）与 `node:zlib` 的 zstd（dsh 自身也依赖它，所以运行 dsh 的环境必然具备）。

或者在 profile 的 patch 层里插入本插件（见 `cordis.patch.yml`）：

```yaml
- insert:
    - id: zcode-migrate
      name: 'dsh-zcode-migrate'
      config:
        dbPath: ~/.zcode/cli/db/db.sqlite
        dshRoot: ~/.dsh/sessions
        includeSubagents: false
        snapshot: true
        agentPreset: standard
        slashCommand: true
```

### 配置项

| 字段 | 默认 | 含义 |
|---|---|---|
| `dbPath` | `~/.zcode/cli/db/db.sqlite` | zcode 会话库路径 |
| `dshRoot` | `~/.dsh/sessions` | dsh 会话根目录（产物写到这里） |
| `includeSubagents` | `false` | 是否默认迁移子代理会话（子代理数量通常是顶层的好几倍） |
| `snapshot` | `false` | 是否先用 SQLite 在线备份做一致性快照 |
| `agentPreset` | `standard` | 写入会话头的 dsh agent preset（决定恢复该会话时的工具与提示词组合） |
| `slashCommand` | `true` | 注册 `/zcode` 斜杠命令约定 |

关于 `snapshot`：只读访问对 WAL 库本身就是一致读，所以默认关闭。开启后会把整库复制到**系统临时目录**（不是数据库旁边——那可能是上 GB 的意外残留），并在本次运行结束时自动删除。

---

## 用法

### 快速上手（在 dsh 里，三步）

装好插件后打开 **设置 → zcode 迁移**：

**第 1 步：侦察。** 点「侦察」列出 zcode 库里的会话，按项目目录分组。页面顶部会给出：

```
库内总量 485 会话 · 本次选中 49 · 已迁移 2
zcode 库：C:\Users\me\.zcode\cli\db\db.sqlite
dsh 会话根：C:\Users\me\.dsh\sessions
zstd：可用
```

这一步**只读**，不写任何东西。会话默认已勾好「还没迁移过」的那批，已迁移的标了 `已迁移` 不重复勾；
子代理会话标了 `子代理`，默认不进选中（`includeSubagents` 可改）。

**第 2 步：预演（建议保留默认）。** 保持勾选「先预演（不写盘）」，点「迁移选中（N）」。
它会真的跑完整条转换链路，但只算不写——你能先看到会生成多少条、有没有失败：

```
预演结果：47 成功 / 0 跳过 / 0 失败
✓ 帮我清理C盘
✓ 审查30份综测加分并汇总班级总表
…
```

**第 3 步：真迁。** 取消勾选「先预演」，再点「迁移选中（N）」。按批（每批 3 条）推进度，中途可以「停止」。
跑完会给出：

```
迁移结果：47 成功 / 0 跳过 / 0 失败
迁移已完成。刷新页面或重启 dsh 后，新会话会出现在左侧会话列表里。

工作区已登记：12 · 会话已归组：37 · 跳过（目录已不存在）：8 · 失败：0
```

然后**刷新页面**（或重启 dsh），左侧会话列表里就能看到它们了。

### 页面上每个按钮

| 按钮 | 作用 |
|---|---|
| **侦察** | 只读列出 zcode 会话与迁移状态（换筛选条件后重来一遍） |
| **全选 / 清空** | 勾选全部会话 / 清空勾选 |
| **只选未迁移（N）** | 把勾选重置为「还没迁过」的那批（最常用的起点） |
| **迁移选中（N）** | 迁移当前勾选的 N 条；是否写盘由「先预演」决定 |
| **停止** | 迁移中途停止（已完成的批次保留，不会回滚） |
| **全选此组 / 迁移此组（N）** | 针对单个项目目录：全选该组，或直接迁移该组未迁的 N 条（不用先手动勾） |
| **登记工作区** | 为该目录建工作区**并把会话挂进去**（见下节；重复点安全） |
| **登记全部工作区（N）** | 对所有目录做一遍上面这件事；N 只数**目录还在**的那些 |
| **先预演（不写盘）** | 勾上 = 只算不写；取消 = 真写会话日志 |

### 迁移后会话去哪了：工作区归组

dsh 的会话归组**不是**按会话头的 `cwd` 现算的，而是靠工作区记录里的一个 `sessionIds` 列表——
内核只在工作区域**首次**初始化时按 cwd 自动归组一遍，此后再新建的会话必须显式挂载。所以插件做两件事：

1. `registry.create(目录)` —— 建出工作区（按路径去重，重复点不会建重复的）；
2. `workspace.attachSession(会话id)` —— 把会话挂进去（幂等）。

真迁之后插件会**自动**对涉及的目录做这两步。已经迁过、但当时没进工作区的会话，点
「登记全部工作区」或单个分组的「登记工作区」补做即可（顺带修好历史上「只建了空工作区」的残留）。
结果行四个数分别是：

| 数 | 含义 |
|---|---|
| **工作区已登记** | 成功建出（或复用）工作区的目录数 |
| **会话已归组** | 真正挂进工作区的会话条数 |
| **跳过（目录已不存在）** | 目录已被删掉，没法归组（灰字列出，**不是**失败） |
| **失败** | 真出错（红字 `✗` + 原因） |

**目录已被删掉的那些会话进不了工作区**，这是内核的约束不是插件的偷懒：`create` 与
`attachSession` 都会校验目录真实存在（工作区必须拥有一个真实文件夹）。这些会话照常迁移、
照常能打开，只是留在「未分组」。想让它们也归组，就把目录建回来再点一次「登记工作区」。
侦察时这类目录会直接标 `目录已不存在`，分组里不显示「登记工作区」按钮。

### 排障

| 症状 | 原因 / 做法 |
|---|---|
| 迁完了但会话列表里没有 | 页面不会自动刷新列表。**刷新页面或重启 dsh** |
| 会话在「未分组」里 | 迁移本身没问题，是没挂进工作区。点「登记全部工作区」，再刷新 |
| 登记结果里「跳过（目录已不存在）」很多 | 这些 zcode 会话指向的项目目录已被删除。要么不管（会话照样能用），要么把目录建回来再登记 |
| 「迁移选中」点了没反应 / 报 `ids.map is not a function` | 老版本的 bug（`onClick` 直挂了处理函数），升级到 0.1.x 之后的版本即可 |
| 「侦察」报读不到库 | zcode 库不在默认位置。用 `dbPath` 配置项指到实际路径 |
| 想确认某个产物真能被 dsh 读 | 产物路径是 `~/.dsh/sessions/--<项目>--/<会话id>/session.jsonl.zstd`；用 `zcode_verify <路径>` 或 `node cli.mjs verify <路径>` 回读 |
| 设置页在、但工具/命令都没有 | 插件被当成 bundle 类加载了。见文末[内置注意事项](#内置注意事项改这个插件前必读)第 1 条 |

设置页的数据全部走宿主侧 `/zcode-migrate/api/{inspect,migrate,verify,workspaces}`（客户端半不碰
文件系统，该路由只信本机 Host，非本机 Host 一律 403）。

### 在 dsh 里（模型可调用工具）

也可以直接让模型干活（说「用 zcode 工具把历史会话迁过来」即可）：

| 工具 | 作用 |
|---|---|
| `zcode_inspect` | 只读侦察：库总量、按项目分布、待迁移清单、哪些已迁移过 |
| `zcode_migrate` | 执行迁移（按会话幂等，支持 `dryRun`） |
| `zcode_verify` | 回读一个产物，确认可被 dsh 解析 |

> **工具名为什么是下划线**：模型 API 要求函数名匹配 `^[a-zA-Z0-9_-]+$`，带点的名字
> （如 `zcode.inspect`）会让**整个请求** 400，表现是「本轮运行失败」、这一轮连消息都发不出去。
> 0.1.1 起统一改成下划线写法。

### 斜杠命令

dsh 没有命令注册面，本插件用一段系统提示把 `/zcode` 前缀映射到上面的工具：

```
/zcode                      → 列出命令清单
/zcode inspect              → zcode_inspect
/zcode migrate [dryRun]     → zcode_migrate
/zcode migrate --cwd <路径>  → 只迁移某个项目
/zcode migrate --ids <sess_a,sess_b>
/zcode migrate --includeSubagents
/zcode verify <路径>         → zcode_verify
```

### 命令行（不启动 dsh 也能用）

首次批量迁移、CI 或脚本化时更顺手：

```bash
node cli.mjs inspect
node cli.mjs migrate --dry-run
node cli.mjs migrate --cwd "C:\Users\me\Desktop\my-project"
node cli.mjs migrate --include-subagents --limit 50
node cli.mjs verify "<...>/session.jsonl.zstd"
```

> 命令行**不做工作区归组**（那是 dsh 运行时的服务）。用 CLI 批量迁完，再到设置页点一次
> 「登记全部工作区」把会话挂进工作区。

---

## 映射规则

| zcode | dsh |
|---|---|
| `session.directory` | 会话头 `cwd` → 决定项目目录 |
| `session.title` | `session/title` 事件（保留标题） |
| `session.parent_id` | 会话头 `parentSession` + `origin: subagent` + `delegationDepth: 1` |
| user 消息 text/file 片段 | `turn/start` → `step/start` → `user/message`（content 为块数组） |
| assistant 消息（一次模型调用） | `assistant/message`（一个 step） |
| `reasoning` 片段 | `reasoning` 内容块 |
| `tool` 片段 | `assistant/message` 里的 `tool-call` 块 **+** 独立的 `tool/call` / `tool/result` 事件对 |
| `message.finish` | `turn/end` 的 reason（`tool-calls` 表示回合继续，不开新的 turn/end） |
| `message.tokens` | `assistant/message` 的 `usage`（camelCase，零值字段省略） |
| `synthetic` / 非 user 来源的 user 消息 | `source: {kind: 'plugin:zcode'}`（不冒充人类输入，也不会被标题事件引用） |

**关键顺序**：dsh 要求 `step/start` 在进入该 step 的消息**之前**（真实 dsh 日志即 `turn/start → step/start → user/message → assistant/message`）。顺序错了，dsh 的 v2 格式迁移会报 `cannot acquire a system head without changing chronology` 而拒绝加载。

**工具名映射**：zcode 的 `Bash/Read/Edit/Write/Glob/Grep/Agent/TodoWrite/SendMessage/TaskStop/WebSearch` 会映射到 dsh 实际暴露的工具名（`pwsh/read/edit/write/glob/grep/subagent/todo_write/send_message/interrupt_agent/web_search`），未知工具名原样保留。可用 `toolNameMap: false` 关闭。

---

## 验证

### 已验证到什么程度

在一台真实的开发机上跑了全量：

```
扫描 485 会话 → 迁移 482 / 跳过 3 / 失败 0
事件 532,683 · 消息 110,847 · 工具结果 98,392 · 轮次 16,748 · 体积 298.9 MB（耗时 62 秒）

dsh 校验: 482/482 通过 · 533,165 事件
```

「dsh 校验」指的是**用 dsh 自己的代码**加载每一个产物：

1. **`@deepseek-ai/dsh-session-persistence-jsonl`**（`JsonlSessionPersistence.loadStored`）——dsh 读取会话的正式入口，走它自己的物理编解码路径。
2. **`@deepseek-ai/dsh-session-format-catalog`**——跑完整的 v0→v1→v2→v3 格式迁移链 + 当前格式校验（`validation: 'current'`）。

对照实验：对一个**真实 dsh 原生日志**跑同样的校验，两者的物理头版本（0）、逻辑恢复版本（3）、以及 v2→v3 迁移插入的 `system/message` 行为**完全一致**——即从 dsh 读取器的视角看，迁移产物与原生产物不可区分。

自己复跑：

```bash
node scripts/validate-with-dsh.mjs ~/.dsh/sessions
```

### 单元测试

```bash
npm test        # 71 个测试，覆盖路径规则、帧编解码、事件映射、迁移编排、插件契约、设置页 HTTP 面，以及设置页的真渲染 + 真点击
```

测试用**自建的合成 zcode 数据库**，不依赖你机器上的真实数据。

---

## 设计说明

```
core/          框架无关的迁移逻辑（纯 Node，零第三方依赖）
  paths.js       dsh 目录/文件命名规则（逐字节移植）
  zstdlog.js     dsh 日志物理编解码（帧写入 + 结构化帧扫描）
  zcode.js       zcode SQLite 读取（node:sqlite，只读 + 可选快照）
  convert.js     zcode 消息模型 → dsh 事件流
  migrate.js     编排：筛选 → 转换 → 原子写入 → 回读校验
src/           dsh 插件适配层（薄）
  index.js       Cordis 契约：name / inject / Config / apply
  tools.js       三个模型可调用工具
  rpc.js         设置页的 HTTP 面（inspect / migrate / verify / workspaces）
lib/           客户端半：设置页（手写产物，无打包器）
cli.mjs        命令行入口（不启动 dsh 也能迁移）
scripts/       开发期验证工具（依赖 dsh 内部包布局，不参与运行时）
test/          node:test 测试
```

几个刻意的选择：

- **`core/` 不知道 dsh 的存在**。迁移逻辑可以被 CLI、测试或别的主机直接调用，dsh 适配层只是一层壳。
- **写入是原子的**：整份日志先在内存里编码完，写到临时文件再 rename。dsh 的文件监听随时可能读到这个文件，绝不能让它看到写了一半的帧。
- **不往用户目录里丢垃圾**：`snapshot` 开启时快照落在系统临时目录且用完即删——它可能比源库还大，放在 `~/.zcode/cli/db/` 旁边是意外残留。
- **按会话幂等**：zcode id 确定性地映射到 dsh id，重复迁移覆盖同一个文件，不会堆重复会话。
- **不伪造内容**：zcode 里没有对应物的事件类型（如 `timeline`、`compaction` 片段）不硬造 dsh 事件；无内容的 assistant 行（模型切换等）直接跳过，不会凭空产生空轮次。

---

## 已知边界

- **不迁移 zcode 的 compaction 记录**。dsh 有自己的压缩事件模型，语义不能一一对应；迁移的是压缩后的完整转录。
- **不迁移 `input_history` / 未发送草稿 / 用量报表 / todo 历史**。参考仓库的「数据归档」产物在 dsh 侧没有对应落点。这些数据仍可从 zcode 库直接读。
- **不写入 dsh 的 `request/header` 快照**。它是请求期日志，恢复会话时 dsh 会自己生成新的。
- **子代理会话默认不迁移**（数量大且多为噪音），需要时用 `includeSubagents`。
- **迁移产物是只读历史**：dsh 可以浏览并继续对话，但继续对话产生的新事件会追加到同一个日志里，原 zcode 库不受影响。
- **会话头里没有工作区字段**：归组完全靠 dsh 工作区注册表的 `sessionIds`。所以迁移完必须做一次
  「登记工作区」（插件在真迁后自动做），否则会话会留在「未分组」——这不是产物的问题。
- **目录已被删除的会话无法归组**（内核要求工作区拥有真实存在的目录）。产物照常生成、照常可读。

---

## License

MIT

## 内置注意事项（改这个插件前必读）

> 这一节只对**维护 DSH Desktop 里那份内置副本**的人有意义（独立安装使用可以跳过）。
> 它同时存在于 `dsh-desktop/assets/plugins/dsh-zcode-migrate/`，由启动期的伴随插件同步链
> 镜像进 profile；改动以 dsh-desktop 仓库那份为准，改完再同步回本仓库。

1. **不要给它加回 `dsh.bundle.patch`**：本仓库的启动期同步对 bundle 类插件会主动移除
   loader 行（改走 profile 清单），而这个插件只有「一行 insert」的 patch，走清单不生效 ——
   实测表现为「客户端半（设置页）在，宿主半（工具/命令/路由）全没有」。作为普通配套件
   （与另外 23 个内置件一致）由同步写行加载才是对的。
2. **不要写 `ctx.zcodeMigrate = ...`**：cordis 4 的 ctx 是 Proxy，未声明 provide 就赋属性会抛
   `cannot set property "zcodeMigrate" without provide`，整个宿主半加载失败（内核日志
   `[loader-isolation] entry zcode-migrate ... failed`）。只走 `ctx.provide(...)`；
   `test/plugin.test.mjs` 有一条用 Proxy 复刻该行为的回归锁。
3. 内核日志在 `%APPDATA%dsh-desktoplogs`（**不是** `%APPDATA%DSH Desktoplogs`，
   后者是退役 Electron 线的旧目录）—— 排查加载问题先看那里的 `dsh-web.log`。

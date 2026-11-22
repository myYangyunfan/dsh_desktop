# JSON 导入

**中文** | [English](json-import.en.md)


面板支持常见 MCP 客户端配置，并在写入前提供结构化预览。导入目标取决于当前标签页：**全局**标签写入当前 Web profile 的 `cordis.patch.yml`，**项目**标签写入该项目目录的 `.dsh/mcp.json`（互不混淆）。全局导入热加载生效；项目导入遵循项目作用域语义，下一次会话生效（见 README 的「配置生效时机」）。

> `.dsh/mcp.json` 是本插件的私有约定：DSH 自身没有项目级 MCP 配置文件（官方只有 profile 的 `cordis.yml` / `cordis.patch.yml` 行，以及 ACP 客户端的 per-session `mcpServers`）。文件里的 `mcpServers` schema 与各客户端一致，但**路径不兼容**：Claude Code 读项目根的 `.mcp.json`，DSH 不读 `.dsh/mcp.json`，其他工具也不会。本文件只在装了本插件时才有意义。

## 从本机其他客户端导入

打开「导入 MCP」时，面板会扫描本机已知客户端的配置文件，把检测到的来源列出来（名称、路径、条目数、哪些字段会被掩码）——点一条即从它导入。**写入目标仍由当前标签页决定**（全局 → profile，项目 → `.dsh/mcp.json`），与粘贴路径完全一致。

| 客户端 | 位置 | 读取的段落 |
|---|---|---|
| Claude Code | `~/.claude.json`（`CLAUDE_CONFIG_DIR` 可覆盖） | 用户级 `mcpServers` |
| Claude Code（项目） | `<项目>/.mcp.json` | `mcpServers` |
| Codex | `~/.codex/config.toml`（`CODEX_HOME` 可覆盖） | `[mcp_servers]` |
| Codex（项目） | `<项目>/.codex/config.toml` | `[mcp_servers]` |
| OpenCode | `~/.config/opencode/opencode.json` 或 `.jsonc`（`OPENCODE_CONFIG` 可覆盖；XDG 路径，Windows 也是 `~/.config`） | `mcp` |
| OpenCode（项目） | `<项目>/opencode.json` 或 `opencode.jsonc` | `mcp` |
| pi | `~/.pi/agent/mcp.json`（`PI_CODING_AGENT_DIR` 可覆盖） | `mcpServers` |
| pi（项目） | `<项目>/.pi/mcp.json` | `mcpServers` |
| Claude Desktop | Windows `%APPDATA%\Claude\claude_desktop_config.json`；macOS `~/Library/Application Support/Claude/claude_desktop_config.json`；Linux `~/.config/Claude/claude_desktop_config.json` | `mcpServers` |
| Cursor | `~/.cursor/mcp.json` 与 `<项目>/.cursor/mcp.json` | `mcpServers` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `mcpServers`（远端用 `serverUrl`） |
| VS Code | `%APPDATA%\Code\User\mcp.json`（macOS/Linux 对应路径同理）与 `<项目>/.vscode/mcp.json` | `servers` |
| Gemini CLI | `~/.gemini/settings.json` | `mcpServers` |
| Roo Code | `~/.roo/mcp.json` 与 `<项目>/.roo/mcp.json` | `mcpServers` |
| 共享 MCP 配置 | `~/.config/mcp/mcp.json`、`~/.agents/mcp.json`、`~/.agents/mcp/mcp.json` | `mcpServers` |

**按层过滤**：全局标签只列本机客户端的**全局**来源，项目标签只列**当前项目**的项目级来源——「选全局就导全局、选项目就导项目」，你不需要判断某一行会写到哪儿去。这条不变量在 Host 侧强制，不是只靠界面不显示：跨层调用（例如带着 wsPath 却送 `scope: 'global'`）会被明确拒绝。要把某一层的配置搬到另一层（例如把全局的 Claude 配置也放进项目），请用下面的粘贴框。

两点容易误会的：

- **`.mcp.json` 是跨工具的共享约定**（Claude Code、pi 的适配器等都读项目根的同一个文件），所以面板只在「Claude Code（项目）」那一行列它一次，不会重复列。
- **有多个候选文件时按顺序取第一个存在的**（如 OpenCode 先看 `opencode.json`、再看 `opencode.jsonc`），面板显示的是**真正读到的那个文件**。`.jsonc` 的注释与尾随逗号会被吃掉。

粘贴框仍然只吃 JSON：Codex 的 TOML 与 OpenCode 的 JSONC 走上面的来源列表。

### Codex 字段映射

| Codex | DSH |
|---|---|
| `command`、`args`、`env`、`cwd` | 同名移植 |
| `url` | `url`（`streamable-http`） |
| `http_headers` | `headers`（字面值原样保留） |
| `env_http_headers` | `headers`，值变成 `${VAR}` |
| `bearer_token_env_var` | `headers.Authorization = "Bearer ${VAR}"` |
| `tool_timeout_sec` | `toolCallTimeoutMs`（秒 → 毫秒） |
| `enabled: false` | `disabled: true` |
| `env_vars`、`startup_timeout_sec/ms`、`required`、`enabled_tools`、`disabled_tools`、`default_tools_approval_mode`、`tools`、`auth`/`oauth*`、`bearer_token`、`http_headers_helper`、`experimental_environment`、`experimental_use_rmcp_client` | 没有对应项，逐条给提示后忽略 |

单条转换失败（例如同时写了 `command` 和 `url`）只影响它自己：同文件其余条目照常可导入，失败原因显示在那一行。

### OpenCode 字段映射

OpenCode 的格式和其他客户端差得最多（键叫 `mcp`、命令是一个数组、环境变量叫 `environment`、插值写 `{env:VAR}`）：

| OpenCode | DSH |
|---|---|
| `mcp` | 面板取的就是这一段（不是 `mcpServers`） |
| `type: "local"` | `stdio` |
| `type: "remote"` | `streamable-http` |
| `command: ["npx", "-y", "srv"]` | 拆成 `command: npx` + `args: [-y, srv]` |
| `environment` | `env` |
| `cwd` | `cwd` |
| `url`、`headers` | 同名移植 |
| `{env:VAR}` | `${env:VAR}`（OpenCode 的插值没有 `$`，不转换就会当成普通字面量写进 profile） |
| `enabled: false` | `disabled: true` |
| `timeout` | **不自动转换**：它是 OpenCode「取工具清单」的超时（默认 5000ms），与 DSH 的 `toolCallTimeoutMs` 不是一回事，会逐条提示 |
| `oauth`（对象） | 没有对应项，逐条提示后忽略（`oauth: false` 是「用我的 PAT、别走 OAuth」，不需要映射） |

`$schema` 之类的顶层非 MCP 键会被忽略。

### 四条边界

- **只读**：整个过程只读这些文件，不修改它们，也不会把它们变成 DSH 的配置来源。
- **凭据不出 Host**：检测结果只含 MCP 名称、传输方式和「哪些字段会被掩码」，不含任何值；要导入哪些条目由你勾选，真值由 Host 自己重读文件取得，所以来源里的密钥不会被送到浏览器。
- **内容指纹防错位**：预览会返回该文件的内容指纹，导入时必须带回；期间文件被改动（例如你同时开着 Codex 存了配置）会被拒绝并要求重新预览。
- **写盘前准入**：导入结果在写入前统一校验。两类同名（同一份来源里两条归一化后同名；名字已被 bundle / Agent preset 占用）都**保留先出现的那条、跳过其余**，并把跳过的名字写进预览与导入结果——一条重名不该把同批其余条目挡在门外。同时所有环境变量引用都归一成总值形式。

单文件超过 8 MB 的来源会被跳过（`~/.claude.json` 里混着大量与 MCP 无关的历史数据）；Cline 的配置在 VS Code 扩展私有存储里、结构随版本变化，暂不识别。

## 导出与跨工作区复制

这两个入口**不在一起**，因为它们的性质不同：**导出**是整层配置的快照，与导入互为逆操作，所以住在**标题栏**（紧挨「导入 MCP」，作用域决定导哪一层：全局导 profile patch、项目导本项目）；**复制到另一个工作区**只对项目有意义，所以住项目卡片的动作行里。

| 入口 | 做什么 | 凭据 |
|---|---|---|
| 复制到… | 把本项目勾选的 MCP 写进另一个**已注册**的工作区 | 不经过浏览器：源配置在 Host 内读出来直接写目标 |
| 导出 | 把当前作用域的配置导出成 JSON（可复制 / 下载成文件）。两层都是 `{ mcpServers }` 形状（同一个 `specToMcpEntry`），差别在凭据：项目层保留 `${VAR}` 引用，全局层里通过面板添加过的条目已是**求值后的实际值** | 会经过浏览器——字面写死的凭据（以及全局层里被求值过的值）原样出现在导出结果里 |

**复制**的同名处理与导入**不同**，这是有意的：

- 选中目标后，面板先把这次的写入结果算给你看（新增 / 覆盖 / 跳过哪些条目），切换「跳过 / 覆盖」时立即重算。预览与写盘在宿主侧共用同一套解析，所以不会出现"预览说跳过、实际却覆盖"；客户端也不放过这个时间差——预览结果与算出它的输入（目标 / 勾选 / 跳过-覆盖）绑定，选择一变旧结果立即失效，重算完成前「复制」不可按。
- 目标已有同名条目时**默认跳过**（保留目标现有配置），可以显式切到「覆盖目标同名」。理由：导入的「合并」表达的是"照这份 JSON 改这个项目"，所以同名更新；复制表达的是"把这几条也拿过去"，而目标里同名的那条是**目标自己的**配置，要改它得用户明确选一次。结果文案会逐条说出新增 / 覆盖 / 跳过了哪些名字。
- 目标的 `exclude` 不动。「本项目屏蔽了哪些全局 MCP」是那个项目自己的意图，不是跟着配置一起搬的数据。
- 目标必须在 DSH 里注册过（出现在面板顶部标签里的那些工作区）。这条限制在 Host 侧强制，而且**不是复制专有的**：所有写 `<工作区>/.dsh/mcp.json` 的入口都从同一个门过。写一个目录的配置与读一个目录的配置不是同一件事——只按 canonical 路径写就等于「往任意目录写 `.dsh/mcp.json`」。
- 环境变量引用原样过关：源里的 `${VAR}` 到目标还是 `${VAR}`，复制过程不解析、不落明文。

**导出**的格式与 `.dsh/mcp.json` 一致（`mcpServers` + 可选的 `exclude`），所以它有三种用法：备份一份、当文件放进另一个工作区的 `.dsh/mcp.json`、或直接用「导入 MCP」粘贴回来。往返是可逆的——导出的 `mcpServers` 经粘贴导入再导出，逐字段一致（含 `idleTimeoutMs` / `readyTimeoutMs` / `disabled` 这些项目级字段）。

两条要记住的边界：

- **导出内容含字面凭据**。URL 里的 token、字面写的 header / env 值都会出现在导出结果里，请按密钥对待。用 `${VAR}` 引用的位置保持引用写法（不会被解析成明文）——这也是推荐写法。
- **粘贴导入只读 `mcpServers`**。导出的 `exclude` 不会被粘贴导入带过去（跨工作区复制同理），需要到目标项目的「全局 MCP」区段里手动设。

## 粘贴 JSON 支持的根格式

Claude、Cursor、Cline、Roo 等客户端常用：

```json
{
  "mcpServers": {
    "example": {
      "command": "npx",
      "args": ["-y", "example-mcp"]
    }
  }
}
```

VS Code 常用：

```json
{
  "servers": {
    "example": {
      "type": "http",
      "url": "https://example.com/mcp"
    }
  }
}
```

也可以导入一个带 `command` 或 `url` 的单个 MCP 对象。

## 合并与替换

| 模式 | 更新同名 MCP | 添加新 MCP | 删除未出现的 MCP |
|---|---:|---:|---:|
| 合并 | 是 | 是 | 否 |
| 替换当前 Profile | 是 | 是 | 是，仅限当前 profile 管理的 MCP |

来自其他 bundle、Agent preset 或存在同名冲突的条目不会被覆盖（会被跳过，并在预览的提示与导入结果里说明是哪几条）。替换不会删除非 MCP patch，也不会删除其他配置层拥有的 MCP。

## Transport 映射

- `stdio`：需要 `command`，支持 `args`、`env`、`cwd`
- `http`、`streamable-http`、`streamableHttp`：统一转换为 `streamable-http`，需要 `url`，支持 `headers`
- SSE、WebSocket、OAuth、`headersHelper` 和 `envFile` 无法安全映射，会明确拒绝

## `directTools` 与启停状态

DSH 没有间接工具模式，MCP 工具始终注册为 `mcp__<server>__<tool>`。导入器采用保守转换：

| 输入 | DSH 结果 |
|---|---|
| `directTools: true` | `disabled: false` |
| `directTools: false` | `disabled: true` |
| 缺失 `directTools` | 新条目默认启用；合并已有条目时保留当前状态 |
| 同时提供 `disabled` | 显式 `disabled` 优先 |

面板开关关闭时添加 `disabled: true`，开启时删除 `disabled` 字段。

## 环境变量与密钥

原样导入的 Header 和 env 值会写入 profile 文件。推荐使用环境变量引用：

```json
{
  "headers": {
    "Authorization": "Bearer ${MCP_TOKEN}"
  },
  "env": {
    "API_KEY": "${API_KEY}"
  }
}
```

导入器会把引用转换成受限的 `!!js` 表达式，并且**总是带 `?? ""`**：`${VAR}` → `!!js (process.env.VAR ?? "")`。变量缺失时该处退化为空字符串，服务器自己连不上（面板里看得见），而不会把宿主拖下去。这条不是写好看：裸的 `!!js process.env.VAR` 在变量未设置时求值为 `undefined`，而 mcp-client 的 Config 只接受字符串，结果是 `dsh: plugin tree failed to load`——**整棵插件树都加载不出来**，用户连面板都打不开（本地实测复现过）。

来源文件里**现成**的 `!!js` 值（例如从别处抄来的表达式）在写盘前也会被归一成同一个总值形式：不会因为"不是我生成的"就直通。

来源列表和预览会直接标出当前未设置（或为空）的环境变量名（只有名字，没有值），导入前就能看到哪些位置会拿到空值。

任意 JavaScript、未识别的模板变量和需要交互取值的 VS Code `inputs` 会被拒绝，不会静默执行。

面板的 list/status Remote 不返回字面 Header、env 或 args 值；带凭据/query 的 URL 也会被脱敏。args 只要存在就整体显示为“保留原值”标记：未修改时由 Host 整体保留，若要调整则必须完整重填参数，不会把原参数发送到浏览器。

详情页和编辑表单展示配置时默认掩码敏感值（URL 凭据、args、env、headers），点击眼睛图标后经 Host 的 `reveal` 接口读取有效运行值并在会话内临时显示，再次点击隐藏；已显示的值可一键复制到剪贴板。编辑表单的显隐只改变显示层：如果用户没有实际输入新值，保存时仍提交“保留原值”标记，不会把解析后的环境变量密钥写回 profile。`reveal` 只对当前 Web profile 管理的 server 开放，其他配置层（bundle / Agent）的配置只读且不能查看具体值。

手动点击“刷新”会显示刷新中状态，并在完成后报告当前 MCP 数量；后台每 5 秒轮询通过 Host 返回的脱敏列表投影指纹（`revision`）判断是否有真实 UI 变化，未变化时跳过 `setState`。Host 另对 `reveal` 实际读取的有效运行凭据生成进程内 HMAC 信号（`revealRevision`）：即使只有密钥明文变化、脱敏列表仍相同，客户端也会在运行值切换完成时清除详情和编辑表单中会话内已显示的旧值；该信号不能用于反推凭据内容。

## 写入安全

- 写入前必须先解析并预览
- profile 修改使用 Host 侧文件锁和原子替换
- 内容版本变化时以 `FS_STALE_VERSION` 拒绝覆盖
- live 更新失败时，启停操作会尝试回滚持久化修改
- JSON 导入只接受结构化字段，不把输入拼接成 shell 命令

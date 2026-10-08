# dsh-basics-panel

DSH Web 插件「基础能力面板」：在 DSH 设置中可视化并管理 **MCP 服务器**、**技能**、**规则** 与 **归档会话**。采用模块化 feature 注册表，后续的 DSH 可视化功能只需新增一个 feature 目录并在注册表加一行即可，无需改动面板骨架。

A DSH web plugin: a native Settings panel for visualizing and managing **MCP servers**, **skills**, **rules** and **archived sessions**, built on a modular feature registry so future visualizations slot in without touching the shell.

> **兼容性**：支持 DSH `0.1.2-rc.1` ～ `0.2.x`（peer 按 minor 线开窗，见下方 0.2.0 适配段落）。`0.2.0` 起适配 DSH `0.1.2-rc.1`：上游已移除 `@deepseek-ai/dsh-client-runtime`，其 `slots` / `sessions` / `locale` 客户端服务改由标准 web 组合提供（`ui-renderer` / `api-session-controller` / `client-locale`），本插件不再声明对该包的注入依赖，构建外部模块清单同步收敛。
>
> **归档会话兼容性**：恢复优先使用上游公开的 `unarchiveSession`（`0.1.7-rc.1` 已提供，运行中的 `0.1.5-rc.3` 尚无）；在这类尚未提供该 API 的版本上，改用注册表自身的写入通道（操作队列 + `setState`，保证磁盘、进程内快照与工作区域变更三者一致）；两者都不可用时面板置灰并明确提示，不会只改磁盘。
>
> **DSH 0.1.7 适配**（`0.4.0`）：客户端会话列表快照不再有 `current` 字段，面板改为按 `retainedBy.mainView` 找主视图会话（技能作用域靠它），并在宿主侧以最近的活动 Agent 兜底、在页面提示实际使用的会话；预设改为读取 `@deepseek-ai/dsh-agent-preset` 声明行的 `config.plugins`（bundle 内声明的只读），不再读取已废弃的 `~/.dsh/.agent-presets/` 目录，也不再显示没有 MCP 行的空预设卡片；开关后会轮询热重载结果，避免把「正在连接」误报成「未生效」。
>
> **DSH 0.2.0 适配**（`0.4.1`）：DSH 启动的兼容性预检（`@deepseek-ai/dsh-app-boot` 的 `evaluatePluginCompatibility`）会把本插件 `package.json` 里每一条以 `@deepseek-ai/dsh` 开头的 peer 按 `semver.satisfies(宿主版本, 范围, { includePrerelease: true })` 判定，任一条不满足就让整条插件被启动预检拒绝（表现为设置里没有「基础能力」页签）。`0.4.0` 声明的 `@deepseek-ai/dsh-home-paths@^0.1.2-rc.1` 上界是 `<0.1.3`，虽然覆盖 `0.1.x` 全线（`includePrerelease: true` 下预发布版照常参与比较），但覆盖不到 `0.2.0`，对宿主 `0.2.0-rc.2` 判定为 false，插件因此被禁用；`0.4.1` 改为按 minor 线逐条列出的 `^0.1.2-rc.1 || >=0.2.0-rc.1 <0.3.0`，同时覆盖 `0.1.x` 与 `0.2.x` 两条线。四条 `@deepseek-ai/dsh-*` devDependencies 同步升到 `0.2.0-rc.2`，让 `pnpm typecheck` 按宿主的实际类型核对（本插件只从宿主取 `resolveDshHome` / `dshHomeDisplay` 两个稳定函数，实际类型无漂移）。

## 功能

- **MCP 服务器**：按作用域（用户 profile / 预设 preset）分组列出所有 MCP 服务器，展示脱敏后的配置（env / 请求头 / 密码参数 / URL 密码均打码），显示运行时状态（已连接 · N 工具 / 已启用 / 已禁用 / 未生效；预设行按预设组合清单显示，不误报「未生效」），并支持逐台开关（写入配置文件的 `disabled` 字段，profile 热重载、preset 新会话生效；开关后轮询到状态稳定）。
- **技能**：按作用域（项目级 / 自定义 / 用户级 / 内置 / 运行时）分组展示全部技能，支持搜索与过滤；可编辑技能的 description / whenToUse / metadata / 调用权限与正文，保存后经 filesystem watcher 热刷新生效。技能按会话预设作用域提供，面板会自动解析当前会话（并在兜底时明确提示用的是哪个会话）。
- **规则**：展示全局规则（`~/.dsh/AGENTS.md`）与项目链规则（项目根至当前目录的 `AGENTS.md` / `CLAUDE.md` / `.local` 覆盖），支持新建（全局 / 项目根 / 当前目录）与整文件编辑，保存后新会话生效。
- **归档会话**：列出所有已归档的会话（标题、工作目录、创建时间、日志大小、事件条数，并标出运行中 / 已装载 / 文件缺失），支持**恢复**（从归档集合移出，立即回到侧边栏原位置）与**删除**（永久移除会话日志目录、工作区记账与归档记录），删除提供单行、批量选中与全选删除全部（超过批量上限自动分批），全部走二次确认。只有 Agent 状态为 `running` 的会话不可删除；「已装载但空闲」的会话可删，确认条会点名提示。

## 作用域说明

| 能力 | 全局 | 项目级 | 用户级 | 预设级 | 内置 |
|---|---|---|---|---|---|
| 技能 | — | `<项目>/.dsh/skills`、`<项目>/.agents/skills` | `~/.dsh/skills`、`~/.agents/skills` | — | 随发行版内置 |
| MCP | — | DSH 暂无项目级组合文件 | `~/.dsh/cordis.patch.yml`、`~/.dsh/profiles/*/cordis.patch.yml` | 预设声明行（`@deepseek-ai/dsh-agent-preset`）的 `config.plugins`；bundle 内声明的只读 | — |
| 规则 | `~/.dsh/AGENTS.md` | 项目根至 cwd 链上的 `AGENTS.md` / `CLAUDE.md` / `.local` | — | — | — |

同名技能按注册表优先级显示生效版本（项目级 > 自定义 > 用户级 > 内置）。

## 安装

开发完成后，用官方通道安装（或手动挂载）：

```bash
dsh plugin --profile web add dsh-basics-panel@<version>
```

手动挂载：将本包放入 profile 解析范围，并在 `~/.dsh/profiles/web/cordis.patch.yml` 写入：

```yaml
- insert:
    - id: basics-panel
      name: 'dsh-basics-panel'
```

### 本地 `file:` 依赖：构建后必须同步安装副本

本仓库当前以 `file:` 本地依赖挂在 web profile 上，pnpm 会在**安装时把包复制**到 `$DSH_HOME/profiles/<profile>/node_modules/dsh-basics-panel`，DSH 的宿主半边与客户端 bundle 都从**该副本**加载。也就是说 `pnpm build` 只更新仓库，不更新 DSH 实际运行的代码；`cordis.patch.yml` / `LICENSE` 这两个文件是手工硬链接的，所以配置改动会穿过去，代码改动不会——这是最容易踩的坑。

```bash
pnpm build
pnpm run sync:check   # 只校验：影响运行的文件（lib/、package.json）不一致时列出差异并退出码 1
pnpm run sync         # 同步产物到副本（默认 profile=web，可用 --profile / DSH_PROFILE / DSH_HOME 覆盖）
```

同步时目录整体替换、文件原地覆盖（保留 `cordis.patch.yml` / `LICENSE` 的硬链接），因此这两处配置改动依旧无需同步即生效。

同步后**重启 DSH 进程**（宿主半边在启动时载入）并硬刷新浏览器（Ctrl+F5）载入新的客户端 bundle。若想让后续构建免同步，可把 profile 依赖改成 `link:`（pnpm 会建符号链接），但那会改动 profile 的 `package.json` / lockfile。

## 开发

```bash
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest
pnpm build       # tsc 声明 + tsdown（lib/index.js + lib/client.js + lib/client-registry.js）
pnpm run sync    # 把构建产物同步到 profile 安装副本（见上一节）
pnpm run sync:check
```

### 约束：可选服务必须在调用时刻解析

Cordis 的 `ctx.get(name)` 默认是**严格**的：提供该服务的 fiber 还没进入 ACTIVE 时返回 `undefined`。本插件的 `inject` 只声明 `webServer` / `webRuntime` / `sessions` / `skills` / `tools`，而 `workspaceRegistry`（`@deepseek-ai/dsh-workspace`）、`sessionPersistence`、`agentPresets` 等都可能**晚于本插件就绪**——`dsh-workspace` 尤其慢，它要先 await 打开工作区域域存储、恢复未完成写入、索引会话头。

所以：

- 这些服务只在处理函数体内 `ctx.get(...)`，**绝不在 `apply()` 阶段缓存**（缓存会拿到 `undefined` 并固化到进程结束，症状就是页签提示「未挂载工作区注册表」）；
- 也不要为了「拿得稳」把它们写进 `inject`：那会让本面板在未挂载 `dsh-workspace` 的 profile 上永不挂载，并随该 fiber 的更替反复卸载重载。

`tests/archive-store.spec.ts` 里的假 ctx 可以切换服务可用性，用于回归这类时序问题。

## 目录结构

- `src/index.ts` — Host 半边：fenced `/basics/api` 路由 + feature 合并
- `src/features/<id>/` — Host 侧 feature 后端（MCP / skills / rules / archived）
- `src/client/index.tsx` — 客户端半边：注册 `settings.section`
- `src/client/feature-registry.tsx` — 客户端 feature 注册表（扩展点）
- `docs/` — 使用文档与设计文档

## 安全

- 所有路由过浏览器信任围栏（loopback / `webRuntime.trustedHosts`）
- 敏感值只脱敏展示、绝不回传明文
- 写文件严格白名单：MCP 仅可改写扫描发现且非 system 的组合文件；技能仅可改写注册表返回且非内置/运行时的文件；规则仅可读写 DSH 规则发现机制认可的路径（全局 `AGENTS.md` 与项目链候选文件）
- 所有写操作原子写（临时文件 + rename）+ mtime 冲突拒绝
- 归档会话的恢复/删除只接受归档集合内的会话 ID；删除目标目录由 Host 在配置的会话根目录内重新扫描校验（目录名必须等于会话 ID、必须位于根目录内、必须含日志代际文件），**正在运行**（`ctx.agents.get(id)?.status === 'running'`）的会话一律拒绝；恢复优先走上游 `unarchiveSession`，否则走注册表自身的写入通道，通道不可用时明确报错而不只改磁盘
- 行状态区分两级：`running`（Agent 在处理回合，继承上游 `AgentStatus`）与 `loaded`（会话对象在本进程内存里，归档不会卸载它）。删除只拦 `running`；对 `loaded` 但空闲的会话，确认条会提示「仍装载在本次进程中」的风险后再执行

## License

MIT

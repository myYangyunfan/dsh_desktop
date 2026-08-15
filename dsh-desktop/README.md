# DSH Desktop

把 [@deepseek-ai/dsh](https://www.npmjs.com/package/@deepseek-ai/dsh)（DeepSeek Harness）封装成开箱即用的 Windows 桌面客户端。

- ✅ **免安装 Node**：内置独立的 Node 运行时与 npm CLI，目标机器无需安装 Node.js
- ✅ **内置 dsh CLI**：完整打包 `@deepseek-ai/dsh` 及其全部插件，离线可用
- ✅ **一键启动**：双击即启动 `dsh web`，自动挑空闲端口，就绪后加载到原生窗口
- ✅ **风格化无边框窗口**：无原生标题栏/菜单栏，自绘 36px 玻璃栏（圆角图标 + 拖拽 + ⋯ 菜单 + 窗口控制），Win11 原生圆角；快捷键 Ctrl+R / F12 / F11 保留
- ✅ **系统托盘常驻**：点关闭默认隐藏到托盘（可关闭），托盘菜单提供显示/检查更新/退出
- ✅ **退出即清理**：退出应用自动结束 dsh 进程树，不留孤儿进程
- ✅ **便携版**：`portable` 版数据（日志、配置）跟随 exe 所在目录，拷到 U 盘就能用
- ✅ **与 CLI 共享配置**：默认沿用 dsh 自身的 `DSH_HOME`（通常是 `~\.dsh`），已有会话/API Key 直接生效
- ✅ **跟随官方更新**：官方 @deepseek-ai/dsh 发新版时弹窗提醒，经用户同意后自动下载安装，重启生效，失败自动保留旧版
- ✅ **客户端自更新**：自动检查上游仓库（GitHub→Gitee 双源，Gitee 分片自动合并）发布的 DSH Desktop 新版本，经用户同意后下载、替换、重启；便携版/安装版各自适配
- ✅ **快捷方式自动维护**：便携版首次运行自动创建开始菜单 + 桌面快捷方式；exe 移动后自动重建（修复"快捷方式指向的文件消失"）；从临时目录运行时给出提示
- ✅ **DeepSeek 余额小部件**：对话底部统计栏内联显示「本轮 ¥X.XX · 余额 ¥Y.YY」（自动注入配套 dsh 客户端插件，点击跳转充值）
- ✅ **文件更改追踪 + 一键还原**：详情面板新增「文件」标签页，聚合本会话 agent 修改过的全部文件（新建/修改/删除、行级 diff、逐文件或全部还原）；数据只读复用会话日志已持久化的 `tool/result.meta.diffs`，还原由桌面壳做内容精确匹配后替换，失败安全提示
- ✅ **会话完成系统通知**：agent 任务跑完时弹 Windows 系统通知，点击回到窗口
- ✅ **自定义注入提示词**：设置页可自定义官方内核注入的系统提示词（替换整体 / 追加到末尾，应用到 standard 完整 Agent 基准预设），新会话即刻生效

- ✅ **隐藏对话输出**：设置 → 通用设置 →「隐藏对话输出」，隐藏模型长篇文字，只保留工具调用、文件操作与结果等重要信息
- ✅ **会话导航滑轨**：对话右侧的虚化滑轨长度随会话变化；悬停时在鼠标位置显示垂直短横线预览，点击才跳转
- ✅ **便携版解压缓存**：首次解压后缓存到 `%TEMP%\dsh-desktop-portable`，同版本再次启动直接复用，避免 Defender 扫描 2.4 万文件导致分钟级冷启动
- ✅ **启动自愈与看门狗**：自动修复 profile 符号链接损坏导致的 `dsh web` 退出码 1；主进程异常退出时自动拉起应用并发送恢复通知

## 快速开始（成品用户）

1. 打开 `dist` 目录，选其一：
   - `DSH-Desktop-<版本>-portable-x64.exe` —— 免安装便携版，双击运行
   - `DSH-Desktop-Setup-<版本>-x64.exe` —— 安装版，创建桌面/开始菜单快捷方式
2. 首次运行会显示启动动画，随后进入 DeepSeek Harness Web UI。
3. 如尚未配置 API Key，在界面内完成配置即可开始使用（与命令行 dsh 完全一致）。

> 便携版的数据目录是 exe 旁的 `data\`；安装版在 `%APPDATA%\DSH Desktop\`。
> 若想强制指定 DSH 配置目录，启动前设置环境变量 `DSH_HOME` 即可（与 dsh CLI 行为一致）。

## 跟随官方更新（用户同意后自动更新）

- 启动 15 秒后及此后每 6 小时，自动查询 npm 官方 registry 上 @deepseek-ai/dsh 的最新版本；菜单「帮助 → 检查更新…」可随时手动检查。
- 发现新版本时弹窗询问：**立即更新 / 跳过此版本 / 稍后**。
- 同意后，内置 node + npm 把官方新版本安装到用户数据目录的 `agent\`（overlay），全程写入 staging 目录，成功后才原子切换，失败自动保留当前版本。后续更新只下载差异（复用 npm 缓存）。
- 完成后提示**立即重启 / 稍后重启**，重启即用新版；启动时 dsh 路径解析优先使用 overlay、内置版本兜底。
- 若新版启动失败，启动失败对话框提供**「回退到内置版本并重试」**一键回退。
- 尊重用户 npm 配置：自定义 registry 镜像/代理请设 `NPM_CONFIG_REGISTRY`（如 `https://registry.npmmirror.com`）。

## 客户端自更新（封装层）

- 启动 60 秒后及此后每 12 小时，自动查询上游仓库的最新 release（**GitHub Releases → Gitee Releases 双源回退**；可用环境变量 `DSH_DESKTOP_RELEASE_API` 指向自定义镜像 API），比较当前版本。
- 发现新版本时弹窗询问：**立即更新 / 跳过此版本 / 稍后**；同意后带进度条下载安装包（便携版选 `*-portable-x64.exe`，安装版选 `Setup-*-x64.exe`；Gitee 因单文件 100MB 限制拆分的 `.part1/.part2` 分片会自动按序下载并合并），下载到 `<数据目录>\updates\`。
- 确认重启后：**便携版**用 detached 脚本等待旧 exe 解锁 → 备份 → 原地替换 → 自动启动新版本（只读目录自动退化为直接启动新 exe）；**安装版**等待进程退出后以向导方式启动新安装包。失败自动保留当前版本，下次启动继续提示待安装更新。
- 菜单入口：chrome 栏 ⋯ 菜单 →「检查客户端更新…」；托盘菜单同样可用。跳过版本记录在 `settings.json`（`skipClientVersion`）。
- **更新源可见可复制**：⋯ 菜单内「更新源」区块与「关于 DSH Desktop」对话框展示两个项目仓库地址（GitHub / Gitee），一键复制到剪贴板。
- 链路自检：`node scripts/check-client-latest.js [--download]`（可设 `DSH_DESKTOP_RELEASE_API` / `PORTABLE_EXECUTABLE_DIR`）。

## DeepSeek 余额小部件

- 桌面端读取 `~/.dsh/.credentials.yaml` 的 `DEEPSEEK_API_KEY`（或环境变量），调用 `https://api.deepseek.com/user/balance`，每 15 分钟刷新，通过 preload 推送到 Web UI。
- 配套 dsh 客户端插件（`assets/plugins/dsh-balance`）在每次启动时自动同步进 web profile 并注册到 `conversation.composer.dock`，在对话底部统计栏内联显示：**本轮 ¥X.XX · 余额 ¥Y.YY**（本轮费用按 token 用量 × 价格档估算，缓存命中/未命中/输出分别计价）。
- 价格档默认：deepseek-chat 2/0.5/8、deepseek-reasoner 与 deepseek-v4-pro 4/1/16（¥/百万 token）；可在 `<数据目录>\settings.json` 的 `balancePrices.<model>` 覆盖。代理/镜像可用 `DEEPSEEK_API_BASE` 或 `DEEPSEEK_BALANCE_URL` 环境变量。
- 纯浏览器打开 Web UI 时无桌面壳推送，小部件只显示「本轮」费用。

## 自定义注入提示词

- 入口：chrome 栏 ⋯ 菜单 → 设置 → 「自定义提示词」栏。
- 官方内核每次为会话注入的系统人设（persona，standard 预设默认）为：
  `You are a coding agent powered by the {{model}} model. Your working directory is {{cwd}}.` 本功能可让用户用自定义文本整体替换或在其后追加。
- **注入方式**（设置里可切换）：
  - **追加到末尾（append）**：保留默认人设，在其后追加自定义文本。
  - **替换整体（replace）**：用自定义文本整体替换默认人设。
- **生效范围**：应用到 standard 完整 Agent 基准预设；设置保存后新创建会话即刻生效，运行中会话沿用注入时的提示词。
- 自定义文本按原样注入，可用 `{{model}}` 等占位符；未启用或内容为空时回落为官方默认。
- 配套 dsh 客户端插件（`assets/plugins/dsh-prompt-custom`）自动同步进 web profile，配置持久化到该 profile 的 `settings.yaml`（`dsh-prompt` 命名空间）。

## 快捷方式与托盘

- **托盘**：点窗口关闭按钮默认隐藏到托盘并提示一次；托盘菜单可显示窗口 / 检查更新 / 开关会话通知 / 退出。chrome 菜单「关闭时最小化到托盘」可关闭该行为。
- **快捷方式**：便携版首次运行自动创建桌面 + 开始菜单快捷方式（开始菜单快捷方式同时是 Windows Toast 通知的前置条件）；每次启动校验，exe 被移动后自动重建指向新位置；从系统临时目录运行时弹窗提醒移动到固定位置。

## 文件更改追踪与回退

- 详情面板新增「文件」标签页（与 对话/轨迹 并列）：聚合当前会话 agent 改过的所有文件，展示新建/修改/删除标记、行数变化与行级 diff。
- **数据来源**：只读复用官方会话日志已持久化的 `tool/result.data.meta.diffs`（`ctx.fs` 写前锁内全文），配套 host 插件 `@deepseek-ai/dsh-file-changes` 注册 `fileChanges` 会话投影，零写入、零格式变更，对 dsh 升级完全稳定。
- **还原**：逐文件或全部还原 —— 客户端把该文件的变更按逆序发给桌面壳，壳层做**内容精确匹配后替换**（新建→删除、删除→恢复、修改→回写写前全文）；文件已被后续改动时提示冲突，绝不覆盖未知内容。
- **对话回退**：沿用 dsh 内置的会话分叉（消息尾部「从此处分叉」），可与文件还原组合使用。
- 配套插件随桌面端分发（`assets/plugins/`），每次启动自动同步进 web profile 并幂等注册。

## 项目文件树与 HTML/端口预览

- 「文件」标签页内新增「全部文件」子视图：VSCode 风格的层级文件树（懒加载、目录优先排序、文件大小/修改时间、本会话改过的文件带绿点标记），点击文件用系统默认程序打开；配套 host 插件注册 `GET /api/dsh-files/list`（仅回环）。
- **站内侧边预览**（可拖宽，宽度持久化）：树中 HTML 文件的悬停「▶」按钮或「本会话修改」列表的「预览」按钮打开右侧预览面板；宿主插件以 `GET /dsh-files/static/<绝对路径>` 提供静态文件服务，HTML 的相对资源引用（`./css`、`../img`）随 URL 自然解析，与本地打开一致。
- **端口预览**：预览面板地址栏可直接输入 `3000` / `localhost:5173` 等，宿主插件探测本机回环监听端口（`GET /api/dsh-files/ports`）并以徽章列出，点击即预览；`GET /api/dsh-files/check` 提供在线状态检查（面板状态栏显示 HTTP 状态）。
- 预览面板带前进/后退/刷新/外部打开（系统浏览器）；全部路由仅接受回环地址请求。

## 会话内终端

- 新增「终端」标签页（与 对话/轨迹/文件 并列）：在当前会话的项目目录下启动持久 PowerShell shell，SSE 流式输出、命令历史（↑/↓）、清屏、重启、断线自动重连（切换标签页/刷新不丢，回放最近 512KB 输出）。
- **编码**：宿主插件用显式 UTF-8 的 mini-REPL（自建读行循环 + `Invoke-Expression`）绕开 PowerShell 5.1 原生 REPL 对重定向 stdin 的编码漂移，中文输入输出双向干净。
- **限制**：非 PTY（vim/htop 等全屏交互程序不支持）；PowerShell 语法（`&&` 用 `;` 或 `if ($?)` 替代）；多行脚本请用 `;` 分行。
- 宿主插件路由：`GET /dsh-files/term/events`（SSE）、`POST /dsh-files/term/input`、`POST /dsh-files/term/close`，全部仅接受回环地址请求；断开后 shell 保留 15 分钟。

## 会话完成通知

- 监听 dsh 会话日志（`<DSH_HOME>/sessions/**/session.jsonl.zstd`），解码与官方持久化实现一致的 zstd 多帧 + JSONL 格式。
- 会话格式带 turn 事件的（当前版本）在 `turn/end`（一轮任务真正跑完，含 goal 模式整体完成）时通知；旧格式会话以 `assistant/message` 兜底。子代理会话不通知，避免刷屏。
- 通知标题优先使用会话标题（`session/title`），正文含工作目录与短会话 ID；点击通知回到主窗口。
- 菜单「帮助 → 会话完成通知」可随时开关（持久化于数据目录 `settings.json`）。
- Windows Toast 需要开始菜单快捷方式：安装版由安装器创建；便携版首次运行自动创建（指向原始 exe）。

## 支持作者（请作者喝咖啡）

如果这个桌面客户端帮到了你，欢迎扫码支持一下作者 ☕。入口在窗口左上角 ⋯ 菜单 →「请作者喝咖啡」。

| 支付宝 | 微信 |
| --- | --- |
| ![支付宝收款码](assets/sponsor/sponsor-alipay.jpg) | ![微信收款码](assets/sponsor/sponsor-wechat.png) |

## 开发

要求：Windows + Node.js（仅构建机需要）+ npm。

```powershell
npm install                    # 安装 dsh / electron / electron-builder
npm run fetch-runtime          # 内置 node.exe + npm CLI（构建与开发都需要）
npm start                      # 开发模式启动（窗口内跑 Web UI）
npm run dist                   # 构建 portable + NSIS 安装包，输出到 dist/
```

> 网络受限时：Electron 二进制镜像 `$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'`（可 `npm run electron:fetch` 手动补拉）；打包工具链镜像 `$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'`。
>
> 开发辅助脚本：`node scripts/check-latest.js`（检查/试装更新）、`node scripts/test-watcher.js`（通知检测单测）、`node scripts/inspect-session.js <file>`（会话日志事件词表）。

## 架构

```
┌──────────────────────────────────────────────────────────┐
│  Electron 壳 (main.js)                                   │
│  · 单实例锁 / 窗口 / 菜单 / 生命周期                       │
│  · 会话完成监听 (session-watcher.js) → 系统通知            │
│  · 官方更新 (updater.js) → 用户同意后安装 overlay          │
│  · spawn vendor|resources 里的 node.exe                   │
└──────────────┬───────────────────────────────────────────┘
               │  dsh web --host 127.0.0.1 --port 0
               ▼
       内置 node.exe + @deepseek-ai/dsh
       路径解析：用户目录 overlay > 内置包
       输出 "dsh web: http://127.0.0.1:<port>"
               │  解析 URL，轮询 HTTP 200
               ▼
       原生窗口加载 Web UI（仅本机回环访问）
```

关键决策：

| 决策 | 原因 |
| --- | --- |
| `asar: false` | dsh 依赖 sharp / node-pty / koffi 等原生模块，必须以真实文件落盘 |
| 内置独立 node.exe + npm | 预编译原生模块 ABI 与安装时的 Node 版本绑定；Electron 内嵌 Node ABI 不同。内置同版本 node.exe 零配置保证一致，npm 用于官方更新。注意：electron-builder 复制 extraResources 时会剥掉嵌套 node_modules，npm 自己的依赖由 \`afterPack\` 钩子原样补拷（scripts/after-pack.js） |
| `npmRebuild: false` | 绝不为 Electron 重编译原生模块，否则内置 node.exe 反而加载不了 |
| `--port 0` + 解析 stdout | 由 OS 分配空闲端口，避免端口冲突；本机回环绑定不对外暴露 |
| 退出时 `taskkill /T /F` | dsh 会派生 pwsh 等子进程，按进程树整体回收 |
| 更新走 overlay + staging 原子切换 | 更新失败零风险；便携版（资源每次从 exe 解压）也能持久更新 |
| 通知读会话日志而非 UI 协议 | 持久化格式是官方稳定接口；UI 的私有 RPC/SSE 协议随版本变化，容易失效 |

## 连接 WSL（WSL 托管模式）

壳支持两种后端：`local`（启动内置 dsh，默认）、`wsl`（壳经 wsl.exe 在 WSL 内安装/更新/运行自己的 dsh）。选择方式：设置页「WSL 后端」栏（推荐，含状态展示与预检）、`settings.json` 的 `backend` 字段，或环境变量 `DSH_DESKTOP_BACKEND=local|wsl`。

### 把配套插件装进你自己 WSL 里的 dsh（可选，与后端模式无关）

如果你在 WSL 里另有自己装的 dsh（checkout 开发版或 npm 版）——壳自带的配套插件（余额、文件视图、终端、浮窗、插件市场、自定义提示词、第三方思考、识图等）是壳私有打包的（不进 npm），想让它也用上，在 WSL 里执行：

```bash
node dsh-desktop/scripts/sync-companion-plugins.js ~/.dsh --with-patches
```

（`--dry-run` 可先预览；`--with-patches` 额外应用「会话列表闪跳修复 + 设置暴露白名单」两个运行时补丁，否则自定义提示词/第三方思考的设置页可能显示「设置不可用」。）插件在 **dsh web 重启后**才挂载（profile 补丁层在启动时读取）：重启 `dsh web`（checkout 开发模式 `pnpm dsh web`；npm 安装版 `dsh web`），注意会中断正在跑的会话（会话数据在磁盘上，可继续）。终端插件在 POSIX 下自动使用 `sh -i`，其余插件跨平台。卸载：删掉 `cordis.patch.yml` 中对应 `insert` 条目与 `profiles/web/node_modules` 下的对应包目录即可。

### wsl：壳在 WSL 里托管自己的 dsh（自动更新全闭环）

不想借用已有 dsh、又想要 Windows 原生窗口 + 自动更新？选 `backend: "wsl"`：壳经 `wsl.exe` 在 WSL 里**安装、同步插件、启动、更新**自己的一套 dsh，与 local 模式体验一致。

- **设置页入口（推荐）**：设置 → 「WSL 后端」栏——切换 local/wsl 模式、填发行版与安装目录、查看当前 WSL 状态（发行版/node/npm/agent 版本与检测错误）、「重新检测」按钮；保存后重启应用生效（切换前会预检一次 WSL 连通性，错误直接显示在页面上）。纯浏览器打开时该栏显示「仅在 DSH Desktop 客户端中可用」。
- 配置（`settings.json` / 环境变量，均可手填；设置页写的也是 `settings.json`）：
  - `wslDistro`（`DSH_DESKTOP_WSL_DISTRO`）：发行版名，默认 `wsl -l -q` 第一个；
  - `wslInstallDir`（`DSH_DESKTOP_WSL_DIR`）：WSL 内安装目录（Linux 绝对路径，**不含空白**），默认 `~/.dsh-desktop`——刻意不默认 `~/.dsh`，避免与你自己的 dsh 共用 DSH_HOME 互相改写 profile；想共享会话就显式设成 `~/.dsh`；
  - 前置条件：WSL 内要有 node + npm（`sh -lc 'node --version'` 能出结果即可，fnm/nvm 皆可；缺失时保存配置会提示、启动会弹窗引导）。
- 首次启动流程：显示加载页 → 探测 WSL/node → 缺 agent 时在 WSL 内 `npm install @deepseek-ai/dsh@<内置版本>`（约 2–3 分钟，之后复用 npm 缓存）→ 配套插件 + 运行时补丁经 UNC（`\\wsl.localhost\<发行版>\...`）同步进 WSL profile → `wsl.exe -e sh -lc` 启动 `dsh web --host 127.0.0.1 --port 0` → 解析就绪 URL（与 local 同规则）→ Windows 经 localhost 转发加载窗口。
- 目录布局（WSL 内）：`<dir>/agent`（当前版本，`DSH_HOME=<dir>`）、`agent-prev`（回退）、`agent-staging`（更新中转）、`dsh.pid`（退出清理）、`profiles`/`sessions`（数据）。
- **自动更新**：检查仍在 Windows 侧（npm registry 查询），安装走 WSL 内 npm（staging + 原子切换，失败自动保留旧版），重启应用生效；启动失败弹窗可「回退到上一版本」。
- 退出/重启服务：按 `dsh.pid` 发 SIGTERM 优雅收尾（绝不 `wsl --terminate`）；插件市场的「重启服务」在托管模式下可用（重启 WSL 内的 dsh web）。
- 会话通知、余额小部件、文件 diff 查看照常（经 UNC 直读 WSL 文件）；「文件」视图的还原/打开仍是 Windows 本地功能，不适用于 WSL 会话。
- 已知边界：Windows 侧访问依赖 WSL2 的 localhost 转发（不通时启用 `.wslconfig` 的 `networkingMode=mirrored`）；`wslInstallDir` 路径不能含空格。

## 日志与排障

- `desktop.log`：壳层日志（启动参数、端口、通知、更新、退出）
- `dsh-web.log`：dsh web 的完整 stdout/stderr
- `update.log`：官方更新的 npm 安装日志

位置：便携版 `data\logs\`；安装版 `%APPDATA%\DSH Desktop\logs\`。
菜单「视图 → 打开日志目录」可直接打开。

常见问题：

- **Windows 提示"已保护你的电脑"（SmartScreen）**：成品未做代码签名。点「更多信息 → 仍要运行」，或在 PowerShell 里 `Unblock-File`。
- **首次启动慢**：dsh 首次引导 profile 需要数秒到数十秒，属正常现象。
- **更新下载慢**：设置环境变量 `NPM_CONFIG_REGISTRY=https://registry.npmmirror.com` 后重启应用。
- **收不到通知**：确认菜单「会话完成通知」已勾选；便携版确认开始菜单里存在「DSH Desktop」快捷方式（首次运行自动创建，勿删除）；检查 Windows「通知与操作」设置里应用通知未被禁用。
- **端口被占**：应用自动使用空闲端口，无需手动处理。

## 目录结构

```
dsh-desktop/
├── main.js               # Electron 主进程（无边框窗口/托盘/自绘 chrome IPC + 余额推送 + 客户端自更新 + 快捷方式维护）
├── updater.js            # dsh agent 官方更新引擎（检查 / 同意后安装 / 回退）
├── client-updater.js     # 客户端（封装层）自更新引擎（GitHub/Gitee 双源 + 分片合并 + 原地替换）
├── balance.js            # DeepSeek 账户余额查询（主进程）
├── session-watcher.js    # 会话完成监听（zstd 多帧解码 + turn/end 检测）
├── preload.js            # 沙箱预加载（自绘玻璃标题栏 + 窗口控制/菜单 IPC + 余额事件桥 + WSL 配置桥）
├── wsl-backend.js        # WSL 托管后端（发行版探测 / bootstrap 安装 / 启动停止 / 更新回退）
├── assets/               # 加载页、更新进度页、图标、托盘图标、配套 dsh 插件
│   ├── sponsor/          # 赞助收款码（支付宝 / 微信，「请作者喝咖啡」面板与本文档共用）
│   └── plugins/          # dsh-balance（余额小部件）、dsh-file-changes（文件更改投影）、dsh-client-file-changes（「文件」视图）、dsh-wsl-settings（设置页「WSL 后端」栏）等 —— 自动同步进 web profile
├── scripts/
│   ├── fetch-node.js     # 内置 node.exe 复制脚本
│   ├── fetch-npm.js      # 内置 npm CLI 复制脚本
│   ├── build-icon.ps1    # 生成应用图标（透明圆角蒙版）+ 托盘图标
│   ├── check-latest.js   # agent 更新链路测试工具
│   ├── check-client-latest.js # 客户端更新链路测试工具
│   ├── test-watcher.js   # 通知检测单测
│   ├── sync-companion-plugins.js # 把配套插件同步进任意 dsh 的 web profile（独立于壳）
│   └── inspect-session.js# 会话日志解析工具
├── build/icon.png        # electron-builder 图标源
├── vendor/               # 内置 node.exe / npm CLI（fetch-runtime 生成，不入库）
├── electron-builder.yml  # 打包配置
└── dist/                 # 构建产物
```

## License

MIT。基于 [@deepseek-ai/dsh](https://www.npmjs.com/package/@deepseek-ai/dsh)（MIT）。

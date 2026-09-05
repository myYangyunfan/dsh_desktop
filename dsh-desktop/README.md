# DSH Desktop

把 [@deepseek-ai/dsh](https://www.npmjs.com/package/@deepseek-ai/dsh)（DeepSeek Harness）封装成开箱即用的 Windows 桌面客户端。

- ✅ **免安装 Node**：内置独立的 Node 运行时与 npm CLI，目标机器无需安装 Node.js
- ✅ **内置 dsh CLI**：完整打包 `@deepseek-ai/dsh` 及其全部插件，离线可用
- ✅ **一键启动**：双击即启动 `dsh web`，优先复用上次保存的端口（被占用时自动换新端口），就绪后加载到原生窗口；稳定 origin 让左侧会话分组等界面偏好能跨重启记住
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

 - ✅ **隐藏对话输出**：设置 → 通用设置 →「隐藏对话输出」，隐藏大量工具调用、工具结果与思考过程，每一轮的最终总结输出仍然显示
 - ✅ **会话导航滑轨**：对话右侧的虚化滑轨长度随会话变化；每条用户输入在滑轨上以圆点标出位置，悬停时在鼠标位置显示垂直短横线预览，点击才跳转
- ✅ **便携版解压缓存**：首次解压后缓存到 `%TEMP%\dsh-desktop-portable`，同版本再次启动直接复用，避免 Defender 扫描 2.4 万文件导致分钟级冷启动
- ✅ **启动自愈与看门狗**：自动修复 profile 符号链接损坏导致的 `dsh web` 退出码 1；主进程异常退出时自动拉起应用并发送恢复通知

## 快速开始（成品用户）

1. 打开 `dist` 目录，选其一：
   - `DSH-Desktop-<版本>-win-portable-x64.exe` —— 免安装便携版，双击运行
   - `DSH-Desktop-<版本>-win-setup-x64.exe` —— 安装版，创建桌面/开始菜单快捷方式
2. 首次运行会显示启动动画，随后进入 DeepSeek Harness Web UI。
3. 如尚未配置 API Key，在界面内完成配置即可开始使用（与命令行 dsh 完全一致）。

> 便携版的数据目录是 exe 旁的 `data\`；安装版在 `%APPDATA%\DSH Desktop\`。
> 若想强制指定 DSH 配置目录，启动前设置环境变量 `DSH_HOME` 即可（与 dsh CLI 行为一致）。

> **macOS 用户**：当前构建未做 Apple 公证，首次打开若提示“已损坏，无法打开”，
> 请先执行 `codesign --verify --deep --strict "/Applications/DSH Desktop.app"` 分型：
> v0.5.0 属签名缺失型（`xattr` 无效，需 `codesign --force --deep --sign -` 重签），
> 修复版本起属隔离属性型（`sudo xattr -cr` 即可）。
> 详见 [docs/troubleshooting.md](docs/troubleshooting.md) 的 macOS 专章。

## 跟随官方更新（用户同意后自动更新）

- 启动 15 秒后及此后每 6 小时，自动查询 npm 官方 registry 上 @deepseek-ai/dsh 的最新版本；菜单「帮助 → 检查更新…」可随时手动检查。
- 发现新版本时弹窗询问：**立即更新 / 跳过此版本 / 稍后**。
- 同意后，内置 node + npm 把官方新版本安装到用户数据目录的 `agent\`（overlay），全程写入 staging 目录，成功后才原子切换，失败自动保留当前版本。后续更新只下载差异（复用 npm 缓存）。
- 完成后提示**立即重启 / 稍后重启**，重启即用新版；启动时 dsh 路径解析优先使用 overlay、内置版本兜底。
- 若新版启动失败，启动失败对话框提供**「回退到内置版本并重试」**一键回退。
- 尊重用户 npm 配置：自定义 registry 镜像/代理请设 `NPM_CONFIG_REGISTRY`（如 `https://registry.npmmirror.com`）。

## 客户端自更新（封装层）

- 启动 60 秒后及此后每 12 小时，自动查询上游仓库的最新 release（**GitHub Releases → Gitee Releases 双源回退**；可用环境变量 `DSH_DESKTOP_RELEASE_API` 指向自定义镜像 API），比较当前版本。
- 发现新版本时弹窗询问：**立即更新 / 跳过此版本 / 稍后**；同意后带进度条下载安装包（便携版选 `*-win-portable-x64.exe`，安装版选 `*-win-setup-x64.exe`；Gitee 因单文件 100MB 限制拆分的 `.part1/.part2` 分片会自动按序下载并合并），下载到 `<数据目录>\updates\`。
- 确认重启后：**便携版**用 detached 脚本等待旧 exe 解锁 → 备份 → 原地替换 → 自动启动新版本（只读目录自动退化为直接启动新 exe）；**安装版**等待进程退出后以向导方式启动新安装包，安装完成后如果新版没有自动运行，脚本会从卸载注册表定位并显式启动新版本。启动更新脚本时会清除待安装标记，更新失败不会在下次启动反复弹同一个更新框。
- 菜单入口：chrome 栏 ⋯ 菜单 →「检查客户端更新…」；托盘菜单同样可用。跳过版本记录在 `settings.json`（`skipClientVersion`）。
- **更新源可见可复制**：⋯ 菜单内「更新源」区块与「关于 DSH Desktop」对话框展示两个项目仓库地址（GitHub / Gitee），一键复制到剪贴板。
- 链路自检：`node scripts/check-client-latest.js [--download]`（可设 `DSH_DESKTOP_RELEASE_API` / `PORTABLE_EXECUTABLE_DIR`）。

## DeepSeek 余额小部件

- 桌面端读取 `~/.dsh/.credentials.yaml` 的 `DEEPSEEK_API_KEY`（或环境变量），调用 `https://api.deepseek.com/user/balance`，每 3 分钟轮询，并在「启动 / 窗口显示 / 会话回合完成 / 页面加载 / 菜单开关」时触发刷新（30 秒节流；失败按 30s→1m→2m→5m 指数退避自动重试，成功即恢复），通过 preload 推送到 Web UI。
- 配套 dsh 客户端插件（`assets/plugins/dsh-balance`）在每次启动时自动同步进 web profile 并注册到 `conversation.composer.dock`，在对话底部统计栏内联显示：**本轮 ¥X.XX · 余额 ¥Y.YY**（本轮费用按 token 用量 × 价格档估算，缓存命中/未命中/输出分别计价；会话投影携带真实模型时按真实模型计价，否则明确标注「按默认模型估算」）。
- **OpenCode Go 订阅额度**：同一小部件内追加显示 `Go 5h x% 周 x% 月 x%`——调用 `https://opencode.ai/zen/go/v1/usage` 读取 **5 小时滚动 / 每周 / 每月** 三个窗口的已用百分比与重置时间；密钥取自 `OPENCODE_GO_API_KEY`（环境变量或 `~/.dsh/.credentials.yaml`，回退 OpenCode CLI 的 `auth.json`），未配置时自动省略该段。
- 价格档默认（2026-08-17 起峰谷定价，¥/百万 token）：deepseek-v4-flash 高峰 3/0.1/9、空闲 1.5/0.05/4.5；deepseek-v4-pro 高峰 9/0.3/27、空闲 4.5/0.15/13.5；deepseek-chat / deepseek-reasoner 为旧模型名别名。可在 `<数据目录>\settings.json` 的 `balancePrices.<model>` 覆盖。
- 代理/镜像环境变量：`DEEPSEEK_BALANCE_URL`（余额端点完整 URL）或 `DEEPSEEK_API_BASE`（自动拼接 `/user/balance`）；`OPENCODE_USAGE_URL`（OpenCode Go 端点完整 URL）。使用 `http://` 端点时 API Key 明文传输，桌面端会记录告警，仅建议用于本地代理。
- 不需要余额提示时：chrome 栏 ⋯ 菜单 →「显示余额/本轮费用」取消勾选，整个 dock 会隐藏（第三方中转/非官方直连用户推荐关闭）。
- 纯浏览器打开 Web UI 时无桌面壳推送，小部件只显示「本轮」费用（内置默认价格档）。

## 自定义注入提示词

- 入口：chrome 栏 ⋯ 菜单 → 设置 → 「自定义提示词」栏。
- 官方内核每次为会话注入的系统人设（persona，standard 预设默认）为：
  `You are a coding agent powered by the {{model}} model. Your working directory is {{cwd}}.` 本功能可让用户用自定义文本整体替换或在其后追加。
- **注入方式**（设置里可切换）：
  - **追加到末尾（append）**：保留默认人设，在其后追加自定义文本。
  - **替换整体（replace）**：用自定义文本整体替换默认人设。
- **生效范围**：应用到 standard 完整 Agent 基准预设；设置保存后新创建会话即刻生效，运行中会话沿用注入时的提示词。
- 自定义文本按原样注入，可用 `{{model}}` 等占位符；未启用或内容为空时回落为官方默认。

## 工作区锚点（workspace-anchor）

- 新增配套插件 `@deepseek-ai/dsh-workspace-anchor`：在每个 agent 的**稳定 system prompt** 中注入一段约 70 token 的工作区偏好，以 `{{cwd}}` 渲染真实工作区路径，每次请求重复、不被会话滚动或压缩吞掉。
- 锚点规则：默认在 cwd 内编辑/构建/交付；优先使用相对路径（工具会按 cwd 解析）；允许读取或搜索任何位置，但搜索命中的外部目录只是参考材料，不是新项目根；仅当用户显式指定路径或确有必要时才离开 cwd，随后返回。
- 纯提示词偏好，**不修改任何权限/沙箱行为**。
- `minimal-win`、`anchored-standard`、`zero-anchored-standard`、`whoami-standard`、`warmupbetter`、`warmupbetter-replay` 六个 complete-persona 预设会丢弃插件注入节，因此同一锚点已直接写入它们各自的 `agent.cordis.yml` persona 文本；`standard`、`code`、`router-standard`、`v4-flash-godmode-opencode-go` 等非 complete 预设由插件节覆盖。


## 识图插件（dsh-vision）

- 设置 →「识图插件（view_image）」：填写任意 OpenAI 兼容 VLM 的 **API 地址 / 密钥 / 模型 / 备用模型**，保存后热生效。
- 默认智谱免费 `glm-4.6v-flash`；也支持通义 qwen3-vl、Ollama 本地（`http://localhost:11434/v1`，无需密钥）等。
- 配置也可通过环境变量：`DSH_VISION_API_KEY`（兼容 `ZHIPUAI_API_KEY` / `DASHSCOPE_API_KEY`）。
- 会话中直接让模型调用 `view_image`：支持本地图片路径、http(s) URL 和 data URL。
- **文本模型也能发送图片**：发送入口检测到当前模型不支持图片输入时，自动复用本插件配置的 VLM 把图片转述为详细文字（含逐字 OCR）后再发送；模型支持图片时仍走原生图片通道。转述服务未配置/调用失败时会给出明确提示，不会静默丢图。

## 第三方模型思考强度

- 设置 →「第三方模型思考强度」。
- **默认关闭**：避免向百炼等严格校验请求体的第三方 API 注入 `reasoning_effort` 导致接口报错。
- 仅当 provider 支持时才开启；字段名可改为 provider 要求的名称，留空表示只显示档位、不注入参数。

## 插件市场（dsh-community-market）

- **市场整体切换**：设置 → 插件 → 市场页由 **[dsh-community-market](https://github.com/anywhere-labs/deepseek-harness-desktop/tree/master/dsh-community-market)**（anywhere-labs/deepseek-harness-desktop，MIT License）提供——开放目录源架构：内置 **DSH 1024Store** 与 **dshfind** 两个合作目录适配器 + 标准 HTTP 目录源，任何人都可以按公开 Schema（`docs/schemas/`）提供、接入和使用插件目录源；目录收录不代表审核或推荐。
- **搜索与安装**：分类/关键词搜索，一键安装走 npm registry 精确版本 + 完整性校验（tarball SHA 校验、禁装产品包/生命周期脚本防护），安装失败自动回滚；启停 / 卸载与安装回执管理。
- **桌面服务桥**：随包内置 `dsh-market-desktop-bridge` 配套插件，为市场提供 `desktopProfiles` / `desktopPnpm` / `desktopPlugins` / `desktopActions` 四个 host 服务——包操作转 `dsh plugin` CLI 重入（含 pnpm 兼容恢复），启停读写 `cordis.patch.yml`（与壳层插件管理页双向兼容），重启经壳层监管通道（`window.dshDesktop.restartService`）原地拉起。
- 市场与桥以 bundle 形式随桌面端分发（`assets/plugins/dsh-community-market` + `assets/plugins/dsh-market-desktop-bridge`），启动时自动同步进 web profile；历史内置市场（zat-dsh-engine → dshmarket）的存量装配由同步链一次性退役清理。
- 上游市场的目录源契约与适配器开发文档见包内 `docs/`（catalog-provider-contract / catalog-adapter-guide / install-and-uninstall）。

## 侧边栏工作台（dsh-better-sidebar）

- [omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)（MIT）内置：会话隔离的 VSCode 式右侧边栏（资源管理器 / 编辑器 / 终端 / Git / 浏览器），并开放服务供其他插件注册边栏页与文件查看器。
- 以 bundle 形式随桌面端分发（`assets/plugins/dsh-better-sidebar`，含 LICENSE、预编译 lib 与源码）；启动时自动同步进 web profile。

## 桌面宠物（harness-pet）

- [cakeni/harness-pet](https://github.com/cakeni/harness-pet)（MIT）内置：会话旁的鲸鱼小宠物，素材与归因随包分发（`assets/plugins/harness-pet`）。
- 同样以 bundle 形式自动同步进 web profile。

## 对话节点导航条（dsh-navbar）

- [vlln/dsh-navbar](https://github.com/vlln/dsh-navbar)（MIT）内置：对话区右缘的节点串导航条——每 user 消息一个节点，悬停预览（6 行截断）、点击平滑跳转 + 品牌蓝高亮、连续悬停/滚轮切换、>11 节点自动滑动窗口、<2 条 user 消息自动隐藏；消息精选 pin（assistant 操作条 📌，精选轮次渲染为金色椭圆盘，状态按会话持久化）。实现 dsh-external/issues#144 规格，纯浏览器端 bundle（`assets/plugins/dsh-navbar`，含 LICENSE 与预编译 lib），启动时自动同步进 web profile。
- **取代** `dsh-conversation-tweaks` 内置的会话右侧导航滑轨（dct-rail，已移除），对话区右缘导航由 dsh-navbar 统一提供；conversation-tweaks 保留「隐藏对话输出」能力。

## 侧边临时会话（dsh-side-session）

- [hzhz314159/dsh-side-session](https://github.com/hzhz314159/dsh-side-session)（MIT）内置：复刻 Codex 的「side session」——基于**当前主会话上下文**（对话记录 + agent 触及的文件）在独立浮窗里发起临时追问，答案只存在于临时会话，不写入主会话、不触发主会话工具。
- 浮窗可拖拽/缩放，默认收起不遮挡主界面；点击左侧 footer 的 💬 图标或 `Ctrl+Shift+S` 唤起。
- 三种回答引擎（互斥、持久化、即时切换）：复用 DSH 全局 Key / 插件自带 Key / 走宿主 LLM 服务（`ctx.llm`，不读任何 key）；流式输出，UI 与主界面同款设计令牌（深色/浅色自动跟随）。
- 上下文自动捕获：服务端解析会话日志 `session.jsonl.zstd`（zstd 帧扫描，容忍事件模型变更），含截断护栏（transcript 120 条 / 40K 字符、文件 200 个）。
- 以 bundle 形式随桌面端分发（`assets/plugins/dsh-side-session`，含 LICENSE 与 README），启动时自动同步进 web profile。

## 主动上下文压缩（billion-context-dsh）

- [Tyan66666/billion-context-dsh](https://github.com/Tyan66666/billion-context-dsh)（MIT）内置：**模型驱动的上下文压缩后端**（ACP，移植自 billion-context-pi，内核 acp-kernel 复用）——由模型决定何时压缩、压缩什么，替代自动摘要式压缩。
- 给模型四个工具：`compress`（模型自写摘要遮蔽 seq 范围，**无第二次 LLM 调用**）/ `decompress`（从会话日志恢复原文）/ `search_context`（块内检索）/ `acp_status`（块账本与上下文压力）；另有 `/acp` 命令。
- 自动策略只 nudge（`agent/pre-step` 注入建议，非强制）；原文保留在 append-only 日志，支持分层蒸馏（T2/T3）与重启后账本重建。
- 以 bundle 形式随桌面端分发（`assets/plugins/billion-context-dsh`，含 dist 与私有依赖 acp-kernel），启动时自动同步进 web profile；已按官方建议在 profile patch 禁用 `compaction-basic`（同一 realm 仅保留一个压缩后端）。

## 对话删除与归档管理（dsh-session-manager）

- 内置配套插件（本仓库实现，MIT）：dsh 官方只有「归档」没有「删除」，本插件补齐两条入口：
  - **会话行 ⋯ 菜单「删除对话」**（位于「归档会话」下方，所有会话行均显示）：确认后经宿主 RPC 删除该会话日志与附件（**正在运行**的会话会被拒绝），列表实时移除；
  - **设置 →「归档对话管理」**：列出全部已归档对话（标题/项目/更新时间），每条提供「恢复」（回到原工作区与顺序）与「删除」。
- 实现依赖 `scripts/patch-session-manage.js` 在启动/打包时对官方包做幂等补丁（`dsh-workspace` unarchiveSession、`dsh-host-apiproxy` unarchiveSession/deleteSession RPC、`dsh-client-connection` API 面与 schema、`dsh-client-ui-workspace` 菜单项）；状态更新走官方 host 帧，无需重启服务。

## 稳定性与兼容性（0.3.6）

### v0.3.6

- **插件市场整体替换为 Zat-DSH Engine（MIT）**：移除旧 `@deepseek-ai/dsh-plugin-marketplace` 的同步副本与 patch 条目，新增 `zat-dsh-engine` bundle；`zod` 作为显式依赖随包分发。
- **客户端更新「立即重启后仍提示待安装」闭环修复**：settings 原子写 + 回读校验、记录安装尝试、启动识别「客户端更新未完成」并支持重试/日志/稍后；NSIS 脚本失败或取消时自动拉起旧版本。

### v0.3.4 修复版

- **目录选择器（选择工作区 / 添加文件夹）崩溃**：根因是 koffi 3.1.3/3.1.4 win32-x64 预编译二进制损坏。本版锁定 `koffi@3.1.5`（上游已回退 Windows 原生编译），并在每次启动前做 FFI 预检；预检失败自动降级为浏览器内 browse 目录选择器，不再弹「无法打开文件夹」。
- **`directory picker failed: ... worker exited before reporting a result` 报错无信息**：目录选择器 worker 无消息退出时，错误文案现在带真实 exit code / signal。
- **DeepSeek Harness 启动失败（dsh web 退出码 1）**：插件树加载失败时自动解析问题插件、写入安全 overlay 并重试（不修改用户配置）；`EPERM: operation not permitted, symlink` 场景自动改名备份并重建 profile 目录联接；启动失败弹窗直接附带 `dsh-web.log` 最近日志。
- **部分用户设置页看不到插件设置（识图 / 自定义提示词 / 思考强度 / 插件市场）**：设置命名空间白名单补丁现在覆盖内置 app、profile fallback 与 agent 更新 overlay 三处运行副本，更新过 agent 的机器也会正常显示。
- **伴侣插件同步**：patch 中已存在（含用户手动 disabled）的条目不再被自动重插，避免重复 id 与「禁用后又被加回来」。
- **全新 DSH_HOME 首次启动失败（退出码 1）**：`syncCompanionPlugins` 不再预写只含 bundle 插件的 profile manifest；全新环境先写入经实测可解析的 dsh 出厂核心 bundles（dsh-base / dsh-web-app）再追加 bundle 插件，解析不到则交由 dsh 自行初始化。

### 既有稳定性能力

 - **渲染进程崩溃自动恢复**：`render-process-gone` 后指数退避重载（0.8s 起步，封顶 15s），连续失败第 3 次重建 BrowserWindow（保持隐藏/托盘状态）；超过上限显示本地恢复页（重新加载 / 重启客户端 / 打开日志）并通知；稳定存活 30s 才清零计数
- **渲染心跳与假死恢复**：preload 每 5 秒上报心跳，主进程 30 秒未收到则恢复；`unresponsive` 15 秒后同样恢复。
- **会话历史兼容**：打包时 `afterPack` 自动修补内置 `@deepseek-ai/dsh-session` 事件词汇表，接受 dsh-agent-teams / dsh-message-edit / dsh-web-search-exa 的事件，修复 `SessionFormatUnsupportedError`。
- **内置 Agent 预设（8 个）**：`minimal-win`、`router-standard`、`anchored-standard`、`zero-anchored-standard`、`whoami-standard`、`v4-flash-godmode-opencode-go`、`warmupbetter`、`warmupbetter-replay`，打包时自动写入内置 dsh CLI；详细来源与许可见 [docs/agent-presets.md](docs/agent-presets.md)。
- **dsh-routing-suite**：`router-standard`（官方 API flash 方案）与 `dsh-super-injector` 的 `dev_*` 注入/热重载/自愈工具一并内置。
- **dsh-anchored-standard**：`anchored-standard` / `zero-anchored-standard` / `whoami-standard`（官方 API pro 方案）三个实验性预设一并内置。
- **opencode-go 预设**：`v4-flash-godmode-opencode-go`（flash）与 `warmupbetter` / `warmupbetter-replay`（pro）内置。



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
npm install                    # 安装内核 @deepseek-ai/* 依赖（postinstall 自动跑 patch-deps 打构建期补丁）
npm run fetch-runtime          # 内置 node.exe + npm CLI（构建与开发都需要）
npm test                       # 全量测试（node --test 自动发现 scripts/test/*.test.js）
```

> 开发运行与打包都在**桌面壳侧**（`dsh-tauri/`）：本包 `package.json` 没有 `start` / `dist` 脚本
> （原 Electron 壳已下线，照旧命令跑会直接报 `Missing script`）。
> 现行入口（与 `dsh-tauri/docs/development.md` §6 一致；每步 cwd 不同，不要连着粘贴执行）：
>
> ```powershell
> cd ..\dsh-tauri\src-tauri\src\app ; cargo run                        # 开发运行
> cd <仓库根> ; bash dsh-tauri/scripts/stage-payload.sh                 # ① 内核 payload 暂存
> cd dsh-tauri ; npx --yes @tauri-apps/cli build `
>   --config src-tauri/src/app/tauri.conf.json --target x86_64-pc-windows-msvc  # ② NSIS
> ```
>
> 完整流程见 `dsh-tauri/README.md` 与 `dsh-tauri/docs/development.md`。

> 网络受限时：依赖拉取走 `.npmrc` 的 registry 镜像（`scripts/fetch-*.js` 会遵循它）；
> 原先的 `ELECTRON_MIRROR` / `ELECTRON_BUILDER_BINARIES_MIRROR` 与 `npm run electron:fetch` 均已失效，
> 随 Electron 壳一起下线，不再需要。
>
> 开发辅助脚本：`node scripts/check-latest.js`（检查/试装更新）、`node scripts/test-watcher.js`（通知检测单测）、`node scripts/inspect-session.js <file>`（会话日志事件词表）。

## 架构

```
┌──────────────────────────────────────────────────────────┐
│  Tauri 壳（Rust，dsh-tauri/src-tauri/src/app）             │
│  · 单实例锁 / 窗口 / 菜单 / 生命周期                       │
│  · 会话完成监听 (session-watcher.js) → 系统通知            │
│  · 官方更新 (commands/updater_client.rs) → 用户同意后装 overlay │
│  · spawn vendor|resources 里的 node.exe                   │
└──────────────┬───────────────────────────────────────────┘
               │  dsh web --host 127.0.0.1 --port <上次保存的端口>
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
| 稳定复用上次端口 + 解析 stdout | 优先复用 settings.json 中的 `webPort`，保持 origin 稳定以持久化 Web UI 的 localStorage 偏好（如会话分组）；被占用时自动换新端口 |
| 退出时 `taskkill /T /F` | dsh 会派生 pwsh 等子进程，按进程树整体回收 |
| 更新走 overlay + staging 原子切换 | 更新失败零风险；便携版（资源每次从 exe 解压）也能持久更新 |
| 通知读会话日志而非 UI 协议 | 持久化格式是官方稳定接口；UI 的私有 RPC/SSE 协议随版本变化，容易失效 |

## 连接 WSL（WSL 托管模式）

壳支持两种后端：`local`（启动内置 dsh，默认）、`wsl`（壳经 wsl.exe 在 WSL 内安装/更新/运行自己的 dsh）。选择方式：设置页「WSL 后端」栏（推荐，含状态展示与预检）、`settings.json` 的 `backend` 字段，或环境变量 `DSH_DESKTOP_BACKEND=local|wsl`。

### 把配套插件装进你自己 WSL 里的 dsh（可选，与后端模式无关）

如果你在 WSL 里另有自己装的 dsh（checkout 开发版或 npm 版）——壳自带的配套插件（余额、文件视图、终端、浮窗、插件市场、自定义提示词、工作区锚点、第三方思考、识图等）是壳私有打包的（不进 npm），想让它也用上，在 WSL 里执行：

```bash
node dsh-desktop/scripts/sync-companion-plugins.js ~/.dsh --with-patches
```

（`--dry-run` 可先预览；`--with-patches` 额外应用「会话列表闪跳修复 + 设置暴露白名单」两个运行时补丁，否则自定义提示词/第三方思考的设置页可能显示「设置不可用」。脚本同时会把壳内置的 8 个 Agent 预设同步进能找到的 dsh 包 `config/agent-presets`——`<DSH_HOME>/agent`（如 WSL 托管布局的 `~/.dsh-desktop/agent`）与 PATH 上的 dsh 命令会自动探测，其它安装位置可用 `--dsh-package <dsh 包目录>` 显式指定。）插件与预设都在 **dsh web 重启后**才挂载（profile 补丁层与包内预设目录在启动时读取）：重启 `dsh web`（checkout 开发模式 `pnpm dsh web`；npm 安装版 `dsh web`），注意会中断正在跑的会话（会话数据在磁盘上，可继续）。终端插件在 POSIX 下自动使用 `sh -i`，其余插件跨平台。卸载：删掉 `cordis.patch.yml` 中对应 `insert` 条目与 `profiles/web/node_modules` 下的对应包目录即可。

### wsl：壳在 WSL 里托管自己的 dsh（自动更新全闭环）

不想借用已有 dsh、又想要 Windows 原生窗口 + 自动更新？选 `backend: "wsl"`：壳经 `wsl.exe` 在 WSL 里**安装、同步插件、启动、更新**自己的一套 dsh，与 local 模式体验一致。

- **设置页入口（推荐）**：设置 → 「WSL 后端」栏——切换 local/wsl 模式、填发行版与安装目录、查看当前 WSL 状态（发行版/node/npm/agent 版本与检测错误）、「重新检测」按钮；保存后重启应用生效（切换前会预检一次 WSL 连通性，错误直接显示在页面上）。纯浏览器打开时该栏显示「仅在 DSH Desktop 客户端中可用」。
- 配置（`settings.json` / 环境变量，均可手填；设置页写的也是 `settings.json`）：
  - `wslDistro`（`DSH_DESKTOP_WSL_DISTRO`）：发行版名，默认 `wsl -l -q` 第一个；
  - `wslInstallDir`（`DSH_DESKTOP_WSL_DIR`）：WSL 内安装目录（Linux 绝对路径，**不含空白**），默认 `~/.dsh-desktop`——刻意不默认 `~/.dsh`，避免与你自己的 dsh 共用 DSH_HOME 互相改写 profile；想共享会话就显式设成 `~/.dsh`；
  - 前置条件：WSL 内要有 node + npm（`sh -lc 'node --version'` 能出结果即可，fnm/nvm 皆可；缺失时保存配置会提示、启动会弹窗引导）。
- 首次启动流程：显示加载页 → 探测 WSL/node → 缺 agent 时在 WSL 内 `npm install @deepseek-ai/dsh@<内置版本>`（约 2–3 分钟，之后复用 npm 缓存）→ 配套插件经 UNC 同步进 WSL profile、内置 Agent 预设经 UNC 写入 WSL agent 包 `config/agent-presets`（与 local 模式列表一致）→ 运行时补丁覆盖 WSL profile/agent → `wsl.exe -e sh -lc` 启动 `dsh web --host 127.0.0.1 --port 0` → 解析就绪 URL（与 local 同规则）→ Windows 经 localhost 转发加载窗口。
- 目录布局（WSL 内）：`<dir>/agent`（当前版本，`DSH_HOME=<dir>`）、`agent-prev`（回退）、`agent-staging`（更新中转）、`dsh.pid`（退出清理）、`profiles`/`sessions`（数据）。
- **自动更新**：检查仍在 Windows 侧（npm registry 查询），安装走 WSL 内 npm（staging + 原子切换，失败自动保留旧版），重启应用生效；启动失败弹窗可「回退到上一版本」。
- 退出/重启服务：按 `dsh.pid` 发 SIGTERM 优雅收尾（绝不 `wsl --terminate`）；插件市场的「重启服务」在托管模式下可用（重启 WSL 内的 dsh web）。
- 会话通知、余额小部件、文件 diff 查看照常（经 UNC 直读 WSL 文件）；「文件」视图的还原/打开仍是 Windows 本地功能，不适用于 WSL 会话。
- 已知边界：Windows 侧访问依赖 WSL2 的 localhost 转发——**推荐**在 `.wslconfig` 设 `[wsl2] networkingMode=mirrored`（Win11 22H2+）走 localhost 直连，根治 NAT 转发的偶发断线/输出中断；未 mirrored 时壳也不再因转发抖动误杀 WSL 内还活着的内核（断线后前端重连同一内核续上，详见 docs/wsl-verification.md 常见问题）；`wslInstallDir` 路径不能含空格。

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
- **历史会话打不开（`SessionFormatUnsupportedError: ... unknown to this harness and not marked ignorable`）**：dsh-agent-teams / dsh-message-edit / dsh-web-search-exa 等插件写入的自定义会话事件不在内置核心的事件词汇表内导致。v0.3.3 起打包时已自动修补内置 `@deepseek-ai/dsh-session`；旧版本无需重装，一条命令修复：`npx dsh-session-history-fix`（幂等，可重复运行；改完重启应用即可）。
- **无法打开文件夹（`directory picker failed: ... win32 folder dialog worker exited...`）**：v0.3.4 已根治（koffi@3.1.5 + 启动预检自动降级 browse 选择器）。旧版本请升级到 0.3.4。
- **启动失败（`dsh web 启动失败（退出码 1）`）**：v0.3.4 会自动进入安全模式或自愈并重试，弹窗内直接显示最近日志。日志出现 `plugin tree failed to load` = 插件配置不兼容（自动禁用问题插件）；出现 `EPERM ... symlink` = 目录联接被拒（自动备份重建）；日志戛然而止且退出码 `3221225477`（0xC0000005）= koffi 原生崩溃（0.3.4 已换修复版）。
- **安装后启动即弹「应用初始化失败：home is not defined」**：v0.3.8 已修复（启动路径上的 settings 注册防护函数 `applySettingsSectionGuard` 缺少 `home` 变量声明，启动必现崩溃）。请升级到 v0.3.8，或从 GitHub / Gitee release 下载最新安装包。
- **设置页看不到插件设置（识图插件 / 自定义提示词 / 思考强度 / 插件市场）**：v0.3.4 已修复 agent 更新后白名单丢失的问题；仍不可见时重启应用一次，必要时查看 `desktop.log` 中「提示词暴露补丁」记录。
- **客户端更新点了「立即重启」后仍提示有待安装的更新**：v0.3.4 起会识别「客户端更新未完成」并提供重试安装 / 打开更新日志；若反复出现，把 `%APPDATA%\DSH Desktop\updates\apply-update.log` 发给技术支持。
- **如何手动安装第三方插件**：推荐在设置页「插件市场」（Zat-DSH Engine）搜索并安装（支持 npm 包名、`github:owner/repo#分支` 与镜像源）；安装完成后按提示重启服务。如果本机另装了 dsh CLI，也可以执行 `dsh plugin --profile web add <包名或 github 源>`，效果相同。
- **端口被占**：应用会复用上次保存的端口；若该端口被其他程序占用，会自动选新端口并保存，无需手动处理。注意：端口变化会导致该次启动的界面本地偏好（如会话分组）重新初始化，正常重启不会发生。

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
├── assets/               # 加载页、更新进度页、恢复页、图标、托盘图标、配套 dsh 插件
│   ├── sponsor/          # 赞助收款码（支付宝 / 微信，「请作者喝咖啡」面板与本文档共用）
│   ├── agent-presets/    # 8 个内置预设（minimal-win / router-standard / anchored-standard / zero-anchored-standard / whoami-standard / v4-flash-godmode-opencode-go / warmupbetter / warmupbetter-replay），local 打包写入 / WSL 启动与更新时经 UNC 同步
│   └── plugins/          # dsh-balance / dsh-file-changes / dsh-vision / zat-dsh-engine / dsh-better-sidebar / dsh-navbar / harness-pet / dsh-super-injector / dsh-side-session / billion-context-dsh / dsh-wsl-settings（设置页「WSL 后端」栏）等，启动时自动同步进 web profile
├── scripts/
│   ├── fetch-node.js     # 内置 node.exe 复制脚本
│   ├── fetch-npm.js      # 内置 npm CLI 复制脚本
│   ├── build-icon.ps1    # 生成应用图标（透明圆角蒙版）+ 托盘图标
│   ├── check-latest.js   # agent 更新链路测试工具
│   ├── check-client-latest.js # 客户端更新链路测试工具
│   ├── patch-event-vocabulary.js # dsh-session 事件词汇表补丁（当前无调用方，接线随 Electron 壳下线 — 见脚本头 Status）
│   ├── install-minimal-win-preset.js # 内置 8 个 Agent 预设安装（sidecar cli.js / preset-heal / WSL 同步调用）
│   ├── test-watcher.js   # 通知检测单测
│   ├── sync-companion-plugins.js # 把配套插件与内置 Agent 预设同步进任意 dsh（独立于壳）
│   └── inspect-session.js# 会话日志解析工具
├── build/icon.png        # electron-builder 图标源
├── vendor/               # 内置 node.exe / npm CLI（fetch-runtime 生成，不入库）
├── electron-builder.yml  # 打包配置
└── dist/                 # 构建产物
```

## 第三方组件与许可

本项目使用了大量 MIT 开源项目，完整清单与许可文本见 [docs/attributions.md](docs/attributions.md)。
主要组件：[@deepseek-ai/dsh](https://www.npmjs.com/package/@deepseek-ai/dsh)（MIT）、[Zat-DSH Engine](https://github.com/mishibeikejie/zat-dsh-engine)（MIT）、[koffi](https://koffi.dev)（MIT）、Electron / Chromium / Node.js（各组件许可随包分发）等。`zat-dsh-engine` 的 LICENSE 与双语 README 随安装包一并分发于 `assets/plugins/zat-dsh-engine/`。

## License

MIT。基于 [@deepseek-ai/dsh](https://www.npmjs.com/package/@deepseek-ai/dsh)（MIT）。

# Changelog — DSH Desktop

DeepSeek Harness（dsh）的 Windows 桌面客户端：内置独立 Node 运行时与 dsh CLI，
一键启动 Web UI。


## [未发布] — Issue #9 渲染进程崩溃自恢复

### 修复
- **渲染进程崩溃后永久黑屏/白屏（0xC0000005）**：新增 `renderer-recovery.js` 自恢复状态机，主窗与会话浮窗统一接管：
  - `render-process-gone`（crashed/killed/oom）→ 指数退避自动重载（首次 0.8s，上限 15s + 抖动）
  - 连续失败第 3 次 → 主窗销毁重建 BrowserWindow（保持隐藏/托盘状态）；浮窗直接关闭
  - 失败超过上限 → 主窗切到本地恢复页（重新加载/重启客户端/打开日志），并弹系统通知；绝不无限循环
  - 页面加载成功后需「稳定存活 30 秒」才清零故障计数，杜绝「加载即崩溃」型循环
  - `clean-exit`、退出中、窗口已销毁一律不触发恢复；服务进程退出时交由既有重启对话框，不双弹窗
- **界面挂起（AppHangB1）无恢复**：监听 `unresponsive`，20s 宽限后强制终结 renderer 复用恢复路径；preload 每 5s 心跳兜底「挂起但无 unresponsive 事件」的场景（以 show/hide 事件追踪可见性，隐藏/最小化不误判，也不依赖在挂起/RDP 场景下会误报的 `isVisible()`）
- **加载失败白屏**：新增 `did-fail-load` 处理，服务健在时退避重试（覆盖插件市场重启间隙），`ERR_ABORTED` 忽略
- **崩溃无法取证**：固定 `crashDumps` 到数据目录并启用本地 Crashpad（`uploadToServer:false`），minidump 可离线分析 0xC0000005 底层来源；恢复状态写入 `run-state.json`
- **dsh web / 预览服务随机命中 Chromium 受限端口导致页面永远无法加载**：`--port 0` 可能选中 4045/6000 等受限端口（实测命中 4045，`ERR_UNSAFE_PORT`），现在命中即自动重启服务换端口（上限 4 次）

### 开发
- 新增 `scripts/test/unit-recovery.test.js`（node:test 状态机单元测试，17 例）与 `scripts/test/integration-runner.js`（真实 Electron 集成测试，10 场景：健康启动/崩溃恢复/重建/放弃/挂起/服务重启/进程被杀/浮窗/启动早期崩溃/受限端口重启，全部隔离 DSH_HOME 与 userData）
- 集成测试通道：`DSH_DESKTOP_TEST=1` 时经文件轮询下达命令（crash/kill/hang/quit…），renderer 崩溃时仍可用

## [0.3.2] — 2026-08-15

### 新增
- **内置识图插件 `dsh-vision`**（`assets/plugins/dsh-vision`）：为纯文本 DeepSeek 注册 `view_image` 工具，把图片与问题转发给任意 OpenAI 兼容 VLM 端点（默认智谱免费 `glm-4.6v-flash`，可换通义 qwen3-vl / Ollama 本地 / 未来 DeepSeek 官方识图 API），答案以文本返回；无需 API key 时按插件配置或 `DSH_VISION_API_KEY` 等环境变量取用。

### 修复
- **客户端自更新“点击重启后无任何反应”**：安装版/便携版更新脚本原来以含空格的完整路径作为 `cmd /c` 的第一个参数，会被 cmd 剥掉引号而静默失败；现在把工作目录切到 `updates` 并只传脚本文件名，更新安装器可正常拉起。
## [0.3.1] — 2026-08-15

### 新增
- **设置-通用「隐藏对话输出」**：一键隐藏模型长篇文字输出，仅保留工具调用、文件操作与结果等重要信息（`assets/plugins/dsh-conversation-tweaks`）。
- **会话右侧导航滑轨**：对话区右侧提供一条跟随会话长度的虚化滑轨；鼠标悬停时在鼠标位置显示垂直短横线预览目标位置，仅点击才跳转（同插件）。
- **便携版解压缓存**：portable 版首次启动后保留 `%TEMP%\dsh-desktop-portable` 解压缓存，后续同版本启动直接复用，避免 Defender 扫描 2.4 万文件造成的分钟级冷启动。
- **异常退出看门狗与恢复提醒**：安装版内置轻量看门狗；主进程异常消失时自动拉起应用，并在下次启动时发系统通知。

### 修复
- **会话浮窗空白**：修复 `display:none` 导致 CSS Grid 自动前移、会话列宽度为 0 的根因。
- **同一会话拖出两个浮窗**：主进程按 sessionId 去重复用已有浮窗；客户端拖拽增加节流。
- **后台完成不提醒**：仅主窗口可见且聚焦时抑制通知，最小化/隐藏/失焦时正常弹通知。
- **终端路由冲突残留**：清理旧 `@deepseek-ai/dsh-terminal` 私有包，启动时自动移除过期配套插件。
- **profile 链接损坏导致启动失败（退出码 1）**：启动前调用官方 `healProfilesModuleFallback` 自愈，自动移除被复制/同步还原成真实目录的 fallback 链接。
- **托盘偶发丢失**：每 30 秒检测并在不可用时重建托盘。

### 开发
- 新增 `scripts/patch-portable-template.js`、`watchdog.js`、浮窗诊断脚本 `_float-diag.js`。
- `npm run dist` 已内置便携版缓存模板补丁，直接打包即可。

## [0.3.0] — 2026-08-15

### 新增
- **第三方模型思考强度**（`assets/plugins/dsh-third-party-thinking`）：让接入的第三方
  OpenAI 兼容模型（pi-ai 自定义 provider / openclaw-bridge 等）也能在模型选择器右下角
  调整思考强度（off / high / max），与官方 DeepSeek 模型同一位置、同一交互。官方
  DeepSeek 模型行为不受影响，已声明 reasoning 的第三方模型保留原生元数据。
- **极简模式_win Agent 预设**：基于官方极简模式，将 bash 工具替换为 Windows PowerShell
  （`@deepseek-ai/dsh-tool-pwsh`），Windows 用户可直接使用。
- **自定义提示词「预览官方提示词」**：设置页自定义提示词区域新增按钮，点击显示官方
  默认系统提示词的渲染结果（只读），方便对比修改。

### 修复
- **插件市场搜索崩溃**：非 npm 来源（GitHub / deepseekdocs）的搜索结果会触发
  `Cannot read properties of null (reading 'version')`，已修复空值判断。
- **会话浮窗内容空白**：拖出会话到独立窗口后，若服务端会话列表尚未同步目标会话，
  会因 `unknown session` 导致浮窗空内容。现增加快照内会话存在性校验，确保目标会话
  已在列表中再执行选中。

### 优化
- **会话完成通知去重**：主窗口在前台时不再弹通知，同一会话 30 秒内最多弹 1 次，
  全局 15 秒内最多弹 1 次，避免连续刷屏。
- **安装包继续瘦身**：在 0.2.3 语言包裁剪 + 冗余文件清理的基础上，进一步优化
  after-pack 清理范围。

## [0.2.0] — 2026-08-14

### 新增
- **伴侣插件体系（一切插件化）**：新增 `assets/plugins/` 机制——宿主启动时把
  配套插件同步进 web profile（`~/.dsh/profiles/web`）并幂等打 `cordis.patch.yml`
  补丁启用。本版随客户端分发的插件：
  - `dsh-terminal`：会话内终端标签页（与 对话/轨迹/文件 并列）。在当前会话项目目录
    启动持久 PowerShell（SSE 流式，非 PTY），命令历史/清屏/重启/断线重连（保留
    512KB 回放）；显式 UTF-8 mini-REPL 规避 PS 5.1 重定向 stdin 的代码页问题；
  - `dsh-file-changes` + `dsh-client-file-changes`：会话文件修改追踪与一键还原。
    「文件」标签页聚合当前会话 agent 修改过的全部文件（新建/修改/删除 + 行级 diff），
    支持逐文件/全部还原（桌面壳做内容精确匹配后替换，冲突安全提示）。数据只读复用
    会话日志已持久化的 `tool/result.meta.diffs`（fs 写前锁内全文 diff），零写入、
    零格式变更；另提供项目文件树（`/api/dsh-files/list`）、站内 HTML/端口预览
    （`/dsh-files/static/*`、`ports`、`check`），全部仅回环；
  - `dsh-balance`：对话底部统计栏内联「本轮 ¥X.XX · 余额 ¥Y.YY」小部件
    （桌面壳读 `~/.dsh/.credentials.yaml` 调 `api.deepseek.com/user/balance`，
    15 分钟刷新，可配置价格档）；
  - `dsh-plugin-marketplace`：插件市场入口。
- **客户端自更新**（`client-updater.js`）：GitHub Releases → Gitee Releases 双源回退
  （`DSH_DESKTOP_RELEASE_API` 可自定义镜像），Gitee 100MB 分片自动下载合并；
  便携版原地替换 + 自动重启，安装版引导新安装包；失败自动保留当前版本。
- **跟随官方更新**（`updater.js`）：检测 `@deepseek-ai/dsh` 新版本，经用户同意后
  用内置 node+npm 安装到数据目录 overlay，staging 原子切换、失败回退、
  启动失败一键回退内置版本；尊重 `NPM_CONFIG_REGISTRY`。
- **会话完成系统通知**：agent 任务跑完弹 Windows 通知，点击回到窗口。
- **快捷键自动维护**：便携版自动创建/重建桌面+开始菜单快捷方式（exe 移动后自愈）。

### 说明
- 便携版数据目录跟随 exe（`data\`）；安装版在 `%APPDATA%\DSH Desktop\`。
- 与 dsh CLI 共享 `DSH_HOME`（默认 `~/.dsh`），已有会话/凭据直接生效。

## [0.2.1] — 2026-08-14

### 新增
- **会话分屏独立窗口**（`assets/plugins/dsh-float-window`）：会话头「弹出独立窗口」
  图标，或把侧栏会话拖出窗口边界，即可创建浮动窗口独立查看/操作该会话（同源镜像 +
  沉浸折叠，自动选中目标会话、折叠侧栏、隐藏标题栏）。最多 8 个浮动窗口，经 IPC
  `too-many` 校验防资源过载；全部浮动窗口共享同一会话数据源、各自独立选中态。
- **自定义注入提示词**（`assets/plugins/dsh-prompt-custom`）：设置页可自定义官方内核
  每次为会话注入的系统提示词，支持「替换整体 / 追加到末尾」两种方式（应用到
  standard 完整 Agent 基准预设），新会话即刻生效。配置持久化到 web profile 的
  `settings.yaml`（`dsh-prompt` 命名空间）。
- **插件市场多源聚合**（`assets/plugins/dsh-plugin-marketplace`）：搜索聚合
  npm registry、GitHub（`topic:dsh-plugin`）与 deepseekdocs 生态三源，各源独立熔断；
  结果展示来源徽标 / stars / GitHub 链接 / 版本；支持 npm 包名与 git spec
  （`github:owner/repo#branch`、`git+https`、`https`）安装。
- **请作者喝咖啡**：chrome 栏 ⋯ 菜单新增「请作者喝咖啡」，弹层展示支付宝/微信收款码
  （`assets/sponsor/`），对照 README「支持作者」小节。
- **官方峰谷计价**：`balance.js` 加入官方峰谷计价引擎（`PEAK_PRICES` /
  `LEGACY_PRICES` / `isPeakHour()` / `effectivePrice()`），余额小部件显示当前模型与
  峰/谷价格，v4-flash 底价同步至峰时费率。

### 变更
- **终端插件更名**：`dsh-terminal` → `dsh-terminal-tab`，修复与官方
  `@deepseek-ai/dsh-terminal` 同名导致的重复路由注册与预设加载失败。

### 修复
- **会话列表刷新闪跳**：选择工作区 / 切换模式 / 开启新对话后，UI 会瞬时闪回
  「选择工作区 / 无会话」状态。根因是官方 `dsh-client-runtime` 的
  `mergeOrderedBaseline` 在会话列表刷新时会丢弃「本地已创建、宿主全量列表尚未
  回显」的新会话，使 `current` 瞬时变 `undefined`。桌面启动时
  （`applyRuntimeFlashFix`）幂等地对运行时打补丁——保留 baseline 缺席的本地会话，
  下一次 baseline 带上该会话后自动收敛为官方值。dsh 包更新后会在下次启动重新应用。

## [0.2.3] — 2026-08-14

### 优化（缩小安装体积、缩短安装时长）
- **语言包裁剪**：`electron-builder.yml` 新增 `electronLanguages: [en-US, zh-CN]`，
  移除 Electron 其余 53 个语言包（.pak，约 80MB）。不影响功能与体验——右键菜单、
  DevTools 等界面语言随系统 locale 自动取 en-US/zh-CN。
- **冗余文件清理**：`scripts/after-pack.js` 在打包后递归清理纯冗余文件
  （源码映射 `*.map`、文档与许可 `README*/CHANGELOG*/LICENSE*/*.md`、TS 构建产物
  `*.tsbuildinfo/*.d.ts` 等），覆盖 `resources/app/` 与自带 npm CLI
  `resources/npm/`。绝不触碰任何运行时文件（`.js/.json/.node/.exe/.dll`），
  功能与体验完整保留。

### 说明
- 0.2.3 为安装优化版，功能与 0.2.2 完全一致（含浮窗会话、自定义提示词、
  咖啡二维码长条三项修复），仅体积与安装时长得到改善。

## [0.2.2] — 2026-08-14

### 修复
- **自定义提示词设置不可用 / 无法输入**：官方 `dsh-host-apiproxy` 只把白名单里的
  settings 命名空间暴露给浏览器端，`dsh-prompt` 默认不在白名单，导致设置页该栏只读
  （显示「设置不可用」，无输入框）。新增 `applyPromptExposeFix()`，启动时幂等地把
  `dsh-prompt` 追加进 `WEB_SETTINGS_NAMESPACES` 暴露白名单，使输入框可正常编辑保存；
  dsh 包更新后会在下次启动重新应用。
- **会话分屏浮窗内容为空 / 按键不响应**：浮窗早期会话服务未就绪时 `sessions.open()`
  会抛 `unknown session`，首屏未选中任何会话导致内容空白。改为浮窗 preload 在页面
  JS 运行前把目标会话预置进 `localStorage['dsh.sessions.current']`，应用一启动即带
  目标会话首屏渲染（与正常恢复会话同一机制）；`sessions.open()` 保留作兜底。
- **「请作者喝咖啡」展示优化**：由全屏遮罩 + 居中卡片改为点击 ⋯ 菜单后从右上角
  （标题栏下方）展开的一条可关闭长条，两个收款码并排显示，支持 × 按钮与 Esc 关闭，
  不再把二维码平铺到页面下方。

# Changelog — DSH Desktop

DeepSeek Harness（dsh）的 Windows 桌面客户端：内置独立 Node 运行时与 dsh CLI，
一键启动 Web UI。



## [Unreleased]

### 新增
- **对话删除与归档管理（dsh-session-manager 内置插件）**：dsh 官方只有归档没有删除，现补齐：
  - 会话行 ⋯ 菜单「归档会话」下方新增「删除对话」（当前会话行不显示）：确认后经宿主 RPC 删除会话日志与附件（**正在运行**的会话被拒绝），列表经官方 host 帧实时移除；
  - 设置 →「归档对话管理」面板：列出全部已归档对话（标题/项目/更新时间），每条提供「恢复」（回到原工作区与顺序，经 `workspace.unarchiveSession` 持久化并实时广播）与「删除」；
  - 实现：`scripts/patch-session-manage.js` 对官方包做幂等运行时/打包补丁（`dsh-workspace` WorkspaceRegistry.unarchiveSession；`dsh-session` Sessions.remove——从 live 注册表摘除、优雅 flush 后释放并广播 session/disposed；`dsh-host-apiproxy` 新增 workspace.unarchiveSession / workspace.deleteSession RPC——删除先查 agent 运行状态表（agent/status 事件维护，仅拒绝真正运行中的会话），再按 jsonl 布局移除 `<DSH_HOME>/sessions/<project>/<id>/`、摘除 live 会话、清理归档集并广播；`dsh-client-connection` API 面与 unary 响应 schema；`dsh-client-ui-workspace` 菜单项与中英文案）；`assets/plugins/dsh-session-manager`（bundle，设置面板 + `window.__dshSessionManager` 桥），启动/打包三路覆盖（dev / afterPack / 运行时），dev node_modules 已实测应用
  - 端到端集成场景 `session-delete-flow`：真实 RPC 链路验证 创建→归档→恢复→再归档→删除（目录消失 + 归档集清理）→空闲 live 会话摘除删除
- **对话节点导航条（dsh-navbar，vlln/dsh-navbar，MIT）内置**：对话区右缘节点串快速跳转 user 消息（悬停预览 6 行截断 / 点击平滑跳转 + 品牌蓝高亮 / 连续悬停与滚轮切换 / >11 节点自动滑动窗口 / <2 条 user 消息自动隐藏 / 消息精选 pin 按会话持久化），实现 dsh-external/issues#144 规格，纯浏览器端 bundle（`assets/plugins/dsh-navbar`，含 LICENSE 与预编译 lib）。**取代** `dsh-conversation-tweaks` 内置的会话右侧导航滑轨（dct-rail 已移除），conversation-tweaks 保留「隐藏对话输出」；`sync-companion-plugins.js` 的插件清单与 `lib/index.mjs` 复制规则同步补齐（该清单此前与 main.js 漂移，缺 better-sidebar / harness-pet，已对齐）
- **侧边临时会话（dsh-side-session，hzhz314159/dsh-side-session，MIT）内置**：基于当前主会话上下文在独立浮窗发起临时追问（答案不写入主会话）；💬 图标 / `Ctrl+Shift+S` 唤起；三种回答引擎（全局 Key / 插件 Key / 宿主 LLM）；zstd 帧扫描自动捕获上下文（含截断护栏）；bundle 随桌面端分发并自动同步

### 修复
- **存量坏 profile manifest 不自愈 → 启动必失败**（issue #16，PR #21）：旧版本（0.3.3/0.3.4）写坏的 `profiles/web/package.json` 中 `dsh.profile.bundles` 只有配套 bundle、缺少核心 bundles（`@deepseek-ai/dsh-base` / `@deepseek-ai/dsh-web-app`），核心服务无人提供，插件树永久 `N entries did not activate`。`syncCompanionPlugins` 现在对已存在的 manifest 做「校验 + 补齐」：把缺失且实测可解析的核心 bundles 补到列表最前，其余条目（含用户添加的）原样保留；健康 manifest 零写入（幂等）。核心逻辑抽为 `profile-manifest.js`（纯函数，含 `node --test` 单测 + 集成场景 `heal-stale-manifest`）
- **profile patch 同 id 重复注册 → 插件树崩溃**（issue #17，PR #24）：旧版本插件安装向 `cordis.patch.yml` 写入重复的 `- insert: - id: X` 块（或插件升级为 bundle 后 patch 残留行），cordis loader 抛 `duplicate loader entry id: X` 且永远无法自愈。新增 `profile-patch-heal.js`：启动时块级按 id 去重（保留首个、备份原文件）、把已升级为 bundle 的插件残留注册从 patch 层移除（`dropBlocksByIds`），并支持从 `dsh-web.log` 解析三种 loader 失败形态（hash / duplicate-id / 括号包名）映射回 patch 条目。含 `node --test` 单测 + 集成场景 `heal-dup-patch` / `heal-bundle-patch`
- **web-search「接口地址」填第三方地址仍被拼 `/messages` 按 Anthropic 协议请求 → 404**（issue #20，PR #22）：`dsh-web-search-deepseek` 的 baseURL 拼接归一化（尾斜杠不产生双斜杠；基址已含 `/messages` 不再重复拼接），HTTP 失败信息附上实际请求地址与协议契约指引（裸 404 变可自解的提示），设置页中英文文案明确「POST <基址>/messages」契约。补丁本体在 `scripts/patch-web-search-baseurl.js`（打包补丁与运行时补丁共用同一实现，覆盖内置副本 / profile fallback / agent overlay），含 `node --test` 单测（含本地 mock 服务的真实 HTTP 回归）与集成场景 `web-search-patch`
- **客户端自更新在中文 Windows 上解析失败**（`apply-update.ps1` 报 `Unexpected token '}'`，issue #23，PR #25）：更新脚本改为带 UTF-8 BOM 写出，Windows PowerShell 5.1 不再按系统 ANSI 代码页（GBK）误读中文注释导致换行符被吞、语法乱码；`buildNsisPs1()` 模板注释同步 ASCII 化，脚本在任何代码页与换行风格下均安全
- **桌面版默认启用硬件加速，修复软件渲染掉帧**（issue #26，PR #28）：移除无条件 `app.disableHardwareAcceleration()`（软件渲染导致 GPU 进程空转 ~40-60% 单核、设置页等整页重绘明显掉帧）。改为：默认硬件加速；仅当 `settings.json` 标记 `hardwareAcceleration:'off'` 时禁用；GPU 进程 60 秒内连续崩溃 3 次（`gpu-process-crashed` / `child-process-gone` 双事件去重）自动持久化降级标记并重启应用，保留崩溃日志与自恢复兜底。降级逻辑抽为 `scripts/gpu-crash-guard.js`（含 `node --test` 单测）
- **M3 主题管理器设置观察器防抖**（issue #26 附加项）：`assets/themes/m3-theme-manager.js` 的 `MutationObserver` 不再每批 DOM 变更都执行全文档 `querySelector`，改为 300ms 防抖（与 preload.js 中同功能实现对齐）
- **M3 主题全局过渡拖慢整页**（issue #26 附加项）：`body[data-m3-theme="m3"] * { transition-duration }` 默认 `transition-property: all`，每个元素的所有属性变化（含布局开销最高的 width/height/transform）都被动画化，M3 模式下掉帧显著。收窄为颜色类属性（背景/文字/边框/阴影/透明度/transform），保留主题切换的平滑变色意图，几何变化不再动画
- **WSL 模式「模式列表」比 local 少**（PR #29）：WSL 托管后端经 npm 安装的 dsh 是干净包，不含壳内置的 8 个 Agent 预设。`main.js` 在 WSL bootstrap 与更新后会经 UNC 把 `assets/agent-presets` 写入 WSL agent 包的 `config/agent-presets`；`scripts/sync-companion-plugins.js` 也自动同步预设（可 `--dsh-package <目录>` 显式指定）
- **本地模式 agent 更新后丢失壳内置 Agent 预设**：`updater.applyUpdate` 全新安装的 overlay 也是干净 npm 包，8 个壳内置预设同样缺失（WSL 同族问题的 local 半边）。新增 `syncLocalAgentPresets()`：启动与更新后把预设幂等补进「当前生效」的 dsh 包（overlay 优先，否则内置），三种布局（内置 / 更新 overlay / WSL）模式列表一致
- **识图 view_image 三个根因修复**（issue #33，PR #31 + #32）：① 旧模型（`glm-4v-flash` / `glm-4.1v-thinking-flash`）钳制 `maxTokens ≤ 1024` 并对 400 自动降档 1024 重试一次，400 code 1210 不再直接失败且 fallback 链持续生效；② 设置页保存不再把「等于插件默认值」的字段写进 `settings.yaml`（避免旧模型 maxTokens 2048 被写死固化）；③ `role('secret')` 的 apiKey 永不回显，留空 = 保持已存密钥，仅非空输入才写入（修复「改模型/地址后保存会静默清空密钥」）。新增 `scripts/verify-vision-upgrade.js` 交付前识图链路验证（插件完整性 / patch 唯一性 / 配置与模型上限兼容）
- **余额欠费误报「API key is invalid」**：第三方 provider（opencode 等）余额不足返回 401 + CreditsError 时被 `dsh-llm-pi-ai` 一律判 AUTH。新增 `scripts/patch-pi-ai-credits.js` 把余额判定前置到 401-AUTH 之前：欠费 → QUOTA（客户端显示真实原因），真 key 无效仍判 AUTH
- **便携版「有进程无窗口 / 双击无反应」**（issue #30）：① 便携版数据目录重定向提前到单实例锁校验之前——Electron 实例锁以 userData 为键，旧实现与安装版共用 `%APPDATA%\DSH Desktop` 锁，安装版在跑时双击便携版会静默退出；② 主进程启动期兜底：任何模块级 / 启动早期未捕获异常落盘 `<userData>/logs/startup-crash.log` 并在启动完成前弹可见错误框，杜绝静默失败
- **桌面版关闭到托盘后无法重新打开 / 桌面重复快捷方式**（用户反馈）：① `showMainWindow()` 防御性强化——窗口被销毁/未创建时重建主窗并加载 Web UI，隐藏/最小化时 restore+show+置顶聚焦；托盘左键/双击、`second-instance`（再次双击桌面图标）统一走该恢复路径并记录日志（此前托盘左键采用「可见则隐藏」双态逻辑，隐藏态误判会导致点按无反应；second-instance 对异常窗口状态无兜底）；② `maintainShortcuts()` 增加**快捷方式去重**——每次启动清理桌面与开始菜单中规范名（`DSH Desktop.lnk`）之外的同族快捷方式（Windows 自动重命名副本 `(1)`、手动“发送到桌面”副本、旧版残留），只保留一个；**安装版不再由壳层自动创建桌面快捷方式**（由 NSIS 安装器负责），仅便携版维护桌面快捷方式，消除「每次启动自动生成多个快捷方式」；标题栏 ⋯ 菜单与托盘菜单原有的「退出」「关闭时最小化到托盘」开关保持可用
- **打包前语法门覆盖补丁/自愈模块**：`scripts/check-syntax.js` 的入口清单并入 `profile-manifest.js` / `profile-patch-heal.js` / `patch-web-search-baseurl.js` / `gpu-crash-guard.js` / `install-minimal-win-preset.js` / `patch-deps.js` / `patch-pi-ai-credits.js` / `sync-companion-plugins.js` / `after-pack.js` / `patch-portable-template.js`，此类模块的语法/「async 与声明被拆开」问题在打包前即可拦截
- **启动提速**（PR #39）：① `repairProfileFallback` 增加健康快照（`profile-fallback-cache.json`，含 dsh 包签名）——依赖闭包未变、链接逐项校验通过时跳过耗时的 `import('dsh-app-boot')` + BFS + heal；dsh 升级后签名失效自动重算；② 配套插件同步（vendor 依赖与 lib/assets/src 递归目录、固定文件清单）逐文件比对 size+mtime，一致跳过写盘（复制改用 `preserveTimestamps`，确保二次启动命中跳过）；③ loading 窗口提前到启动最前段创建，用户第一时间看到「正在启动」，并同步提前装配渲染进程自恢复与挂起心跳（loading 阶段崩溃/挂起也有兜底）
- **router flash 等重负载场景掉帧 / 周期性假死**（issue #34）：① `harness-pet` 默认改为关闭（opt-in，设置卡可开启），且关闭时完全停掉 rAF 动画循环（此前隐藏状态下仍逐帧绘制 320x320 canvas）；② `dsh-conversation-tweaks` 会话滑轨的 MutationObserver 不再每 250ms 全量 `querySelectorAll + getBoundingClientRect`，改为仅在内容尺寸真实变化时重算标记位置；③ 修复 `syncCompanionPlugins` 自愈死循环——bundle 插件源缺失时不再被当普通插件写回 `cordis.patch.yml`（此前会注册不存在的包导致 dsh web 启动崩溃），并从 manifest bundles 移除（视为用户禁用）、清理 patch 残留注册（用户手写 config/disabled 覆盖条目保留）
- **Agent 预设很多时「上面的不显示」**（issue #36）：`dsh-client-ui-primitives` 的 Menu portal 弹层在条目超过视口时没有高度上限，`place()` 把整列推到视口上方、顶部条目被裁掉且无法触达。新增 `scripts/patch-menu-viewport.js`：portal 列表加 `max-height: min(calc(100vh - 24px), 560px)` + `overflow-y: auto`，y 夹紧按封顶后高度计算，任何视口高度下完整可用（打包 afterPack / 启动运行时 / dev node_modules 三路覆盖，含 `node --test` 单测）
- **第三方模型思考强度**（issue #37）：功能已就绪（`dsh-third-party-thinking` 默认关闭、可对支持的 provider 开启并把档位注入请求体）；设置页「请求字段名」提示补充 opencode-go 套餐内 DeepSeek Flash/Pro 的开启说明
- **桌面宠物原生置顶小窗**（harness-pet「主窗最小化后宠物消失」根治）：插件自带 Document PiP 独立窗口在 Electron 中不可用（`requestWindow` 抛 `Internal error: no window`）。改为主进程原生方案：  - `main.js`：新增 360×420 无边框透明置顶（screen-saver）不进任务栏的宠物小窗（与主窗共享分区/localStorage），位置经 `userData/pet-window.json` 持久化（跨屏校验 + 钳制回可视区，拖动 400ms 防抖保存）；IPC 双端契约：`chrome:pet-window`（open/toggle/state，校验主窗来源）、`pet:close`、`pet:move-to`（绝对目标位置，至少露出 80px）、`pet:set-auto-open`；主窗最小化且插件开启「最小化自动显示小窗」时自动弹出；before-quit 清理；复用 `guardWebContents` 与 `recovery.attach`
  - `preload.js`：`--dsh-pet=1` 模式检测 → 注入 `window.__DSH_PET__`、隐藏除宠物根节点外的全部界面、跳过自绘标题栏；桥接 `dshDesktop.petWindow`（open/toggle/isOpen/close/moveTo/setAutoOpen）；主进程 `pet:state` 转发为页面事件 `dsh-pet-state`
  - `harness-pet` 插件：原生桥优先（浏览器仍回退 PiP）；小窗布局（宠物贴底居中、气泡锚定鲸鱼正上方随大小自适应、齿轮右下角、面板内嵌）；双宠物互斥（小窗打开时主窗宠物/气泡/齿轮隐藏，含刷新后状态查询恢复，`applySettings`/`setDialogVisible` 共用可见性表达式）；拖动（小窗 = 绝对定位搬窗无抖动、主窗 = 取整落位）；朝向只越水平中线才调转（主窗视口中线 / 小窗屏幕中线）；会话跟随（共享 localStorage + storage 事件 + `sessions.open`）；新设置项 `autoDesktop`（最小化自动显示小窗，默认开）/ `sound`（状态跃迁 Web Audio 合成提示音：等待输入/任务完成，仅主窗、仅跃迁响一声、首状态不响）/ `labelSize`（提示文本字号 10–26px 默认 15px，四语言文案齐全）；提示文本 9 种状态前景/背景配色

## [0.3.8] — 2026-08-15

### 修复
- **安装后启动即报 `ReferenceError: async is not defined`**：`main.js` 中 `async` 关键字与 `probeOverlayAgent` 函数声明被注释行拆开，导致主进程模块加载失败。已重接 `async function`；新增 `scripts/check-syntax.js` 并接入 `prepack` / `predist`，打包前强制做入口 JS 语法检查与「async/await 关键字与声明被拆开」模式扫描，此类坏包无法再打包。
- **安装后启动即弹「应用初始化失败：home is not defined」**：`main.js` 的 `applySettingsSectionGuard()` 构造候选补丁路径时引用了未声明的 `home` 变量（相邻的 `applyProfilePatchGuard` / `applyWorkspaceSearchRailFix` 均有声明，唯独此处遗漏），`boot()` 无条件调用该函数导致每次启动必现初始化失败弹窗。已在该函数内补齐 `const home = effectiveDshHome() || path.join(os.homedir(), '.dsh')`，与相邻防护函数保持一致。

## [0.3.6] — 2026-08-15

> 注意：Zat-DSH Engine 市场替换与客户端更新闭环修复已合入 main，但本版本尚未发布；
> Gitee 分片合并脚本（merge.bat）已重写为 CRLF + ASCII 提示，修复换行符丢失导致
> `set FAILED` / `pause` 失效的问题。发布前请重新执行打包并核验全部文档链接。

### 新增
- **内置 Agent 预设扩充至 8 个**：按上游最新版本同步 `router-standard`（yjh051108/dsh-routing-suite）、`anchored-standard` / `zero-anchored-standard`（xiaobright/dsh-anchored-standard），并新增 `whoami-standard`、`v4-flash-godmode-opencode-go`（SheberDavid）、`warmupbetter` / `warmupbetter-replay`（0liveiraaa/myDshPresets）；每个预设目录附带上游 LICENSE/NOTICE，详见 `docs/agent-presets.md`
- **Gitee 分片合并脚本重写**：`scripts/fix-merge-bat.cjs` 生成 CRLF + ASCII 提示的 merge.bat，修复 `set FAILED` / `pause` 被 echo 吞掉的问题；README 下载说明同步修正
- **插件市场整体替换为 [Zat-DSH Engine](https://github.com/mishibeikejie/zat-dsh-engine)（MIT）**：移除旧 `@deepseek-ai/dsh-plugin-marketplace` 的同步副本与 patch 条目，新增 `zat-dsh-engine` bundle（社区目录 / 双语简介 / 一键安装更新卸载启停 / 网络自适应 / 自更新）；`zod` 转为显式依赖随包分发
- **新增内置 bundle 插件**：`dsh-better-sidebar`（[omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)，MIT，VSCode 式侧边栏工作台）与 `harness-pet`（[cakeni/harness-pet](https://github.com/cakeni/harness-pet)，MIT，桌面宠物）；`syncCompanionPlugins` 支持递归同步 `lib/assets/src` 目录，并为 profile 补齐 `schemastery / cosmokit / @standard-schema/spec` 内置依赖
- **文本模型自动识图**：`dsh-host-apiproxy` 发送入口在模型不支持图片输入时，自动复用已安装 `dsh-vision` 的 VLM 配置把图片转述为文字（含 OCR）后再发送；支持图片的模型仍走原生通道
- **第三方许可文档**：新增 `docs/attributions.md` 与 README「第三方组件与许可」，明确 Zat-DSH Engine、dsh、koffi、Electron、React、zod 等 MIT 组件来源

### 修复
- **客户端更新「点了立即重启仍弹出有待安装的更新」**：待安装标记原子写盘 + 回读校验；每次重启安装记录 `clientUpdateAttempt`，启动识别「客户端更新未完成」并支持重试 / 打开日志 / 24h 稍后；NSIS 更新脚本在安装器失败或被取消时自动拉起旧版本

## [0.3.4] — 2026-08-15（BUG 修复版）

### 修复
- **koffi 3.1.3/3.1.4 win32-x64 预编译二进制损坏**（目录选择器 worker 无消息退出、部分客户机器启动即崩）：`package.json` overrides 锁定 `koffi@3.1.5`（上游已回退 Windows 原生编译）；新增 `scripts/koffi-preflight.cjs`，启动前用内置 Node 做 FFI 冒烟，失败自动注入 browse 目录选择器 overlay
- **目录选择器 worker 崩溃后报错无任何诊断信息**：新增 `scripts/patch-deps.js`（postinstall / pack / dist 幂等补丁），worker 无消息退出时把真实 exit code / signal 带进错误文案
- **启动项配置生成错误导致整体打不开**：`dsh web` 退出码 1 时自动解析 `dsh-web.log` 中加载失败的 patch 插件 id，写入 `safe-boot.overlay.yml`（`dsh web --patch`）禁用后自动重试，不修改用户 patch 文件，并弹系统通知
- **EPERM: operation not permitted, symlink 导致退出码 1**：检测到 `profiles/node_modules` 目录联接创建被拒时，自动改名备份半成品缓存、重跑官方 `healProfilesModuleFallback` 重建联接并重试启动，不再需要客户手动按手册操作
- **部分用户设置页看不到插件设置（视图/识图/思考强度等）**：`dsh-host-apiproxy` 设置命名空间白名单补丁改为同时覆盖内置 app、profile fallback 与**更新后的 agent overlay** 三处副本，并锚定 `WEB_SETTINGS_NAMESPACES` 数组自身收尾插入；启动顺序调整为先修复 profile 联接再应用补丁
- **启动失败弹窗缺少日志内容**：失败对话框与「服务已停止」对话框附带 `dsh-web.log` 最近日志，客户截图即可定位
- **syncCompanionPlugins 覆盖用户禁用**：patch 中 id 已存在（含用户手写 disabled 条目）时不再自动重插，避免重复 id 与「禁用后又被加回来」
- **全新 DSH_HOME 首次启动必失败（退出码 1，插件树无法激活）**：`syncCompanionPlugins` 在 dsh 初始化 profile 之前预写 manifest 时，只写入 bundle 插件导致核心 bundles（dsh-base / dsh-web-app）缺失。现改为以实际将运行的 dsh 包为锚点实测可解析后，先写核心 bundles 再追加 bundle 插件；解析不到则不写 manifest，交由 dsh 自行初始化（PR #14）
- **客户端更新「点了立即重启仍弹出有待安装的更新」**：待安装标记改为原子写盘 + 回读校验；每次重启安装都记录 `clientUpdateAttempt`，下次启动若仍是旧版本则识别为「客户端更新未完成」，提供重试安装 / 打开 `apply-update.log` / 稍后（24h 不再打扰）；NSIS 更新脚本在安装器失败或被取消时自动拉起旧版本，避免“重启后应用消失”
- **渲染进程崩溃后永久黑屏/白屏（0xC0000005）**：新增 `renderer-recovery.js` 自恢复状态机，主窗与会话浮窗统一接管：
  - `render-process-gone`（crashed/killed/oom）→ 指数退避自动重载（首次 0.8s，上限 15s + 抖动）
  - 连续失败第 3 次 → 主窗销毁重建 BrowserWindow（保持隐藏/托盘状态）；浮窗直接关闭
  - 失败超过上限 → 主窗切到本地恢复页（重新加载/重启客户端/打开日志），并弹系统通知；绝不无限循环
  - 页面加载成功后需「稳定存活 30 秒」才清零故障计数，杜绝「加载即崩溃」型循环
  - `clean-exit`、退出中、窗口已销毁一律不触发恢复；服务进程退出时交由既有重启对话框，不双弹窗
- **界面挂起（AppHangB1）无恢复**：监听 `unresponsive`，20s 宽限后强制终结 renderer 复用恢复路径；preload 每 5s 心跳兜底「挂起但无 unresponsive 事件」的场景（以 show/hide 事件追踪可见性，隐藏/最小化不误判）
- **加载失败白屏**：新增 `did-fail-load` 处理，服务健在时退避重试（覆盖插件市场重启间隙），`ERR_ABORTED` 忽略
- **崩溃无法取证**：固定 `crashDumps` 到数据目录并启用本地 Crashpad（`uploadToServer:false`），minidump 可离线分析 0xC0000005 底层来源；恢复状态写入 `run-state.json`
- **dsh web / 预览服务随机命中 Chromium 受限端口导致页面永远无法加载**：命中即自动重启服务换端口（上限 4 次）；本地稳定端口选择也会避开受限端口

### 开发
- 新增 `scripts/test/unit-recovery.test.js`（node:test 状态机单元测试，17 例）与 `scripts/test/integration-runner.js`（真实 Electron 集成测试，10 场景）
- 集成测试通道：`DSH_DESKTOP_TEST=1` 时经文件轮询下达命令（crash/kill/hang/quit…），renderer 崩溃时仍可用

## [0.3.3] — 2026-08-15

### 新增
- **内置「极简模式_win」Agent 预设**：把官方极简模式的 bash/PTY 工具替换为 Windows PowerShell（`@deepseek-ai/dsh-tool-pwsh`），开发模式 `npm start` 自动安装，打包流程 `afterPack` 自动写入内置 dsh CLI。
- **内置 dsh-routing-suite**：`dsh-super-injector`（dev_* 注入器/自愈工具）作为 bundle 插件随包同步进 web profile；`router-standard` 预设随包写入内置 dsh CLI。
- **内置 dsh-anchored-standard**：`anchored-standard` 与 `zero-anchored-standard` 两个实验性预设随包写入内置 dsh CLI。
- **识图插件设置页**：`dsh-vision` 新增设置页，可直接填写 API 地址、密钥、模型、备用模型与请求限制；设置保存后热生效。
- **余额/本轮费用开关**：自绘菜单新增「显示余额/本轮费用」，第三方中转/不需要余额提示的用户可一键关闭整个统计 dock。
- **会话导航滑轨输入位置圆点**：每条用户消息在右侧滑轨上以圆点标出位置，内容或尺寸变化时才重算，滚动时不额外读取布局。

### 修复
- **客户端更新多源选择错误**：GitHub 与 Gitee 双源现在取版本最高的 release，而不是返回第一个可用源；修复 GitHub latest 落后时“内置在线更新失效、只能手动覆盖安装”。
- **插件市场安装报 `args fields do not match`**：`installPlugin` 的 Typert 描述符参数名从 `packageName` 对齐为宿主方法的 `spec`。
- **识图插件无法配置/加载**：修正 `dsh-vision` 的 peer 依赖（`@deepseek-ai/cordis`），补齐 `dsh.client` 清单与设置 UI，配置不再依赖手工写文件。
- **第三方模型思考强度默认不再破坏 API**：`reasoning_effort` 注入默认关闭，仅 provider 确认支持时启用；字段名留空表示只显示档位、不注入参数，避免百炼等严格接口报错。
- **会话导航滑轨**：滑轨固定到会话内容区右侧，并在滑轨上以圆点标出每条用户输入的位置；不再因 `position:fixed` 缺省位置偏到窗口左侧。
- **设置页出现两个「插件」栏**：移除 `dsh-super-injector` 重复注册的同名空白设置栏，设置导航只保留官方「插件」页（插件市场为其标签页）。
- **余额/本轮费用开关失效导致金额不显示**：`balanceDockEnabled` / `setBalanceDock` 曾被误放进通知点击回调的作用域，余额刷新与菜单开关运行时抛出 `ReferenceError`；现提升为模块级函数，dock 恢复显示且开关真正生效。
- **README 下载链接**：根 README 中英文下载链接从 0.3.1 同步为 0.3.3，并补充手动安装第三方插件说明。
- **服务启动失败弹窗叠加**：主进程对话框串行化，启动失败/更新/错误弹窗不会同时叠成多个。
- **「隐藏对话输出」按预期工作**：`dsh-conversation-tweaks` 设置命名空间加入浏览器设置白名单，开关保存后真正写入；开启时隐藏大量工具调用、工具结果与思考过程，每一轮最终总结输出仍然显示。
- **桌面端卡顿优化**：会话日志目录枚举改为 5 秒缓存并降低轮询频率；会话导航滑轨滚动事件合并到 requestAnimationFrame 并限频；M3 设置观察器防抖；高频重复的页面 warning/error 日志按签名节流，减少同步磁盘写入。
- **左侧会话分组偏好丢失**：`dsh web` 不再每次随机换端口，改为复用上次保存的 `127.0.0.1` 端口（占用时自动选新端口）。Web UI 的 localStorage 偏好（如会话分组方式）不再因 origin 变化而每次重置。
- **客户端更新“重启后不自动安装/重复弹窗”**：启动更新脚本前清除待安装标记，失败后不会再反复弹同一个更新框；安装版安装完成后会检测新版本是否启动，未启动则从卸载注册表定位并显式拉起；NSIS 明确开启 `runAfterFinish`。
- **插件事件导致会话历史无法加载**：打包时对内置 `@deepseek-ai/dsh-session` 事件词汇表打补丁（`afterPack` 自动执行；开发模式 `npm start` 同样幂等补丁），接受 dsh-agent-teams / dsh-message-edit / dsh-web-search-exa 写入的自定义会话事件，修复 `SessionFormatUnsupportedError: ... unknown to this harness and not marked ignorable`。
- **0.3.2 实际未随包携带「极简模式_win」**：该预设此前只写进了 changelog，本次补齐源文件与安装流程。


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

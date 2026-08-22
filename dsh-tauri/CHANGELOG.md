# Changelog

## [未发布] — 性能与资源占用审计根治（五大系列）

### 进程隔离：子进程等待全部挪出 UI 主线程
- **根因**：Tauri 同步命令在 UI 主线程执行——`run_sidecar`（插件/诊断/备份全族）、`copy_text`（每复制一次 spawn PowerShell）、`wsl_config_get`/`wsl_recheck`、`image_paste_save`、`restart_service`/`recovery_restart`（杀树段）一律 `.output()` 同步等子进程，node 冷启动数百 ms 起、插件检查/更新分钟级 → 整窗冻结（拖动/重绘/全部 IPC 派发停摆；menu.rs check-agent-update 注释记录的同一实测形态）。**修法**：统一 `async fn` + `tauri::async_runtime::spawn_blocking`（run_sidecar 串行锁语义不变，排队发生在后台线程池）；新增 `bounded::output_with_timeout`（超时强杀整树）作为壳内子进程唯一有界出口——AV/SmartScreen 拦半死不再永挂，boot 链单步 60s / 整链 120s / sidecar 命令 300s 有界
- **copy_text 双缺陷**：Windows 命令行 ~32K 上限使长文本（契约允许 1MB）直接失败 + PowerShell 按控制台代码页解析参数的非 ASCII 乱码面 → 改经 stdin 传 base64（纯 ASCII 代码页安全，UTF-8 精确还原），实测 90KB 中英混排往返逐字节一致

### 内核进程生命周期：双内核竞态 / Job 句柄泄漏 / 探活双连接
- **boot 竞态根治**：内核启动期退出时，崩溃自动重启臂（2s 延迟）与瀑布二层（重跑 boot 链）无互斥 → 两路各拉一个内核，后者覆盖句柄 → 前者成孤儿（数百 MB RSS 无人管直到进程退出）。**修法**：`boot_active` 互斥（BootActiveGuard，Drop 释放 + 代际感知防叠犬误清）+ `spawn_kernel` 前置回收不变量（并发违例时后来者杀先到者）。E2E 实测：伪仓库（假内核秒退 + 二层 boot 放大 5s）瀑布全程恰好 3 次 spawn（修复前 >3）
- **Job 句柄泄漏**：每次内核 spawn 泄漏一个 Job Object 句柄（进程生命周期不回收，崩溃环/瀑布重试下日积月累上千）→ 句柄随 `KernelProc` 存活、终结即 `close()`（壳存活期间在场，强杀兜底语义不变）
- **kill_kernel 锁外杀树**：持锁仅取句柄，taskkill（AV 下数百 ms）不再让探活节拍 / state() / kernel_url() 陪等
- **探活单连接三态**：原实现每拍开两条连接（TCP 试探 + http_alive 各一），健康稳态 ≈ 每天 5.76 万次环回连接 → `probe_outcome` 单连接三态（Alive/TcpDead/Zombie），连接数实测减半、判定口径逐态一致

### 桥垫片：iframe 守卫次序 + 监听器生命周期
- **iframe 重复壳机制**：Tauri initialization_script 注入所有同源 iframe，守卫却写在壳机制之后——每个 iframe 都装 5s 心跳 + 3s 会话轮询 + 4 个事件订阅（开销随帧数翻倍，iframe 心跳污染全局计数掩蔽主窗假死判定）。**修法**：`IS_TOP` 帧定位前置，壳机制（订阅/心跳/轮询/错误上报/控制条/自初始化）全部主框架独占；桥对象与 dialog polyfill 保留在所有帧（Electron 时代 iframe 本无桥，只会更好）。vm 沙箱行为测试：iframe 载入零 IPC
- **监听器泄漏**：`plugin:event|listen` 只增不减，每次导航/重载在 Rust 侧监听表留死条目（emit 向死句柄派发）→ pagehide 统一退订 + 清定时器（listen Promise 未决时 resolve 后补位退订）
- **心跳窗口归属**：心跳载荷带 `{window: main|float|pet}`，假死看门狗只统计主窗——全窗口共用计数时活的浮窗永久掩蔽死的主窗（漏恢复）

### 假死看门狗：最小化误判
- Windows 上最小化窗 `is_visible` 仍为 true，缺 `is_minimized` 检查时定时器节流（~1 次/分）被误判为心跳停摆 → 最小化期间每 ~5-6 分钟一次 `location.reload()` 风暴（SPA 状态丢弃 + 监听器累积）。**修法**：失联判定统一 `common::window_watchable`（可见且未最小化，与余额轮询暂停门单一口径）

### sidecar（Node）
- **模块懒加载**：全部子命令共用 `loadModules` 全量 require 15 模块（patch-registry 729 行等），每 3 分钟的 balance-fetch 也整套装载（58ms+/次，AV 机器放大；未消费模块缺失还直接炸命令）→ getter 懒加载，消费面零变更；实测最小 appDir（仅 balance 两件套）balance-fetch 正常
- **插件解压有界**：`Expand-Archive`/`unzip` 此前 `execFileSync` 无超时（AV 拦半死 → 更新链永挂 + Rust 侧串行锁被占死）→ `exec-bounded.js` 统一有界出口（120s，超时杀进程）
- **httpGetJson 字节上限**：元数据通道（npm latest / GitHub Releases，先于 integrity 校验）原实现响应体无限累积成字符串 → 4MB 上限（对照 httpGetBuffer 64MB / balance.js 1MB，该文件族唯一缺口）

### 壳层小项
- `app_init` 三键单次读盘（SettingsStore::get 每键全量读 settings.json，垫片每次载入 + 每次菜单打开都触发）
- `[diag] t0` 探针改 `DSH_TAURI_DIAG=1` 门控（原无条件执行：每次内核就绪顶掉真实会话指针 + preview-server 空转）
- 静态页目录（%TEMP%/dsh-tauri-pages-*）退出清理 + 启动清扫 7 天前残留（强杀形态此前无限累积）

## [0.5.2] — 2026-08-22

### 修复（用户实测反馈驱动）
- **频繁重启 + 白屏四根因根治**（14179788）：恢复页「重启内核」事件断链（内核就绪页面仍卡 loading）· 崩溃环冷却期仍后台反复拉起内核 · 假死探活重启后不重布+旧环补刀杀新内核 · KernelReady 双发与换页前无热探（chrome-error 页假健康）。真机复现前后对照：崩溃环后零后台拉起、恢复页重启 5 步上屏成功换页、二次假死均 60s 自愈
- **设置页读取不到 opencode-go 的 DeepSeek V4 Flash Vision Exp**（a3e73ae2）：pi-ai 内置模型目录落后于线上端点——runtime-patch 克隆同族条目补齐 image 输入，幂等、上游收录后自动退役
- **内存泄漏两处**：心跳监测线程随内核重启无限叠加（bf6c673 代数守卫）· 桥垫片控制条自愈重注样式叠注+订阅泄漏（6ad20af）；真机长时实测（菜单/赞助窗/设置/reload/压测/静置）裁定健康
- kill 目标 pid≤1 防御（68826305）

### 功能
- **Electron 余额生态全量收口**（cccedf27）：数据生产链接线（3min 轮询/可见性暂停/恢复回放）——此前 dock 恒走降级态；pr-107 代理隧道/mtime 缓存/暂停门移植；toggle 即时刷新
- **壳层预设全集迁移**（60d6f884）：boot 链 presets 步，8 预设含 router-standard 与 v4-flash-godmode-opencode-go（router 定性=reasoning 四档任务路由预设）

 DSH Desktop（Tauri 版，`tauri/modular` 分支）

## [未发布] — Windows 升级目录识别 + macOS arm64「已损坏」根治

### Windows：0.4.x Electron → Tauri 升级「无法识别旧版安装目录」根治

- **现象**：v0.5.0 NSIS 安装包升级安装时目录页默认 `%LOCALAPPDATA%\DSH
  Desktop`，认不出 Electron 线（0.3.x/0.4.x）的安装目录 → 老用户装出
  双安装（本机取证：Electron 在 `D:\app\dsh\DSH Desktop`，v0.5.0 装到
  `D:\app\DSH Desktop`）。
- **根因**：Tauri 模板 `RestorePreviousInstallLocation` 只认 Tauri 自写的
  `HKCU\Software\deepseek\DSH Desktop` 键；Electron 线写的是
  `Uninstall\62276e9d-c5f3-5091-b4ee-c7144d6db450`（appId v5 UUID）与
  `HKCU\Software\DSH Desktop`（INSTALL_REGISTRY_KEY），互不相识。
- **修复**：vendor NSIS 模板 `installer-template.nsi`（基线 tauri-cli
  v2.11.4，经 `nsis.template` 挂载，与上游 diff 仅一处守卫式挂载点）+
  `installerHooks.nsh` 新增 `DSH_DETECT_LEGACY_INSTALLDIR` 宏——Tauri
  自身键为空时只读探测上述两键 `InstallLocation`，归一化并校验旧目录
  标记（`DSH Desktop.exe` / `resources\node\node.exe` /
  `Uninstall_DSH_Desktop.exe`）后预填 `$INSTDIR`。**只读**：
  ReadRegStr/StrCpy/LogicLib/DetailPrint 以外零调用（v0.5.0 五轮安装器
  卡死的铁律），绝不移动/删除旧目录内容，不影响用户在目录页手改。
- **验证**：82k 行完整 installer.nsi 实编译 0 错 0 警；注册表场景夹具
  6/6（含 Tauri 键优先/无标记拒绝/兜底键）；passive 端到端装机落点与
  注册表记录均断言通过，且卸载器对旧目录残留文件零触碰。
- **v0.5.0 双安装用户**：数据不受影响（`~/.dsh`、`%APPDATA%\dsh-desktop`
  两版共用），手动卸掉两份安装之一即可（详见 upgrade-guide.md §5）。

### macOS 包完全无签名问题（v0.5.0 报「已损坏」且 xattr 无效的根因）

- **定性**：Tauri v2 在未配置 `signingIdentity` 且无 `APPLE_CERTIFICATE`
  环境变量时会**静默跳过整个 codesign 阶段**——v0.5.0 的 .app 内
  `_CodeSignature` 完全缺失（无 bundle 级密封），仅主二进制带 rustc/ld
  在 arm64 上自动打的链接期 ad-hoc 签名。Apple Silicon 内核强制代码签名
  + macOS Sequoia 起 Gatekeeper 对 quarantine 应用收紧，两重作用下系统
  报「已损坏，建议移到废纸篓」，且 `xattr -cr` 与右键打开均无效
  （右键绕过在 Sequoia 已被 Apple 移除）。此前 f8a5437 的指引只覆盖
  quarantine 型，对这型无效。已用 UDIF/HFS+ 解剖 v0.5.0 DMG 证实。
- **修复（构建配置显式化）**：
  1. `tauri.conf.json` 显式 `bundle.macOS.signingIdentity: "-"`（ad-hoc），
     由 Tauri 在打 DMG 前按由内向外顺序对 .app 做正规签名——payload 资源
     本就全部走 `bundle.resources` 通道在签名前打入，密封从此完整；
  2. CI mac job 新增 `Verify ad-hoc signature` 步骤：`codesign --verify
     --deep --strict` 校验，失败即回退 `codesign --force --deep --sign -`
     重签并重打 DMG——绝不再发出无签名 mac 包；
  3. 排障手册 macOS 专章改为先分型（`codesign --verify`）再对症：
     隔离属性型（xattr 可解）vs 签名缺失/密封破坏型（必须本机重签），
     README 提示同步。
- **用户侧过渡方案**（修复版本发布前）：本机执行
  `sudo codesign --force --deep --sign - "/Applications/DSH Desktop.app"` 后
  再 `sudo xattr -cr` 同路径即可救活 v0.5.0。
- **附带发现（发布卫生）**：线上 `DSH-Desktop-0.5.0-macos-arm64.dmg` 由
  09:01 的 workflow_dispatch 补传 run 重建，其时分支 `tauri.conf.json`
  版本已 bump——该「0.5.0」包内 Info.plist 实标 0.5.1（解剖所见）。后续
  补传应从对应 tag 的提交构建，避免版本错标。
- **长期**：取得 Apple Developer ID 后做正式签名 + 公证，下载即开。

## [0.5.1] — 2026-08-21 本地打包（预览版，不发布）

> 紧随 v0.5.0 的收敛版：内核家族随官方 deepseek-harness 1.1rc 平移，
> 并根治 v0.5.0 实测暴露的赞助窗、WSL、测试基建与假死误杀问题。
> **本版仅本地打包验证，不对外发布**（release notes 草稿见
> `docs/release-notes/v0.5.1-draft.md`）。

### 内核家族平移：0.1.0-rc.8 → 0.1.1-rc.1

对齐官方 release（github.com/deepseek-ai/deepseek-harness 1.1rc）：
`dsh-desktop/package.json` 的 19 个 `@deepseek-ai/dsh-*` 依赖整体平移。

- **dsh-file-changes 伴随插件适配投影 API v2**：`schema` → `stateSchema`、
  `view` → `wire:{viewSchema,view}`（内核投影契约变更，插件侧同步改写）。
- **supervisor 版本断言放宽**：`starts_with("0.1.")`——rc 通道内小版本
  迭代不再阻断启动（此前精确锚定单一 rc 版本，平移即拒启）。
- **已知降级（有意接受）**：billion-context 插件的 contextPressure 快照
  优化依赖的键在 rc.1 compaction 中已被移除；插件自身有 `typeof` 守卫，
  会优雅降级（不崩溃、不报错，仅失去「剩余上下文预估值」这一层优化）。

### 赞助窗三零依赖根治（eefc787）

「无图 / 卡死 / 关不掉」三症同源修复：`WebviewUrl::App` 编译期内嵌资产
（**零 file://、零本地端口、零磁盘写**——不再向 `%TEMP%\dsh-sponsor\` 落盘，
也不再借本地静态服务），独立线程建窗（避开主线程装配时序），
`initialization_script` 注入 data URI 二维码，无 `on_window_event`
（默认关闭即 destroy，规避 CloseRequested 内 destroy 的 UI 线程死锁）。
顺带根治 tauri 上游 #13419（测试 exe manifest 崩溃）在本项目的触发路径。

### WSL 双修

- **#132 pnpm 结构误判**（7f95f6b/c6c3b7c）：`resolveViaPnpmStore` 回落 +
  `realpathSync` 解析 + WSL UNC 路径 unverifiable 时登记防误删（解析受限
  保留 + 告警，不再当 UNRESOLVABLE 隔离）+ 历史误隔离自愈。
- **WSL 后端「假开关」根治**（061a8ba）：Tauri 版暂未实装 WSL 后端，
  设置项诚实提示「暂未实装」，不再呈现可切换的假状态。

### 测试基建修复（2f8bd5d）

T1 发现的 4 处测试基建 bug：smoke wait 死等（无超时）、shell.pid 取
winpid 口径错误、edge-client 沙箱 setTimeout 误用、两个过时 Electron
测试改锚（对齐壳退役后的现状）。

### 假死探活阈值 15s → 60s（8d19404）

上下文压缩（compaction）期间内核事件循环被占 20-30s 属正常形态，
15s 阈值会把正在工作的内核误判假死并杀掉重启——放宽至 60s。

### v0.5.0 tag 之后主干追加（随本版出包）

- **安装器卡死残余根治（$R9 双角色冲突）**：用户对 v0.5.0 安装包再次实测
  「安装卡住」——`$R9` 同时承担「模式（choose/purge）」与「信号（重扫/继续）」
  两个角色，第一个键处理完后两者互相覆盖 → choose/purge 逻辑互串空转死循环。
  修：信号改用 `$0`（`$R9` 专职模式，仅 ProcessLegacyDSH 写入）。
  makensis 编译 rc=0 验证通过。
- CI：Linux/macOS 构建修复（icon.png + 宠物窗 transparent() 平台条件编译）。

### 版本链

`tauri.conf.json` / Cargo workspace / `dsh-desktop/package.json` 统一
0.5.1；安装包产物 `DSH.Desktop_0.5.1_x64-setup.exe`（本地打包，不发布）。

## [0.5.0] — 2026-08-19 定稿 / 2026-08-21 发布 —— 首个 Tauri 对外测试版

0.1.0 的全部能力（Phase 0-4 实装 + 两轮 Review + 升级适配 + 启动稳定性 +
NSIS 打包链）之上，本轮聚焦实测缺陷根治与体验收敛：

- **三 bug 根治 / issue 扫荡**：实测驱动的缺陷修复（含内核版本错配
  （rc.7/rc.8 双形态锚点）、「客户端必须能打开」加固、幽灵环境变量等，
  详见 0.1.0 各节）+ 本轮新增：
- **关窗 → 托盘保活（语义变更）**：主窗 ✕ / Alt+F4 / 任务栏关闭 = **隐藏
  窗口留托盘**（后台常驻，内核继续跑，会话不中断）；托盘「退出」= 真退出
  （supervisor 杀树 + 单实例锁释放）。实现：`window_control close` 分支与
  `CloseRequested`（`api.prevent_close()`）统一走 `hide_main_to_tray`
  （隐藏前保存窗口状态）；renderer 心跳监测对不可见主窗不计失联
  （既有 `is_visible` 守卫，隐藏页垫片心跳照发、且不可见永不触发自动重载）。
- **沉浸标题栏**：bridge-shim 注入式标题栏（拖拽/最小化/最大化/关闭，
  loading/recovery 壳页与浮窗/宠物窗各有专属条不重复注入）。
- **装回旧目录**：NSIS 安装回 Electron 版同目录布局（注册表定位 +
  静默卸载保数据 + userData 零迁移直读，详见 0.1.0「升级适配」节）。
- **GUI 起 console 子进程全线抑制终端窗**（用户实测「启动后到处弹终端」）：
  `run_sidecar`（每个桥命令都走）、supervisor `run_sidecar_boot`（启动
  主源）、shell-core 陈锁回收 `tasklist`——全部补 CREATE_NO_WINDOW
  （explorer 为 GUI 程序无需）。
- 版本链对齐：`tauri.conf.json` 与 Cargo workspace 统一 0.5.0
  （安装包产物 `DSH Desktop_0.5.0_x64-setup.exe`；sidecar
  DSH_TAURI_VERSION 兜底同步 0.5.0-tauri）。
- **实测缺陷扫荡（issue #98/#104/#116/#124/#125/#128/#131/#134 等）**：
  agent 更新检查实装（exit→close + 重试 + npm registry latest 语义化比对，
  防镜像滞后降级误报）；image_paste_save 实装（剪贴板位图，U2 缺口）；
  插件更新流双修（registry 环境变量 + dsh.plugin.json 更新后丢失自愈）；
  farm 预设挂载失败去材料化；会话地图双层壳根治（iframe 守卫拦截壳注入）；
  内核页窗口控制条注入（拖拽/缩放/最大最小关全恢复）；内核假死探活
  （端口通、HTTP 无响应的 zombie 形态）；boot 步骤异常分级（「启动受阻」
  横幅根因之一）；会话删不掉双根因（ACL 端口通配 + 原生 dialog polyfill）。

### 发布链落地与 v0.5.0 发布

- **Electron 壳退役**：纯 Electron 壳文件（main.js / preload.js / updater.js /
  electron-builder 配置等）全面清理，仓库主线全面转向 Tauri 架构；
  `dsh-desktop/` 保留 scripts/ assets/ vendor/ 作为共享脚本层与内核 payload 源
  （sidecar 零重写复用）。
- **Tauri 三平台发布流水线**（`.github/workflows/tauri-release.yml`）：推 `v*`
  tag → 云端构建（Windows NSIS / Linux AppImage+deb / macOS dmg）→ 自动汇总
  发布 Release。关键纪律：三平台 vendor node 统一 v24.15.0、走完整
  stage-payload.sh（fail-fast 校验）、client-compat 构建失败即断（不再 WARN
  放行）。
- **v0.5.0 已发布**（2026-08-21，GitHub Release）：CI 产出
  `DSH.Desktop_0.5.0_x64-setup.exe`（win-x64 NSIS，LZMA ~87 MB）。Linux /
  macOS 产物流水线已接、本轮未产出，待后续版本。Gitee 镜像暂停留在
  Electron v0.4.1，Tauri 包暂未同步。

### 发布前四缺陷根治（实测驱动）

1. **安装器卡死（NSIS 三重修）**：
   - D1 代码走查（#134「卡在开始不动」，3 人复现）：LegacyHandleEntry
     出入口 Push/Pop 序列 off-by-one——Pop 恢复的是字符串而非索引 → 索引
     重置同键无限重扫（纯 CPU 空转无弹窗无进度）。修：彻底弃栈传值，
     改全局寄存器信号（每次迭代前清零）。
   - T3 实测复现（12 分钟真实安装器挂起取证）三修：LegacyStripQuotes
     「取尾字符」bug（`StrCpy $R3 $R3 1 -1` → `-1`）；handler 内误清模式
     变量致 choose 扫描全部执行 purge 逻辑；MessageBox 补 `/SD IDCANCEL`
     静默防御（/S 静默安装时 NSIS 默认返回 IDRETRY → 无限重试无 UI）。
   - V3 全量编译验证：`/SD` 参数必须在 MessageBox 文本串**之后**（NSIS
     语法），此前位置导致 makensis 编译阻断——修复后 makensis 完整编译
     （全宏展开 + 双 handler + 扫描循环）**0 错误 0 警告**。
2. **启动受阻（三修）**：① CI vendor node 版本漂移（v22.14 vs 本地 v24.15）
   → 三平台统一 v24.15.0；② client-compat 构建失败曾被 WARN 放行 → CI
   产物无 compat → 插件全灭——改 fail-fast；③ **P0 阻断回归**：updater.js
   随 Electron 壳退役删除后 sidecar 仍 require 致 boot 全断——sidecar 容错
   兜底。另加 **boot 链 5 分钟看门狗**：vendor node 被 AV/SmartScreen 拦到
   半死时 boot 线程永挂 loading 页（连恢复页都不出现）——超时且状态仍非
   Ready/Recovery 则转恢复页。
3. **赞助窗终修（关闭卡死 + 无图双根因）**：关闭卡死 = CloseRequested 回调
   内调 destroy() 导致 UI 线程死锁——移除自定义关闭处理器（默认关闭即
   destroy）；无图 = file:// 页引相对路径图片被 WebView2 拦、整页 data URL
   导航又受限——改「HTML 内联 data URI 图片写 `%TEMP%\dsh-sponsor\` 后
   file:// 加载」组合方案。原生标题栏（decorations+closable）+ 单例复用。
4. **高级设置栏目空白（三级回落链）**：根因链 = rc8 renderer 只导出
   apply/inject + 插件解构 undefined 不进 catch（回落是死代码）→
   useScope(undefined) 抛错 → 条目退位 → dead cell（「栏目在、点开空白」）。
   修：六插件三级回落 `renderer.useSyncExternalStoreWithSelector →
   web-react.bindSnapshotSelector → react 原生 useSyncExternalStore`；compat
   补 `--define:process.env.NODE_ENV=production`（静态消除 process 分支）+
   具名 re-export。浏览器实证（用户完整 profile 镜像）：自定义提示词
   0→153 字符、思考强度 0→328、识图 0→471，console 零错误。

### 万无一失检测（发版闸门，5/5 全过）

| # | 检测路 | 结果 |
|---|--------|------|
| 1 | Rust 全量 `cargo test --workspace`（18 套件，含瀑布破坏性实测与契约审计） | 142/142 ✅ |
| 2 | sidecar `node --test sidecar/cli.test.js`（沙箱 home 真机流程） | 13/13 ✅ |
| 3 | 共享 Node 脚本回归 `scripts/test/unit-*`（69 文件；3 挂为 Electron 壳退役后壳文件引用残留，非 Tauri 线缺陷） | 899 过 ✅ |
| 4 | NSIS 钩子 makensis 全量编译（全宏展开 + 双 handler + 扫描循环，安装器卡死类缺陷的静态防线） | 0 错 0 警 ✅ |
| 5 | 安装态冒烟 `smoke-installed.sh`（手拼安装布局 + 环境隔离 + 监听 PID 差集 + Job Object 零残留） | PASS ✅ |

### 验证

- Rust：**18 套件 142 过 0 挂 0 警告**（CI 环境跳过 4 个环境依赖集成用例后 138）
- sidecar：**13/13**（120s，沙箱 home 真机流程）
- 共享脚本：**unit 69 文件 899 过 3 挂**（3 挂均为 Electron 线壳文件引用测试，
  待随壳退役清理）
- 万无一失检测：**5/5 全过**（见上表）
- 端到端：loading → boot → 内核就绪换页真实 Web UI；端口稳定化两轮一致

## [0.1.0] — 2026-08-19

### Phase 0（契约 + 骨架 + 三 PoC）
- `contracts/` 五份契约单一来源（bridge-api 48 方法 / ipc-commands 43 通道 / data-flow / plugin-contract / error-codes）
- 7 crate 骨架（不依赖 tauri 运行时）+ 垫片 JS（48 方法，远程页注入）
- PoC-A/B/C 全部实测通过（详见 docs/migration-roadmap.md Phase 0 实测记录）

### Phase 1-4 全量实装（本日完成）
- **supervisor**：sidecar boot（repair→sync→patches→preflight）→ 安全端口（记忆
  复用，origin 稳定）→ 内核 spawn（`--no-open` 版本门控 + 环境白名单 +
  `DSH_DESKTOP_SUPERVISED`）→ 就绪行解析 → 主窗换页 → TCP 探活 → 崩溃环 →
  恢复页 + 系统通知 → 原地重启（代际号防旧任务复活）
- **sidecar/cli.js**：boot / 插件管理六通道 / 诊断备份族 / WSL，全部复用
  `dsh-desktop/` 纯 Node 模块（integration、plugin-manager-*、desktop-*、updater），零逻辑重写
- **桥命令全量**：43-2 通道注册（唯一裁撤 guard:action）；契约审计测试固化防漂移
- **多窗**：浮窗（同会话复用 + 上限 4 + localStorage 预置 + 24px 浮条）、宠物窗
  （透明置顶 + 模式注入）、赞助窗（二维码 base64）
- **托盘 + 通知**（显示/日志/退出；崩溃环通知）
- **围栏**：file_open/file_revert 限 dsh home（穿越拒绝）；preview-server 静态服务
  （`..` 组件 403）
- **窗口状态记忆** + 导航围栏（仅 127.0.0.1）
- **updater**：tauri-plugin-updater 接入（minisign 签名链，fail-closed；
  发版流程见 docs/release-keys.md）

### Review #1（功能/契约对照）
- 抓到并修复 `file_open` 命令名漂移（注册名与契约/垫片不一致会导致 404）；
  新增 3 个契约审计测试（注册面 ↔ 契约表机器核对）
- 垫片 vs preload.js 机器 diff：39/39 通道方法 + 4/4 事件 + 1/1 本地方法
- sidecar 实动：boot 4 步 / 插件 37 / set-enabled 可逆往返 / 诊断三连 / 备份导出
- 端到端两轮实跑（含 PoC 回归 10/10）

### Review #2（安全/边界/并发）——发现并修复 5 项
1. `open_external` 的 `cmd /C start` 参数注入面 → PowerShell `Start-Process`
   单引号转义
2. `file_open` 路径 shell 元字符拒绝
3. sidecar 跨进程并发竞写 `cordis.patch.yml` → 全局串行锁
4. 单实例锁 `forget` 不释放 + 强杀残留死锁 → 进程级生命周期 + 陈锁 pid
   检测回收（+2 测试）
5. **强杀孤儿内核**（实测端口泄漏）→ Windows Job Object
   `KILL_ON_JOB_CLOSE`（+1 测试；实测 taskkill /F 强杀壳后端口零残留）
   另：`RunEvent::Exit` 兜底杀树

### 功能测试补强（全项目）
- Rust **18 套件 93 测试全绿 0 警告**（自 65 补至 93）：
  - supervisor 真机集成 ×3（boot 链沙箱建档 / boot→内核→就绪→TCP 全链 15s / 代际号）
  - commands 纯逻辑 ×7（b64 RFC 向量 / 日期算法 / 原子写 / 备份择新 / file_revert 围栏+幂等+越界拒绝 / sponsor）
  - windows ×5（label 消毒注入样本 / 浮窗预置脚本 JSON 转义 / 模式脚本标记 / urlencode / parse_url）
  - pages ×2（loading/recovery 契约标记）+ lib 窗口状态 roundtrip+坏数据钳制
  - fence 多根/消解返回/空围栏 + preview-server 查询串剥离/POST 405/%2e%2e 编码穿越 + session-watcher 配额语义
- sidecar CLI **node --test 8 测试全绿**（31.5s，沙箱 home 真机流程：boot 建档 / list 形态 / set-enabled 可逆往返 / diag 报告结构 / backup 导出→token→篡改拒绝→恢复 roundtrip / 用法错误码 / 未知插件容错）
- 测试过程中实证修正 3 处测试期望（base64 RFC 向量、epoch 天数、日期长度）并确认 1 处实现语义（dsh_home=<home>/.dsh 围栏边界）正确

### 验证
- `cargo test`：**18 套件 93 过 0 挂 0 警告**
- 端到端：loading → boot（3.2s）→ 内核（5.6s 就绪）→ 换页真实 Web UI（截图确认）
- 端口稳定化实测：两轮启动同端口 63283（localStorage 偏好不丢）

### 升级适配（Electron → Tauri 无痛升级，docs/upgrade-guide.md）
- **零迁移设计**：全部用户数据同路径同 schema 直读（~/.dsh / settings.json /
  window-state.json / logs / 便携版 data/），无 copy/convert 步骤
- window-state.json 双向兼容（Tauri 保存也写 Electron schema——回退不丢窗口位置）
- 裁撤键（kernelUpdate/客户端更新键）识别后忽略、绝不删除（可安全回退）
- NSIS 升级链：进程占用检测 + 旧版注册表定位 + 静默卸载保数据
  （/S /KEEP_APP_DATA --updated）+ appId/快捷方式对齐
- 运行时对齐：koffi 预检 + picker 降级 overlay + safe-boot 坏插件禁用 overlay
  全部经 sidecar 复用 Electron 逻辑并注入内核 --patch
- 便携版 PORTABLE_EXECUTABLE_DIR → data/ 重定向；首启迁移报告（只读）
- shell-core upgrade.rs（数据契约表）+ 4 单测；升级场景测试 ×3（旧窗口状态
  verbatim 恢复 / 裁撤键不删 / roundtrip）+ sidecar 4 测试（koffi/picker 逐行
  一致/safe-overlay 幂等）；端到端实测首启报告双行输出

### 启动稳定性（坏插件也永远能打开 dsh——用户诉求：可用 dsh 第一位）
- **守护瀑布**（对齐 Electron plugin-guard guardedBoot，经 sidecar 复用零重写）：
  ```
  guard-snapshot → 首次拉起(120s) ─成功→ 换页 + 45s 稳定落定为「最后良好」
        └失败→ 重跑 boot 链（sync 修复 node_modules 损坏——自愈主力）
              + guard-repair 体检修复 + safe-overlay 禁用坏插件 → 二次拉起(90s)
                └失败→ 回滚最后良好快照（restore，先留 pre-restore 反悔快照）
                      + 再清遮蔽 → 三次拉起(90s)
                        └失败→ 事故报告落盘 + 恢复页（重启全链重走瀑布）
  ```
- **renderer 心跳监测**（RendererRecovery 语义）：换页后 60s 宽限，可见主窗
  连续 ~40s 心跳零增长 → location.reload()（内核活着但页面白屏/JS 死循环兜底）
- **关键洞察固化**：guard 快照只含 4 个配置文件（GUARD_FILES），node_modules
  损坏的自愈主力是 boot 链 sync 重新同步——瀑布二层先重跑 sync 再 repair
- sidecar 新增 guard-* 子命令族（snapshot/mark-good/health/repair/lastgood/
  restore/incident——薄封装 createGuard，DI 对齐 ensureGuard）
- **破坏性测试实证**（stability_tests，16s）：伴随插件入口写语法垃圾 → sync
  覆盖修复 → 照常就绪；package.json 写坏 → 瀑布自愈 → 照常就绪

### 内核版本错配修复（用户实测：Failed to load plugins / dsh-session-manager 加载失败）
- 根因：tauri 线 package.json 声明 rc.7 而 node_modules 实际 rc.8——rc.8 将
  dsh-client-web-react 溶入 minified dist（包不存在），rc.7 形态的伴随插件
  require 不到模块表 → 插件加载失败、会话管理 UI 缺失
- 修复：kernel/dsh-rc8（Electron 线 rc.8 全量适配：双形态锚点 + 补丁重锚定 +
  dual-form 断言，当时 630 测试过）merge 进 main（deb3e8e，三处冲突手工语义
  合成：patch-adapters 取 rc8 探测+main 的 loader-isolation markers；
  integration-runner 取 main 架构+rc8 dual-form 断言套件；CHANGELOG 双段保留）
- tauri/modular rebase 后实跑验证：**插件加载失败零行**、invoke 三通道全通、
  UI 完整（会话列表/聊天/composer 截图确认）

### 「客户端必须能打开」加固（任何不兼容形态都不退出）
- **内核目录定位多级回退**：DSH_TAURI_REPO_ROOT 显式覆盖 → 开发态
  CARGO_MANIFEST_DIR 向上 → **打包态 exe 所在目录向上**（含 resources/
  子布局两种产物形态）。此前打包态只有编译机绝对路径，用户机必然找不到
  内核 → `?` 直接退出不开窗。
- **装配失败 → 恢复页而非退出**：setup 中 supervisor 装配（find_repo_root /
  Supervisor::new / spawn_boot）抽出为 start_supervisor，失败仅记录
  boot_error 并把主窗导航到恢复页；恢复页展示 no-kernel 状态与原因，
  「重启内核 / 重新加载」按钮重新装配（用户补齐安装产物后无需重启应用）。
- **托盘初始化失败降级**：日志告警即止，不影响主窗。
- **静态页服务启动失败降级**：data: 内嵌提示页（percent-encode，无 IPC），
  保住开窗底线。
- 语义对齐 Electron 瀑布原则：内核起不来时 App 仍可见、可进日志、可重试。
- 测试：locate_repo_root 候选命中/无效、env 覆盖（合法命中 + 非法报错）、
  percent-encode（ASCII 保留 + 中文 UTF-8 三字节）——workspace **106/0 零警告**。

### 「兼容性不报错」第二层加固（panic 面 + 坏配置自愈）
- **锁中毒容忍**：全量 `lock().unwrap()` → `unwrap_or_else(into_inner)`（80 处）
  ——任何线程持锁 panic 后其余命令照常工作，不再级联变僵尸（窗开着但全报错）。
- **全局 panic hook**：panic 落盘 `logs/panics.log`（无依赖时间戳）+ stderr，
  不再静默消失；进程存活优先。
- **关键线程 panic 隔离**：boot 瀑布线程整体 catch_unwind → 异常转恢复页
  （enter_recovery_tx 兜底）；route_events 逐事件隔离，单事件路由异常不终结
  路由线程。
- **settings.json 损坏自愈**：坏 JSON / 顶层非对象 → 隔离 `.broken` 保留现场
  后从空配置继续（此前 set 的读-改-写会永远静默失败，lastWebPort 持续丢失）。
- **第二实例拉起**：tauri-plugin-single-instance（注册在最前）——双击图标而
  应用已在跑时聚焦既有主窗，不再报错退出；shell-core 锁文件保留为兜底。
- JS 垫片层审计确认已全程防御（try/catch + fire-and-forget 静默）。
- 测试：settings 自愈契约重写 2 例（隔离现场 + set/get 恢复；顶层非对象）、
  format_unix_secs 已知时间戳 3 断言、panic_payload_str 三形态——
  workspace **108/0 零警告**（build+test 双模式）。

### win-x64 安装包落地（NSIS）+ 安装态三缺陷修复（实测驱动）
- **打包链**：`scripts/stage-payload.sh`（内核 payload 暂存，排除 dist/
  devDeps electron 三件/unix node，约 500MB）→ resources 三映射
  （sidecar/ui/dsh-desktop → `<安装根>/resources/`）→ `npx @tauri-apps/cli
  build`（targets=["nsis"]，currentUser + 保数据 installerHooks）→
  `DSH Desktop_0.1.0_x64-setup.exe`（LZMA ~79MiB）。图标与 Electron 版
  build/icon.ico 逐字节一致（md5 相同）。
- **NSIS 钩子语法修正**：`${If} ${ProcessExists}` 是臆造宏（模板无此定义，
  makensis 报 _If 参数数错）→ 改用模板同款 `nsis_tauri_utils::FindProcess`
  + LogicLib 数字比较；本版 exe 的运行检测交给模板自带
  CheckIfAppIsRunning（紧随钩子执行）。
- **sidecar_cli 双布局解析**：曾只认开发检出 `<repo>/dsh-tauri/sidecar/`，
  安装布局（`resources/sidecar/`）下 node 秒退 Cannot find module → 瀑布
  终态恢复页且全程零 stderr（最难排查的静默故障）。现 dev/installed 两
  布局自动择一；run_sidecar_boot 失败路径补 eprintln 落痕。
- **幽灵环境变量修复（shell-core paths）**：DSH_HOME /
  DSH_TAURI_USERDATA 此前只有 Node 侧（sidecar）生效，Rust 侧
  DshPaths::resolve 根本不读——**便携版 userData 重定向在 Rust 侧从未
  生效**（冒烟实测：隔离 ud 为空、Rust 仍读真实 %APPDATA%）。现与
  sidecar resolveHome/resolveUserData 同口径：根目录直接替换；测试
  ENV_LOCK 串行化（并行用例互见实测）。
- **payload 根级脚本缺失修复**：暂存曾只带 package.json/main.js，而
  scripts/integration 经 `require('../../profile-manifest')` 直引根级
  运行时脚本（electron-builder files 白名单那批）——缺一件 boot 链即断。
  现全量 `*.js` + package.json。
- **find_repo_root 顺序修正**：exe 相对布局优先（编译机=测试机场景曾会
  用仓库检出遮蔽安装目录，实装验证失真）；CARGO_MANIFEST_DIR 降为兜底。
- **冒烟脚本** `scripts/smoke-installed.sh`：手拼安装布局（绝不跑真安装
  器——PREINSTALL 会静默卸载本机真实 Electron 版）、环境全隔离、
  LISTENING 端口 PID 差集判定（防本机正式版 node.exe 污染）、杀壳后
  差集归零验证 Job Object 收割。
- 全量验证：workspace cargo test **109/0 零警告**（新增生产覆盖通道
  用例）；冒烟 PASS 判据 = 隔离 profile 建立 + preview+内核双监听 + 杀壳
  零残留。

### 已知限制（v0.5.0 发布后，2026-08-21 更新）

- 平台覆盖：v0.5.0 仅产出 Windows x64 NSIS 安装包；Linux / macOS 产物与
  便携版、MSI 等形态随后续版本产出（CI 流水线已接，见 tauri-release.yml）
- Gitee 镜像仍为 Electron v0.4.1，Tauri 包暂未同步（国内用户暂走 GitHub）
- 客户端自更新（tauri-plugin-updater）：签名链已就绪（fail-closed），但
  更新源 endpoint（DSH_UPDATER_ENDPOINT/PUBKEY）尚未随发版配置注入——
  菜单「检查客户端更新」当前明确报 E_UPDATER_CONFIG 而非静默失败
- agent 更新：菜单为最简版本比对（本地 vs npm registry latest，就地展示
  hasUpdate），完整下载/替换链后续迭代
- backup-export 2MB 上限为上游 desktop-backup.js 原生行为（与 Electron 版一致）
- balance_refresh 为探活触发（数据仍由内核事件下行——单一投递契约保持）
- WSL 完整托管后续；当前三通道为配置存取 + 探活
- 备份/诊断导出为固定目录（文档/日志），系统对话框待接 tauri-plugin-dialog
- macOS 版未签名：Apple Silicon 首次打开需右键→打开或 `xattr -dr
  com.apple.quarantine`（与 Electron 线一致）
- 共享脚本 unit 套件 3 挂（Electron 壳退役后 preload.js/package.json 壳文件
  引用残留），属 Electron 线测试债待清理，不影响 Tauri 线

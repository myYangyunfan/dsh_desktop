# DSH Desktop — Electron → Tauri 迁移路线图

> 分支 `tauri/modular`（自 main 切出，现为仓库主线架构）。Electron 壳已于
> 2026-08 退役（壳文件清理，`dsh-desktop/` 保留 scripts/ assets/ vendor/
> 作为共享脚本层与内核 payload 源）；回退 = 弃架构。
>
> **状态（2026-08-21）**：Phase 0-4 全部 ✅ + 两遍 review + 功能测试补强 +
> Electron→Tauri 无痛升级适配 + 实测缺陷扫荡 + 万无一失检测 5/5 全过，
> **v0.5.0 已发布**（GitHub Release，CI 流水线产出 win-x64 NSIS 安装包）。
> 随后 **v0.5.1 本地打包（预览版，不发布）**：内核家族平移至
> 0.1.1-rc.1（deepseek-harness 1.1rc，19 个 @deepseek-ai/dsh-* 依赖）+
> 赞助窗三零依赖根治 + WSL #132 误判修复与假开关根治 + 假死探活阈值放宽。
> 证据链见 `../CHANGELOG.md`。

## 总架构（一句话）

Rust 壳（7 个单向依赖的 crate）+ Node sidecar（复用 `dsh-desktop/scripts/`，
零重写）+ 契约层（`contracts/` 单一事实源）。内核 Web UI 以远程页加载，
`window.dshDesktop` 经 initialization_script 垫片桥接（签名与 Electron 版逐字一致）。

## 两个既定决策（用户拍板，不再讨论）

### D1 内核自动更新链：整体删除

| Electron 触点（main.js 行号） | 处置 |
|------------------------------|------|
| `updater.js` 的 overlay 布局 / checkLatest / applyUpdate / rollback / overlayBinPath / overlayVersion | 不移植 |
| `runUpdateFlow`（2614-2742） | 不移植；菜单 `check-agent-update` 为**最简版本比对**（本地内核版本 vs npm registry latest 双源镜像，语义化比较防降级误报，就地展示 hasUpdate；完整下载/替换链后续迭代） |
| 定时触发器（4675-4770 一带） | 不移植 |
| skipVersion / 更新确认状态（settings） | 键读取时忽略（`shell_core::upgrade::LEGACY_IGNORED_KEYS`，经 `legacy_keys_present` 消费） |
| overlay 三副本布局（patch-target-resolver） | Tauri 版补丁布局天然两副本（profile fallback + appDir），无 overlay 更新副本 |
| WSL applyUpdate | 不移植 |

内核版本随客户端发版升级（`dsh-desktop/package.json` 的 @deepseek-ai/* 依赖版本）。

### D2 客户端自动更新：review 结论 + 替代方案

**现状（Electron 版）安全 review 结论：无完整性校验。**

- 下载判据只有：体积下限（≥64MB）+ content-length 一致性 + （Gitee 分片路径的）分片连续性；
- **没有哈希校验，没有签名校验**——信任锚 = HTTPS + GitHub/Gitee API 的 size 元数据；
- `DSH_DESKTOP_RELEASE_API` 环境变量可把更新源指向任意 endpoint，产物直接落盘执行（NSIS 安装器）；
- 意味着：镜像被劫持 / API 被中间人（若 CA 环境异常，恰是本项目 --use-system-ca 存在的原因）情形下无防线。

**Tauri 版方案：`tauri-plugin-updater`（minisign）。**

- manifest（latest.json）+ 产物 + `.sig` 签名三元组；私钥离线，CI 打 tag 时签名；
- 校验失败 fail-closed（`E_UPDATER_SIGNATURE`），不落盘不执行；
- 双源策略：GitHub Releases 主源（updater endpoint 指向静态 JSON）；Gitee 镜像在
  Phase 4 后期评估（updater 插件单 endpoint，需自建一个探活回落的小静态页或
  文档指引手动下载——不为此引入复杂度）。

## Phase 0（本次交付）——骨架 + 契约 + 三 PoC

**实测记录（2026-08-19，本机）：**
- `cargo build` ✓ / `cargo test` **18 套件 59 过 0 挂 0 警告**；
- **PoC-C PASS**：真实拉起仓库内 rc.8 内核（5.6s 出就绪行 `dsh web: http://127.0.0.1:65234`，
  `--no-open` 版本门控正确，taskkill /T /F 杀树成功）；
- **PoC-A/B PASS**：主窗（decorations:false + 36px 自绘标题栏）加载 preview-server
  的远程 http 页，A1-A9 + B1 共 10 项全过（含人工拖拽验证）；
- 过程中实锤两个迁移知识点，已固化进代码注释与测试：
  1. `--patch`/`--no-open` 必须放在 `web` 子命令**之后**（放前面会被父级解析器以
     「--profile required」拒绝）；
  2. 远程页调自定义 command 需要三件套：capability `remote.urls` 放行 origin +
     `permissions/*.toml` 自定义权限（Tauri 2 不为 app command 自动生成）+
     capability 引用该权限。

| 项 | 验收 |
|----|------|
| `contracts/` 五份 | 每个桥方法有 file:line 溯源；43 通道映射表与 main.js 注册清点一致 |
| 7 crate 骨架 | `cargo build` + `cargo test` 全绿；crate 不依赖 tauri（bridge 的命令注册在 app 层） |
| PoC-A 远程页桥注入 | app 主窗加载 preview-server 的 http://127.0.0.1 PoC 页，A1-A9 全 PASS |
| PoC-B 自绘标题栏 | 36px 拖拽 + min/max/close 可用（PoC 页手动项） |
| PoC-C sidecar spawn | `cargo run -p poc-sidecar-spawn`：真实拉起仓库内 rc.8 内核，就绪行解析成功，进程树终结 |
| 本文档 | D1/D2 决策与分期落地 |


## 实装状态总览（2026-08-21，v0.5.1 本地打包后更新）

| Phase | 计划 | 状态 |
|-------|------|------|
| 0 骨架+契约+PoC | 见下表 | ✅ 全过（PoC-C 5.6s / PoC-A+B 10 项） |
| 1 核心生命周期 | supervisor / 换页 / 恢复页 / 窗口记忆 / 导航围栏 | ✅ 实装实测（端到端截图 + 端口稳定化 63283 两轮一致）；v0.5.1 假死探活阈值 15s→60s（compaction 期间事件循环被占 20-30s 属正常形态，15s 误杀） |
| 2 sidecar 全链路 | boot 时序 / 插件六通道 / 探活 | ✅ 实装实测（boot 3.2s、37 插件、set-enabled 可逆往返）；v0.5.1 内核家族平移 0.1.0-rc.8→0.1.1-rc.1（19 个 dsh-* 依赖 + dsh-file-changes 投影 API v2 适配 + supervisor 断言放宽 starts_with("0.1.")） |
| 3 周边窗与诊断 | 托盘 / 通知 / 浮窗 / 宠物窗 / fence / WSL 简版 | ✅ 实装；v0.5.1 赞助窗三零依赖根治（WebviewUrl::App 编译期内嵌，零 file://、零本地端口、零磁盘写）；WSL #132 pnpm 误判修复 + 假开关根治（诚实提示暂未实装），完整托管待后续 |
| 4 打包与分发 | bundle 配置 / updater / 卸载策略 | ✅ **已发布**——v0.5.0（2026-08-21）经 tauri-release.yml CI 流水线产出 win-x64 NSIS 并上线 Release；updater 签名链就绪（endpoint 待发版配置）；v0.5.1 本地打包（不发布） |
| Review ×2 | 功能契约 + 安全边界 | ✅ 修 7 项真缺陷（file_open 漂移 / cmd 注入 / sidecar 竞写 / 单实例死锁 / 强杀孤儿内核 等，详见 CHANGELOG） |
| 实测缺陷扫荡 | issue #98-#134 多轮（T/D/V/U/H/S 系列走查与实测） | ✅ 安装器卡死 NSIS 三重修（v0.5.1 追加 $R9 双角色冲突根治）/ 启动受阻三修+看门狗 / 高级设置三级回落链（详见 CHANGELOG 0.5.0/0.5.1 节） |
| 万无一失检测 | 发版闸门 5 路验证管线 | ✅ 5/5 全过（Rust 142/0 · sidecar 13/13 · 共享 899 · makensis 0 错 0 警 · 安装态冒烟 PASS）；v0.5.1 修复 4 处测试基建 bug（smoke wait 死等 / shell.pid winpid / edge-client 沙箱 setTimeout / 过时 Electron 测试改锚） |

### 启动稳定性保证（2026-08-20 追加）

| 破坏场景 | 自愈层 | 实证 |
|----------|--------|------|
| 伴随插件文件损坏（磁盘坏块/更新中断） | boot 链 sync 重新同步覆盖 | stability_tests ×1 ✓
| 配置破坏（package.json / patch） | 瀑布二层 repair / 三层 restore 快照回滚 | stability_tests ×1 ✓
| 第三方插件运行时崩溃 | 崩溃自动重启 + safe-overlay 禁用（dsh-web.log 解析） | 单测 + 逻辑链 ✓
| 内核反复崩溃 | 崩溃环（60s/5 次）→ 恢复页（重启重走全瀑布） | 单测 ✓
| 页面白屏/JS 死循环（内核活着） | renderer 心跳监测 → 自动 reload | 实现 + 逻辑链（GUI 场景待真实回归） |
| 强杀壳进程（孤儿内核） | Job Object KILL_ON_JOB_CLOSE | 实测端口零残留 ✓ |

### 遗留细目（v0.5.1 本地打包后更新，不阻塞日用，按需迭代）
- ~~image_paste_save（剪贴板位图）→ E_NOT_IMPLEMENTED~~ → **已实装**（v0.5.0）
- ~~正式出包~~ → **已发布**（v0.5.0，CI 流水线）；updater latest.json /
  DSH_UPDATER_ENDPOINT 发版注入待配（签名链 fail-closed 已就绪）
- Linux / macOS 产物与便携版 / MSI 形态（CI 已接，随后续版本产出）
- 备份/诊断导出的系统对话框 → 接 tauri-plugin-dialog（当前固定目录）
- WSL 完整托管（wsl-backend.js 复用）——v0.5.1 起设置项诚实提示「暂未实装」
  （假开关已根治，061a8ba）；#132 pnpm 结构误判已修（resolveViaPnpmStore
  回落 + WSL UNC 防误删 + 历史隔离自愈）
- agent 更新完整下载/替换链（当前为菜单版本比对）
- 共享脚本 unit 套件 3 挂（Electron 壳退役后壳文件引用残留，测试债清理；
  v0.5.1 已改锚其中 2 个过时用例）
- 内核 0.1.1-rc.1 已知降级：billion-context 插件 contextPressure 快照优化
  失效（rc.1 compaction 移除该键，插件 typeof 守卫优雅降级，仅失去预估值
  优化，不崩溃）

## Phase 1 —— 核心生命周期（app 可日用替代 loading 页）

- kernel-process supervisor：Windows Job Object 绑定（杀树不依赖 taskkill 计时）、
  崩溃环状态机接入 RunState、restartService（端口稳定化优先复用上次端口）。
- 主窗生命周期：loading → 就绪换页、窗口状态记忆（位置/尺寸，settings）、
  导航围栏（仅放行 127.0.0.1 内核 origin + 恢复页）、关闭行为（直关 or 托盘，Phase 3 托盘就绪前直关）。
- bridge 补齐 Phase 1 command：recovery 四件套、copy_text（tauri-plugin-clipboard-manager）、
  open_external（tauri-plugin-opener 或保留 cmd start）、sponsor_window。
- 恢复页（recovery.html 的 Tauri 形态：静态文件经 preview-server 托管）。
- **验收**：`DSH_KERNEL_URL` 模式下端到端跑通——先 `poc-sidecar-spawn` 拉内核、
  再起 app 加载真实 Web UI，插件在页内调 dshDesktop 不报「not found」的命令全部可用。

## Phase 2 —— sidecar 全链路（插件体系等价迁移）

- boot 时序编排实装：Repair→Sync→Presets→Patches→Preflight 五步
  （Node 侧 `sidecar/cli.js boot` 复用 scripts/；Rust 编排在 app supervisor
  瀑布 + 看门狗承载。原计划的 sidecar-orchestrator crate 已裁撤——职责被
  supervisor/commands 直接吸收，2026-08 分层重审定案）。
- 脚本抽出：把 Electron main.js 内联的 heal/preset 逻辑抽成 `dsh-tauri/sidecar/` 独立入口
  （Electron 版不动——新文件按契约脚本名组织）。
- 插件管理六通道 + supervision 探活（PR #121 的 supervision 层语义：unref 陷阱已修）。
- WriteGate 跨进程写锁（Rust 侧文件锁 + sidecar 遵守）。
- **验收**：33 伴随插件同步 + 22 补丁在全新用户目录上幂等两连跑（对齐 Electron 集成测试口径）；
  插件市场装/卸/禁用/恢复/更新回归。

## Phase 3 —— 周边窗与诊断

- 托盘 + 通知（限流与聚焦豁免：session-watcher 已有决策逻辑，接系统 API）。
- 浮窗（分屏）/ 赞助窗 / 宠物窗（透明窗 PoC 先行：WebView2 transparent 已知有坑，
  失败则宠物窗降级为不透明圆角小窗）。
  > **现状注（2026-10-07）**：内置桌宠插件 `harness-pet` 已随 v1.0.0 伴随插件精简（39 → 28）移除，
  > 宠物窗失去服务对象——本项与其 PoC 不再是待办（下方风险 R2 同步失去对象），相关收口见
  > `migration-backlog.md` C10（作废）。
- fence 实装：zstd 首帧 cwd 解析、file-revert 逆序应用、备份/恢复/诊断命令族。
- WSL 后端通道（wsl_config_* 三通道，sidecar 复用 wsl-backend.js 逻辑）。
- **验收**：对齐 Electron 版集成测试清单逐项（kill-renderer / float-crash / early-crash /
  unsafe-port / wsl-broken-fallback 等场景的 Tauri 等价物）。

## Phase 4 —— 打包与分发

- 打包：externalBin = vendor node.exe（sidecar 侧），resources = 内核 node_modules +
  scripts + assets/plugins；NSIS/MSI（tauri-bundler）。
- tauri-plugin-updater 接入（D2 方案）；latest.json 进 CI 发版流程（tag → build → sign → upload）。
- 卸载策略：数据目录（%APPDATA%/dsh-desktop 与 ~/.dsh）默认保留——替代自研 C#
  卸载器 + customInit 的整套「升级清数据」防线（Tauri 打包器无此坑）。
- macOS：Gatekeeper「已损坏」场景 = 无签名包的既知问题，文档指引（与 Electron 线一致）。
- **验收**：全新 Windows 机器安装 → 升级 → 卸载三段式，用户数据全程保留。

## 风险登记簿

| # | 风险 | 缓解 |
|---|------|------|
| R1 | 远程页（http://127.0.0.1）IPC 注入不可用（capability remote.urls 语义不符） | PoC-A 即验证点；兜底：内核页改 iframe+postMessage 桥（保底方案，性能略差） |
| R2 | WebView2 透明窗（宠物窗）异常 | Phase 3 先 PoC；降级圆角不透明窗 |
| R3 | 拖拽文件路径（getPathForFile 无 Tauri 等价） | onDragDropEvent 回填 file.path（bridge-api.md §6-R1） |
| R4 | 22 个文本手术对内核版本敏感（rc.7→rc.8 已实证锚点漂移） | sidecar 零重写 + 锚点状态上报（already/anchor-missing/changed）进诊断 |
| R5 | cargo/crates.io 网络受限环境构建慢 | 纯逻辑 crate 零依赖设计；tauri 依赖集中在 app 一个 crate |

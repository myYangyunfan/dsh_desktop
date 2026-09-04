# WSL 托管后端 — 架构设计与实现清单（Tauri 版）

> 契约：`contracts/wsl-backend.md`（语义单一事实源，本文不重复契约字段，
> 只讲「怎么落地」）。蓝本：`dsh-desktop/wsl-backend.js`（486 行，全量移植
> 对象）+ `ee7e420~1` main.js WSL 接线段（resolveBackendConfig 1295-1326 /
> killTree 630-660 / startServer 1530-1560 / watchServerProc 1597 起 /
> app boot 4916-4961 / wsl 三 IPC 3366-3410）。
> 测试策略另见 `docs/wsl-backend-test-plan.md`。

## 1. 现状与五缺口（W2 审查定论，061a8ba 登记）

| # | 缺口 | 现状锚点 |
|---|------|----------|
| 1 | supervisor spawn 链硬编码本地 vendor node | `src/app/src/supervisor.rs` `spawn_kernel`（`SpawnSpec::new(&self.node_exe, &self.bin_js, …)`） |
| 2 | taskkill/JobObject 杀不到 WSL 内进程 | `crates/kernel-process/src/kill_tree.rs`（Windows 臂 taskkill /T）；WSL 内进程不在 Windows 进程树 |
| 3 | boot/sidecar 链本地假设 | `run_sidecar_boot`/`guard_cli_json` 只传 `--app-dir`；sidecar `makeIntegration` 硬编码 `wslMode: () => false`（cli.js:168）——而 `patch-target-resolver.js:78/126` 的 WSL 半边（`wslLayout` + `<home>/agent/node_modules` 根）**已实现未接线** |
| 4 | 探活端口需过 WSL2 localhost 转发 | `probe_loop(port)`/`http_alive(port)` 端口来自 spawn 传入值；WSL 模式实际端口在就绪行 URL 里 |
| 5 | settings 保存被诚实拒绝 | `commands/wsl.rs::wsl_config_save`（061a8ba）恒拒 `backend=wsl` |

既有资产（直接复用，不重写）：`wsl_settings_load_from`（含旧嵌套键迁移）、
`validate_wsl_cfg`（commands/wsl.rs，§1.3 校验的现成实现）、
`ReadyLineParser`（URL 含端口）、`semver::needs_no_open_flag`、
`dsh-wsl-settings` 设置页插件（按完整契约形态消费，**UI 零改动**）。

## 2. 目标架构

```text
┌─ app 装配层 ──────────────────────────────────────────────────────┐
│ lib.rs: start_supervisor → Supervisor::new(root, backend_cfg)     │
│ supervisor.rs: boot_waterfall ──┬─ local: 现链零变更              │
│                                 └─ wsl: WslBackend 分支           │
│ commands/wsl.rs: 三通道解锁（预检=configure 复用）                 │
│ commands/balance.rs / session-watcher 装配: home=effective_home()  │
└───────────────────────────────────────────────────────────────────┘
┌─ crates/wsl-backend（新，纯 std，不依赖 tauri）──────────────────┐
│ WslBackend: configure / status / ensure_installed / spawn_server  │
│             / stop / active_version / unc_home                    │
│ text.rs: decode_wsl_text / parse_distro_list（issue #126 三形态） │
│ WslInvoker trait: run(cmd)→{ok,code,stdout,stderr} —— 测试注桩     │
└───────────────────────────────────────────────────────────────────┘
┌─ kernel-process ──────────────────────────────────────────────────┐
│ spawn_spec.rs: + wsl_server_cmd()（命令串构造纯函数）              │
│ kill_tree.rs: 不动（WSL 分支在 supervisor 层，不走 kill_tree）     │
└───────────────────────────────────────────────────────────────────┘
┌─ sidecar/cli.js ──────────────────────────────────────────────────┐
│ ctxFromArgs: + --wsl flag（--home 已有）                           │
│ makeIntegration: wslMode 硬编码 → 读 ctx.wsl                      │
│ presets 步: getInstallAnchorDir 随 --wsl 切 <home>/agent 包目录    │
└───────────────────────────────────────────────────────────────────┘
```

分层铁律不破：wsl-backend 是纯 std crate（Command/fs），supervisor 与
commands 依赖它；sidecar 改动只在 cli.js 装配层（scripts/ 共享层零改动——
WSL 半边 patch-target-resolver.js 已存在）。

## 3. 端到端数据流（时序）

```text
[设置页] dsh-wsl-settings 插件（已有，零改动）
  saveConfig{backend:wsl, distro, installDir}
    → wsl_config_save：validate → WslBackend::configure（≤120s 异步预检）
      ├─ 失败 → {ok:false, code:E_WSL_*, error}（不落盘）
      └─ 通过 → settings.json 三扁平键落盘 → {ok:true, restartRequired:true}
[重启] Supervisor::new：
  resolve_backend_mode（env > settings；含 DSH_DESKTOP_BACKEND 等三 env）
    → Some(cfg) → boot 线程内 WslBackend::configure（异步，loading 窗已开）
        ├─ 失败 → supervisor.wsl=None + fallback_reason（local 链继续，issue #54）
        └─ 成功 → wsl=Some(backend)
[boot 瀑布]（wsl 分支）
  → ensure_installed（agent 存在且版本==payload 版本？否 → WSL 内 npm staging
    安装；**先于插件/补丁链**——补丁目标含 <UNC>/agent/node_modules）
  → 跳 farm-repair / koffi → sidecar boot --home <UNC> --wsl
    （Windows 侧经 UNC 写 WSL profile：插件同步/补丁/presets/guard 快照）
  → port=0 → spawn wsl.exe -d <distro> -e sh -lc "<cmd>"（--port 0）
  → 就绪行 "dsh web: http://127.0.0.1:<actual>" → actual port 写入 inner
  → HTTP 热探（127.0.0.1:actual，WSL2 localhost 转发）→ KernelReady 换页
  → probe_loop(actual) / 稳定落定 / 崩溃环 —— 全部共用现链
[收割] kill_kernel：wsl stop（pid 文件 kill）→ 杀 wsl.exe 包装 → 300ms
[退出] shutdown：fire-and-forget stop + 杀包装进程
[降级] 任何启动期探测失败 → local 回落 + fallbackReason → 设置页可见
```

## 4. 关键设计决策（D 编号，含依据）

### D1 boot 链跑哪侧：Windows 侧跑 UNC（照抄 Electron）
Electron WSL 模式不把 boot 链搬进 WSL——`syncPlugins/applyPatches/
preflightHealth` 全在 Windows 进程内以 `effectiveDshHome()`=UNC 直写 WSL
文件系统；只有内核本体与 npm 安装在 WSL 内。理由（继承）：补丁引擎/插件
同步是 Windows 侧共享脚本层的职责（sidecar 复用红线），UNC 性能可接受
（Electron 线实证）。**Tauri 照抄**：sidecar 进程不变，只换 `--home <UNC>`
+ `--wsl`。

### D2 spawn 形态：wsl.exe 包装 + WSL 内登录 shell exec node（照抄）
`wsl.exe -d <distro> -e sh -lc "<cd+pidfile+exec node …>"`。要点：
`-e` argv 原样 execvp；`sh -lc` 登录 shell（fnm/nvm PATH）；`exec` 让
node 顶替 shell 进程（pid 文件即内核 pid；wsl.exe 生命周期与内核绑定，
stdout EOF = 内核退出）。**不用** 「WSL 内安装的 node 的 Windows 侧绝对路径」
（`\\wsl$\…\node` 不可执行）。

### D3 端口：--port 0 + 就绪行解析（照抄 expectedPort:null）
不预选端口（Windows 侧 bind 探测对 WSL 内监听无意义）。actual port 在
就绪行线程解析 URL 获得，写入 `Inner.port`（探活/事件/受限端口检查共用）。
稳定端口持久化只保留 local 模式（`last_port` 不写 WSL 值）。

### D4 收割粒度：pid 文件 SIGTERM + 杀包装进程（照抄）
三层：① WSL 内 `kill $(cat dsh.pid)`（另一条 wsl.exe 调用，30s）；
② 杀 wsl.exe 包装 child；③ 绝不 `wsl --terminate`。taskkill /T 对
wsl.exe 分支不再使用（枚举不到 WSL 内进程，纯误导）。Job Object 保留
绑定 wsl.exe（强杀壳时兜底收割包装进程）。

### D5 内核版本锚：payload 版本（D1 全局决策的 WSL 等价）
全局 D1「内核自动更新链删除、版本随客户端发版」→ WSL 内 agent 目标版本
= `Supervisor::kernel_version`（payload package.json）。ensure_installed
校验版本漂移并重装（staging 原子切换 + agent-prev 保留）。不移植
Electron 的 checkLatest/applyUpdate 更新流（migration-roadmap D1 表
「WSL applyUpdate 不移植」仍成立——我们移植的是**安装**，不是**更新链**）。

### D6 探测的线程模型：全部后台线程 + 异步 command
wsl.exe 调用冷启动可达数十秒。supervisor 侧探测在 boot 线程（loading 窗
已开）；`wsl_config_save/get/recheck` 改 `async fn` + 独立线程
（`tauri::async_runtime::spawn_blocking` 或 std thread + oneshot），
禁止同步 command 内直接 spawn wsl.exe（Electron「设置页冻结数分钟」事故
的 Tauri 等价防御）。

### D7 可测试性：WslInvoker trait 注桩（照抄 Electron internals.*）
wsl.exe 原语收口为 `trait WslInvoker { fn run(&self, distro, cmd, timeout) -> WslRunResult; fn list_distros(&self) -> Vec<String>; }`，
生产实现 spawn wsl.exe；单测注入桩（预录 stdout/stderr/exit 形态）。
命令串构造（spawn/stop/install/rollback）全部为纯函数 → 字符串断言。

## 5. 文件级改动清单（实现代理照做）

### 5.1 新增 `src-tauri/crates/wsl-backend/`（Cargo.toml workspace members 追加）

| 文件 | 内容 |
|------|------|
| `Cargo.toml` | `[package] name="wsl-backend"`，依赖 serde_json（错误载荷）即可 |
| `src/lib.rs` | `WslBackend` 结构（distro/install_dir/unc_dir/node_version/npm_version/last_error/version_cache）+ `configure/resolved_from_env_and_settings/status_snapshot/ensure_installed/install_agent/rollback/has_previous/active_version/spawn_server_spec/stop_command`；`WslInvoker` trait + `RealWslInvoker`（spawn wsl.exe，`creation_flags_no_window` 同款 CREATE_NO_WINDOW） |
| `src/text.rs` | `decode_wsl_text(&[u8])->String`（BOM UTF-16LE / 奇偶 NUL 启发式无 BOM / UTF-8）、`parse_distro_list(&str)->Vec<String>`（用法文本→空、剥 NUL、剔控制字符）、`looks_like_utf16le_no_bom` —— 逐行移植 wsl-backend.js 149-203 |
| `src/spec.rs` | 纯函数命令串构造：`server_cmd(install_dir, agent_bin, no_open)`（§4.3 形态）、`stop_cmd(install_dir)`、`install_cmd(install_dir, version)`（staging 原子切换）、`rollback_cmd`、`dir_forbidden(&str)->bool`、`version_valid(&str)->bool`（`[A-Za-z0-9._-]+`）、`unc_dir(distro_host, distro, install_dir)`（`/`→`\`） |
| `src/tests 伴随 #[cfg(test)]` | text 三形态解析 / 名单防御 / 命令串快照断言 / 注桩 configure 全分支 / install 失败清理 / stop 幂等 |

注意：`validate_wsl_cfg` 从 `commands/wsl.rs` 平移至此（或调用侧复用），
`wsl.rs` 原测试随迁；`wsl_settings_load_from` 平移至 shell-core 或
wsl-backend（settings 解析属配置域，两处消费：supervisor + commands）。

### 5.2 `crates/kernel-process/src/spawn_spec.rs`

- 新增 `pub fn wsl_spawn_args(distro:&str, cmd:&str) -> Vec<String>`：
  `["-d", distro, "-e", "sh", "-lc", cmd]`（纯函数 + 测试：参数序、不
  拼空格串）。
- 不改 `SpawnSpec`/`ENV_ALLOWLIST`（local 语义零变更；WSL 环境净化在命令
  串内，见契约 §4.3）。

### 5.3 `src/app/src/supervisor.rs`（核心，逐函数）

| 函数 | 改动 |
|------|------|
| `Supervisor` 结构 | + `wsl: Option<Arc<wsl_backend::WslBackend>>`、`fallback_reason: Mutex<String>`；`Inner` + `actual_port: Option<u16>` |
| `Supervisor::new` | 签名不变，内部 `resolve_backend_mode`（env 三变量 > settings 三键，复用 5.1 平移的 settings 解析）→ 仅记 `Option<WslConfig>`；**不在此 spawn wsl.exe**（避免卡 setup 线程），探测延迟到 boot 线程 |
| `spawn_boot` | 线程开头：若 `wsl_cfg.is_some()` → `WslBackend::configure`（WslInvoker 实跑）→ 成功设 `self.wsl`、失败清空 + 写 `fallback_reason`；随后 waterfall 照常（waterfall 内按 `self.wsl.is_some()` 分支） |
| `boot_waterfall` | wsl 分支：**[0]** `ensure_installed`（agent 预检/首装/版本对齐——必须先于插件补丁链，补丁目标含 `<UNC>/agent/node_modules`，对齐 Electron main.js 4957 `ensureInstalled()` 先于 `syncPlugins()`）；跳 `run_farm_repair` 与 `run_koffi_preflight`；`run_sidecar_boot`/`guard_cli_json`/`refresh_safe_overlay` 调用统一经新 helper `sidecar_home_and_flags()`（local: 现 args；wsl: + `--home <UNC> --wsl`）；端口步骤：wsl → `port=0` 占位（`choose_stable_port` 跳过）；看门狗超时 wsl 分支 35 分钟（首装 npm 30 分钟上限） |
| `spawn_and_wait_ready` | 逻辑不变（port 参数化）；wsl 模式下超时杀死路径走 `kill_kernel`（其内部分支） |
| `spawn_kernel` | 开头分支：wsl → `Command::new("wsl.exe").args(wsl_spawn_args(...))`，不设 PGID、`current_dir` 不设（cd 在命令串内）；Job Object 照常绑 child（wsl.exe）；**就绪行线程**：解析 URL 后新增「提取 actual port → `g.port = actual; g.actual_port = actual`」，受限端口检查（`is_safe_port(actual)` 否则按失败收链）；后续（热探/probe_loop/KernelReady）改用 actual port——**KernelReady 事件载荷 port=actual**。local 路径逐字节不变 |
| `probe_loop`/`http_alive` | 零逻辑变更（端口参数由调用方传 actual） |
| `kill_kernel` | wsl 分支：`self.wsl.stop()`（≤30s，独立线程或同步——重启路径需等完成再探测端口，Electron killTree 语义：stop→杀包装→300ms）+ `child.kill()+wait()`；local 分支原样 |
| `shutdown` | wsl 分支：后台线程 fire-and-forget `stop()` + 同步杀包装进程；`stopping=true` 照旧 |
| `read_kernel_version` | wsl 模式经 `active_version()`（WSL 内 cat package.json）——`kernel_version` 字段改方法或在 configure 后刷新 |
| 新 helper | `pub fn effective_home(&self) -> PathBuf`（契约 §6 统一出口）；`pub fn wsl_status_snapshot(&self)`（commands 层复用，避免重复探测） |
| 测试 | 回归锚点更新：`regression_v051_*` 的 include_str 断言若受行号/片段影响需同步；新增 wsl 分支注桩测试（Invoker 桩）——supervisor 层测试经 `#[cfg(test)]` 注入 `Arc<WslBackend>`（WslBackend 构造函数带 invoker 参数） |

### 5.4 `src/app/src/commands/wsl.rs`

| 函数 | 改动 |
|------|------|
| `wsl_config_get` | 改 `async`；payload 的 `status` 从 supervisor 实例取（`sv.wsl_status_snapshot()`；supervisor 未建/探测中 → configured:false + lastError:"探测中"）；`fallbackReason` 从 supervisor 取；local 语义不变 |
| `wsl_config_save` | 移除 061a8ba 拒绝；`backend=="wsl"` → 后台线程 `WslBackend::configure(distro, dir)`（≤120s）→ 失败 `{ok:false,code,error}`；成功落盘（现 store.set 三键保留） |
| `wsl_recheck` | 改 `async`；用已保存配置强制 configure（新 WslBackend 实例 + 实 invoker），返回 get 同形态；失败不落盘 |
| `wsl_available`/`wsl_config_payload` | 删除（被真实探测取代；`wsl --status` 假阳性已定性）；测试改写为真 payload 契约 |
| 注册 | `lib.rs` invoke_handler 名单不变（async command 同名） |

### 5.5 `sidecar/cli.js`（+ cli.test.js）

| 位置 | 改动 |
|------|------|
| `ctxFromArgs`（634） | 解析 `--wsl` flag → `ctx.wsl`；`--home` 已有（确认 resolveHome 显式值优先级高于 DSH_HOME env——现实现满足） |
| `makeIntegration`（153） | `wslMode: () => !!wsl`（参数对象加 `wsl`）；`getInstallAnchorDir`：wsl → `path.join(home,'agent','node_modules','@deepseek-ai','dsh')`，local 现值 |
| `cmdBoot`（584） | 步骤集不变（repair/sync/presets/patches/preflight 五步契约不动）；presets 步 dest 目标随 makeIntegration 的 anchor 自动切换；repair 步在 UNC 上的行为 = healBeforeServer 纯 fs（无 junction），无需分支 |
| 其余子命令 | `makeGuard(c)`/`createPluginManager` 的 home 已从 ctx.home 流过——Rust 侧传 `--home <UNC>` 即全通（balance-fetch/diag 同理，M2 逐个接线） |
| `cli.test.js` | + `--wsl` 接线例（integration ctx.wslMode=true 断言经 spy/子进程 stderr 日志）+ presets 目标切 UNC anchor 例 |

### 5.6 `src/app/src/lib.rs` + 周边 commands

| 位置 | 改动 | M 级 |
|------|------|------|
| `start_supervisor` | `Supervisor::new` 签名不变（backend 解析内置）；无 | — |
| session-watcher 装配 | home 改 `sv.effective_home()` | M1 |
| `commands/balance.rs` 的 sidecar 调用 | `--home <effective_home()>` | M1 |
| 插件管理六通道 sidecar 调用（commands.rs 内 spawn 点） | 同上 `--home`（+ `--wsl`） | M1 |
| diag/backup/fence | `--home` / 路径切换 | M2 |
| `docs/development.md`、`docs/migration-roadmap.md` | 实装后勾掉「WSL 完整托管」遗留项 | M1 收尾 |

### 5.7 不改的文件（明确红线）

- `crates/kernel-process/src/kill_tree.rs`（WSL 不走它；Windows local 臂零变更）
- `dsh-desktop/scripts/**`（共享层；patch-target-resolver.js 的 wslLayout
  半边已存在）
- `dsh-desktop/assets/plugins/dsh-wsl-settings/**`（设置页 UI 已按完整契约消费）
- `contracts/bridge-api.md §2.4`（三通道形态不变）；`contracts/error-codes.md`
  仅**追加** §7 WSL 域五码（新码只追加规则）
- `contracts/data-flow.md` §3 步骤序（五步契约不动；WSL 差异全在参数层）

## 6. 里程碑

### M1 最小可用（目标：已有 WSL2 + 发行版内已装 node/npm 的用户可切）
范围：5.1/5.2/5.3/5.4/5.5 全量 + 5.6 的 M1 行（session-watcher/balance/插件
通道 home 切换）+ 契约/错误码登记 + mock 单测全绿。
验收（mock + 可延后的真机项见 test-plan）：配置保存→重启→WSL 内内核就绪→
探活→插件/补丁经 UNC 生效→杀进程收割→坏配置回落 local 全链。

### M2 托管链完整
- 回退链：就绪失败且 `has_previous()` → 恢复页提供「回退 WSL 内上一版本」
  动作（Electron 1889 对话框语义的恢复页等价物）。
- diag/backup/fence 的 effective home；诊断报告含 WSL 段（distro/node/
  agent 版本/UNC）。
- 真机验证清单执行（本机 WSL VM 修复后）+ `.wslconfig` 异常形态收集。
- 文档：README/升级指引补 WSL 模式说明。

## 7. 风险登记

| # | 风险 | 缓解 |
|---|------|------|
| R1 | UNC（9P）慢：33 插件同步/补丁经 UNC 写 WSL fs，boot 链显著变慢 | Electron 线同链已实证可用；侧记耗时进 BootStep ms；若超标，备选 = sync 步改在 WSL 内跑（node <appDir 经 UNC 执行）——M2 评估，M1 不做 |
| R2 | localhost 转发抖动/失效（睡眠唤醒/网络切换/虚拟网卡重置，或 .wslconfig 关闭 / 旧 Win10 19041 前 / 绑定 127.0.0.1 的转发怪癖） | **已实装分层应对**（用户反馈「偶发断线致输出中断」）：① 探活防误杀——TCP 连续失联（≥3）时先 `kill -0 $(cat dsh.pid)` 探 WSL 内进程，仍在则**不重启**、复位失联计数等转发恢复（前端 reconnect 连回同一内核 + durable event 续流），确认退出才走崩溃环；② bind 逃生阀 `DSH_WSL_HOST`（白名单 127.0.0.1/0.0.0.0，默认回环）；③ boot 探测 `.wslconfig` 是否 mirrored 并打日志引导。**根治仍推荐 mirrored 网络**（localhost 直连绕开 NAT 转发）；若转发恒不通（localhostForwarding=false）则 wsl.exe 存活探测亦失败→崩溃环→恢复页（fallbackReason 指路） |
| R3 | 壳被强杀 → WSL 内内核孤儿（Job Object 只收 wsl.exe） | spawn 前命令串已 `rm -f dsh.pid`；下次启动 ensure_installed 前 stop 旧 pid；瀑布重试兜底（Electron 同款残余，登记不改） |
| R4 | wsl.exe 输出编码漂移（新版本形态变化） | decode 三形态 + 名单 NUL 防御（#126 战果）；解析失败 = 空名单 = E_WSL_UNAVAILABLE（fail-closed 可读） |
| R5 | 同步 command 阻塞 IPC（探测数十秒） | D6：全部异步 command + 后台线程；契约 §2 注明上限 |
| R6 | 保存时好、重启时坏（WSL 冷启动慢/发行版被删） | §5 回落机制兜底（配置保留 + fallbackReason） |
| R7 | 与 D1 决策张力（WSL 内 agent 谁定版本） | D5 收口：payload 版本为锚，漂移即重装，无独立更新链 |
| R8 | 并行代理冲突（本设计与其它改造同时动 supervisor.rs） | 实现代理落地时以本清单为序：5.1 crate（纯新增）→ 5.4（独立文件）→ 5.5（独立文件）→ 5.3（最后动 supervisor，冲突面最小） |
| R9 | wsl.exe 嵌套（壳自身跑在 WSLg 里） | 未支持；wsl.exe 调用失败自然回落 local，不专门设计 |
| R10 | 看门狗 5 分钟 vs npm 首装 30 分钟 | wsl 分支看门狗 35 分钟（契约 §4.2）；进度经 BootStep 事件透出（npm onLine 行已有通道可接） |

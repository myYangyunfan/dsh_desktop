//! 内核 supervisor：boot 链 → spawn → 就绪换页 → 探活 → 崩溃环 → 原地重启。
//!
//! 数据流契约（contracts/data-flow.md §3）：
//! ```text
//! sidecar boot（repair→sync→presets→patches→preflight）
//!   → choose_stable_port（优先上次端口）
//!   → spawn vendor-node（环境白名单 + DSH_DESKTOP_SUPERVISED=1）
//!   → ReadyLineParser → kernel-ready → 主窗换页
//!   → 探活（TCP + 进程 wait）→ 崩溃环 → 恢复页
//! ```
//! 杀树：Windows taskkill /T /F（Electron 版实证：控制台进程优雅 kill 无效）；
//! Unix killpg(-pgid, SIGKILL)——spawn 时设内核为进程组长，整组一次收割
//! （kernel_process::kill_tree）。

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use kernel_process::{choose_stable_port, kill_tree, CrashLoopDetector, ReadyLineParser, SpawnSpec};
use kernel_process::crash_loop::Verdict;
/// 稳定落定窗口（Electron SERVICE_STABLE_MS 同语义：就绪后稳定存活此时长，
/// 启动快照才成为「最后良好」回滚锚点）。
const SERVICE_STABLE_SECS: u64 = 45;
/// boot 看门狗上限（D2「永挂形态」根治）：boot 全链有界 5 分钟。
const BOOT_WATCHDOG_TIMEOUT: Duration = Duration::from_secs(300);
/// 单步 sidecar 子进程上限（有界执行，性能审计 2026-08）：健康路径每步
/// 秒级；AV 拦半死时按失败处理进瀑布/恢复页，不再拖满整个看门狗窗口。
const SIDECAR_STEP_TIMEOUT: Duration = Duration::from_secs(60);
/// boot 链整体（cli.js boot 五步）上限：健康 ~4s；两层瀑布最坏 2×120s
/// 仍留在看门狗 300s 之内。
const SIDECAR_BOOT_TIMEOUT: Duration = Duration::from_secs(120);

use shell_core::RunState;

/// 探活三态（单连接判定：连不上 = 进程死；连得上但 HTTP 无响应 = 假死；
/// 有响应字节 = 活）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ProbeOutcome {
    Alive,
    TcpDead,
    Zombie,
}

use crate::bounded;

/// 内核进程 + 其杀树 Job 句柄（进程隔离不变量：两者同进同出——
/// 内核终结（kill_tree / 自然退出）后 Job 句柄随本结构 Drop 关闭，
/// 不再随 spawn 泄漏；壳存活期间句柄在场，强杀兜底语义不变）。
struct KernelProc {
    child: Child,
    job: kernel_process::job_object::JobHandle,
}

/// boot 进行中标志（「双内核竞态」根治，性能审计 2026-08）：瀑布运行期间
/// 内核启动期退出由瀑布层独占接管——崩溃自动重启臂（2s 延迟线程）必须
/// 让位。历史缺陷：两条恢复路径无互斥，瀑布二层重跑 boot 链（~4s）期间
/// 自动重启线程先拉起内核 A，随后瀑布又拉起内核 B 并直接覆盖句柄——A 成为
/// 无人管理的孤儿内核（数百 MB RSS 常驻，直到进程退出才被 Job Object 收割）。
struct BootActiveGuard(Arc<Supervisor>, u64);
impl Drop for BootActiveGuard {
    fn drop(&mut self) {
        // 代际感知：旧瀑布的守卫不得清掉新瀑布的标志（restart 叠加场景）。
        let mut g = self.0.inner.lock().unwrap_or_else(|p| p.into_inner());
        if g.generation == self.1 {
            g.boot_active = false;
        }
    }
}

/// supervisor 对外事件（发给装配层，转发给窗口/托盘/日志）。
#[derive(Debug, Clone)]
pub enum SupervisorEvent {
    /// boot 链某步完成。
    BootStep { name: String, ok: bool, ms: u64, error: Option<String> },
    /// 内核就绪，主窗应换页到该 URL。
    KernelReady { url: String, port: u16 },
    /// 内核退出（异常）。
    KernelExit { code: Option<i32>, crashed: bool },
    /// 崩溃环触发 → 切恢复页。
    CrashLoop { crashes: usize },
    /// 探活失败计数变化（诊断用）。
    ProbeFailed { consecutive: usize },
    /// 内核假死可疑：TCP 可连但 HTTP 连续无响应（#122/#129——crash-shield
    /// 吞异常保进程活着，纯 TCP 探测恒过，事件循环卡死不可见）。
    ZombieSuspect { consecutive: usize },
    /// 状态迁移。
    StateChanged(RunState),
}

pub struct Supervisor {
    pub app_dir: PathBuf,
    pub sidecar_cli: PathBuf,
    pub node_exe: PathBuf,
    pub bin_js: PathBuf,
    pub kernel_version: String,
    inner: Arc<Mutex<Inner>>,
}

struct Inner {
    state: RunState,
    kernel: Option<KernelProc>,
    kernel_url: Option<String>,
    port: Option<u16>,
    last_error: Option<String>,
    crash: CrashLoopDetector,
    crash_count: usize,
    /// 注入内核的 --patch overlay 列表（picker 降级 / safe-boot 禁用）。
    overlays: Vec<std::path::PathBuf>,
    /// 守护瀑布的就绪等待通道（spawn_boot 同步段持有 rx；stdout 线程/退出路径发 tx）。
    ready_tx: Option<std::sync::mpsc::Sender<Result<String, String>>>,
    /// 待落定良好快照 id（就绪稳定 SERVICE_STABLE_SECS 后 markGood）。
    pending_good: Option<String>,
    /// restart_service 的代际号：旧世代的异步任务看到代际变了就自杀。
    generation: u64,
    /// 探活环令牌：每次就绪布防递增，旧探活环看到令牌不符自行退出
    /// （同代际下崩溃自动重启换内核后，旧环不得继续探活/误杀新内核）。
    probe_gen: u64,
    stopping: bool,
    /// 瀑布进行中（BootActiveGuard 维护）：启动期退出由瀑布独占接管，
    /// 崩溃自动重启臂让位（防双内核竞态，见 BootActiveGuard）。
    boot_active: bool,
}


/// 带超时的 .output()——D2 诊断「永挂形态」根治：vendor node 调用在
/// 用户机上可能被 AV/SmartScreen 拦到半死，无超时则 boot 线程永挂
/// loading 页（连恢复页都不出现）。超时按失败处理，进瀑布/恢复页。
/// vendor node 可执行名：Windows node.exe，其余平台 node（vendor 目录按
/// 平台分发双二进制——mac 检出内 node 为 Mach-O；此前硬编码 node.exe，
/// mac 上内核 spawn 必失败、boot 瀑布终转恢复页）。
#[cfg(windows)]
const VENDOR_NODE_NAME: &str = "node.exe";
#[cfg(not(windows))]
const VENDOR_NODE_NAME: &str = "node";

/// vendor node 路径解析：按平台选主名，缺失时另一名兜底（检出形态可能只
/// 带其一；都不在时返回主名，spawn 报错走既有恢复页路径）。
fn vendor_node_exe(app_dir: &std::path::Path) -> PathBuf {
    let dir = app_dir.join("vendor").join("node");
    let primary = dir.join(VENDOR_NODE_NAME);
    if primary.exists() {
        return primary;
    }
    let alt_name = if cfg!(windows) { "node" } else { "node.exe" };
    let alt = dir.join(alt_name);
    if alt.exists() {
        return alt;
    }
    primary
}

impl Supervisor {
    pub fn new(repo_root: &std::path::Path) -> Self {
        let app_dir = repo_root.join("dsh-desktop");
        // sidecar cli 双布局解析：开发检出在 <repo>/dsh-tauri/sidecar/，
        // 安装产物在 <安装根>/resources/sidecar/（repo_root 即 resources）。
        // 曾实测：只认开发布局时安装包首启 node 秒退「Cannot find module」，
        // 瀑布终态恢复页且全程零 stderr——最难排查的一类静默故障。
        let sidecar_cli = {
            let dev = repo_root.join("dsh-tauri").join("sidecar").join("cli.js");
            if dev.exists() {
                dev
            } else {
                repo_root.join("sidecar").join("cli.js")
            }
        };
        Self {
            sidecar_cli,
            node_exe: vendor_node_exe(&app_dir),
            bin_js: app_dir.join("node_modules").join("@deepseek-ai").join("dsh").join("lib").join("bin.js"),
            kernel_version: read_kernel_version(&app_dir),
            app_dir,
            inner: Arc::new(Mutex::new(Inner {
                state: RunState::Boot,
                kernel: None,
                kernel_url: None,
                port: None,
                last_error: None,
                crash: CrashLoopDetector::new(),
                crash_count: 0,
                overlays: Vec::new(),
                ready_tx: None,
                pending_good: None,
                generation: 0,
                probe_gen: 0,
                stopping: false,
                boot_active: false,
            })),
        }
    }

    pub fn state(&self) -> RunState {
        self.inner.lock().unwrap_or_else(|p| p.into_inner()).state
    }
    pub fn kernel_url(&self) -> Option<String> {
        self.inner.lock().unwrap_or_else(|p| p.into_inner()).kernel_url.clone()
    }
    pub fn crash_count(&self) -> usize {
        self.inner.lock().unwrap_or_else(|p| p.into_inner()).crash_count
    }
    pub fn last_error(&self) -> Option<String> {
        self.inner.lock().unwrap_or_else(|p| p.into_inner()).last_error.clone()
    }

    fn set_state(&self, next: RunState) {
        let mut g = self.inner.lock().unwrap_or_else(|p| p.into_inner());
        if g.state != next {
            let _ = g.state.can_transition_to(next);
            g.state = next;
        }
    }

    /// 完整启动链（后台线程跑；事件经 tx 推送）。
    ///
    /// **守护瀑布**（对齐 Electron plugin-guard guardedBoot——「坏插件也永远能打开 dsh」）：
    /// ```text
    /// guard-snapshot → 首次拉起(120s) ─成功→ 换页 + 稳定落定
    ///        └失败→ 体检修复(repair) + safe-overlay 禁用坏插件 → 二次拉起(90s)
    ///                └失败→ 回滚最后良好快照(restore) → 三次拉起(90s)
    ///                        └失败→ 事故报告 + 恢复页（restart_service/恢复页重启全链重走瀑布）
    /// ```
    pub fn spawn_boot(self: &Arc<Self>, tx: Sender<SupervisorEvent>, preferred_port: Option<u16>) {
        let this = Arc::clone(self);
        let tx2 = tx.clone();
        std::thread::spawn(move || {
            // 看门狗（D2 永挂形态根治）：boot 全链有界 5 分钟，超时进恢复页
            // ——防 vendor node 被 AV 拦到半死导致 loading 永挂。
            Self::spawn_boot_watchdog(&this, tx.clone(), BOOT_WATCHDOG_TIMEOUT);
            // panic 隔离：瀑布任何一环意外 panic（兼容性场景的兜底）→ 落恢复页，
            // 客户端继续运行（全局 panic hook 已另行落盘 panics.log）。
            let this2 = Arc::clone(&this);
            let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(move || {
                Self::boot_waterfall(this, tx, preferred_port)
            }));
            if let Err(p) = r {
                let msg = panic_payload_str(&*p);
                this2.enter_recovery_tx(&tx2, &format!("boot 线程异常（已捕获，客户端继续运行）: {msg}"));
            }
        });
    }

    /// boot 看门狗线程：`timeout` 后仍在「未完成」态 → 转恢复页。
    /// 超时参数化仅为测试注入短超时（生产恒 BOOT_WATCHDOG_TIMEOUT），
    /// 对外行为零变更。代际感知（v0.5.1 频繁重启回归修复）：restart 每次
    /// 都会再挂一个看门狗，旧看门狗若不校验代际，会在新一次 boot 进行中
    /// 超时开火，把正在启动的内核打入恢复页（慢机上表现为反复重启）。
    fn spawn_boot_watchdog(this: &Arc<Self>, tx: Sender<SupervisorEvent>, timeout: Duration) {
        let wd_tx = tx;
        let this_wd = Arc::clone(this);
        let gen = this.inner.lock().unwrap_or_else(|p| p.into_inner()).generation;
        std::thread::spawn(move || {
            std::thread::sleep(timeout);
            let g = this_wd.inner.lock().unwrap_or_else(|p| p.into_inner());
            if g.generation != gen {
                return; // 旧世代的看门狗：新 boot 已接手，本犬退休。
            }
            if Self::watchdog_should_fire(g.stopping, g.state) {
                drop(g);
                eprintln!("[supervisor] 看门狗：boot 链 5 分钟超时，转恢复页");
                this_wd.enter_recovery_tx(&wd_tx, "boot 链超时（5 分钟看门狗）");
            }
        });
    }

    /// 看门狗触发判定（纯函数，可单测）：超时时刻未在退出、且尚未到达
    /// Ready（正常就绪，哪怕迟到）或 Recovery（瀑布已自愈转恢复页）才触发。
    fn watchdog_should_fire(stopping: bool, state: RunState) -> bool {
        !stopping && state != RunState::Ready && state != RunState::Recovery
    }

    /// 守护瀑布主体（boot 线程内执行；panic 由 spawn_boot 捕获兜底）。
    fn boot_waterfall(this: Arc<Self>, tx: Sender<SupervisorEvent>, preferred_port: Option<u16>) {
        {
            let gen = this.inner.lock().unwrap_or_else(|p| p.into_inner()).generation;
            // 瀑布启动：独占内核恢复权直到本链终局（就绪/恢复页/取消）——
            // Drop 守卫保证任何 return / panic 路径都释放（代际感知防叠犬误清）。
            this.inner.lock().unwrap_or_else(|p| p.into_inner()).boot_active = true;
            let _boot_guard = BootActiveGuard(Arc::clone(&this), gen);
            // ---- [0.5] farm 实体目录去材料化（Electron repairProfileFallback
            // 等价物，H/V2 实测定论的残余风险）：farm 条目被云同步/复制还原成
            // 实体目录时内核 heal 直接放弃（"exists and is not a symlink"），
            // 原生依赖链断裂 → 预设挂载失败。挪开让 heal 重建 junction。
            // 尽力而为：失败仅日志，绝不阻断 boot 链。
            this.run_farm_repair();
            // ---- [1] sidecar boot ----
            this.set_state(RunState::Repair);
            let t0 = Instant::now();
            match this.run_sidecar_boot(&tx, gen) {
                Ok(()) => {}
                Err(e) => {
                    let mut g = this.inner.lock().unwrap_or_else(|p| p.into_inner());
                    g.last_error = Some(e.clone());
                    let _ = tx.send(SupervisorEvent::BootStep { name: "sidecar-boot".into(), ok: false, ms: t0.elapsed().as_millis() as u64, error: Some(e) });
                    this.enter_recovery(&tx, "boot 链失败");
                    return;
                }
            }
            if this.inner.lock().unwrap_or_else(|p| p.into_inner()).generation != gen || this.inner.lock().unwrap_or_else(|p| p.into_inner()).stopping {
                return;
            }
            // ---- [1.5] koffi 预检 → 目录选择器降级 overlay（Electron 对齐，升级适配）----
            this.run_koffi_preflight();
            // ---- [1.6] 启动前快照（plugin-guard；GUARD_FILES 四文件）----
            let boot_snap = this.guard_cli_json(&["guard-snapshot", "boot"])
                .and_then(|v| v.get("id").and_then(|i| i.as_str()).map(String::from));
            if let Some(id) = &boot_snap {
                log_line(&format!("守护瀑布：启动快照 {id}"));
            }
            // ---- [2] 端口 ----
            let port = match choose_stable_port(preferred_port) {
                Some(p) => p,
                None => {
                    this.enter_recovery(&tx, "无可用安全端口");
                    return;
                }
            };
            this.inner.lock().unwrap_or_else(|p| p.into_inner()).port = Some(port);
            this.set_state(RunState::Spawn);

            // ---- [3] 首次拉起（有界等待 120s，对齐 Electron waitUntilUp）----
            match Arc::clone(&this).spawn_and_wait_ready(port, &tx, Duration::from_secs(120)) {
                Ok(url) => return this.on_boot_success(url, port, gen, boot_snap),
                Err(first) => {
                    log_line(&format!("守护瀑布：首次拉起失败（{first}），进入体检修复"));
                }
            }
            if this.cancelled(gen) { return; }

            // ---- [4] 二层：重跑 boot 链（sync 重新同步伴随插件，修复 node_modules 损坏
            // ——自愈主力；guard 快照只含 4 个配置文件，坏文件靠 sync 覆盖）+ 体检修复
            // + safe overlay 禁用坏插件 → 二次拉起 ----
            if let Err(e) = this.run_sidecar_boot(&tx, gen) {
                log_line(&format!("守护瀑布：二层重跑 boot 链失败：{e}"));
            }
            let repaired = this.guard_cli_json(&["guard-repair"]);
            let applied: Vec<String> = repaired
                .and_then(|v| v.get("applied").and_then(|a| a.as_array()).map(|arr| arr.iter().filter_map(|x| x.as_str().map(String::from)).collect()))
                .unwrap_or_default();
            let safe_applied = this.refresh_safe_overlay();
            log_line(&format!("守护瀑布：体检修复 applied={applied:?} safeOverlay禁用={safe_applied}"));
            if !safe_applied && applied.is_empty() {
                log_line("守护瀑布：无可修复项也无失败插件名单，直接进入回滚层");
            }
            let port2 = this.reuse_or_new_port(port);
            match Arc::clone(&this).spawn_and_wait_ready(port2, &tx, Duration::from_secs(90)) {
                Ok(url) => {
                    this.guard_incident("boot-recovered", &format!("首次启动失败，体检修复后恢复。修复项：{applied:?}"));
                    return this.on_boot_success(url, port2, gen, boot_snap);
                }
                Err(second) => log_line(&format!("守护瀑布：修复后仍失败（{second}），进入回滚")),
            }
            if this.cancelled(gen) { return; }

            // ---- [5] 三层：回滚最后良好快照 → 三次拉起 ----
            let lastgood = this.guard_cli_json(&["guard-lastgood"])
                .and_then(|v| if v.get("ok").and_then(|b| b.as_bool()).unwrap_or(false) {
                    v.get("id").and_then(|i| i.as_str()).map(|id| (id.to_string(), v.get("reason").and_then(|r| r.as_str()).unwrap_or("").to_string()))
                } else { None });
            let rollback_target = lastgood.filter(|(id, _)| boot_snap.as_deref() != Some(id.as_str()));
            match rollback_target {
                Some((id, reason)) => {
                    log_line(&format!("守护瀑布：回滚到最后良好快照 {id}（{reason}）"));
                    let _ = this.guard_cli_json(&["guard-restore", &id]);
                    let _ = this.guard_cli_json(&["guard-repair"]); // 回滚后再清一次遮蔽
                    let port3 = this.reuse_or_new_port(port);
                    match Arc::clone(&this).spawn_and_wait_ready(port3, &tx, Duration::from_secs(90)) {
                        Ok(url) => {
                            this.guard_incident("rollback-recovered", &format!("回滚到快照 {id} 后恢复启动"));
                            return this.on_boot_success(url, port3, gen, None);
                        }
                        Err(final_err) => {
                            this.guard_incident("boot-failed", &format!("回滚到 {id} 后仍无法启动：{final_err}"));
                            this.enter_recovery(&tx, &format!("回滚后仍失败：{final_err}"));
                        }
                    }
                }
                None => {
                    this.guard_incident("boot-failed", &format!("启动失败且无可回滚快照（首次运行或快照耗尽）"));
                    this.enter_recovery(&tx, "启动失败且无可回滚快照（可在恢复页重试）");
                }
            }
        }
    }

    /// 就绪成功路径：待落定快照 + 稳定落定线程（45s 后 markGood，
    /// Electron armStabilityWatch 语义：稳定存活即成为「最后良好」回滚锚点）。
    ///
    /// 换页（KernelReady）与探活布防不在此处：就绪行线程是唯一换页源
    ///（含 HTTP 热探），瀑布/自动重启两条路径统一走它——此前这里再发一次
    /// KernelReady 构成双发（双 navigate / 双心跳监测 / 双诊断探针，M1 审计
    /// 遗留；真机日志可见 t0/probe 输出全双份）。
    fn on_boot_success(self: &Arc<Self>, url: String, port: u16, gen: u64, snap: Option<String>) {
        let _ = (url, port);
        {
            let mut g = self.inner.lock().unwrap_or_else(|p| p.into_inner());
            g.pending_good = snap;
        }
        self.set_state(RunState::Ready);
        let this = Arc::clone(self);
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_secs(SERVICE_STABLE_SECS));
            let g = this.inner.lock().unwrap_or_else(|p| p.into_inner());
            if g.generation != gen || g.stopping { return; }
            if let Some(id) = g.pending_good.clone() {
                drop(g);
                let _ = this.guard_cli_json(&["guard-mark-good", &id]);
                let mut g2 = this.inner.lock().unwrap_or_else(|p| p.into_inner());
                g2.pending_good = None;
                g2.crash_count = 0; // 稳定落地 → 崩溃计数复位（Electron 同款）
                this.inner_crash_reset();
                log_line(&format!("守护瀑布：服务稳定存活，快照 {id} 落定为最后良好"));
            }
        });
    }

    fn cancelled(&self, gen: u64) -> bool {
        let g = self.inner.lock().unwrap_or_else(|p| p.into_inner());
        g.generation != gen || g.stopping
    }

    /// 端口复用（同端口重试保 origin 稳定）；占用则换新端口。
    fn reuse_or_new_port(&self, preferred: u16) -> u16 {
        choose_stable_port(Some(preferred)).unwrap_or(preferred)
    }

    /// 拉起内核并同步等待就绪（瀑布核心原语）。
    fn spawn_and_wait_ready(self: Arc<Self>, port: u16, tx: &Sender<SupervisorEvent>, timeout: Duration) -> Result<String, String> {
        let (rtx, rrx) = std::sync::mpsc::channel::<Result<String, String>>();
        self.inner.lock().unwrap_or_else(|p| p.into_inner()).ready_tx = Some(rtx);
        if let Err(e) = self.clone().spawn_kernel(port, tx) {
            self.inner.lock().unwrap_or_else(|p| p.into_inner()).ready_tx = None;
            return Err(e);
        }
        let deadline = Instant::now() + timeout;
        match rrx.recv_timeout(deadline.saturating_duration_since(Instant::now()).max(Duration::from_millis(1))) {
            Ok(Ok(url)) => Ok(url),
            Ok(Err(e)) => Err(e),
            Err(_) => {
                // 超时：杀掉半死进程，按失败处理。
                self.kill_kernel();
                self.inner.lock().unwrap_or_else(|p| p.into_inner()).ready_tx = None;
                Err(format!("{timeout:?} 内未就绪"))
            }
        }
    }

    /// guard 子命令薄跑（stdout 末行 JSON 解析；失败返回 None——瀑布降级而非崩）。
    /// 有界执行：AV 拦半死的 node 不再拖住 boot 线程（超时按失败处理）。
    fn guard_cli_json(&self, args: &[&str]) -> Option<serde_json::Value> {
        let mut cmd = Command::new(&self.node_exe);
        cmd.arg(&self.sidecar_cli)
            .args(args)
            .arg("--app-dir")
            .arg(&self.app_dir)
            .creation_flags_win();
        let out = bounded::output_with_timeout(&mut cmd, SIDECAR_STEP_TIMEOUT).ok()?;
        let out = out.output?;
        if !out.status.success() { return None; }
        let stdout = String::from_utf8_lossy(&out.stdout);
        let line = stdout.trim_end().lines().last()?;
        serde_json::from_str(line).ok()
    }

    /// 事故报告落盘（guard/incidents/）。
    fn guard_incident(&self, kind: &str, detail: &str) {
        let _ = self.guard_cli_json(&["guard-incident", kind, detail]);
    }

    fn inner_crash_reset(&self) { /* 兼容占位：crash_count 复位已直写 */ }
    /// sidecar boot（node cli.js boot），逐步从 stderr 解析 [sidecar] 行转发。
    /// farm 实体目录去材料化（sidecar/farm-repair.js，node 侧 fs 操作）。
    /// 失败仅日志（log_line + stderr），绝不影响 boot 链。
    fn run_farm_repair(&self) {
        // 双布局：安装形态 app_dir=<install>/resources/dsh-desktop →
        // ../sidecar（resources/sidecar）；repo 检出 → ../dsh-tauri/sidecar。
        let installed = self.app_dir.join("..").join("sidecar").join("farm-repair.js");
        let script = if installed.exists() {
            installed
        } else {
            self.app_dir.join("..").join("dsh-tauri").join("sidecar").join("farm-repair.js")
        };
        if !script.exists() {
            eprintln!("[farm-repair] 脚本缺失（{:?}），跳过", script);
            return;
        }
        let mut cmd = Command::new(&self.node_exe);
        cmd.arg(&script)
            .arg(&self.app_dir)
            .creation_flags_win();
        let out = bounded::output_with_timeout(&mut cmd, SIDECAR_STEP_TIMEOUT);
        match out {
            Ok(o) => {
                if let Some(out) = o.output {
                    let stderr = String::from_utf8_lossy(&out.stderr);
                    for line in stderr.lines().filter(|l| l.contains("[farm-repair]")) {
                        log_line(line);
                    }
                }
            }
            Err(e) => eprintln!("[farm-repair] 执行失败（不阻断）：{e}"),
        }
    }

    fn run_sidecar_boot(&self, tx: &Sender<SupervisorEvent>, _gen: u64) -> Result<(), String> {
        let mut cmd = Command::new(&self.node_exe);
        cmd.arg(&self.sidecar_cli)
            .arg("boot")
            .arg("--app-dir")
            .arg(&self.app_dir)
            .env("DSH_TAURI_VERSION", env!("CARGO_PKG_VERSION"))
            // GUI 进程起 console 子进程抑制终端窗（boot 是「启动后弹终端」主源，
            // 与本文件其余 node spawn 同口径——0.5.0 实测修复）。
            .creation_flags_win();
        let out = bounded::output_with_timeout(&mut cmd, SIDECAR_BOOT_TIMEOUT)
            .map_err(|e| {
                let msg = format!("sidecar spawn 失败（node: {} cli: {}）: {e}", self.node_exe.display(), self.sidecar_cli.display());
                eprintln!("[boot] {msg}");
                msg
            })?
            .output
            .ok_or("sidecar boot 超时被终止（有界执行）")?;
        if !out.status.success() {
            let msg = format!("sidecar boot 退出码 {:?}: {}", out.status.code(), String::from_utf8_lossy(&out.stderr).lines().take(6).collect::<Vec<_>>().join(" | "));
            eprintln!("[boot] {msg}");
            return Err(msg);
        }
        // stdout：末行 JSON {ok,totalMs,steps[]}
        let stdout = String::from_utf8_lossy(&out.stdout);
        let line = stdout.trim_end().lines().last().unwrap_or("");
        let parsed: serde_json::Value = serde_json::from_str(line).map_err(|e| format!("sidecar 输出解析: {e}"))?;
        for step in parsed.get("steps").and_then(|s| s.as_array()).unwrap_or(&vec![]) {
            let name = step.get("name").and_then(|v| v.as_str()).unwrap_or("?").to_string();
            let ok = step.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
            let ms = step.get("ms").and_then(|v| v.as_u64()).unwrap_or(0);
            let error = step.get("error").and_then(|v| v.as_str()).map(String::from);
            let _ = tx.send(SupervisorEvent::BootStep { name, ok, ms, error });
        }
        if parsed.get("ok").and_then(|v| v.as_bool()) != Some(true) {
            return Err("boot 链存在失败步骤".into());
        }
        Ok(())
    }

    /// koffi 预检：失败时启用 picker-browse 降级 overlay（Electron runKoffiPreflight
    /// + enablePickerBrowseOverlay 的合并语义；缓存简化为 settings 布尔——每次
    /// 冒烟 ~100ms 级，签名级缓存随出包验证再评估）。
    #[cfg(windows)]
    fn run_koffi_preflight(&self) {
        let settings = shell_core::SettingsStore::new(shell_core::DshPaths::resolve().settings);
        let cached = settings.get("koffiPreflightOk").ok().flatten().and_then(|v| v.as_bool());
        let ok = match cached {
            Some(true) => true,
            _ => {
                let mut cmd = std::process::Command::new(&self.node_exe);
                cmd.arg(&self.sidecar_cli)
                    .arg("koffi-preflight")
                    .arg("--app-dir")
                    .arg(&self.app_dir)
                    .creation_flags_win();
                let out = bounded::output_with_timeout(&mut cmd, SIDECAR_STEP_TIMEOUT)
                    .ok()
                    .and_then(|o| o.output);
                let ok = matches!(out, Some(o) if o.status.success()
                    && String::from_utf8_lossy(&o.stdout).trim_end().ends_with("{\"ok\":true}"));
                if ok {
                    let _ = settings.set("koffiPreflightOk", serde_json::json!(true));
                }
                ok
            }
        };
        if !ok {
            let mut cmd = std::process::Command::new(&self.node_exe);
            cmd.arg(&self.sidecar_cli)
                .arg("picker-overlay")
                .arg("--app-dir")
                .arg(&self.app_dir)
                .creation_flags_win();
            let out = bounded::output_with_timeout(&mut cmd, SIDECAR_STEP_TIMEOUT)
                .ok()
                .and_then(|o| o.output);
            if let Some(o) = out {
                let stdout = String::from_utf8_lossy(&o.stdout);
                if let Some(line) = stdout.trim_end().lines().last() {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
                        if let Some(p) = v.get("path").and_then(|p| p.as_str()) {
                            log_line("koffi 预检未过，启用目录选择器降级 overlay");
                            let mut g = self.inner.lock().unwrap_or_else(|p| p.into_inner());
                            let path = std::path::PathBuf::from(p);
                            if !g.overlays.contains(&path) {
                                g.overlays.push(path);
                            }
                        }
                    }
                }
            }
        } else {
            log_line("koffi 预检通过");
        }
    }

    /// 非 Windows：koffi 预检跳过。预检的故障模式是 win32-x64 预编译二进制
    /// 在 koffi.load() 处访问违例（koffi-preflight.cjs 探测的正是 kernel32.dll）
    /// ——非 Windows 无此故障面；若照跑只会恒失败，导致目录选择器被永久
    /// 降级到 browse 后端（静默功能损失）。
    #[cfg(not(windows))]
    fn run_koffi_preflight(&self) {
        log_line("koffi 预检仅 Windows 需要（本平台跳过）");
    }

    /// 刷新 safe-boot overlay（崩溃自动重启前）：解析 dsh-web.log 失败插件 → 禁用。
    fn refresh_safe_overlay(&self) -> bool {
        let mut cmd = std::process::Command::new(&self.node_exe);
        cmd.arg(&self.sidecar_cli)
            .arg("safe-overlay")
            .arg("--app-dir")
            .arg(&self.app_dir)
            .creation_flags_win();
        let Some(o) = bounded::output_with_timeout(&mut cmd, SIDECAR_STEP_TIMEOUT)
            .ok()
            .and_then(|o| o.output)
        else { return false };
        let stdout = String::from_utf8_lossy(&o.stdout);
        let Some(line) = stdout.trim_end().lines().last() else { return false };
        let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else { return false };
        let ids = v.get("ids").and_then(|i| i.as_array()).map(|a| a.len()).unwrap_or(0);
        if ids == 0 {
            return false;
        }
        if let Some(p) = v.get("path").and_then(|p| p.as_str()) {
            log_line(&format!("安全启动 overlay：禁用 {ids} 个失败插件"));
            let mut g = self.inner.lock().unwrap_or_else(|p| p.into_inner());
            let path = std::path::PathBuf::from(p);
            if !g.overlays.contains(&path) {
                g.overlays.push(path);
            }
        }
        true
    }

    /// spawn 内核进程 + 就绪行监视线程。
    fn spawn_kernel(self: Arc<Self>, port: u16, tx: &Sender<SupervisorEvent>) -> Result<(), String> {
        // 进程隔离不变量：spawn 前必须无活内核——任何并发路径违反互斥
        // （瀑布 vs 自动重启）时，后来者负责回收先到者。历史缺陷：直接覆盖
        // 句柄 = 先到内核成为孤儿（数百 MB RSS 无人管，占着端口直到进程退出）。
        let orphan = self.inner.lock().unwrap_or_else(|p| p.into_inner()).kernel.take();
        if let Some(mut victim) = orphan {
            let pid = victim.child.id();
            log_line(&format!("spawn 前发现未回收内核 pid={pid}（并发 spawn 违例，先杀后起）"));
            kernel_process::kill_tree(&mut victim.child, pid);
            victim.job.close(); // 内核已终结：释放 Job 句柄
        }
        let overlays = self.inner.lock().unwrap_or_else(|p| p.into_inner()).overlays.clone();
        let spec = SpawnSpec::new(&self.node_exe, &self.bin_js, &self.kernel_version, port, &overlays);
        let mut cmd = Command::new(&spec.node_exe);
        cmd.args(&spec.node_args).arg(&spec.bin_js).args(&spec.web_args);
        // 环境白名单 + 监管标识（main.js childEnv 语义）。
        for (k, v) in std::env::vars() {
            if spec.env_allow.iter().any(|a| a.eq_ignore_ascii_case(&k)) {
                cmd.env(k, v);
            }
        }
        cmd.env("DSH_DESKTOP_SUPERVISED", "1").env("NO_COLOR", "1");
        cmd.current_dir(&self.app_dir).stdin(Stdio::null())
            .stdout(Stdio::piped()).stderr(Stdio::piped())
            .creation_flags_win();
        // Unix 杀树根基：内核设为进程组长（PGID == pid），后续全部子孙（工具
        // 进程/持久终端会话）天然继承同组——kill_kernel 的 killpg(-pgid) 才能
        // 整组收割（mac 退出后内核残留的根因）。Windows no-op（杀树走 Job
        // Object + taskkill）。
        kernel_process::kill_tree::set_process_group_leader(&mut cmd);
        let mut child = cmd.spawn().map_err(|e| format!("spawn: {e}"))?;
        let pid = child.id();
        log_line(&format!("内核 pid={pid} spawn: {}", spec.display_cmd()));

        // Review#2 根治：Job Object 杀树保护（父进程被强杀时 OS 收割内核树）。
        // 句柄随 KernelProc 存活，内核终结后 Drop 关闭（不再随 spawn 泄漏）。
        let job = match kernel_process::job_object::assign_child_to_kill_on_close_job(&child) {
            Ok(job) => job,
            Err(e) => {
                log_line(&format!("Job Object 赋值失败（杀树保护降级为显式 taskkill）: {e}"));
                kernel_process::job_object::JobHandle::noop()
            }
        };
        let stdout = child.stdout.take().ok_or("stdout piped 失败")?;
        let stderr = child.stderr.take();
        self.inner.lock().unwrap_or_else(|p| p.into_inner()).kernel = Some(KernelProc { child, job });

        // 就绪行监视（独占读 stdout；读 EOF 时若进程仍在则继续探活兜底）。
        let this = Arc::clone(&self);
        let tx2 = tx.clone();
        std::thread::spawn(move || {
            let mut parser = ReadyLineParser::new();
            let mut url: Option<String> = None;
            for chunk in BufReader::new(stdout).split(b'\n') {
                let chunk = match chunk { Ok(c) => c, Err(_) => break };
                let text = String::from_utf8_lossy(&chunk).into_owned();
                if !text.trim().is_empty() {
                    log_line(&format!("web| {text}"));
                }
                if url.is_none() {
                    if let Some(u) = parser.feed(&format!("{text}\n")) {
                        url = Some(u.clone());
                        let rtx = { let mut g = this.inner.lock().unwrap_or_else(|p| p.into_inner()); g.kernel_url = Some(u.clone()); g.ready_tx.take() };
                        if let Some(rtx) = rtx { let _ = rtx.send(Ok(u.clone())); }
                        this.set_state(RunState::Ready);
                        // HTTP 热探（用户实测「Failed to fetch 闪现」根治）：ready 行
                        // 只表示内核进程打出就绪日志，HTTP 监听可能有 ~100ms 窗口
                        // 尚未接受请求。本线程是 KernelReady 的唯一发送源（瀑布
                        // on_boot_success 与崩溃自动重启两条路径统一在此换页）——
                        // 此前自动重启路径无热探，就绪行早于 bind 时换页 → WebView2
                        // 错误页（白屏形态之一；且错误页上垫片照常发心跳，渲染层
                        // 心跳监测判定「页面健康」永不自愈）。
                        for i in 0..50 {
                            if Self::http_alive(port) { break; }
                            if i == 49 { log_line("HTTP 热探超时（5s），换页继续（可能首次闪败）"); }
                            std::thread::sleep(Duration::from_millis(100));
                        }
                        let _ = tx2.send(SupervisorEvent::KernelReady { url: u, port });
                        // 探活布防（唯一位置）：就绪行线程对每次内核就绪都布防——
                        // 覆盖瀑布路径与崩溃自动重启路径（此前只在 on_boot_success
                        // 布防，自动重启后的内核处于无探活状态）。probe_gen 令牌
                        // 递增令上一代探活环自行退出（同代际换内核不得双探活）。
                        let (probe_gen, live_gen) = {
                            let mut g = this.inner.lock().unwrap_or_else(|p| p.into_inner());
                            g.probe_gen += 1;
                            (g.probe_gen, g.generation)
                        };
                        this.probe_loop(port, tx2.clone(), live_gen, probe_gen);
                    }
                }
            }
            // stdout EOF = 进程退出。
            let (code, exited) = {
                let mut g = this.inner.lock().unwrap_or_else(|p| p.into_inner());
                match g.kernel.as_mut() {
                    Some(kp) => match kp.child.try_wait() {
                        Ok(Some(st)) => (st.code(), true),
                        Ok(None) => (None, true), // stdout 关了但进程在：罕见，按退出处理
                        Err(_) => (None, true),
                    },
                    None => (None, false),
                }
            };
            if exited {
                this.on_kernel_exit(code, &tx2);
            }
        });
        // stderr 收尾线程（防管道满阻塞内核）。
        if let Some(err) = stderr {
            std::thread::spawn(move || {
                use std::io::Read;
                let mut buf = [0u8; 4096];
                let mut e = err;
                while let Ok(n) = e.read(&mut buf) {
                    if n == 0 {
                        break;
                    }
                    log_line(&format!("web-err| {}", String::from_utf8_lossy(&buf[..n]).trim_end()));
                }
            });
        }
        Ok(())
    }

    /// 内核退出处理：崩溃环判定。
    fn on_kernel_exit(self: &Arc<Self>, code: Option<i32>, tx: &Sender<SupervisorEvent>) {
        let now = now_ms();
        let (verdict, crashes) = {
            let mut g = self.inner.lock().unwrap_or_else(|p| p.into_inner());
            if g.stopping {
                return;
            }
            // 瀑布等待者唤醒：启动期退出 = 本次拉起失败。
            if let Some(rtx) = g.ready_tx.take() {
                let _ = rtx.send(Err(format!("内核启动期退出 code={code:?}")));
            }
            g.kernel = None;
            g.crash_count += 1;
            let v = g.crash.record_crash(now);
            (v, g.crash_count)
        };
        log_line(&format!("内核退出 code={code:?} 第 {crashes} 次"));
        let _ = tx.send(SupervisorEvent::KernelExit { code, crashed: true });
        match verdict {
            // 崩溃环触发后冷却期内的后续崩溃：维持恢复页，不再自动拉起——
            // 此前 Cooldown 落在 `_` 兜底臂继续自动重启，恢复页背后内核反复
            // 拉起/退出（用户侧「频繁重启」的主机），且任一次走到就绪行还会
            // 经 KernelReady 把页面从恢复页拉回内核页（页面反复横跳）。
            Verdict::Tripped | Verdict::Cooldown => self.enter_recovery_tx(tx, "崩溃环触发"),
            Verdict::Ok => {
                // 瀑布进行中：启动期退出由瀑布层独占接管（boot_active 互斥）——
                // 历史缺陷：自动重启臂（2s 延迟）与瀑布二层（重跑 boot 链 ~4s）
                // 无互斥，两路各拉一个内核，后者覆盖句柄 → 前者成孤儿内核
                // （数百 MB RSS 常驻；若同端口其一还吃 EADDRINUSE 记假崩溃）。
                let (port, gen, boot_active) = {
                    let g = self.inner.lock().unwrap_or_else(|p| p.into_inner());
                    (g.port, g.generation, g.boot_active)
                };
                if boot_active {
                    log_line("瀑布进行中：启动期退出由瀑布层接管，本次不自动重启（防双内核竞态）");
                    return;
                }
                // 未成环：自动重启一次（Electron watchServerProc 语义：异常退出自动拉起）。
                // 探活/换页不在此布防：新内核的就绪行线程统一负责（probe_gen 令牌）。
                let this = Arc::clone(self);
                let tx2 = tx.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(2));
                    let g = this.inner.lock().unwrap_or_else(|p| p.into_inner());
                    if g.stopping || g.generation != gen || g.kernel.is_some() {
                        return;
                    }
                    drop(g);
                    this.refresh_safe_overlay();
                    if let Some(p) = port {
                        if Arc::clone(&this).spawn_kernel(p, &tx2).is_err() {
                            this.enter_recovery_tx(&tx2, "自动重启失败");
                        }
                    }
                });
            }
        }
    }

    /// 单连接三态探活（性能审计 2026-08：原实现每拍开两条连接——TCP 试探
    /// 一条、http_alive 再开一条，健康稳态每天 ~5.76 万次环回连接纯浪费）。
    fn probe_outcome(port: u16) -> ProbeOutcome {
        use std::io::{Read, Write};
        let Ok(addr) = format!("127.0.0.1:{port}").parse() else { return ProbeOutcome::TcpDead };
        let Ok(mut s) = std::net::TcpStream::connect_timeout(&addr, Duration::from_secs(2)) else {
            return ProbeOutcome::TcpDead;
        };
        let _ = s.set_read_timeout(Some(Duration::from_secs(3)));
        let _ = s.set_write_timeout(Some(Duration::from_secs(3)));
        if s.write_all(b"GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n").is_err() {
            // 端口在、协议死：按假死计；进程若真死，下一拍 connect 失败归 TcpDead。
            return ProbeOutcome::Zombie;
        }
        let mut buf = [0u8; 16];
        match s.read(&mut buf) {
            Ok(n) if n > 0 => ProbeOutcome::Alive,
            _ => ProbeOutcome::Zombie,
        }
    }

    /// HTTP 应用层探活（bool 语义，热探路径消费）：读到任何响应字节（含
    /// 404/401——内核对 / 至少回 index/错误页）即证明事件循环在转。TCP 握手
    /// 由 OS 协议栈完成，进程假死时也恒成功——必须发请求读响应才能区分
    /// （issue #122/#129）。
    fn http_alive(port: u16) -> bool {
        Self::probe_outcome(port) == ProbeOutcome::Alive
    }

    fn probe_loop(self: &Arc<Self>, port: u16, tx: Sender<SupervisorEvent>, gen: u64, probe_gen: u64) {
        let this = Arc::clone(self);
        std::thread::spawn(move || {
            // 就绪后失联分两形态（#122 假死定性）：
            //   a) TCP 连不上（进程死/端口死）→ 连续 3 次按退出处理（原语义）；
            //   b) TCP 通但 HTTP 连续无响应 → 假死，连续 20 次（~60s）受控重启。
            //      阈值从 5(15s) 提到 20(60s)：用户实测内核做上下文压缩/LSTM 推理
            //      时事件循环被占 20-30s——15s 会误杀正在工作的内核（导致
            //      "signal time out" + "中断不了" + 频繁压缩的恶性循环）。
            //      走 on_kernel_exit 的崩溃环窗口限次（天然防死循环）。
            //
            // 退出条件（v0.5.1 频繁重启回归修复）：
            //   - probe_gen 令牌不符（新一代内核已布防，本环属上一代内核）；
            //   - 状态进 CrashLoop/Recovery：崩溃环/恢复页期间不得继续探活——
            //     此前探活环在恢复页期间继续探死端口，3 次失联后 on_kernel_exit
            //     会把崩溃自动重启刚拉起的新内核一并杀掉（复活-再杀循环）。
            let mut consecutive = 0usize;
            let mut zombie = 0usize;
            loop {
                std::thread::sleep(Duration::from_secs(3));
                {
                    let g = this.inner.lock().unwrap_or_else(|p| p.into_inner());
                    if g.stopping || g.generation != gen || g.probe_gen != probe_gen {
                        return;
                    }
                    if g.state == RunState::Recovery || g.state == RunState::CrashLoop {
                        return;
                    }
                }
                match Self::probe_outcome(port) {
                    ProbeOutcome::Alive => {
                        consecutive = 0;
                        zombie = 0;
                    }
                    ProbeOutcome::TcpDead => {
                        zombie = 0;
                        consecutive += 1;
                        let _ = tx.send(SupervisorEvent::ProbeFailed { consecutive });
                        if consecutive >= 3 {
                            // 端口连续失联但进程可能还活着：杀掉按退出处理。
                            // 内核已不在（退出处理链已接管：自动重启或恢复页）时
                            // 不得再记一次崩溃——那会把后续自动重启的新内核当作
                            // 本次失败连带处理。
                            let kernel_present = {
                                let g = this.inner.lock().unwrap_or_else(|p| p.into_inner());
                                g.kernel.is_some()
                            };
                            if kernel_present {
                                this.kill_kernel();
                                this.on_kernel_exit(None, &tx);
                            }
                            return;
                        }
                    }
                    // TCP 通、HTTP 无响应：假死形态。
                    ProbeOutcome::Zombie => {
                        zombie += 1;
                        let _ = tx.send(SupervisorEvent::ZombieSuspect { consecutive: zombie });
                        log_line(&format!("内核假死可疑（端口通、HTTP 无响应）×{zombie}"));
                        if zombie >= 20 {
                            log_line("内核假死判定成立（连续 60s HTTP 无响应，20×3s 探活），受控重启");
                            this.kill_kernel();
                            this.on_kernel_exit(None, &tx);
                            return;
                        }
                    }
                }
            }
        });
    }

    /// 原地重启（restart_service）：杀树 → 重跑 boot 链 → 换页。
    pub fn restart(self: &Arc<Self>, tx: Sender<SupervisorEvent>, preferred_port: Option<u16>) {
        {
            let mut g = self.inner.lock().unwrap_or_else(|p| p.into_inner());
            g.generation += 1;
            g.stopping = false;
            g.kernel_url = None;
            g.crash.record_graceful_restart();
        }
        self.kill_kernel();
        self.spawn_boot(tx, preferred_port);
    }

    /// 进入恢复页。
    fn enter_recovery(&self, tx: &Sender<SupervisorEvent>, reason: &str) {
        self.enter_recovery_tx(tx, reason);
    }
    fn enter_recovery_tx(&self, tx: &Sender<SupervisorEvent>, reason: &str) {
        self.kill_kernel();
        // 幂等：已在崩溃环态（冷却期内后续崩溃）不再重发 CrashLoop 事件——
        // 事件会再导航恢复页 + 弹系统通知，崩溃连环下发会刷屏。
        let already = self.state() == RunState::CrashLoop;
        self.set_state(RunState::CrashLoop);
        {
            let mut g = self.inner.lock().unwrap_or_else(|p| p.into_inner());
            g.last_error = Some(reason.to_string());
        }
        if already {
            log_line(&format!("崩溃环冷却期内再次崩溃，维持恢复页（{reason}）"));
            return;
        }
        log_line(&format!("崩溃环触发，转恢复页（{reason}）"));
        let crashes = self.inner.lock().unwrap_or_else(|p| p.into_inner()).crash_count;
        let _ = tx.send(SupervisorEvent::CrashLoop { crashes });
    }

    /// 恢复页「重启」：手动复位崩溃环。
    pub fn recovery_restart(self: &Arc<Self>, tx: Sender<SupervisorEvent>) {
        self.recovery_restart_with_port(tx, None);
    }

    /// 恢复页「重启」（带优先端口）：复位崩溃环 + 全链重启。
    /// preferred 传上次内核端口（origin 稳定，SPA localStorage 偏好不丢）。
    pub fn recovery_restart_with_port(self: &Arc<Self>, tx: Sender<SupervisorEvent>, preferred_port: Option<u16>) {
        {
            let mut g = self.inner.lock().unwrap_or_else(|p| p.into_inner());
            g.crash.record_recovery();
            g.crash_count = 0;
            g.last_error = None;
        }
        self.set_state(RunState::Recovery);
        self.restart(tx, preferred_port);
    }

    /// 杀内核整树（restart / 恢复页 / 探活失败 / 应用退出共用）。
    /// Windows：taskkill /T /F；Unix：killpg(-pgid, SIGKILL) 整组收割
    /// ——OS 绑定见 kernel_process::kill_tree。
    /// 持锁仅取句柄，杀树（taskkill 子进程 + wait，AV 下数百 ms）在锁外
    /// 进行——旧行为全程持锁，探活节拍 / state() / kernel_url() 全部陪等。
    pub fn kill_kernel(&self) {
        if let Some(mut kp) = self.inner.lock().unwrap_or_else(|p| p.into_inner()).kernel.take() {
            let pid = kp.child.id();
            kill_tree(&mut kp.child, pid);
            kp.job.close(); // 内核已终结：释放 Job 句柄（不再随 spawn 泄漏）
        }
    }

    /// 应用退出路径：同步终结（不依赖事件循环）。
    pub fn shutdown(&self) {
        self.inner.lock().unwrap_or_else(|p| p.into_inner()).stopping = true;
        self.kill_kernel();
    }
}

fn read_kernel_version(app_dir: &std::path::Path) -> String {
    let pkg = app_dir.join("node_modules").join("@deepseek-ai").join("dsh").join("package.json");
    let Ok(raw) = std::fs::read_to_string(pkg) else { return "unknown".into() };
    if let Some(pos) = raw.find("\"version\"") {
        if let Some(colon) = raw[pos..].find(':') {
            let rest = &raw[pos + colon..];
            if let Some(q1) = rest.find('"') {
                if let Some(len) = rest[q1 + 1..].find('"') {
                    return rest[q1 + 1..q1 + 1 + len].to_string();
                }
            }
        }
    }
    "unknown".into()
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn log_line(msg: &str) {
    // T4 反馈：无时间戳时恢复耗时只能外部计时——补 HH:MM:SS 前缀。
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let (h, m, sec) = ((secs / 3600) % 24, (secs / 60) % 60, secs % 60);
    println!("[supervisor {h:02}:{m:02}:{sec:02}] {msg}");
}

#[cfg(windows)]
trait WinFlags {
    fn creation_flags_win(&mut self) -> &mut Self;
}
#[cfg(windows)]
impl WinFlags for Command {
    fn creation_flags_win(&mut self) -> &mut Self {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        self.creation_flags(CREATE_NO_WINDOW)
    }
}
#[cfg(not(windows))]
trait WinFlags {
    fn creation_flags_win(&mut self) -> &mut Self;
}
#[cfg(not(windows))]
impl WinFlags for Command {
    fn creation_flags_win(&mut self) -> &mut Self {
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::Ordering;

    /// #122/#129 假死形态的确定性验证：TCP 握手被 OS 协议栈代答、应用层
    /// 永不响应——http_alive 必须判死（纯 TCP 探测恒活的正是这种形态）。
    /// 三态对照：挂死服务器（accept 后不读写）/ 正常 HTTP / 无监听端口。
    #[test]
    fn http_alive_detects_zombie_vs_live_vs_dead() {
        // ① 假死：accept 但永不响应（事件循环卡死的协议栈镜像）
        let zombie = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let zport = zombie.local_addr().unwrap().port();
        let zthread = std::thread::spawn(move || {
            for stream in zombie.incoming() {
                let _stream: std::net::TcpStream = stream.unwrap();
                std::thread::sleep(std::time::Duration::from_secs(30)); // 持住连接不响应
            }
        });
        // ② 正常：最小 HTTP 响应（404 也是活）
        let live = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let lport = live.local_addr().unwrap().port();
        let lthread = std::thread::spawn(move || {
            for stream in live.incoming() {
                let mut s = stream.unwrap();
                use std::io::{Read, Write};
                let mut buf = [0u8; 128];
                let _ = s.read(&mut buf);
                let _ = s.write_all(b"HTTP/1.1 404 Not Found
Content-Length: 0

");
            }
        });
        std::thread::sleep(std::time::Duration::from_millis(150));
        assert!(!Supervisor::http_alive(zport), "假死（TCP 通、HTTP 永不响应）必须判死——signal timed out 的根形态");
        assert!(Supervisor::http_alive(lport), "正常 HTTP（含 404）必须判活");
        // ③ 端口不存在
        let dead = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let dport = dead.local_addr().unwrap().port();
        drop(dead);
        assert!(!Supervisor::http_alive(dport), "无监听端口必须判死");
        drop(zthread);
        drop(lthread);
    }

    /// 仓库根定位（与装配层 find_repo_root 同规则）。
    fn repo_root() -> Option<std::path::PathBuf> {
        let mut dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        for _ in 0..6 {
            if dir.join("dsh-desktop").join("vendor").join("node").exists() {
                return Some(dir);
            }
            if !dir.pop() {
                break;
            }
        }
        None
    }

    /// 单连接三态探活（性能审计 2026-08）：每拍恰好一次 TCP 连接——原实现
    /// TCP 试探 + http_alive 各开一条（健康稳态 3s 一拍 ×2 条 ≈ 每天 5.76 万
    /// 次环回连接）。计数服务器实测连接数 == 探测次数。
    #[test]
    fn probe_once_opens_exactly_one_connection_per_tick() {
        use std::sync::atomic::AtomicUsize;
        let conns = Arc::new(AtomicUsize::new(0));
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let c2 = Arc::clone(&conns);
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let mut s = stream.unwrap();
                c2.fetch_add(1, Ordering::Relaxed);
                use std::io::{Read, Write};
                let mut buf = [0u8; 128];
                let _ = s.read(&mut buf);
                let _ = s.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok");
            }
        });
        std::thread::sleep(Duration::from_millis(150));
        const N: usize = 5;
        for _ in 0..N {
            assert_eq!(Supervisor::probe_outcome(port), ProbeOutcome::Alive);
        }
        assert_eq!(conns.load(Ordering::Relaxed), N, "每拍必须恰好一次连接（旧实现 2×N = 纯浪费）");
    }

    /// 三态对照：假死（TCP 通、HTTP 永不响应）/ 无监听端口——单连接判定
    /// 与旧双连接口径逐态一致。
    #[test]
    fn probe_outcome_classifies_zombie_and_dead() {
        let zombie = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let zport = zombie.local_addr().unwrap().port();
        std::thread::spawn(move || {
            for stream in zombie.incoming() {
                let _stream: std::net::TcpStream = stream.unwrap();
                std::thread::sleep(Duration::from_secs(30)); // 持住连接不响应
            }
        });
        let dead = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let dport = dead.local_addr().unwrap().port();
        drop(dead);
        std::thread::sleep(Duration::from_millis(150));
        assert_eq!(Supervisor::probe_outcome(zport), ProbeOutcome::Zombie, "TCP 通、HTTP 永不响应 → 假死");
        assert_eq!(Supervisor::probe_outcome(dport), ProbeOutcome::TcpDead, "无监听端口 → 进程死");
    }

    /// 进程生命周期不变量形态锚点（性能审计 2026-08）：
    /// ① boot_active 互斥：瀑布运行期启动期退出不得进入自动重启臂；
    /// ② spawn 前回收：spawn_kernel 必须先杀未回收内核（孤儿根治的第二道防线）；
    /// ③ 杀树在锁外：kill_kernel 持锁仅取句柄（探活节拍不陪等 taskkill）；
    /// ④ Job 句柄随内核终结关闭（不随 spawn 泄漏）。
    #[test]
    fn kernel_lifecycle_invariants_shape() {
        let src = include_str!("supervisor.rs").replace("\r\n", "\n");
        // ① 自动重启臂必须让位瀑布。
        let exit_seg = src
            .split("fn on_kernel_exit")
            .nth(1)
            .and_then(|s| s.split("/// 单连接三态探活").next())
            .expect("on_kernel_exit 段");
        let boot_check = exit_seg.find("boot_active").expect("自动重启臂必须检查 boot_active");
        let restart_arm = exit_seg.find("std::thread::spawn(move || {\n                    std::thread::sleep(Duration::from_secs(2));").expect("自动重启线程臂");
        assert!(boot_check < restart_arm, "boot_active 检查必须先于自动重启线程拉起（瀑布独占恢复权）");
        // ② spawn 前回收。
        let spawn_seg = src
            .split("fn spawn_kernel")
            .nth(1)
            .and_then(|s| s.split("let overlays =").next())
            .expect("spawn_kernel 段头");
        assert!(spawn_seg.contains("并发 spawn 违例，先杀后起"), "spawn 前必须回收未收割内核: {spawn_seg}");
        // ③ 杀树锁外。
        let kill_seg = src
            .split("pub fn kill_kernel")
            .nth(1)
            .and_then(|s| s.split("/// 应用退出路径").next())
            .expect("kill_kernel 段");
        assert!(kill_seg.contains("kernel.take()"), "持锁仅取句柄");
        assert!(kill_seg.contains("job.close()"), "内核终结后必须关闭 Job 句柄");
        // ④ BootActiveGuard 存在且代际感知。
        assert!(src.contains("struct BootActiveGuard"), "瀑布互斥守卫必须存在");
        let guard_seg = src.split("impl Drop for BootActiveGuard").nth(1).and_then(|s| s.split("}").next()).unwrap_or("");
        assert!(guard_seg.contains("g.generation == self.1"), "守卫清理必须代际感知（restart 叠加场景）");
    }

    /// 干净临时 home + userData（测试沙箱）。
    fn sandbox(tag: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("dsh-tauri-test-{}-{}", tag, std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn kernel_version_from_package_json() {
        let dir = sandbox("ver");
        let pkg_dir = dir.join("node_modules").join("@deepseek-ai").join("dsh");
        std::fs::create_dir_all(&pkg_dir).unwrap();
        std::fs::write(pkg_dir.join("package.json"), r#"{"name":"x","version":"0.1.0-rc.8"}"#).unwrap();
        assert_eq!(read_kernel_version(&dir), "0.1.0-rc.8");
        // 缺文件 / 坏 JSON → unknown（不 panic）。
        assert_eq!(read_kernel_version(&sandbox("ver2")), "unknown");
        let bad = sandbox("ver3");
        std::fs::write(bad.join("package.json"), "not json at all").unwrap();
        assert_eq!(read_kernel_version(&bad), "unknown");
        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&bad);
    }

    /// vendor node 平台名选择（P0 回归锚点）：本平台主名优先；主名缺失时
    /// 另一名兜底（检出只带单平台的形态）；两者皆缺返回主名（spawn 报错
    /// 走既有恢复页路径，不 panic）。
    #[test]
    fn vendor_node_exe_prefers_platform_name_with_fallback() {
        let dir = sandbox("vn");
        let vdir = dir.join("vendor").join("node");
        std::fs::create_dir_all(&vdir).unwrap();
        let primary = if cfg!(windows) { "node.exe" } else { "node" };
        let alt = if cfg!(windows) { "node" } else { "node.exe" };
        // 只放主名：命中主名。
        std::fs::write(vdir.join(primary), b"").unwrap();
        assert_eq!(vendor_node_exe(&dir), vdir.join(primary));
        // 主名 + 备名都在：仍主名。
        std::fs::write(vdir.join(alt), b"").unwrap();
        assert_eq!(vendor_node_exe(&dir), vdir.join(primary));
        // 只放备名（单平台检出形态）：备名兜底，不再拼死主名。
        let dir2 = sandbox("vn2");
        let vdir2 = dir2.join("vendor").join("node");
        std::fs::create_dir_all(&vdir2).unwrap();
        std::fs::write(vdir2.join(alt), b"").unwrap();
        assert_eq!(vendor_node_exe(&dir2), vdir2.join(alt), "主名缺失须兜底另一平台名");
        // 全缺：返回主名路径（调用方 spawn 失败转恢复页）。
        let dir3 = sandbox("vn3");
        std::fs::create_dir_all(dir3.join("vendor").join("node")).unwrap();
        assert_eq!(vendor_node_exe(&dir3), dir3.join("vendor").join("node").join(primary));
        for d in [&dir, &dir2, &dir3] {
            let _ = std::fs::remove_dir_all(d);
        }
    }

    /// 功能集成：真机 boot 链（sidecar 四步）在沙箱 home 上执行。
    /// 覆盖：Supervisor::run_sidecar_boot（步骤解析 + ok 判定 + 事件转发）。
    #[test]
    fn sidecar_boot_sandbox_integration() {
        let Some(root) = repo_root() else { eprintln!("[skip] 仓库检出不含 dsh-desktop（CI 无依赖环境）"); return; };
        let _env = crate::ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let home = sandbox("boot");
        std::env::set_var("DSH_HOME", &home);
        std::env::set_var("DSH_TAURI_USERDATA", home.join("ud"));
        let sv = Supervisor::new(&root);
        let (tx, rx) = std::sync::mpsc::channel();
        let result = sv.run_sidecar_boot(&tx, 0);
        std::env::remove_var("DSH_HOME");
        std::env::remove_var("DSH_TAURI_USERDATA");
        assert!(result.is_ok(), "sidecar boot 应成功: {result:?}");
        // 步骤事件按固定顺序全部转发（data-flow.md §3）。
        let names: Vec<String> = rx.iter().map(|e| match e { SupervisorEvent::BootStep { name, .. } => name, _ => String::new() }).take(5).collect();
        assert_eq!(names, vec!["repair", "sync", "presets", "patches", "preflight"], "boot 步骤顺序契约");
        // 沙箱 home 上 profile 结构确已建立（同步器落盘）。
        assert!(home.join("profiles").join("web").join("cordis.patch.yml").exists(), "profile patch 应已建立");
        let _ = std::fs::remove_dir_all(&home);
    }

    /// 功能集成（真机全链）：boot → 内核 spawn → 就绪行 → TCP 可达 → 关停。
    /// 覆盖：spawn_boot / spawn_kernel / ReadyLineParser 接线 / kill_tree / Job Object。
    #[test]
    fn full_boot_to_kernel_ready_integration() {
        let Some(root) = repo_root() else { eprintln!("[skip] 仓库检出不含 dsh-desktop"); return; };
        let _env = crate::ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let home = sandbox("full");
        std::env::set_var("DSH_HOME", &home);
        std::env::set_var("DSH_TAURI_USERDATA", home.join("ud"));
        let sv: Arc<Supervisor> = Arc::new(Supervisor::new(&root));
        // 版本断言放宽到 0.1.x：内核家族从 0.1.0-rc.8 升到 0.1.1-rc.1（K1 适配），
        // 前缀 0.1. 覆盖两者，防止每次 rc 平移都要改这里。
        assert!(sv.kernel_version.starts_with("0.1."), "内核版本应可读: {}", sv.kernel_version);
        let (tx, rx) = std::sync::mpsc::channel();
        sv.spawn_boot(tx, None);
        // boot（~4s）+ 内核就绪（~6s），150s 兜底；先到的 BootStep 逐条核对。
        let deadline = Instant::now() + Duration::from_secs(150);
        let mut boot_steps: Vec<String> = Vec::new();
        let url = loop {
            let left = deadline.saturating_duration_since(Instant::now());
            match rx.recv_timeout(left.max(Duration::from_millis(1))) {
                Ok(SupervisorEvent::BootStep { name, ok, .. }) => {
                    assert!(ok, "boot 步骤 {name} 不应失败");
                    boot_steps.push(name);
                }
                Ok(SupervisorEvent::KernelReady { url, port }) => {
                    let ok = std::net::TcpStream::connect_timeout(&format!("127.0.0.1:{port}").parse().unwrap(), Duration::from_secs(3)).is_ok();
                    assert!(ok, "就绪端口应可连: {port}");
                    break url;
                }
                Ok(other) => panic!("非预期事件: {other:?}"),
                Err(_) => panic!("150s 内未就绪（boot_steps={boot_steps:?}）"),
            }
        };
        assert_eq!(boot_steps, vec!["repair", "sync", "presets", "patches", "preflight"]);
        assert!(url.starts_with("http://127.0.0.1:"), "就绪 URL 形态: {url}");
        assert_eq!(sv.state(), RunState::Ready);
        assert!(sv.kernel_url().is_some());
        // 关停（杀树；Job Object 兜强杀场景由专测覆盖）。
        sv.shutdown();
        std::env::remove_var("DSH_HOME");
        std::env::remove_var("DSH_TAURI_USERDATA");
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn generation_increments_on_restart_and_state_transitions() {
        let Some(root) = repo_root() else { eprintln!("[skip]"); return; };
        let sv: Arc<Supervisor> = Arc::new(Supervisor::new(&root));
        let g0 = sv.inner.lock().unwrap_or_else(|p| p.into_inner()).generation;
        sv.set_state_for_test(RunState::Ready);
        assert_eq!(sv.state(), RunState::Ready);
        let (tx, _rx) = std::sync::mpsc::channel();
        sv.restart(tx, None);
        assert_eq!(sv.inner.lock().unwrap_or_else(|p| p.into_inner()).generation, g0 + 1, "restart 应递增代际号");
        sv.shutdown();
        assert!(sv.inner.lock().unwrap_or_else(|p| p.into_inner()).stopping);
        let _ = Ordering::Relaxed;
    }

    /// 看门狗判定表（纯函数全态枚举）：boot 进行态（Boot/Repair/Sync/Patch/
    /// Spawn）触发转恢复页；Ready（迟到的正常就绪）与 Recovery（瀑布已自愈）
    /// 不触发；stopping（退出路径）压制一切——防退出时误发恢复页事件。
    #[test]
    fn watchdog_decision_table_all_states() {
        use RunState::*;
        for s in [Boot, Repair, Sync, Patch, Spawn, CrashLoop] {
            assert!(Supervisor::watchdog_should_fire(false, s), "{s:?} 仍卡 boot 链应触发看门狗");
        }
        assert!(!Supervisor::watchdog_should_fire(false, Ready), "迟到的正常就绪不得被看门狗误杀");
        assert!(!Supervisor::watchdog_should_fire(false, Recovery), "已进恢复页不得重复触发");
        for s in [Boot, Spawn, Ready, CrashLoop] {
            assert!(!Supervisor::watchdog_should_fire(true, s), "stopping={s:?} 退出路径压制看门狗");
        }
    }

    /// v0.5.1「频繁重启 + 白屏」回归锚点组（真机复现定案的四个断流/复活面）。
    /// 形态断言法（include_str!），防回退：
    ///   ① KernelReady 单源 + 热探：全文件只允许一处 send(KernelReady)——
    ///      在就绪行线程内且前置 http_alive 热探（自动重启路径换页不再竞速
    ///      HTTP bind → 不再产 chrome-error 白页）；on_boot_success 不得再发。
    ///   ② 崩溃环 Cooldown 不得自动重启（此前 `_` 兜底臂把恢复页背后的内核
    ///      反复拉起，页面在恢复页/内核页横跳 = 用户侧「频繁重启」）。
    ///   ③ 探活环令牌 + CrashLoop/Recovery 退出 + 内核不在不补刀（防旧环
    ///      复活/误杀自动重启的新内核）。
    ///   ④ 看门狗代际感知（restart 叠犬不得打断新 boot）。
    #[test]
    fn regression_v051_restart_whitescreen_anchors() {
        let src = include_str!("supervisor.rs").replace("\r\n", "\n");
        // ① KernelReady 单源（拼接构串避免测试字面量自匹配 include_str! 文本）。
        let send_tx2 = ["tx2", ".send(", "SupervisorEvent::KernelReady"].concat();
        let send_tx = ["tx", ".send(", "SupervisorEvent::KernelReady"].concat();
        let sends = src.matches(&send_tx2).count() + src.matches(&send_tx).count();
        assert_eq!(sends, 1, "KernelReady 只允许就绪行线程单点发送（双发=双 navigate/双心跳监测/双诊断探针）: {sends}");
        let ready_seg = src
            .split("if url.is_none() {")
            .nth(1)
            .and_then(|s| s.split("// stdout EOF").next())
            .expect("就绪行线程段");
        let probe_pos = ready_seg.find("Self::http_alive(port)").expect("就绪换页前必须 HTTP 热探");
        let send_pos = ready_seg.find(&send_tx2).expect("就绪换页发送");
        assert!(probe_pos < send_pos, "热探必须先于 KernelReady（防就绪行早于 HTTP bind 的白页竞速）");
        let boot_seg = src
            .split("fn on_boot_success")
            .nth(1)
            .and_then(|s| s.split("fn cancelled").next())
            .expect("on_boot_success 段");
        assert!(!boot_seg.contains("KernelReady"), "on_boot_success 不得再发 KernelReady（单源在就绪行线程）");
        assert!(!boot_seg.contains("probe_loop"), "探活布防不在此处（就绪行线程统一布防，覆盖自动重启路径）");
        // ② Cooldown 不自动重启。
        let exit_seg = src
            .split("fn on_kernel_exit")
            .nth(1)
            .and_then(|s| s.split("/// 单连接三态探活").next())
            .expect("on_kernel_exit 段");
        assert!(
            exit_seg.contains("Verdict::Tripped | Verdict::Cooldown =>"),
            "Cooldown 必须与 Tripped 同路进恢复页（不得落自动重启）"
        );
        assert!(exit_seg.contains("Verdict::Ok =>"), "仅 Ok 判定可自动重启");
        assert!(!exit_seg.contains("_ =>"), "不得有兜底臂吞掉 Cooldown");
        // ③ 探活环守卫。
        let probe_seg = src
            .split("fn probe_loop")
            .nth(1)
            .and_then(|s| s.split("/// 原地重启").next())
            .expect("probe_loop 段");
        assert!(probe_seg.contains("g.probe_gen != probe_gen"), "探活环必须校验令牌（同代际换内核不得双环）");
        assert!(probe_seg.contains("RunState::CrashLoop"), "崩溃环态必须退出探活（防恢复页期间复活内核）");
        assert!(probe_seg.contains("kernel_present"), "内核已不在时不得补刀记崩溃（防连带杀掉自动重启的新内核）");
        // ④ 看门狗代际。
        let wd_seg = src
            .split("fn spawn_boot_watchdog")
            .nth(1)
            .and_then(|s| s.split("/// 看门狗触发判定").next())
            .expect("spawn_boot_watchdog 段");
        assert!(wd_seg.contains("g.generation != gen"), "看门狗必须代际感知（restart 叠犬不得打断新 boot）");
    }

    /// enter_recovery_tx 幂等锚点：冷却期内后续崩溃不得重发 CrashLoop 事件
    /// （事件会再导航恢复页 + 弹系统通知，连环崩溃下发会刷屏）。
    #[test]
    fn enter_recovery_is_idempotent_while_in_crashloop() {
        let src = include_str!("supervisor.rs").replace("\r\n", "\n");
        let seg = src
            .split("fn enter_recovery_tx")
            .nth(1)
            .and_then(|s| s.split("/// 恢复页「重启」").next())
            .expect("enter_recovery_tx 段");
        assert!(seg.contains("already"), "必须判定已在崩溃环态");
        let already_pos = seg.find("if already").expect("already 分支");
        let send_pos = seg.find("tx.send(SupervisorEvent::CrashLoop").expect("CrashLoop 事件发送");
        assert!(already_pos < send_pos, "already 分支必须先于事件发送 return");
    }

    /// 看门狗端到端（短超时注入，生产 300s 参数化）：boot 永挂（卡 Boot 态）
    /// → 超时 → CrashLoop 事件 + last_error 带「看门狗」+ 状态落 CrashLoop
    /// （恢复页路径）；对照组：已 Ready 的 supervisor 超时后零事件。
    #[test]
    fn watchdog_short_timeout_routes_stuck_boot_to_recovery() {
        let Some(root) = repo_root() else { eprintln!("[skip] 仓库检出不含 dsh-desktop"); return; };
        // ① 卡 Boot：不跑瀑布，仅让 supervisor 停在初始态。
        let sv: Arc<Supervisor> = Arc::new(Supervisor::new(&root));
        assert_eq!(sv.state(), RunState::Boot);
        let (tx, rx) = std::sync::mpsc::channel();
        Supervisor::spawn_boot_watchdog(&sv, tx, Duration::from_millis(150));
        match rx.recv_timeout(Duration::from_secs(5)) {
            Ok(SupervisorEvent::CrashLoop { .. }) => {}
            other => panic!("boot 永挂应收到 CrashLoop（恢复页路径），得到 {other:?}"),
        }
        assert!(sv.last_error().as_deref().unwrap_or("").contains("看门狗"), "last_error 应指明看门狗超时: {:?}", sv.last_error());
        assert_eq!(sv.state(), RunState::CrashLoop, "状态应落 CrashLoop（换恢复页的壳侧锚点）");
        // ② 已 Ready：超时不打扰（迟到的正常就绪）。
        let sv2: Arc<Supervisor> = Arc::new(Supervisor::new(&root));
        sv2.set_state_for_test(RunState::Ready);
        let (tx2, rx2) = std::sync::mpsc::channel();
        Supervisor::spawn_boot_watchdog(&sv2, tx2, Duration::from_millis(150));
        assert!(rx2.recv_timeout(Duration::from_secs(1)).is_err(), "Ready 态超时后不得有任何事件");
        assert_eq!(sv2.state(), RunState::Ready);
    }
}

/// panic 载荷转字符串（&str / String / 其他兜底）。
pub(crate) fn panic_payload_str(p: &(dyn std::any::Any + Send)) -> String {
    if let Some(s) = p.downcast_ref::<&str>() {
        (*s).to_string()
    } else if let Some(s) = p.downcast_ref::<String>() {
        s.clone()
    } else {
        "未知 panic 载荷".to_string()
    }
}

#[cfg(test)]
impl Supervisor {
    /// 测试辅助：直接设置状态（绕过迁移表）。
    fn set_state_for_test(&self, s: RunState) {
        self.inner.lock().unwrap_or_else(|p| p.into_inner()).state = s;
    }
}

#[cfg(test)]
mod stability_tests {
    use super::*;

    fn repo_root() -> Option<std::path::PathBuf> {
        let mut dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        for _ in 0..6 {
            if dir.join("dsh-desktop").join("vendor").join("node").exists() {
                return Some(dir);
            }
            if !dir.pop() {
                break;
            }
        }
        None
    }

    fn sandbox(tag: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("dsh-tauri-wf-{}-{}", tag, std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    /// 构造伪仓库根（boot 竞态 E2E 用）：<root>/dsh-desktop/vendor/node/<node> +
    /// <root>/sidecar/cli.js（假分发器）+ <root>/dsh-desktop/node_modules/.../bin.js
    /// （秒退假内核，每次执行向计数文件追加一行）。
    fn fake_repo_root(node_exe: &std::path::Path, counter: &std::path::Path, boot_sleep_ms: u64) -> std::path::PathBuf {
        let root = sandbox(&format!("fake-root-{}", std::process::id()));
        let app_dir = root.join("dsh-desktop");
        std::fs::create_dir_all(app_dir.join("vendor").join("node")).unwrap();
        std::fs::create_dir_all(root.join("sidecar")).unwrap();
        let dsh_dir = app_dir.join("node_modules").join("@deepseek-ai").join("dsh").join("lib");
        std::fs::create_dir_all(&dsh_dir).unwrap();
        // vendor node：同卷硬链接（零拷贝），跨卷回退复制。
        let vendored = app_dir.join("vendor").join("node").join("node.exe");
        if std::fs::hard_link(node_exe, &vendored).is_err() {
            std::fs::copy(node_exe, &vendored).unwrap();
        }
        // 假内核：立即退出（无就绪行）→ 每次拉起都失败 → 瀑布三层全走。
        let counter_js = counter.to_string_lossy().replace('\\', "\\\\").replace('\'', "\\'");
        std::fs::write(
            dsh_dir.join("bin.js"),
            format!("require('node:fs').appendFileSync('{counter_js}', 'spawn\\n'); process.exit(1);"),
        )
        .unwrap();
        // 假 sidecar cli：boot 子命令睡眠（放大竞态窗口：自动重启延迟 2s <
        // 二层 boot 链耗时），其余子命令按协议输出末行 JSON。
        std::fs::write(
            root.join("sidecar").join("cli.js"),
            format!(
                r#""use strict";
const cmd = process.argv[2];
if (cmd === 'boot') {{
  const end = Date.now() + {boot_sleep_ms};
  while (Date.now() < end) {{}}
  process.stdout.write(JSON.stringify({{ ok: true, totalMs: {boot_sleep_ms}, steps: [] }}) + "\n");
  process.exit(0);
}}
if (cmd === 'koffi-preflight') {{ process.stdout.write('{{"ok":true}}' + "\n"); process.exit(0); }}
process.stdout.write('{{"ok":true}}' + "\n");
"#
            ),
        )
        .unwrap();
        root
    }

    /// 双内核竞态 E2E（性能审计 2026-08 根治锚点）：内核启动期退出时，
    /// 崩溃自动重启臂（2s 延迟）与瀑布二层（重跑 boot 链，此处放大到 5s）
    /// 无互斥 → 两条路径各拉一个内核，后者覆盖句柄 → 前者成孤儿
    /// （数百 MB RSS 无人管，直到进程退出才被 Job Object 收割）。
    /// 修复后（boot_active 互斥 + spawn 前回收），瀑布全过程恰好拉起 3 次
    /// （三层各一）。修复前实测 spawn 数 > 3。
    #[test]
    fn boot_race_does_not_spawn_orphan_kernels() {
        let Some(root) = repo_root() else { eprintln!("[skip] 无依赖环境"); return; };
        let _env = crate::ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let home = sandbox("race-home");
        std::env::set_var("DSH_HOME", &home);
        std::env::set_var("DSH_TAURI_USERDATA", home.join("ud"));
        let counter = std::env::temp_dir().join(format!("dsh-fake-kernel-count-{}", std::process::id()));
        let _ = std::fs::remove_file(&counter);
        let node_exe = root.join("dsh-desktop").join("vendor").join("node").join("node.exe");
        let fake_root = fake_repo_root(&node_exe, &counter, 5_000);

        let sv: Arc<Supervisor> = Arc::new(Supervisor::new(&fake_root));
        let (tx, rx) = std::sync::mpsc::channel();
        sv.spawn_boot(tx, None);
        // 瀑布终局：伪 cli 无可回滚快照（guard-lastgood 无 id）→ 两层拉起
        // （首拉 + 修复层）后直接进恢复页。二层 boot 放大 5s > 自动重启臂
        // 延迟 2s——竞态窗口确定敞开（修复前此处会多出自动重启的 spawn）。
        let deadline = Instant::now() + Duration::from_secs(120);
        loop {
            let left = deadline.saturating_duration_since(Instant::now()).max(Duration::from_millis(1));
            match rx.recv_timeout(left) {
                Ok(SupervisorEvent::CrashLoop { .. }) => break,
                Ok(_) => {}
                Err(_) => panic!("120s 内瀑布未到终局（应三层失败进恢复页）"),
            }
        }
        // 先关停（压住迟到的自动重启线程），再数 spawn。
        sv.shutdown();
        std::thread::sleep(Duration::from_secs(3));
        let spawns = std::fs::read_to_string(&counter).unwrap_or_default().lines().filter(|l| !l.trim().is_empty()).count();
        assert_eq!(spawns, 2, "瀑布两层恰好各拉起一次内核（实测 {spawns} 次；>2 = 双内核竞态回归：自动重启臂与瀑布未互斥）");
        std::env::remove_var("DSH_HOME");
        std::env::remove_var("DSH_TAURI_USERDATA");
        let _ = std::fs::remove_file(&counter);
        let _ = std::fs::remove_dir_all(&fake_root);
        let _ = std::fs::remove_dir_all(&home);
    }

    /// 伴随插件入口文件被写坏（用户磁盘坏块/更新中断的真实形态）：
    /// boot 链 sync 重新同步应覆盖修复 → 瀑布首层即应就绪。
    #[test]
    fn broken_companion_file_is_healed_by_sync() {
        let Some(root) = repo_root() else { eprintln!("[skip] 无依赖环境"); return; };
        let _env = crate::ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let home = sandbox("broken");
        std::env::set_var("DSH_HOME", &home);
        std::env::set_var("DSH_TAURI_USERDATA", home.join("ud"));
        // 1) 建档。
        let sv0: Arc<Supervisor> = Arc::new(Supervisor::new(&root));
        let (tx0, rx0) = std::sync::mpsc::channel();
        sv0.run_sidecar_boot(&tx0, 0).expect("基线 boot");
        drop(rx0);
        // 2) 破坏一个伴随插件入口（写语法垃圾）。
        let victim = home.join("profiles").join("web").join("node_modules").join("dsh-auto-compact");
        assert!(victim.exists(), "伴随插件应已同步：{}", victim.display());
        let entry = victim.join("lib").join("index.js");
        if !entry.exists() {
            for cand in ["index.js", "main.js"] {
                if victim.join(cand).exists() {
                    drop(entry);
                    let _ = std::fs::write(victim.join(cand), "this is ( not valid javascript !!!");
                    break;
                }
            }
        } else {
            std::fs::write(&entry, "this is ( not valid javascript !!!").unwrap();
        }
        // 3) 完整守护瀑布：期望依然 KernelReady（sync 修复坏文件）。
        let sv: Arc<Supervisor> = Arc::new(Supervisor::new(&root));
        let (tx, rx) = std::sync::mpsc::channel();
        sv.spawn_boot(tx, None);
        let deadline = Instant::now() + Duration::from_secs(180);
        loop {
            let left = deadline.saturating_duration_since(Instant::now()).max(Duration::from_millis(1));
            match rx.recv_timeout(left) {
                Ok(SupervisorEvent::BootStep { ok, name, .. }) => assert!(ok, "boot 步骤 {name} 失败"),
                Ok(SupervisorEvent::KernelReady { url, .. }) => {
                    assert!(url.starts_with("http://127.0.0.1:"), "{url}");
                    sv.shutdown();
                    std::env::remove_var("DSH_HOME");
                    std::env::remove_var("DSH_TAURI_USERDATA");
                    let _ = std::fs::remove_dir_all(&home);
                    return; // PASS：坏插件被自愈，dsh 照常打开
                }
                Ok(other) => panic!("非预期事件: {other:?}"),
                Err(_) => panic!("180s 内未就绪（坏插件未被自愈）"),
            }
        }
    }

    /// 配置类破坏（patch 非法内容 + 可回滚快照在场）：瀑布应回滚后救回。
    #[test]
    fn corrupted_patch_is_rolled_back_to_lastgood() {
        let Some(root) = repo_root() else { eprintln!("[skip]"); return; };
        let _env = crate::ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let home = sandbox("rollback");
        std::env::set_var("DSH_HOME", &home);
        std::env::set_var("DSH_TAURI_USERDATA", home.join("ud"));
        let sv: Arc<Supervisor> = Arc::new(Supervisor::new(&root));
        // 1) 建档 + 落定 lastgood 快照。
        let (tx0, rx0) = std::sync::mpsc::channel();
        sv.run_sidecar_boot(&tx0, 0).expect("基线 boot");
        drop(rx0);
        let snap = sv.guard_cli_json(&["guard-snapshot", "baseline"])
            .and_then(|v| v.get("id").and_then(|i| i.as_str()).map(String::from))
            .expect("快照");
        let _ = sv.guard_cli_json(&["guard-mark-good", &snap]);
        // 2) 破坏 package.json（bundles 数组换成非法形态——repair 修不了、restore 能回滚）。
        let pkg = home.join("profiles").join("web").join("package.json");
        std::fs::write(&pkg, "{ this is not json !!!").unwrap();
        // 3) 完整瀑布：boot 链 repair 先修 package.json（integration heal 有 manifest 修复），
        //    即便修复失败也有 restore 层兜底——两路最终都应 KernelReady。
        let (tx, rx) = std::sync::mpsc::channel();
        sv.spawn_boot(tx, None);
        let deadline = Instant::now() + Duration::from_secs(240);
        loop {
            let left = deadline.saturating_duration_since(Instant::now()).max(Duration::from_millis(1));
            match rx.recv_timeout(left) {
                Ok(SupervisorEvent::BootStep { name, ok, .. }) => {
                    let _ = (name, ok); // boot 步骤在自愈中可能告警，最终以就绪判
                }
                Ok(SupervisorEvent::KernelReady { url, .. }) => {
                    assert!(url.starts_with("http://127.0.0.1:"));
                    sv.shutdown();
                    std::env::remove_var("DSH_HOME");
                    std::env::remove_var("DSH_TAURI_USERDATA");
                    let _ = std::fs::remove_dir_all(&home);
                    return; // PASS：配置破坏被自愈，dsh 照常打开
                }
                Ok(SupervisorEvent::CrashLoop { .. }) => panic!("瀑布未能救回配置破坏"),
                Ok(other) => { let _ = other; }
                Err(_) => panic!("240s 内未就绪（配置破坏未被自愈）"),
            }
        }
    }
}

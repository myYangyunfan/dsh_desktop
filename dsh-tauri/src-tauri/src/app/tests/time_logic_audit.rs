//! S2 时间敏感逻辑 × 系统睡眠/唤醒 审计——参数化交叉验证。
//!
//! 所有权声明：本文件是 S2（只读审计）自己的测试文件，不修改任何实现文件。
//! 验证方法：把 P0/P1 嫌疑的**判定逻辑**参数化（注入 elapsed：正常值 / 边界值 /
//! 睡眠跳变 3600s），用双时钟模型区分三种时基：
//!   · QPC（Rust `Instant`）：睡眠期间推进 → 唤醒后 elapsed 瞬间跳变；
//!   · 中断时钟（`thread::sleep`/条件变量相对等待）：睡眠期间暂停 → 唤醒后
//!     继续剩余时长；
//!   · 墙钟（`SystemTime`/JS `Date.now()`）：含睡眠，度量真实墙时间。
//! 能 #[path] 只读编入的用真实实现（session_notify：NotifyThrottle /
//! restart_backoff_ms；kernel-process：CrashLoopDetector——app 依赖直连）；
//! 嵌在线程里的判定用纯函数重实现 + include_str! 源码锚点（file_drop.rs 的
//! 「接线形态锚点」同款做法），锚点断言生产源确实含该形态。
//!
//! 全部测试纯函数运行，不真正让 OS 睡眠。

// ---------------------------------------------------------------------------
// 只读编入：session_notify.rs（真实 NotifyThrottle / restart_backoff_ms）
// 与 session_notify_boundary.rs 同款最小垫片（仅满足 crate:: 引用编译）。
// ---------------------------------------------------------------------------
#![allow(dead_code)]

#[path = "../src/session_notify.rs"]
mod session_notify_live;

use std::path::PathBuf;
use std::sync::Mutex;

pub struct SupervisorShim {
    pub node_exe: PathBuf,
    pub app_dir: PathBuf,
}

pub struct AppState {
    pub supervisor: Mutex<Option<std::sync::Arc<SupervisorShim>>>,
    pub current_session: Mutex<Option<String>>,
    pub paths: shell_core::DshPaths,
}

pub mod commands {
    pub trait NoWindow {
        fn creation_flags_no_window(&mut self) -> &mut Self;
    }

    #[cfg(windows)]
    impl NoWindow for std::process::Command {
        fn creation_flags_no_window(&mut self) -> &mut Self {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            self.creation_flags(CREATE_NO_WINDOW);
            self
        }
    }

    #[cfg(not(windows))]
    impl NoWindow for std::process::Command {
        fn creation_flags_no_window(&mut self) -> &mut Self {
            self
        }
    }
}

pub mod supervisor {
    pub fn file_log(_msg: &str) {}
}

// ---------------------------------------------------------------------------
// 源码锚点（include_str，CRLF 归一）
// ---------------------------------------------------------------------------
fn norm(src: &str) -> String {
    src.replace("\r\n", "\n")
}

const WSL_BACKEND_SRC: &str = include_str!("../../../crates/wsl-backend/src/lib.rs");
const SUPERVISOR_SRC: &str = include_str!("../src/supervisor.rs");
const LIB_SRC: &str = include_str!("../src/lib.rs");
const SESSION_NOTIFY_SRC: &str = include_str!("../src/session_notify.rs");

/// 双时钟样本：`(qpc_ms, interrupt_ms, wall_ms)` 三元组序列。
/// 模拟「运行 10s → 睡眠 3600s → 唤醒后继续运行」的时钟读数。
#[derive(Debug, Clone, Copy)]
struct ClockSample {
    qpc_ms: u128,
    interrupt_ms: u128,
    wall_ms: u128,
}

/// 生成事件时刻的时钟读数：awake_ms = 唤醒前已运行时长（QPC/中断/墙钟同值），
/// sleep_ms = 睡眠时长（仅 QPC 与墙钟推进，中断时钟暂停）。
fn clocks_at(awake_ms: u128, sleep_ms: u128) -> ClockSample {
    ClockSample {
        qpc_ms: awake_ms + sleep_ms,
        interrupt_ms: awake_ms,
        wall_ms: awake_ms + sleep_ms,
    }
}

// ===========================================================================
// P1-A：wsl-backend run_with_lines 超时——**已修复（分片预算，中断时钟语义）**
// （crates/wsl-backend/src/lib.rs SliceBudget + run_with_lines）
// ===========================================================================
//
// 修复前形态（S2 审计定案 P1）：`let deadline = Instant::now() + timeout` +
// 逐轮 `Instant::now() >= deadline`（QPC 含睡眠时间）——30min 安装窗内合盖
// 85s，唤醒瞬间 deadline 已「过期」→ kill 健康运行的 wsl 子进程。
// 修复后形态：SliceBudget 分片状态机——每轮 `sleep(POLL_SLICE=50ms)` 后扣减
// 一个分片；系统睡眠期间线程 timer 暂停、分片不推进；唤醒后继续用剩余预算。
// 状态机无任何时钟输入，挂钟/QPC 跳变对其不可见。

/// 纯函数重实现（对照修复后 SliceBudget：slices_consumed 为**中断时钟分片**
/// 计数——睡眠不产生分片）。
fn wsl_loop_timed_out(budget_slices: u128, slices_consumed: u128) -> bool {
    slices_consumed > budget_slices
}

/// 正常路径：90s 预算（1800 分片）内清醒运行 5s（100 分片）→ 不超时。
#[test]
fn wsl_deadline_normal_elapsed_no_kill() {
    assert!(!wsl_loop_timed_out(1_800, 100));
}

/// 边界值：清醒分片恰好耗尽预算后的下一轮 → 超时（真实超时语义保留）。
#[test]
fn wsl_deadline_exact_boundary_times_out() {
    assert!(wsl_loop_timed_out(1_800, 1_801));
}

/// **睡眠跳变（核心回归锚点）**：wsl --install 类长操作（TIMEOUT_INSTALL=
/// 30min = 36000 分片）运行 5s 后系统睡 1h；唤醒时 QPC/墙钟已 +3600s，但
/// 中断时钟分片只消耗了 100——操作远未超时，**不得 kill**（修复前 QPC
/// deadline 形态在此误杀，S2 P1 定案）。
#[test]
fn wsl_deadline_sleep_jump_no_longer_kills_healthy_operation() {
    let woke = clocks_at(5_000, 3_600_000);
    // 中断时钟视角（分片预算的世界）只消耗 5s = 100 分片。
    let consumed_slices = woke.interrupt_ms / 50;
    assert!(!wsl_loop_timed_out(36_000, consumed_slices), "30min 安装预算内睡 1h：唤醒后预算只耗 100 分片，不得误杀");
    // 量化旧缺陷触发条件在修复后失效：90-5=85s 的睡眠（旧形态最小误杀睡眠）
    // 在分片语义下消耗 0 个分片。
    let short_sleep = clocks_at(5_000, 85_000);
    assert_eq!(short_sleep.interrupt_ms, 5_000, "中断时钟不含睡眠时长");
    assert!(!wsl_loop_timed_out(1_800, short_sleep.interrupt_ms / 50), "85s 合盖不再触发超时");
    // 对照：真实清醒分片累计耗尽（1801 轮 50ms）才超时——检测强度不弱化。
    assert!(wsl_loop_timed_out(1_800, 1_801));
}

/// 形态锚点：生产 wsl-backend 超时循环必须是分片预算形态——SliceBudget
/// 状态机 + 相对 sleep 节拍，且 run_with_lines 内**不得**再出现 QPC
/// deadline（防回退）。
#[test]
fn wsl_deadline_shape_anchor() {
    let src = norm(WSL_BACKEND_SRC);
    // 锚定生产实现段（impl 块；trait 声明里也有同名签名，跳过声明）。
    let seg = src
        .split("impl WslInvoker for RealWslInvoker")
        .nth(1)
        .and_then(|s| s.split("fn list_distros").next())
        .expect("RealWslInvoker::run_with_lines 段");
    assert!(
        seg.contains("SliceBudget::new(timeout)"),
        "超时必须走分片预算状态机（中断时钟语义）"
    );
    assert!(
        seg.contains("std::thread::sleep(POLL_SLICE)"),
        "轮询节拍必须是相对 sleep（睡眠期间暂停，分片不推进）"
    );
    assert!(
        !seg.contains("Instant::now() + timeout"),
        "不得回退 QPC deadline（S2 P1-A 睡眠唤醒误杀形态）"
    );
    assert!(
        src.contains("TIMEOUT_INSTALL: Duration = Duration::from_secs(30 * 60)"),
        "30 分钟安装预算存在：合盖睡眠极常见于该窗口内"
    );
}

// ===========================================================================
// P2（核实为安全）：supervisor boot 看门狗 300s——thread::sleep 中断时钟
// （supervisor.rs:28,205-221）
// ===========================================================================

/// 看门狗睡眠语义模型：`std::thread::sleep(BOOT_WATCHDOG_TIMEOUT)` 走中断
/// 时钟，系统睡眠期间暂停、唤醒后继续剩余——睡眠不会提前点燃看门狗。
/// interrupted_total: 循环里累计「已睡掉的中断时长」。
fn watchdog_fires_after(awake_interrupt_ms: u128) -> bool {
    awake_interrupt_ms >= 300_000
}

#[test]
fn supervisor_watchdog_survives_sleep_by_interrupt_time() {
    // boot 进行 60s → 睡 1h → 唤醒：看门狗中断时钟只累计 60s，不点燃；
    // boot 线程同样被冻结，唤醒后双方继续——语义一致。
    let woke = clocks_at(60_000, 3_600_000);
    assert!(!watchdog_fires_after(woke.interrupt_ms), "睡眠后中断时钟仅 60s");
    // 只有清醒累计满 300s 才点燃（真实超时）。
    assert!(watchdog_fires_after(300_000));
    // 形态锚点：看门狗用 thread::sleep(timeout)（相对等待），不是 Instant 比对。
    let src = norm(SUPERVISOR_SRC);
    assert!(src.contains("std::thread::sleep(timeout);"), "看门狗必须是相对 sleep");
    assert!(
        src.contains("BOOT_WATCHDOG_TIMEOUT: Duration = Duration::from_secs(300)"),
        "300s 常量锚点"
    );
}

// ===========================================================================
// P2（核实为安全）：假死探活 20×3s——计数器驱动而非 deadline 驱动
// （supervisor.rs:773-847）
// ===========================================================================

/// 探活计数语义重实现：`consecutive`/`zombie` 计数器只在**真实失败探测**时
/// 递增，成功即清零；`thread::sleep(3s)` 走中断时钟。睡眠跳变本身不产生任何
/// 失败计数——唤醒后需连续 20 次真实 HTTP 无响应（≥60s 清醒）才判死。
#[test]
fn zombie_probe_is_counter_driven_not_clock_driven() {
    let mut zombie = 0u32;
    // 场景：唤醒后内核 Node 刚恢复、事件循环积压——第 1 探失败、第 2 探成功。
    let probe_outcomes = [false, true];
    for ok in probe_outcomes {
        if ok {
            zombie = 0; // supervisor.rs:809-812 成功即双清零
        } else {
            zombie += 1;
        }
    }
    assert_eq!(zombie, 0, "单次唤醒抖动被下一次成功清零，绝不可能到 20");
    // 最坏链条：即便唤醒后内核连续假死，也需要 20 轮 3s 中断时钟节拍
    //（清醒 60s）才 kill——是真实假死，不是睡眠误杀。
    let mut z = 0u32;
    for _ in 0..19 {
        z += 1;
    }
    assert!(z < 20, "19 次不杀");
    // 形态锚点。
    let src = norm(SUPERVISOR_SRC);
    assert!(src.contains("should_restart_zombie"), "假死重启抽纯函数 should_restart_zombie（#159 回合感知）");
    assert!(src.contains("zombie >= ZOMBIE_THRESHOLD && active_turns == 0"), "20 次阈值 + 无回合才杀锚点");
    assert!(src.contains("std::thread::sleep(Duration::from_secs(3));"), "3s 中断时钟节拍锚点");
    assert!(src.contains("consecutive = 0;"), "成功清零锚点");
}

// ===========================================================================
// P2（核实为安全）：崩溃环 60s 窗——墙钟注入，睡眠不串联崩溃
// （kernel-process/src/crash_loop.rs；supervisor.rs:941-943 now_ms 为 SystemTime）
// ===========================================================================

/// 真实 CrashLoopDetector（app 依赖直连）：睡眠用墙钟大跳变表达——
/// 崩溃 A @0s、崩溃 B @1s，随后合盖 1h，唤醒即崩（@3601s）：窗口 retain
/// 清掉旧戳 → 不成环 → 走自动重启而非恢复页。睡眠把崩溃「隔开」是安全方向。
#[test]
fn crash_loop_wall_clock_window_sleep_safe() {
    let mut d = kernel_process::crash_loop::CrashLoopDetector::new();
    assert_eq!(d.record_crash(0), kernel_process::crash_loop::Verdict::Ok);
    assert_eq!(d.record_crash(1_000), kernel_process::crash_loop::Verdict::Ok);
    // 睡眠 1h 后的崩溃：墙钟 3_601_000ms。
    assert_eq!(
        d.record_crash(3_601_000),
        kernel_process::crash_loop::Verdict::Ok,
        "睡眠隔开的崩溃不进同一窗口 → 不误判崩溃环 → 不进恢复页"
    );
    // 对照：无睡眠窗口内连崩 6 次才 Tripped（语义仍在）。
    let mut d2 = kernel_process::crash_loop::CrashLoopDetector::new();
    for i in 0..5u64 {
        assert_eq!(d2.record_crash(i * 1_000), kernel_process::crash_loop::Verdict::Ok);
    }
    assert_eq!(
        d2.record_crash(5_000),
        kernel_process::crash_loop::Verdict::Tripped,
        "清醒连崩仍正常成环（安全方向不弱化真实检测）"
    );
    // 形态锚点：supervisor 喂的是 SystemTime 墙钟（含睡眠）。
    let src = norm(SUPERVISOR_SRC);
    assert!(
        src.contains("SystemTime::now().duration_since(UNIX_EPOCH)"),
        "now_ms() 必须是墙钟——若换成 Instant（QPC）本结论反转成 P1"
    );
}

// ===========================================================================
// P2（核实为安全）：session_notify 限流 30s/15s（墙钟）与 JUMP 60s 新鲜度
// 真实实现（#[path] 编入）
// ===========================================================================

/// 限流器墙钟注入：通知 @t0 → 睡 1h → 同会话再完成：窗口早已过 → 放行。
/// 睡眠方向是「重新开门」而非误拦——不丢通知、也不产生风暴（每事件至多一条）。
#[test]
fn notify_throttle_reopens_after_sleep_jump() {
    use session_notify_live::{NotifyThrottle, GLOBAL_THROTTLE_MS, SESSION_THROTTLE_MS};
    let mut t = NotifyThrottle::new();
    assert!(t.decide("s", 1_000), "睡前首条放行");
    let woke = 1_000 + 3_600_000;
    assert!(
        t.decide("s", woke),
        "睡眠 1h 后同会话完成应放行（墙钟差 3600s ≫ 30s 窗）"
    );
    // 唤醒后短窗口内仍正常限流（无风暴）：15s 全局窗照常拦截第二会话。
    assert!(!t.decide("other", woke + 1_000), "全局 15s 窗照常生效");
    assert_eq!((SESSION_THROTTLE_MS, GLOBAL_THROTTLE_MS), (30_000, 15_000));
}

/// PENDING_JUMP 新鲜度 60s（墙钟）：睡前发出的通知，睡 1h 后用户回焦——
/// 跳转作废（用户并非针对该通知回前台）。正确方向。
#[test]
fn jump_freshness_expires_across_sleep() {
    use session_notify_live::JUMP_FRESHNESS_MS;
    let at: u128 = 1_000;
    let focus_at: u128 = at + 3_600_000;
    let stale = focus_at.saturating_sub(at) > JUMP_FRESHNESS_MS; // session_notify.rs:617 同式
    assert!(stale, "睡眠跨越新鲜度窗 → 补发跳转必须作废");
    // 对照：窗内（30s）仍可跳。
    let fresh_focus = at + 30_000;
    assert!(fresh_focus.saturating_sub(at) <= JUMP_FRESHNESS_MS);
}

/// watcher 崩溃退避（真实 restart_backoff_ms）：唤醒引发的退出走
/// `spawned_at.elapsed() >= 60s`（QPC）判定健康周期——睡眠使 elapsed 跳大，
/// 退避归零 → 立即 1s 重启一次；但**连续失败仍按指数抬升**，不构成风暴。
#[test]
fn watcher_backoff_after_wake_single_immediate_retry_not_storm() {
    use session_notify_live::restart_backoff_ms;
    // 睡眠跳变使任何已活 >60s（QPC）的 watcher 退出都按「健康周期」计：
    let woke = clocks_at(30_000, 3_600_000);
    let healthy = woke.qpc_ms >= 60_000; // session_notify.rs:461 同式
    assert!(healthy, "QPC 含睡眠 → 30s 活跃 + 1h 睡眠 = 判健康周期 → 退避归零");
    assert_eq!(restart_backoff_ms(1), 1_000, "归零后首次重启 1s");
    // 若唤醒后 watcher 反复立刻退（真故障），退避指数抬升封顶 60s：
    assert_eq!(restart_backoff_ms(2), 2_000);
    assert_eq!(restart_backoff_ms(3), 4_000);
    assert_eq!(restart_backoff_ms(7), 60_000, "封顶 60s——最多 1 次/分钟，非风暴");
}

/// sleep_unless_retired 退避睡眠（QPC deadline 逐轮重估）：睡眠使退避窗口
/// 「提前走完」——方向是更快重试（唤醒即恢复），无副作用。
#[test]
fn sleep_unless_retired_shortens_but_honors_retirement() {
    // 重实现循环骨架（session_notify.rs:517-526）+ 注入 QPC 样本。
    fn backoff_exit_ms(start_qpc: u128, qpc_samples: &[u128], total_ms: u128) -> u128 {
        let deadline = start_qpc + total_ms;
        let mut slept = 0u128;
        for &now in qpc_samples {
            if now >= deadline {
                break;
            }
            slept += 500.min(deadline - now); // 分片 500ms（min 语义同源码）
        }
        slept
    }
    let start = 0u128;
    // 正常：60s 退避完整分片走完（样本 500ms 步进，截断显示总睡眠推进）。
    let mut normal = vec![];
    let mut t = 0u128;
    while t < 60_000 {
        normal.push(t);
        t += 500;
    }
    assert_eq!(backoff_exit_ms(start, &normal, 60_000), 60_000, "正常路径按 500ms 分片睡满（累计清醒 60s）");
    // 睡眠跳变：第 10s 处合盖 1h → 唤醒样本直接越过 deadline → 循环立即退出。
    let jump = vec![0u128, 500, 1_000, 10_000 + 3_600_000];
    assert_eq!(backoff_exit_ms(start, &jump, 60_000), 1_500, "跳变后即刻退出（分片累计仅 1.5s）——更快重试，无害");
    // 形态锚点。
    let src = norm(SESSION_NOTIFY_SRC);
    assert!(
        src.contains("let deadline = std::time::Instant::now() + std::time::Duration::from_millis(total_ms);"),
        "sleep_unless_retired QPC deadline 锚点"
    );
}

// ===========================================================================
// P2（核实为安全）：渲染层心跳监测——宽限 deadline 被跳变截断是良性
// （src/app/src/lib.rs:905-956）
// ===========================================================================

/// 宽限期 60s（QPC deadline 逐轮重估，lib.rs:914-915）：睡眠使其提前结束，
/// 但监测循环的失联判定是「4 × 10s 中断时钟节拍内计数无变化」——跳变本身
/// 不产出 stall 计数；可见窗口 + 40s 清醒无心跳才 reload（自愈动作，非杀内核）。
#[test]
fn heartbeat_grace_cut_short_by_sleep_is_benign() {
    // 宽限提前退出：唤醒样本越过 deadline。
    let deadline = 60_000u128;
    let woke = clocks_at(5_000, 3_600_000);
    assert!(woke.qpc_ms >= deadline, "跳变使宽限立即结束（提前进入监测）");
    // 但 stall 计数需要 4 个真实 10s 节拍（中断时钟），跳变不给计数。
    let mut stall = 0u32;
    let hb_progress = [false, true, true, true]; // 唤醒后心跳恢复推进
    for progressed in hb_progress {
        stall = if progressed { 0 } else { stall + 1 };
    }
    assert_eq!(stall, 0, "心跳恢复 → 不 reload");
    // 形态锚点。
    let src = norm(LIB_SRC);
    assert!(src.contains("let deadline = std::time::Instant::now() + std::time::Duration::from_secs(60);"));
    assert!(src.contains("if stall >= 4 {"), "4×10s 失联阈值锚点");
    assert!(src.contains("location.reload()"), "动作是页面 reload（自愈级），非杀内核");
}

// ===========================================================================
// 登记表锚点：JS 侧（bridge-shim 心跳/轮询 = setInterval 中断时钟）
// ——供报告交叉引用的固化锚点。
// ===========================================================================

#[test]
fn js_side_timer_anchors() {
    let shim = norm(include_str!("../../../crates/bridge/dist/bridge-shim.js"));
    // 垫片心跳 5s setInterval：睡眠暂停、唤醒续跑——与 Rust 侧 10s 节拍监测
    // 同为中断时钟，无双时钟错配；垫片内无 Date.now（grep 证实）。
    // F3：心跳载荷携带页面自报 document.hidden（遮挡/锁屏节流豁免链）。
    assert!(shim.contains("setInterval(heartbeat, 5000);"));
    assert!(shim.contains("renderer_heartbeat', { hidden"));
    assert!(!shim.contains("Date.now"), "垫片不得使用 Date.now（避免与 setInterval 时基错配）");
    // dsh-file-drop 的 1.5s Date.now 去重窗锚点已随插件退役（2026-10）一并下线：
    // 壳侧 drag_drop 事件面与垫片转发都已移除，无消费方时钟可审。
}

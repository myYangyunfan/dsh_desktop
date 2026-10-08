//! TA10 全壳时间窗参数化边界矩阵（注入时钟，非 sleep 真等）。
//!
//! 所有权声明：本文件是 TA10 自己的测试文件（ta10- 前缀），不修改任何业务文件。
//!
//! 手法：
//! · 能只读编入的真实实现（session_notify：NotifyThrottle / restart_backoff_ms /
//!   JUMP_FRESHNESS_MS）用 `#[path]` 编入直喂合成时间轴（u128 毫秒）；
//! · kernel-process 的 CrashLoopDetector 是 app 直连依赖，record_crash 本就
//!   接受注入的 now_ms —— 二维表（间隔 × 次数）直接打；
//! · 嵌在闭包 / 线程里的判定（90s 导航抑制 / updater TTL /
//!   下载进度节流 / watcher 健康线）用纯函数重实现 + include_str! 源码锚点
//!   （time_logic_audit.rs 同款做法），锚点断言生产源确实含该常量与判定式。
//!   （原「balance 节流」一档随 Electron 余额遗留线退役整体移除，
//!   见 contracts/ipc-commands.md §2.4。）
//! 全部测试纯函数运行，无任何真实 sleep / 真等。

// ---------------------------------------------------------------------------
// 只读编入：session_notify.rs（真实 NotifyThrottle / restart_backoff_ms）
// 与 time_logic_audit.rs 同款最小垫片（仅满足 crate:: 引用编译）。
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
    use super::*;

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

const LIB_SRC: &str = include_str!("../src/lib.rs");
const SESSION_NOTIFY_SRC: &str = include_str!("../src/session_notify.rs");
const UPDATER_SRC: &str = include_str!("../src/commands/updater_client.rs");
const MENU_SRC: &str = include_str!("../src/commands/menu.rs");

// ===========================================================================
// 1) NotifyThrottle：30s 会话窗 29999/30000/30001 + 15s 全局窗 14999/15000/15001
//    + JUMP 新鲜度 59999/60000/60001（真实实现，注入合成时轴）
// ===========================================================================

/// 会话窗三边界（真实 NotifyThrottle：`now - last < 30000` 拦截）。
#[test]
fn ta10_notify_session_window_boundaries() {
    use session_notify_live::{NotifyThrottle, SESSION_THROTTLE_MS};
    assert_eq!(SESSION_THROTTLE_MS, 30_000, "30s 窗常量锚点");
    let mut t = NotifyThrottle::new();
    assert!(t.decide("s", 1_000), "首条放行");
    assert!(!t.decide("s", 1_000 + 29_999), "29999ms：窗内拦截（<30000）");
    // 恰 30000：不 < 30000 → 放行（同时落笔新时间戳）。
    assert!(t.decide("s", 1_000 + 30_000), "恰 30000ms：放行且时间戳前进");
    // 30001 相对新时间戳（31_001）：窗内再拦（验证时间戳确实前进到 31_000）。
    assert!(t.decide("s", 31_000 + 30_001), "30001ms（相对新戳 31_000）：差 30_001 ≥ 30s → 放行");
    assert!(!t.decide("s", 31_000 + 29_999), "29999ms（相对新戳）：窗内拦截——新戳已前进的交叉验证");
}

/// 全局窗三边界 + 拦截不消耗会话额度（Electron：return 在两个 set 之前）。
#[test]
fn ta10_notify_global_window_boundaries() {
    use session_notify_live::{GLOBAL_THROTTLE_MS, NotifyThrottle};
    assert_eq!(GLOBAL_THROTTLE_MS, 15_000, "15s 窗常量锚点");
    let mut t = NotifyThrottle::new();
    assert!(t.decide("a", 0));
    assert!(!t.decide("b", 14_999), "跨会话 14999ms：全局窗拦截");
    assert!(t.decide("b", 15_000), "跨会话恰 15000ms：放行");
    // 15001 边界：放行后新会话 c 在 +1ms 处仍被拦（全局窗以最近一次落笔计）。
    assert!(!t.decide("c", 15_001), "15001ms：相对 b@15000 差 1ms < 15s → 拦截");
    assert!(t.decide("c", 15_000 + 15_001), "相对 b@15000 差 15001ms → 放行");
    // 被全局窗拦截不写该会话时间戳：b 的首条额度未消耗。
    let mut t2 = NotifyThrottle::new();
    assert!(t2.decide("a", 0));
    assert!(!t2.decide("b", 5_000), "b 被全局窗拦截");
    assert!(t2.decide("b", 15_000), "全局窗一过 b 首条立即放行（额度未被消耗）");
}

/// JUMP_FRESHNESS_MS 60s 新鲜度三边界（session_notify.rs:617 `> JUMP_FRESHNESS_MS`
/// 同式重放：stale = focus_at - at > 60_000）。
#[test]
fn ta10_jump_freshness_boundaries() {
    use session_notify_live::JUMP_FRESHNESS_MS;
    assert_eq!(JUMP_FRESHNESS_MS, 60_000, "60s 新鲜度窗常量锚点");
    let at: u128 = 1_000;
    let stale = |focus_at: u128| focus_at.saturating_sub(at) > JUMP_FRESHNESS_MS;
    assert!(!stale(at + 59_999), "59999ms：窗内 → 补发跳转");
    assert!(!stale(at + 60_000), "恰 60000ms：`>` 严格 → 仍新鲜，补发");
    assert!(stale(at + 60_001), "60001ms：陈旧 → 作废跳转");
    let src = norm(SESSION_NOTIFY_SRC);
    assert!(
        src.contains("now_ms().saturating_sub(at) > JUMP_FRESHNESS_MS"),
        "新鲜度判定式锚点（> 严格不等号）"
    );
}

// ===========================================================================
// 2) watcher 退避梯（1s/2s/…/60s 封顶）+ 健康线 59.9s/60s/60.1s
// ===========================================================================

/// 退避梯全序列（真实 restart_backoff_ms）：1,2,4,8,16,32,60,60…（64s 封顶到 60s）。
#[test]
fn ta10_watcher_backoff_ladder() {
    use session_notify_live::restart_backoff_ms;
    let ladder: [u64; 9] = std::array::from_fn(|i| restart_backoff_ms((i + 1) as u32));
    assert_eq!(
        ladder,
        [1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000, 60_000],
        "梯：1s→2s→…→32s→(64s 封顶)60s→恒 60s"
    );
    assert_eq!(restart_backoff_ms(u32::MAX), 60_000, "u32 极端值仍封顶");
    let src = norm(SESSION_NOTIFY_SRC);
    assert!(
        src.contains("const BACKOFF_CAP_MS: u64 = 60_000;"),
        "60s 封顶常量锚点"
    );
}

/// 健康线三边界（session_notify.rs:461 `spawned_at.elapsed() >= WATCHER_HEALTHY_ALIVE`
/// 同式重放）：59.9s 崩溃 → 不算健康周期（退避继续累计）；恰 60s / 60.1s →
/// 健康周期（退避归零）。
#[test]
fn ta10_watcher_health_line_boundaries() {
    // 生产式重放：alive_ms = watcher 子进程本次存活时长（注入）。
    fn healthy_reset(alive_ms: u128) -> bool {
        alive_ms >= 60_000 // WATCHER_HEALTHY_ALIVE = Duration::from_secs(60)
    }
    assert!(!healthy_reset(59_900), "59.9s 退出：不归零退避（防立刻退形态刷 1s 风暴）");
    assert!(healthy_reset(60_000), "恰 60s 退出：健康周期 → 归零");
    assert!(healthy_reset(60_100), "60.1s 退出：健康周期 → 归零");
    let src = norm(SESSION_NOTIFY_SRC);
    assert!(
        src.contains("WATCHER_HEALTHY_ALIVE: std::time::Duration = std::time::Duration::from_secs(60)"),
        "健康线 60s 常量锚点"
    );
    assert!(
        src.contains("if spawned_at.elapsed() >= WATCHER_HEALTHY_ALIVE {"),
        "健康线 `>=` 判定式锚点（恰 60s 算健康）"
    );
}

// ===========================================================================
// 3) crash_loop：60s 窗 × 5 次 × 自动重启 5 次 —— 二维表（真实
//    CrashLoopDetector，record_crash 注入 now_ms）
// ===========================================================================

use kernel_process::crash_loop::{CrashLoopDetector, Verdict};

/// 二维表：行 = 崩溃间隔（覆盖窗边界 59999/60000/60001），列 = 崩溃次数
///（1..=7）。窗口判据（快环）：60s 窗内 stamps > 5 → Tripped；计数判据
///（C2a 慢环）：同 boot 世代 Ok 自动重启累计 ≥5 后的第 6 次崩溃 → Tripped。
/// 结论不变量：**无论间隔**（含 > 窗的慢环），第 6 次崩溃必 Tripped；
/// 第 5 次及以前永不 Tripped。
#[test]
fn ta10_crash_loop_two_dim_table() {
    for &spacing in &[1_000u64, 10_000, 30_000, 59_999, 60_000, 60_001, 120_000] {
        let mut d = CrashLoopDetector::new(); // 60s 窗 / 5 次 / 冷却 5min
        let mut verdicts = vec![];
        for i in 0..7u64 {
            verdicts.push(d.record_crash(i * spacing));
        }
        // 前 5 次永不 Tripped（快环需第 6 次才超 5；慢环计数也才到 5）。
        for (i, v) in verdicts.iter().take(5).enumerate() {
            assert_eq!(*v, Verdict::Ok, "spacing={spacing} 第 {} 次应为 Ok", i + 1);
        }
        // 第 6 次必 Tripped：快环（窗内 6 戳 > 5）或慢环（auto_restarts ≥5）。
        assert_eq!(verdicts[5], Verdict::Tripped, "spacing={spacing} 第 6 次必熔断");
        // 第 7 次冷却期内：Cooldown。
        assert_eq!(verdicts[6], Verdict::Cooldown, "spacing={spacing} 熔断后 5min 冷却");
    }
}

/// 窗边界微观：stamps retain 是 `<= window`（闭区间）——间隔恰 60s 的两次
/// 崩溃仍在同一窗内；59.9s 同理；60.1s 则被清出。
#[test]
fn ta10_crash_loop_window_edge_retention() {
    // 间隔 59_999：6 次全在窗内 → 第 6 次 Tripped（快环）。
    let mut d = CrashLoopDetector::with_params(
        std::time::Duration::from_millis(60_000),
        5,
        std::time::Duration::from_secs(300),
    );
    for i in 0..5u64 {
        assert_eq!(d.record_crash(i * 59_999), Verdict::Ok);
    }
    assert_eq!(d.record_crash(5 * 59_999), Verdict::Tripped, "59.999s 间隔：窗内快环成环");

    // 间隔恰 60_000：retain `<= 60_000` → 相邻两戳同窗，但窗内至多 2 戳——
    // 快环永不触发，第 6 次靠 C2a 慢环计数熔断。
    let mut d = CrashLoopDetector::new();
    for i in 0..5u64 {
        assert_eq!(
            d.record_crash(i * 60_000),
            Verdict::Ok,
            "恰 60s 间隔：窗口判据不触发（≤2 戳在窗）"
        );
        assert!(d.auto_restarts() == (i + 1) as usize, "慢环计数随 Ok 递增");
    }
    assert_eq!(d.record_crash(5 * 60_000), Verdict::Tripped, "第 6 次经 C2a 慢环熔断");

    // 间隔 60_001：每戳独自在窗 → 纯慢环路径，同样第 6 次熔断。
    let mut d = CrashLoopDetector::new();
    for i in 0..5u64 {
        assert_eq!(d.record_crash(i * 60_001), Verdict::Ok);
    }
    assert_eq!(d.record_crash(5 * 60_001), Verdict::Tripped, "60.001s 间隔：慢环计数熔断");

    // 手动重启（restart_service）= 新 boot 世代：慢环计数复位，历史 stamps 保留。
    let mut d = CrashLoopDetector::new();
    for i in 0..5u64 {
        assert_eq!(d.record_crash(i * 60_001), Verdict::Ok);
    }
    d.record_graceful_restart();
    assert_eq!(d.auto_restarts(), 0, "手动重启复位慢环计数");
    assert_eq!(d.record_crash(5 * 60_001), Verdict::Ok, "复位后第 6 次崩溃不再熔断（新世代观察）");
}

/// 冷却边界（300s）：熔断后 299_999ms 内 Cooldown；恰 300_000ms 复位重试。
#[test]
fn ta10_crash_loop_cooldown_boundaries() {
    let mut d = CrashLoopDetector::with_params(
        std::time::Duration::from_secs(60),
        1, // 2 次即熔断，缩短路径
        std::time::Duration::from_millis(300_000),
    );
    assert_eq!(d.record_crash(0), Verdict::Ok);
    let tripped_at = 1_000;
    assert_eq!(d.record_crash(tripped_at), Verdict::Tripped);
    assert_eq!(d.record_crash(tripped_at + 299_999), Verdict::Cooldown, "冷却内维持 Tripped");
    assert_eq!(
        d.record_crash(tripped_at + 300_000),
        Verdict::Ok,
        "恰 300s：冷却结束（`< cooldown` 不含），复位并重新观察"
    );
}

// ===========================================================================
// 4) suppressible：89.9s / 90s / 90.1s × URL 同/异（lib.rs 纯函数重放 + 锚点）
// ===========================================================================

#[test]
fn ta10_kernel_nav_suppression_matrix() {
    // lib.rs:453-460 重放（`< 90_000` 严格）。
    fn should_suppress(since_ms: u64) -> bool {
        since_ms < 90_000
    }
    fn suppressible(since_ms: u64, url_changed: bool) -> bool {
        should_suppress(since_ms) && !url_changed
    }
    // 二维表：时刻 × URL。
    for &(since, changed, expect) in &[
        (89_900u64, false, true),  // 窗内 + URL 同 → 抑制
        (89_900, true, false),     // 窗内 + URL 变 → 放行整页换页
        (90_000, false, false),    // 恰 90s → 放行
        (90_000, true, false),
        (90_100, false, false),    // 窗外 → 放行
        (90_100, true, false),
        (0, false, true),          // 重启风暴连发 → 抑制
        (0, true, false),
    ] {
        assert_eq!(
            suppressible(since, changed),
            expect,
            "since={since}ms url_changed={changed}"
        );
    }
    let src = norm(LIB_SRC);
    assert!(
        src.contains("KERNEL_NAV_SUPPRESS_WINDOW_MS: u64 = 90_000;"),
        "90s 抑制窗常量锚点"
    );
    assert!(
        src.contains("fn suppressible(since_last_nav_ms: u64, url_changed: bool) -> bool {\n    should_suppress_kernel_nav(since_last_nav_ms) && !url_changed\n}"),
        "窗口+URL 联合判定式锚点"
    );
    assert!(
        src.contains("fn should_suppress_kernel_nav(since_last_nav_ms: u64) -> bool {\n    since_last_nav_ms < KERNEL_NAV_SUPPRESS_WINDOW_MS\n}"),
        "`< 90_000` 严格判定锚点（恰 90s 放行）"
    );
}

// ===========================================================================
// 5) updater TTL：23h59m / 24h / 24h1m（`age > TTL` 严格）+ mtime 可控实证
// ===========================================================================

#[test]
fn ta10_updater_ttl_boundaries() {
    // updater_client.rs:305 `age > TTL`（TTL=24h）重放。
    const TTL_MS: u128 = 24 * 3600 * 1000;
    fn expired(age_ms: u128) -> bool {
        age_ms > TTL_MS
    }
    assert!(!expired(23 * 3600 * 1000 + 59 * 60 * 1000), "23h59m：保留");
    assert!(!expired(24 * 3600 * 1000), "恰 24h：`>` 严格 → 保留");
    assert!(expired(24 * 3600 * 1000 + 60 * 1000), "24h01m：清扫");
    assert!(!expired(0), "刚创建：保留");
    assert!(expired(u128::MAX), "极端陈旧：清扫");
    let src = norm(UPDATER_SRC);
    assert!(
        src.contains("const TTL: std::time::Duration = std::time::Duration::from_secs(24 * 3600);"),
        "24h TTL 常量锚点"
    );
    assert!(
        src.contains(".is_some_and(|age| age > TTL);"),
        "`age > TTL` 严格判定锚点（恰 24h 不清）"
    );
}

/// mtime 可控形态实证：真实创建 `dsh-update-*` 临时目录并回写 mtime
///（File::set_modified），用生产同源式（metadata.modified → 与 now 差 >
/// TTL）判过期——证明「创建后改 mtime」确能驱动该判定面。
#[test]
fn ta10_updater_ttl_mtime_controllable() {
    const TTL_MS: u128 = 24 * 3600 * 1000;
    fn expired_at(mtime: std::time::SystemTime) -> bool {
        let age = std::time::SystemTime::now()
            .duration_since(mtime)
            .unwrap_or_default()
            .as_millis();
        age > TTL_MS
    }
    let dir = std::env::temp_dir().join(format!("dsh-update-ta10-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("创建临时目录");
    let part = dir.join("part.bin");
    let f = std::fs::File::create(&part).expect("占位文件");
    let past = |hours_ago: u64| {
        std::time::SystemTime::now() - std::time::Duration::from_secs(hours_ago * 3600)
    };
    f.set_modified(past(26)).expect("回写 mtime 26h 前");
    assert!(
        expired_at(std::fs::metadata(&part).and_then(|m| m.modified()).unwrap()),
        "mtime 回写 26h 前 → 判过期（清扫面成立）"
    );
    f.set_modified(past(23)).expect("回写 mtime 23h 前");
    assert!(
        !expired_at(std::fs::metadata(&part).and_then(|m| m.modified()).unwrap()),
        "mtime 回写 23h 前 → 判保留"
    );
    let _ = std::fs::remove_dir_all(&dir);
}

// ===========================================================================
// 6) 下载进度节流：0.9% / 1% / 199ms / 200ms（menu.rs RV9 P1 重放 + 锚点）
// ===========================================================================

#[test]
fn ta10_download_progress_throttle_boundaries() {
    // menu.rs:147-157 重放：fire ⇔ pct_gain >= 1 || 自上次 emit ≥ 200ms。
    fn fire(prev: Option<(u64, u128)>, received: u64, total: u64, now_ms: u128) -> bool {
        match prev {
            None => true,
            Some((prev_recv, prev_at)) => {
                let pct_gain = u64::checked_div(
                    received.saturating_sub(prev_recv).saturating_mul(100),
                    total,
                )
                .unwrap_or(0);
                pct_gain >= 1 || now_ms - prev_at >= 200
            }
        }
    }
    let total: u64 = 100_000;
    let t0: u128 = 1_000_000;
    let prev = Some((0u64, t0)); // 首条已在 t0 emit（received=0）
    // 0.9% < 1% 且 < 200ms → 不发（整数除 0.9%*100/100000 商 0）。
    assert!(!fire(prev, 900, total, t0 + 100), "0.9% @100ms：静默");
    assert!(!fire(prev, 999, total, t0 + 199), "0.999% @199ms：静默（双门皆未过）");
    // 恰 1% → 发（整数除 1000*100/100000 = 1）。
    assert!(fire(prev, 1_000, total, t0 + 1), "恰 1% @1ms：发（进度门）");
    // 恰 200ms（进度未过门）→ 发。
    assert!(fire(prev, 500, total, t0 + 200), "0.5% @恰 200ms：发（时间门，`>=` 含 200）");
    assert!(!fire(prev, 500, total, t0 + 199), "0.5% @199ms：静默");
    // 201ms 同理发；首条无历史必发。
    assert!(fire(prev, 0, total, t0 + 201), "0% @201ms：发（时间门）");
    assert!(fire(None, 0, total, t0), "首条必发");
    // total=0（未知大小）：checked_div None → 0 → 只有时间门。
    assert!(!fire(Some((0, t0)), 5_000, 0, t0 + 100), "total=0：进度门退化，仅时间门");
    assert!(fire(Some((0, t0)), 5_000, 0, t0 + 200), "total=0 @200ms：时间门发");
    let src = norm(MENU_SRC);
    assert!(src.contains("pct_gain >= 1 || now.duration_since(prev_at).as_millis() >= 200"), "`≥1% 或 ≥200ms` 判定式锚点");
    assert!(
        src.contains("let fire = match last_emit {"),
        "节流闭包形态锚点（RV9 P1）"
    );
}

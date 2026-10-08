//! N2 对抗验收：会话完成通知链（C1/C2）边界测试。
//!
//! 所有权声明：本文件是 N2（对抗验收）自己的测试文件，不修改 N1 的任何
//! 实现文件。N1 的 `session_notify` 模块目前是 `mod session_notify;`
//! （私有，lib.rs:16），tests/ 集成测试无法经 `dsh_tauri_app::` 访问其
//! pub 纯函数——因此这里用 `#[path]` 把同一份源文件**只读编入**本测试
//! crate（字节相同 = 测的就是 N1 的实现），并为其中 `crate::` 引用提供
//! 最小垫片。一旦 N1 把模块改 `pub mod`，可无缝切换为
//! `use dsh_tauri_app::session_notify::…`（见缺陷清单 D-私有线）。
//!
//! 覆盖面（对照 Electron 母本 main.js:2639-2677 onSessionTurnEnd）：
//! · 限流交错矩阵（30s/会话 + 15s 全局，恰界值 30000/15000）
//! · 时钟回拨（负增量 → 抑制；恢复到 last+30000 恰好放行）
//! · 被拦截事件不消耗/不延长任何窗口（Electron：return 在两个 set 之前）
//! · should_notify 三门矩阵 + 「is_current 仅聚焦态可达」不变量
//! · 文案兜底 / 跳转 ID 校验 / 重启退避
//! · 接线形态锚点（事件名/载荷 vs bridge-shim、lib.rs 挂点、C2 先序）

// 垫片类型仅满足被编入模块的编译，不构造使用。
#![allow(dead_code)]

// N1 的实现源，只读编入（字节一致，非复制粘贴）。
#[path = "../src/session_notify.rs"]
mod session_notify_live;

// ---------------------------------------------------------------------------
// session_notify.rs 内 `crate::` 引用的最小垫片（仅满足编译，不参与断言）
// ---------------------------------------------------------------------------

use std::path::PathBuf;
use std::sync::Mutex;

pub struct SupervisorShim {
    pub node_exe: PathBuf,
    pub app_dir: PathBuf,
}

/// 与真实 AppState 字段面同构（session_notify 只用到这三个字段）。
pub struct AppState {
    pub supervisor: Mutex<Option<std::sync::Arc<SupervisorShim>>>,
    pub current_session: Mutex<Option<String>>,
    pub paths: shell_core::DshPaths,
}

pub mod commands {
    /// creation_flags_no_window 垫片（真实实现在 commands/common.rs）。
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
    /// 路由层日志垫片：丢弃（测试进程不写 desktop.log）。
    pub fn file_log(_msg: &str) {}
}

// ---------------------------------------------------------------------------
// 限流边界（真实 NotifyThrottle）
// ---------------------------------------------------------------------------

/// 恰界值语义：Electron `< 30000` / `< 15000`——差值恰等于窗口时放行。
#[test]
fn throttle_exact_boundaries() {
    use session_notify_live::{NotifyThrottle, GLOBAL_THROTTLE_MS, SESSION_THROTTLE_MS};
    assert_eq!(SESSION_THROTTLE_MS, 30_000, "会话窗 30s（main.js:2650）");
    assert_eq!(GLOBAL_THROTTLE_MS, 15_000, "全局窗 15s（main.js:2651）");

    let mut t = NotifyThrottle::new();
    assert!(t.decide("s", 0), "首条（Map 缺省 0）放行");
    assert!(!t.decide("s", SESSION_THROTTLE_MS - 1), "29_999 拦");
    assert!(t.decide("s", SESSION_THROTTLE_MS), "恰 30_000 放（不 < 30000）");
    assert!(!t.decide("s", 2 * SESSION_THROTTLE_MS - 1), "第二窗 59_999 拦");
    assert!(t.decide("s", 2 * SESSION_THROTTLE_MS), "恰 60_000 放");

    let mut g = NotifyThrottle::new();
    assert!(g.decide("a", 0));
    assert!(!g.decide("b", GLOBAL_THROTTLE_MS - 1), "跨会话 14_999 仍受全局窗拦");
    assert!(g.decide("b", GLOBAL_THROTTLE_MS), "跨会话恰 15_000 放");
}

/// 时钟回拨：now < last → 负增量按 0 处（saturating_sub）→ 全部抑制，
/// 直到时钟追过 last+30000 才恢复（Electron 负差值同语义）。
#[test]
fn throttle_clock_rollback() {
    use session_notify_live::NotifyThrottle;
    let mut t = NotifyThrottle::new();
    assert!(t.decide("s", 100_000), "基线放行");
    // 回拨到窗口中（now < last）：会话窗差值按 0 → 抑制。
    assert!(!t.decide("s", 50_000), "回拨到 last 之前 → 抑制");
    assert!(!t.decide("s", 99_999), "回拨后差 1ms → 抑制");
    assert!(!t.decide("s", 100_000), "回拨到恰等于 last → 差值 0 < 30000 → 抑制");
    // 恢复：恰好 last+30000 放行。
    assert!(t.decide("s", 130_000), "追平 last+30000 → 放行");
    // 回拨触碰全局窗：另一会话在全局窗内同样被 0 差值锁死。
    let mut g = NotifyThrottle::new();
    assert!(g.decide("a", 200_000));
    assert!(!g.decide("b", 150_000), "回拨进全局窗 → 抑制");
    assert!(g.decide("b", 215_000), "全局窗恢复（恰 15_000）→ 放行");
}

/// 被拦截事件不消耗也不延长任何窗口（Electron：两条 return 都在
/// lastNotifyAt.set / lastGlobalNotifyAt 之前）。
#[test]
fn suppressed_events_consume_no_quota() {
    use session_notify_live::NotifyThrottle;
    // 会话窗拦截不刷新全局窗：a@0 放（global=0）；a@20_000 被会话窗拦
    //（20_000 < 30_000，全局检查前 return）；b@20_000 若 a 的拦截误写了
    // 全局戳（20_000）则差 0ms 拦；正确语义 global 仍为 0 → 20_000 ≥ 15_000 放行。
    let mut t = NotifyThrottle::new();
    assert!(t.decide("a", 0));
    assert!(!t.decide("a", 20_000), "a 会话窗内拦");
    assert!(t.decide("b", 20_000), "b 应放行（a 的拦截不得刷新全局窗）");

    // 全局窗拦截不消耗会话额度：b@5_000 被全局窗拦；b@15_000 立即放行
    // （若误消耗，b 要等到 35_000）。
    let mut t2 = NotifyThrottle::new();
    assert!(t2.decide("a", 0));
    assert!(!t2.decide("b", 5_000), "b 全局窗拦");
    assert!(t2.decide("b", 15_000), "全局窗一过 b 首条立即放（未消耗额度）");

    // 放行后两个戳同时落笔：下一次窗口以新戳为基。
    assert!(!t2.decide("b", 15_000 + 29_999), "b 新会话窗内拦");
    assert!(!t2.decide("c", 15_000 + 14_999), "c 全局窗内拦");
    assert!(t2.decide("b", 45_000), "b 恰新窗 +30_000 放");
}

/// 三会话交错矩阵（全局窗与每会话窗互锁的最小完备序列）。
#[test]
fn throttle_three_session_interleave_matrix() {
    use session_notify_live::NotifyThrottle;
    let mut t = NotifyThrottle::new();
    assert!(t.decide("A", 0), "A@0 放（global=0）");
    assert!(!t.decide("B", 14_999), "B@14_999 全局窗拦");
    assert!(t.decide("B", 15_000), "B@15_000 放（global=15_000）");
    assert!(!t.decide("C", 29_999), "C@29_999 全局窗拦（29_999-15_000=14_999）");
    assert!(t.decide("C", 30_000), "C@30_000 放（恰 15_000；global=30_000）");
    // A@30_000：会话窗 30_000-0=30_000 恰好过（不 < 30000）；但全局
    // 30_000-30_000=0 < 15_000 → 拦（C 刚写 global）。
    assert!(!t.decide("A", 30_000), "A@30_000 会话窗恰好过、被全局窗拦");
    assert!(!t.decide("A", 44_999), "A@44_999 全局窗拦（44_999-30_000=14_999）");
    assert!(t.decide("A", 45_000), "A@45_000 放（会话 45s ≥ 30s 且全局恰 15s）");
}

// ---------------------------------------------------------------------------
// 三门矩阵与纯函数（真实实现）
// ---------------------------------------------------------------------------

/// 全 16 组合矩阵 + 「is_current 仅聚焦态可达」不变量的纯函数侧契约。
#[test]
fn should_notify_full_matrix_and_current_session_invariant() {
    use session_notify_live::should_notify;
    for &enabled in &[true, false] {
        for &focused in &[true, false] {
            for &current in &[true, false] {
                for &throttle in &[true, false] {
                    assert_eq!(
                        should_notify(enabled, focused, current, throttle),
                        enabled && !focused && !current && throttle,
                        "case {enabled}/{focused}/{current}/{throttle}"
                    );
                }
            }
        }
    }
    // Electron 语义核对：current=true 且 focused=false 的组合在真实接线里
    // 不可达（notify_gates：is_current = focused && …），因此该组合下
    // should_notify 返回 false 不构成对 Electron 的漂移——用源锚点固化
    // 「is_current 必须以 focused 为前提」。
    let src = read_norm("src/session_notify.rs");
    assert!(
        src.contains("let is_current = focused && current.as_deref() == Some(session_id);"),
        "is_current 必须限定聚焦态（Electron 已删未聚焦单拦，main.js:2643-2646）"
    );
}

/// 文案兜底（Electron `info.title || 'DSH 任务完成'`：空串也是 falsy）。
#[test]
fn notification_text_falsy_semantics() {
    use session_notify_live::notification_text;
    assert_eq!(
        notification_text(Some("修复登录"), Some("demo · 会话 abcd1234")),
        ("修复登录".to_string(), "demo · 会话 abcd1234".to_string())
    );
    assert_eq!(
        notification_text(Some(""), Some("")),
        ("DSH 任务完成".to_string(), "会话任务已完成".to_string())
    );
    assert_eq!(
        notification_text(None, None),
        ("DSH 任务完成".to_string(), "会话任务已完成".to_string())
    );
}

/// 跳转 ID 校验（Electron onClick + 垫片同款：trim 非空、≤256；字节长度）。
#[test]
fn jump_session_id_boundaries() {
    use session_notify_live::{valid_jump_session_id, MAX_SESSION_ID_LEN};
    assert_eq!(MAX_SESSION_ID_LEN, 256);
    assert!(valid_jump_session_id("abc"));
    assert!(valid_jump_session_id("  abc  "), "首尾空白可 trim");
    assert!(!valid_jump_session_id("   "));
    assert!(!valid_jump_session_id(""));
    let exact = "x".repeat(256);
    assert!(valid_jump_session_id(&exact), "恰 256 放");
    assert!(!valid_jump_session_id(&format!("{}x", exact)), "257 拦");
}

/// 重启退避：1s→2s→…→60s 封顶（纯函数；run_watcher 里 reset 缺陷见报告）。
#[test]
fn restart_backoff_progression() {
    use session_notify_live::restart_backoff_ms;
    let mut prev = 0;
    for n in 1..=64 {
        let ms = restart_backoff_ms(n);
        assert!(ms >= prev && ms <= 60_000, "单调不减且封顶 60s：n={n} ms={ms}");
        prev = ms;
    }
    assert_eq!(restart_backoff_ms(1), 1_000);
    assert_eq!(restart_backoff_ms(7), 60_000);
    assert_eq!(restart_backoff_ms(1_000), 60_000, "恒封顶");
}

// ---------------------------------------------------------------------------
// 接线形态锚点（lib.rs / bridge-shim.js / session-watcher.js）
// ---------------------------------------------------------------------------

fn read_norm(p: &str) -> String {
    let full = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(p);
    std::fs::read_to_string(&full)
        .unwrap_or_else(|_| panic!("读不到 {}", full.display()))
        .replace("\r\n", "\n")
}

/// 跳转事件名/载荷与 bridge-shim 监听逐字一致（垫片消费面）。
#[test]
fn jump_event_contract_matches_shim() {
    let rust = read_norm("src/session_notify.rs");
    assert!(rust.contains("pub const JUMP_EVENT: &str = \"notification-jump\";"));
    let shim = read_norm("../../crates/bridge/dist/bridge-shim.js");
    assert!(
        shim.contains("onEvent('notification-jump', listeners.jump"),
        "垫片监听事件名必须一致"
    );
    // 载荷字段：sessionId（trim + ≤256 → freeze）。
    assert!(shim.contains("typeof p.sessionId === 'string' ? p.sessionId.trim() : ''"));
    assert!(shim.contains("id.length <= 256"));
}

/// lib.rs 接线四挂点：模块声明 / KernelReady 启动 / 主窗聚焦路由 / 退出收割。
#[test]
fn lib_wiring_anchors() {
    let lib = read_norm("src/lib.rs");
    assert!(lib.contains("mod session_notify;"), "模块声明");
    assert!(
        lib.contains("session_notify::start_watcher(app.clone());"),
        "KernelReady 后启动（Electron main.js:6337 同点位）"
    );
    // 聚焦路由限定主窗 + Focused(true)。
    let seg = lib
        .split("on_window_event(|window, event|")
        .nth(1)
        .and_then(|s| s.split("});").next())
        .expect("on_window_event 接线段");
    assert!(seg.contains("\"main\""), "事件源限定主窗 label");
    assert!(seg.contains("Focused(true)"), "只消费获焦事件");
    assert!(seg.contains("session_notify::on_main_window_focused("));
    // 退出收割：ExitRequested 与 Exit 两个分支都要挂（std::process::exit 不跑 Drop）。
    let xreq = lib
        .split("RunEvent::ExitRequested")
        .nth(1)
        .and_then(|s| s.split("RunEvent::Exit").next())
        .unwrap_or("");
    assert!(xreq.contains("session_notify::shutdown_watcher();"), "ExitRequested 收割");
    let exit_seg = lib
        .split("tauri::RunEvent::Exit =>")
        .nth(1)
        .and_then(|s| s.split("_ => {}").next())
        .unwrap_or("");
    assert!(exit_seg.contains("session_notify::shutdown_watcher();"), "Exit 收割");
}

/// 余额触发退役反证（C2 挂点）：handle_turn_end 不得再调 balance 链
/// （contracts/ipc-commands.md §2.4——Electron 余额遗留线整体拆除）；
/// quitting 判定回到函数首行。
#[test]
fn c2_balance_hook_retired_anchor() {
    let src = read_norm("src/session_notify.rs");
    let seg = src
        .split("fn handle_turn_end")
        .nth(1)
        .and_then(|s| s.split("fn notify_gates").next())
        .expect("handle_turn_end 函数体");
    assert!(
        !seg.contains("trigger_fetch") && !seg.contains("balance::"),
        "C2 余额触发已退役，不得复活: {seg}"
    );
    assert!(
        seg.contains("QUITTING.load"),
        "quitting 判定必须仍在 handle_turn_end 内"
    );
}

/// 聚焦门组合：visible && focused，窗口缺失/查询失败按未聚焦（→通知）。
#[test]
fn focus_gate_composition_anchor() {
    let src = read_norm("src/session_notify.rs");
    assert!(
        src.contains("w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false)"),
        "Electron isVisible() && isFocused() 对译（main.js:2647）"
    );
}

/// watcher 子进程安全形态：CREATE_NO_WINDOW + stdin 保活 + CLI 参数。
#[test]
fn watcher_spawn_safety_anchors() {
    let src = read_norm("src/session_notify.rs");
    let seg = src
        .split("fn spawn_watcher_process")
        .nth(1)
        .and_then(|s| s.split("\n}").next())
        .expect("spawn_watcher_process 函数体");
    assert!(seg.contains(".creation_flags_no_window()"), "抑制终端窗");
    assert!(seg.contains(".stdin(Stdio::piped())"), "stdin 保活管道");
    assert!(seg.contains("--sessions-dir"), "CLI 协议参数");

    // JS 侧防孤儿：stdin end/close 自退 + Electron 导出面零变化。
    let js = read_norm("../../../../dsh-desktop/session-watcher.js");
    assert!(js.contains("require.main === module"), "CLI 守卫（require 路径不受影响）");
    assert!(js.contains("process.stdin.resume()"), "stdin 保活");
    assert!(js.contains("process.stdin.on('end', bye)"), "管道断自退");
    assert!(js.contains("module.exports = { SessionWatcher, scanZstdFrames, expandRow }"), "导出面不变");
}

/// JS 发射器 Electron 保真锚点：默认标题 / 聚合后缀 / subagent 抑制 /
/// cwd 非串守卫（issue #88）。
#[test]
fn js_emitter_electron_parity_anchors() {
    let js = read_norm("../../../../dsh-desktop/session-watcher.js");
    assert!(js.contains("let title = 'DSH 任务完成';"));
    assert!(js.contains("（' + count + ' 轮任务完成）"), "多轮聚合后缀");
    assert!(js.contains("if (h.delegationDepth > 0) return;"), "subagent 抑制");
    assert!(js.contains("typeof h.cwd === 'string'"), "cwd 非串守卫（issue #88）");
}

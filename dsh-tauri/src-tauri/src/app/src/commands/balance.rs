//! 余额数据生产链（Tauri）——Electron main.js 余额链的对应物。
//!
//! Electron 形态：main.js `ensureBalanceScheduler` 常驻编排（3 分钟轮询 +
//! 最小化/隐藏暂停 + 恢复补刷 + 首屏稳定 500ms 后首刷），取数与规整在
//! `dsh-desktop/balance.js` / `balance-scheduler.js`。
//! Tauri 形态（分层不变，宿主换位）：
//!   · 编排（何时刷）在 Rust 线程（本文件 `start_balance_loop`）；
//!   · 取数经 sidecar 子命令 `balance-fetch` 单轮执行（复用 payload 的
//!     balance.js + balance-scheduler.js，零逻辑重写）；
//!   · 结果经 `balance-changed` 事件推页面（垫片转 `dsh-balance-changed`
//!     CustomEvent → dsh-balance 插件 dock 消费）。
//!
//! 单一投递契约（contracts/bridge-api.md §3）：数据只走事件通道；
//! `balance_refresh` 命令只触发刷新、不返回数据（Electron ipc
//! `dsh:balance-refresh` 同语义）。

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use bridge::BridgeError;
use tauri::{AppHandle, Emitter, Manager};

use crate::AppState;

use super::common::NoWindow;

/// 后台轮询周期（Electron DEFAULT_POLL_MS = 3 分钟；cfe18cf 由 15min 缩短而来）。
pub const BALANCE_POLL_SECS: u64 = 180;
/// 节拍粒度：5s 一跳（可见性检测 + 恢复补刷的检测延迟上限）。
const BALANCE_TICK_MS: u64 = 5_000;
/// 首刷延迟（Electron A-10：首屏稳定 500ms 后再起非关键链，避开首帧窗口）。
const BALANCE_FIRST_FETCH_DELAY_MS: u64 = 500;

/// 余额链共享状态（最近一次结果缓存 + in-flight 去重 + 非强制路径节流时间戳）。
pub struct BalanceState {
    pub last: Mutex<Option<serde_json::Value>>,
    fetching: AtomicBool,
    /// 最近一次**发起**取数的时刻（N2 P1-C：非强制路径 30s 节流——Electron
    /// maybeRefreshBalance 经 balance-scheduler throttleMs 的同款语义；强制
    /// 路径（balance_refresh 命令/菜单 toggle）不受限）。
    last_attempt: Mutex<Option<std::time::Instant>>,
}

impl BalanceState {
    pub fn new() -> Self {
        Self {
            last: Mutex::new(None),
            fetching: AtomicBool::new(false),
            last_attempt: Mutex::new(None),
        }
    }
}

impl Default for BalanceState {
    fn default() -> Self {
        Self::new()
    }
}

/// 轮询环代数号。KernelReady 每次内核重启（自动重启 / 假死受控重启 /
/// restart_service / 恢复页重试）都会触发、且单次 boot 会发两回——
/// 无代数守卫时轮询线程随重启次数只增不减（心跳监测同款教训，
/// 见 lib.rs watch_renderer_heartbeat 的内存审计）。
static BALANCE_LOOP_GEN: AtomicU64 = AtomicU64::new(0);

/// stdout 末行 JSON 解析（sidecar 协议：stdout 末行 = 单个 JSON，人类日志走
/// stderr）。空 / 纯日志 / 坏 JSON → None。
pub(crate) fn parse_last_line_json(stdout: &str) -> Option<serde_json::Value> {
    let line = stdout.trim_end().lines().last()?;
    serde_json::from_str(line).ok()
}

/// 单轮取数：sidecar `balance-fetch`（阻塞至多 ~30s——node 侧 fetchJson 双
/// 请求各有 15s 总超时兜底，天然有界）。失败返回 None（调用方静默降级，
/// 下轮再试；与 Electron「失败只 log 不打扰用户」同语义）。
fn fetch_once(app: &AppHandle) -> Option<serde_json::Value> {
    let state = app.state::<AppState>();
    let sv = state.supervisor.lock().unwrap_or_else(|p| p.into_inner()).clone()?;
    // 净化构造（env_clear + 白名单）后显式回传代理与用户数据变量：balance.js
    // 的 proxyFor 直接读 HTTPS_PROXY/HTTP_PROXY/NO_PROXY，sidecar resolveHome
    // 读 DSH_TAURI_USERDATA（DSH_HOME 在白名单内已透传）。
    let mut cmd = kernel_process::sanitized_node_command(&sv.node_exe);
    for key in [
        "HTTPS_PROXY",
        "HTTP_PROXY",
        "NO_PROXY",
        "https_proxy",
        "http_proxy",
        "no_proxy",
        "DSH_TAURI_USERDATA",
    ] {
        if let Ok(value) = std::env::var(key) {
            cmd.env(key, value);
        }
    }
    let out = cmd
        .arg(&sv.sidecar_cli)
        .arg("balance-fetch")
        .arg("--app-dir")
        .arg(&sv.app_dir)
        .env("DSH_TAURI_VERSION", env!("CARGO_PKG_VERSION"))
        // GUI 进程起 console 子进程必须抑制终端窗（与 run_sidecar 同口径）。
        .creation_flags_no_window()
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .ok()?;
    parse_last_line_json(&String::from_utf8_lossy(&out.stdout))
}

/// 取数 + 缓存 + 唯一出口推送。in-flight 去重（Electron balance-scheduler
/// 同语义）：并发触发共享同一次 node 子进程，不叠请求。
/// 返回值：本轮是否取到数据（VB4 补齐——Electron scheduleRetry 的失败加速
/// 重试语义：失败后轮询环按 30s→60s→120s→300s 阶梯缩短下一轮间隔，成功即
/// 清零回 3min 常规节拍）。
fn fetch_and_push(app: &AppHandle) -> bool {
    let state = app.state::<AppState>();
    if state.balance.fetching.swap(true, Ordering::AcqRel) {
        return false; // 已有在途取数：直接返回（不释放旗标）——不算失败
    }
    let ok = fetch_once(app).map(|v| {
        *state.balance.last.lock().unwrap_or_else(|p| p.into_inner()) = Some(v.clone());
        let _ = app.emit("balance-changed", v);
        true
    });
    state.balance.fetching.store(false, Ordering::Release);
    ok.unwrap_or(false)
}

/// 失败加速重试阶梯（VB4：Electron scheduleRetry 30s→1m→2m→5m 同语义——
/// 失败后不等满 3min 常规轮询，按连续失败次数取下一轮间隔）。
fn retry_interval(consecutive_failures: u32) -> Duration {
    match consecutive_failures.min(4) {
        0 => Duration::from_secs(BALANCE_POLL_SECS),
        1 => Duration::from_secs(30),
        2 => Duration::from_secs(60),
        3 => Duration::from_secs(120),
        _ => Duration::from_secs(300),
    }
}

/// 触发一次后台刷新（balance_refresh 命令 / 菜单 toggle-balance 用）：
/// 立即返回（命令不阻塞渲染进程），取数在后台线程。
///
/// C2 挂点（Electron main.js:2642 onSessionTurnEnd 首行 maybeRefreshBalance）：
/// 会话回合完成 → `session_notify::handle_turn_end` 首行即调本函数——先于
/// notifyOnTurnEnd 开关/聚焦/限流门，任何 turn-end 都刷余额（in-flight 去重
/// 保证与轮询环并发不叠请求）。
pub fn trigger_fetch(app: &AppHandle) {
    let h = app.clone();
    std::thread::spawn(move || fetch_and_push(&h));
}

/// C2 非强制路径（N2 P1-C）：turn-end 触发的刷新走 30s 节流——Electron
/// maybeRefreshBalance 的 scheduler 语义（30s 内多次 turn-end 只发一次真实
/// 请求；流式多回合不逐回合起 node 子进程）。节流以「上次发起」计（无论成败），
/// 与 in-flight 去重互补；菜单/命令强制路径仍走 [`trigger_fetch`] 不受限。
pub fn trigger_fetch_throttled(app: &AppHandle) {
    const TURN_END_THROTTLE: std::time::Duration = std::time::Duration::from_secs(30);
    {
        let state = app.state::<crate::AppState>();
        let mut last = state.balance.last_attempt.lock().unwrap_or_else(|p| p.into_inner());
        if last.is_some_and(|t| t.elapsed() < TURN_END_THROTTLE) {
            return; // 窗口内：静默跳过（Electron scheduler 同款早退）
        }
        *last = Some(std::time::Instant::now());
    }
    trigger_fetch(app);
}

/// 可见性判定纯函数（主窗缺省按不可见处理——无窗时轮询暂停，防后台空刷）。
fn window_visibility(visible: Option<bool>, minimized: Option<bool>) -> bool {
    visible.unwrap_or(true) && !minimized.unwrap_or(false)
}

/// 主窗是否可见且未最小化（Electron shouldSkipRefresh 注入的同款判定，
/// P1-2+A-7：不以失焦为触发——副屏并排可见时失焦是常态）。
fn main_window_visible(app: &AppHandle) -> bool {
    app.get_webview_window("main")
        .map(|w| window_visibility(w.is_visible().ok(), w.is_minimized().ok()))
        .unwrap_or(false)
}

/// 启动余额轮询环（KernelReady 后调用；幂等重入——新环上岗令旧环自杀）。
///
/// 语义对齐 Electron main.js：
/// · 首刷延迟 500ms（A-10 非关键功能避首帧）；
/// · 3 分钟轮询；
/// · 最小化/隐藏暂停（跳过整轮，不推进节拍）；
/// · 恢复可见 → 先回放缓存（Electron win.show 推 balanceCache）再强制补刷
///   （restore → force，穿透暂停门）。
pub fn start_balance_loop(app: AppHandle) {
    let gen = BALANCE_LOOP_GEN.fetch_add(1, Ordering::Relaxed) + 1;
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(BALANCE_FIRST_FETCH_DELAY_MS));
        if BALANCE_LOOP_GEN.load(Ordering::Relaxed) != gen {
            return; // 已有更晚的环接岗（KernelReady 重入）
        }
        fetch_and_push(&app);
        let mut last_fetch = Instant::now();
        let mut was_visible = main_window_visible(&app);
        let mut failures: u32 = 0; // 连续取数失败次数（VB4 加速重试阶梯）
        loop {
            std::thread::sleep(Duration::from_millis(BALANCE_TICK_MS));
            if BALANCE_LOOP_GEN.load(Ordering::Relaxed) != gen {
                return;
            }
            let visible = main_window_visible(&app);
            if !visible {
                was_visible = false; // 最小化/隐藏：暂停轮询（不推进节拍）
                continue;
            }
            if !was_visible {
                // 恢复补刷：先回放缓存（页面即时有数），再强制刷一次。
                let cached = {
                    let st = app.state::<AppState>();
                    let v = st.balance.last.lock().unwrap_or_else(|p| p.into_inner()).clone();
                    v
                };
                if let Some(v) = cached {
                    let _ = app.emit("balance-changed", v);
                }
                failures = if fetch_and_push(&app) { 0 } else { failures.saturating_add(1) };
                last_fetch = Instant::now();
                was_visible = true;
                continue;
            }
            // VB4：失败加速重试——常规轮询间隔按连续失败次数走阶梯（成功即回
            // 3min；Electron scheduleRetry 30s→1m→2m→5m 同语义）。
            if last_fetch.elapsed() >= retry_interval(failures) {
                failures = if fetch_and_push(&app) { 0 } else { failures.saturating_add(1) };
                last_fetch = Instant::now();
            }
        }
    });
}

/// 余额刷新触发（垫片 refreshBalance → balance_refresh）。
/// Electron 语义（单一投递契约）：只触发刷新，数据经 balance-changed 事件
/// 推送；已有缓存时先回放一次（页面重挂载即时有数，dock 不闪「无壳模式」
/// 4s 降级——f1ab8c7 的挂起降级由此有了真实数据可等）。
#[tauri::command]
pub fn balance_refresh(app: AppHandle) -> Result<serde_json::Value, BridgeError> {
    // 缓存回放先行绑定（if-let 判别式/块尾表达式里的 MutexGuard 临时量
    // 生命周期会拖过块内局部变量的 drop 点，先落局部再消费，借用即刻结束）。
    let cached = {
        let state = app.state::<AppState>();
        let v = state.balance.last.lock().unwrap_or_else(|p| p.into_inner()).clone();
        v
    };
    if let Some(v) = cached {
        let _ = app.emit("balance-changed", v);
    }
    trigger_fetch(&app);
    Ok(serde_json::Value::Null)
}

// ---------------------------------------------------------------------------
// 测试
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// sidecar 协议：stdout 末行 JSON 解析（多行 / 纯日志 / 坏 JSON / 空）。
    #[test]
    fn parse_last_line_json_sidecar_protocol() {
        assert_eq!(
            parse_last_line_json("[sidecar] 日志行\n{\"ok\":true,\"balances\":[]}\n"),
            Some(serde_json::json!({ "ok": true, "balances": [] })),
            "末行 JSON 应解析"
        );
        // 人类日志在 stderr、stdout 只有一行 JSON：单行也应命中。
        assert_eq!(parse_last_line_json("{\"ok\":false}"), Some(serde_json::json!({ "ok": false })));
        assert_eq!(parse_last_line_json(""), None, "空 stdout → None");
        assert_eq!(parse_last_line_json("[sidecar] 只有日志"), None, "纯日志 → None");
        assert_eq!(parse_last_line_json("{\"ok\": true"), None, "坏 JSON → None");
        // 尾随空白（Windows CRLF）不破坏解析。
        assert_eq!(
            parse_last_line_json("log\r\n{\"ok\":1}\r\n"),
            Some(serde_json::json!({ "ok": 1 }))
        );
    }

    /// 轮询周期锚点：必须与 Electron DEFAULT_POLL_MS（3 分钟，cfe18cf）一致。
    #[test]
    fn poll_interval_matches_electron() {
        assert_eq!(BALANCE_POLL_SECS, 180, "轮询周期 = Electron balance-scheduler DEFAULT_POLL_MS");
    }

    /// 可见性判定表：缺省可见（unwrap_or(true)）；最小化即暂停；窗口缺失
    /// （Option 外层 None）由 main_window_visible 归为不可见。
    #[test]
    fn window_visibility_decision_table() {
        assert!(window_visibility(Some(true), Some(false)), "可见且未最小化");
        assert!(window_visibility(None, None), "查询失败按可见（不误杀正常轮询）");
        assert!(!window_visibility(Some(true), Some(true)), "最小化 → 暂停");
        assert!(!window_visibility(Some(false), Some(false)), "隐藏 → 暂停");
        assert!(!window_visibility(Some(false), None), "隐藏（最小化未知）→ 暂停");
    }

    /// 形态锚点（内存审计，同 lib.rs HEARTBEAT_WATCHER_GEN）：轮询环必须带
    /// 代数交替退出路径——KernelReady 每次内核重启都会触发且单次 boot 发两回，
    /// 无守卫时线程随重启次数只增不减（各持 AppHandle 永久 5s 轮询）。
    #[test]
    fn balance_loop_has_generation_guard_shape() {
        let src = include_str!("balance.rs");
        let seg = src
            .split("pub fn start_balance_loop")
            .nth(1)
            .and_then(|s| s.split("\n}\n\n/// 余额刷新触发").next())
            .expect("start_balance_loop 函数体");
        assert!(src.contains("static BALANCE_LOOP_GEN"), "必须有全局代数号");
        assert!(
            seg.contains("BALANCE_LOOP_GEN.fetch_add"),
            "新轮询环上岗必须递增代数号（令旧环失效）: {seg}"
        );
        assert!(
            seg.contains("BALANCE_LOOP_GEN.load(Ordering::Relaxed) != gen"),
            "轮询循环必须校验代数号并退出旧环: {seg}"
        );
    }

    /// 形态锚点：恢复补刷必须先回放缓存再强制刷（Electron win.on('show') 推
    /// balanceCache + restore → force 的合并语义），暂停期不得推进节拍。
    #[test]
    fn balance_loop_pause_and_resume_semantics_shape() {
        let src = include_str!("balance.rs");
        let seg = src
            .split("pub fn start_balance_loop")
            .nth(1)
            .and_then(|s| s.split("\n}\n\n/// 余额刷新触发").next())
            .expect("start_balance_loop 函数体");
        assert!(seg.contains("was_visible = false"), "不可见必须标记暂停态");
        assert!(
            seg.contains("if !was_visible") && seg.contains("fetch_and_push(&app)"),
            "恢复可见必须强制补刷"
        );
        // 先回放缓存再补刷（emit 在 fetch 之前）。
        let emit_pos = seg.find("app.emit(\"balance-changed\", v)").expect("恢复时应回放缓存");
        let fetch_pos = seg.rfind("fetch_and_push(&app)").expect("恢复时应强制刷");
        assert!(emit_pos < fetch_pos, "先回放缓存（页面即时有数）再强制刷");
        assert!(
            src.contains("const BALANCE_FIRST_FETCH_DELAY_MS: u64 = 500"),
            "首刷延迟常量（Electron A-10 500ms）必须存在且为 500"
        );
        assert!(
            seg.contains("BALANCE_FIRST_FETCH_DELAY_MS"),
            "轮询环首刷必须走延迟常量"
        );
    }

    /// 形态锚点：balance_refresh 必须守单一投递契约——先回放缓存再触发后台
    /// 刷，且返回 Null（不返回数据；数据只走 balance-changed 事件）。
    #[test]
    fn balance_refresh_single_delivery_contract_shape() {
        let src = include_str!("balance.rs");
        let seg = src
            .split("pub fn balance_refresh")
            .nth(1)
            .and_then(|s| s.split("// ---\n// 测试").next())
            .expect("balance_refresh 函数体");
        assert!(seg.contains("app.emit(\"balance-changed\", v)"), "有缓存先回放");
        assert!(seg.contains("trigger_fetch(&app)"), "触发后台刷");
        assert!(seg.contains("Ok(serde_json::Value::Null)"), "返回 Null（数据不走红皮书通道）");
    }

    /// 形态锚点：fetch_once 子进程必须带 CREATE_NO_WINDOW（GUI 起 console
    /// 程序闪终端窗的回归锚点——与 run_sidecar 同口径）。
    #[test]
    fn fetch_once_suppresses_console_window_shape() {
        let src = include_str!("balance.rs");
        let seg = src
            .split("fn fetch_once")
            .nth(1)
            .and_then(|s| s.split("fn fetch_and_push").next())
            .expect("fetch_once 函数体");
        assert!(seg.contains("balance-fetch"), "必须调用 sidecar balance-fetch");
        assert!(seg.contains(".creation_flags_no_window()"), "spawn 必须抑制终端窗");
    }
}

//! # session_notify —— 会话完成通知链（backlog C1）+ 会话完成即刷余额挂点（C2）
//!
//! Electron 语义母本：`dsh-desktop/main.js` `onSessionTurnEnd`（:2637-2680）
//!
//! 另见 `dsh-desktop/session-watcher.js`（zstd 会话日志扫描，Electron 在 main.js:6337 boot 成功后 `new SessionWatcher(...).start()`）。
//!
//! 链路（谁 spawn 谁 / 事件流）：
//!
//! ```text
//! lib.rs route_one_event(KernelReady)
//!   └─ start_watcher() ──spawn──▶ vendor node <app_dir>/session-watcher.js
//!                                  （payload 根级脚本；stage-payload.sh 根级
//!                                   *.js 全量镜像随包分发）
//!                                  CLI 模式：--sessions-dir <DSH_HOME>/sessions，
//!                                   每个 turn-end 输出一行 JSON（stdout），
//!                                   日志走 stderr；stdin 管道保活防孤儿。
//!        ├─ 读 stdout（capped 行协议）→ parse_watcher_line → handle_turn_end
//!        ├─ 读 stderr → 转发 desktop.log（取证）
//!        └─ 子进程退出 → 指数退避（1s…60s 封顶）自动重启；app 退出时收割
//! handle_turn_end（Electron onSessionTurnEnd 同序）：
//!   1. balance::trigger_fetch —— C2：回合完成即刷余额，先于一切通知门
//!      （Electron 首行就是 maybeRefreshBalance，main.js:2642）
//!   2. quitting 旗标 → 静默
//!   3. 门：notifyOnTurnEnd 设置（!== false，默认开；menu.rs toggle-notify
//!      持久化同 key）+ 主窗 visible && focused → 不打扰
//!   4. 限流：NotifyThrottle（30s/会话 + 15s 全局）——后置咨询，
//!      被门拦截的 turn-end 不消耗限流额度（Electron 同序）
//!   5. tauri-plugin-notification 弹通知（title||'DSH 任务完成' /
//!      body||'会话任务已完成'；正文由 watcher 按 Electron emit 组装）
//!      + 主窗未聚焦时请求任务栏注意力（request_user_attention → Windows
//!        任务栏 DSH 图标闪烁）；与通知同一门控（开关 + 未聚焦 + 限流），
//!        不额外制造骚扰。
//! 点击跳转：主窗 Focused(true) → on_main_window_focused → emit
//!   "notification-jump" {"sessionId"} —— bridge-shim.js:78 已监听该事件名
//!   （垫片 onNotificationJump → dsh-session-manager 跳转；订阅前到达的跳转
//!   由垫片 pendingJump 保留补发）。
//! ```
//!
//! 点击跳转机制取舍（证据）：Cargo.lock 锁定 tauri-plugin-notification 2.3.3，
//! 其桌面端 `NotificationBuilder::show()` 只透传 title/body/icon/sound（插件
//! src/desktop.rs:26-46）；`action_type_id` 虽在 lib.rs:115 暴露，但
//! ActionType/Action 模型全部 `#[cfg(mobile)]`（src/models.rs:313-342），
//! Windows toast 没有点击回调。兜底：通知发出时记录「最近通知的会话」+ 时间
//! 戳，主窗重新聚焦且在新鲜度窗（[`JUMP_FRESHNESS_MS`]）内 → 补发
//! notification-jump。与 Electron（Notification.on('click') 精确回调）的
//! 差异：无法区分「看了通知后切回应用」与「无关紧要的 alt-tab」，新鲜度窗
//! 把误跳转限制在通知后一分钟内（见交付报告取舍表）。
//!
//! 与 `crates/session-watcher`（纯逻辑 crate）的关系：该 crate 的
//! NotifyThrottle 缺 Electron 的 15s 全局限流窗，且把聚焦豁免混进 decide()
//! （Electron 恰恰已删掉「当前会话单独拦截」，main.js:2643-2644 注释：后台
//! 完成的当前会话是最需要提醒的场景）；其签名（u64 + 枚举）也与本模块契约
//! （u128 + bool）不符，且 app 依赖表未引它（Cargo.toml 注明接线时再引）。
//! 故在此按契约 + 母本语义实现，crate 保持零接线不动。
//!
//! 已知限制（与 Electron 版一致）：监视的是 Windows 侧文件系统路径
//! `<DSH_HOME>/sessions`；WSL 模式下内核会话日志落在 WSL 文件系统内
//! （\\wsl$ 不可靠 fs.watch），完成通知可能延迟到 10s 兜底 stat 清扫或
//! 完全不触发——Electron 版同样监视 Windows 侧路径，行为等同。

use std::collections::HashMap;
use std::io::Read;
use std::path::PathBuf;
use std::process::{Child, ChildStderr, ChildStdin, ChildStdout, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::AppState;
use crate::commands::NoWindow;
use kernel_process::sanitized_node_command;

// ---------------------------------------------------------------------------
// 常量（Electron main.js onSessionTurnEnd / preload 逐字对齐）
// ---------------------------------------------------------------------------

/// 同一会话完成通知最小间隔（Electron main.js:2648：`now - last < 30000`）。
pub const SESSION_THROTTLE_MS: u128 = 30_000;
/// 全局限流窗（Electron main.js:2650：多会话同时完成防刷屏，15s 至多一条）。
pub const GLOBAL_THROTTLE_MS: u128 = 15_000;
/// 垫片监听的跳转事件名（bridge-shim.js:78 `onEvent('notification-jump', …)`；
/// Electron IPC 名为 `dsh:notification-jump`，Tauri 垫片取无前缀名，照它）。
pub const JUMP_EVENT: &str = "notification-jump";
/// 会话 ID 合法长度（Electron onClick 校验 + 垫片同款：trim 后 1..=256）。
pub const MAX_SESSION_ID_LEN: usize = 256;
/// 点击跳转兜底的新鲜度窗：通知发出后这么久内主窗重新聚焦才补发跳转
///（无点击信号，防「很久后随手切回」被误跳转；Electron 真回调无此问题）。
pub const JUMP_FRESHNESS_MS: u128 = 60_000;
/// watcher 行协议单行上限（协议行 ~百字节级；超限整行流式丢弃不驻留）。
const WATCHER_LINE_CAP: usize = 8 * 1024;
/// 崩溃重启退避基数 / 封顶（1s→2s→…→60s 封顶）。
const BACKOFF_BASE_MS: u64 = 1_000;
const BACKOFF_CAP_MS: u64 = 60_000;
/// 连续 spawn 失败上限（vendor node/脚本被杀等永久形态：放弃并留终日志；
/// 内核重启会再次 start_watcher 复活）。自然崩溃（跑起来后退出）不设上限。
const MAX_SPAWN_FAILURES: u32 = 10;
/// 子进程存活超过该时长视为一次健康运行周期：退出时归零崩溃退避计数
/// （N2 P1-A——防「立刻退」形态被 spawn 成功重置成 1s 重启风暴，同时
/// 偶发/长跑后崩溃不永久累积退避）。
const WATCHER_HEALTHY_ALIVE: std::time::Duration = std::time::Duration::from_secs(60);

// ---------------------------------------------------------------------------
// 纯函数契约（pub，供对抗测试）
// ---------------------------------------------------------------------------

/// 一次回合完成（watcher 行协议的最小决策面；正文 body 见 [`TurnEndLine`]）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TurnEndEvent {
    pub session_id: String,
    pub title: Option<String>,
}

/// 完成通知限流器：30s/会话 + 15s 全局（Electron main.js:2647-2652 逐行对译）。
pub struct NotifyThrottle {
    session_last: HashMap<String, u128>,
    /// 全局上次通知时刻；None = 从未通知。Electron 用 `lastGlobalNotifyAt = 0`
    /// 初值 + 真实 Date.now()（恒 ≫ 15s）等价表达「初始不拦截」——Option 形态
    /// 让该语义对任意（含合成小数值）时间轴都成立，行为与 Electron 一致。
    global_last: Option<u128>,
}

impl NotifyThrottle {
    pub fn new() -> Self {
        Self { session_last: HashMap::new(), global_last: None }
    }

    /// 是否放行本次通知。Electron 语义（对译）：
    /// `if (now - last[sid] < 30000) return false;`
    /// `if (now - lastGlobal < 15000) return false;`（被全局窗拦截时**不写**
    /// 该会话时间戳——不消耗额度）；两者皆过 → 两个时间戳同时落笔。
    pub fn decide(&mut self, session_id: &str, now_ms: u128) -> bool {
        if let Some(&t) = self.session_last.get(session_id) {
            if now_ms.saturating_sub(t) < SESSION_THROTTLE_MS {
                return false;
            }
        }
        if let Some(g) = self.global_last {
            if now_ms.saturating_sub(g) < GLOBAL_THROTTLE_MS {
                return false;
            }
        }
        self.session_last.insert(session_id.to_string(), now_ms);
        self.global_last = Some(now_ms);
        true
    }
}

impl Default for NotifyThrottle {
    fn default() -> Self {
        Self::new()
    }
}

/// 通知总裁决：开关开 && 主窗未聚焦 && 非聚焦态下正在观看的会话 && 限流放行。
///
/// 参数语义（接线见 [`notify_gates`]）：`window_focused` = 主窗 visible &&
/// focused（Electron main.js:2645，窗口缺失/销毁按未聚焦处理→通知）；
/// `is_current_session` 按 Electron 终版语义只在聚焦态为真（Electron 已删
/// 「未聚焦时当前会话单独拦截」，main.js:2643-2644——后台完成的当前会话
/// 恰是最需要提醒的场景，不能吞）。
pub fn should_notify(
    enabled: bool,
    window_focused: bool,
    is_current_session: bool,
    throttle_ok: bool,
) -> bool {
    enabled && !window_focused && !is_current_session && throttle_ok
}

/// 通知文案（Electron main.js:2664-2665：`info.title || 'DSH 任务完成'` /
/// `info.body || '会话任务已完成'`——空串也是 falsy，同兜底）。
pub fn notification_text(title: Option<&str>, body: Option<&str>) -> (String, String) {
    let t = title.filter(|t| !t.is_empty()).unwrap_or("DSH 任务完成").to_string();
    let b = body.filter(|b| !b.is_empty()).unwrap_or("会话任务已完成").to_string();
    (t, b)
}

/// 会话 ID 可作跳转目标（Electron onClick + 垫片同款校验：trim 非空且 ≤256）。
pub fn valid_jump_session_id(raw: &str) -> bool {
    let id = raw.trim();
    !id.is_empty() && id.len() <= MAX_SESSION_ID_LEN
}

/// 崩溃重启退避：第 `consecutive_restarts` 次重启前等待 1s→2s→4s→…，
/// 60s 封顶（指数退避封顶，纯函数供单测）。
pub fn restart_backoff_ms(consecutive_restarts: u32) -> u64 {
    let shift = consecutive_restarts.saturating_sub(1).min(6);
    (BACKOFF_BASE_MS << shift).min(BACKOFF_CAP_MS)
}

// ---------------------------------------------------------------------------
// watcher 行协议（stdout JSON Lines）
// ---------------------------------------------------------------------------

/// watcher 协议行（含通知正文；决策面见 [`TurnEndEvent`]）。
#[derive(Debug, Clone)]
pub(crate) struct TurnEndLine {
    pub event: TurnEndEvent,
    pub body: Option<String>,
}

/// 解析一行 watcher 协议：`{"type":"turn-end","sessionId","title","body"}`。
/// 畸形 JSON / 非 turn-end / sessionId 缺失或非法（空、超 256、非字符串）
/// → None（整行丢弃，不中断流）。title/body 非字符串按缺省处理。
pub(crate) fn parse_watcher_line(line: &str) -> Option<TurnEndLine> {
    let v: serde_json::Value = serde_json::from_str(line.trim()).ok()?;
    if v.get("type")?.as_str()? != "turn-end" {
        return None;
    }
    let session_id = v.get("sessionId")?.as_str()?.trim().to_string();
    if !valid_jump_session_id(&session_id) {
        return None;
    }
    let field = |k: &str| v.get(k).and_then(|x| x.as_str()).map(str::to_string);
    Some(TurnEndLine {
        event: TurnEndEvent { session_id, title: field("title") },
        body: field("body"),
    })
}

/// 进行中的顶层 agent 回合数（supervisor 探活环「忙碌」判定源）。
pub fn active_turns() -> u64 {
    ACTIVE_TURNS.load(Ordering::Relaxed)
}

/// 回合活动（行协议对 ACTIVE_TURNS 的影响）。纯函数，供对抗测试。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TurnActivity {
    /// turn-start：进行中回合 +n。
    Start(u64),
    /// turn-end：进行中回合 -n（saturating，绝不落到负）。
    End(u64),
}

/// 从 watcher 行提取回合活动。turn-start 恒 +count；turn-end **仅当带 count**
/// 才 -count（count 缺省 = assistant/message 兜底通知，非真实 turn 结束，不得
/// 误消进行中的真实回合）。畸形行 / 其他 type → None。
pub fn parse_turn_activity(line: &str) -> Option<TurnActivity> {
    let v: serde_json::Value = serde_json::from_str(line.trim()).ok()?;
    let count = |v: &serde_json::Value| v.get("count").and_then(|c| c.as_u64()).unwrap_or(0);
    match v.get("type")?.as_str()? {
        "turn-start" => Some(TurnActivity::Start(count(&v).max(1))),
        "turn-end" => {
            // 缺 count（旧协议 / 兜底通知）→ 不减（0）。
            Some(TurnActivity::End(count(&v)))
        }
        _ => None,
    }
}

/// 应用一次回合活动到全局计数（saturating，跨会话并发安全）。
pub fn apply_turn_activity(activity: TurnActivity) {
    match activity {
        TurnActivity::Start(n) => {
            ACTIVE_TURNS.fetch_add(n, Ordering::Relaxed);
        }
        TurnActivity::End(n) if n > 0 => {
            let _ = ACTIVE_TURNS.fetch_update(Ordering::Relaxed, Ordering::Relaxed, |cur| {
                Some(cur.saturating_sub(n))
            });
        }
        TurnActivity::End(_) => {}
    }
}

/// 解析一行 watcher 权限申请协议：`{"type":"approval-asked","sessionId"}`。
/// 畸形 JSON / 非 approval-asked / sessionId 缺失或非法 → None（整行丢弃）。
/// 供「权限申请时任务栏闪烁」提醒（无需 title/body，只要有个可信 sessionId）。
pub(crate) fn parse_approval_asked(line: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(line.trim()).ok()?;
    if v.get("type")?.as_str()? != "approval-asked" {
        return None;
    }
    let session_id = v.get("sessionId")?.as_str()?.trim().to_string();
    if !valid_jump_session_id(&session_id) {
        return None;
    }
    Some(session_id)
}

/// 主窗是否聚焦（可见且聚焦）。
fn main_window_focused(app: &AppHandle) -> bool {
    app.get_webview_window("main")
        .map(|w| w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false))
        .unwrap_or(false)
}

/// capped 读行的结果。
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum LineOutcome {
    /// 一行（不含换行；行尾 `\r` 已剥——Windows CRLF 容错）。
    Line(String),
    /// 超过上限的行：已流式丢弃（不整行驻留内存），继续读下一行。
    Oversized,
    /// 流结束且无待返回内容。
    Eof,
}

/// 流式读一行（带上限）：逐字节扫描换行，超限即转入丢弃模式直至行尾——
/// 对端灌超大/无换行垃圾也不撑爆内存；EOF 处的半行按 Line 返回（交由
/// 解析层拒收——半行容错）。
pub(crate) fn read_capped_line<R: Read>(r: &mut R, cap: usize) -> std::io::Result<LineOutcome> {
    let mut line: Vec<u8> = Vec::new();
    let mut oversized = false;
    let mut byte = [0u8; 1];
    loop {
        let n = r.read(&mut byte)?;
        if n == 0 {
            if oversized {
                return Ok(LineOutcome::Oversized);
            }
            if line.is_empty() {
                return Ok(LineOutcome::Eof);
            }
            break; // 末行无换行收尾：按行返回，解析层裁决
        }
        if byte[0] == b'\n' {
            break;
        }
        if line.len() >= cap {
            oversized = true;
            line.clear();
            line.shrink_to_fit();
        }
        if !oversized {
            line.push(byte[0]);
        }
    }
    if oversized {
        return Ok(LineOutcome::Oversized);
    }
    let mut s = String::from_utf8_lossy(&line).into_owned();
    if s.ends_with('\r') {
        s.pop();
    }
    Ok(LineOutcome::Line(s))
}

// ---------------------------------------------------------------------------
// 运行时（监视线 / 子进程生命周期 / 门 / 通知 / 跳转）
// ---------------------------------------------------------------------------

/// watcher 子进程槽：child + 保活 stdin（Rust 退出哪怕被强杀，管道断 →
/// JS 侧 stdin 'end' 自退，防孤儿）+ 槽主线程代数号。
struct WatcherSlot {
    child: Option<Child>,
    stdin: Option<ChildStdin>,
    owner_gen: u64,
}

static WATCHER_SLOT: Mutex<WatcherSlot> =
    Mutex::new(WatcherSlot { child: None, stdin: None, owner_gen: 0 });
/// 监视线程代数号（新线启动即令旧线退役——KernelReady 单次 boot 发两回 /
/// 内核重启重入的幂等守卫，同 lib.rs HEARTBEAT_WATCHER_GEN 手法）。
static WATCHER_GEN: AtomicU64 = AtomicU64::new(0);
/// 退出中旗标（Electron `quitting`：退出中不再打扰；亦阻断崩溃重启）。
static QUITTING: AtomicBool = AtomicBool::new(false);
/// 进行中的顶层 agent 回合计数（turn-start +1 / turn-end -1，saturating）。
/// supervisor 探活环据其判定「内核正在工作」——agent 长时间思考/压缩导致
/// 内核事件循环被占、HTTP 无响应时不得误判假死强杀（issue #159）。
static ACTIVE_TURNS: AtomicU64 = AtomicU64::new(0);
/// 限流器（30s/会话 + 15s 全局）。Mutex<Option<_>> 仅为 static 常量初始化
///（HashMap::new 非 const）；首次使用时落座。
static THROTTLE: Mutex<Option<NotifyThrottle>> = Mutex::new(None);
/// 兜底跳转目标：最近一次通知的 (会话 ID, 通知时刻 ms)。
static PENDING_JUMP: Mutex<Option<(String, u128)>> = Mutex::new(None);

/// watcher 子进程的三路流。
struct SpawnedWatcher {
    stdout: ChildStdout,
    stderr: ChildStderr,
}

/// 启动会话监视线（KernelReady 路由调用；幂等）：
/// 当前代线程在岗且子进程存活 → no-op；否则换代起新线（旧线自退）。
pub fn start_watcher(app: AppHandle) {
    {
        let mut slot = WATCHER_SLOT.lock().unwrap_or_else(|p| p.into_inner());
        let alive = slot
            .child
            .as_mut()
            .map(|c| c.try_wait().map_or(true, |st| st.is_none()))
            .unwrap_or(false);
        if alive && slot.owner_gen == WATCHER_GEN.load(Ordering::Relaxed) {
            return; // Electron 的 SessionWatcher 也全程只 start 一次
        }
    }
    // 永久形态前置校验（supervisor 未装配 / payload 脚本缺失）：不起线程，
    // 单条日志了结（内核重启会再走这里重试）。
    let paths = match resolve_watcher_paths(&app) {
        Ok(p) => p,
        Err(e) => {
            log(format!("[notify] session watcher 不启动（不影响主窗）：{e}"));
            return;
        }
    };
    let gen = WATCHER_GEN.fetch_add(1, Ordering::Relaxed) + 1;
    std::thread::spawn(move || run_watcher(app, gen, paths));
}

/// watcher 子进程参数（supervisor 的 vendor node + payload 脚本 + 会话目录）。
struct WatcherPaths {
    node: PathBuf,
    script: PathBuf,
    sessions_dir: PathBuf,
}

fn resolve_watcher_paths(app: &AppHandle) -> Result<WatcherPaths, String> {
    let state = app.try_state::<AppState>().ok_or("AppState 未就绪")?;
    let sv = state
        .supervisor
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .clone()
        .ok_or("supervisor 未装配（内核未就绪）")?;
    // payload 根级脚本（stage-payload.sh 镜像 dsh-desktop 根级 *.js；
    // Electron require('./session-watcher') 同件）。
    let script = sv.app_dir.join("session-watcher.js");
    if !script.exists() {
        return Err(format!("payload 脚本缺失：{}", script.display()));
    }
    // <DSH_HOME>/sessions（Electron main.js:6340：effectiveDshHome() || ~/.dsh
    // + 'sessions'；DshPaths.dsh_home 与 sidecar resolveHome 同源，含 DSH_HOME
    // 覆盖）。
    Ok(WatcherPaths {
        node: sv.node_exe.clone(),
        script,
        sessions_dir: state.paths.dsh_home.join("sessions"),
    })
}

fn run_watcher(app: AppHandle, my_gen: u64, paths: WatcherPaths) {
    let mut spawn_failures: u32 = 0;
    // 崩溃重启计数：成功跑起来一轮即清零（退避阶梯重新从 1s 起算）——
    // 崩溃退避计数（N2 P1-A：spawn 成功不归零——只有存活满 60s 的健康周期
    // 在退出时归零；「起得来但立刻退」不再被重置成 1s 风暴）。
    let mut restarts: u32 = 0;
    loop {
        if is_retired(my_gen) {
            return;
        }
        // 互斥注册：先清残留（前代/上一轮尸体），再 spawn 入槽。
        let streams = {
            let mut slot = WATCHER_SLOT.lock().unwrap_or_else(|p| p.into_inner());
            if is_retired(my_gen) {
                return; // 已换代：在位 child 归新代线程管，不动
            }
            if let Some(mut old) = slot.child.take() {
                let _ = old.kill();
                let _ = old.wait();
            }
            match spawn_watcher_process(&paths) {
                Ok((mut child, streams)) => {
                    let SpawnedWatcher { stdout, stderr } = streams;
                    // watcher (重)启动即重基线：上一代遗留的「进行中回合」计数作废
                    // （新基线不再吐历史 turn/start/turn-end），否则滞留计数会让
                    // 真死内核永远逃过假死重启兜底（issue #159）。
                    ACTIVE_TURNS.store(0, Ordering::Relaxed);
                    // stdin 句柄留在槽内保活（drop 即管道断 → JS 自退）。
                    slot.stdin = child.stdin.take();
                    slot.owner_gen = my_gen;
                    slot.child = Some(child);
                    Some((stdout, stderr))
                }
                Err(e) => {
                    log(format!("[notify] session watcher 启动失败：{e}"));
                    None
                }
            }
        };
        let Some((stdout, stderr)) = streams else {
            spawn_failures += 1;
            if spawn_failures >= MAX_SPAWN_FAILURES {
                log(format!(
                    "[notify] session watcher 连续 {spawn_failures} 次启动失败，放弃（内核重启可复活）"
                ));
                return;
            }
            if sleep_unless_retired(my_gen, restart_backoff_ms(spawn_failures)) {
                return;
            }
            continue;
        };
        spawn_failures = 0;
        // N2 P1-A：spawn 成功不重置 restarts——「起得来但立刻退」的形态（sessions
        // 目录在异常盘上等）此前恒 1000ms 退避 = 永久 1 次/秒重启风暴刷日志。
        // 退避计数只在「子进程存活超过 WATCHER_HEALTHY_ALIVE（60s）」时视为
        // 健康运行过、于退出时归零：偶发崩溃不累加，慢性泄漏式长跑后崩溃也不
        // 会被 1s 风暴化。
        let spawned_at = std::time::Instant::now();
        forward_stderr(stderr);
        log(format!(
            "[notify] session watcher 在岗（{}，监视 {}）",
            paths.script.display(),
            paths.sessions_dir.display()
        ));
        // stdout 行消费（EOF = 子进程退出/被杀）。
        let mut reader = std::io::BufReader::new(stdout);
        loop {
            match read_capped_line(&mut reader, WATCHER_LINE_CAP) {
                Ok(LineOutcome::Line(line)) => {
                    if is_retired(my_gen) {
                        break;
                    }
                    // 回合进行中计数（issue #159）：turn-start +1 / turn-end -1，
                    // 供 supervisor 探活环判定「内核正在工作」时豁免假死强杀。
                    if let Some(activity) = parse_turn_activity(&line) {
                        apply_turn_activity(activity);
                    }
                    if let Some(ev) = parse_watcher_line(&line) {
                        // 逐事件 panic 隔离（同 lib.rs route_events 手法）。
                        let h = app.clone();
                        let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(move || {
                            handle_turn_end(&h, &ev)
                        }));
                        if r.is_err() {
                            log("[notify] turn-end 处理 panic（已隔离，继续）".to_string());
                        }
                    }
                    // 权限申请（内核 approval/asked）：主窗未聚焦时任务栏闪烁，
                    // 提醒用户回来看审批（与任务完成闪烁同用 Informational）。
                    if parse_approval_asked(&line).is_some() && !main_window_focused(&app) {
                        request_main_window_attention(&app);
                    }
                }
                Ok(LineOutcome::Oversized) => {
                    log(format!("[notify] watcher 超长行丢弃（>{WATCHER_LINE_CAP}B）"));
                }
                Ok(LineOutcome::Eof) | Err(_) => break,
            }
        }
        // 收割：仅当前代收割槽内 child（被换代/关闭者已由其所属路径处理）。
        {
            let mut slot = WATCHER_SLOT.lock().unwrap_or_else(|p| p.into_inner());
            if !is_retired(my_gen) {
                if let Some(mut c) = slot.child.take() {
                    let _ = c.wait();
                }
                slot.stdin = None;
            }
        }
        if is_retired(my_gen) {
            return;
        }
        // 崩溃自动重启：指数退避封顶，不设次数上限（Electron 语义靠 in-process
        // 兜底；进程形态下重启即等价恢复，zstd 基线逻辑防通知重放）。
        // N2 P1-A：存活超过健康线的运行视为一次健康周期，退出时归零退避计数。
        if spawned_at.elapsed() >= WATCHER_HEALTHY_ALIVE {
            restarts = 0;
        }
        restarts += 1;
        log(format!(
            "[notify] session watcher 退出，{}ms 后第 {restarts} 次重启",
            restart_backoff_ms(restarts)
        ));
        if sleep_unless_retired(my_gen, restart_backoff_ms(restarts)) {
            return;
        }
    }
}

fn spawn_watcher_process(
    paths: &WatcherPaths,
) -> Result<(Child, SpawnedWatcher), String> {
    let mut cmd = sanitized_node_command(&paths.node);
    cmd.arg(&paths.script)
        .arg("--sessions-dir")
        .arg(&paths.sessions_dir)
        // stdin 保活管道（见 WatcherSlot 注释）；stdout 行协议 / stderr 日志。
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        // GUI 进程起 console 子进程必须抑制终端窗（与 run_sidecar/
        // balance fetch_once 同口径）。
        .creation_flags_no_window();
    let mut child = cmd.spawn().map_err(|e| format!("spawn {:?}: {e}", paths.node))?;
    let stdout = child.stdout.take().ok_or("stdout 管道缺失")?;
    let stderr = child.stderr.take().ok_or("stderr 管道缺失")?;
    Ok((child, SpawnedWatcher { stdout, stderr }))
}

/// stderr 转发线程：watcher 人类日志 → desktop.log（防管道写满阻塞子进程）。
fn forward_stderr(stderr: ChildStderr) {
    std::thread::spawn(move || {
        let mut reader = std::io::BufReader::new(stderr);
        loop {
            match read_capped_line(&mut reader, WATCHER_LINE_CAP) {
                Ok(LineOutcome::Line(line)) if !line.is_empty() => {
                    log(format!("[watcher] {line}"));
                }
                Ok(LineOutcome::Line(_)) => {}
                Ok(LineOutcome::Oversized) => {}
                Ok(LineOutcome::Eof) | Err(_) => return,
            }
        }
    });
}

fn is_retired(my_gen: u64) -> bool {
    QUITTING.load(Ordering::Relaxed) || WATCHER_GEN.load(Ordering::Relaxed) != my_gen
}

/// 退避睡眠（分片检查退役）；返回 true = 睡眠期间已退役。
fn sleep_unless_retired(my_gen: u64, total_ms: u64) -> bool {
    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(total_ms);
    while std::time::Instant::now() < deadline {
        if is_retired(my_gen) {
            return true;
        }
        std::thread::sleep(std::time::Duration::from_millis(500).min(deadline.saturating_duration_since(std::time::Instant::now())));
    }
    is_retired(my_gen)
}

/// 单次 turn-end 的完整处理（Electron onSessionTurnEnd 同序）。
fn handle_turn_end(app: &AppHandle, ev: &TurnEndLine) {
    // 1. C2：回合完成 = 产生消耗 → 刷余额。Electron 首行就是它（main.js:2642），
    //    先于通知开关/聚焦/限流门——门全关余额也刷。N2 P1-C：走 30s 节流的
    //    非强制路径（Electron maybeRefreshBalance 的 scheduler 同款；流式多
    //    回合不逐回合起取数子进程）。
    crate::commands::balance::trigger_fetch_throttled(app);
    // 2. quitting（Electron main.js:2643）。
    if QUITTING.load(Ordering::Relaxed) {
        return;
    }
    let (enabled, focused, is_current) = notify_gates(app, &ev.event.session_id);
    log(format!(
        "[notify] DEBUG turn detected: {{\"sid\":\"{}\",\"title\":{:?},\"enabled\":{enabled},\"focused\":{focused},\"current\":{is_current}}}",
        ev.event.session_id, ev.event.title
    ));
    // 3+4. 限流后置（Electron 同序）：门未开就不咨询限流——聚焦/开关拦截
    //      不消耗限流额度。
    let gates_open = should_notify(enabled, focused, is_current, true);
    let throttle_ok = gates_open
        && THROTTLE
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .get_or_insert_with(NotifyThrottle::new)
            .decide(&ev.event.session_id, now_ms());
    // 5. 总裁决 + 弹通知 + 请求任务栏注意力（同一门控：未聚焦才闪）。
    if should_notify(enabled, focused, is_current, throttle_ok) {
        // 主窗未聚焦（should_notify 已含 !focused）→ 让任务栏 DSH 图标闪烁，
        // 提醒用户回来看结果；与通知同受 notifyOnTurnEnd 开关 + 限流约束，
        // 不额外制造骚扰。
        request_main_window_attention(app);
        fire_notification(app, ev);
    }
}

/// 三门输入（见 [`should_notify`] 文档）。
fn notify_gates(app: &AppHandle, session_id: &str) -> (bool, bool, bool) {
    // notifyOnTurnEnd !== false（默认开；menu.rs toggle-notify 持久化同 key）。
    let enabled = app
        .try_state::<AppState>()
        .map(|s| {
            let store = shell_core::SettingsStore::new(s.paths.settings.clone());
            store
                .get("notifyOnTurnEnd")
                .map(|v| v != Some(serde_json::Value::Bool(false)))
                .unwrap_or(true)
        })
        .unwrap_or(true);
    // Electron main.js:2645：主窗 isVisible() && isFocused() → 用户正在操作，
    // 不打扰。窗口缺失/销毁/查询失败按未聚焦 → 通知（Electron 同语义）。
    let focused = app
        .get_webview_window("main")
        .map(|w| w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false))
        .unwrap_or(false);
    // is_current 仅聚焦态为真（Electron 终版已删未聚焦单拦——见 should_notify
    // 文档；此处显式化「聚焦时正在看的会话完成不吵」）。
    let current = app.try_state::<AppState>().and_then(|s| {
        s.current_session
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone()
    });
    let is_current = focused && current.as_deref() == Some(session_id);
    (enabled, focused, is_current)
}

/// 请求主窗任务栏注意力（Windows：任务栏 DSH 图标闪烁，提醒用户回来看）。
/// 拿不到主窗 / 平台不支持 / 请求失败 → 静默（不 panic、不影响主流程）。
///
/// AttentionType 选 `Informational`：Windows 上仅闪烁任务栏按钮直至应用重新
/// 聚焦（不闪窗口标题栏，避免过度打扰）；`Critical` 会额外闪烁窗口本身，
/// 「回来看结果」用 Informational 足够（tauri 2.11 `UserAttentionType`）。
fn request_main_window_attention(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.request_user_attention(Some(tauri::UserAttentionType::Informational));
    }
}

fn fire_notification(app: &AppHandle, ev: &TurnEndLine) {
    let (title, body) = notification_text(ev.event.title.as_deref(), ev.body.as_deref());
    log(format!(
        "[notify] 任务完成: {}",
        serde_json::json!({ "sessionId": ev.event.session_id, "title": title, "body": body })
    ));
    // Electron 文案直通（title/body 组装在 watcher 侧，与 emit() 一致）。
    match app.notification().builder().title(&title).body(&body).show() {
        Ok(()) => {
            // 兜底跳转目标：通知已上屏才有「回前台跳它」的预期（Electron 的
            // onClick 只存在于已展示的通知上，同序）。
            if valid_jump_session_id(&ev.event.session_id) {
                *PENDING_JUMP.lock().unwrap_or_else(|p| p.into_inner()) =
                    Some((ev.event.session_id.trim().to_string(), now_ms()));
            }
        }
        Err(e) => log(format!("[notify] 通知发送失败: {e}")),
    }
}

/// 主窗重新聚焦（lib.rs on_window_event Focused(true) 路由）：兜底补发
/// notification-jump——插件 2.3.3 桌面无点击回调（见模块头取舍），激活即
/// 跳「最近通知的会话」，新鲜度窗外的陈旧目标直接作废。
pub fn on_main_window_focused(app: &AppHandle) {
    let Some((sid, at)) = PENDING_JUMP.lock().unwrap_or_else(|p| p.into_inner()).take() else {
        return;
    };
    if now_ms().saturating_sub(at) > JUMP_FRESHNESS_MS {
        return; // 陈旧（用户并未针对该通知回前台）：作废
    }
    if !valid_jump_session_id(&sid) {
        return;
    }
    // Electron onClick（main.js:2660-2672）：showMainWindow() + send
    // ('dsh:notification-jump', {sessionId})——**仅向 mainWindow.webContents**
    // 定向下发。实现注记（RV3 P0-1 核实）：Tauri 2 的 emit_to(label) 对
    // **Any 目标 JS 监听不具备定向性**（listener.rs match_any_or_filter 对
    // Any 注册者无条件放行）——定向语义由垫片侧 isMainWindow() 守卫完成
    //（bridge-shim.js notification-jump map），此处保留 emit_to 作为意图
    // 声明与未来 labeled 监听者的正确起点。
    let _ = app.emit_to(
        tauri::EventTarget::labeled("main"),
        JUMP_EVENT,
        serde_json::json!({ "sessionId": sid.trim() }),
    );
}

/// 收割 watcher 子进程（lib.rs RunEvent::ExitRequested/Exit 调用；幂等）。
pub fn shutdown_watcher() {
    QUITTING.store(true, Ordering::Relaxed);
    WATCHER_GEN.fetch_add(1, Ordering::Relaxed); // 令在岗监视线退役
    let mut slot = WATCHER_SLOT.lock().unwrap_or_else(|p| p.into_inner());
    slot.stdin = None; // 先断保活管道（JS 侧优雅退出路径）
    if let Some(mut c) = slot.child.take() {
        let _ = c.kill();
        let _ = c.wait(); // 收割，不留僵尸
    }
}

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

/// 路由层日志（与 lib.rs route_log 同口径：stderr + logs/desktop.log）。
fn log(msg: String) {
    eprintln!("{msg}");
    crate::supervisor::file_log(&msg);
}

// ---------------------------------------------------------------------------
// 测试
// ---------------------------------------------------------------------------

#[cfg(test)]
mod throttle_tests {
    use super::*;

    /// 30s 会话窗边界：29.9s 拦 / 恰 30s 放 / 30.1s 放（Electron `< 30000` 对译）。
    #[test]
    fn session_window_boundaries() {
        let mut t = NotifyThrottle::new();
        assert!(t.decide("s1", 0), "首条放行");
        assert!(!t.decide("s1", 29_900), "29.9s 内拦截");
        assert!(t.decide("s1", 30_000), "恰 30s（不 < 30000）放行");
        assert!(!t.decide("s1", 30_000 + 29_900), "第二个窗口内再拦");
        assert!(t.decide("s1", 60_100), "30.1s 后放行");
    }

    /// 15s 全局窗：不同会话在 15s 内也只放一条；恰 15s 放行。
    #[test]
    fn global_window_boundaries() {
        let mut t = NotifyThrottle::new();
        assert!(t.decide("a", 0));
        assert!(!t.decide("b", 14_999), "跨会话仍受全局 15s 窗拦截");
        assert!(t.decide("b", 15_000), "恰 15s 放行（不 < 15000）");
    }

    /// 被全局窗拦截不消耗该会话额度（Electron：return 在两个 set 之前）。
    #[test]
    fn global_suppression_does_not_consume_session_quota() {
        let mut t = NotifyThrottle::new();
        assert!(t.decide("a", 0));
        assert!(!t.decide("b", 5_000), "b 被 15s 全局窗拦截");
        // b 的 30s 会话窗未被写：全局窗一过即放行（若误写额度，这里要到 35s）。
        assert!(t.decide("b", 15_000), "全局窗过后 b 首条应立即放行");
    }

    /// 双会话交错矩阵。
    #[test]
    fn interleaved_sessions() {
        let mut t = NotifyThrottle::new();
        assert!(t.decide("a", 0));
        assert!(!t.decide("b", 1_000), "全局窗拦 b");
        assert!(!t.decide("a", 16_000), "a 会话窗拦（16s < 30s）");
        assert!(t.decide("b", 16_000), "全局窗（16s ≥ 15s）+ b 无历史 → 放行");
        assert!(!t.decide("a", 17_000), "全局窗（17-16=1s < 15s）拦 a");
        assert!(t.decide("a", 46_000), "a 距其上次 46s ≥ 30s 且全局 30s ≥ 15s → 放行");
    }

    /// 契约签名（对抗测试锚点）：u128 时轴、bool 返回。
    #[test]
    fn contract_shapes() {
        let mut t = NotifyThrottle::new();
        let _: bool = t.decide("sid", 0u128);
        let ev = TurnEndEvent { session_id: "s".into(), title: Some("t".into()) };
        assert_eq!(ev.session_id, "s");
    }
}

#[cfg(test)]
mod should_notify_tests {
    use super::*;

    /// 全矩阵：唯一放行组合 = 开 && 未聚焦 && 非当前 && 限流放行。
    #[test]
    fn full_matrix() {
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
        assert!(should_notify(true, false, false, true), "标准放行组合");
        assert!(!should_notify(true, false, false, false), "限流拦截");
        assert!(!should_notify(false, false, false, true), "设置关全抑制");
        assert!(!should_notify(true, true, false, true), "聚焦抑制");
        assert!(!should_notify(true, true, true, true), "聚焦+当前会话双抑制");
        assert!(!should_notify(true, false, true, true), "当前会话抑制（聚焦语义下）");
    }
}

#[cfg(test)]
mod text_and_backoff_tests {
    use super::*;

    #[test]
    fn notification_text_fallbacks() {
        assert_eq!(
            notification_text(Some("修复登录"), Some("demo · 会话 abcd1234")),
            ("修复登录".to_string(), "demo · 会话 abcd1234".to_string())
        );
        // Electron `info.title || '...'`：空串也是 falsy。
        assert_eq!(notification_text(Some(""), Some("")), ("DSH 任务完成".to_string(), "会话任务已完成".to_string()));
        assert_eq!(notification_text(None, None), ("DSH 任务完成".to_string(), "会话任务已完成".to_string()));
    }

    #[test]
    fn jump_session_id_validation() {
        assert!(valid_jump_session_id("  abc  "));
        assert!(!valid_jump_session_id("   "));
        assert!(!valid_jump_session_id(""));
        let long = "x".repeat(MAX_SESSION_ID_LEN);
        assert!(valid_jump_session_id(&long), "恰 256 放行");
        assert!(!valid_jump_session_id(&format!("{}x", long)), "257 拦截");
    }

    /// 指数退避封顶：1s→2s→…→32s→60s（64s 封顶到 60s）→恒 60s。
    #[test]
    fn backoff_exponential_capped() {
        assert_eq!(restart_backoff_ms(1), 1_000);
        assert_eq!(restart_backoff_ms(2), 2_000);
        assert_eq!(restart_backoff_ms(3), 4_000);
        assert_eq!(restart_backoff_ms(6), 32_000);
        assert_eq!(restart_backoff_ms(7), 60_000, "2^6*1000=64s → 封顶 60s");
        assert_eq!(restart_backoff_ms(50), 60_000, "恒封顶");
        assert_eq!(restart_backoff_ms(0), 1_000, "0 按 1 处理（saturating）");
    }
}

#[cfg(test)]
mod line_protocol_tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn parse_valid_and_malformed_lines() {
        let ev = parse_watcher_line(
            r#"{"type":"turn-end","sessionId":"  s-1 ","title":"修复登录","body":"demo · 会话 xxxxxxxx"}"#,
        )
        .expect("合法行");
        assert_eq!(ev.event.session_id, "s-1", "sessionId 应 trim");
        assert_eq!(ev.event.title.as_deref(), Some("修复登录"));
        assert_eq!(ev.body.as_deref(), Some("demo · 会话 xxxxxxxx"));

        // title/body 缺省 / null / 非字符串 → None 化（不拒行）。
        let ev = parse_watcher_line(r#"{"type":"turn-end","sessionId":"s"}"#).unwrap();
        assert_eq!((ev.event.title, ev.body), (None, None));
        let ev = parse_watcher_line(r#"{"type":"turn-end","sessionId":"s","title":null,"body":123}"#).unwrap();
        assert_eq!((ev.event.title, ev.body), (None, None));

        // 拒收面：畸形 JSON / 非 turn-end / sessionId 非法。
        for bad in [
            "",
            "not json",
            "{",
            r#"{"type":"ready"}"#,
            r#"{"type":"log","msg":"x"}"#,
            r#"{"type":"turn-end"}"#,
            r#"{"type":"turn-end","sessionId":123}"#,
            r#"{"type":"turn-end","sessionId":null}"#,
            r#"{"type":"turn-end","sessionId":"  "}"#,
        ] {
            assert!(parse_watcher_line(bad).is_none(), "应拒收：{bad}");
        }
        let long = "x".repeat(257);
        assert!(parse_watcher_line(&format!(r#"{{"type":"turn-end","sessionId":"{long}"}}"#)).is_none());
    }

    #[test]
    fn capped_reader_lines_crlf_eof_halfline() {
        let mut c = Cursor::new(b"line1\r\nline2\n".to_vec());
        assert_eq!(read_capped_line(&mut c, 64).unwrap(), LineOutcome::Line("line1".into()), "CRLF 行尾 \\r 应剥");
        assert_eq!(read_capped_line(&mut c, 64).unwrap(), LineOutcome::Line("line2".into()));
        assert_eq!(read_capped_line(&mut c, 64).unwrap(), LineOutcome::Eof);

        // 半行（无换行即 EOF）：按行返回，交解析层拒收。
        let mut c = Cursor::new(b"{\"type\":\"turn-e".to_vec());
        assert_eq!(read_capped_line(&mut c, 64).unwrap(), LineOutcome::Line("{\"type\":\"turn-e".into()));
        assert_eq!(read_capped_line(&mut c, 64).unwrap(), LineOutcome::Eof);

        // 空行。
        let mut c = Cursor::new(b"\n\n".to_vec());
        assert_eq!(read_capped_line(&mut c, 64).unwrap(), LineOutcome::Line(String::new()));
        assert_eq!(read_capped_line(&mut c, 64).unwrap(), LineOutcome::Line(String::new()));
        assert_eq!(read_capped_line(&mut c, 64).unwrap(), LineOutcome::Eof);
    }

    /// 超大行：整行流式丢弃，后续正常行不受影响（内存不随对端行长增长）。
    #[test]
    fn capped_reader_drops_oversized_and_recovers() {
        let big = "x".repeat(300);
        let mut stream = Vec::new();
        stream.extend_from_slice(big.as_bytes());
        stream.push(b'\n');
        stream.extend_from_slice(br#"{"type":"turn-end","sessionId":"ok"}"#);
        stream.push(b'\n');
        let mut c = Cursor::new(stream);
        assert_eq!(read_capped_line(&mut c, 64).unwrap(), LineOutcome::Oversized);
        let line = match read_capped_line(&mut c, 64).unwrap() {
            LineOutcome::Line(l) => l,
            o => panic!("超大行后应恢复读行：{o:?}"),
        };
        assert!(parse_watcher_line(&line).is_some(), "恢复后的合法行可解析");
    }
}

/// 回合活动计数（issue #159 内核「忙碌」判定源）：parse/apply 纯函数。
#[cfg(test)]
mod turn_activity_tests {
    use super::*;

    fn reset_active_turns() {
        ACTIVE_TURNS.store(0, Ordering::Relaxed);
    }

    #[test]
    fn parse_turn_activity_shapes() {
        assert_eq!(
            parse_turn_activity(r#"{"type":"turn-start","sessionId":"s","count":2}"#),
            Some(TurnActivity::Start(2))
        );
        assert_eq!(
            parse_turn_activity(r#"{"type":"turn-start","sessionId":"s"}"#),
            Some(TurnActivity::Start(1)),
            "缺 count 的 turn-start 按 1 计"
        );
        assert_eq!(
            parse_turn_activity(r#"{"type":"turn-end","sessionId":"s","count":1}"#),
            Some(TurnActivity::End(1))
        );
        assert_eq!(
            parse_turn_activity(r#"{"type":"turn-end","sessionId":"s"}"#),
            Some(TurnActivity::End(0)),
            "缺 count 的 turn-end 是兜底通知，不减"
        );
        assert_eq!(
            parse_turn_activity(r#"{"type":"turn-end","sessionId":"s","title":"t","body":"b"}"#),
            Some(TurnActivity::End(0))
        );
        for bad in ["", "not json", "{", r#"{"type":"ready"}"#, r#"{"type":"log"}"#] {
            assert_eq!(parse_turn_activity(bad), None, "应拒收：{bad}");
        }
    }

    #[test]
    fn apply_turn_activity_balances_and_saturates() {
        reset_active_turns();
        apply_turn_activity(TurnActivity::Start(2));
        assert_eq!(active_turns(), 2);
        apply_turn_activity(TurnActivity::End(1));
        assert_eq!(active_turns(), 1);
        apply_turn_activity(TurnActivity::End(5));
        assert_eq!(active_turns(), 0, "saturating 不到负");
        apply_turn_activity(TurnActivity::Start(1));
        apply_turn_activity(TurnActivity::End(0));
        assert_eq!(active_turns(), 1, "End(0) 不减");
        reset_active_turns();
    }

    #[test]
    fn parse_approval_asked_shapes() {
        assert_eq!(
            parse_approval_asked(r#"{"type":"approval-asked","sessionId":"s-1"}"#),
            Some("s-1".to_string())
        );
        assert_eq!(
            parse_approval_asked(r#"{"type":"approval-asked","sessionId":"  s-1  "}"#),
            Some("s-1".to_string()),
            "sessionId trim"
        );
        for bad in [
            "",
            "not json",
            "{",
            r#"{"type":"turn-end","sessionId":"s"}"#,
            r#"{"type":"approval-asked"}"#,
            r#"{"type":"approval-asked","sessionId":123}"#,
            r#"{"type":"approval-asked","sessionId":"  "}"#,
        ] {
            assert_eq!(parse_approval_asked(bad), None, "应拒收：{bad}");
        }
    }
}

/// 形态锚点（接线不漂移）：事件名/挂点/镜像对齐。
#[cfg(test)]
mod shape_tests {
    use super::*;

    /// 垫片监听串（bridge-shim.js dist 产物，含 CRLF 归一后比对）。
    fn shim() -> String {
        include_str!("../../../crates/bridge/dist/bridge-shim.js").replace("\r\n", "\n")
    }

    /// 事件名/载荷逐字对齐垫片监听（bridge-shim.js:78 一带）。
    #[test]
    fn jump_event_name_and_payload_match_shim() {
        assert_eq!(JUMP_EVENT, "notification-jump");
        let s = shim();
        assert!(
            s.contains("onEvent('notification-jump', listeners.jump"),
            "垫片必须监听 {JUMP_EVENT}: 见 bridge-shim.js onEvent 段"
        );
        // 载荷字段：垫片读 p.sessionId（trim + ≤256 校验），Rust 侧 emit 同字段。
        assert!(
            s.contains("typeof p.sessionId === 'string' ? p.sessionId.trim() : ''"),
            "垫片载荷校验串"
        );
        assert!(s.contains("id.length <= 256"), "垫片 256 长度校验");
    }

    /// lib.rs 接线形态：模块声明 / KernelReady 启动 / 聚焦路由 / 退出收割。
    #[test]
    fn lib_wiring_shape() {
        let src = include_str!("lib.rs").replace("\r\n", "\n");
        assert!(src.contains("mod session_notify;"), "模块声明");
        assert!(
            src.contains("session_notify::start_watcher(app.clone())"),
            "KernelReady 后启动监视线（Electron main.js:6337 同点位）"
        );
        assert!(
            src.contains("session_notify::on_main_window_focused("),
            "主窗聚焦事件必须路由到跳转兜底"
        );
        assert!(
            src.contains("session_notify::shutdown_watcher();"),
            "退出路径必须收割 watcher 子进程"
        );
        // 聚焦路由限定主窗（浮窗/宠物窗聚焦不得触发跳转）。
        let seg = src
            .split("on_window_event(|window, event|")
            .nth(1)
            .and_then(|s| s.split("});").next())
            .expect("on_window_event 接线段");
        assert!(seg.contains("\"main\""), "事件源须限定主窗 label: {seg}");
        assert!(seg.contains("Focused(true)"), "只消费获得焦点事件: {seg}");
    }

    /// C2 挂点形态：turn-end 处理首行（trigger_fetch 之前无通知门）。
    #[test]
    fn c2_hook_shape() {
        let src = include_str!("session_notify.rs").replace("\r\n", "\n");
        let seg = src
            .split("fn handle_turn_end")
            .nth(1)
            .and_then(|s| s.split("fn notify_gates").next())
            .expect("handle_turn_end 函数体");
        let hook = seg.find("balance::trigger_fetch").expect("C2 挂点调用");
        // C2 先于 quitting/门/限流（Electron main.js:2642 同序）。
        for gate in ["QUITTING.load", "should_notify(", ".decide("] {
            let pos = seg.find(gate).unwrap_or(usize::MAX);
            assert!(hook < pos, "trigger_fetch 必须先于 {gate}");
        }
        // balance.rs 挂点注释（文档级锚点）：trigger_fetch 的文档必须标注
        // C2（turn-end 消费方——session_notify::handle_turn_end 首行调用）。
        let balance = include_str!("commands/balance.rs").replace("\r\n", "\n");
        let doc = balance
            .split("pub fn trigger_fetch")
            .next()
            .unwrap_or_default();
        assert!(
            doc.contains("C2") && doc.contains("turn-end"),
            "trigger_fetch 文档必须标注 C2 挂点与 turn-end 消费方"
        );
    }

    /// 任务栏闪烁接入形态：handle_turn_end 总裁决分支内、限流之后、与通知
    /// 发射同分支请求主窗注意力（should_notify 已含 !focused → 未聚焦才闪）；
    /// 封装函数拿主窗 + Informational（Windows 任务栏图标闪烁）+ 失败静默。
    #[test]
    fn taskbar_attention_wiring_shape() {
        let src = include_str!("session_notify.rs").replace("\r\n", "\n");

        // 封装函数形态（位于 notify_gates 之后 / fire_notification 之前）。
        let helper = src
            .split("fn request_main_window_attention")
            .nth(1)
            .and_then(|s| s.split("fn fire_notification").next())
            .expect("request_main_window_attention 函数体");
        assert!(helper.contains("get_webview_window(\"main\")"), "必须拿主窗");
        assert!(helper.contains("request_user_attention"), "必须调用 request_user_attention");
        assert!(helper.contains("UserAttentionType::Informational"), "Informational（任务栏图标闪烁）");
        assert!(helper.contains("let _ ="), "失败静默不 panic");

        // handle_turn_end：注意力请求在限流之后、通知发射之前（同一总裁决分支）。
        let seg = src
            .split("fn handle_turn_end")
            .nth(1)
            .and_then(|s| s.split("fn notify_gates").next())
            .expect("handle_turn_end 函数体");
        let throttle = seg.find(".decide(").expect("限流");
        let att = seg.find("request_main_window_attention").expect("注意力请求");
        let fire = seg.find("fire_notification").expect("通知发射");
        assert!(throttle < att, "注意力请求必须在限流之后（同一门控）");
        assert!(att < fire, "注意力请求先于通知发射（同分支）");
    }

    /// watcher 子进程 spawn 形态：抑制终端窗 + 行协议参数 + payload 脚本名。
    #[test]
    fn watcher_spawn_shape() {
        let src = include_str!("session_notify.rs").replace("\r\n", "\n");
        let seg = src
            .split("fn spawn_watcher_process")
            .nth(1)
            .and_then(|s| s.split("\n}").next())
            .expect("spawn_watcher_process 函数体");
        assert!(seg.contains(".creation_flags_no_window()"), "GUI 起 console 子进程必须抑制终端窗: {seg}");
        assert!(seg.contains("--sessions-dir"), "CLI 协议参数: {seg}");
        assert!(
            src.contains("join(\"session-watcher.js\")"),
            "payload 脚本必须是 dsh-desktop 根级 session-watcher.js（stage-payload 根级 *.js 镜像）"
        );
    }

    /// payload 脚本 CLI 形态（Electron require 路径零变化 + 行协议标记）。
    #[test]
    fn payload_cli_shape() {
        let js = include_str!("../../../../../dsh-desktop/session-watcher.js").replace("\r\n", "\n");
        assert!(js.contains("require.main === module"), "CLI 模式守卫（Electron require 不受影响）");
        assert!(js.contains("--sessions-dir"), "sessions 目录参数");
        assert!(js.contains("'turn-end'"), "行协议 type 标记");
        assert!(js.contains("process.stdin.resume()"), "stdin 保活（防孤儿）");
        // Electron 侧接口零回归：导出面不变。
        assert!(js.contains("module.exports = { SessionWatcher, scanZstdFrames, expandRow }"));
    }

    /// 分发链形态：stage-payload.sh 根级 *.js 镜像覆盖 session-watcher.js。
    #[test]
    fn stage_payload_mirrors_watcher_script() {
        let sh = include_str!("../../../../scripts/stage-payload.sh").replace("\r\n", "\n");
        assert!(
            sh.contains("\"$SRC\"/*.js"),
            "根级 *.js 全量镜像（session-watcher.js 随包分发依赖此行）"
        );
    }
}

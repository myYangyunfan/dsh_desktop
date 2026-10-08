//! TA3 链路集成测试：通知链管线（watcher 输出行序列 → 通知发射序列）。
//!
//! 手法说明（与 session_notify_boundary.rs 同款）：生产源
//! `src/session_notify.rs` 经 `#[path]` **只读编入**本测试 crate（字节一致
//! = 测的就是生产实现），为其中 `crate::` 引用提供最小垫片。管线驱动走
//! 真实组件：`parse_watcher_line`（pub(crate)）逐行解析、`NotifyThrottle`
//! 真限流、`should_notify` 真三门裁决；`handle_turn_end` 私有且其通知发射
//! 路径依赖 AppHandle + OS toast（mock runtime 类型不匹配 Wry AppHandle，
//! 无法安全驱动），故按 handle_turn_end 的**同序编排**（C2 先于门 → 门开
//! 才咨询限流 → 总裁决才发射；PENDING_JUMP 仅在通知成功后写）以桩注入的
//! 门输入构造管线 harness，PENDING_JUMP 的消费侧（take/新鲜度/ID 校验序）
//! 以源码切片锚点断言（boundary 同款手法），不复制实现逻辑。

#![allow(dead_code)]

// N1 的实现源，只读编入（字节一致，非复制粘贴）。
#[path = "../src/session_notify.rs"]
mod session_notify_live;

use session_notify_live::{
    parse_watcher_line, should_notify, valid_jump_session_id, NotifyThrottle, TurnEndEvent,
    JUMP_FRESHNESS_MS, MAX_SESSION_ID_LEN, SESSION_THROTTLE_MS, GLOBAL_THROTTLE_MS,
};

// ---------------------------------------------------------------------------
// session_notify.rs 内 `crate::` 引用的最小垫片（仅满足编译，不参与断言）
// ---------------------------------------------------------------------------

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
// 管线 harness：watcher stdout 行序列 → 通知发射序列（组件全真，门输入桩注入）
// ---------------------------------------------------------------------------

/// 单条 watcher 输出事件：协议行原文 + 合成时刻（ms）+ 该时刻的门状态
/// （notifyOnTurnEnd 开关 / 主窗聚焦态 / 聚焦态下正在观看的会话）。
struct ScriptedLine {
    line: &'static str,
    at_ms: u128,
    enabled: bool,
    focused: bool,
    current: Option<&'static str>,
}

/// 以 handle_turn_end 的同序编排驱动真实组件，返回逐行结果
/// （解析出的事件、门开否、限流放行否、通知发射否）。
struct StepResult {
    parsed: Option<TurnEndEvent>,
    gates_open: bool,
    throttle_ok: bool,
    notified: bool,
}

fn run_pipeline(lines: &[ScriptedLine]) -> (Vec<StepResult>, Vec<(String, u128)>) {
    let mut throttle = NotifyThrottle::new();
    let mut steps = Vec::new();
    let mut fired: Vec<(String, u128)> = Vec::new();
    for sl in lines {
        let parsed = parse_watcher_line(sl.line).map(|tl| tl.event);
        let Some(ev) = &parsed else {
            // 畸形/非 turn-end 行整行丢弃：无门、无限流、无通知（不消耗额度）。
            steps.push(StepResult { parsed: None, gates_open: false, throttle_ok: false, notified: false });
            continue;
        };
        // 门（handle_turn_end 序）：enabled → focused → is_current（仅聚焦态可达）。
        let is_current = sl.focused && sl.current == Some(ev.session_id.as_str());
        let gates_open = should_notify(sl.enabled, sl.focused, is_current, true);
        // 限流后置：门未开不咨询（被拦截事件不消耗额度——Electron 同序）。
        let throttle_ok = gates_open && throttle.decide(&ev.session_id, sl.at_ms);
        let notified = should_notify(sl.enabled, sl.focused, is_current, throttle_ok);
        if notified {
            fired.push((ev.session_id.clone(), sl.at_ms));
        }
        steps.push(StepResult { parsed: Some(ev.clone()), gates_open, throttle_ok, notified });
    }
    (steps, fired)
}

fn line(sid: &str, title: &str) -> String {
    format!(r#"{{"type":"turn-end","sessionId":"{sid}","title":"{title}","body":"demo · 会话 {sid}"}}"#)
}

/// 管线主场景：多会话交错 × turn-end × 限流窗 × 聚焦态翻转 × 开关切换。
/// 期望的通知发射序列（30s/会话 + 15s 全局，门拦截不消耗额度）。
#[test]
fn pipeline_multi_session_interleaved_throttle_focus_toggle() {
    let la = line("sess-A", "修复登录");
    let lb = line("sess-B", "编译收尾");
    let la2 = line("sess-A", "回归验证");
    let lc = line("sess-C", "长任务完成");
    let lines: Vec<ScriptedLine> = vec![
        // t=0：A 后台完成（未聚焦、开关开）→ 通知 #1（A）。
        ScriptedLine { line: leak(&la), at_ms: 0, enabled: true, focused: false, current: None },
        // t=1000：B 完成，全局 15s 窗内 → 拦截（不消耗 B 的会话额度）。
        ScriptedLine { line: leak(&lb), at_ms: 1_000, enabled: true, focused: false, current: None },
        // t=2000：A 完成，会话 30s 窗内 → 拦截（不刷新全局窗）。
        ScriptedLine { line: leak(&la2), at_ms: 2_000, enabled: true, focused: false, current: None },
        // t=15000：B 完成，全局恰 15s 过 → 通知 #2（B；此前拦截未消耗额度）。
        ScriptedLine { line: leak(&lb), at_ms: 15_000, enabled: true, focused: false, current: None },
        // t=16000：主窗聚焦中 C 完成 → 聚焦门拦截（不咨询限流）。
        ScriptedLine { line: leak(&lc), at_ms: 16_000, enabled: true, focused: true, current: None },
        // t=17000：聚焦且正在看 A，A 完成 → is_current 门拦截。
        ScriptedLine { line: leak(&la), at_ms: 17_000, enabled: true, focused: true, current: Some("sess-A") },
        // t=20000：开关关闭（notifyOnTurnEnd=false），C 完成 → 全抑制。
        ScriptedLine { line: leak(&lc), at_ms: 20_000, enabled: false, focused: false, current: None },
        // t=31000：开关恢复，C 完成：全局窗 31000-15000=16s ≥ 15s、C 无会话史 → 通知 #3（C）。
        ScriptedLine { line: leak(&lc), at_ms: 31_000, enabled: true, focused: false, current: None },
        // t=32000：A 完成：会话窗 32s ≥ 30s，但全局 32000-31000=1s < 15s → 拦截。
        ScriptedLine { line: leak(&la), at_ms: 32_000, enabled: true, focused: false, current: None },
        // t=46000：A：会话 46s ≥ 30s、全局 15s 恰过 → 通知 #4（A）。
        ScriptedLine { line: leak(&la2), at_ms: 46_000, enabled: true, focused: false, current: None },
    ];
    let (steps, fired) = run_pipeline(&lines);
    // 发射序列 oracle：恰 4 条，序 A → B → C → A。
    let seq: Vec<&str> = fired.iter().map(|(sid, _)| sid.as_str()).collect();
    assert_eq!(seq, vec!["sess-A", "sess-B", "sess-C", "sess-A"], "通知发射序列：{fired:?}");
    assert_eq!(fired[0].1, 0);
    assert_eq!(fired[3].1, 46_000);
    // 被门拦截的行（聚焦/is_current/开关）不得咨询限流。
    assert!(!steps[4].gates_open && !steps[4].throttle_ok, "聚焦门拦截不咨询限流");
    assert!(!steps[5].gates_open, "is_current 门拦截");
    assert!(!steps[6].gates_open && steps[6].parsed.is_some(), "开关关闭全抑制");
    // 限流拦截的行（全局/会话窗）门开但 throttle_ok=false。
    assert!(steps[1].gates_open && !steps[1].throttle_ok, "全局窗拦截");
    assert!(steps[2].gates_open && !steps[2].throttle_ok, "会话窗拦截");
    assert!(steps[8].gates_open && !steps[8].throttle_ok, "第二次全局窗拦截（C 刚写全局戳）");
    // 发射的行必须四门全过。
    for i in [0usize, 3, 7, 9] {
        assert!(steps[i].gates_open && steps[i].throttle_ok && steps[i].notified, "step#{i} 应发射");
    }
}

/// 泳道噪音：watcher 输出混入畸形行 / 非 turn-end / 非法 sessionId ——
/// 整行丢弃，不中断管线，不消耗限流额度。
#[test]
fn pipeline_malformed_lines_dropped_without_quota_cost() {
    let lx = line("sess-X", "t");
    let lines: Vec<ScriptedLine> = vec![
        ScriptedLine { line: "not json", at_ms: 0, enabled: true, focused: false, current: None },
        ScriptedLine { line: r#"{"type":"log","msg":"noise"}"#, at_ms: 1_000, enabled: true, focused: false, current: None },
        ScriptedLine { line: r#"{"type":"turn-end","sessionId":"   "}"#, at_ms: 2_000, enabled: true, focused: false, current: None },
        ScriptedLine { line: r#"{"type":"turn-end","sessionId":123}"#, at_ms: 3_000, enabled: true, focused: false, current: None },
        // 畸形行后紧邻合法行：立刻放行（畸形行未触碰限流器）。
        ScriptedLine { line: leak(&lx), at_ms: 3_001, enabled: true, focused: false, current: None },
    ];
    let (steps, fired) = run_pipeline(&lines);
    assert_eq!(fired.len(), 1, "只有 sess-X 发射：{fired:?}");
    assert_eq!(fired[0].0, "sess-X");
    for s in &steps[..4] {
        assert!(s.parsed.is_none(), "畸形行必须整行丢弃");
    }
    // 限流器仅被合法行写戳：紧接着的第二条合法行在 30s 窗内拦截。
    let lines2: Vec<ScriptedLine> = vec![
        ScriptedLine { line: leak(&lx), at_ms: 10_000, enabled: true, focused: false, current: None },
        ScriptedLine { line: leak(&lx), at_ms: 12_000, enabled: true, focused: false, current: None },
    ];
    let (_, fired2) = run_pipeline(&lines2);
    assert_eq!(fired2.len(), 1, "30s 会话窗拦截重复会话");
}

/// PENDING_JUMP 行为——写入面经管线 oracle（fire 后才写）、消费面以
/// on_main_window_focused 的源码切片锚点断言（take → 新鲜度窗 → ID 校验 →
/// emit 序，boundary 同款手法；私有 static 与 AppHandle 路径不可注入）。
#[test]
fn pending_jump_write_and_consume_semantics() {
    // 写入面：通知发射的会话即 PENDING_JUMP 候选；被拦截的通知不写。
    let la = line("sess-J", "跳转目标");
    let lb = line("sess-K", "被拦截者");
    let lines: Vec<ScriptedLine> = vec![
        ScriptedLine { line: leak(&lb), at_ms: 0, enabled: true, focused: true, current: None }, // 聚焦拦截 → 不写
        ScriptedLine { line: leak(&la), at_ms: 20_000, enabled: true, focused: false, current: None }, // 发射 → 写 sess-J
        ScriptedLine { line: leak(&lb), at_ms: 40_000, enabled: false, focused: false, current: None }, // 开关拦截 → 不写
    ];
    let (_, fired) = run_pipeline(&lines);
    assert_eq!(fired.len(), 1, "仅 sess-J 发射（其时间戳即 PENDING_JUMP 写入值）");
    assert_eq!(fired[0].0, "sess-J");
    assert_eq!(fired[0].1, 20_000);
    // 跳转目标合法性（消费面校验函数，真组件）。
    assert!(valid_jump_session_id("sess-J"));
    assert!(!valid_jump_session_id(""));
    assert!(!valid_jump_session_id(&"x".repeat(MAX_SESSION_ID_LEN + 1)));
    // 新鲜度窗常量锚点。
    assert_eq!(JUMP_FRESHNESS_MS, 60_000);
    assert_eq!((SESSION_THROTTLE_MS, GLOBAL_THROTTLE_MS), (30_000, 15_000));

    // 消费序形态锚点：on_main_window_focused 必须 take（一次性）→ 新鲜度窗
    // （> 60s 作废）→ ID 校验 → 定向 emit_to(main)。源码切片防漂移。
    let src = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "\\src\\session_notify.rs"
    ))
    .unwrap()
    .replace("\r\n", "\n");
    let seg = src
        .split("pub fn on_main_window_focused")
        .nth(1)
        .and_then(|s| s.split("pub fn shutdown_watcher").next())
        .expect("on_main_window_focused 函数体");
    let take = seg.find(".take()").expect("一次性 take");
    let fresh = seg.find("JUMP_FRESHNESS_MS").expect("新鲜度窗判定");
    let valid = seg.find("valid_jump_session_id").expect("ID 校验");
    let emit = seg.find("emit_to").expect("定向 emit");
    assert!(take < fresh, "先 take 再判新鲜度（陈旧目标直接作废且已消费）");
    assert!(fresh < valid, "新鲜度先于 ID 校验");
    assert!(valid < emit, "ID 校验先于 emit");
    // 写入面形态锚点：fire_notification 成功分支才写 PENDING_JUMP。
    let fire = src
        .split("fn fire_notification")
        .nth(1)
        .and_then(|s| s.split("pub fn on_main_window_focused").next())
        .expect("fire_notification 函数体");
    let ok_branch = fire.find("Ok(())").expect("通知成功分支");
    let jump_write = fire.find("PENDING_JUMP").expect("成功分支写 PENDING_JUMP");
    assert!(ok_branch < jump_write, "PENDING_JUMP 只在通知上屏后写");
}

/// 管线编排形态锚点：handle_turn_end 的「quitting → 门 → 限流 → 发射」顺序。
/// 原首行的 C2 余额挂点（trigger_fetch_throttled）已随 Electron 余额遗留线
/// 整体退役（contracts/ipc-commands.md §2.4），此处改为反向断言：首行必须是
/// quitting 旗标，且不得再出现余额触发（复活即红）。
#[test]
fn handle_turn_end_ordering_shape() {
    let src = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "\\src\\session_notify.rs"
    ))
    .unwrap()
    .replace("\r\n", "\n");
    let seg = src
        .split("fn handle_turn_end")
        .nth(1)
        .and_then(|s| s.split("fn notify_gates").next())
        .expect("handle_turn_end 函数体");
    assert!(
        !seg.contains("trigger_fetch") && !seg.contains("balance::"),
        "C2 余额挂点已退役，不得复活: {seg}"
    );
    let quitting = seg.find("QUITTING.load").expect("quitting 旗标");
    let gates = seg.find("should_notify").expect("门");
    let throttle = seg.find(".decide(").expect("限流");
    let fire = seg.find("fire_notification").expect("通知发射");
    assert!(quitting < gates && gates < throttle && throttle < fire,
        "handle_turn_end 序：quitting → 门 → 限流 → 发射（C2 已退役，quitting 为首道）");
}

/// Box::leak 让 &str 变 'static（脚本行构造便利；测试进程生命周期无碍）。
fn leak(s: &str) -> &'static str {
    Box::leak(s.to_string().into_boxed_str())
}

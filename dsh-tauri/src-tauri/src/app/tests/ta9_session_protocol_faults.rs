//! TA9 混沌测试 —— 进程异常 × watcher 行协议层容错（session_notify）。
//!
//! 只读编入实现源（与 session_notify_boundary.rs 同手法 + 同款最小垫片）。
//! 模拟「session-watcher CLI 子进程 stdout 被写坏」的三种形态：
//!   1. 二进制垃圾行（非法 UTF-8 / NUL / 非 JSON）；
//!   2. 无换行巨串（超 CAP=8KB，流式丢弃不驻留内存）；
//!   3. 流早断（stdin 立即关闭 → EOF 处的半行按 Line 返回交解析层拒收）。
//! 铁律：行协议层永不 panic、永不错误采纳畸形行；垃圾行后的合法行必须照常解析。

#![allow(dead_code)]

// N1 的实现源，只读编入（字节一致，非复制粘贴）。
#[path = "../src/session_notify.rs"]
mod session_notify_live;

use session_notify_live::{parse_watcher_line, read_capped_line, LineOutcome};
// CAP 是实现文件私有 const（8*1024，行协议上限），此处用同值
// 字面量驱动（read_capped_line 的 cap 是参数，行为断言不受影响）。
const CAP: usize = 8 * 1024;
// ---------------------------------------------------------------------------
// session_notify.rs 内 `crate::` 引用的最小垫片（仅满足编译；同边界测试文件）
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
    pub trait NoWindow {
        fn creation_flags_no_window(&mut self) -> &mut Self;
    }
    #[cfg(windows)]
    impl NoWindow for std::process::Command {
        fn creation_flags_no_window(&mut self) -> &mut Self {
            use std::os::windows::process::CommandExt;
            self.creation_flags(0x0800_0000);
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
// 1. 二进制垃圾行
// ---------------------------------------------------------------------------

#[test]
fn binary_garbage_line_is_lossy_decoded_then_rejected_by_parser() {
    // 0xFF/0x00 等非法 UTF-8 + NUL + 换行：读层 lossy 容错不炸。
    let garbage: &[u8] = &[0xFF, 0xFE, 0x00, 0x81, 0xBC, b'\n'];
    let mut r = garbage;
    match read_capped_line(&mut r, CAP).unwrap() {
        LineOutcome::Line(s) => {
            assert!(s.contains('\u{FFFD}'), "非法字节按 U+FFFD 替换：{s:?}");
            assert!(s.contains('\0'), "NUL 按普通字节容忍在行内（不截断）：{s:?}");
        }
        other => panic!("垃圾行应按 Line 返回（交解析层拒收），得 {other:?}"),
    }
    // 解析层拒收（lossy 后必然不是合法 turn-end JSON）。
    let mut r2 = garbage;
    if let LineOutcome::Line(s) = read_capped_line(&mut r2, CAP).unwrap() {
        assert!(parse_watcher_line(&s).is_none(), "垃圾行不得被采纳");
    }
}

#[test]
fn garbage_lines_do_not_poison_following_valid_line() {
    let valid = br#"{"type":"turn-end","sessionId":"sess-ok","title":"T","body":"B"}"#;
    let mut stream: Vec<u8> = Vec::new();
    stream.extend_from_slice(&[0xFF, 0x00, 0x80, b'\n']); // 垃圾行 1
    stream.extend_from_slice(b"not json at all\n"); // 垃圾行 2（合法 UTF-8 非 JSON）
    stream.extend_from_slice(valid); // 合法行
    stream.push(b'\n');
    let mut r: &[u8] = &stream;
    let mut parsed = 0;
    loop {
        match read_capped_line(&mut r, CAP).unwrap() {
            LineOutcome::Line(s) => {
                if let Some(ev) = parse_watcher_line(&s) {
                    assert_eq!(ev.event.session_id, "sess-ok");
                    parsed += 1;
                }
            }
            LineOutcome::Oversized => {}
            LineOutcome::Eof => break,
        }
    }
    assert_eq!(parsed, 1, "两条垃圾行后的合法行必须照常解析（垃圾不毒化流）");
}

// ---------------------------------------------------------------------------
// 2. 无换行巨串（超 cap 流式丢弃）
// ---------------------------------------------------------------------------

#[test]
fn oversized_line_without_newline_is_dropped_and_stream_survives() {
    let mut stream: Vec<u8> = Vec::new();
    stream.extend(std::iter::repeat(b'A').take(CAP * 4)); // 巨串无换行
    stream.push(b'\n');
    stream.extend_from_slice(br#"{"type":"turn-end","sessionId":"after-big","title":null,"body":null}"#);
    stream.push(b'\n');
    let mut r: &[u8] = &stream;
    assert!(matches!(read_capped_line(&mut r, CAP).unwrap(), LineOutcome::Oversized), "巨串整行丢弃");
    // 流继续可用：下一行（合法协议行）正常返回并被解析。
    match read_capped_line(&mut r, CAP).unwrap() {
        LineOutcome::Line(s) => assert!(parse_watcher_line(&s).is_some(), "巨串后的合法行照常解析"),
        other => panic!("巨串后流应继续：{other:?}"),
    }
    assert!(matches!(read_capped_line(&mut r, CAP).unwrap(), LineOutcome::Eof));
}

#[test]
fn oversized_streaming_does_not_buffer_whole_line() {
    // 4MB 连续无换行垃圾 + EOF：丢弃模式不驻留（读层按 cap 截断后 clear）。
    let big = vec![b'Z'; 4 * 1024 * 1024];
    let mut r: &[u8] = &big;
    assert!(matches!(read_capped_line(&mut r, CAP).unwrap(), LineOutcome::Oversized));
    // 全量消费完毕（EOF 已到），读层没有为 4MB 分配驻留（行为断言：立即返回 Oversized）。
}

// ---------------------------------------------------------------------------
// 3. 流早断（stdin 立即关闭 → EOF 半行拒收）
// ---------------------------------------------------------------------------

#[test]
fn eof_half_line_returned_then_rejected_by_parser() {
    // 半行 JSON（进程被 kill 于写出中途的形态）。
    let half = br#"{"type":"turn-end","sessionId":"abc"#;
    let mut r: &[u8] = half;
    match read_capped_line(&mut r, CAP).unwrap() {
        LineOutcome::Line(s) => {
            assert!(parse_watcher_line(&s).is_none(), "半行 JSON 必须拒收（不得部分采纳）");
        }
        other => panic!("EOF 半行应按 Line 返回交解析层裁决，得 {other:?}"),
    }
    assert!(matches!(read_capped_line(&mut r, CAP).unwrap(), LineOutcome::Eof), "流已尽");
}

#[test]
fn empty_stream_immediate_eof() {
    let mut r: &[u8] = b"";
    assert!(matches!(read_capped_line(&mut r, CAP).unwrap(), LineOutcome::Eof));
    // stdin 立即关闭等价：零字节 → Eof，无 panic。
}

// ---------------------------------------------------------------------------
// 4. 畸形协议行矩阵（解析层）
// ---------------------------------------------------------------------------

#[test]
fn parse_watcher_line_adversarial_matrix() {
    assert!(parse_watcher_line("").is_none(), "空行");
    assert!(parse_watcher_line("   ").is_none(), "空白行");
    assert!(parse_watcher_line("\u{0}\u{1}\u{2}").is_none(), "控制字符");
    assert!(parse_watcher_line("null").is_none(), "JSON null");
    assert!(parse_watcher_line("123").is_none(), "数字");
    assert!(parse_watcher_line(r#""string""#).is_none(), "字符串");
    assert!(parse_watcher_line("[]").is_none(), "数组");
    assert!(parse_watcher_line(r#"{"type":"turn-start"}"#).is_none(), "非 turn-end");
    assert!(parse_watcher_line(r#"{"type":"turn-end"}"#).is_none(), "缺 sessionId");
    assert!(parse_watcher_line(r#"{"type":"turn-end","sessionId":123}"#).is_none(), "sessionId 非字符串");
    assert!(parse_watcher_line(r#"{"type":"turn-end","sessionId":""}"#).is_none(), "sessionId 空");
    assert!(parse_watcher_line(&format!(r#"{{"type":"turn-end","sessionId":"{}"}}"#, "x".repeat(257))).is_none(), "sessionId 超长");
    // title/body 非字符串按缺省处理（不炸、不误采纳）。
    let ok = parse_watcher_line(r#"{"type":"turn-end","sessionId":"s","title":42,"body":[1]}"#).unwrap();
    assert_eq!(ok.event.title, None);
    assert_eq!(ok.body, None);
    // CRLF 容错。
    assert!(parse_watcher_line("{\"type\":\"turn-end\",\"sessionId\":\"crlf\"}\r\n").is_some());
    // 合法行仍通过（对照组）。
    assert!(parse_watcher_line(r#"{"type":"turn-end","sessionId":"good","title":"t","body":"b"}"#).is_some());
}

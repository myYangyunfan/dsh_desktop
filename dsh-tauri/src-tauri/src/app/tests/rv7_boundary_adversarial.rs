//! RV7 边界对抗审查：**解析面 malformed input 对抗**（只读审查配套测试）。
//!
//! 覆盖今日新增解析面里从集成测试可达的 pub 契约：
//! - `session_notify::valid_jump_session_id` / `restart_backoff_ms`（watcher
//!   行协议侧的会话 ID 校验——`parse_watcher_line`/`read_capped_line` 为
//!   `pub(crate)`，集成测试不可达，其对抗矩阵在 RV7 报告中以推演给出，
//!   仓内已有 line_protocol_tests 覆盖主体形态）。
//!
//! 注意：`commands::updater_client::cmp_semver` / `parse_release_doc` /
//! `resolve_outcome` 均在私有 `mod commands` 之后且非 lib 根 re-export，
//! 集成测试不可达——updater 对抗矩阵见 RV7 报告（结论：脏输入容错正确，
//! 巨数字段 u64 溢出按 0 计不 panic）。

use dsh_tauri_app::session_notify;

// ---------------------------------------------------------------------------
// 1. valid_jump_session_id：字节长度语义 / 控制字符 / 路径分隔符
// ---------------------------------------------------------------------------

#[test]
fn rv7_jump_session_id_byte_length_semantics() {
    // 长度按字节计：64 个 emoji = 256B 恰好放行；65 个 = 260B 拒。
    assert!(session_notify::valid_jump_session_id(&"📦".repeat(64)));
    assert!(!session_notify::valid_jump_session_id(&"📦".repeat(65)));
    // CJK 3B/char：85×3=255 放；86×3=258 拒。
    assert!(session_notify::valid_jump_session_id(&"汉".repeat(85)));
    assert!(!session_notify::valid_jump_session_id(&"汉".repeat(86)));
}

#[test]
fn rv7_jump_session_id_control_and_separator_chars_pass_contract() {
    // 契约只查 trim 非空 + ≤256：控制字符（含 NUL）与路径分隔符**不被拒**。
    // 这是可接受的设计（下游仅用于日志/JSON emit/内核跳转查询，serde_json
    // 会转义 NUL 为 \u0000，无注入面），但记录为 RV7 审查发现（见报告 P2）。
    assert!(session_notify::valid_jump_session_id("a\u{0}b"));
    assert!(session_notify::valid_jump_session_id("a/b\\c:d"));
    // 引号与巨串边界。
    assert!(session_notify::valid_jump_session_id("\"'`"));
    assert!(!session_notify::valid_jump_session_id(&"x".repeat(257)));
    // 全空白 trim 后为空 → 拒（含 emoji 间空白）。
    assert!(!session_notify::valid_jump_session_id("  \t\n "));
}

#[test]
fn rv7_restart_backoff_huge_restarts_do_not_overflow() {
    // 对抗：退避计数被灌到 u32 极值不得移位溢出 panic。
    assert_eq!(session_notify::restart_backoff_ms(u32::MAX), 60_000);
    assert_eq!(session_notify::restart_backoff_ms(0), 1_000);
}

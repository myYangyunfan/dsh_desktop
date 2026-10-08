//! TA4 回归锁定（形态级）两件套——修复中无法行为级注入的两处。
//!
//! 【为何形态而非行为】
//! · updater `sweep_stale_update_dirs`：私有 fn + `std::env::temp_dir()` +
//!   `modified()` 系统时钟均不可注入。
//! · lib.rs `suppressible`：私有纯函数（lib.rs 单测已锁窗口表，此处补
//!   窗口×URL 联合矩阵的形态面）。
//!
//! 一旦对应实现改为可注入（时钟参数 / pub mod），应升级为行为级测试。
//!
//! （原「balance turn-end 30s 节流 × 四路交互」两例随 Electron 余额遗留线
//! 整体拆除，被测源 `commands/balance.rs` 已不存在，
//! 见 contracts/ipc-commands.md §2.4。）

const UPDATER_RS: &str = include_str!("../src/commands/updater_client.rs");
const LIB_RS: &str = include_str!("../src/lib.rs");

// ---------------------------------------------------------------------------
// U 线 V2 P2-2：下载临时目录 TTL 清扫边界
// ---------------------------------------------------------------------------

/// TTL 边界形态：24h 整【留】（严格 > 才删）、23h59m59s 留、24h00m01s 删；
/// 只清 `dsh-update-` 前缀目录；清扫失败 best-effort 不外溢。
#[test]
fn ttl_sweep_strict_boundary_shape() {
    let seg = UPDATER_RS
        .split("fn sweep_stale_update_dirs")
        .nth(1)
        .and_then(|s| s.split("// ---\n// 版本比较").next())
        .expect("sweep_stale_update_dirs 函数体");
    // TTL = 24h。
    assert!(seg.contains("Duration::from_secs(24 * 3600)"), "TTL 必须 24h: {seg}");
    // 严格大于：age 恰 24h（86400s 整）不删——`>` 而非 `>=`。
    assert!(seg.contains("age > TTL"), "严格 > 边界（恰 24h 整留、24h+1s 删; 23h59m59s 留）: {seg}");
    assert!(!seg.contains("age >= TTL"), "不得用 >=（会把恰 24h 的活跃目录误删）");
    // 前缀过滤：非 dsh-update-* 的 temp 目录绝不触碰。
    assert!(seg.contains(r#"starts_with("dsh-update-")"#), "只清 dsh-update- 前缀: {seg}");
    // best-effort：删除失败静默（不阻塞下载主链）。
    assert!(seg.contains("let _ = std::fs::remove_dir_all"), "删除 best-effort 静默: {seg}");
    // mtime 不可得的目录（metadata/modified 失败）→ is_some_and 短路 → 不删。
    assert!(seg.contains(".is_some_and(|age| age > TTL)"), "mtime 不可得按未过期处理（不误删）");
}

// ---------------------------------------------------------------------------
// X1b/RV3 P1-2：渲染抑制 suppressible（窗口 × URL 漂移）联合矩阵
// ---------------------------------------------------------------------------

/// 联合判定形态：suppressible = 窗口内 && URL 未变。矩阵语义：
/// | since_ms      | url_changed | suppressible |
/// | 0 / 89_999    | false       | true（抑制，探针） |
/// | 0 / 89_999    | true        | false（漂移即换页） |
/// | >= 90_000     | 任意        | false（过窗换页） |
/// lib.rs 内已有窗口表单测（should_suppress_kernel_nav），本测试锁联合表达式
/// 与 URL 锚点更新（真实换页必须记录 LAST_KERNEL_NAV_URL）。
#[test]
fn suppressible_joint_predicate_shape() {
    let seg = LIB_RS
        .split("fn suppressible(")
        .nth(1)
        .and_then(|s| s.split("fn kernel_ready_navigate").next())
        .expect("suppressible 函数体");
    assert!(
        seg.contains("should_suppress_kernel_nav(since_last_nav_ms) && !url_changed"),
        "联合判定必须是 窗口内 && URL未变（矩阵中枢）: {seg}"
    );
    // 窗口常量 90s（89_999 抑制 / 90_000 放行边界由常量 + `<` 决定）。
    assert!(LIB_RS.contains("KERNEL_NAV_SUPPRESS_WINDOW_MS: u64 = 90_000"), "90s 窗口常量");
    assert!(LIB_RS.contains("since_last_nav_ms < KERNEL_NAV_SUPPRESS_WINDOW_MS"), "窗口判定严格 <（恰 90s 放行）");
    // URL 漂移检测：与上次真实换页的 URL 比较（Some 且不同 → changed）。
    let nav = LIB_RS
        .split("fn kernel_ready_navigate")
        .nth(1)
        .and_then(|s| s.split("fn route_one_event").next())
        .expect("kernel_ready_navigate 函数体");
    assert!(
        nav.contains("guard.as_deref().is_some_and(|prev| prev != url)"),
        "URL 变更判定 = 与 LAST_KERNEL_NAV_URL 锚点不同"
    );
    assert!(nav.contains("LAST_KERNEL_NAV_MS.store"), "真实换页更新时刻锚点");
    assert!(nav.contains("*LAST_KERNEL_NAV_URL.lock().unwrap_or_else(|p| p.into_inner()) = Some(url.clone())"), "真实换页更新 URL 锚点（漂移检测基准）");
}

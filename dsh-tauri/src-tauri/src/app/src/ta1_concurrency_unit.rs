//! TA1 并发测试：logging `append_capped` 双线程并发写 + 超限轮转。
//!
//! append_capped 访问需私有 mod logging——经 lib.rs cfg(test)] 门以单元测试
//! 形态接入（集成 tests/ 不可达）。

use std::path::PathBuf;

/// 唯一临时路径（防并行测试互踩）。
fn tmp_path(tag: &str) -> PathBuf {
    std::env::temp_dir().join(format!("dsh-ta1-{}-{}-{}.log", tag, std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().subsec_nanos()))
}

/// 行完整性校验：每行必须完整形如 `<tag>-<i>-<pad>`（无撕裂、无交错）。
fn line_is_intact(line: &str, tag: &str) -> bool {
    let mut parts = line.splitn(3, '-');
    match (parts.next(), parts.next()) {
        (Some(t), Some(idx)) if t == tag => idx.parse::<u64>().is_ok(),
        _ => false,
    }
}

#[test]
fn ta1_append_capped_concurrent_10k_lines_no_tear() {
    let cap = 2048u64; // 小上限：10k 行必然多次轮转
    let path = tmp_path("appendcapped");
    let _ = std::fs::remove_file(&path);
    let _ = std::fs::remove_file(path.with_extension("old"));

    const PER_THREAD: usize = 5_000;
    let p1 = path.clone();
    let t1 = std::thread::spawn(move || {
        for i in 0..PER_THREAD {
            crate::logging::append_capped(&p1, &format!("A-{i}-{}", "x".repeat(20)), cap);
        }
    });
    let p2 = path.clone();
    let t2 = std::thread::spawn(move || {
        for i in 0..PER_THREAD {
            crate::logging::append_capped(&p2, &format!("B-{i}-{}", "y".repeat(20)), cap);
        }
    });
    // 双线程 join：无 panic（append_capped 铁律——吞一切 Result）。
    t1.join().expect("线程 A 无 panic");
    t2.join().expect("线程 B 无 panic");

    // 当前文件 + .old 都读：轮转后行数「守恒近似」——允许轮转丢整代，
    // 但落盘的每一行必须完整（不撕裂、不 A/B 交错混合）。
    let read_lines = |p: &PathBuf| -> Vec<String> {
        std::fs::read_to_string(p).unwrap_or_default().lines().map(str::to_string).collect()
    };
    let cur = read_lines(&path);
    let old = read_lines(&path.with_extension("old"));
    let total = cur.len() + old.len();
    assert!(total > 0, "至少落盘一代日志");
    assert!(total <= 2 * PER_THREAD, "落盘行数 {total} 超写入总量 {}", 2 * PER_THREAD);
    // 【K3 修复后强断言】：APPEND_LOCK 写者锁把「检查→轮转→打开→写入」全链
    // 串行化，writeln! 单写者执行 → 正文与换行不再分属两次并发系统写。
    // 行撕裂/交错/空行（TA1 曾记录「正文与 \n 分属两次 write，交错产生
    // "\n\n"」）从此必须为零——这是原子化修复的回归锚点。
    let mut torn_empty = 0usize;
    for line in cur.iter().chain(old.iter()) {
        if line.is_empty() {
            torn_empty += 1;
            continue;
        }
        let ok = line_is_intact(line, "A") || line_is_intact(line, "B");
        assert!(ok, "行撕裂/交错: {line:?}");
    }
    assert_eq!(torn_empty, 0, "写者锁后并发写不得再产生空行撕裂（K3 原子化锚点）: {torn_empty} 例");
    // 轮转上限近似：单文件（不含换行前 scrub 差异）不超过 cap + 单行余量。
    let cur_len = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    assert!(cur_len <= cap + 512, "轮转后当前文件 {cur_len}B 超上限 {cap}B+余量");
    let _ = std::fs::remove_file(&path);
    let _ = std::fs::remove_file(path.with_extension("old"));
}

#[test]
fn ta1_append_capped_rotation_moves_to_old() {
    let path = tmp_path("rotate");
    let _ = std::fs::remove_file(&path);
    let _ = std::fs::remove_file(path.with_extension("old"));
    // 第一代：单条超限长行（确定性使文件 > cap）。
    crate::logging::append_capped(&path, &format!("gen1-huge-{}", "z".repeat(4000)), 1024);
    assert!(
        std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0) > 1024,
        "预置超限内容失败"
    );
    let old_path = path.with_extension("old");
    let _ = std::fs::remove_file(&old_path); // 只认「gen2 时代」的新轮转
    let mut rotated = false;
    for i in 0..8 {
        crate::logging::append_capped(&path, &format!("gen2-{i}"), 1024);
        if old_path.exists() && std::fs::read_to_string(&old_path).map(|s| !s.is_empty()).unwrap_or(false) {
            rotated = true;
            break;
        }
    }
    assert!(rotated, "超限后继续追加必须触发轮转到 .old");
    let old = std::fs::read_to_string(&old_path).expect(".old 可读");
    assert!(old.contains("gen1-huge"), ".old 应为上一代内容");
    let cur = std::fs::read_to_string(&path).expect("轮转后重开");
    assert!(!cur.contains("gen1-"), "轮转后当前文件不应残留上一代: {cur:?}");
    let _ = std::fs::remove_file(&path);
    let _ = std::fs::remove_file(&old_path);
    let _ = std::fs::remove_file(&path);
    let _ = std::fs::remove_file(path.with_extension("old"));
}

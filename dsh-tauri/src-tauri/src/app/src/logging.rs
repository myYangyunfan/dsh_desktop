//! # C3 极早期日志（backlog 最紧急项，2026-08 v0.5.2「打不开零日志」教训）
//!
//! v0.5.2 真机形态：安装态 GUI 子系统无控制台（`windows_subsystem = "windows"`），
//! `eprintln!` 无人接收；`logs/` 目录只在首个 `file_log` / panic 落盘时才被创建——
//! 若进程死在 tauri `Builder::build` / `setup` 早期（WebView2 缺失、单实例插件
//! 初始化失败、路径解析异常），**整个生命周期一个字节都不落盘**，用户侧表现为
//! 「打不开且日志目录不存在」。
//!
//! 本模块提供与初始化顺序完全解耦的极早期日志：
//! - [`early_log`]：`main`/`run()` 第一行即可用；纯 std 追加写
//!   `%APPDATA%\dsh-desktop\logs\boot-early.log`，目录不存在则建，
//!   4MB 截断轮转（超限重命名 `.old` 重开）。
//! - [`install_early_panic_hook`]：最早装的 panic hook——先写 early log 再链回
//!   既有 hook（lib.rs 的 panics.log hook 随后接管，链式保留双写）。
//! - [`append_capped`]：通用封顶追加（supervisor 的 dsh-web.log 接线复用，
//!   Electron capLogFile 语义的 .old 版本：超限重命名 `.old` 重开）。
//! - [`write_log_pointer_files`]：目录分裂（`%APPDATA%\DSH Desktop` =
//!   Electron 内核 userData vs `%APPDATA%\dsh-desktop` = 壳数据根）的指针文件
//!   方案——在姊妹目录放 README 指路，用户/支持不再看错目录。
//!
//! 异常安全铁律：所有函数吞掉一切 `Result`（`let _ =`），**绝不 panic**——
//! early_log 可能运行在 panic hook 内，hook 内再 panic = 无限递归崩进程。

use std::io::Write;
use std::path::{Path, PathBuf};

/// 封顶阈值：4MB（与任务口径一致；Electron MAX_LOG_BYTES 同量级）。
pub const LOG_CAP_BYTES: u64 = 4 * 1024 * 1024;

/// 写者锁（K3，2026-08）：`append_capped` 的「封顶检查 → 轮转 → 打开 → 写入」
/// 全链串行化。此前并发双线程（supervisor `log_line` 与 route `route_log` 共用
/// desktop.log；dsh-web.log 由 stdout/stderr 两线程直写）各自独立
/// `open(append)`，`writeln!` 对同一句柄并发写非原子——正文与换行分属两次
/// 系统写，交错拼接成一行或产生空行撕裂（K2 诊断见 desktop.log:67 交错：
/// 两线程 append 拼成一行）。单写者后每行必完整。
/// 全局单锁（非 per-file）：desktop.log / dsh-web.log 同属低频落盘，串行化
/// 开销可忽略；防住的正是多写者共享文件句柄时的交叉竞态（含轮转与写入
/// 之间错位的崩溃现场）。panic hook 内调用安全性：锁临界区只做全静默 IO
///（运行路径零 unwrap/expect/panic），持有锁期间不会触发 panic 重入。
static APPEND_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// 壳日志目录（`<app_data>/logs`）。
pub fn logs_dir() -> PathBuf {
    shell_core::DshPaths::resolve().logs
}

/// 极早期日志文件路径（`<logs>/boot-early.log`）。
pub fn early_log_path() -> PathBuf {
    logs_dir().join("boot-early.log")
}

/// 无依赖时间戳（`shell_core::time` 单一来源，与 lib.rs chrono_like_now 同口径）。
fn timestamp() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    shell_core::time::format_unix_secs(secs)
}

/// 封顶追加（Electron capLogFile 的 .old 变体）：文件超 `cap` 字节时先重命名为
/// `.old`（覆盖旧 `.old`）再重开追加。失败一律静默——日志绝不影响主流程。
///
/// 与 Electron「保留尾部」语义的取舍：截断重开实现为纯 std 且 O(1)，
/// 4MB 上限下单文件信息量已足够定位启动故障；`.old` 保留上一代完整内容。
///
/// RV8 P1-4 红线：落盘前经 [`scrub_secrets`] 擦除凭据形态子串——内核
/// stdout/stderr 原文进 dsh-web.log，若报错行携带 API key/Bearer 头/
/// Authorization 行将明文持久化。
pub fn append_capped(path: &Path, line: &str, cap: u64) {
    // 写者锁（K3）：整链持锁——封顶检查/轮转与打开写入之间不允许其他线程
    // 插入（此前轮转与 append 竞态：两线程同过 metadata 检查后一写一滚，
    // 新文件丢行或 .old 内容撕裂）。持锁跨 IO 串行化全部落盘写者。
    let _guard = APPEND_LOCK.lock().unwrap_or_else(|p| p.into_inner());
    // 目录不存在则建（early 场景 logs/ 可能从未被创建过——v0.5.2 根因）。
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    // 封顶检查（元数据失败按未超限处理——写入路径本身还会兜底）。
    if let Ok(meta) = std::fs::metadata(path) {
        if meta.len() > cap {
            let old = path.with_extension("old");
            let _ = std::fs::remove_file(&old);
            let _ = std::fs::rename(path, &old);
        }
    }
    let scrubbed = scrub_secrets(line);
    let _ = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .and_then(|mut f| writeln!(f, "{scrubbed}"));
}

/// 凭据形态擦除（纯 std 手写扫描，无正则依赖）：命中即以 `***` 替换。
/// 覆盖：`sk-` 前缀 20+ 位键、`Bearer <token>`、`Authorization: <…>`、
/// `api_key/apikey/api-key` 赋值。保守匹配（形态不全则放过原文），宁可
/// 漏脱敏不可误伤普通日志。
pub fn scrub_secrets(line: &str) -> String {
    let bytes = line.as_bytes();
    let mut out = String::with_capacity(line.len());
    let mut i = 0usize;
    /// 键序列（大小写不敏感）+ 其后到首个空白/引号/行尾为值。
    fn masked_value_len(s: &[u8], start: usize) -> usize {
        let mut j = start;
        while j < s.len() && !s[j].is_ascii_whitespace() && s[j] != b'"' && s[j] != b'\'' {
            j += 1;
        }
        j - start
    }
    fn eq_at(s: &[u8], i: usize, pat: &[u8]) -> bool {
        s.len() >= i + pat.len() && s[i..i + pat.len()].eq_ignore_ascii_case(pat)
    }
    let mut mutated = false;
    while i < bytes.len() {
        if bytes[i] == b's' && eq_at(bytes, i, b"sk-") {
            let mut j = i + 3;
            let mut n = 0;
            while j < bytes.len() && (bytes[j].is_ascii_alphanumeric() || bytes[j] == b'-' || bytes[j] == b'_') {
                j += 1;
                n += 1;
            }
            if n >= 20 {
                out.push_str("sk-***");
                mutated = true;
                i = j;
                continue;
            }
        } else if eq_at(bytes, i, b"Bearer ") {
            let mut j = i + 7;
            let mut n = 0;
            while j < bytes.len() && !bytes[j].is_ascii_whitespace() {
                j += 1;
                n += 1;
            }
            if n >= 16 {
                out.push_str("Bearer ***");
                mutated = true;
                i = j;
                continue;
            }
        } else if eq_at(bytes, i, b"Authorization:") {
            let mut j = i + 14;
            while j < bytes.len() && bytes[j].is_ascii_whitespace() {
                j += 1;
            }
            // TA1/TA4 缺口修复：Authorization 值是「scheme + 空格 + 凭据」复合
            //（Bearer <token> / Basic <b64>）——按单 token 打码会把 scheme 后的
            // 裸凭据留在日志里。整行余段全部打码（Authorization 值无结构化
            // 后续字段，行级打码安全）。
            if j < bytes.len() {
                out.push_str("Authorization: ***");
                mutated = true;
                i = bytes.len();
                continue;
            }
        } else if eq_at(bytes, i, b"api_key") || eq_at(bytes, i, b"apikey") || eq_at(bytes, i, b"api-key") {
            let kw_len = if eq_at(bytes, i, b"apikey") { 6 } else { 7 }; // api_key/api-key 均 7
            let mut j = i + kw_len;
            while j < bytes.len() && (bytes[j] == b' ' || bytes[j] == b'=' || bytes[j] == b':' || bytes[j] == b'"' || bytes[j] == b'\'') {
                j += 1;
            }
            let vlen = masked_value_len(bytes, j);
            if vlen >= 8 {
                out.push_str(&line[i..i + kw_len]);
                out.push_str("=***");
                mutated = true;
                i = j + vlen;
                continue;
            }
        }
        let ch = line[i..].chars().next().unwrap_or('\u{FFFD}');
        out.push(ch);
        i += ch.len_utf8();
    }
    let _ = mutated;
    out
}

/// 极早期日志：`main`/`run()` 入口第一行即可调用（纯 std，无任何前置初始化）。
/// 带时间戳前缀；一切 IO 失败静默（含 panic hook 内调用——不得再 panic）。
pub fn early_log(line: &str) {
    append_capped(&early_log_path(), &format!("[{}] {}", timestamp(), line), LOG_CAP_BYTES);
}

/// 极早期 panic hook：panic 信息先写 boot-early.log，再链回安装时的既有 hook
/// （默认 hook 或 lib.rs 后装的 panics.log hook——后装者 take_hook 会取走本
/// hook 作为「default」，链式调用保持 early 落盘不丢）。
///
/// hook 体内只做格式化 + append_capped（内部全静默），不允许 panic。
pub fn install_early_panic_hook() {
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let msg = format!(
            "[EARLY-PANIC] thread={:?} location={:?} payload={}",
            std::thread::current().name(),
            info.location().map(|l| l.to_string()),
            crate::supervisor::panic_payload_str(info.payload()),
        );
        // 先落盘（timestamp 内建），失败静默；再走链上的原 hook。
        append_capped(&early_log_path(), &format!("[{}] {msg}", timestamp()), LOG_CAP_BYTES);
        default(info);
    }));
}

/// 目录分裂指针文件：在 `%APPDATA%\DSH Desktop`（Electron 内核 userData，
/// Chromium 大小写敏感命名）与 `%LOCALAPPDATA%\com.deepseek.dsh.desktop`
/// （Tauri 强制 WebView2 data 目录）各放一个指路 README，把「日志去哪了」
/// 的答案钉死在用户第一眼会看的目录里。幂等（内容相同直接覆盖）。
///
/// 不碰 X1 文件、不迁移任何数据——纯新增只读指引。
pub fn write_log_pointer_files() {
    let logs = logs_dir();
    let content = format!(
        "DSH Desktop 日志位置指引（此文件由 DSH Desktop 自动生成，可删除）\n\
         \n\
         桌面壳（Tauri 版）的日志与设置在本目录之外的姊妹目录：\n\
         \n\
           {}\n\
           {} （启动早期日志，进程最早期的崩溃/panic 都在这里）\n\
           {} （壳运行日志）\n\
           {} （内核 web 输出）\n\
         \n\
         本目录（DSH Desktop）是旧 Electron 内核的浏览器数据/用户数据目录，\n\
         不是日志目录。反馈问题时请打包上面 logs 目录。",
        logs.parent().map(|p| p.display().to_string()).unwrap_or_default(),
        logs.join("boot-early.log").display(),
        logs.join("desktop.log").display(),
        logs.join("dsh-web.log").display(),
    );
    // 候选 1：%APPDATA% 姊妹目录「DSH Desktop」（Electron productName userData）。
    if let Some(parent) = logs.parent() {
        let electron_dir = parent.join("DSH Desktop");
        if electron_dir.is_dir() {
            let _ = std::fs::write(electron_dir.join("日志在哪里-LOGS-LOCATION.txt"), &content);
        }
    }
    // 候选 2：%LOCALAPPDATA%\com.deepseek.dsh.desktop（Tauri 强制 WebView2 目录，
    // tauri-2.11.5 manager/webview.rs:537 起 LocalData+identifier）。
    if let Some(local) = logs.parent().and_then(|p| p.parent()) {
        let wv = local.join("com.deepseek.dsh.desktop");
        if wv.is_dir() {
            let _ = std::fs::write(wv.join("LOGS-LOCATION.txt"), &content);
        }
    }
}

// ---------------------------------------------------------------------------
// 测试：路径 / 轮转 / 异常安全（hook 内不得再 panic）形态锁死
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    // 进程级 env 互斥：必须与 lib.rs 的 ENV_LOCK 同一把锁。本模块 sandbox
    // 清理的 DSH_TEST_TMP 与 image 等测试的 env 关键区互相竞争——此前本模块
    // 私有锁与 crate::ENV_LOCK 互不互斥，正是并行偶发失败（image sweep 空扫、
    // early_log 失败）的根因。
    use crate::ENV_LOCK;

    struct Sandbox {
        home: PathBuf,
    }

    impl Drop for Sandbox {
        fn drop(&mut self) {
            clear();
            let _ = std::fs::remove_dir_all(&self.home);
        }
    }

    fn clear() {
        std::env::remove_var("DSH_TEST_HOME");
        std::env::remove_var("DSH_TEST_APPDATA");
        std::env::remove_var("DSH_TEST_TMP");
    }

    fn sandbox(tag: &str) -> Sandbox {
        let home = std::env::temp_dir().join(format!("dsh-early-log-{}-{}", tag, std::process::id()));
        let _ = std::fs::remove_dir_all(&home);
        std::fs::create_dir_all(&home).unwrap();
        std::env::set_var("DSH_TEST_HOME", &home);
        std::env::set_var("DSH_TEST_APPDATA", home.join("appdata"));
        std::env::set_var("DSH_TEST_TMP", home.join("tmp"));
        Sandbox { home }
    }

    /// 路径形态：boot-early.log 必须落在 <app_data>/logs/（与 desktop.log 同目录，
    /// 「打开日志」托盘菜单一次看全）。
    #[test]
    fn early_log_path_shape() {
        let _env = ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let _sb = sandbox("path");
        let p = early_log_path();
        assert!(p.parent().unwrap().ends_with("logs"), "boot-early.log 必须在 logs/ 下: {}", p.display());
        assert_eq!(p.file_name().unwrap(), "boot-early.log");
        assert!(logs_dir().ends_with("logs"));
    }

    /// 首写自动建目录 + 内容带时间戳前缀（v0.5.2 根因：目录从未被创建）。
    #[test]
    fn early_log_creates_dir_and_appends() {
        let _env = ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let _sb = sandbox("append");
        let p = early_log_path();
        assert!(!p.exists());
        early_log("hello boot");
        early_log("second line");
        assert!(p.exists(), "目录不存在时必须自动创建");
        let raw = std::fs::read_to_string(&p).unwrap();
        assert!(raw.contains("hello boot") && raw.contains("second line"), "{raw}");
        assert!(raw.starts_with('['), "时间戳前缀形态 [YYYY-MM-DD ...]: {raw}");
    }

    /// 4MB 轮转：超限重命名 .old 重开；新文件从零开始；.old 保留上一代。
    #[test]
    fn append_capped_rotates_to_old() {
        let dir = std::env::temp_dir().join(format!("dsh-cap-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("x.log");
        // cap 设 64 字节：单行 43B（含 \n），第二行追加前 len=43 未超限 → 不轮转。
        append_capped(&f, "first-line-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", 64);
        append_capped(&f, "second-line-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", 64);
        assert!(!dir.join("x.old").exists(), "追加前未超限不轮转");
        // 第三行追加前 len=86 > 64 → 轮转：.old = 前两行，新文件从零开始。
        append_capped(&f, "third-line-ccccccccccccccccccccccccccccccccc", 64);
        assert!(dir.join("x.old").exists(), "超限必须重命名 .old");
        let old = std::fs::read_to_string(dir.join("x.old")).unwrap();
        assert!(old.contains("first-line") && old.contains("second-line"), ".old 保留上一代内容");
        let now = std::fs::read_to_string(&f).unwrap();
        assert!(now.contains("third-line") && !now.contains("first-line"), "重开后只含新内容");
        // 再超限：旧 .old 被覆盖（只保留一代）。
        append_capped(&f, "fourth-line-ddddddddddddddddddddddddddddddddd", 64);
        append_capped(&f, "fifth-line-eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", 64);
        let old2 = std::fs::read_to_string(dir.join("x.old")).unwrap();
        assert!(old2.contains("fourth-line") && !old2.contains("first-line"), "只保留一代 .old");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// 异常安全：目标路径是目录（open 必败）时 append_capped 不得 panic。
    /// （panic hook 内调用此函数——hook 内再 panic = 无限递归崩进程。）
    #[test]
    fn append_capped_never_panics_on_io_error() {
        let dir = std::env::temp_dir().join(format!("dsh-cap-err-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        // 目录本身当文件路径 → metadata(rename) 均 Err → 必须全静默。
        append_capped(&dir, "must-not-panic", 64);
        // 只读父目录 + 不存在父链 → create_dir_all Err → 静默。
        append_capped(Path::new("Z:\\definitely\\no\\such\\dir\\x.log"), "x", 64);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// early_log 同样在 IO 全败路径（非法盘符）下不得 panic。
    #[test]
    fn early_log_never_panics_on_bad_path() {
        let _env = ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let _sb = sandbox("badpath");
        std::env::set_var("DSH_TEST_APPDATA", "Z:\\definitely\\no\\such\\root");
        early_log("still must not panic");
        std::env::set_var("DSH_TEST_APPDATA", _sb.home.join("appdata"));
    }

    /// 形态锁死（include_str 自检）：本模块源码不得出现 unwrap/expect/panic!
    /// （运行路径函数体内——测试模块除外，测试可 unwrap）。
    #[test]
    fn no_unwraps_in_runtime_code() {
        let src = include_str!("logging.rs");
        let runtime = src.split("#[cfg(test)]").next().unwrap();
        assert!(!runtime.contains(".unwrap()"), "运行路径禁止 unwrap（hook 内不得 panic）");
        assert!(!runtime.contains(".expect("), "运行路径禁止 expect");
        assert!(!runtime.contains("panic!("), "运行路径禁止显式 panic");
        // append_capped 是唯一落盘原语：early_log 与 hook 都必须经它。
        assert!(runtime.contains("pub fn early_log"));
        assert!(runtime.matches("append_capped(&early_log_path()").count() >= 2, "early_log 与 panic hook 都须走 append_capped");
    }

    /// 指针文件：Electron userData 目录存在时必须出现指路 README；不存在时
    /// 不新建目录（不污染干净环境）。
    #[test]
    fn pointer_file_written_into_sibling_electron_dir() {
        let _env = ENV_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let sb = sandbox("pointer");
        let appdata = sb.home.join("appdata");
        // 姊妹目录不存在 → 不新建。
        write_log_pointer_files();
        assert!(!appdata.join("DSH Desktop").exists(), "不新建 Electron 目录");
        // 姊妹目录存在（用户机器形态：旧 Electron 内核建过）→ 写 README。
        std::fs::create_dir_all(appdata.join("DSH Desktop")).unwrap();
        write_log_pointer_files();
        let readme = appdata.join("DSH Desktop").join("日志在哪里-LOGS-LOCATION.txt");
        assert!(readme.exists(), "指路 README 必须落地");
        let raw = std::fs::read_to_string(&readme).unwrap();
        assert!(raw.contains("boot-early.log") && raw.contains("desktop.log"), "必须指向真实日志文件名: {raw}");
        // 幂等：再跑一次不炸。
        write_log_pointer_files();
    }
}

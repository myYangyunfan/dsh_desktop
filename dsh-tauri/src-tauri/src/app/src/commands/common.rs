//! 共享小工具：错误转换 / OS 打开 / 原子写 / base64 / 无依赖时间戳。
//!
//! 被 commands 其余子模块共用；不承载任何单一命令领域逻辑。

use bridge::BridgeError;
use tauri::{AppHandle, Manager};

/// tauri::Error → BridgeError（bridge crate 不依赖 tauri，转换放装配层）。
pub fn terr(e: tauri::Error) -> BridgeError {
    BridgeError::internal(e.to_string())
}

/// 窗口可观测判定（纯函数，全仓单一判定口径）：
/// 可见且未最小化才算「前台可交互」。消费方：余额轮询暂停门（Electron
/// shouldSkipRefresh 同语义）、渲染层假死看门狗（最小化窗口定时器被节流，
/// 心跳停摆不计失联——Windows 上 is_visible 对最小化窗仍为 true，缺
/// minimized 检查会把节流误判为假死 → 周期性重载风暴）。
/// 查询失败缺省：visible 按 true（不误杀正常逻辑）、minimized 按 false。
pub fn window_watchable(visible: Option<bool>, minimized: Option<bool>) -> bool {
    visible.unwrap_or(true) && !minimized.unwrap_or(false)
}

/// 系统浏览器打开 http(s) URL。
pub fn open_http_url(url: &str) -> Result<serde_json::Value, BridgeError> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err(BridgeError::invalid_arg(format!("仅允许 http/https：{url}")));
    }
    #[cfg(windows)]
    {
        // Review#2：不用 cmd /C start（& | ^ " 注入面）——PowerShell 单引号包裹，
        // 内部单引号翻倍（与 copy_text 同口径）。
        let escaped = url.replace(char::from(0x27), "''");
        std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", &format!("Start-Process '{escaped}'")])
            .creation_flags_no_window()
            .spawn()
            .map_err(BridgeError::from)?;
    }
    // 非 Windows 三分（与 file_open 同款）：macOS 无 xdg-open，open 才是
    // 系统开启器——此前 mac 上 open-browser/open_external 全静默失败。
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(url).spawn().map_err(BridgeError::from)?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open").arg(url).spawn().map_err(BridgeError::from)?;
    }
    Ok(serde_json::Value::Null)
}

/// explorer/Finder/xdg-open 打开目录（⋯ 菜单 open-logs / 恢复页 / 托盘共用）。
pub fn open_in_explorer(dir: &std::path::Path) -> Result<serde_json::Value, BridgeError> {
    #[cfg(windows)]
    let prog = "explorer";
    #[cfg(target_os = "macos")]
    let prog = "open";
    #[cfg(all(unix, not(target_os = "macos")))]
    let prog = "xdg-open";
    std::process::Command::new(prog).arg(dir).spawn().map_err(BridgeError::from)?;
    Ok(serde_json::Value::Null)
}

/// 主窗导航（evaluate_script location.href——万金油且可靠）。
pub fn navigate_main(app: &AppHandle, url: &str) -> Result<(), BridgeError> {
    let win = app.get_webview_window("main").ok_or_else(|| BridgeError::not_found("主窗不存在"))?;
    let js = format!("try{{location.href={}}}catch(e){{}}", serde_json::to_string(url).unwrap_or_else(|_| "\"\"".into()));
    win.eval(&js).map_err(terr)
}

/// 原子写：tmp + rename。
pub fn atomic_write(path: &std::path::Path, content: &str) -> std::io::Result<()> {
    let tmp = path.with_extension("revert-tmp");
    std::fs::write(&tmp, content)?;
    std::fs::rename(&tmp, path)
}

/// 「文档」目录（备份导出落点）。USERPROFILE（Windows）/ HOME（unix）双取，
/// 均缺时退当前目录——unix 无 USERPROFILE，此前恒落 "."（备份甩进 GUI cwd）。
pub fn dirs_docs() -> std::path::PathBuf {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(|h| std::path::PathBuf::from(h).join("Documents"))
        .unwrap_or_else(|| std::path::PathBuf::from("."))
}

/// 无依赖 UTC 时间戳 `YYYYMMDD-HHMMSS`（本地时区经 PowerShell 太重；
/// UTC 稳定可排序，命名用途足够）。days→civil 算法在 `shell_core::time`。
pub fn chrono_now() -> String {
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
    let secs = now.as_secs();
    let (y, mo, d) = shell_core::time::civil_from_days((secs / 86400) as i64);
    format!("{y:04}{mo:02}{d:02}-{:02}{:02}{:02}", (secs % 86400) / 3600, (secs % 3600) / 60, secs % 60)
}

/// 标准 base64 编码（无依赖实现）。
pub fn b64(data: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        out.push(T[(n >> 18) as usize & 63] as char);
        out.push(T[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { T[n as usize & 63] as char } else { '=' });
    }
    out
}

/// 标准 base64 解码（无依赖实现，容错空白与缺省 padding）。
pub fn b64_decode(s: &str) -> Option<Vec<u8>> {
    fn val(c: u8) -> Option<u8> {
        match c {
            b'A'..=b'Z' => Some(c - b'A'),
            b'a'..=b'z' => Some(c - b'a' + 26),
            b'0'..=b'9' => Some(c - b'0' + 52),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    }
    let cleaned: Vec<u8> = s.bytes().filter(|b| !b.is_ascii_whitespace()).collect();
    let mut out = Vec::with_capacity(cleaned.len() / 4 * 3);
    let mut chunk = [0u8; 4];
    let mut n = 0usize;
    for &b in &cleaned {
        if b == b'=' {
            break;
        }
        chunk[n] = val(b)?;
        n += 1;
        if n == 4 {
            let v = (u32::from(chunk[0]) << 18) | (u32::from(chunk[1]) << 12) | (u32::from(chunk[2]) << 6) | (u32::from(chunk[3]));
            out.push((v >> 16) as u8);
            out.push((v >> 8) as u8);
            out.push(v as u8);
            n = 0;
        }
    }
    match n {
        0 => Some(out),
        1 => None, // 单字符不成组
        2 => {
            let v = (u32::from(chunk[0]) << 18) | (u32::from(chunk[1]) << 12);
            out.push((v >> 16) as u8);
            Some(out)
        }
        3 => {
            let v = (u32::from(chunk[0]) << 18) | (u32::from(chunk[1]) << 12) | (u32::from(chunk[2]) << 6);
            out.push((v >> 16) as u8);
            out.push((v >> 8) as u8);
            Some(out)
        }
        _ => None,
    }
}

/// GUI 进程起 console 子进程必须抑制终端窗（0.5.0 实测修复：
/// 无旗则每个桥命令/sidecar 调用都闪终端窗）。
#[cfg(windows)]
pub trait NoWindow {
    fn creation_flags_no_window(&mut self) -> &mut Self;
}
#[cfg(windows)]
impl NoWindow for std::process::Command {
    fn creation_flags_no_window(&mut self) -> &mut Self {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        self.creation_flags(CREATE_NO_WINDOW)
    }
}
#[cfg(not(windows))]
pub trait NoWindow {
    fn creation_flags_no_window(&mut self) -> &mut Self;
}
#[cfg(not(windows))]
impl NoWindow for std::process::Command {
    fn creation_flags_no_window(&mut self) -> &mut Self {
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn b64_known_vectors() {
        assert_eq!(b64(b""), "");
        assert_eq!(b64(b"f"), "Zg==");
        assert_eq!(b64(b"fo"), "Zm8=");
        assert_eq!(b64(b"foo"), "Zm9v");
        assert_eq!(b64(b"foobar"), "Zm9vYmFy");
        // 二进制安全（RFC 4648：3 字节无填充）。
        assert_eq!(b64(&[0xffu8; 2]), "//8=");
        assert_eq!(b64(&[0xffu8; 3]), "////");
    }

    #[test]
    fn b64_decode_roundtrip_and_padding() {
        // 与 b64 编码器互逆（含 1/2/3 字节尾组与无 padding 形态）。
        for data in [b"" as &[u8], b"a", b"ab", b"abc", b"abcd", b"foobarbaz!"] {
            let enc = b64(data);
            assert_eq!(b64_decode(&enc).as_deref(), Some(data), "roundtrip {data:?}");
        }
        assert_eq!(b64_decode("aGVsbG8=").as_deref(), Some(b"hello".as_slice()));
        assert_eq!(b64_decode("aGVsbG8").as_deref(), Some(b"hello".as_slice())); // 缺省 padding
        // 空白容错：base64 文本内嵌空白/换行应被忽略（"YWJj" → 字节 "abc"）。
        assert_eq!(b64_decode("YW J j\n").as_deref(), Some(b"abc".as_slice()));
        assert!(b64_decode("!!!").is_none());
        assert!(b64_decode("A").is_none()); // 单字符不成组
    }

    #[test]
    fn chrono_now_shape() {
        let s = chrono_now();
        assert_eq!(s.len(), 15, "YYYYMMDD-HHMMSS：{s}");
        assert_eq!(s.as_bytes()[8], b'-');
        assert!(s.starts_with("20"), "{s}");
    }

    /// 窗口可观测判定表（全仓单一口径）：可见未最小化；最小化/隐藏均停；
    /// 查询失败缺省不误杀（visible=true / minimized=false）。
    #[test]
    fn window_watchable_decision_table() {
        assert!(window_watchable(Some(true), Some(false)), "可见且未最小化");
        assert!(window_watchable(None, None), "查询失败按可观测（不误杀正常逻辑）");
        assert!(!window_watchable(Some(true), Some(true)), "最小化 → 停（定时器被节流）");
        assert!(!window_watchable(Some(false), Some(false)), "隐藏 → 停");
        assert!(!window_watchable(Some(false), None), "隐藏（最小化未知）→ 停");
    }

    #[test]
    fn atomic_write_replaces_and_cleans_tmp() {
        let dir = std::env::temp_dir().join(format!("dsh-cmd-atomic-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("a.txt");
        atomic_write(&f, "v1").unwrap();
        assert_eq!(std::fs::read_to_string(&f).unwrap(), "v1");
        atomic_write(&f, "中文 v2").unwrap();
        assert_eq!(std::fs::read_to_string(&f).unwrap(), "中文 v2");
        assert!(!f.with_extension("revert-tmp").exists(), "临时文件应被 rename 消费");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// 跨平台开启器三分支形态锚点（WebviewWindow 无法在单测构造，沿用
    /// include_str! 形态断言法）：open_http_url 与 open_in_explorer 在
    /// macOS 必须走 `open`（xdg-open 不存在）、Linux 必须走 xdg-open——
    /// 此前 mac 上两者分别静默失败 / 仅打日志。
    #[test]
    fn openers_have_platform_branches_shape() {
        let src = include_str!("common.rs");
        for fname in ["pub fn open_http_url", "pub fn open_in_explorer"] {
            let seg = src
                .split(fname)
                .nth(1)
                .and_then(|s| s.split("\n}").next())
                .unwrap_or("");
            assert!(seg.contains(r#"#[cfg(target_os = "macos")]"#), "{fname} 缺 macOS 分支");
            assert!(seg.contains(r#"#[cfg(all(unix, not(target_os = "macos")))]"#), "{fname} 缺 Linux 分支");
            assert!(seg.contains(r#""open""#), "{fname} macOS 须用 open");
            assert!(seg.contains(r#""xdg-open""#), "{fname} Linux 须用 xdg-open");
        }
        // 非微 Windows 平台的 open_in_explorer 不得再是「仅日志」no-op。
        let seg = src.split("pub fn open_in_explorer").nth(1).and_then(|s| s.split("\n}").next()).unwrap_or("");
        assert!(!seg.contains("eprintln"), "打开目录不得降级为仅日志（mac/linux 用户可感知失效）");
    }

    /// 备份导出落点：HOME 兜底（unix 无 USERPROFILE 时不得恒落 "."）。
    #[test]
    fn dirs_docs_prefers_home_when_userprofile_missing() {
        let docs = dirs_docs();
        let home_like = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"));
        match home_like {
            Some(h) => {
                let expected = std::path::PathBuf::from(h).join("Documents");
                assert_eq!(docs, expected, "有 home 环境变量时必须落在 <home>/Documents");
            }
            None => assert_eq!(docs, std::path::PathBuf::from("."), "无 home 时保持当前目录降级"),
        }
    }
}

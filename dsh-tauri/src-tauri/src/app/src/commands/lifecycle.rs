//! Phase 1 核心生命周期命令：app_init / 剪贴板 / 外部打开 / 页面心跳 /
//! 当前会话 / 服务重启 / PoC 回显（ipc-commands.md §2.1）。
//! （余额触发 balance_refresh 已随余额生产链迁往 [`super::balance`]。）

use std::sync::atomic::Ordering;

use bridge::BridgeError;
use tauri::{AppHandle, Manager, State};

use crate::AppState;

use super::common::{open_http_url, NoWindow};

/// 更新源仓库（Electron client-updater DEFAULT_REPOS 同源；⋯ 菜单「更新源」展示+复制）。
pub const REPO_URLS: (&str, &str) = (
    "https://github.com/myYangyunfan/dsh_desktop",
    "https://gitee.com/my-yang-yunfan/dsh_desktop",
);

#[tauri::command]
pub fn app_init(app: AppHandle) -> Result<serde_json::Value, BridgeError> {
    let state = app.state::<AppState>();
    let (kernel_url, phase_note, kernel_version) = {
        let sv = state.supervisor.lock().unwrap_or_else(|p| p.into_inner()).clone();
        match sv {
            Some(s) => (s.kernel_url(), format!("kernel={}", s.kernel_version), s.kernel_version.clone()),
            None => (None, "supervisor 未初始化".into(), "未知".into()),
        }
    };
    // ⋯ 菜单面板状态（对齐 Electron chrome:init 的消费字段）：agent 版本/来源、
    // 三个持久化开关现值（settings.json，缺省 true）、更新源 URL——
    // bridge-shim 的菜单 openMenu 经 getInfo 拉取渲染。
    // 单次读盘（性能审计 2026-08）：SettingsStore::get 每次调用都全量读 +
    // 解析 settings.json，三键三次读纯属浪费（垫片每次窗口载入与每次菜单
    // 打开都走 app_init）——一次 load 读三键，语义不变（仍每次调用取最新值）。
    let store = shell_core::SettingsStore::new(state.paths.settings.clone());
    let map = store.load().unwrap_or_default();
    let bool_of = |k: &str| map.get(k).and_then(|v| v.as_bool()).unwrap_or(true);
    Ok(serde_json::json!({
        "appVersion": env!("CARGO_PKG_VERSION"),
        "shell": "tauri",
        "kernel": kernel_url.unwrap_or_else(|| "未就绪".into()),
        "phaseNote": phase_note,
        "platform": std::env::consts::OS,
        "agentVersion": kernel_version,
        "agentSource": "bundled", // Tauri 版内核随客户端分发（Electron 的「内置」对应物）
        "notifyOnTurnEnd": bool_of("notifyOnTurnEnd"),
        "closeToTray": bool_of("closeToTray"),
        "showBalanceDock": bool_of("showBalanceDock"),
        "repoUrls": { "github": REPO_URLS.0, "gitee": REPO_URLS.1 },
    }))
}

#[tauri::command]
pub async fn copy_text(text: String) -> Result<serde_json::Value, BridgeError> {
    if text.len() > 1_000_000 {
        return Err(BridgeError::invalid_arg("文本过长"));
    }
    // 进程隔离（性能审计 2026-08）：剪贴板写入 spawn PowerShell（冷启
    // ~200ms+），同步命令会在 UI 主线程上整窗冻结——spawn_blocking 挪出。
    let t = text;
    tauri::async_runtime::spawn_blocking(move || set_clipboard_text(&t))
        .await
        .map_err(|e| BridgeError::internal(format!("剪贴板任务失败: {e}")))??;
    Ok(serde_json::Value::Null)
}

/// 剪贴板写入（平台三分支）：Windows PowerShell Set-Clipboard；macOS
/// pbcopy；Linux xclip/xsel/wl-copy 尝试链（发行版/会话各异，均缺则报可读
/// 错误）——此前无平台分支，非 Windows 上 spawn powershell 直接失败，复制
/// 功能全坏。
///
/// Windows 经 stdin 传 base64（性能审计 2026-08 修正）：命令行内嵌原文有
/// 两个缺陷——Windows ~32K 命令行上限使长文本（上限允许到 1MB）直接失败；
/// PowerShell 按控制台代码页解析参数，非 ASCII 有乱码面。base64 是纯
/// ASCII，任意代码页安全，UTF-8 精确还原。
#[cfg(windows)]
fn set_clipboard_text(text: &str) -> Result<(), BridgeError> {
    use std::io::Write;
    let b64 = super::common::b64(text.as_bytes());
    let script = "$t=[Console]::In.ReadToEnd(); Set-Clipboard -Value ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($t)))";
    let mut child = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", script])
        .stdin(std::process::Stdio::piped())
        .creation_flags_no_window()
        .spawn()
        .map_err(BridgeError::from)?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(b64.as_bytes()).map_err(BridgeError::from)?;
    } // drop → EOF，PowerShell 读尽 stdin
    let status = child.wait().map_err(BridgeError::from)?;
    if !status.success() {
        return Err(BridgeError::internal("剪贴板写入失败"));
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn set_clipboard_text(text: &str) -> Result<(), BridgeError> {
    use std::io::Write;
    let mut child = std::process::Command::new("pbcopy")
        .stdin(std::process::Stdio::piped())
        .spawn()
        .map_err(BridgeError::from)?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(text.as_bytes()).map_err(BridgeError::from)?;
    }
    let status = child.wait().map_err(BridgeError::from)?;
    if !status.success() {
        return Err(BridgeError::internal("剪贴板写入失败"));
    }
    Ok(())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn set_clipboard_text(text: &str) -> Result<(), BridgeError> {
    use std::io::Write;
    let candidates: &[(&str, &[&str])] = &[
        ("xclip", &["-selection", "clipboard"]),
        ("xsel", &["--clipboard", "--input"]),
        ("wl-copy", &[]),
    ];
    for (tool, args) in candidates {
        let Ok(mut child) = std::process::Command::new(tool)
            .args(*args)
            .stdin(std::process::Stdio::piped())
            .spawn()
        else {
            continue; // 未安装：试下一个
        };
        let mut write_ok = true;
        if let Some(mut stdin) = child.stdin.take() {
            write_ok = stdin.write_all(text.as_bytes()).is_ok();
        }
        match child.wait() {
            Ok(st) if st.success() && write_ok => return Ok(()),
            _ => continue, // 写入/退出失败：试下一个工具
        }
    }
    Err(BridgeError::internal("剪贴板写入失败（未找到可用的 xclip/xsel/wl-copy）"))
}

#[tauri::command]
pub fn open_external(url: String) -> Result<serde_json::Value, BridgeError> {
    open_http_url(&url)
}

#[tauri::command]
pub fn page_error(state: State<AppState>, message: String) -> Result<serde_json::Value, BridgeError> {
    let n = state.page_errors.fetch_add(1, Ordering::Relaxed) + 1;
    eprintln!("[page-error #{n}] {message}");
    Ok(serde_json::Value::Null)
}

/// 心跳归属判定（纯函数）：`None` / `"main"` → 主窗（假死看门狗只统计主窗）；
/// `float` / `pet` / 未知标签 → 副窗。未知不得按主窗计——防未来形态的帧
/// 污染主窗计数、掩蔽假死判定（垫片侧标签见 bridge-shim.js WINDOW_LABEL）。
pub(crate) fn heartbeat_is_main(label: Option<&str>) -> bool {
    matches!(label, None | Some("main"))
}

#[tauri::command]
pub fn renderer_heartbeat(window: Option<String>, state: State<AppState>) -> Result<serde_json::Value, BridgeError> {
    if heartbeat_is_main(window.as_deref()) {
        state.heartbeats_main.fetch_add(1, Ordering::Relaxed);
    } else {
        state.heartbeats_side.fetch_add(1, Ordering::Relaxed);
    }
    Ok(serde_json::Value::Null)
}

#[tauri::command]
pub fn current_session(state: State<AppState>, session_id: String) -> Result<serde_json::Value, BridgeError> {
    let id = session_id.trim().to_string();
    if id.is_empty() || id.len() > 256 {
        return Err(BridgeError::invalid_arg("sessionId 为空或超长"));
    }
    *state.current_session.lock().unwrap_or_else(|p| p.into_inner()) = Some(id);
    Ok(serde_json::Value::Null)
}

#[tauri::command]
pub async fn restart_service(app: AppHandle) -> Result<serde_json::Value, BridgeError> {
    let state = app.state::<AppState>();
    let sv = state.supervisor.lock().unwrap_or_else(|p| p.into_inner()).clone();
    let sv = sv.ok_or_else(|| BridgeError::internal("supervisor 未初始化"))?;
    let preferred = state.last_port.load(Ordering::Relaxed);
    // 事件路由复用（v0.5.1「重启后白屏」回归根治）：必须走 AppState 里
    // route_events 消费的那条通道（supervisor_tx），KernelReady/CrashLoop/
    // BootStep 才有人路由——此前这里新建通道并把事件全部 drain 掉，重启
    // 成功后无人换页（真机复现：内核已就绪且稳定落定，页面永远停在
    // loading「正在启动」，白屏形态）。
    let tx = state
        .supervisor_tx
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .clone();
    // 进程隔离（性能审计 2026-08）：restart 的杀树段（taskkill /T /F +
    // wait，AV 下数百 ms）挪出 UI 主线程——同步命令会整窗冻结。
    let joined = tauri::async_runtime::spawn_blocking(move || match tx {
        Some(tx) => sv.restart(tx, u16::try_from(preferred).ok()),
        None => {
            // 兜底（理论不可达：supervisor 在场则装配通道必在）：drain 防阻塞。
            let (tx, rx) = std::sync::mpsc::channel();
            std::thread::spawn(move || {
                while let Ok(ev) = rx.recv() {
                    let _ = ev;
                }
            });
            sv.restart(tx, u16::try_from(preferred).ok());
        }
    })
    .await
    .map_err(|e| BridgeError::internal(format!("重启任务失败: {e}")))?;
    let _ = joined;
    Ok(serde_json::json!({ "ok": true }))
}

/// PoC 专用：JSON 回显（验证参数序列化双向通路）。非契约成员。
#[tauri::command]
pub fn poc_echo_json(payload: serde_json::Value) -> Result<serde_json::Value, BridgeError> {
    Ok(payload)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// restart_service 必须复用 supervisor_tx 装配通道（v0.5.1「重启后白屏」
    /// 回归锚点）：此前新建通道 + drain 线程把 KernelReady/CrashLoop 全部
    /// 吞掉——重启成功无人换页（真机复现：内核就绪且稳定落定，页面永远停在
    /// loading「正在启动」）。事件必须走 route_events 消费的那条通道。
    #[test]
    fn restart_service_reuses_supervisor_tx_shape() {
        let src = include_str!("lifecycle.rs").replace("\r\n", "\n");
        let seg = src
            .split("pub async fn restart_service")
            .nth(1)
            .and_then(|s| s.split("pub fn poc_echo_json").next())
            .expect("restart_service 段");
        assert!(seg.contains("supervisor_tx"), "必须复用装配通道 supervisor_tx: {seg}");
        assert!(seg.contains("sv.restart(tx,"), "restart 必须走复用通道");
    }

    /// copy_text 平台三分支形态锚点（include_str! 形态断言法）：非 Windows
    /// 不得再 spawn powershell（此前 mac/linux 上复制功能全坏——spawn 直接
    /// Err）；macOS 走 pbcopy、Linux 走 xclip/xsel/wl-copy 尝试链。
    #[test]
    fn copy_text_has_platform_branches_shape() {
        // 行尾归一（CI Windows runner 检出可能 CRLF，本地 LF——\n 切分模式
        // 对行尾敏感，实测 CI 首跑即挂）。
        let src = include_str!("lifecycle.rs").replace("\r\n", "\n");
        let seg = src
            .split("#[cfg(windows)]\nfn set_clipboard_text")
            .nth(1)
            .and_then(|s| s.split("#[cfg(target_os = \"macos\")]").next())
            .expect("windows set_clipboard_text 分支");
        assert!(seg.contains("Set-Clipboard"), "Windows 保持 PowerShell 语义");
        let mac = src
            .split("#[cfg(target_os = \"macos\")]\nfn set_clipboard_text")
            .nth(1)
            .and_then(|s| s.split("#[cfg(all(unix, not(target_os = \"macos\")))]").next())
            .expect("macOS set_clipboard_text 分支");
        assert!(mac.contains("pbcopy"), "macOS 须用 pbcopy: {mac}");
        let linux = src
            .split("#[cfg(all(unix, not(target_os = \"macos\")))]\nfn set_clipboard_text")
            .nth(1)
            .and_then(|s| s.split("\n}\n\n#[cfg(test)]").next())
            .expect("Linux set_clipboard_text 分支");
        assert!(linux.contains("xclip") && linux.contains("xsel") && linux.contains("wl-copy"), "Linux 尝试链须齐: {linux}");
        // 命令主体不得残留平台外的 powershell 直调（防回退到单一实现）。
        let cmd_seg = src.split("pub async fn copy_text").nth(1).and_then(|s| s.split("\n}").next()).unwrap_or("");
        assert!(!cmd_seg.contains("powershell"), "copy_text 主体须委托 set_clipboard_text: {cmd_seg}");
        // 经 stdin 传 base64（长文本/非 ASCII 的根治锚点）：不得回退到
        // 命令行内嵌原文（~32K 命令行上限 + 代码页乱码面）。
        assert!(seg.contains("FromBase64String"), "Windows 分支必须经 stdin base64 精确还原: {seg}");
        assert!(!seg.contains("-Value '{"), "不得再把原文拼进命令行: {seg}");
    }

    /// 心跳归属判定表（性能审计 2026-08）：None（旧垫片兼容）/ main →
    /// 主窗；float / pet / 未知 → 副窗——副窗心跳不得污染主窗计数
    /// （活的浮窗掩蔽死的主窗 = 假死恢复失效）。
    #[test]
    fn heartbeat_label_decision_table() {
        assert!(heartbeat_is_main(None), "无标签（旧垫片兼容）按主窗计");
        assert!(heartbeat_is_main(Some("main")), "main 标签按主窗计");
        assert!(!heartbeat_is_main(Some("float")), "浮窗心跳按副窗计");
        assert!(!heartbeat_is_main(Some("pet")), "宠物窗心跳按副窗计");
        assert!(!heartbeat_is_main(Some("weird")), "未知标签按副窗计（防污染主窗计数）");
    }

    /// 大文本剪贴板往返（Windows 实测；历史缺陷实证：命令行内嵌形态在
    /// ~32K 上限直接失败）。测试会短暂占用剪贴板（尽力保存/恢复）。
    #[cfg(windows)]
    #[test]
    fn clipboard_roundtrip_large_and_unicode_text() {
        use super::NoWindow;
        // 尽力保存现文本（失败照常测——剪贴板本就是易失资源）。
        let saved = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Get-Clipboard -Raw"])
            .creation_flags_no_window()
            .output()
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).into_owned());
        let text = format!("{}你好世界 {}", "a".repeat(80_000), "插件文案".repeat(1_000));
        set_clipboard_text(&text).expect("大文本（~90KB，超 32K 命令行上限）写入必须成功");
        let out = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Get-Clipboard -Raw"])
            .creation_flags_no_window()
            .output()
            .expect("读回");
        let got = String::from_utf8_lossy(&out.stdout).replace("\r\n", "\n");
        let want = text.replace("\r\n", "\n");
        assert_eq!(got.trim_end(), want.trim_end(), "大文本 + 非 ASCII 必须逐字节还原（base64 通道）");
        if let Some(prev) = saved {
            let _ = std::process::Command::new("powershell")
                .args(["-NoProfile", "-Command", "Set-Clipboard -Value $input"])
                .stdin(std::process::Stdio::piped())
                .creation_flags_no_window()
                .spawn()
                .and_then(|mut c| {
                    if let Some(mut stdin) = c.stdin.take() {
                        use std::io::Write;
                        let _ = stdin.write_all(prev.as_bytes());
                    }
                    c.wait()
                });
        }
    }
}
